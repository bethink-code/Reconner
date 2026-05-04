import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import { storage } from "./storage";
import { assertPeriodWrite } from "./routeAccess";
import {
  groupFuelByInvoice as groupFuelByInvoiceFromReconciliation,
  parseDateToDays as parseDateToDaysFromReconciliation,
  parseTimeToMinutes as parseTimeToMinutesFromReconciliation,
  scoreBankToInvoices as scoreBankToInvoicesFromReconciliation,
  type FuelInvoice as ReconciliationFuelInvoice,
} from "./reconciliation/matching";
import {
  insertMatchSchema,
  type User,
} from "../shared/schema";

export function registerReconciliationWriteRoutes(app: Express) {
  app.post("/api/periods/:periodId/auto-match", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;

      const rules = await storage.getMatchingRules(req.params.periodId);
      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);

      const periodStartDay = new Date(period.startDate + "T00:00:00").getTime();
      const periodEndDay = new Date(period.endDate + "T00:00:00").getTime();
      const dateBufferMs = rules.dateWindowDays * 86400000;

      const toDateOnly = (d: number) => {
        const dt = new Date(d);
        return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
      };

      const isDebtorTx = (t: typeof transactions[0]) =>
        t.paymentType?.toLowerCase().includes("debtor") ||
        t.paymentType?.toLowerCase().includes("account") ||
        t.paymentType?.toLowerCase().includes("fleet");

      const fuelTransactions = transactions.filter(t => {
        if (t.sourceType !== "fuel" || t.isCardTransaction !== "yes" || isDebtorTx(t) || t.matchStatus !== "unmatched") return false;
        if (!t.transactionDate) return false;
        const day = toDateOnly(new Date(t.transactionDate).getTime());
        return !isNaN(day) && day >= periodStartDay && day <= periodEndDay;
      });

      const bankTransactions = transactions.filter(t =>
        t.sourceType &&
        t.sourceType.startsWith("bank") &&
        t.matchStatus === "unmatched"
      );

      console.log(`[AUTO-MATCH] Period: ${period.name} (${period.startDate} to ${period.endDate}), Fuel txns: ${fuelTransactions.length}, Bank txns: ${bankTransactions.length}`);
      if (fuelTransactions.length > 0) {
        const fuelDateSet = new Set(fuelTransactions.map(t => t.transactionDate?.substring(0, 10)));
        console.log(`[AUTO-MATCH] Fuel dates: ${[...fuelDateSet].sort().join(", ")}`);
      }
      if (bankTransactions.length > 0) {
        const bankDateSet = new Set(bankTransactions.map(t => t.transactionDate?.substring(0, 10)));
        console.log(`[AUTO-MATCH] Bank dates: ${[...bankDateSet].sort().join(", ")}`);
      }

      let unmatchableBankTransactions: typeof bankTransactions = [];
      let dateRangeWarning = "";

      unmatchableBankTransactions = bankTransactions.filter(t => {
        if (!t.transactionDate) return false;
        const bankTime = new Date(t.transactionDate).getTime();
        if (isNaN(bankTime)) return false;
        const bankDay = toDateOnly(bankTime);
        return bankDay > periodEndDay + dateBufferMs || bankDay < periodStartDay - 86400000;
      });

      if (unmatchableBankTransactions.length > 0) {
        dateRangeWarning = `${unmatchableBankTransactions.length} bank transaction(s) are outside the period date range (${period.startDate} to ${period.endDate}) + ${rules.dateWindowDays}-day window and cannot be matched.`;
        await storage.updateTransactionsBatch(
          unmatchableBankTransactions.map(tx => ({ id: tx.id, data: { matchStatus: "unmatchable", matchId: null } }))
        );
      }

      const matchableBankTransactions = bankTransactions.filter(
        t => !unmatchableBankTransactions.includes(t)
      );

      const fuelInvoices = groupFuelByInvoiceFromReconciliation(fuelTransactions, rules.groupByInvoice);

      const invoicesByDate = new Map<number, ReconciliationFuelInvoice<any>[]>();
      for (const invoice of fuelInvoices) {
        const dayKey = parseDateToDaysFromReconciliation(invoice.firstDate || "");
        if (dayKey !== null) {
          for (let offset = -1; offset <= rules.dateWindowDays; offset++) {
            const key = dayKey + offset;
            if (!invoicesByDate.has(key)) invoicesByDate.set(key, []);
            invoicesByDate.get(key)!.push(invoice);
          }
        }
      }

      let matchCount = 0;
      const skippedNonCardCount = transactions.filter(t => {
        if (t.sourceType !== "fuel" || t.isCardTransaction === "yes") return false;
        if (!t.transactionDate) return false;
        const day = toDateOnly(new Date(t.transactionDate).getTime());
        return !isNaN(day) && day >= periodStartDay && day <= periodEndDay;
      }).length;

      const matchedInvoices = new Set<string>();
      const pendingMatches: Array<{
        matchData: { periodId: string; fuelTransactionId: string; bankTransactionId: string; matchType: string; matchConfidence: string };
        bankTxId: string;
        fuelItemIds: string[];
      }> = [];

      for (const bankTx of matchableBankTransactions) {
        let bestMatch: {
          invoice: ReconciliationFuelInvoice<any>;
          confidence: number;
          timeDiff: number;
          dateDiff: number;
          amountDiff: number;
          reasons: string[];
        } | null = null;

        const bankDayKey = parseDateToDaysFromReconciliation(bankTx.transactionDate || "");
        const candidateInvoices = bankDayKey !== null ? (invoicesByDate.get(bankDayKey) || []) : fuelInvoices;
        const seen = new Set<string>();

        for (const invoice of candidateInvoices) {
          if (seen.has(invoice.invoiceNumber)) continue;
          seen.add(invoice.invoiceNumber);
          if (matchedInvoices.has(invoice.invoiceNumber)) continue;
          if (invoice.items.some(item => item.matchStatus === "matched")) continue;

          const reasons: string[] = [];
          const bankAmount = parseFloat(bankTx.amount);
          const fuelAmount = invoice.totalAmount;
          const amountDiff = Math.abs(bankAmount - fuelAmount);

          if (amountDiff > rules.amountTolerance) continue;

          if (amountDiff === 0) {
            reasons.push("Exact amount match");
          } else {
            reasons.push(`Amount within R${amountDiff.toFixed(2)} (tolerance: R${rules.amountTolerance})`);
          }

          const fuelDate = parseDateToDaysFromReconciliation(invoice.firstDate || "");
          const bankDate = parseDateToDaysFromReconciliation(bankTx.transactionDate || "");

          if (fuelDate === null || bankDate === null) continue;

          const dateDiff = bankDate - fuelDate;
          if (dateDiff < 0 || dateDiff > rules.dateWindowDays) continue;

          const fuelTime = parseTimeToMinutesFromReconciliation(invoice.firstTime || "");
          const bankTime = parseTimeToMinutesFromReconciliation(bankTx.transactionTime || "");

          if (dateDiff === 0 && fuelTime !== null && bankTime !== null && bankTime < fuelTime) continue;

          let confidence = 70;
          if (dateDiff === 0) {
            confidence = 85;
            reasons.push("Same day transaction");
          } else if (Math.abs(dateDiff) === 1) {
            confidence = 75;
            reasons.push("1 day difference");
          } else if (Math.abs(dateDiff) === 2) {
            confidence = 68;
            reasons.push("2 days difference");
          } else {
            confidence = 65;
            reasons.push(`${Math.abs(dateDiff)} days difference (weekend/holiday processing)`);
          }

          let timeDiff = 0;
          if (dateDiff === 0 && fuelTime !== null && bankTime !== null) {
            timeDiff = bankTime - fuelTime;

            if (timeDiff <= 5) {
              confidence = 100;
              reasons.push("Times within 5 minutes");
            } else if (timeDiff <= 15) {
              confidence = 95;
              reasons.push("Times within 15 minutes");
            } else if (timeDiff <= 30) {
              confidence = 85;
              reasons.push("Times within 30 minutes");
            } else if (timeDiff <= rules.timeWindowMinutes) {
              confidence = 75;
              reasons.push(`Times within ${timeDiff} minutes`);
            } else {
              confidence = 75;
              reasons.push(`Time difference: ${timeDiff} minutes`);
            }
          }

          if (amountDiff > 0) {
            const amountPenalty = Math.min(5, (amountDiff / rules.amountTolerance) * 5);
            confidence -= amountPenalty;
          }

          let cardMatch: "yes" | "no" | "unknown" = "unknown";
          if (rules.requireCardMatch) {
            if (!bankTx.cardNumber || !invoice.cardNumber) continue;
            if (bankTx.cardNumber !== invoice.cardNumber) continue;
            cardMatch = "yes";
            confidence += 25;
            reasons.push("Card numbers match (required)");
          } else if (bankTx.cardNumber && invoice.cardNumber) {
            if (bankTx.cardNumber === invoice.cardNumber) {
              cardMatch = "yes";
              confidence += 25;
              reasons.push("Card numbers match (strong)");
            } else {
              cardMatch = "no";
              confidence -= 30;
              reasons.push("Card numbers differ (penalty)");
            }
          }

          if (invoice.items.length > 1) {
            reasons.push(`Grouped invoice: ${invoice.items.length} items`);
          }

          confidence = Math.min(100, Math.max(0, confidence));
          if (confidence < rules.minimumConfidence) continue;

          const absDiff = Math.abs(dateDiff);
          const cardMatchScore = cardMatch === "yes" ? 2 : cardMatch === "unknown" ? 1 : 0;
          const bestCardScore = bestMatch ?
            (bestMatch.reasons.some(r => r.includes("Card numbers match")) ? 2 :
             bestMatch.reasons.some(r => r.includes("Card numbers differ")) ? 0 : 1) : -1;

          if (!bestMatch ||
              confidence > bestMatch.confidence ||
              (confidence === bestMatch.confidence && cardMatchScore > bestCardScore) ||
              (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff < bestMatch.dateDiff) ||
              (confidence === bestMatch.confidence && cardMatchScore === bestCardScore && absDiff === bestMatch.dateDiff && timeDiff < bestMatch.timeDiff)) {
            bestMatch = { invoice, confidence, timeDiff, dateDiff: absDiff, amountDiff, reasons };
          }
        }

        if (bestMatch) {
          const isExact = Math.abs(bestMatch.amountDiff) < 0.005;
          const aboveThreshold = bestMatch.confidence >= rules.autoMatchThreshold;
          const matchType = isExact && aboveThreshold ? "auto_exact"
            : isExact ? "auto_exact_review"
            : aboveThreshold ? "auto_rules"
            : "auto_rules_review";

          pendingMatches.push({
            matchData: {
              periodId: req.params.periodId,
              fuelTransactionId: bestMatch.invoice.items[0].id,
              bankTransactionId: bankTx.id,
              matchType,
              matchConfidence: String(bestMatch.confidence),
            },
            bankTxId: bankTx.id,
            fuelItemIds: bestMatch.invoice.items.map(item => item.id),
          });

          matchedInvoices.add(bestMatch.invoice.invoiceNumber);
          matchCount++;
        }
      }

      const matchedBankIds = new Set(pendingMatches.map(pm => pm.bankTxId));
      const unmatchedInPeriodBank = matchableBankTransactions.filter(bt => {
        if (matchedBankIds.has(bt.id)) return false;
        if (!bt.transactionDate) return false;
        const day = toDateOnly(new Date(bt.transactionDate).getTime());
        return !isNaN(day) && day >= periodStartDay && day <= periodEndDay;
      });

      const outOfPeriodCardFuel = transactions.filter(t => {
        if (t.sourceType !== "fuel" || t.isCardTransaction !== "yes" || isDebtorTx(t)) return false;
        if (t.matchStatus === "matched" || t.matchStatus === "excluded") return false;
        if (!t.transactionDate) return false;
        const day = toDateOnly(new Date(t.transactionDate).getTime());
        if (isNaN(day)) return false;
        return day < periodStartDay || day > periodEndDay;
      });

      const outOfPeriodInvoices = groupFuelByInvoiceFromReconciliation(outOfPeriodCardFuel, rules.groupByInvoice);
      const outOfPeriodByDate = new Map<number, ReconciliationFuelInvoice<any>[]>();
      for (const invoice of outOfPeriodInvoices) {
        const dayKey = parseDateToDaysFromReconciliation(invoice.firstDate || "");
        if (dayKey !== null) {
          for (let offset = -1; offset <= rules.dateWindowDays; offset++) {
            const key = dayKey + offset;
            if (!outOfPeriodByDate.has(key)) outOfPeriodByDate.set(key, []);
            outOfPeriodByDate.get(key)!.push(invoice);
          }
        }
      }

      const lagUsedInvoices = new Set<string>();
      const lagExplainedBankIds: string[] = [];
      for (const bankTx of unmatchedInPeriodBank) {
        const bankDayKey = parseDateToDaysFromReconciliation(bankTx.transactionDate || "");
        const candidates = bankDayKey !== null ? (outOfPeriodByDate.get(bankDayKey) || []) : outOfPeriodInvoices;
        const bestMatch = scoreBankToInvoicesFromReconciliation(bankTx, candidates, lagUsedInvoices, rules);
        if (bestMatch) {
          lagExplainedBankIds.push(bankTx.id);
          lagUsedInvoices.add(bestMatch.invoice.invoiceNumber);
        }
      }
      console.log(`[AUTO-MATCH] Lag-explained bank: ${lagExplainedBankIds.length} of ${unmatchedInPeriodBank.length} in-period unmatched`);

      console.log(`[MATCH] Applying ${pendingMatches.length} matches with transactional state updates...`);
      await storage.applyAutoMatchResults(
        req.params.periodId,
        pendingMatches,
        lagExplainedBankIds,
        unmatchableBankTransactions.map(tx => tx.id),
      );

      const matchableCount = matchableBankTransactions.length;
      const matchRate = matchableCount > 0
        ? ((matchCount / matchableCount) * 100).toFixed(1)
        : "0";

      audit(req, { action: "reconciliation.run", resourceType: "period", resourceId: req.params.periodId, detail: `${matchCount} matches created` });

      res.json({
        success: true,
        matchesCreated: matchCount,
        cardTransactionsProcessed: fuelTransactions.length,
        invoicesCreated: fuelInvoices.length,
        bankTransactionsTotal: bankTransactions.length,
        bankTransactionsMatchable: matchableCount,
        bankTransactionsUnmatchable: unmatchableBankTransactions.length,
        bankTransactionsLagExplained: lagExplainedBankIds.length,
        nonCardTransactionsSkipped: skippedNonCardCount,
        matchRate: `${matchRate}%`,
        rulesUsed: rules,
        warnings: dateRangeWarning ? [dateRangeWarning] : []
      });
    } catch (error) {
      console.error("Error auto-matching:", error);
      res.status(500).json({ error: "Failed to auto-match transactions" });
    }
  });

  app.post("/api/matches/manual", isAuthenticated, async (req: any, res) => {
    try {
      const matchInput = insertMatchSchema.omit({ matchType: true, matchConfidence: true }).parse(req.body);

      const period = await assertPeriodWrite(matchInput.periodId, req, res);
      if (!period) return;

      const match = await storage.createMatchBundle({
        ...matchInput,
        matchType: "user_confirmed",
        matchConfidence: "100",
      });

      audit(req, { action: "match.manual", resourceType: "match", resourceId: match.id, detail: `Fuel ${matchInput.fuelTransactionId.slice(0, 8)}... -> Bank ${matchInput.bankTransactionId.slice(0, 8)}...` });
      res.json({ success: true, match });
    } catch (error) {
      console.error("Error creating manual match:", error);
      res.status(400).json({ error: "Failed to create manual match" });
    }
  });

  app.delete("/api/matches/:matchId", isAuthenticated, async (req: any, res) => {
    try {
      const match = await storage.getMatch(req.params.matchId);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }

      const period = await assertPeriodWrite(match.periodId, req, res);
      if (!period) return;

      await storage.deleteMatchBundle(req.params.matchId, match.fuelTransactionId, match.bankTransactionId);
      audit(req, { action: "match.delete", resourceType: "match", resourceId: req.params.matchId });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting match:", error);
      res.status(500).json({ error: "Failed to delete match" });
    }
  });

  app.post("/api/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const { transactionId, periodId, resolutionType, reason, notes, linkedTransactionId, assignee } = req.body;

      if (!transactionId || !periodId || !resolutionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const period = await assertPeriodWrite(periodId, req, res);
      if (!period) return;

      const resolution = await storage.createResolution({
        transactionId,
        periodId,
        resolutionType,
        reason: reason || null,
        notes: notes || null,
        userId: user?.id || null,
        userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
        userEmail: user?.email || null,
        linkedTransactionId: linkedTransactionId || null,
        assignee: assignee || null,
      });

      if (resolutionType !== "linked") {
        await storage.updateTransaction(transactionId, {
          matchStatus: "resolved"
        });
      }

      audit(req, { action: `resolution.${resolutionType}`, resourceType: "transaction", resourceId: transactionId, detail: reason || notes || undefined });
      res.json({ success: true, resolution });
    } catch (error) {
      console.error("Error creating resolution:", error);
      res.status(500).json({ error: "Failed to create resolution" });
    }
  });

  app.post("/api/resolutions/bulk-dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const { transactionIds, periodId } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const period = await assertPeriodWrite(periodId, req, res);
      if (!period) return;

      const resolutions = [];
      for (const transactionId of transactionIds) {
        const resolution = await storage.createResolution({
          transactionId,
          periodId,
          resolutionType: "dismissed",
          reason: "test_transaction",
          notes: "Bulk dismissed as low-value transaction",
          userId: user?.id || null,
          userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
          userEmail: user?.email || null,
          linkedTransactionId: null,
          assignee: null,
        });
        resolutions.push(resolution);

        await storage.updateTransaction(transactionId, {
          matchStatus: "resolved"
        });
      }

      audit(req, { action: "resolution.bulk_dismiss", resourceType: "period", resourceId: periodId, detail: `${resolutions.length} transactions dismissed` });
      res.json({ success: true, count: resolutions.length });
    } catch (error) {
      console.error("Error bulk dismissing:", error);
      res.status(500).json({ error: "Failed to bulk dismiss transactions" });
    }
  });

  app.post("/api/resolutions/bulk-flag", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const { transactionIds, periodId } = req.body;

      if (!transactionIds || !Array.isArray(transactionIds) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const period = await assertPeriodWrite(periodId, req, res);
      if (!period) return;

      const resolutions = [];
      for (const transactionId of transactionIds) {
        const resolution = await storage.createResolution({
          transactionId,
          periodId,
          resolutionType: "flagged",
          reason: null,
          notes: "Flagged for manager review",
          userId: user?.id || null,
          userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
          userEmail: user?.email || null,
          linkedTransactionId: null,
          assignee: null,
        });
        resolutions.push(resolution);

        await storage.updateTransaction(transactionId, {
          matchStatus: "resolved"
        });
      }

      audit(req, { action: "resolution.bulk_flag", resourceType: "period", resourceId: periodId, detail: `${resolutions.length} transactions flagged` });
      res.json({ success: true, count: resolutions.length });
    } catch (error) {
      console.error("Error bulk flagging:", error);
      res.status(500).json({ error: "Failed to bulk flag transactions" });
    }
  });

  app.delete("/api/resolutions/:transactionId", isAuthenticated, async (req: any, res) => {
    try {
      const tx = await storage.getTransaction(req.params.transactionId);
      if (!tx) return res.status(404).json({ error: "Transaction not found" });
      const period = await assertPeriodWrite(tx.periodId, req, res);
      if (!period) return;
      const count = await storage.deleteResolutionByTransaction(req.params.transactionId);
      if (count === 0) return res.status(404).json({ error: "No resolution found" });
      res.json({ success: true, count });
    } catch (error) {
      console.error("Error deleting resolution:", error);
      res.status(500).json({ error: "Failed to delete resolution" });
    }
  });

  app.delete("/api/periods/:periodId/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;
      const count = await storage.clearResolutionsByPeriod(req.params.periodId);
      res.json({ success: true, count });
    } catch (error) {
      console.error("Error clearing resolutions:", error);
      res.status(500).json({ error: "Failed to clear resolutions" });
    }
  });

  app.post("/api/matches/bulk-confirm", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const { matches, periodId } = req.body;

      if (!matches || !Array.isArray(matches) || !periodId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const period = await assertPeriodWrite(periodId, req, res);
      if (!period) return;

      const createdMatches = [];
      for (const { bankId, fuelId } of matches) {
        try {
          const match = await storage.createMatchBundle({
            periodId,
            bankTransactionId: bankId,
            fuelTransactionId: fuelId,
            matchType: "user_confirmed",
            matchConfidence: "100",
          }, {
            transactionId: bankId,
            periodId,
            resolutionType: "linked",
            reason: null,
            notes: "Bulk confirmed as quick win match",
            userId: user?.id || null,
            userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
            userEmail: user?.email || null,
            linkedTransactionId: fuelId,
            assignee: null,
          });
          createdMatches.push(match);
        } catch (matchError) {
          console.error(`Error creating match for bank ${bankId}:`, matchError);
        }
      }

      audit(req, { action: "match.bulk_confirm", resourceType: "period", resourceId: periodId, detail: `${createdMatches.length} matches confirmed` });
      res.json({ success: true, count: createdMatches.length });
    } catch (error) {
      console.error("Error bulk confirming:", error);
      res.status(500).json({ error: "Failed to bulk confirm matches" });
    }
  });
}

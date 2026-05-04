import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import {
  computeDeclineAnalysis as computeDeclineAnalysisFromInsights,
  findNearestFuelForDecline as findNearestFuelForDeclineFromInsights,
} from "./insights/declineInsights";
import { assertPeriodOwner } from "./routeAccess";
import { storage } from "./storage";

export function registerExportRoutes(app: Express) {
  app.get("/api/periods/:periodId/export", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const [allTransactions, matchesData, resolutions, attendantSummary, matchingRulesData, periodSummary] = await Promise.all([
        storage.getTransactionsByPeriod(req.params.periodId),
        storage.getMatchesByPeriod(req.params.periodId),
        storage.getResolutionsByPeriod(req.params.periodId),
        storage.getAttendantSummary(req.params.periodId),
        storage.getMatchingRules(req.params.periodId),
        storage.getPeriodSummary(req.params.periodId),
      ]);

      const transactions = allTransactions.filter((transaction) =>
        transaction.transactionDate &&
        transaction.transactionDate >= period.startDate &&
        transaction.transactionDate <= period.endDate,
      );

      const matchMap = new Map<string, typeof matchesData[0]>();
      for (const match of matchesData) {
        matchMap.set(match.bankTransactionId, match);
        matchMap.set(match.fuelTransactionId, match);
      }
      const resolutionMap = new Map(resolutions.map((resolution) => [resolution.transactionId, resolution]));
      const txMap = new Map(transactions.map((transaction) => [transaction.id, transaction]));

      const fuelByMatchId = new Map<string, typeof transactions>();
      for (const transaction of transactions) {
        if (transaction.matchId && transaction.sourceType === "fuel") {
          if (!fuelByMatchId.has(transaction.matchId)) {
            fuelByMatchId.set(transaction.matchId, []);
          }
          fuelByMatchId.get(transaction.matchId)!.push(transaction);
        }
      }

      const bankTxns = transactions.filter((transaction) => transaction.sourceType?.startsWith("bank"));
      const fuelTxns = transactions.filter((transaction) => transaction.sourceType === "fuel");
      const matchedBank = bankTxns.filter((transaction) => transaction.matchStatus === "matched");
      const unmatchedBank = bankTxns.filter((transaction) => transaction.matchStatus === "unmatched" && parseFloat(transaction.amount) > 0);
      const excludedBank = bankTxns.filter((transaction) => transaction.matchStatus === "excluded");
      const outsideRange = bankTxns.filter((transaction) => transaction.matchStatus === "unmatchable");
      const matchableBank = bankTxns.filter((transaction) => transaction.matchStatus === "matched" || transaction.matchStatus === "unmatched");

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const isDebtor = (transaction: typeof fuelTxns[0]) =>
        transaction.paymentType?.toLowerCase().includes("debtor") ||
        transaction.paymentType?.toLowerCase().includes("account") ||
        transaction.paymentType?.toLowerCase().includes("fleet");
      const debtorFuel = fuelTxns.filter((transaction) => isDebtor(transaction));
      const cardOnlyFuel = fuelTxns.filter((transaction) => transaction.isCardTransaction === "yes" && !isDebtor(transaction));
      const cashFuel = fuelTxns.filter((transaction) => transaction.isCardTransaction === "no" && !isDebtor(transaction));

      const sumAmount = (rows: typeof fuelTxns) => rows.reduce((sum, row) => sum + parseFloat(row.amount), 0);

      const cardOnlyAmount = sumAmount(cardOnlyFuel);
      const debtorAmount = sumAmount(debtorFuel);
      const cashAmount = sumAmount(cashFuel);
      const totalFuelAmount = sumAmount(fuelTxns);
      const matchedBankAmount = sumAmount(matchedBank);
      const unmatchedBankAmount = sumAmount(unmatchedBank);
      const excludedBankAmount = sumAmount(excludedBank);

      const matchedFuelAmount = matchesData.reduce((sum, match) => {
        const allFuelItems = fuelByMatchId.get(match.id) || [];
        if (allFuelItems.length > 0) {
          return sum + allFuelItems.reduce((fuelSum, fuel) => fuelSum + parseFloat(fuel.amount), 0);
        }
        const fuel = txMap.get(match.fuelTransactionId);
        return sum + (fuel ? parseFloat(fuel.amount) : 0);
      }, 0);

      const cardOnlyFuelAmount = cardOnlyAmount;
      const lagExplainedBankAmount = periodSummary.lagExplainedBankAmount || 0;
      const bankApprovedAmount = matchedBankAmount + unmatchedBankAmount + lagExplainedBankAmount;
      const fileSurplus = bankApprovedAmount - cardOnlyFuelAmount;
      const matchedFuelInPeriod = periodSummary.matchedFuelAmountInPeriod ?? matchedFuelAmount;
      const lagFuelAmount = periodSummary.lagFuelAmount ?? 0;
      const unmatchedFuelCoveredAmount = periodSummary.unmatchedFuelCoveredAmount ?? 0;
      const unmatchedFuelUncoveredAmount = periodSummary.unmatchedFuelUncoveredAmount ?? 0;
      const matchedVariance = matchedBankAmount - matchedFuelInPeriod;
      const tenantBankCoverage = periodSummary.tenantBankCoverage;
      const unmatchedFuelCard = fuelTxns.filter((transaction) =>
        transaction.isCardTransaction === "yes" &&
        !isDebtor(transaction) &&
        transaction.matchStatus !== "matched" &&
        parseFloat(transaction.amount) > 0,
      );
      const unmatchedFuelCardAmount = sumAmount(unmatchedFuelCard);
      const outsideRangeAmount = sumAmount(outsideRange);
      const cardFuelMatchedCount = periodSummary.scopedMatchedCount;
      const cardFuelTotalCount = periodSummary.cardFuelTransactions;
      const cardFuelUnmatchedCount = periodSummary.unmatchedCardTransactions;
      const matchRate = cardFuelTotalCount > 0
        ? Math.round((cardFuelMatchedCount / cardFuelTotalCount) * 100)
        : 0;

      const bankBySource = new Map<string, { approved: typeof bankTxns; declined: typeof bankTxns; cancelled: typeof bankTxns }>();
      for (const transaction of bankTxns) {
        const name = transaction.sourceName || "Bank";
        if (!bankBySource.has(name)) {
          bankBySource.set(name, { approved: [], declined: [], cancelled: [] });
        }
        const entry = bankBySource.get(name)!;
        if (transaction.matchStatus === "excluded") {
          const desc = (transaction.description || "").toLowerCase();
          if (desc.includes("declined")) entry.declined.push(transaction);
          else entry.cancelled.push(transaction);
        } else {
          entry.approved.push(transaction);
        }
      }

      const fmt = (value: number) => parseFloat(value.toFixed(2));
      const fmtPeriodDate = (value: string) =>
        new Date(value).toLocaleDateString("en-ZA", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      const periodDatesStr = period.startDate === period.endDate
        ? fmtPeriodDate(period.startDate)
        : `${fmtPeriodDate(period.startDate)} - ${fmtPeriodDate(period.endDate)}`;

      const summaryRows: { Metric: string; Count?: number | string; Amount?: number | string }[] = [
        { Metric: "Period", Count: "", Amount: period.name },
        { Metric: "Period dates", Count: "", Amount: periodDatesStr },
        { Metric: "" },
        { Metric: "FUEL TRANSACTIONS", Count: "Count", Amount: "Amount" },
        { Metric: "  Card", Count: cardOnlyFuel.length, Amount: fmt(cardOnlyAmount) },
      ];
      if (debtorFuel.length > 0) {
        summaryRows.push({ Metric: "  Debtor / Account", Count: debtorFuel.length, Amount: fmt(debtorAmount) });
      }
      summaryRows.push(
        { Metric: "  Cash", Count: cashFuel.length, Amount: fmt(cashAmount) },
        { Metric: "  Total", Count: fuelTxns.length, Amount: fmt(totalFuelAmount) },
        { Metric: "" },
        { Metric: "BANK TRANSACTIONS" },
        { Metric: "  Total bank transactions", Count: bankTxns.length },
        { Metric: "  Matchable bank transactions", Count: matchableBank.length },
        { Metric: "  Outside date range", Count: outsideRange.length, Amount: outsideRangeAmount > 0 ? fmt(outsideRangeAmount) : undefined },
        { Metric: "  Excluded (reversed/declined/cancelled)", Count: excludedBank.length },
      );

      if (bankBySource.size > 0) {
        summaryRows.push({ Metric: "" });
        const bankNames = Array.from(bankBySource.keys()).sort();
        const headerRow: Record<string, string> = { Metric: "" };
        for (const name of bankNames) headerRow[name] = name;
        headerRow.Total = "Total";
        summaryRows.push(headerRow as any);

        for (const { label, getter } of [
          { label: "Declined", getter: (entry: { declined: typeof bankTxns; cancelled: typeof bankTxns; approved: typeof bankTxns }) => entry.declined },
          { label: "Cancelled", getter: (entry: { declined: typeof bankTxns; cancelled: typeof bankTxns; approved: typeof bankTxns }) => entry.cancelled },
          { label: "Approved", getter: (entry: { declined: typeof bankTxns; cancelled: typeof bankTxns; approved: typeof bankTxns }) => entry.approved },
        ]) {
          const countRow: Record<string, any> = { Metric: `Number of ${label} transactions` };
          let totalCount = 0;
          for (const name of bankNames) {
            const count = getter(bankBySource.get(name)!).length;
            countRow[name] = count;
            totalCount += count;
          }
          countRow.Total = totalCount;
          summaryRows.push(countRow as any);

          const amountRow: Record<string, any> = { Metric: `Total amount for ${label} transactions` };
          let totalAmount = 0;
          for (const name of bankNames) {
            const amount = sumAmount(getter(bankBySource.get(name)!));
            amountRow[name] = amount > 0 ? fmt(amount) : "-";
            totalAmount += amount;
          }
          amountRow.Total = totalAmount > 0 ? fmt(totalAmount) : "-";
          summaryRows.push(amountRow as any);
        }
      }

      const linkedResolutions = resolutions.filter((resolution) => resolution.resolutionType === "linked").length;
      const flaggedResolutions = resolutions.filter((resolution) => resolution.resolutionType === "flagged").length;
      const dismissedResolutions = resolutions.filter((resolution) => resolution.resolutionType === "dismissed").length;
      const totalReviewActions = linkedResolutions + flaggedResolutions + dismissedResolutions;

      const cardMatchRateLabel = cardFuelTotalCount > 0
        ? `${matchRate}% (${cardFuelMatchedCount}/${cardFuelTotalCount})`
        : "-";
      const bankMatchRatePct = matchableBank.length > 0
        ? Math.round((matchedBank.length / matchableBank.length) * 100)
        : 0;
      const bankMatchRateLabel = matchableBank.length > 0
        ? `${bankMatchRatePct}% (${matchedBank.length}/${matchableBank.length})`
        : "-";

      summaryRows.push(
        { Metric: "" },
        { Metric: "FUEL CARD SALES MATCHING" },
        { Metric: "  Fuel card sales match rate", Count: cardMatchRateLabel },
        { Metric: "  Matched fuel card sales transactions", Count: cardFuelMatchedCount },
        { Metric: "  Unmatched fuel card sales transactions", Count: cardFuelUnmatchedCount },
        { Metric: "" },
        { Metric: "BANK PAYMENT MATCHING" },
        { Metric: "  Bank payment match rate", Count: bankMatchRateLabel },
        { Metric: "  Matched bank transactions", Count: matchedBank.length },
        { Metric: "  Unmatched bank transactions", Count: unmatchedBank.length },
      );

      if (matchingRulesData) {
        summaryRows.push(
          { Metric: "" },
          { Metric: "MATCHING RULES" },
          { Metric: "  Amount tolerance", Count: `+/-R ${Number(matchingRulesData.amountTolerance).toFixed(2)}` },
          { Metric: "  Date window", Count: `${matchingRulesData.dateWindowDays} day${matchingRulesData.dateWindowDays !== 1 ? "s" : ""}` },
          { Metric: "  Time window", Count: `${matchingRulesData.timeWindowMinutes} min` },
          { Metric: "  Minimum confidence", Count: `${matchingRulesData.minimumConfidence}%` },
          { Metric: "  Auto-match threshold", Count: `${matchingRulesData.autoMatchThreshold}%` },
          { Metric: "  Invoice grouping", Count: matchingRulesData.groupByInvoice ? "On" : "Off" },
          { Metric: "  Card required", Count: matchingRulesData.requireCardMatch ? "Yes" : "No" },
        );
      }

      summaryRows.push(
        { Metric: "" },
        { Metric: "REVIEW PROGRESS" },
        { Metric: "  Matched with reason", Count: linkedResolutions },
        { Metric: "  Flagged to investigate", Count: flaggedResolutions },
        { Metric: "  Dismissed", Count: dismissedResolutions },
        { Metric: "  Total review actions", Count: totalReviewActions },
        { Metric: "  Unmatched bank still to review", Count: unmatchedBank.filter((transaction) => !resolutionMap.has(transaction.id)).length },
        { Metric: "  Unmatched fuel card sales still to review", Count: unmatchedFuelCard.filter((transaction) => !resolutionMap.has(transaction.id)).length },
      );

      const analysisTotal = fmt(
        matchedVariance -
          lagFuelAmount -
          unmatchedFuelCoveredAmount -
          unmatchedFuelUncoveredAmount +
          unmatchedBankAmount +
          lagExplainedBankAmount,
      );

      summaryRows.push(
        { Metric: "" },
        { Metric: "FUEL CARD SALES RECONCILIATION", Count: "", Amount: "Amount" },
        { Metric: "  Bank approved amount", Amount: fmt(bankApprovedAmount) },
        { Metric: "  Fuel card sales amount", Amount: fmt(cardOnlyFuelAmount) },
        { Metric: "  Surplus / shortfall", Amount: fmt(fileSurplus) },
        { Metric: "" },
        { Metric: "SURPLUS / SHORTFALL ANALYSIS" },
        { Metric: "" },
        { Metric: "  Matched amount variance:" },
        { Metric: "    Matched fuel amount (both sides in period)", Amount: fmt(matchedFuelInPeriod) },
        { Metric: "    Matched bank amount", Amount: fmt(matchedBankAmount) },
        { Metric: "    Variance", Amount: fmt(matchedVariance) },
        { Metric: "" },
        { Metric: "  Fuel matched to bank outside period", Amount: lagFuelAmount > 0 ? fmt(lagFuelAmount) : "-" },
        { Metric: "" },
        { Metric: "  Fuel card sales with no bank match, within bank coverage", Amount: unmatchedFuelCoveredAmount > 0 ? fmt(unmatchedFuelCoveredAmount) : "-" },
        { Metric: "" },
        { Metric: "  Fuel card sales with no bank match, outside bank coverage", Amount: unmatchedFuelUncoveredAmount > 0 ? fmt(unmatchedFuelUncoveredAmount) : "-" },
        tenantBankCoverage
          ? { Metric: `    Bank coverage: ${tenantBankCoverage.min} to ${tenantBankCoverage.max}` }
          : { Metric: "    No bank data uploaded for this property" },
        { Metric: "" },
        { Metric: "  Bank with no fuel match", Amount: unmatchedBankAmount > 0 ? fmt(unmatchedBankAmount) : "-" },
        { Metric: "" },
        { Metric: "  Bank matched to fuel outside period (lag-explained)", Amount: lagExplainedBankAmount > 0 ? fmt(lagExplainedBankAmount) : "-" },
        { Metric: "" },
        { Metric: "  Total surplus / shortfall", Amount: analysisTotal },
        { Metric: "" },
        { Metric: "  Excluded bank amount", Amount: fmt(excludedBankAmount) },
      );
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");

      const matchTypeLabel = (matchType: string) =>
        matchType === "auto_exact" || matchType === "auto_exact_review"
          ? "Lekana (Exact)"
          : matchType === "auto_rules" || matchType === "auto_rules_review" || matchType === "auto" || matchType === "auto_review"
            ? "Lekana (Rules)"
            : matchType === "user_confirmed" || matchType === "manual"
              ? "User (Confirmed)"
              : matchType === "linked"
                ? "User (With reason)"
                : matchType || "Lekana (Rules)";

      const matchedRows = matchesData.map((match) => {
        const bank = txMap.get(match.bankTransactionId);
        const fuel = txMap.get(match.fuelTransactionId);
        const allFuelItems = fuelByMatchId.get(match.id) || [];
        const bankAmt = bank ? parseFloat(bank.amount) : 0;
        const fuelAmt = allFuelItems.length > 0
          ? allFuelItems.reduce((sum, fuelItem) => sum + parseFloat(fuelItem.amount), 0)
          : (fuel ? parseFloat(fuel.amount) : 0);
        return {
          Date: bank?.transactionDate || fuel?.transactionDate || "",
          "Bank Time": bank?.transactionTime || "",
          "Fuel Time": fuel?.transactionTime || "",
          "Bank Amount": bankAmt,
          "Fuel Amount": fuelAmt,
          "Fuel Items": allFuelItems.length > 1 ? allFuelItems.length : 1,
          Difference: Math.round((bankAmt - fuelAmt) * 100) / 100,
          "Bank Source": bank?.sourceName || "",
          "Bank Description": bank?.description || "",
          "Fuel Description": allFuelItems.length > 1
            ? allFuelItems.map((fuelItem) => `${fuelItem.description || ""} (${parseFloat(fuelItem.amount).toFixed(2)})`).join("; ")
            : (fuel?.description || ""),
          "Card Number": bank?.cardNumber || "",
          "Payment Type": fuel?.paymentType || "",
          Attendant: fuel?.attendant || "",
          Cashier: fuel?.cashier || "",
          Pump: fuel?.pump || "",
          Confidence: match.matchConfidence ? `${match.matchConfidence}%` : "",
          "Match Type": matchTypeLabel(match.matchType),
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matchedRows), "Matched");

      const unmatchedRows = unmatchedBank.map((transaction) => {
        const resolution = resolutionMap.get(transaction.id);
        const fuel = findNearestFuelForDeclineFromInsights(transaction, fuelTxns);
        return {
          Date: transaction.transactionDate,
          Time: transaction.transactionTime || "",
          Amount: parseFloat(transaction.amount),
          Bank: transaction.sourceName || transaction.sourceType,
          "Card Number": transaction.cardNumber || "",
          Description: transaction.description || "",
          Attendant: fuel?.attendant || "",
          Cashier: fuel?.cashier || "",
          Resolution: resolution ? resolution.resolutionType : "unresolved",
          Reason: resolution?.reason || "",
          Notes: resolution?.notes || "",
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedRows), "Unmatched bank");

      if (outsideRange.length > 0) {
        const outsideRows = outsideRange.map((transaction) => ({
          Date: transaction.transactionDate,
          Time: transaction.transactionTime || "",
          Amount: parseFloat(transaction.amount),
          Bank: transaction.sourceName || transaction.sourceType,
          "Card Number": transaction.cardNumber || "",
          Description: transaction.description || "",
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(outsideRows), "Outside date range");
      }

      const fuelRows = fuelTxns.map((transaction) => {
        const match = matchMap.get(transaction.id);
        const bankTx = match ? txMap.get(match.bankTransactionId) : null;
        return {
          Date: transaction.transactionDate,
          Time: transaction.transactionTime || "",
          Amount: parseFloat(transaction.amount),
          "Payment Type": transaction.paymentType || "",
          "Card Number": transaction.cardNumber || "",
          Attendant: transaction.attendant || "",
          Cashier: transaction.cashier || "",
          Pump: transaction.pump || "",
          Description: transaction.description || "",
          Matched: match ? "Yes" : "No",
          "Bank Match Amount": bankTx ? parseFloat(bankTx.amount) : "",
          "Bank Source": bankTx?.sourceName || "",
        };
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelRows), "Fuel Transactions");

      const unmatchedFuel = fuelTxns.filter((transaction) => transaction.isCardTransaction === "yes" && transaction.matchStatus !== "matched");
      if (unmatchedFuel.length > 0) {
        const unmatchedFuelRows: Record<string, any>[] = unmatchedFuel.map((transaction) => {
          const resolution = resolutionMap.get(transaction.id);
          return {
            Date: transaction.transactionDate,
            Time: transaction.transactionTime || "",
            Amount: parseFloat(transaction.amount),
            "Payment Type": transaction.paymentType || "",
            "Card Number": transaction.cardNumber || "",
            Reference: transaction.referenceNumber || "",
            Attendant: transaction.attendant || "",
            Cashier: transaction.cashier || "",
            Pump: transaction.pump || "",
            Description: transaction.description || "",
            Resolution: resolution ? resolution.resolutionType : "unresolved",
            Reason: resolution?.reason || "",
            Notes: resolution?.notes || "",
          };
        });

        const attendantTotals = new Map<string, { count: number; amount: number }>();
        for (const transaction of unmatchedFuel) {
          const name = transaction.attendant || "Unknown";
          const existing = attendantTotals.get(name) || { count: 0, amount: 0 };
          existing.count += 1;
          existing.amount += parseFloat(transaction.amount);
          attendantTotals.set(name, existing);
        }
        unmatchedFuelRows.push({});
        unmatchedFuelRows.push({ Attendant: "BY ATTENDANT" });
        for (const [name, stats] of Array.from(attendantTotals.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
          unmatchedFuelRows.push({ Attendant: `  ${name}`, Amount: fmt(stats.amount) });
        }
        unmatchedFuelRows.push({ Attendant: "Total unmatched fuel card sales", Amount: fmt(unmatchedFuelCardAmount) });

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unmatchedFuelRows), "Unmatched fuel");
      }

      const declineResult = computeDeclineAnalysisFromInsights(bankTxns, fuelTxns);
      if (declineResult.summary.totalDeclined > 0) {
        const declinedRows: Record<string, any>[] = [];
        const byBank = new Map<string, { count: number; amount: number }>();
        for (const transaction of declineResult.transactions) {
          const key = transaction.bank || "Unknown";
          const existing = byBank.get(key) || { count: 0, amount: 0 };
          existing.count += 1;
          existing.amount += transaction.amount;
          byBank.set(key, existing);
        }

        declinedRows.push({ Metric: "DECLINE SUMMARY", Count: "", Amount: "" });
        declinedRows.push({
          Metric: "  Total declined / cancelled",
          Count: declineResult.summary.totalDeclined,
          Amount: fmt(declineResult.summary.totalDeclinedAmount),
        });
        for (const [bankName, stats] of Array.from(byBank.entries()).sort((a, b) => b[1].count - a[1].count)) {
          declinedRows.push({
            Metric: `    ${bankName}`,
            Count: stats.count,
            Amount: fmt(stats.amount),
          });
        }
        declinedRows.push({
          Metric: "  Resubmitted successfully",
          Count: declineResult.summary.resubmittedCount,
          Amount: fmt(declineResult.summary.totalDeclinedAmount - declineResult.summary.netUnrecoveredAmount),
        });
        declinedRows.push({
          Metric: "  Net unrecovered",
          Count: declineResult.summary.unrecoveredCount,
          Amount: fmt(declineResult.summary.netUnrecoveredAmount),
        });
        declinedRows.push({});

        const txByCard = new Map<string, typeof declineResult.transactions>();
        for (const transaction of declineResult.transactions) {
          const key = transaction.cardNumber || transaction.id;
          if (!txByCard.has(key)) txByCard.set(key, []);
          txByCard.get(key)!.push(transaction);
        }
        const cardGroups = Array.from(txByCard.entries()).sort((a, b) => {
          const aUnrec = a[1].some((transaction) => !transaction.isRecovered);
          const bUnrec = b[1].some((transaction) => !transaction.isRecovered);
          if (aUnrec !== bUnrec) return aUnrec ? -1 : 1;
          return b[1].length - a[1].length;
        });

        const patternsByCard = new Map<string, string[]>();
        for (const suspicious of declineResult.suspicious) {
          if (!suspicious.cardNumber) continue;
          const existing = patternsByCard.get(suspicious.cardNumber) || [];
          if (!existing.includes(suspicious.pattern)) existing.push(suspicious.pattern);
          patternsByCard.set(suspicious.cardNumber, existing);
        }
        const isLateNight = (time: string) => {
          if (!time) return false;
          const hour = parseInt(time.split(":")[0]);
          return hour >= 22 || hour < 5;
        };

        declinedRows.push({ Metric: "TRANSACTION DETAIL BY CARD" });
        declinedRows.push({});

        for (const [card, transactionsByCard] of cardGroups) {
          const hasUnrecovered = transactionsByCard.some((transaction) => !transaction.isRecovered);
          const attendant = transactionsByCard.find((transaction) => transaction.attendant)?.attendant;
          const patterns = [...(patternsByCard.get(card) || [])];
          if (transactionsByCard.some((transaction) => isLateNight(transaction.time))) {
            patterns.push("Late-night decline");
          }

          const header = [
            `Card ${card}`,
            `${transactionsByCard[0].bank} · ${transactionsByCard.length} transaction${transactionsByCard.length !== 1 ? "s" : ""}`,
            attendant ? `Attendant: ${attendant}` : null,
            hasUnrecovered ? "Unrecovered" : "Recovered",
            ...patterns,
          ]
            .filter(Boolean)
            .join(" · ");
          declinedRows.push({ Metric: header });

          const sortedTxns = [...transactionsByCard].sort((a, b) => a.time.localeCompare(b.time));
          for (const transaction of sortedTxns) {
            const shortfall = transaction.amount - transaction.recoveredAmount;
            const isPartial = shortfall > 0.5 && transaction.recoveredAmount > 0;
            declinedRows.push({
              Metric: `  ${transaction.type} at ${transaction.time}`,
              Count: "",
              Amount: fmt(transaction.amount),
              Type: transaction.type,
            });
            if (transaction.note) {
              const outcomeLabel = isPartial
                ? `${transaction.note.split(" - shortfall")[0]} of R ${transaction.recoveredAmount.toFixed(2)}`
                : transaction.note;
              declinedRows.push({
                Metric: `    ${outcomeLabel}`,
                Count: "",
                Amount: isPartial ? fmt(shortfall) : transaction.recoveredAmount > 0 ? fmt(transaction.recoveredAmount) : "",
                Type: isPartial ? "Shortfall" : transaction.recoveredAmount > 0 ? "Recovered" : "",
              });
            }
          }
          declinedRows.push({});
        }

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(declinedRows), "Declined card transactions");
      }

      if (attendantSummary.length > 0) {
        const declinedBankTxns = bankTxns.filter((transaction) =>
          transaction.matchStatus === "excluded" &&
          (transaction.description || "").toLowerCase().includes("declined"),
        );
        const declinedByAttendant = new Map<string, { count: number; amount: number }>();
        for (const declined of declinedBankTxns) {
          const fuel = findNearestFuelForDeclineFromInsights(declined, fuelTxns);
          const attendantName = (fuel?.attendant && fuel.attendant.trim()) || "Unknown";
          const existing = declinedByAttendant.get(attendantName) || { count: 0, amount: 0 };
          existing.count += 1;
          existing.amount += parseFloat(declined.amount);
          declinedByAttendant.set(attendantName, existing);
        }
        for (const attendant of attendantSummary) {
          const override = declinedByAttendant.get(attendant.attendant) || { count: 0, amount: 0 };
          attendant.declinedCount = override.count;
          attendant.declinedAmount = override.amount;
        }

        const withVerified = attendantSummary
          .filter((attendant) => attendant.matchedCount > 0)
          .sort((a, b) => b.matchedBankAmount - a.matchedBankAmount);
        const unverified = attendantSummary.filter((attendant) => attendant.matchedCount === 0 && attendant.unmatchedCount > 0);

        const totalFuelCardSales = withVerified.reduce((sum, attendant) => sum + attendant.matchedAmount + attendant.unmatchedAmount, 0);
        const totalFuelCardSalesCount = withVerified.reduce((sum, attendant) => sum + attendant.matchedCount + attendant.unmatchedCount, 0);
        const totalMatchedFuelCardSales = withVerified.reduce((sum, attendant) => sum + attendant.matchedAmount, 0);
        const totalMatchedFuelCardSalesCount = withVerified.reduce((sum, attendant) => sum + attendant.matchedCount, 0);
        const totalMatchedBankAmount = withVerified.reduce((sum, attendant) => sum + attendant.matchedBankAmount, 0);
        const totalUnmatchedCardCount = attendantSummary.reduce((sum, attendant) => sum + attendant.unmatchedCount, 0);
        const totalUnmatchedCardAmount = attendantSummary.reduce((sum, attendant) => sum + attendant.unmatchedAmount, 0);
        const totalCalibrationError = totalMatchedFuelCardSales - totalMatchedBankAmount;
        const totalShortfallToAttendants = totalUnmatchedCardAmount + totalCalibrationError;
        const unmatchedAttendantCount = attendantSummary.filter((attendant) => attendant.unmatchedCount > 0).length;

        const attendantRows: Record<string, any>[] = [];
        attendantRows.push({ Metric: "ATTENDANT ACCOUNTABILITY", Count: "", Amount: "" });
        attendantRows.push({ Metric: "  Fuel card sales", Count: totalFuelCardSalesCount, Amount: fmt(totalFuelCardSales) });
        attendantRows.push({ Metric: "  less Matched fuel card sales", Count: totalMatchedFuelCardSalesCount, Amount: fmt(totalMatchedFuelCardSales) });
        attendantRows.push({ Metric: "  Unmatched fuel card sales", Count: totalUnmatchedCardCount, Amount: fmt(totalUnmatchedCardAmount) });
        attendantRows.push({ Metric: `    (across ${unmatchedAttendantCount} attendant${unmatchedAttendantCount !== 1 ? "s" : ""})` });
        attendantRows.push({ Metric: "  plus Pump calibration error", Count: "", Amount: fmt(totalCalibrationError) });
        attendantRows.push({ Metric: "  Total shortfall allocated to attendants", Count: "", Amount: fmt(totalShortfallToAttendants) });
        attendantRows.push({});
        attendantRows.push({ Metric: "VERIFIED FUEL CARD SALES BY ATTENDANT" });
        attendantRows.push({});

        for (const attendant of withVerified) {
          const totalCardSales = attendant.matchedAmount + attendant.unmatchedAmount;
          const matchedCardSales = attendant.matchedAmount;
          const matchedBank = attendant.matchedBankAmount;
          const unmatchedCardSales = attendant.unmatchedAmount;
          const calibrationErr = attendant.matchedAmount - attendant.matchedBankAmount;
          const attendantShortfall = unmatchedCardSales + calibrationErr;

          attendantRows.push({ Metric: `${attendant.attendant} (${attendant.matchedCount} verified sale${attendant.matchedCount !== 1 ? "s" : ""})` });
          attendantRows.push({ Metric: "  Total card sales", Count: attendant.matchedCount + attendant.unmatchedCount, Amount: fmt(totalCardSales) });
          attendantRows.push({ Metric: "  Matched card sales", Count: attendant.matchedCount, Amount: fmt(matchedCardSales) });
          attendantRows.push({ Metric: "  Matched bank amount", Count: attendant.matchedCount, Amount: fmt(matchedBank) });

          if (attendant.banks.length >= 2) {
            for (const bank of attendant.banks) {
              attendantRows.push({ Metric: `    ${bank.bankName}`, Count: bank.count, Amount: fmt(bank.amount) });
            }
          }

          if (attendant.debtorCount > 0) {
            attendantRows.push({ Metric: "  Debtor / Account", Count: attendant.debtorCount, Amount: fmt(attendant.debtorAmount) });
          }

          if (attendant.declinedCount > 0) {
            attendantRows.push({ Metric: "  Declined transactions", Count: attendant.declinedCount, Amount: fmt(attendant.declinedAmount) });
          }

          if (attendant.unmatchedCount > 0 || Math.abs(calibrationErr) >= 0.01) {
            if (attendant.unmatchedCount > 0) {
              attendantRows.push({ Metric: "  Unmatched card sales", Count: attendant.unmatchedCount, Amount: fmt(unmatchedCardSales) });
            }
            if (Math.abs(calibrationErr) >= 0.01) {
              attendantRows.push({ Metric: "  Pump calibration error", Count: "", Amount: fmt(calibrationErr) });
            }
            attendantRows.push({ Metric: "  Attendant shortfall", Count: "", Amount: fmt(attendantShortfall) });
          }

          attendantRows.push({});
        }

        attendantRows.push({
          Metric: "Total",
          Count: withVerified.reduce((sum, attendant) => sum + attendant.matchedCount, 0),
          Amount: fmt(totalMatchedBankAmount),
        });

        if (unverified.length > 0) {
          attendantRows.push({});
          attendantRows.push({ Metric: "NO VERIFIED FUEL CARD SALES" });
          for (const attendant of unverified) {
            attendantRows.push({
              Metric: `  ${attendant.attendant}`,
              Count: attendant.unmatchedCount,
              Amount: fmt(attendant.unmatchedAmount),
            });
          }
        }

        if (unmatchedBank.length > 0) {
          attendantRows.push({});
          attendantRows.push({
            Metric: "UNMATCHED BANK TRANSACTIONS",
            Count: unmatchedBank.length,
            Amount: fmt(unmatchedBankAmount),
          });
          attendantRows.push({ Metric: "  These could not be attributed to any attendant - see Unmatched bank sheet" });
        }

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(attendantRows), "Attendant Summary");
      }

      const allRows = transactions.map((transaction) => ({
        Date: transaction.transactionDate,
        Time: transaction.transactionTime || "",
        Source: transaction.sourceType,
        "Source Name": transaction.sourceName || "",
        Amount: parseFloat(transaction.amount),
        "Card Number": transaction.cardNumber || "",
        "Payment Type": transaction.paymentType || "",
        Reference: transaction.referenceNumber || "",
        Description: transaction.description || "",
        Attendant: transaction.attendant || "",
        Pump: transaction.pump || "",
        Status: transaction.matchStatus,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRows), "All Transactions");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      audit(req, {
        action: "data.export",
        resourceType: "period",
        resourceId: req.params.periodId,
        detail: `Full reconciliation export: ${period.name}`,
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Reconciliation_${period.name.replace(/\s+/g, "_")}.xlsx"`,
      );
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting reconciliation:", error);
      res.status(500).json({ error: "Failed to export reconciliation" });
    }
  });

  app.get("/api/periods/:periodId/export-flagged", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      const flaggedResolutions = resolutions.filter((resolution) => resolution.resolutionType === "flagged");
      if (flaggedResolutions.length === 0) {
        return res.status(404).json({ error: "No flagged transactions found" });
      }

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const transactionMap = new Map(transactions.map((transaction) => [transaction.id, transaction]));

      const flaggedData = flaggedResolutions.map((resolution) => {
        const transaction = transactionMap.get(resolution.transactionId);
        return {
          "Bank Transaction Date": transaction?.transactionDate || "",
          "Bank Amount": transaction ? parseFloat(transaction.amount) : 0,
          "Bank Reference": transaction?.referenceNumber || "",
          Description: transaction?.description || "",
          "Flagged By": resolution.userName || resolution.userEmail || "Unknown",
          "Flagged Date": resolution.createdAt
            ? new Date(resolution.createdAt).toLocaleDateString("en-ZA")
            : "",
          Notes: resolution.notes || "",
        };
      });

      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(flaggedData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Flagged Transactions");

      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

      audit(req, {
        action: "data.export_flagged",
        resourceType: "period",
        resourceId: req.params.periodId,
        detail: `${flaggedResolutions.length} flagged transactions`,
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Flagged_Transactions_${period.name.replace(/\s+/g, "_")}.xlsx"`,
      );
      res.send(buffer);
    } catch (error) {
      console.error("Error exporting flagged transactions:", error);
      res.status(500).json({ error: "Failed to export flagged transactions" });
    }
  });
}

import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import { computeDeclineAnalysis } from "./insights/declineInsights";
import { buildInsightsReadModel } from "./insights/insightsReadModel.ts";
import { buildResultsDashboardReadModel } from "./reconciliation/dashboardReadModel.ts";
import { buildReviewQueueReadModel } from "./reconciliation/reviewQueueReadModel.ts";
import {
  assertPeriodOwner,
  assertPeriodWrite,
} from "./routeAccess";
import { storage } from "./storage";
import { matchingRulesConfigSchema } from "../shared/schema";

export function registerReconciliationReadRoutes(app: Express) {
  app.get("/api/periods/:periodId/transactions", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = (page - 1) * limit;
      const sourceType = req.query.sourceType as string | undefined;
      const matchStatus = req.query.matchStatus as string | undefined;
      const isCardTransaction = req.query.isCardTransaction as string | undefined;

      console.log(
        `[TRANSACTIONS] Fetching for period ${req.params.periodId}, page ${page}, limit ${limit}`,
      );

      const rules = await storage.getMatchingRules(req.params.periodId);
      const periodDates = {
        startDate: period.startDate,
        endDate: period.endDate,
        dateWindowDays: rules.dateWindowDays,
      };

      const result = await storage.getTransactionsByPeriodPaginated(
        req.params.periodId,
        { limit, offset, sourceType, matchStatus, isCardTransaction, periodDates },
      );

      console.log(
        `[TRANSACTIONS] Found ${result.total} total, returning ${result.transactions.length} on page ${page}`,
      );

      res.json({
        transactions: result.transactions,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  });

  app.get("/api/periods/:periodId/verification-summary", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const summary = await storage.getVerificationSummary(req.params.periodId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching verification summary:", error);
      res.status(500).json({ error: "Failed to fetch verification summary" });
    }
  });

  app.get("/api/periods/:periodId/matching-rules", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const rules = await storage.getMatchingRules(req.params.periodId);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching matching rules:", error);
      res.status(500).json({ error: "Failed to fetch matching rules" });
    }
  });

  app.post("/api/periods/:periodId/matching-rules", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;
      const validatedRules = matchingRulesConfigSchema.parse(req.body);
      const saved = await storage.saveMatchingRules(req.params.periodId, validatedRules);
      res.json({ success: true, rules: saved });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("Validation error:", error.errors);
        console.error("Matching rules validation:", error.errors);
        return res.status(400).json({ error: "Invalid matching rules data" });
      }
      console.error("Error saving matching rules:", error);
      res.status(500).json({ error: "Failed to save matching rules" });
    }
  });

  app.get("/api/periods/:periodId/matches/details", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const [matches, transactions, resolutions] = await Promise.all([
        storage.getMatchesByPeriod(req.params.periodId),
        storage.getTransactionsByPeriod(req.params.periodId),
        storage.getResolutionsByPeriod(req.params.periodId),
      ]);
      const txMap = new Map(transactions.map((tx) => [tx.id, tx]));
      const fuelItemsByMatchId = new Map<string, typeof transactions>();
      const linkedResolutionTransactionIds = new Set(
        resolutions
          .filter((resolution) => resolution.resolutionType === "linked")
          .map((resolution) => resolution.transactionId),
      );
      type LedgerRow = {
        match: {
          id: string;
          matchType: string;
          matchStage?: string | null;
          matchConfidence: string | null;
          createdAt: Date | null;
        };
        fuelTransaction: (typeof transactions)[number] | null;
        bankTransaction: (typeof transactions)[number] | null;
        fuelItems: typeof transactions;
      };

      const isInPeriod = (transaction: (typeof transactions)[number] | null | undefined) => {
        if (!transaction?.transactionDate) return false;
        return transaction.transactionDate >= period.startDate && transaction.transactionDate <= period.endDate;
      };

      const isCanonicalFuel = (transaction: (typeof transactions)[number] | null | undefined) =>
        !!transaction &&
        transaction.sourceType === "fuel" &&
        isInPeriod(transaction);

      const parseTimeToMinutes = (timeStr: string | null | undefined): number | null => {
        if (!timeStr) return null;
        const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (!match) return null;
        return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      };

      const boundaryPositions = (() => {
        const grouped = new Map<string, typeof transactions>();
        for (const tx of transactions) {
          if (!isCanonicalFuel(tx)) continue;
          const key = tx.transactionDate;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(tx);
        }

        const result = new Map<string, "start" | "end" | "both" | "none">();
        for (const dayTxs of grouped.values()) {
          const sorted = [...dayTxs].sort((a, b) => {
            const timeA = parseTimeToMinutes(a.transactionTime) ?? Number.MAX_SAFE_INTEGER;
            const timeB = parseTimeToMinutes(b.transactionTime) ?? Number.MAX_SAFE_INTEGER;
            if (timeA !== timeB) return timeA - timeB;
            return a.id.localeCompare(b.id);
          });
          if (sorted.length === 0) continue;
          const first = sorted[0];
          const last = sorted[sorted.length - 1];
          result.set(first.id, first.id === last.id ? "both" : "start");
          result.set(last.id, first.id === last.id ? "both" : "end");
        }
        return result;
      })();

      const classifyMatchStage = (
        fuelItems: typeof transactions,
        bankTransaction: (typeof transactions)[number] | null,
        matchType: string,
      ) => {
        if (!matchType.startsWith("auto")) return null;
        const anchorFuel = fuelItems[0];
        if (!anchorFuel || !bankTransaction) return null;
        const amountDiff = Math.abs(
          parseFloat(bankTransaction.amount) - fuelItems.reduce((sum, item) => sum + parseFloat(item.amount), 0),
        );
        const fuelDate = new Date(anchorFuel.transactionDate).getTime();
        const bankDate = new Date(bankTransaction.transactionDate).getTime();
        const dayDiff = Math.round((bankDate - fuelDate) / 86400000);
        const boundary = boundaryPositions.get(anchorFuel.id) || "none";

        if (amountDiff <= 0.01 && dayDiff === 0) return "strict_same_day_exact";
        if (
          (boundary === "start" || boundary === "both") && dayDiff === -1 ||
          (boundary === "end" || boundary === "both") && dayDiff === 1
        ) {
          return "boundary_transactions";
        }
        if (dayDiff === 0) return "operational_close_match";
        return "settlement_fallback";
      };

      for (const transaction of transactions) {
        if (transaction.sourceType === "fuel" && transaction.matchId) {
          if (!fuelItemsByMatchId.has(transaction.matchId)) {
            fuelItemsByMatchId.set(transaction.matchId, []);
          }
          fuelItemsByMatchId.get(transaction.matchId)!.push(transaction);
        }
      }

      const matchDetails: LedgerRow[] = matches.map((match) => {
        const fuelTransaction = txMap.get(match.fuelTransactionId) || null;
        const bankTransaction = txMap.get(match.bankTransactionId) || null;
        const fuelItems = fuelItemsByMatchId.get(match.id) || (fuelTransaction ? [fuelTransaction] : []);
        const matchType =
          linkedResolutionTransactionIds.has(match.bankTransactionId) ||
          linkedResolutionTransactionIds.has(match.fuelTransactionId)
            ? "linked"
            : match.matchType;
        return {
          match: {
            ...match,
            matchType,
            matchStage: classifyMatchStage(fuelItems, bankTransaction, matchType),
          },
          fuelTransaction,
          bankTransaction,
          fuelItems,
        };
      }).filter((row) => {
        if (row.fuelItems.some((item) => isCanonicalFuel(item))) return true;
        return isCanonicalFuel(row.fuelTransaction);
      });

      const syntheticRows: LedgerRow[] = transactions.flatMap((transaction): LedgerRow[] => {
        const paymentType = transaction.paymentType?.toLowerCase() || "";
        const isDebtor =
          paymentType.includes("debtor") ||
          paymentType.includes("account") ||
          paymentType.includes("fleet");

        if (transaction.sourceType === "fuel" && transaction.matchStatus !== "matched") {
          if (!isCanonicalFuel(transaction)) return [];
          if (isDebtor) {
            return [{
              match: {
                id: `debtor-${transaction.id}`,
                matchType: "debtor",
                matchConfidence: null,
                createdAt: transaction.createdAt,
              },
              fuelTransaction: transaction,
              bankTransaction: null,
              fuelItems: [transaction],
            }];
          }

          if (transaction.isCardTransaction === "no") {
            return [{
              match: {
                id: `cash-${transaction.id}`,
                matchType: "cash",
                matchConfidence: null,
                createdAt: transaction.createdAt,
              },
              fuelTransaction: transaction,
              bankTransaction: null,
              fuelItems: [transaction],
            }];
          }

          if (transaction.isCardTransaction === "yes" && transaction.matchStatus === "unmatched") {
            return [{
              match: {
                id: `unmatched-card-${transaction.id}`,
                matchType: "unmatched_card",
                matchConfidence: null,
                createdAt: transaction.createdAt,
              },
              fuelTransaction: transaction,
              bankTransaction: null,
              fuelItems: [transaction],
            }];
          }
        }

        if (transaction.sourceType?.startsWith("bank")) {
          if (!isInPeriod(transaction)) return [];
          if (transaction.matchStatus === "unmatched" || transaction.matchStatus === "lag_explained" || transaction.matchStatus === "unmatchable") {
            return [{
              match: {
                id: `unmatched-bank-${transaction.id}`,
                matchType: "unmatched_bank",
                matchConfidence: null,
                createdAt: transaction.createdAt,
              },
              fuelTransaction: null,
              bankTransaction: transaction,
              fuelItems: [],
            }];
          }

          if (transaction.matchStatus === "excluded") {
            return [{
              match: {
                id: `excluded-${transaction.id}`,
                matchType: "excluded",
                matchConfidence: null,
                createdAt: transaction.createdAt,
              },
              fuelTransaction: null,
              bankTransaction: transaction,
              fuelItems: [],
            }];
          }
        }

        return [];
      });

      const allRows = [...matchDetails, ...syntheticRows].sort((a: LedgerRow, b: LedgerRow) => {
        const aDate = a.match.createdAt ? new Date(a.match.createdAt).getTime() : 0;
        const bDate = b.match.createdAt ? new Date(b.match.createdAt).getTime() : 0;
        return bDate - aDate;
      });

      res.json(allRows);
    } catch (error) {
      console.error("Error fetching match details:", error);
      res.status(500).json({ error: "Failed to fetch match details" });
    }
  });

  app.get("/api/periods/:periodId/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      res.json(resolutions);
    } catch (error) {
      console.error("Error fetching resolutions:", error);
      res.status(500).json({ error: "Failed to fetch resolutions" });
    }
  });

  app.get("/api/periods/:periodId/resolution-summary", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const resolutions = await storage.getResolutionsByPeriod(req.params.periodId);
      const summary = {
        total: resolutions.length,
        linked: resolutions.filter((r) => r.resolutionType === "linked").length,
        flagged: resolutions.filter((r) => r.resolutionType === "flagged").length,
        dismissed: resolutions.filter((r) => r.resolutionType === "dismissed").length,
        partial: resolutions.filter((r) => r.resolutionType === "partial").length,
      };

      res.json(summary);
    } catch (error) {
      console.error("Error fetching resolution summary:", error);
      res.status(500).json({ error: "Failed to fetch resolution summary" });
    }
  });

  app.get("/api/transactions/:transactionId/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.transactionId);
      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }
      const period = await assertPeriodOwner(transaction.periodId, req, res);
      if (!period) return;

      const resolutions = await storage.getResolutionsByTransaction(req.params.transactionId);
      res.json(resolutions);
    } catch (error) {
      console.error("Error fetching transaction resolutions:", error);
      res.status(500).json({ error: "Failed to fetch transaction resolutions" });
    }
  });

  app.get("/api/periods/:periodId/decline-analysis", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const fuelTxns = transactions.filter((tx) => tx.sourceType === "fuel");
      const bankTxns = transactions.filter(
        (tx) => tx.sourceType && tx.sourceType.startsWith("bank"),
      );

      const result = computeDeclineAnalysis(bankTxns, fuelTxns);
      res.json(result);
    } catch (error) {
      console.error("Error fetching decline analysis:", error);
      res.status(500).json({ error: "Failed to fetch decline analysis" });
    }
  });

  app.get("/api/periods/:periodId/insights", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const [summary, attendantSummary, transactions] = await Promise.all([
        storage.getPeriodSummary(req.params.periodId),
        storage.getAttendantSummary(req.params.periodId),
        storage.getTransactionsByPeriod(req.params.periodId),
      ]);

      const fuelTransactions = transactions.filter((tx) => tx.sourceType === "fuel");
      const bankTransactions = transactions.filter(
        (tx) => tx.sourceType && tx.sourceType.startsWith("bank"),
      );
      const declineResult = computeDeclineAnalysis(bankTransactions, fuelTransactions);

      res.json(buildInsightsReadModel(summary, attendantSummary, declineResult));
    } catch (error) {
      console.error("Error fetching insights read model:", error);
      res.status(500).json({ error: "Failed to fetch insights data" });
    }
  });

  app.get("/api/periods/:periodId/review-model", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const [transactions, resolutions, matchingRules] = await Promise.all([
        storage.getTransactionsByPeriod(req.params.periodId),
        storage.getResolutionsByPeriod(req.params.periodId),
        storage.getMatchingRules(req.params.periodId),
      ]);

      res.json(buildReviewQueueReadModel(period, transactions, resolutions, matchingRules));
    } catch (error) {
      console.error("Error fetching review read model:", error);
      res.status(500).json({ error: "Failed to fetch review data" });
    }
  });

  app.get("/api/periods/:periodId/summary", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const summary = await storage.getPeriodSummary(req.params.periodId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching period summary:", error);
      res.status(500).json({ error: "Failed to fetch period summary" });
    }
  });

  app.get("/api/periods/:periodId/dashboard", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const [summary, resolutions] = await Promise.all([
        storage.getPeriodSummary(req.params.periodId),
        storage.getResolutionsByPeriod(req.params.periodId),
      ]);

      res.json(buildResultsDashboardReadModel(summary, resolutions));
    } catch (error) {
      console.error("Error fetching dashboard read model:", error);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  app.get("/api/periods/:periodId/attendant-summary", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;
      const summary = await storage.getAttendantSummary(req.params.periodId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching attendant summary:", error);
      res.status(500).json({ error: "Failed to fetch attendant summary" });
    }
  });
}

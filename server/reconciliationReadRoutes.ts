import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import { computeDeclineAnalysis } from "./insights/declineInsights";
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

      const matches = await storage.getMatchesByPeriod(req.params.periodId);
      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const txMap = new Map(transactions.map((tx) => [tx.id, tx]));

      const matchDetails = matches.map((match) => {
        const fuelTransaction = txMap.get(match.fuelTransactionId);
        const bankTransaction = txMap.get(match.bankTransactionId);
        return {
          ...match,
          fuelTransaction,
          bankTransaction,
        };
      });

      res.json(matchDetails);
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

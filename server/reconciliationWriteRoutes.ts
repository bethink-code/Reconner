import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import { storage } from "./storage";
import { assertPeriodWrite } from "./routeAccess";
import { planAutoMatch } from "./reconciliation/autoMatchPlanner.ts";
import {
  ReconciliationCommandError,
  ReconciliationCommandService,
  type ReconciliationActor,
} from "./reconciliation/reconciliationCommandService.ts";
import { reconciliationStateWriter } from "./reconciliation/reconciliationStateWriter.ts";
import {
  insertMatchSchema,
  type User,
} from "../shared/schema";

const reconciliationCommandService = new ReconciliationCommandService(reconciliationStateWriter);
const resolutionTypeSchema = z.enum(["linked", "reviewed", "dismissed", "flagged", "partial"]);

const reviewLinkSchema = z.object({
  bankTransactionId: z.string().min(1),
  fuelTransactionId: z.string().min(1),
  reviewTransactionId: z.string().min(1),
  notes: z.string().trim().optional().nullable(),
});

const resolutionSchema = z.object({
  transactionId: z.string().min(1),
  periodId: z.string().min(1),
  resolutionType: resolutionTypeSchema,
  reason: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  linkedTransactionId: z.string().trim().optional().nullable(),
  assignee: z.string().trim().optional().nullable(),
});

const bulkResolutionSchema = z.object({
  transactionIds: z.array(z.string().min(1)).min(1),
  periodId: z.string().min(1),
});

const bulkConfirmSchema = z.object({
  matches: z.array(z.object({
    bankId: z.string().min(1),
    fuelId: z.string().min(1),
  })).min(1),
  periodId: z.string().min(1),
});

function buildActor(user: User | undefined): ReconciliationActor {
  return {
    id: user?.id || null,
    name: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : null,
    email: user?.email || null,
  };
}

function handleWriteError(res: any, error: unknown, fallbackMessage: string) {
  if (error instanceof ReconciliationCommandError) {
    return res.status(error.status).json({ error: error.code, message: error.message });
  }

  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: "invalid_request", message: "Invalid request data" });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ error: "internal_error", message: fallbackMessage });
}

export function registerReconciliationWriteRoutes(app: Express) {
  app.post("/api/periods/:periodId/auto-match", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;

      const rules = await storage.getMatchingRules(req.params.periodId);
      const transactions = await storage.getTransactionsByPeriod(req.params.periodId);
      const plan = planAutoMatch({
        id: req.params.periodId,
        name: period.name,
        startDate: period.startDate,
        endDate: period.endDate,
      }, rules, transactions);

      console.log(`[MATCH] Applying ${plan.pendingMatches.length} matches with transactional state updates...`);
      await reconciliationCommandService.clearPeriodResolutions(req.params.periodId);
      await storage.applyAutoMatchResults(
        req.params.periodId,
        plan.pendingMatches,
        plan.lagExplainedBankIds,
        plan.unmatchableBankIds,
      );

      audit(req, {
        action: "reconciliation.run",
        resourceType: "period",
        resourceId: req.params.periodId,
        detail: `${plan.metrics.matchesCreated} matches created`,
      });

      res.json({
        success: true,
        ...plan.metrics,
        rulesUsed: rules,
        stagesUsed: plan.stages,
        warnings: plan.warnings,
      });
    } catch (error) {
      console.error("Error auto-matching:", error);
      res.status(500).json({ error: "Failed to auto-match transactions" });
    }
  });

  app.post("/api/periods/:periodId/review/link", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;

      const input = reviewLinkSchema.parse(req.body);
      const match = await reconciliationCommandService.createReviewLink({
        periodId: req.params.periodId,
        bankTransactionId: input.bankTransactionId,
        fuelTransactionId: input.fuelTransactionId,
        reviewTransactionId: input.reviewTransactionId,
        notes: input.notes ?? null,
        actor: buildActor(user),
      });

      audit(req, {
        action: "match.review_link",
        resourceType: "match",
        resourceId: match.id,
        detail: `Fuel ${input.fuelTransactionId.slice(0, 8)}... -> Bank ${input.bankTransactionId.slice(0, 8)}...`,
      });

      res.json({ success: true, match });
    } catch (error) {
      handleWriteError(res, error, "Failed to create review link");
    }
  });

  app.post("/api/matches/manual", isAuthenticated, async (req: any, res) => {
    try {
      const matchInput = insertMatchSchema.omit({ matchType: true, matchConfidence: true }).parse(req.body);

      const period = await assertPeriodWrite(matchInput.periodId, req, res);
      if (!period) return;

      const match = await reconciliationCommandService.createManualMatch({
        periodId: matchInput.periodId,
        bankTransactionId: matchInput.bankTransactionId,
        fuelTransactionId: matchInput.fuelTransactionId,
      });

      audit(req, {
        action: "match.manual",
        resourceType: "match",
        resourceId: match.id,
        detail: `Fuel ${matchInput.fuelTransactionId.slice(0, 8)}... -> Bank ${matchInput.bankTransactionId.slice(0, 8)}...`,
      });
      res.json({ success: true, match });
    } catch (error) {
      handleWriteError(res, error, "Failed to create manual match");
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

      await reconciliationCommandService.deleteMatch(match.periodId, req.params.matchId);
      audit(req, { action: "match.delete", resourceType: "match", resourceId: req.params.matchId });

      res.json({ success: true });
    } catch (error) {
      handleWriteError(res, error, "Failed to delete match");
    }
  });

  app.post("/api/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const input = resolutionSchema.parse(req.body);

      const period = await assertPeriodWrite(input.periodId, req, res);
      if (!period) return;

      const resolution = await reconciliationCommandService.createResolution({
        periodId: input.periodId,
        transactionId: input.transactionId,
        resolutionType: input.resolutionType,
        reason: input.reason ?? null,
        notes: input.notes ?? null,
        linkedTransactionId: input.linkedTransactionId ?? null,
        assignee: input.assignee ?? null,
        actor: buildActor(user),
      });

      audit(req, {
        action: `resolution.${input.resolutionType}`,
        resourceType: "transaction",
        resourceId: input.transactionId,
        detail: input.reason || input.notes || undefined,
      });
      res.json({ success: true, resolution });
    } catch (error) {
      handleWriteError(res, error, "Failed to create resolution");
    }
  });

  app.post("/api/resolutions/bulk-dismiss", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const input = bulkResolutionSchema.parse(req.body);

      const period = await assertPeriodWrite(input.periodId, req, res);
      if (!period) return;

      const count = await reconciliationCommandService.createBulkResolutions({
        periodId: input.periodId,
        transactionIds: input.transactionIds,
        resolutionType: "dismissed",
        reason: "test_transaction",
        notes: "Bulk dismissed as low-value transaction",
        actor: buildActor(user),
      });

      audit(req, {
        action: "resolution.bulk_dismiss",
        resourceType: "period",
        resourceId: input.periodId,
        detail: `${count} transactions dismissed`,
      });
      res.json({ success: true, count });
    } catch (error) {
      handleWriteError(res, error, "Failed to bulk dismiss transactions");
    }
  });

  app.post("/api/resolutions/bulk-flag", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const input = bulkResolutionSchema.parse(req.body);

      const period = await assertPeriodWrite(input.periodId, req, res);
      if (!period) return;

      const count = await reconciliationCommandService.createBulkResolutions({
        periodId: input.periodId,
        transactionIds: input.transactionIds,
        resolutionType: "flagged",
        reason: null,
        notes: "Flagged for manager review",
        actor: buildActor(user),
      });

      audit(req, {
        action: "resolution.bulk_flag",
        resourceType: "period",
        resourceId: input.periodId,
        detail: `${count} transactions flagged`,
      });
      res.json({ success: true, count });
    } catch (error) {
      handleWriteError(res, error, "Failed to bulk flag transactions");
    }
  });

  app.delete("/api/resolutions/:transactionId", isAuthenticated, async (req: any, res) => {
    try {
      const transaction = await storage.getTransaction(req.params.transactionId);
      if (!transaction) return res.status(404).json({ error: "Transaction not found" });

      const period = await assertPeriodWrite(transaction.periodId, req, res);
      if (!period) return;

      const result = await reconciliationCommandService.removeResolution(transaction.periodId, transaction.id);
      audit(req, {
        action: "resolution.delete",
        resourceType: "transaction",
        resourceId: transaction.id,
        detail: result.mode,
      });

      res.json({ success: true, count: result.count, mode: result.mode });
    } catch (error) {
      handleWriteError(res, error, "Failed to delete resolution");
    }
  });

  app.delete("/api/periods/:periodId/resolutions", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.periodId, req, res);
      if (!period) return;

      const count = await reconciliationCommandService.clearPeriodResolutions(req.params.periodId);
      audit(req, {
        action: "resolution.clear_period",
        resourceType: "period",
        resourceId: req.params.periodId,
        detail: `${count} resolutions cleared`,
      });
      res.json({ success: true, count });
    } catch (error) {
      handleWriteError(res, error, "Failed to clear resolutions");
    }
  });

  app.post("/api/matches/bulk-confirm", isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as User;
      const input = bulkConfirmSchema.parse(req.body);

      const period = await assertPeriodWrite(input.periodId, req, res);
      if (!period) return;

      let count = 0;
      for (const match of input.matches) {
        await reconciliationCommandService.createReviewLink({
          periodId: input.periodId,
          bankTransactionId: match.bankId,
          fuelTransactionId: match.fuelId,
          reviewTransactionId: match.bankId,
          notes: "Bulk confirmed as quick win match",
          actor: buildActor(user),
        });
        count += 1;
      }

      audit(req, {
        action: "match.bulk_confirm",
        resourceType: "period",
        resourceId: input.periodId,
        detail: `${count} matches confirmed`,
      });
      res.json({ success: true, count });
    } catch (error) {
      handleWriteError(res, error, "Failed to bulk confirm matches");
    }
  });
}

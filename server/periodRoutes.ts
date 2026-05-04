import type { Express } from "express";
import { isAuthenticated } from "./auth";
import { audit } from "./auditLog";
import {
  assertPeriodOwner,
  assertPeriodWrite,
  resolveOrgContext,
} from "./routeAccess";
import { storage } from "./storage";
import { insertReconciliationPeriodSchema } from "../shared/schema";

export function registerPeriodRoutes(app: Express) {
  app.get("/api/periods", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;

      const queryProperty = req.query.propertyId as string | undefined;
      let propertyId: string | undefined = req.user?.currentPropertyId;
      if (queryProperty === "all") propertyId = undefined;
      else if (queryProperty) propertyId = queryProperty;

      const periods = await storage.getPeriods(ctx.orgId, propertyId);
      res.json(periods);
    } catch (error) {
      console.error("Error fetching periods:", error);
      res.status(500).json({ error: "Failed to fetch periods" });
    }
  });

  app.get("/api/periods/:id", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.id, req, res);
      if (!period) return;
      res.json(period);
    } catch (error) {
      console.error("Error fetching period:", error);
      res.status(500).json({ error: "Failed to fetch period" });
    }
  });

  app.post("/api/periods", isAuthenticated, async (req: any, res) => {
    try {
      const ctx = await resolveOrgContext(req, res);
      if (!ctx) return;
      if (ctx.role === "viewer") {
        return res.status(403).json({ error: "read_only" });
      }

      const userId = req.user?.claims?.sub;
      const validated = insertReconciliationPeriodSchema.parse(req.body);
      const propertyId: string | undefined =
        (req.body?.propertyId as string | undefined) ||
        req.user?.currentPropertyId;

      if (!propertyId) {
        return res
          .status(400)
          .json({ error: "propertyId required - pick a property first" });
      }

      const prop = await storage.getProperty(propertyId);
      if (!prop || prop.organizationId !== ctx.orgId) {
        return res.status(403).json({
          error: "Property does not belong to current organization",
        });
      }

      const period = await storage.createPeriod({
        ...validated,
        userId,
        organizationId: ctx.orgId,
        propertyId,
      });
      audit(req, {
        action: "period.create",
        resourceType: "period",
        resourceId: period.id,
        detail: `property=${propertyId}`,
      });
      res.json(period);
    } catch (error) {
      console.error("Error creating period:", error);
      res.status(400).json({ error: "Invalid period data" });
    }
  });

  app.patch("/api/periods/:id", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.id, req, res);
      if (!period) return;

      const partialSchema = insertReconciliationPeriodSchema.partial();
      const validated = partialSchema.parse(req.body);
      const updated = await storage.updatePeriod(req.params.id, validated);
      if (!updated) {
        return res.status(404).json({ error: "Period not found" });
      }
      res.json(updated);
    } catch (error) {
      console.error("Error updating period:", error);
      res.status(400).json({ error: "Invalid period data" });
    }
  });

  app.delete("/api/periods/:id", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodWrite(req.params.id, req, res);
      if (!period) return;

      await storage.deletePeriod(req.params.id);
      audit(req, {
        action: "period.delete",
        resourceType: "period",
        resourceId: req.params.id,
        detail: period.name,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting period:", error);
      res.status(500).json({ error: "Failed to delete period" });
    }
  });

  app.get("/api/periods/:periodId/files", isAuthenticated, async (req: any, res) => {
    try {
      const period = await assertPeriodOwner(req.params.periodId, req, res);
      if (!period) return;

      const files = await storage.getFilesByPeriod(req.params.periodId);
      res.json(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      res.status(500).json({ error: "Failed to fetch files" });
    }
  });
}

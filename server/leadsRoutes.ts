// Platform-owner-only leads/pipeline API.
// All endpoints require isPlatformOwner — client admins must never see this data.
//
// Prod SQL (run after db:push on dev, then manually on prod):
//   CREATE TABLE leads (...)
// Run `npm run db:push` on dev first, then surface the generated SQL for prod.

import type { Express, Request, Response } from "express";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { db } from "./db";
import { leads, leadNotes } from "../shared/schema";
import { isAuthenticated } from "./auth";
import { isPlatformOwner } from "./routeAccess";

const STATUSES = ["new", "contacted", "qualified", "applied", "converted", "parked"] as const;
const SOURCES = ["website_contact", "referral", "direct", "pilot_page", "other"] as const;
const BUSINESS_TYPES = ["fuel", "retail", "other"] as const;

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  businessName: z.string().trim().max(255).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().min(1).max(50),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  location: z.string().trim().max(255).optional(),
  interestedInPilot: z.boolean().default(false),
  nextAction: z.string().trim().max(100).optional(),
  nextActionDue: z.string().optional().nullable(),
  source: z.enum(SOURCES).default("direct"),
  status: z.enum(STATUSES).default("new"),
  notes: z.string().trim().max(4000).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  businessName: z.string().trim().max(255).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable().or(z.literal("")),
  phone: z.string().trim().min(1).max(50).optional(),
  businessType: z.enum(BUSINESS_TYPES).optional().nullable(),
  location: z.string().trim().max(255).optional().nullable(),
  interestedInPilot: z.boolean().optional(),
  nextAction: z.string().trim().max(100).optional().nullable(),
  nextActionDue: z.string().optional().nullable(),
  source: z.enum(SOURCES).optional(),
  status: z.enum(STATUSES).optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
  linkedPilotApplicationId: z.string().optional().nullable(),
});

export function registerLeadsRoutes(app: Express): void {
  app.get("/api/leads", isAuthenticated, isPlatformOwner, async (_req: Request, res: Response) => {
    try {
      const rows = await db.select().from(leads).orderBy(desc(leads.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("[leads] list failed:", err);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });

  app.post("/api/leads", isAuthenticated, isPlatformOwner, async (req: Request, res: Response) => {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });
    }
    try {
      const { nextActionDue, ...rest } = parsed.data;
      const [lead] = await db.insert(leads).values({
        ...rest,
        nextActionDue: nextActionDue ? new Date(nextActionDue) : null,
      }).returning();
      res.status(201).json(lead);
    } catch (err) {
      console.error("[leads] create failed:", err);
      res.status(500).json({ error: "Failed to create lead" });
    }
  });

  app.patch("/api/leads/:id", isAuthenticated, isPlatformOwner, async (req: Request, res: Response) => {
    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid data" });
    }
    try {
      const { nextActionDue, ...rest } = parsed.data;
      const [updated] = await db
        .update(leads)
        .set({ ...rest, nextActionDue: nextActionDue ? new Date(nextActionDue) : null, updatedAt: new Date() })
        .where(eq(leads.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Lead not found" });
      res.json(updated);
    } catch (err) {
      console.error("[leads] update failed:", err);
      res.status(500).json({ error: "Failed to update lead" });
    }
  });

  app.delete("/api/leads/:id", isAuthenticated, isPlatformOwner, async (req: Request, res: Response) => {
    try {
      await db.delete(leads).where(eq(leads.id, req.params.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("[leads] delete failed:", err);
      res.status(500).json({ error: "Failed to delete lead" });
    }
  });

  app.get("/api/leads/:id/notes", isAuthenticated, isPlatformOwner, async (req: Request, res: Response) => {
    try {
      const notes = await db
        .select()
        .from(leadNotes)
        .where(eq(leadNotes.leadId, req.params.id))
        .orderBy(desc(leadNotes.createdAt));
      res.json(notes);
    } catch (err) {
      console.error("[leads] notes list failed:", err);
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.post("/api/leads/:id/notes", isAuthenticated, isPlatformOwner, async (req: Request, res: Response) => {
    const note = (req.body?.note ?? "").trim();
    if (!note) return res.status(400).json({ error: "Note is required" });
    try {
      const [created] = await db.insert(leadNotes).values({ leadId: req.params.id, note }).returning();
      res.status(201).json(created);
    } catch (err) {
      console.error("[leads] note create failed:", err);
      res.status(500).json({ error: "Failed to add note" });
    }
  });
}

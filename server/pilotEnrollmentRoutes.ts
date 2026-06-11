// Pilot enrollment — three-stage public form: Data Policy → Pilot Terms → Application.
// All public endpoints are unauthenticated (prospective customers, pre-account).
// Admin endpoints (list, approve) require isAuthenticated + isAdmin.
//
// Prod SQL (run after db:push on dev, then manually on prod):
//   CREATE TABLE policy_acknowledgments (...)
//   CREATE TABLE terms_acknowledgments (...)
//   CREATE TABLE pilot_applications (...)
//   CREATE TABLE pilot_workflow_log (...)
// Run `npm run db:push` on dev first, then surface the generated SQL to prod.

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  policyAcknowledgments,
  termsAcknowledgments,
  pilotApplications,
  pilotWorkflowLog,
} from "../shared/schema";
import { isAuthenticated } from "./auth";
import { isAdmin } from "./routeAccess";
import {
  buildEnrollmentConfirmation,
  buildEnrollmentNotification,
  encodeHeaderWord,
  getAccessToken,
  sendEmail,
  FROM_ADDRESS,
  FROM_DISPLAY,
  NOTIFICATION_RECIPIENTS,
  type EnrollmentApplication,
} from "./email";

const BANKS = ["FNB", "ABSA", "Standard Bank", "Nedbank", "Other"] as const;

function getIp(req: Request): string | null {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    null
  );
}

function johannesburgTimestamp(): string {
  return new Date().toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "long",
    timeStyle: "short",
  });
}

async function logWorkflowEvent(opts: {
  policyAcknowledgmentId: string;
  pilotApplicationId?: string;
  eventType: string;
  stage: string;
  triggeredBy?: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await db.insert(pilotWorkflowLog).values({
      policyAcknowledgmentId: opts.policyAcknowledgmentId,
      pilotApplicationId: opts.pilotApplicationId || null,
      eventType: opts.eventType,
      stage: opts.stage,
      triggeredBy: opts.triggeredBy || "system",
      ipAddress: opts.ip || null,
      userAgent: opts.userAgent || null,
    });
  } catch (err) {
    console.error("[pilot-enrollment] workflow log failed:", err);
  }
}

// ── Stage 1: Pilot Terms (no prior ID needed) ─────────────────────────────────

const termsSchema = z.object({
  pilot_terms_acknowledged: z.literal(true, {
    errorMap: () => ({ message: "Please confirm you have read the pilot terms" }),
  }),
  feedback_permission_granted: z.literal(true, {
    errorMap: () => ({ message: "Please confirm your commitment to honest feedback" }),
  }),
});

// ── Stage 2: Data Policy + user details ──────────────────────────────────────

const policySchema = z.object({
  terms_acknowledgment_id: z.string().trim().min(1, "Missing enrollment token"),
  full_name: z.string().trim().min(1, "Your name is required").max(120),
  business_name: z.string().trim().min(1, "A business name is required").max(200),
  email: z.string().trim().email("A valid email is required").max(200),
  cell_number: z.string().trim().min(1, "A cell number is required").max(40),
  policy_acknowledged: z.literal(true, {
    errorMap: () => ({ message: "Please confirm you have read the data policy" }),
  }),
});

// ── Stage 3: Application ──────────────────────────────────────────────────────

const applicationSchema = z.object({
  policy_acknowledgment_id: z.string().trim().min(1, "Missing enrollment token"),
  terms_acknowledgment_id: z.string().trim().min(1, "Missing enrollment token"),
  full_name: z.string().trim().min(1, "Your name is required").max(120),
  business_name: z.string().trim().min(1, "A business name is required").max(200),
  email: z.string().trim().email("A valid email is required").max(200),
  cell_number: z.string().trim().min(1, "A cell number is required").max(40),
  num_sites: z.coerce.number().int().min(1, "At least one site is required"),
  pos_system: z.string().trim().min(1, "Tell us which POS or fuel system you use").max(200),
  banks: z.array(z.enum(BANKS)).min(1, "Choose at least one bank"),
  success_story: z.string().trim().min(1, "Tell us what success looks like").max(500),
  ready_to_proceed: z.literal(true, {
    errorMap: () => ({ message: "Please confirm you are ready to discuss next steps" }),
  }),
  // Website journey attribution - optional, whitelisted, never blocks an application.
  journey: z.enum(["cash-gap", "tracking-cash", "matching-payouts"]).nullish().catch(null),
});

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function registerPilotEnrollmentRoutes(app: Express): void {
  // Shared rate limiter for public enrollment stages: 10/IP/hour.
  // Final submission has its own tighter limiter.
  const stageLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, errors: { form: "Too many requests. Please try again later." } },
  });

  const submitLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, errors: { form: "Too many requests. Please try again later." } },
  });

  // POST /api/pilot/acknowledge-terms  (step 1 — no prior ID needed)
  app.post("/api/pilot/acknowledge-terms", stageLimiter, async (req: Request, res: Response) => {
    const parsed = termsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
    }

    let record;
    try {
      const inserted = await db.insert(termsAcknowledgments).values({
        pilotTermsAcknowledged: true,
        feedbackPermissionGranted: true,
        ipAddress: getIp(req),
        userAgent: req.headers["user-agent"] || null,
      }).returning();
      record = inserted[0];
    } catch (err) {
      console.error("[pilot/acknowledge-terms] DB insert failed:", err);
      return res.status(500).json({ ok: false, errors: { form: "Something went wrong. Please try again." } });
    }

    console.log(`[pilot/terms] terms_id=${record.id}`);

    return res.status(201).json({
      ok: true,
      terms_acknowledgment_id: record.id,
      submitted_at: record.submittedAt,
      next_step: "/pilot-policy",
    });
  });

  // POST /api/pilot/acknowledge-policy  (step 2 — requires terms ID)
  app.post("/api/pilot/acknowledge-policy", stageLimiter, async (req: Request, res: Response) => {
    const parsed = policySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
    }
    const d = parsed.data;

    // Verify the terms acknowledgment exists
    const termsRecord = await db.select({ id: termsAcknowledgments.id })
      .from(termsAcknowledgments)
      .where(eq(termsAcknowledgments.id, d.terms_acknowledgment_id))
      .limit(1);

    if (!termsRecord.length) {
      return res.status(400).json({ ok: false, errors: { form: "Invalid enrollment token. Please start from the pilot terms page." } });
    }

    let record;
    try {
      const inserted = await db.insert(policyAcknowledgments).values({
        fullName: d.full_name,
        businessName: d.business_name,
        email: d.email,
        cellNumber: d.cell_number,
        dataPolicyAcknowledged: true,
        ipAddress: getIp(req),
        userAgent: req.headers["user-agent"] || null,
      }).returning();
      record = inserted[0];
    } catch (err) {
      console.error("[pilot/acknowledge-policy] DB insert failed:", err);
      return res.status(500).json({ ok: false, errors: { form: "Something went wrong. Please try again." } });
    }

    // Link the terms record back to the policy record now that we have the ID
    await db.update(termsAcknowledgments)
      .set({ policyAcknowledgmentId: record.id })
      .where(eq(termsAcknowledgments.id, d.terms_acknowledgment_id));

    await logWorkflowEvent({
      policyAcknowledgmentId: record.id,
      eventType: "policy_acknowledged",
      stage: "policy",
      ip: getIp(req),
      userAgent: req.headers["user-agent"] || null,
    });

    console.log(`[pilot/policy] ${d.full_name} <${d.email}> id=${record.id}`);

    return res.status(201).json({
      ok: true,
      policy_acknowledgment_id: record.id,
      submitted_at: record.submittedAt,
      next_step: "/pilot-apply",
    });
  });

  // POST /api/pilot/submit-application
  app.post("/api/pilot/submit-application", submitLimiter, async (req: Request, res: Response) => {
    const parsed = applicationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
    }
    const d = parsed.data;

    // Verify both acknowledgments exist and are linked
    const [policyRecord, termsRecord] = await Promise.all([
      db.select({ id: policyAcknowledgments.id, email: policyAcknowledgments.email })
        .from(policyAcknowledgments)
        .where(eq(policyAcknowledgments.id, d.policy_acknowledgment_id))
        .limit(1),
      db.select({ id: termsAcknowledgments.id, policyId: termsAcknowledgments.policyAcknowledgmentId })
        .from(termsAcknowledgments)
        .where(eq(termsAcknowledgments.id, d.terms_acknowledgment_id))
        .limit(1),
    ]);

    if (!policyRecord.length) {
      return res.status(400).json({ ok: false, errors: { form: "Invalid enrollment token. Please start from the pilot terms page." } });
    }
    if (!termsRecord.length) {
      return res.status(400).json({ ok: false, errors: { form: "Invalid enrollment token. Please start from the pilot terms page." } });
    }

    let appRecord;
    try {
      const inserted = await db.insert(pilotApplications).values({
        policyAcknowledgmentId: d.policy_acknowledgment_id,
        termsAcknowledgmentId: d.terms_acknowledgment_id,
        fullName: d.full_name,
        businessName: d.business_name,
        email: d.email,
        cellNumber: d.cell_number,
        numSites: d.num_sites,
        posSystem: d.pos_system,
        banks: JSON.stringify(d.banks),
        successStory: d.success_story,
        readyToProceed: true,
        journey: d.journey ?? null,
        pilotStatus: "pending_approval",
        ipAddress: getIp(req),
        userAgent: req.headers["user-agent"] || null,
      }).returning();
      appRecord = inserted[0];
    } catch (err) {
      console.error("[pilot/submit-application] DB insert failed:", err);
      return res.status(500).json({ ok: false, errors: { form: "Something went wrong. Please try again." } });
    }

    await logWorkflowEvent({
      policyAcknowledgmentId: d.policy_acknowledgment_id,
      pilotApplicationId: appRecord.id,
      eventType: "application_submitted",
      stage: "application",
      ip: getIp(req),
      userAgent: req.headers["user-agent"] || null,
    });

    console.log(`[pilot/application] ${d.full_name} <${d.email}> business=${d.business_name} app_id=${appRecord.id}`);

    const enrollment: EnrollmentApplication = {
      name: d.full_name,
      business: d.business_name,
      email: d.email,
      cell: d.cell_number,
      sites: d.num_sites,
      posSystem: d.pos_system,
      banks: d.banks,
      successStory: d.success_story,
      applicationId: appRecord.id,
      submittedAt: johannesburgTimestamp(),
    };

    try {
      const token = await getAccessToken();
      // 1. Owner notification first — never lose the lead if the confirmation fails.
      await sendEmail(token, {
        from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
        to: NOTIFICATION_RECIPIENTS.join(", "),
        replyTo: `${encodeHeaderWord(d.full_name)} <${d.email}>`,
        subject: `New lekana pilot enrollment from ${d.business_name}`,
        html: buildEnrollmentNotification(enrollment),
      });
      // 2. Comprehensive confirmation to the applicant.
      await sendEmail(token, {
        from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
        to: d.email,
        subject: "Your Lekana pilot application has been submitted",
        html: buildEnrollmentConfirmation(enrollment),
      });
    } catch (err) {
      console.error("[pilot/submit-application] email delivery failed:", err);
      // Don't fail the request — the application is safely stored in DB.
    }

    return res.status(201).json({
      ok: true,
      pilot_application_id: appRecord.id,
      submitted_at: appRecord.submittedAt,
      message: "Application submitted. Pieter will be in touch on WhatsApp within 1–2 business days.",
    });
  });

  // POST /api/pilot/enroll  (combined step 1: creates both policy + terms records)
  const enrollSchema = z.object({
    full_name: z.string().trim().min(1, "Your name is required").max(120),
    business_name: z.string().trim().min(1, "A business name is required").max(200),
    email: z.string().trim().email("A valid email is required").max(200),
    cell_number: z.string().trim().min(1, "A cell number is required").max(40),
    policy_acknowledged: z.literal(true, {
      errorMap: () => ({ message: "Please confirm you have read the data policy" }),
    }),
    pilot_terms_acknowledged: z.literal(true, {
      errorMap: () => ({ message: "Please confirm you have read the pilot terms" }),
    }),
    feedback_permission_granted: z.boolean().default(true),
  });

  app.post("/api/pilot/enroll", stageLimiter, async (req: Request, res: Response) => {
    const parsed = enrollSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, errors: fieldErrors(parsed.error) });
    }
    const d = parsed.data;
    const ip = getIp(req);
    const ua = req.headers["user-agent"] || null;

    let policyRecord, termsRecord;
    try {
      const policyInserted = await db.insert(policyAcknowledgments).values({
        fullName: d.full_name,
        businessName: d.business_name,
        email: d.email,
        cellNumber: d.cell_number,
        dataPolicyAcknowledged: true,
        ipAddress: ip,
        userAgent: ua,
      }).returning();
      policyRecord = policyInserted[0];

      const termsInserted = await db.insert(termsAcknowledgments).values({
        policyAcknowledgmentId: policyRecord.id,
        pilotTermsAcknowledged: true,
        feedbackPermissionGranted: d.feedback_permission_granted ?? true,
        ipAddress: ip,
        userAgent: ua,
      }).returning();
      termsRecord = termsInserted[0];
    } catch (err) {
      console.error("[pilot/enroll] DB insert failed:", err);
      return res.status(500).json({ ok: false, errors: { form: "Something went wrong. Please try again." } });
    }

    await logWorkflowEvent({
      policyAcknowledgmentId: policyRecord.id,
      eventType: "enrolled",
      stage: "enroll",
      ip,
      userAgent: ua,
    });

    console.log(`[pilot/enroll] ${d.full_name} <${d.email}> policy=${policyRecord.id} terms=${termsRecord.id}`);

    return res.status(201).json({
      ok: true,
      policy_acknowledgment_id: policyRecord.id,
      terms_acknowledgment_id: termsRecord.id,
      submitted_at: policyRecord.submittedAt,
      next_step: "/pilot-apply",
    });
  });

  // ── Admin endpoints ─────────────────────────────────────────────────────────

  // GET /api/pilot/applications — list applications (admin only)
  app.get("/api/pilot/applications", isAuthenticated, isAdmin, async (req: Request, res: Response) => {
    try {
      const statusFilter = req.query.status as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;

      const conditions = statusFilter
        ? [eq(pilotApplications.pilotStatus, statusFilter)]
        : [];

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [apps, countResult] = await Promise.all([
        db.select().from(pilotApplications)
          .where(where)
          .orderBy(desc(pilotApplications.submittedAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)` })
          .from(pilotApplications)
          .where(where),
      ]);

      // Attach workflow events for each application
      const appIds = apps.map((a) => a.id);
      const events = appIds.length > 0
        ? await db.select().from(pilotWorkflowLog)
            .where(inArray(pilotWorkflowLog.pilotApplicationId, appIds))
            .orderBy(pilotWorkflowLog.eventAt)
        : [];

      const eventsByApp = new Map<string, (typeof events)[number][]>();
      for (const e of events) {
        if (!e.pilotApplicationId) continue;
        if (!eventsByApp.has(e.pilotApplicationId)) eventsByApp.set(e.pilotApplicationId, []);
        eventsByApp.get(e.pilotApplicationId)!.push(e);
      }

      const result = apps.map((a) => ({
        ...a,
        banks: (() => { try { return JSON.parse(a.banks); } catch { return [a.banks]; } })(),
        workflow: eventsByApp.get(a.id) || [],
      }));

      return res.json({
        ok: true,
        applications: result,
        total: Number(countResult[0]?.count || 0),
        limit,
        offset,
      });
    } catch (err) {
      console.error("[pilot/applications] fetch failed:", err);
      return res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  // POST /api/pilot/approve — approve an application (admin only)
  app.post("/api/pilot/approve", isAuthenticated, isAdmin, async (req: any, res: Response) => {
    const schema = z.object({
      pilot_application_id: z.string().min(1),
      pilot_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
    });

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid request" });
    }
    const { pilot_application_id, pilot_start_date } = parsed.data;

    // Calculate end date (start + 21 days)
    const start = new Date(pilot_start_date);
    const end = new Date(start);
    end.setDate(end.getDate() + 21);
    const pilot_end_date = end.toISOString().slice(0, 10);

    const approvedBy = req.user?.claims?.email || "admin";

    try {
      const updated = await db.update(pilotApplications)
        .set({
          pilotStatus: "approved",
          pilotStartDate: pilot_start_date,
          pilotEndDate: pilot_end_date,
          approvedAt: new Date(),
          approvedBy,
          updatedAt: new Date(),
        })
        .where(eq(pilotApplications.id, pilot_application_id))
        .returning();

      if (!updated.length) {
        return res.status(404).json({ message: "Application not found" });
      }

      await logWorkflowEvent({
        policyAcknowledgmentId: updated[0].policyAcknowledgmentId,
        pilotApplicationId: pilot_application_id,
        eventType: "approved",
        stage: "application",
        triggeredBy: approvedBy,
      });

      console.log(`[pilot/approve] app_id=${pilot_application_id} by=${approvedBy} start=${pilot_start_date}`);

      return res.json({
        ok: true,
        pilot_start_date,
        pilot_end_date,
        approved_by: approvedBy,
      });
    } catch (err) {
      console.error("[pilot/approve] failed:", err);
      return res.status(500).json({ message: "Failed to approve application" });
    }
  });
}

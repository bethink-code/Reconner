import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  buildPilotApplicationConfirmation,
  buildPilotApplicationNotification,
  encodeHeaderWord,
  getAccessToken,
  sendEmail,
  FROM_ADDRESS,
  FROM_DISPLAY,
  NOTIFICATION_RECIPIENTS,
  type PilotApplication,
} from "./email";

// Public "apply for the pilot" form — served from the marketing site (lekana.app).
// No authentication: this is how prospective businesses ask to join the pilot.
// The richer sibling of /api/request-access (which the in-app login flip card
// still uses); both send via the same Gmail API path.
//
// On submit we send TWO emails (as garth@bethink.co.za):
//   1. Owner notification -> garth@ + pieter@ (sent first so a lead is never lost).
//   2. Applicant confirmation -> the email they submitted.

const BANKS = ["FNB", "ABSA", "Standard Bank", "Nedbank", "Other"] as const;

const applicationSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  business: z.string().trim().min(1, "A business name is required").max(200),
  email: z.string().trim().email("A valid email is required").max(200),
  cell: z.string().trim().min(1, "A cell number is required").max(40),
  sites: z.coerce.number().int("Number of sites must be a whole number").min(1, "At least one site is required"),
  pos_system: z.string().trim().min(1, "Tell us which POS or fuel system you use").max(200),
  banks: z.array(z.enum(BANKS)).min(1, "Choose at least one bank"),
  success_definition: z.string().trim().min(1, "Tell us what success looks like").max(500),
  terms_accepted: z.literal(true, {
    errorMap: () => ({ message: "Please confirm you have read the pilot terms" }),
  }),
});

type ApplicationInput = z.infer<typeof applicationSchema>;

async function dispatchEmails(application: PilotApplication): Promise<void> {
  const token = await getAccessToken();

  // 1. Owner notification first — never lose the lead if the auto-reply fails.
  await sendEmail(token, {
    from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    to: NOTIFICATION_RECIPIENTS.join(", "),
    replyTo: `${encodeHeaderWord(application.name)} <${application.email}>`,
    subject: `New lekana pilot application from ${application.business}`,
    html: buildPilotApplicationNotification(application),
  });

  // 2. Auto-reply confirmation to the applicant.
  await sendEmail(token, {
    from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    to: application.email,
    subject: "Thanks for applying to the lekana pilot",
    html: buildPilotApplicationConfirmation(application),
  });
}

/** Map a submission (snake_case form fields) into the PilotApplication shape. */
function toApplication(input: ApplicationInput): PilotApplication {
  return {
    name: input.name,
    business: input.business,
    email: input.email,
    cell: input.cell,
    sites: input.sites,
    posSystem: input.pos_system,
    banks: input.banks,
    successDefinition: input.success_definition,
  };
}

export function registerPilotApplicationRoutes(app: Express): void {
  // Tighter than request-access: 3 submissions per IP per hour (per brief §11.1).
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, errors: { form: "Too many requests. Please try again later." } },
  });

  app.post("/api/pilot-application", limiter, async (req: Request, res: Response) => {
    const parsed = applicationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      // Field-keyed errors so the form can render them inline (brief §11.1).
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!errors[key]) errors[key] = issue.message;
      }
      return res.status(400).json({ ok: false, errors });
    }

    const application = toApplication(parsed.data);

    // Log before sending so a submission is never lost if email delivery fails.
    console.log(
      `[pilot-application] ${application.name} <${application.email}> business=${application.business} sites=${application.sites} banks=${application.banks.join("/")}`,
    );

    try {
      await dispatchEmails(application);
    } catch (err) {
      console.error("[pilot-application] email delivery failed:", err);
      return res.status(502).json({
        ok: false,
        errors: { form: "Could not send your application. Please email pieter@bethink.co.za directly." },
      });
    }

    return res.json({
      ok: true,
      message: "Application received. Pieter will be in touch on WhatsApp within 24 hours.",
    });
  });
}

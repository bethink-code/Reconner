import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  buildAccessRequestConfirmation,
  buildAccessRequestNotification,
  encodeHeaderWord,
  sendEmail,
  type AccessRequest,
} from "./email";

// Public "request access" form — served from the marketing site (lekana.app)
// and the in-app login back-face. No authentication: this is how prospective
// customers reach us before they have an account.
//
// On submit we send TWO emails via the Gmail API (as garth@bethink.co.za):
//   1. Owner notification → garth@ + pieter@ (sent first so a lead is never
//      lost if the auto-reply fails).
//   2. Requester confirmation → the email they submitted.
// See scripts/generate-gmail-refresh-token.ts to (re)mint the refresh token.

const submissionSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(200),
  cell: z.string().trim().min(1, "A cell number is required").max(40),
  business: z.string().trim().max(200).optional().default(""),
});

// Named GMAIL_* to avoid confusion with GOOGLE_CLIENT_ID/SECRET, which are
// the user-login OAuth client used by server/auth.ts — a different client.
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

const FROM_DISPLAY = "lekana";
const FROM_ADDRESS = process.env.REQUEST_ACCESS_FROM_ADDRESS || "garth@bethink.co.za";
const NOTIFICATION_RECIPIENTS = (process.env.REQUEST_ACCESS_TO || "garth@bethink.co.za,pieter@molo.page")
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);

// Mint a short-lived Gmail access token from the long-lived refresh token.
async function getAccessToken(): Promise<string> {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error("Gmail OAuth env vars are not configured");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(`Token refresh failed (${response.status}): ${data.error || "no access_token"}`);
  }
  return data.access_token;
}

async function dispatchEmails(request: AccessRequest): Promise<void> {
  const token = await getAccessToken();

  // 1. Owner notification first — never lose the lead if the auto-reply fails.
  await sendEmail(token, {
    from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    to: NOTIFICATION_RECIPIENTS.join(", "),
    replyTo: `${encodeHeaderWord(request.name)} <${request.email}>`,
    subject: `New lekana access request from ${request.name}`,
    html: buildAccessRequestNotification(request),
  });

  // 2. Auto-reply confirmation to the requester.
  await sendEmail(token, {
    from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    to: request.email,
    subject: "Thanks for your interest in lekana",
    html: buildAccessRequestConfirmation(request),
  });
}

export function registerRequestAccessRoutes(app: Express): void {
  // Stricter than the global API limiter: 10 submissions per IP per hour.
  // Tight enough for abuse, loose enough that one mistype + retry doesn't
  // burn the budget for an honest user.
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many requests. Please try again later." },
  });

  app.post("/api/request-access", limiter, async (req: Request, res: Response) => {
    const parsed = submissionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || "Invalid submission";
      return res.status(400).json({ ok: false, error: message });
    }

    const data = parsed.data;

    // Log before sending so a submission is never lost if email delivery fails.
    console.log(
      `[request-access] ${data.name} <${data.email}> cell=${data.cell} business=${data.business || "-"}`,
    );

    try {
      await dispatchEmails(data);
    } catch (err) {
      console.error("[request-access] email delivery failed:", err);
      return res.status(502).json({
        ok: false,
        error: "Could not send your request. Please email garth@bethink.co.za directly.",
      });
    }

    return res.json({ ok: true });
  });
}

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

// Public "request access" form — served from the marketing site (lekana.app)
// and the in-app login back-face. No authentication: this is how prospective
// customers reach us before they have an account.

const submissionSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(200),
  cell: z.string().trim().min(1, "A cell number is required").max(40),
  business: z.string().trim().max(200).optional().default(""),
});

type Submission = z.infer<typeof submissionSchema>;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.REQUEST_ACCESS_FROM || "lekana <noreply@lekana.app>";
const TO = (process.env.REQUEST_ACCESS_TO || "garth@bethink.co.za,pieter@molo.page")
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);

// Sends the notification email via Resend's REST API. Using fetch directly
// avoids pulling in the Resend SDK for a single call.
async function sendNotification(data: Submission): Promise<void> {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const text = [
    "New lekana access request",
    "",
    `Name:     ${data.name}`,
    `Email:    ${data.email}`,
    `Cell:     ${data.cell}`,
    `Business: ${data.business || "-"}`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: TO,
      reply_to: data.email,
      subject: `lekana access request — ${data.name}`,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend responded ${response.status}: ${body}`);
  }
}

export function registerRequestAccessRoutes(app: Express): void {
  // Stricter than the global API limiter: 3 submissions per IP per hour.
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
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
      await sendNotification(data);
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

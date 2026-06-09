import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  buildContactConfirmation,
  buildContactNotification,
  encodeHeaderWord,
  getAccessToken,
  sendEmail,
  FROM_ADDRESS,
  FROM_DISPLAY,
  NOTIFICATION_RECIPIENTS,
  type ContactMessage,
} from "./email";
import { db } from "./db";
import { leads } from "../shared/schema";

// Public "contact us" form — served from the marketing site (lekana.app).
// No authentication: this is how anyone (not only prospective customers) can
// reach us for general questions, separate from the access-request flow.
//
// On submit we send TWO emails via the Gmail API (as garth@bethink.co.za):
//   1. Owner notification → garth@ + pieter@ (sent first so a message is never
//      lost if the auto-reply fails).
//   2. Sender confirmation → the email they submitted.
// See scripts/generate-gmail-refresh-token.ts to (re)mint the refresh token.

const messageSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(200),
  message: z.string().trim().min(1, "A message is required").max(4000),
});

async function dispatchEmails(contact: ContactMessage): Promise<void> {
  const token = await getAccessToken();

  // 1. Owner notification first — never lose the message if the auto-reply fails.
  await sendEmail(token, {
    from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    to: NOTIFICATION_RECIPIENTS.join(", "),
    replyTo: `${encodeHeaderWord(contact.name)} <${contact.email}>`,
    subject: `New contact message from ${contact.name}`,
    html: buildContactNotification(contact),
  });

  // 2. Auto-reply confirmation to the sender.
  await sendEmail(token, {
    from: `${FROM_DISPLAY} <${FROM_ADDRESS}>`,
    to: contact.email,
    subject: "Thanks for getting in touch with lekana",
    html: buildContactConfirmation(contact),
  });
}

export function registerContactRoutes(app: Express): void {
  // Same tight limit as request-access: 10 submissions per IP per hour.
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many requests. Please try again later." },
  });

  app.post("/api/contact", limiter, async (req: Request, res: Response) => {
    const parsed = messageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message || "Invalid submission";
      return res.status(400).json({ ok: false, error: message });
    }

    const data = parsed.data;

    // Log before sending so a message is never lost if email delivery fails.
    console.log(`[contact] ${data.name} <${data.email}> message=${data.message.slice(0, 80)}`);

    try {
      await dispatchEmails(data);
    } catch (err) {
      console.error("[contact] email delivery failed:", err);
      return res.status(502).json({
        ok: false,
        error: "Could not send your message. Please email garth@bethink.co.za directly.",
      });
    }

    // Fire-and-forget: persist to leads pipeline so nothing gets lost in email.
    db.insert(leads)
      .values({ name: data.name, email: data.email, source: "website_contact", notes: data.message })
      .catch((err) => console.error("[contact] lead insert failed:", err));

    return res.json({ ok: true });
  });
}

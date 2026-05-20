import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";

// Public "request access" form — served from the marketing site (lekana.app)
// and the in-app login back-face. No authentication: this is how prospective
// customers reach us before they have an account.
//
// Delivery uses the Gmail API: the server holds a long-lived refresh token
// for a Google account (currently garth@bethink.co.za) and sends mail "as"
// that user. See scripts/generate-gmail-refresh-token.ts to (re)generate
// the refresh token if it's ever revoked.

const submissionSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(200),
  cell: z.string().trim().min(1, "A cell number is required").max(40),
  business: z.string().trim().max(200).optional().default(""),
});

type Submission = z.infer<typeof submissionSchema>;

// Named GMAIL_* to avoid confusion with GOOGLE_CLIENT_ID/SECRET, which are
// the user-login OAuth client used by server/auth.ts — a different client.
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const FROM = process.env.REQUEST_ACCESS_FROM || "lekana <garth@bethink.co.za>";
const TO = (process.env.REQUEST_ACCESS_TO || "garth@bethink.co.za,pieter@molo.page")
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

function buildRfc822(data: Submission): string {
  const subject = `lekana access request — ${data.name}`;
  return [
    `From: ${FROM}`,
    `To: ${TO.join(", ")}`,
    `Reply-To: ${data.email}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    `New lekana access request`,
    ``,
    `Name:     ${data.name}`,
    `Email:    ${data.email}`,
    `Cell:     ${data.cell}`,
    `Business: ${data.business || "-"}`,
  ].join("\r\n");
}

// Gmail API requires the raw RFC 822 message base64url-encoded.
function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendNotification(data: Submission): Promise<void> {
  const accessToken = await getAccessToken();
  const raw = base64UrlEncode(buildRfc822(data));
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gmail send responded ${response.status}: ${body}`);
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

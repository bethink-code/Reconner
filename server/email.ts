// Email rendering for transactional messages from lekana.
//
// Templates are MSO-compatible HTML files under email-templates/, with
// {{PLACEHOLDER}} tokens substituted at render time. Templates and helpers
// were lifted from the Bethink Astro site (the established pattern in
// the wider product family) and adapted for the lekana access-request flow.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, "email-templates");

const confirmationTemplate = readFileSync(
  join(TEMPLATE_DIR, "access-request-confirmation.html"),
  "utf8",
);
const notificationTemplate = readFileSync(
  join(TEMPLATE_DIR, "access-request-notification.html"),
  "utf8",
);
const contactConfirmationTemplate = readFileSync(
  join(TEMPLATE_DIR, "contact-confirmation.html"),
  "utf8",
);
const contactNotificationTemplate = readFileSync(
  join(TEMPLATE_DIR, "contact-notification.html"),
  "utf8",
);
const pilotConfirmationTemplate = readFileSync(
  join(TEMPLATE_DIR, "pilot-application-confirmation.html"),
  "utf8",
);
const pilotNotificationTemplate = readFileSync(
  join(TEMPLATE_DIR, "pilot-application-notification.html"),
  "utf8",
);

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? "");
}

/** RFC 2047 encodes a header value if it contains non-ASCII characters. */
export function encodeHeaderWord(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

/** Submission timestamp in the business's timezone, for owner notifications. */
function johannesburgTimestamp(): string {
  return new Date().toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "long",
    timeStyle: "short",
  });
}

/** Render submitted [question, answer] pairs into the notification {{RESPONSE}} block. */
function renderAnswers(answers: ReadonlyArray<readonly [string, string]>): string {
  return answers
    .map(([question, answer]) => `<strong>${escapeHtml(question)}</strong><br/>${escapeHtml(answer)}`)
    .join("<br/><br/>");
}

export interface AccessRequest {
  name: string;
  email: string;
  cell: string;
  business: string;
}

/** Requester-facing auto-reply confirming the access request was received. */
export function buildAccessRequestConfirmation(request: AccessRequest): string {
  return render(confirmationTemplate, {
    CLIENT_NAME: escapeHtml(request.name),
  });
}

/** Owner-facing notification carrying the submitted request. */
export function buildAccessRequestNotification(request: AccessRequest): string {
  return render(notificationTemplate, {
    LEAD_DATE: escapeHtml(johannesburgTimestamp()),
    RESPONSE: renderAnswers([
      ["Name", request.name],
      ["Email", request.email],
      ["Cell (for WhatsApp)", request.cell],
      ["Business and number of sites", request.business || "(not given)"],
    ]),
  });
}

// --- Contact-form messages ---------------------------------------------------

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

/** Requester-facing auto-reply confirming the contact message was received. */
export function buildContactConfirmation(contact: ContactMessage): string {
  return render(contactConfirmationTemplate, {
    CLIENT_NAME: escapeHtml(contact.name),
  });
}

/** Owner-facing notification carrying the submitted contact message. */
export function buildContactNotification(contact: ContactMessage): string {
  return render(contactNotificationTemplate, {
    LEAD_DATE: escapeHtml(johannesburgTimestamp()),
    RESPONSE: renderAnswers([
      ["Name", contact.name],
      ["Email", contact.email],
      ["Message", contact.message],
    ]),
  });
}

// --- Pilot applications ------------------------------------------------------

export interface PilotApplication {
  name: string;
  business: string;
  email: string;
  cell: string;
  sites: number;
  posSystem: string;
  banks: string[];
  successDefinition: string;
}

/** Applicant-facing auto-reply confirming the pilot application was received. */
export function buildPilotApplicationConfirmation(application: PilotApplication): string {
  return render(pilotConfirmationTemplate, {
    CLIENT_NAME: escapeHtml(application.name),
  });
}

/** Owner-facing notification carrying the submitted pilot application. */
export function buildPilotApplicationNotification(application: PilotApplication): string {
  return render(pilotNotificationTemplate, {
    LEAD_DATE: escapeHtml(johannesburgTimestamp()),
    RESPONSE: renderAnswers([
      ["Name", application.name],
      ["Business", application.business],
      ["Email", application.email],
      ["Cell (for WhatsApp)", application.cell],
      ["Number of sites", String(application.sites)],
      ["POS / fuel management system", application.posSystem],
      ["Banks", application.banks.join(", ")],
      ["What success looks like", application.successDefinition],
    ]),
  });
}

// --- Gmail delivery ----------------------------------------------------------

// Sender identity, shared by every public form (request-access, contact).
// Named GMAIL_* to avoid confusion with GOOGLE_CLIENT_ID/SECRET, which are the
// user-login OAuth client used by server/auth.ts — a different client.
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

export const FROM_DISPLAY = "lekana";
export const FROM_ADDRESS = process.env.REQUEST_ACCESS_FROM_ADDRESS || "garth@bethink.co.za";
export const NOTIFICATION_RECIPIENTS = (
  process.env.REQUEST_ACCESS_TO || "garth@bethink.co.za,pieter@bethink.co.za"
)
  .split(",")
  .map((address) => address.trim())
  .filter(Boolean);

/** Mint a short-lived Gmail access token from the long-lived refresh token. */
export async function getAccessToken(): Promise<string> {
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

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/** Sends a single HTML email via the Gmail API using a pre-fetched access token. */
export async function sendEmail(accessToken: string, message: EmailMessage): Promise<void> {
  // Strip CR/LF from header values to prevent header injection.
  const safe = (value: string): string => value.replace(/[\r\n]/g, " ").trim();

  const headers = [
    `From: ${safe(message.from)}`,
    `To: ${safe(message.to)}`,
  ];
  if (message.replyTo) headers.push(`Reply-To: ${safe(message.replyTo)}`);
  headers.push(
    `Subject: ${encodeHeaderWord(safe(message.subject))}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "",
  );

  const raw = [...headers, message.html].join("\r\n");
  const encoded = Buffer.from(raw, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    },
  );
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gmail send responded ${response.status}: ${body}`);
  }
}

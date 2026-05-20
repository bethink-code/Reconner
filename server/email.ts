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
  const received = new Date().toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "long",
    timeStyle: "short",
  });

  const answers: ReadonlyArray<readonly [string, string]> = [
    ["Name", request.name],
    ["Email", request.email],
    ["Cell (for WhatsApp)", request.cell],
    ["Business and number of sites", request.business || "(not given)"],
  ];

  const response = answers
    .map(
      ([question, answer]) =>
        `<strong>${escapeHtml(question)}</strong><br/>${escapeHtml(answer)}`,
    )
    .join("<br/><br/>");

  return render(notificationTemplate, {
    LEAD_DATE: escapeHtml(received),
    RESPONSE: response,
  });
}

// --- Gmail delivery ----------------------------------------------------------

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

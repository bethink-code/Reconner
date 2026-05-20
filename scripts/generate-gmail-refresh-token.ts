// One-time script to generate a Gmail API refresh token for the server mailer.
//
// Usage (PowerShell):
//   $env:GMAIL_CLIENT_ID = "..."; $env:GMAIL_CLIENT_SECRET = "..."; npx tsx scripts/generate-gmail-refresh-token.ts
//   (or put both in .env)
//
// The OAuth client (in Google Cloud Console) must be a "Web application"
// type with exactly this redirect URI registered:
//
//   http://localhost:3000/oauth2callback
//
// What it does:
//   1. Prints a Google consent URL.
//   2. Spins up a local HTTP server on port 3000 to receive the redirect.
//   3. Exchanges the auth code for tokens and prints the refresh_token.
//
// After running, paste the printed values into the Vercel `lekana` project's
// env vars (Production), then redeploy. Treat the refresh token as a secret —
// do not commit it.

import "dotenv/config";
import http from "http";
import { URL } from "url";

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = "https://www.googleapis.com/auth/gmail.send";

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET in env / .env");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPE);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log("\n1. Open this URL in a browser and sign in as the account that should send the emails:\n");
console.log(authUrl.toString());
console.log("\n   (If you see an 'unverified app' warning: Advanced → Go to lekana (unsafe). One-time.)");
console.log("\n2. After consenting, you'll be redirected back here automatically.\n");

const server = http.createServer(async (req, res) => {
  if (!req.url || !req.url.startsWith("/oauth2callback")) {
    res.writeHead(404).end("Not found");
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`OAuth error: ${error}`);
    console.error(`\nOAuth error: ${error}`);
    server.close();
    process.exit(1);
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing code");
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID!,
        client_secret: CLIENT_SECRET!,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = (await tokenResponse.json().catch(() => ({}))) as {
      refresh_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenResponse.ok) {
      throw new Error(`Token exchange failed (${tokenResponse.status}): ${tokenData.error_description || tokenData.error || "unknown"}`);
    }

    if (!tokenData.refresh_token) {
      throw new Error(
        "No refresh_token in response. This usually means consent was already granted earlier. " +
        "Revoke at https://myaccount.google.com/permissions and try again.",
      );
    }

    res
      .writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      .end(
        `<!doctype html><html><head><meta charset="utf-8"><title>Done</title></head>` +
        `<body style="font-family: system-ui; padding: 2rem; max-width: 480px;">` +
        `<h2 style="margin-top:0;">Refresh token captured</h2>` +
        `<p>Check your terminal for the value. You can close this tab.</p>` +
        `</body></html>`,
      );

    console.log("\n=== SUCCESS ===");
    console.log("Set these three env vars on the lekana Vercel project (Production):\n");
    console.log(`  GMAIL_CLIENT_ID=${CLIENT_ID}`);
    console.log(`  GMAIL_CLIENT_SECRET=${CLIENT_SECRET}`);
    console.log(`  GMAIL_REFRESH_TOKEN=${tokenData.refresh_token}`);
    console.log("\nTreat the refresh token as a secret. Do not commit it. Then redeploy the app.\n");

    server.close();
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end(`Error: ${err.message}`);
    console.error("\nError:", err.message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Local callback server listening on http://localhost:${PORT}\n`);
});

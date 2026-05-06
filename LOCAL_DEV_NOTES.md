# Local Dev Notes

Short note to make local startup easier, especially inside the Codex desktop app.

## Standard startup

```bash
npm install
npm run dev
```

Open [http://localhost:5000](http://localhost:5000).

This project expects:

- `PORT=5000`
- `NODE_ENV=development`
- a working `.env`
- network access to the hosted dev database and Google auth

## Quick verification

Do not rely only on the process-launch message.

Use these checks instead:

1. Open `http://localhost:5000` and confirm the app shell loads.
2. Hit `/api/auth/user`.
3. A `401 Unauthorized` response before login is expected and means the server is up.

## Codex desktop quirk

When running inside the Codex desktop app, background process launch plus the in-app browser flow can be flaky.

What worked on May 6, 2026:

1. Start the dev server.
2. Open `http://localhost:5000` manually in the in-app browser.
3. Verify the page responds before assuming startup failed.

In other words: if the browser flow looks buggy, check the local URL directly before debugging the app itself.

## Project-specific reminders

- After any server-side code change, run `npm run build:api`.
- The committed Vercel bundle is `api/index.mjs`.
- Local auth callback should be `http://localhost:5000/api/callback`.

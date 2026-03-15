# lekana — Project Guide

## Quick Start
```bash
npm install
npm run dev          # Start local dev server on port 5000
npm run build:api    # Rebuild Vercel API bundle (REQUIRED after server changes)
npm run db:push      # Push schema changes to database
```

## Architecture
- **Frontend:** React 18 + Vite + Tailwind CSS + Radix UI (in `client/`)
- **Backend:** Express + Drizzle ORM + Neon PostgreSQL (in `server/`)
- **Auth:** Google OAuth (OIDC) via `server/auth.ts`
- **Hosting:** Vercel (static frontend + serverless API)

## Important Conventions
- Server imports use **relative paths** (`../shared/schema`), NOT `@shared` aliases
- Client imports can use `@/` and `@shared/` aliases (resolved by Vite)
- After ANY server-side code change, run `npm run build:api` to rebuild `api/index.mjs`
- The `api/index.mjs` file is committed to git (pre-bundled for Vercel)
- Use `cross-env` in npm scripts for Windows compatibility

## Database
- **Dev:** Neon `dev` branch — used with `NODE_ENV=development`
- **Prod:** Neon `main` branch — used on Vercel with `NODE_ENV=production`
- Schema defined in `shared/schema.ts`, pushed with `npm run db:push`

## Deployment
- Push to `main` triggers Vercel auto-deploy
- Env vars configured in Vercel dashboard
- Google OAuth callback: `https://reconner.vercel.app/api/callback`

## Key Files
| File | Purpose |
|---|---|
| `server/auth.ts` | Google OAuth setup |
| `server/routes.ts` | All API routes |
| `server/storage.ts` | Database queries |
| `server/api.ts` | Source for Vercel serverless function |
| `api/index.mjs` | Pre-bundled Vercel function |
| `shared/schema.ts` | Drizzle schema + types |
| `.env.example` | Environment variable template |

# Admin Console restore + Pricing/Viability Calculator

_Last updated: 2026-05-25. Lives on `main`, deployed to `work.lekana.app`._

This document is the handoff for two pieces of work that shipped together: a **fix
to the admin console** and a new **internal pricing/viability calculator**. It's
written so a developer (or Pieter) opening the project cold can understand and
extend it.

---

## 1. Admin console backend was restored (a regression fix)

**What was wrong:** the reconciliation routes refactor (commit `985c6c4`) split the
old monolithic `server/routes.ts` into per-domain modules, but the **admin and
organization route handlers were dropped** in the process. The client
(`client/src/pages/Admin.tsx`) still called them, and the page's access gate keys
off `/api/admin/users` — so when that 404'd, the whole console showed **"Access
Denied"** to everyone, including platform owners. It was broken in production.

The **storage layer was never touched** (`getAllUsers`, `createOrganization`, etc.
all still existed) — only the route layer went missing.

**The fix:** the ~18 handlers were restored verbatim into two new modules,
registered in `server/routes.ts`:

- `server/adminRoutes.ts` — `/api/admin/*`: users, invites, access-requests,
  security-overview, audit-logs, ai-usage.
- `server/organizationRoutes.ts` — `/api/organizations*`: org CRUD + members.

> **Branch note:** `feature/lekana-rebrand` is an *old ancestor* of `main` (March),
> not newer work. It still has the admin routes inline because it predates the
> refactor. **Build on `main`** — it's what Vercel deploys.

---

## 2. The pricing/viability calculator

An internal tool for the two platform owners (Garth + Pieter) to model Lekana's
pricing and viability. It's a **standalone vanilla-JS/HTML model** embedded in the
Admin console behind a platform-owner gate — deliberately *not* rebuilt in React,
so the (already-validated) finance math is left untouched.

### Where things live

| Concern | File |
|---|---|
| The tool itself (HTML + inline CSS/JS) | `server/pricing-tool/lekana-viability.html` |
| Server routes (gated) | `server/pricingRoutes.ts` |
| Platform-owner guard | `isPlatformOwner` in `server/routeAccess.ts` |
| DB table + types | `pricingScenarios` in `shared/schema.ts` |
| Storage CRUD | `getPricingScenarios` / `createPricingScenario` / `deletePricingScenario` in `server/storage.ts` |
| Admin tab (React) | `client/src/components/admin/PricingTab.tsx` + a "Pricing" tab in `Admin.tsx` |
| Bundle copy step | `build-api.mjs` copies `server/pricing-tool/*.html` → `api/pricing-tool/` |

### How it's served and gated

- `GET /api/admin/pricing-tool` returns the HTML, behind `isAuthenticated` +
  `isPlatformOwner`. The financials must never be publicly reachable, so the tool
  is **not** a static client asset.
- `PricingTab.tsx` embeds it in a **same-origin iframe**, so the session cookie
  flows and the gate applies. It's the default-landing **Summary** that loads.
- The route sets a **scoped Content-Security-Policy** on its own response. Helmet's
  production default (`default-src 'self'`) would block the tool's inline
  `<script>`/`<style>` and Google Fonts; the relaxed CSP is scoped to this one
  gated, hand-authored document only.

### Scenarios — the data model

Saved scenarios live in the `pricing_scenarios` table (`inputs` is `jsonb`) and are
**shared between both platform owners** — not tenant-scoped (this is company
strategy data, gated by `isPlatformOwner`). API: `GET/POST/DELETE
/api/admin/pricing-scenarios`.

Inside the tool, the model is **document-style** (view → edit → save-as-new):

- **View (default):** pick a scenario from one picker — presets *and* saved
  scenarios in one list. It renders read-only; you can't accidentally change it.
- **Edit:** the **Edit** button reveals the input editors (Team / Pricing /
  Segments / …); they work from any tab. Badge shows "Editing — unsaved draft."
- **Save:** creates a **new** named scenario (name pre-fills "X v2", overridable).
  The original is never mutated.

Built-in scenarios = the **Baseline** (`DEFAULT_INPUTS`) + the named **presets**
(`PRESETS`: currently *Premium niche* and *Balanced recommendation* — two, not
three). The live working draft persists per-browser (`lekana_inputs`); the
view/edit state in `lekana_session`; saved scenarios in the DB.

### The cost + growth engine (economies of scale)

The model is **station-aware**, since the business steers by service stations:

- **Cost — economies of scale.** Support is *not* a flat per-customer charge. Ops
  headcount = `total stations ÷ stations_per_ops_person`, costed at the
  customer-success rate × `ops_hours_per_month`. So support cost steps up at
  capacity boundaries instead of rising linearly — per-station cost falls as you
  grow (verified: ~R13k/station at 15 stations → ~R1.7k at 610). Raise
  `stations_per_ops_person` to model tooling/efficiency gains.
- **Acquisition — accelerating.** Organic adds start at `new_customers_per_month`
  (month 1) and compound by `acquisition_growth_pct` each month ("steam"); 0% =
  flat. The old hard 20/month cap is gone.
- **Big-partner / reseller deal.** `partner_stations` (a typed value) lands in
  `partner_month` as a one-off lump, revenue discounted by `partner_discount_pct`
  (20% baseline — they resell). Tracked as a separate cohort so only their
  revenue is discounted.

These live in `computeModel` (cost) and `compute12Month` (growth) in the tool
HTML. There's a quick way to sanity-check changes without a browser: slice the
constants…`computeSensitivity` out of the `<script>` and run them in Node (that's
how the engine above was verified — economies of scale, the partner lump, and the
accelerating ramp).

### The Summary tab (no LLM)

The landing **Summary** is generated **deterministically in the browser** from the
model — `compute12Month()`, `computeModel()`, `computeSensitivity()` — via
threshold/template logic in `renderSummary()`. It shows: a viability verdict, the
month-12 bottom-line numbers, a **"What this scenario assumes"** block (business
mix / pricing / cost model), what's working vs dragging, and the biggest lever.

**No LLM is used, by design.** The words are computed from the same numbers on
screen (so they can't drift), it's instant and free, and — critically — no internal
financial data is ever sent to an external service. If an AI-written narrative is
ever wanted, it must be a separate, opt-in feature with its own guardrails.

---

## 3. Extending it

- **Add a preset:** add an entry to the `PRESETS` object in
  `server/pricing-tool/lekana-viability.html` (a delta on `DEFAULT_INPUTS`). It
  appears automatically in the scenario picker and Summary.
- **Change the model math:** edit `computeModel` / `compute12Month` /
  `computeSensitivity` in the same file. The Summary narrative reads their outputs.
- **Tune the Summary wording/thresholds:** `renderSummary()` in the same file.
- After any change to that HTML (or any server `.ts`): run **`npm run build:api`**
  so the Vercel bundle (`api/index.mjs` and `api/pricing-tool/`) is regenerated,
  then commit the regenerated files.

---

## 4. Deploy & ops

- **App build:** `npm run build:api` rebuilds `api/index.mjs` (committed,
  pre-bundled for Vercel) and copies the tool HTML into `api/pricing-tool/`.
- **DB migrations:** `npm run db:push` targets whatever `DATABASE_URL` `.env`
  points at (dev). For **prod**, pull the prod connection string with
  `vercel env pull` — **never** paste a prod `DATABASE_URL` into a chat/PR.
  Prod Neon branch host: `ep-ancient-forest-…`; dev: `ep-royal-credit-…`.
- **Access:** platform owners are set in `PLATFORM_OWNER_EMAILS` in
  `server/auth.ts` (`garth@bethink.co.za`, `pieter@molo.page`). The flag is granted
  automatically on the user's next login.
- **Gotcha:** stale local dev servers can squat on port 5000 and serve old code —
  if local probing gives weird 404s, kill the process holding `:5000` and restart.

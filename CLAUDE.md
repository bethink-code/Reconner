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

---

## Design System

### Three-Layer Colour Hierarchy

Every page uses exactly three background layers. Defined as CSS variables in `index.css` and Tailwind utilities in `tailwind.config.ts`.

| Layer | Tailwind Class | Hex | Purpose |
|-------|---------------|-----|---------|
| Page background | `bg-background` | `#EFEFE8` | Full-width page canvas |
| Section container | `bg-section` | `#F7F7F4` | Groups related content, max-width constrained |
| UI element | `bg-card` | `#FFFFFF` | Cards, inputs, active states — anything with focus |
| Footer | `bg-footer` | `#3C3C3C` | Dark footer bar |

**Rules:**
- Page bg is set ONCE on the page wrapper — nowhere else
- Section containers use `bg-section rounded-2xl p-6` — no border, background separation only
- UI elements use `bg-card rounded-xl` — can have border/shadow
- No inline `style={{ backgroundColor }}` — always use Tailwind classes
- No hardcoded hex colours for backgrounds — always use the variables

### Four-Tier Button System

Defined in `client/src/components/ui/button.tsx`:

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| `default` (Primary) | `#E8601C` | white | — | Main CTAs |
| `secondary` | `#FFFFFF` | `#3C3C3C` | `#EBEBEB` | Secondary actions |
| `outline` (Tertiary) | transparent | `#3C3C3C` | `#EBEBEB` | Tertiary actions |
| `ghost` (Text only) | transparent | `#3C3C3C` | none | Minimal/text links |

### Active Card State

For selectable cards (e.g., matching presets, side selectors):
- **Active:** `bg-card shadow-sm` + bottom accent line outside the card shape
- **Inactive:** `bg-transparent border border-border/50` + `hover:bg-card/50`
- Accent line: `absolute -bottom-0.5 left-4 right-4 h-0.5 rounded-full` in step colour

### Page Structure

```
<div>                              <!-- page: min-h-screen flex flex-col bg-background -->
  <header>                         <!-- white, sticky -->
  <div>                            <!-- stepper: per-step colour, full width -->
  <main>                           <!-- flex-1, full width, bg inherits from page -->
    <!-- sections own their max-width -->
    <div bg-section>               <!-- section: rounded-2xl, max-w-4xl mx-auto -->
      <div bg-card>                <!-- card: rounded-xl -->
    </div>
  </main>
  <footer>                         <!-- bg-footer, full width -->
</div>
```

All zones (header, stepper, main, footer) are **full width**. Only section containers are width-constrained.

---

## Client-Side Code Organisation

### Directory Structure

```
client/src/
├── pages/                    # Route-level pages
│   ├── ReconciliationFlow.tsx  # Main reconciliation wizard (steps 1-4)
│   ├── Dashboard.tsx           # Period list / home
│   ├── InvestigateTransactions.tsx  # Deep-link wrapper for Review/Investigate
│   ├── Admin.tsx, Landing.tsx, Convert.tsx
│
├── components/
│   ├── flow/                 # Reconciliation workflow components
│   │   ├── ResultsDashboard.tsx  # 5-tab shell (Summary/Transactions/Review/Investigate/Insights)
│   │   ├── ReviewTab.tsx         # Two-sided review with categorisation + case modal
│   │   ├── MatchedPairsTab.tsx   # Transaction pairs ledger with filters
│   │   ├── InvestigateTab.tsx    # Flagged items take-away list
│   │   ├── InsightsTab.tsx       # Reports: Detail, Attendants, Declined
│   │   ├── InvestigateModal.tsx  # Case modal: findings, matches, resolve/flag
│   │   ├── TransactionRow.tsx    # Reusable transaction display component
│   │   ├── FuelUploadStep.tsx    # Step 1: fuel data upload
│   │   ├── BankUploadStep.tsx    # Step 2: bank statement upload
│   │   ├── BankStatusScreen.tsx  # Step 2: bank selection landing
│   │   ├── ConfigureMatchingStep.tsx  # Step 3: matching rules
│   │   ├── WizardStepLayout.tsx  # Shared layout for upload steps
│   │   ├── AttendantReport.tsx   # Attendant performance report
│   │
│   └── ui/                   # Shadcn/ui component library
│       ├── info-card.tsx       # InfoCard: header/content/action card pattern
│       ├── button.tsx          # 4-tier button system
│       └── ...                 # Standard shadcn components
│
├── hooks/
│   ├── useInvalidateReconciliation.ts  # Shared mutation invalidation
│   ├── useAuth.ts                       # Auth context
│   └── use-toast.ts                     # Toast notifications
│
├── lib/
│   ├── format.ts               # formatRand, formatDate — shared formatters
│   ├── reconciliation-types.ts # PeriodSummary, CategorizedTransaction, etc.
│   ├── reconciliation-utils.ts # deriveSummaryStats — shared calculations
│   ├── queryClient.ts          # React Query setup (staleTime: Infinity)
│   ├── bankColors.ts           # Bank-specific colours
│   └── utils.ts                # cn() — Tailwind merge utility
```

### Shared Utilities — ALWAYS use these

| Utility | File | Instead of |
|---------|------|------------|
| `formatRand(amount)` | `lib/format.ts` | Any local `formatCurrency`, `formatRandExact`, `formatRand` |
| `formatDate(dateStr)` | `lib/format.ts` | Any local `formatDate` |
| `deriveSummaryStats(summary)` | `lib/reconciliation-utils.ts` | Inline calculations from PeriodSummary |
| `useInvalidateReconciliation(periodId)` | `hooks/useInvalidateReconciliation.ts` | Manual queryClient.invalidateQueries blocks |
| `<TransactionRow>` | `components/flow/TransactionRow.tsx` | Inline transaction display JSX |
| `<InfoCard>` | `components/ui/info-card.tsx` | Raw div cards with header/content/action pattern |

### Shared Types — defined once in `lib/reconciliation-types.ts`

- `PeriodSummary` — API response shape for period summary
- `PaginatedResponse` — paginated transaction query response
- `CategorizedTransaction` — transaction with match analysis
- `PotentialMatch` — candidate match with confidence score
- `TransactionInsight` — AI-generated insight (tip, overfill, etc.)
- `CATEGORY_LABELS` — display labels for categories

### Query Invalidation Pattern

After any mutation (match, resolve, flag, unmatch), call `invalidateAll()` from `useInvalidateReconciliation`. This invalidates:
- summary, transactions (all sub-keys), resolutions, matches, verification-summary

React Query's `staleTime: Infinity` means data only refetches when explicitly invalidated.

### Key Conventions

1. **Step components use `WizardStepLayout`** or render a `bg-section` div directly — never `<Card>` as a section
2. **`<Card>` is only for white UI elements** — never for section containers
3. **Every user action creates a resolution** — Link creates both a match AND a `linked` resolution, so Review tab counts are always accurate
4. **Bank and fuel are never merged** — always separate sections, separate queries, separate display
5. **Filter labels show the logged-in user's name** — not "Garth" or "User"

---

## Key Files

| File | Purpose |
|---|---|
| `server/auth.ts` | Google OAuth setup |
| `server/routes.ts` | All API routes |
| `server/storage.ts` | Database queries (IStorage interface) |
| `server/api.ts` | Source for Vercel serverless function |
| `api/index.mjs` | Pre-bundled Vercel function |
| `shared/schema.ts` | Drizzle schema + Zod types |
| `client/src/index.css` | CSS variables (colour hierarchy) |
| `tailwind.config.ts` | Tailwind theme (section, footer colours) |
| `.env.example` | Environment variable template |

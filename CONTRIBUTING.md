# Contributing to lekana

## Getting Started

```bash
git clone <repo>
npm install
cp .env.example .env    # Fill in your credentials
npm run dev             # http://localhost:5000
```

If you're running the project inside the Codex desktop app, see `LOCAL_DEV_NOTES.md` for a short note on local startup verification and a known in-app browser/background-launch quirk.

## Development Workflow

1. Make changes
2. If you are touching reconciliation logic, run `npm run verify:reconciliation` as you go
3. Run `npm run verify` before you wrap up
4. If you changed server code: `npm run build:api`
5. Test locally at `http://localhost:5000`
6. Commit with a descriptive message
7. Push to `main` - Vercel auto-deploys

## Code Standards

### Do

- Use `bg-background`, `bg-section`, `bg-card` for backgrounds (see CLAUDE.md for the 3-layer system)
- Use `formatRand()` and `formatDate()` from `@/lib/format` — never define local formatters
- Use `useInvalidateReconciliation()` after mutations — never inline invalidation
- Use `<TransactionRow>` for transaction displays — never hand-roll the same JSX
- Use `<InfoCard>` for header/content/action card patterns
- Use `deriveSummaryStats()` when computing from PeriodSummary — never inline the same math
- Import shared types from `@/lib/reconciliation-types` — never redefine them locally
- Keep bank and fuel data separate — never merge into one list

### Don't

- Don't use `<Card>` as a section container — use `<div className="bg-section rounded-2xl p-6">`
- Don't use inline `style={{ backgroundColor }}` — use Tailwind classes
- Don't hardcode hex colours for backgrounds — use the CSS variable classes
- Don't add `dark:bg-muted/30` or other manual dark mode overrides — the CSS variables handle it
- Don't define local `formatCurrency` / `formatRand` / `formatDate` functions
- Don't duplicate type definitions — add to `reconciliation-types.ts`

### Component Patterns

**Section container:**
```tsx
<div className="bg-section rounded-2xl p-6">
  {/* white cards inside */}
</div>
```

**White card:**
```tsx
<div className="bg-card rounded-xl p-4">
  {/* content */}
</div>
```

**Active selectable card:**
```tsx
<button className={cn(
  "relative rounded-xl p-4 transition-colors overflow-visible",
  isActive ? "bg-card shadow-sm" : "bg-transparent border border-border/50 hover:bg-card/50"
)}>
  {isActive && (
    <div className="absolute -bottom-0.5 left-4 right-4 h-0.5 rounded-full"
         style={stepColor ? { backgroundColor: stepColor } : undefined} />
  )}
</button>
```

**Transaction display:**
```tsx
<TransactionRow
  transaction={txn}
  onClick={() => openModal(txn.id)}
  badge={<Badge variant="outline">{label}</Badge>}
  subtitle={insight?.message}
  subtitleColor="text-[#B45309]"
/>
```

**Info card:**
```tsx
<InfoCard>
  <InfoCardLabel>Period Fuel Sales</InfoCardLabel>
  <InfoCardContent>...</InfoCardContent>
  <InfoCardAction>View details <ArrowRight /></InfoCardAction>
</InfoCard>
```

## Commit Messages

Follow this format:
```
Short summary of what changed (imperative mood)

- Bullet points for details
- What was added/changed/removed
- Why, if not obvious
```

## File Organisation

- **Pages** go in `client/src/pages/` — one per route
- **Flow components** go in `client/src/components/flow/` — reconciliation-specific
- **UI components** go in `client/src/components/ui/` — generic, reusable
- **Hooks** go in `client/src/hooks/` — shared stateful logic
- **Utilities** go in `client/src/lib/` — pure functions and types
- **Server routes** all live in `server/routes.ts`
- **Database queries** all live in `server/storage.ts`
- **Schema** lives in `shared/schema.ts`

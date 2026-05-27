# Reprint-Scam Insight — Scope & Handoff

**Status:** v1 build, 2026-05-27. Display-only. Built to be refined with Pieter over several rounds.

## Background — the fraud being detected

Desert Trading discovered an organised cashier/security-attendant fraud (the "phantom slip" / reprint
scam): a security attendant produces a stack of card slips, the cashier uses them at the till to claim
cash for "card-paid" fuel sales. The slips look authentic (no "REPRINT" marker) but never settle in the
merchant's acquirer. The reconciliation signature is **a fuel-side card sale with no matching bank record**,
and the population-level tell is **clusters of round amounts** (fakes prefer round amounts — the till stays
closed, no change to hand over).

Full design intent: the owner's heuristic note (memory `project_phantom_slip_fraud.md`).

## The architectural reframe (why this is safe)

A 2026-04-28 attempt baked this into the **matcher** (a round-amount FIFO stage + `phantom_suspect` tags
that changed match outcomes). It destabilised reconciliation and was rolled back (`72acefa`).

This rebuild is the opposite: a **read-only Insights report**. The matcher has already run and decided
match status. This report *reads that result and flags a pattern on top of it*. It cannot change a single
match, move an item in/out of Review, or destabilise a reconciliation. That isolation is the whole point.

## v1 scope — one signal: round-amount clusters

Operates on **fuel card sales** (`sourceType === "fuel" && isCardTransaction === "yes"`).

**"Round amount"** = within a cents tolerance of a multiple of R10. Not strictly `.00` — a phantom slip
might land at `.01` or `.99`. The tolerance is a tuned constant (default ±R0.05: catches `.00`–`.05` and
`.95`–`.99`, skips the natural `.10`/`.15`/`.20` pump-calibration-drift cents Pieter saw in real data).

**Two layered flags, both deterministic / LLM-free:**

1. **Same-day cluster** — a day with `minClusterSize`+ round-amount card sales. Includes matched AND
   unmatched members (the key System-C value: it shows the cluster even when individual slips matched the
   bank — the "5 reprints, matcher saw 1" gap). Matched/unmatched split shown per cluster; unmatched =
   strongest suspect.
2. **Suspect card-tail** — a masked card-tail appearing on `minCardTailReuse`+ round-amount card sales in
   the period (a rogue terminal may reuse/clone a card number).

All round-amount totals appear in the summary so nothing is hidden; only days meeting the cluster
threshold are surfaced as clusters (keeps it from being noise — lower the threshold to see more).

### Explicitly NOT in v1 (Simplicity First + the design note's "deliberately not built")
- Bank-side duplicate detection (one bank settlement claimed by N slips) — future report.
- Dismiss/confirm workflow — display-only; Pieter uses the report to confront the cashier.
- `.00`-cent population-rarity statistic — round 2, once the cluster view is validated.
- Any matcher change. None. Ever.

## The live filter (owner-driven, not a hidden setting)

What counts as a "round amount" **varies by station** — some sites ring up `.05` endings as normal. So
the cents tolerance is an **on-report filter the owner adjusts live** (Exact .00 / ±5c / ±10c / ±20c),
not a buried config value. The detection logic is a shared pure function (`shared/reprintScam.ts`,
`clusterReprints`) that runs in the browser, so adjusting the filter re-clusters instantly with no
re-fetch. The server sends the period's fuel-card *candidates*; the client filters and clusters them.

## The strongest signal — ranked to the top

Beyond "any round amount", the real tell is **the same exact amount, rung up by the same attendant +
cashier, repeated, with sales that never settled**. Those are grouped and ranked to the top of the report
("Strongest suspects"). An all-matched repeat is NOT a suspect — only groups with unsettled members
appear. This is what isolates the 1 May `3× R300.05 by Letlhogonolo/RETHABILE, no bank match` from the
noise of 30 ordinary round-ish sales.

## Tunable rules

Defaults in `DEFAULT_REPRINT_SCAM_RULES` (`shared/reprintScam.ts`). `roundCentsTolerance` is exposed as
the live control; the rest are code constants for now (expose later if Pieter wants them):

| Rule | Default | Meaning | Exposed in UI? |
|---|---|---|---|
| `roundDenomination` | 10 | Round amount = multiple of R10 | no |
| `roundCentsTolerance` | 0.05 | ± band around the R10 multiple (Rand) | **yes — live filter** |
| `minClusterSize` | 3 | N+ round-amount card sales on one day = a cluster | no |
| `minCardTailReuse` | 2 | Card-tail on N+ round-amount sales = suspect | no |
| `minRepeatSameAmount` | 2 | Same amount by same attendant+cashier, N+ times = suspect group | no |

Each signal is its own pure helper, so one can be tuned without disturbing the others.

## Files (the whole blast radius)

- `shared/reprintScam.ts` — pure detection: `clusterReprints()`, `isRoundAmount()`, rules, types,
  `ROUND_TOLERANCE_OPTIONS`. Runs server- AND client-side (the live filter recomputes in the browser).
- `server/insights/reprintScamReport.ts` — `extractReprintCandidates()` (fuel-card rows → candidates) +
  `buildReprintScamReadModel()` (candidates + default rules for the client)
- `shared/periodInsights.ts` — `reprints` field on `PeriodInsightsReadModel` (imports the shared type)
- `server/insights/insightsReadModel.ts` — call it; takes fuel transactions (already loaded by callers)
- `server/reconciliationReadRoutes.ts` + `server/exportRoutes.ts` — pass fuel transactions through
- `client/src/components/flow/ReprintScamReport.tsx` — render + live tolerance control; `useMemo` over
  `clusterReprints`
- `client/src/components/flow/InsightsTab.tsx` — landing card + view branch
- `tests/reconciliation/reprint-scam-report.test.ts` — fixtures: tolerance lever, strongest-suspects, clusters

## Verification

- `npm run verify:reconciliation` stays green (proof the core didn't move) + new report tests pass.
- `npm run build:api`.

## Refinement log (append per round with Pieter)

- _v1 (2026-05-27): initial build — round-amount day clusters + suspect card-tails, display-only._
- _v1.1 (2026-05-27, after Dev test on 1 May): `.05` endings are normal at the test station and were
  swamping the view (30 flagged). Two changes: (1) round-amount tolerance is now a **live on-report
  filter** (Exact/±5c/±10c/±20c), owner-judged in the moment — moved detection into a shared pure fn that
  re-clusters in the browser; (2) added a **"Strongest suspects"** section ranked to the top — same exact
  amount by same attendant+cashier, repeated, unsettled — to surface the real tell above the noise._

# Vertical adapters (fuel · retail) — design & status

**Status:** Phase 0 + matcher threading + retail presets done and verified (43/43). Retail
ingestion wiring, summary/review/insights threading, and UI vocabulary are deferred (below).
Started 2026-05-27, driven by real Bruchs Biltong data.

## The idea

Lekana is **one engine, many vocabularies**. The reconciliation core (sales ↔ bank matching) is
vocabulary-neutral; each business *type* is a declarative `VerticalAdapter` describing vocabulary,
which canonical fields it uses, which insight modules run, the `sourceType` its sales side carries,
and how matching differs. Verticals never depend on each other — only on the core. Adding a
retail-like vertical (e.g. a shoe shop) is a new descriptor, not new engine code.

Per-business file formats are **not** a vertical concern — they stay in each file's `columnMapping`
(the existing parse→preview→confirm onboarding). Variability is per-business; the vertical is the
thin interpretation layer above it.

## What's a vertical (`shared/verticals/`)

`VerticalAdapter` = `id`, `salesSideSourceType`, `vocabulary`, `fields`, `matching`, `insights`.
- **fuel** (`fuelAdapter`): salesSide `"fuel"`, attendant + pump, all four insights, **requires the
  card flag** (the fuel POS states card vs cash, so we pre-filter card sales).
- **retail** (`retailAdapter`): salesSide `"retail"`, cashier + no pump, overview + declines only,
  **does NOT require the card flag** (see below).

Registry + `getVertical(id)` in `shared/verticals/index.ts`. `properties.verticalId` (default
`"fuel"`) stores it per site. Server resolves via `resolveVertical(propertyId)` in `server/verticals.ts`.

## The retail matching difference (proven on real data)

Fuel pre-filters the sales side to `isCardTransaction === "yes"`. The **Loyverse receipts export has
no payment type**, so retail receipts are `"unknown"` — but the **Nedbank batch report IS the
definitive card list**. So retail matches *all* receipts to the bank settlements and a match
*derives* that the receipt was card; unmatched receipts are cash. This is the `requireCardFlag`
flag on `VerticalMatching`, threaded into `planAutoMatch` as `SalesSideConfig`.

On the real 25 Apr Bruchs Biltong overlap: **42/50 bank settlements matched receipt totals on exact
amount alone; 46/50 with a 5c tolerance + 30-min window.** The residue (≈4) is the genuine
investigate set (split tenders / card-with-no-sale). Receipts group from line-items by
`Receipt number` via the existing invoice-grouping (`groupByInvoice`).

## File presets added (`server/fileParser.ts` `SOURCE_PRESETS`)

- **Nedbank Merchant** (category `bank`): `Settle Amount`→amount, `Transaction Date`→date,
  `Retrieval Reference`→reference (RRN), `Card Number`→cardNumber.
- **Loyverse Receipts** (category `retail`): `Net sales`→amount, `Receipt number`→reference,
  `Date`→date, `Item`→description, `Cashier name`→cashier. (`category` union widened to add `retail`.)

## Verified

`npm run verify` (43/43, incl. `retail-reconciliation.test.ts` proving the tie-out and that the fuel
rule would match nothing) + `npm run build:api`. **Fuel behaviour is identical** — all pre-existing
tests still green.

## Threaded end-to-end (vertical-aware, fuel identical, verified)

Sales-side identity centralised: `SalesSideConfig` + `isSalesSideTransaction` in
`shared/verticals/types.ts`, resolved per request by `resolveVertical(propertyId)` →
`salesSideConfig()` (`server/verticals.ts`). The **upload → match** path now works for retail:

- **Matcher** — `planAutoMatch` (retail variant: no card pre-filter; **forces invoice grouping** so
  Loyverse line-items sum into the receipt total regardless of the per-period toggle).
- **Review/Investigate read model** + **insights/decline read handlers** — sales side by vertical.
- **Upload acceptance** — `dataQualityValidator` + `fileWorkflowRoutes` accept `sourceType: "retail"`;
  Loyverse + Nedbank presets detect & map.
- **Period API** (`GET /api/periods/:id`) returns `verticalId`; the client (`ReconciliationFlow`)
  resolves `getVertical()` and `FuelUploadStep` posts `sourceType = vertical.salesSideSourceType`.
- **Property create/edit** accept `verticalId` (validated via the registry → unknown/missing = fuel).

So: create a property with `verticalId: "retail"`, upload its Loyverse + Nedbank files, run
auto-match → receipts reconcile to card settlements. Proven in `retail-reconciliation.test.ts`.

## Deferred (NOT done — remaining)

1. **`getPeriodSummary` SQL (Phase 3).** `source_type = 'fuel'` is pervasive across MANY storage
   methods (not just the summary) and is **untested by the suite** (hits Postgres). More importantly
   the summary's *output shape* is fuel-specific (cardFuel/cashFuel/debtorFuel) — a vocabulary/semantics
   rework, not a blind swap. A retail period's **summary numbers read zero** until done;
   **matching/review/insights are unaffected.**
2. **Command service** (`isFuelTransaction`, line ~440) — manual link/match for retail would reject
   the sales-side tx ("not a fuel transaction"). Thread `SalesSideConfig` through `createManualMatch`/
   `createReviewLink` + the 3 write-route call sites.
3. **Categorised-transactions read handler** (`reconciliationReadRoutes` ~140/204/243) — display
   filters still key on `"fuel"`.
4. **UI vocabulary (Phase 3).** Labels still say "fuel" (upload step heading, insights cards, results
   tabs); client doesn't yet read `vertical.vocabulary`/`vertical.insights`. The plumbing exists
   (`getVertical(period.verticalId)` in `ReconciliationFlow`); it's a label sweep. Also a property-edit
   **vertical selector** (API accepts `verticalId`; no UI control yet).
5. **Parse robustness** for Loyverse `DD/MM/YYYY HH:MM` and Nedbank ISO datetime — validate via the
   upload preview when the real files are first loaded.

## To test the Bruchs Biltong files end-to-end
1. Create/edit a property with `verticalId: "retail"` (API now accepts it; or set in DB).
2. Make a period for it; upload the Loyverse receipts (sales step) + Nedbank batch (bank step).
3. Run auto-match → receipts should reconcile to settlements (expect ~42–46 of 50 on 25 Apr).
Summary numbers will read zero and labels will say "fuel" until the Phase-3 items above.

## Deploy note

`properties.verticalId` is a schema add → needs `db:push` (dev + prod) before deploy. Default
`'fuel'` means zero behaviour change for existing sites. Not yet committed.

/**
 * A vertical adapter describes ONE business type (fuel, retail, hospitality) as a declarative
 * descriptor — vocabulary, which canonical fields it uses, which insight modules run, and the
 * `sourceType` value its sales side carries. The reconciliation engine is generic (sales ↔ bank);
 * it reads "which source type is the sales side" and the vocabulary from here instead of hardcoding
 * "fuel". Verticals never depend on each other — only on the core.
 *
 * This is pure data: no engine logic, no per-business file formats (those stay in each file's
 * columnMapping). Adding a retail-like vertical (e.g. a shoe shop) is a new descriptor, not code.
 */

export type InsightModuleId = "overview" | "attendants" | "declines" | "reprint-scam" | "cash-gap";

/** A manual-review resolution reason offered in the case modal. */
export interface ResolutionReason {
  value: string;
  label: string;
}

export interface VerticalVocabulary {
  /** Business-type name, e.g. "Fuel station". */
  businessType: string;
  /** Display name of the sales side of the reconciliation, e.g. "Fuel" / "Sales". */
  salesSide: string;
  /** Singular sale noun, e.g. "fuel sale" / "sale". */
  saleSingular: string;
  /** Plural sale noun, e.g. "fuel sales" / "sales". */
  salePlural: string;
  /** Who handled the sale, e.g. "Attendant" / "Cashier". */
  staff: string;
  /** The dispensing/sale unit, e.g. "Pump"; null when the vertical has no such concept. */
  unit: string | null;
}

export interface VerticalFields {
  /** Which canonical column carries the staff name for this vertical. */
  staffField: "attendant" | "cashier";
  /** Whether the unit (pump/till) column is meaningful and shown. */
  showUnit: boolean;
}

/** Resolved sales-side matching config the engine + read models consume (from a VerticalAdapter). */
export interface SalesSideConfig {
  /** The transactions.sourceType value that is the sales side. */
  sourceType: string;
  /** Whether the sales side must be card-flagged to count (fuel) or not (retail). */
  requireCardFlag: boolean;
  /** Force grouping line-items by reference into one total (retail receipts), regardless of the
   *  per-period toggle. Loyverse exports one row per item; only the receipt total matches the bank. */
  forceInvoiceGrouping: boolean;
  /**
   * Whether the bank-side timestamp tracks the individual sale's time so that an intraday time
   * gap is a real matching signal. Fuel: true — card terminals settle in real time, so a same-day
   * sale and its bank line are minutes apart. Retail: false — the bank line is a once-a-day batch
   * settlement, so its time is unrelated to any one sale. When false, same-day matches are neither
   * scored nor rejected on intraday time difference (see VerticalMatching.intradayTimeSignal).
   */
  intradayTimeSignal: boolean;
}

/** Shared predicate: is this transaction the sales side for the given vertical config? */
export function isSalesSideTransaction(
  tx: { sourceType: string | null; isCardTransaction: string | null },
  salesSide: SalesSideConfig,
): boolean {
  return (
    tx.sourceType === salesSide.sourceType &&
    (!salesSide.requireCardFlag || tx.isCardTransaction === "yes")
  );
}

export interface VerticalMatching {
  /** Receipts arrive as line-items (retail) that must be grouped by reference before matching. */
  requiresInvoiceGrouping: boolean;
  /**
   * Whether the sales side must be flagged `isCardTransaction === "yes"` to be matchable.
   * Fuel: true — the fuel POS export states card vs cash, so we pre-filter card sales.
   * Retail: false — the POS export has no payment type, but the bank batch report IS the
   * definitive card list, so we match ALL receipts to it and a match *derives* that the
   * receipt was card (unmatched receipts are cash).
   */
  salesSideRequiresCardFlag: boolean;
  /**
   * Whether an intraday time gap between a same-day sale and its bank line is a real matching
   * signal. Fuel: true — card terminals settle in real time, so the gap discriminates good matches
   * and the matcher both scores by it (≤5min → 100% down to >30min → 75%) and hard-rejects gaps
   * beyond the close-match window. Retail: false — the bank line is a daily batch settlement whose
   * time is unrelated to any one sale, so the matcher ignores intraday time entirely (a same-day
   * match keeps its 85% base and is never rejected on time).
   */
  intradayTimeSignal: boolean;
}

export interface VerticalAdapter {
  /** Stable id, e.g. "fuel" | "retail". Stored on `properties.verticalId`. */
  id: string;
  /** The `transactions.sourceType` value the sales side carries for this vertical. */
  salesSideSourceType: string;
  vocabulary: VerticalVocabulary;
  fields: VerticalFields;
  matching: VerticalMatching;
  /**
   * Which summary view this vertical shows. The summary is vertical-SPECIFIC (a fuel owner and a
   * butcher want different headline numbers), so it's a per-vertical choice, not a generic page.
   * `"fuel"`/`"retail"` select the vertical's summary component; `null` = no summary (tab hidden).
   */
  summaryView: "fuel" | "retail" | null;
  /** Insight modules active for this vertical, in landing order. */
  insights: InsightModuleId[];
  /** Manual-review resolution reasons offered for this vertical (case modal dropdown). */
  resolutionReasons: ResolutionReason[];
}

import type { VerticalAdapter } from "./types.ts";
import { GENERIC_RESOLUTION_REASONS, OTHER_RESOLUTION_REASON } from "./reasons.ts";

/**
 * Retail vertical (butchery is the first real instance). Descriptor only for now — the Nedbank
 * bank preset and the butchery POS preset are added in Phase 2 from the real files.
 * No pump, staff is the cashier, and fuel-only insights (attendants, reprint-scam) are off.
 */
export const retailAdapter: VerticalAdapter = {
  id: "retail",
  salesSideSourceType: "retail",
  vocabulary: {
    businessType: "Retail",
    salesSide: "Sales",
    saleSingular: "sale",
    salePlural: "sales",
    cardSales: "card sales",
    staff: "Cashier",
    unit: null,
  },
  fields: {
    staffField: "cashier",
    showUnit: false,
  },
  matching: {
    requiresInvoiceGrouping: true,
    // The Loyverse Receipts export carries Payment type, so we DO know card vs cash up front —
    // pre-filter card sales (like fuel). Cash receipts are excluded from matching, not flagged.
    salesSideRequiresCardFlag: true,
    // Nedbank posts one batch settlement per day — its time is unrelated to any one sale, so
    // intraday time is noise here. Matching ignores it (same-day stays 85%, never time-rejected).
    intradayTimeSignal: false,
  },
  // Retail summary: total takings = card + cash, with card reconciled to the bank.
  summaryView: "retail",
  // Cash Gap is the first insight that's also meaningful for retail (cash sales,
  // banking, petty cash). The auto-hide rule inside the report handles periods with
  // no cash data. Other reports (overview, attendants, declines, reprint-scam) are
  // still fuel-shaped and not yet retail-ready.
  insights: ["cash-gap"],
  // Generic reasons only — no attendant/fuel-specific options. Add retail-specific ones as needed.
  resolutionReasons: [...GENERIC_RESOLUTION_REASONS, OTHER_RESOLUTION_REASON],
};

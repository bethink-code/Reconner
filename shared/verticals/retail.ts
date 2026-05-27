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
  },
  // Retail summary: total takings = card + cash, with card reconciled to the bank.
  summaryView: "retail",
  // No retail insight reports are ready yet (the overview report is still fuel-shaped, and a
  // settled card batch has no declines). Empty → the Insights tab is hidden for retail until
  // Phase 3 builds retail-specific reports. This is the per-vertical "hide it" mechanism.
  insights: [],
  // Generic reasons only — no attendant/fuel-specific options. Add retail-specific ones as needed.
  resolutionReasons: [...GENERIC_RESOLUTION_REASONS, OTHER_RESOLUTION_REASON],
};

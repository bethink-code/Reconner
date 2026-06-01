import type { VerticalAdapter } from "./types.ts";
import { GENERIC_RESOLUTION_REASONS, OTHER_RESOLUTION_REASON } from "./reasons.ts";

/** The original (and currently only live) vertical. Captures today's hardcoded fuel behaviour. */
export const fuelAdapter: VerticalAdapter = {
  id: "fuel",
  salesSideSourceType: "fuel",
  vocabulary: {
    businessType: "Fuel station",
    salesSide: "Fuel",
    saleSingular: "fuel sale",
    salePlural: "fuel sales",
    staff: "Attendant",
    unit: "Pump",
  },
  fields: {
    staffField: "attendant",
    showUnit: true,
  },
  matching: {
    requiresInvoiceGrouping: false,
    salesSideRequiresCardFlag: true,
  },
  summaryView: "fuel",
  insights: ["overview", "attendants", "declines", "reprint-scam", "cash-gap"],
  resolutionReasons: [
    // Fuel-specific first
    { value: "attendant_overfill", label: "Attendant error / overfill" },
    { value: "possible_tip", label: "Possible attendant tip" },
    { value: "grouped_invoice", label: "Part of grouped invoice" },
    ...GENERIC_RESOLUTION_REASONS,
    OTHER_RESOLUTION_REASON,
  ],
};

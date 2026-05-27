import type { ResolutionReason } from "./types.ts";

/**
 * Resolution reasons that apply to ANY vertical — these describe bank/settlement realities, not
 * domain-specific events. Each vertical composes its own list from these plus its own extras.
 */
export const GENERIC_RESOLUTION_REASONS: ResolutionReason[] = [
  { value: "no_fuel_record", label: "No matching record" }, // value kept for back-compat; neutral label
  { value: "split_tender", label: "Split tender (one sale, multiple card payments)" },
  { value: "timing_difference", label: "Timing difference (posted next day)" },
  { value: "not_yet_settled", label: "Not yet settled at bank" },
  { value: "duplicate_charge", label: "Duplicate bank charge" },
  { value: "cash_as_card", label: "Cash recorded as card (or vice versa)" },
  { value: "wrong_payment_type", label: "Wrong payment type recorded" },
  { value: "refund_reversal", label: "Refund/reversal" },
  { value: "declined_at_bank", label: "Declined at bank" },
  { value: "test_transaction", label: "Test/pre-auth transaction" },
  { value: "bank_fee", label: "Bank fee/charge" },
  { value: "different_merchant", label: "Different merchant account" },
];

export const OTHER_RESOLUTION_REASON: ResolutionReason = { value: "other", label: "Other" };

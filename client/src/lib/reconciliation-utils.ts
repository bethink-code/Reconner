import type { PeriodSummary } from "./reconciliation-types";

export function deriveSummaryStats(summary: PeriodSummary) {
  const unmatchableBank = summary.unmatchableBankTransactions || 0;
  const excludedBank = summary.excludedBankTransactions || 0;
  const matchableBankTotal = summary.bankTransactions - unmatchableBank - excludedBank;
  const unmatchedBank = summary.unmatchedBankTransactions;
  // Match rate is fuel-side: of the card fuel uploaded, how many did we match to bank?
  // Bank-side rate doesn't work because settlement-lag matches make matchedPairs > in-period bank.
  const matchedCardCount = summary.scopedMatchedCount;
  const cardMatchPct = summary.cardFuelTransactions > 0
    ? Math.round((matchedCardCount / summary.cardFuelTransactions) * 100)
    : 0;
  // Use the actual unmatched count from SQL — not derived from cardFuel - matched
  const unmatchedFuelCount = summary.unmatchedCardTransactions;
  const cardOnly = summary.cardFuelTransactions;
  const cardOnlyAmount = summary.cardFuelAmount;
  const bankApprovedAmount = summary.matchedBankAmount + (summary.unmatchedBankAmount || 0);
  // Financial reconciliation uses card-only (no debtors) — debtors aren't expected to have bank matches
  const fileSurplus = bankApprovedAmount - cardOnlyAmount;
  const matchedSurplus = summary.matchedBankAmount - summary.matchedFuelAmount;
  const unmatchedBankAmt = summary.unmatchedBankAmount || 0;
  const unmatchedFuelCardAmount = summary.unmatchedCardAmount || 0;
  const totalFuelCardReconciled = summary.matchedFuelAmount + unmatchedFuelCardAmount;
  const reconSurplus = unmatchedFuelCardAmount + fileSurplus;
  const outsideRangeAmt = summary.unmatchableBankAmount || 0;

  return {
    unmatchableBank, excludedBank, matchableBankTotal, unmatchedBank,
    cardMatchPct, matchedCardCount,
    unmatchedFuelCount, cardOnly, cardOnlyAmount, bankApprovedAmount, fileSurplus,
    matchedSurplus, unmatchedBankAmt, unmatchedFuelCardAmount, totalFuelCardReconciled,
    reconSurplus, outsideRangeAmt,
  };
}

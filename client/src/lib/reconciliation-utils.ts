import type { PeriodSummary } from "./reconciliation-types";

export function deriveSummaryStats(summary: PeriodSummary) {
  const unmatchableBank = summary.unmatchableBankTransactions || 0;
  const excludedBank = summary.excludedBankTransactions || 0;
  const matchableBankTotal = summary.bankTransactions - unmatchableBank - excludedBank;
  const unmatchedBank = summary.unmatchedBankTransactions;
  const bankMatchPct = matchableBankTotal > 0 ? Math.round((summary.matchedPairs / matchableBankTotal) * 100) : 0;
  const unmatchedFuelCount = summary.cardFuelTransactions - summary.debtorFuelTransactions - summary.matchedPairs;
  const cardOnly = summary.cardFuelTransactions - summary.debtorFuelTransactions;
  const cardOnlyAmount = summary.cardFuelAmount - summary.debtorFuelAmount;
  const bankApprovedAmount = summary.matchedBankAmount + (summary.unmatchedBankAmount || 0);
  const fileSurplus = bankApprovedAmount - summary.cardFuelAmount;
  const matchedSurplus = summary.matchedBankAmount - summary.matchedFuelAmount;
  const unmatchedBankAmt = summary.unmatchedBankAmount || 0;
  const unmatchedFuelCardAmount = summary.unmatchedCardAmount || 0;
  const totalFuelCardReconciled = summary.matchedFuelAmount + unmatchedFuelCardAmount;
  const reconSurplus = unmatchedFuelCardAmount + fileSurplus;
  const outsideRangeAmt = summary.unmatchableBankAmount || 0;

  return {
    unmatchableBank, excludedBank, matchableBankTotal, unmatchedBank, bankMatchPct,
    unmatchedFuelCount, cardOnly, cardOnlyAmount, bankApprovedAmount, fileSurplus,
    matchedSurplus, unmatchedBankAmt, unmatchedFuelCardAmount, totalFuelCardReconciled,
    reconSurplus, outsideRangeAmt,
  };
}

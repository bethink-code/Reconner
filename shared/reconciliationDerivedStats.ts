export interface PeriodSummaryLike {
  bankTransactions: number;
  cardFuelTransactions: number;
  cardFuelAmount: number;
  excludedBankTransactions?: number;
  excludedBankAmount?: number;
  lagExplainedBankAmount?: number;
  lagFuelAmount?: number;
  matchedBankAmount: number;
  matchedFuelAmount: number;
  matchedFuelAmountInPeriod?: number;
  scopedMatchedCount: number;
  tenantBankCoverage?: { min: string; max: string };
  unmatchedBankAmount?: number;
  unmatchedBankTransactions: number;
  unmatchedCardAmount?: number;
  unmatchedCardTransactions: number;
  unmatchedFuelCoveredAmount?: number;
  unmatchedFuelUncoveredAmount?: number;
  unmatchableBankAmount?: number;
  unmatchableBankTransactions?: number;
}

export function deriveSummaryStats(summary: PeriodSummaryLike) {
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
  // bankApprovedAmount = all in-period bank that the matching engine categorised (matched + unmatched + lag-explained).
  // Previously omitted lag-explained bank, which understated the bank total.
  const bankApprovedAmount = summary.matchedBankAmount + (summary.unmatchedBankAmount || 0) + (summary.lagExplainedBankAmount || 0);
  // Financial reconciliation uses card-only (no debtors) — debtors aren't expected to have bank matches
  const fileSurplus = bankApprovedAmount - cardOnlyAmount;
  const matchedSurplus = summary.matchedBankAmount - summary.matchedFuelAmount;
  const unmatchedBankAmt = summary.unmatchedBankAmount || 0;
  const unmatchedFuelCardAmount = summary.unmatchedCardAmount || 0;
  const totalFuelCardReconciled = summary.matchedFuelAmount + unmatchedFuelCardAmount;
  const reconSurplus = unmatchedFuelCardAmount + fileSurplus;
  const outsideRangeAmt = summary.unmatchableBankAmount || 0;

  // 6-bucket reconciliation breakdown (factual labels only)
  const matchedFuelInPeriod = summary.matchedFuelAmountInPeriod ?? summary.matchedFuelAmount;
  const lagFuelAmount = summary.lagFuelAmount ?? 0;
  const unmatchedFuelCoveredAmount = summary.unmatchedFuelCoveredAmount ?? 0;
  const unmatchedFuelUncoveredAmount = summary.unmatchedFuelUncoveredAmount ?? 0;
  const lagExplainedBankAmount = summary.lagExplainedBankAmount ?? 0;
  // Matched amount variance = bank − fuel on pairs where both sides are in-period
  const matchedVariance = summary.matchedBankAmount - matchedFuelInPeriod;
  const tenantBankCoverage = summary.tenantBankCoverage;

  return {
    unmatchableBank, excludedBank, matchableBankTotal, unmatchedBank,
    cardMatchPct, matchedCardCount,
    unmatchedFuelCount, cardOnly, cardOnlyAmount, bankApprovedAmount, fileSurplus,
    matchedSurplus, unmatchedBankAmt, unmatchedFuelCardAmount, totalFuelCardReconciled,
    reconSurplus, outsideRangeAmt,
    // 6-bucket fields
    matchedFuelInPeriod, lagFuelAmount, unmatchedFuelCoveredAmount, unmatchedFuelUncoveredAmount,
    lagExplainedBankAmount, matchedVariance, tenantBankCoverage,
  };
}

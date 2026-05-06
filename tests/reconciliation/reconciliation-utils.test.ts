import test from "node:test";
import assert from "node:assert/strict";

import { deriveSummaryStats } from "../../client/src/lib/reconciliation-utils.ts";
import type { PeriodSummary } from "../../client/src/lib/reconciliation-types.ts";

function makeSummary(overrides: Partial<PeriodSummary> = {}): PeriodSummary {
  return {
    totalTransactions: 400,
    matchedTransactions: 200,
    matchedPairs: 100,
    unmatchedTransactions: 200,
    matchRate: 50,
    totalFuelAmount: 100000,
    totalBankAmount: 98000,
    discrepancy: 2000,
    fuelTransactions: 277,
    bankTransactions: 128,
    cardFuelTransactions: 127,
    cashFuelTransactions: 149,
    cardFuelAmount: 68825.9,
    cashFuelAmount: 28877.75,
    debtorFuelTransactions: 1,
    debtorFuelAmount: 200.1,
    unmatchedBankTransactions: 12,
    unmatchedBankAmount: 5000,
    unmatchedCardTransactions: 16,
    unmatchedCardAmount: 4200,
    unmatchableBankTransactions: 3,
    unmatchableBankAmount: 1200,
    lagExplainedBankTransactions: 2,
    lagExplainedBankAmount: 800,
    excludedBankTransactions: 5,
    excludedBankAmount: 1500,
    matchedBankAmount: 64000,
    matchedFuelAmount: 63500,
    matchedFuelAmountInPeriod: 63000,
    lagFuelAmount: 500,
    unmatchedFuelCoveredTransactions: 8,
    unmatchedFuelCoveredAmount: 2500,
    unmatchedFuelUncoveredTransactions: 8,
    unmatchedFuelUncoveredAmount: 1700,
    tenantBankCoverage: { min: "2026-04-24", max: "2026-04-28" },
    resolvedBankTransactions: 4,
    scopedCardCount: 127,
    scopedCardAmount: 68825.9,
    scopedMatchedCount: 111,
    scopedMatchedAmount: 64000,
    scopedUnmatchedCount: 16,
    scopedUnmatchedAmount: 4200,
    fuelDateRange: { min: "2026-04-26", max: "2026-04-26" },
    bankDateRange: { min: "2026-04-25", max: "2026-04-27" },
    bankCoverageRange: { min: "2026-04-26", max: "2026-04-26" },
    bankAccountRanges: [],
    perBankBreakdown: [],
    ...overrides,
  };
}

test("deriveSummaryStats uses fuel-side match rate and includes lag-explained bank in approved amount", () => {
  const stats = deriveSummaryStats(makeSummary());

  assert.equal(stats.matchableBankTotal, 120);
  assert.equal(stats.cardMatchPct, 87);
  assert.equal(stats.matchedCardCount, 111);
  assert.equal(stats.bankApprovedAmount, 69800);
  assert.equal(stats.fileSurplus, 974.1000000000058);
});

test("deriveSummaryStats respects in-period matched fuel for variance math", () => {
  const stats = deriveSummaryStats(
    makeSummary({
      matchedBankAmount: 50000,
      matchedFuelAmount: 53000,
      matchedFuelAmountInPeriod: 49000,
    }),
  );

  assert.equal(stats.matchedFuelInPeriod, 49000);
  assert.equal(stats.matchedVariance, 1000);
  assert.equal(stats.matchedSurplus, -3000);
});

import test from "node:test";
import assert from "node:assert/strict";

import { buildResultsDashboardReadModel } from "../../server/reconciliation/dashboardReadModel.ts";
import type { PeriodSummary } from "../../server/storage";
import { deriveCompletionMetrics } from "../../shared/reconciliationCompletion.ts";
import type { TransactionResolution } from "../../shared/schema";

function makeSummary(overrides: Partial<PeriodSummary> = {}): PeriodSummary {
  return {
    totalTransactions: 623,
    fuelTransactions: 430,
    bankTransactions: 187,
    matchedTransactions: 323,
    matchedPairs: 160,
    unmatchedTransactions: 300,
    matchRate: 51.8,
    totalFuelAmount: 174432.95,
    totalBankAmount: 116470.01,
    discrepancy: 635.19,
    cardFuelTransactions: 193,
    cashFuelTransactions: 234,
    unknownFuelTransactions: 0,
    cardFuelAmount: 117105.2,
    cashFuelAmount: 46914.9,
    unknownFuelAmount: 0,
    bankMatchRate: 67.4,
    cardMatchRate: 84.5,
    matchesSameDay: 126,
    matches1Day: 25,
    matches2Day: 6,
    matches3Day: 3,
    unmatchedBankTransactions: 57,
    unmatchedBankAmount: 35538.76,
    unmatchedCardTransactions: 30,
    unmatchedCardAmount: 17292.35,
    unmatchableBankTransactions: 0,
    unmatchableBankAmount: 0,
    lagExplainedBankTransactions: 0,
    lagExplainedBankAmount: 0,
    excludedBankTransactions: 4,
    excludedBankAmount: 1400,
    resolvedBankTransactions: 0,
    resolvedBankAmount: 0,
    matchedBankAmount: 116470.01,
    matchedFuelAmount: 117105.2,
    matchedFuelAmountInPeriod: 117105.2,
    lagFuelAmount: 0,
    unmatchedFuelCoveredTransactions: 0,
    unmatchedFuelCoveredAmount: 0,
    unmatchedFuelUncoveredTransactions: 30,
    unmatchedFuelUncoveredAmount: 17292.35,
    tenantBankCoverage: { min: "2026-04-28", max: "2026-05-05" },
    debtorFuelTransactions: 3,
    debtorFuelAmount: 10412.85,
    scopedCardCount: 193,
    scopedCardAmount: 117105.2,
    scopedMatchedCount: 163,
    scopedMatchedAmount: 116470.01,
    scopedUnmatchedCount: 30,
    scopedUnmatchedAmount: 17292.35,
    fuelDateRange: { min: "2026-05-01", max: "2026-05-01" },
    bankDateRange: { min: "2026-04-28", max: "2026-05-05" },
    bankCoverageRange: { min: "2026-05-01", max: "2026-05-01" },
    bankAccountRanges: [],
    perBankBreakdown: [],
    ...overrides,
  };
}

function makeResolution(
  transactionId: string,
  resolutionType: TransactionResolution["resolutionType"],
): TransactionResolution {
  return {
    id: `resolution-${transactionId}-${resolutionType}`,
    transactionId,
    periodId: "period-1",
    resolutionType,
    reason: null,
    notes: null,
    userId: null,
    userName: null,
    userEmail: null,
    linkedTransactionId: null,
    assignee: null,
    createdAt: new Date("2026-05-06T10:00:00.000Z"),
  };
}

test("deriveCompletionMetrics keeps the completion headline on matchable fuel card sales", () => {
  const dashboard = buildResultsDashboardReadModel(
    makeSummary(),
    [
      makeResolution("fuel-1", "linked"),
      makeResolution("fuel-2", "dismissed"),
    ],
  );

  assert.deepEqual(deriveCompletionMetrics(dashboard), {
    headlineRate: 84,
    matchedCardTransactions: 163,
    totalCardTransactions: 193,
    unmatchedFuelTransactions: 30,
    unmatchedBankTransactions: 57,
    bankApprovedTransactions: 126,
    totalInPeriodBankTransactions: 187,
  });
});

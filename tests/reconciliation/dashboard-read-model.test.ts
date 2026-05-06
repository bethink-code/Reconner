import test from "node:test";
import assert from "node:assert/strict";

import { buildResultsDashboardReadModel } from "../../server/reconciliation/dashboardReadModel.ts";
import type { PeriodSummary } from "../../server/storage";
import type { TransactionResolution } from "../../shared/schema";

function makeSummary(overrides: Partial<PeriodSummary> = {}): PeriodSummary {
  return {
    totalTransactions: 400,
    fuelTransactions: 277,
    bankTransactions: 128,
    matchedTransactions: 200,
    matchedPairs: 100,
    unmatchedTransactions: 200,
    matchRate: 50,
    totalFuelAmount: 97903.75,
    totalBankAmount: 98000,
    discrepancy: 96.25,
    cardFuelTransactions: 127,
    cashFuelTransactions: 149,
    unknownFuelTransactions: 0,
    cardFuelAmount: 68825.9,
    cashFuelAmount: 28877.85,
    unknownFuelAmount: 0,
    bankMatchRate: 50,
    cardMatchRate: 87.4,
    matchesSameDay: 80,
    matches1Day: 20,
    matches2Day: 0,
    matches3Day: 0,
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
    resolvedBankTransactions: 4,
    resolvedBankAmount: 900,
    matchedBankAmount: 64000,
    matchedFuelAmount: 63500,
    matchedFuelAmountInPeriod: 63000,
    lagFuelAmount: 500,
    unmatchedFuelCoveredTransactions: 8,
    unmatchedFuelCoveredAmount: 2500,
    unmatchedFuelUncoveredTransactions: 8,
    unmatchedFuelUncoveredAmount: 1700,
    tenantBankCoverage: { min: "2026-04-24", max: "2026-04-28" },
    debtorFuelTransactions: 1,
    debtorFuelAmount: 200.1,
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

test("buildResultsDashboardReadModel returns canonical dashboard stats and counts", () => {
  const model = buildResultsDashboardReadModel(
    makeSummary(),
    [
      makeResolution("fuel-1", "linked"),
      makeResolution("fuel-2", "dismissed"),
      makeResolution("bank-1", "flagged"),
      makeResolution("bank-2", "partial"),
    ],
  );

  assert.equal(model.stats.cardMatchPct, 87);
  assert.equal(model.stats.matchedCardCount, 111);
  assert.equal(model.stats.unmatchedFuelCount, 16);
  assert.equal(model.stats.unmatchedBank, 12);
  assert.equal(model.stats.matchableBankTotal, 120);
  assert.equal(model.stats.bankApprovedAmount, 69800);
  assert.equal(model.stats.fileSurplus, 974.1000000000058);

  assert.equal(model.counts.total, 4);
  assert.equal(model.counts.linked, 1);
  assert.equal(model.counts.dismissed, 1);
  assert.equal(model.counts.flagged, 1);
  assert.equal(model.counts.partial, 1);
  assert.equal(model.counts.resolved, 3);
  assert.equal(model.counts.review, 24);
  assert.equal(model.counts.investigate, 1);
});

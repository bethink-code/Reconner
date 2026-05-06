import assert from "node:assert/strict";
import test from "node:test";

import { buildInsightsReadModel } from "../../server/insights/insightsReadModel.ts";
import type { AttendantSummaryRow, PeriodSummary } from "../../server/storage";

function makeSummary(overrides: Partial<PeriodSummary> = {}): PeriodSummary {
  return {
    totalTransactions: 400,
    fuelTransactions: 277,
    bankTransactions: 128,
    matchedTransactions: 200,
    matchedPairs: 111,
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
    perBankBreakdown: [
      {
        bankName: "ABSA",
        approvedCount: 70,
        approvedAmount: 40000,
        declinedCount: 2,
        declinedAmount: 200,
        cancelledCount: 1,
        cancelledAmount: 50,
        totalCount: 73,
        totalAmount: 40250,
      },
      {
        bankName: "FNB",
        approvedCount: 40,
        approvedAmount: 24000,
        declinedCount: 3,
        declinedAmount: 300,
        cancelledCount: 1,
        cancelledAmount: 60,
        totalCount: 44,
        totalAmount: 24360,
      },
    ],
    ...overrides,
  };
}

function makeAttendantSummary(): AttendantSummaryRow[] {
  return [
    {
      attendant: "Alice",
      matchedCount: 2,
      matchedAmount: 100,
      matchedBankAmount: 99.95,
      unmatchedCount: 1,
      unmatchedAmount: 20,
      debtorCount: 0,
      debtorAmount: 0,
      declinedCount: 0,
      declinedAmount: 0,
      banks: [{ bankName: "ABSA", count: 2, amount: 99.95 }],
      totalCount: 3,
      totalAmount: 120,
    },
    {
      attendant: "Bob",
      matchedCount: 0,
      matchedAmount: 0,
      matchedBankAmount: 0,
      unmatchedCount: 1,
      unmatchedAmount: 30,
      debtorCount: 0,
      debtorAmount: 0,
      declinedCount: 0,
      declinedAmount: 0,
      banks: [],
      totalCount: 1,
      totalAmount: 30,
    },
  ];
}

test("buildInsightsReadModel keeps report logic separate and returns report-owned views", () => {
  const model = buildInsightsReadModel(makeSummary(), makeAttendantSummary(), {
    summary: {
      totalDeclined: 2,
      resubmittedCount: 1,
      unrecoveredCount: 1,
      netUnrecoveredAmount: 40,
      totalDeclinedAmount: 100,
    },
    transactions: [
      {
        id: "decline-1",
        date: "2026-04-26",
        time: "10:00",
        amount: 60,
        bank: "ABSA",
        cardNumber: "1234",
        description: "Declined",
        type: "Declined",
        note: "resubmitted at 10:05",
        recoveredAmount: 60,
        isRecovered: true,
        resubmittedTxId: "bank-1",
        attendant: "Alice",
        cashier: "Cashier 1",
      },
      {
        id: "decline-2",
        date: "2026-04-26",
        time: "23:15",
        amount: 40,
        bank: "ABSA",
        cardNumber: "1234",
        description: "Declined",
        type: "Declined",
        note: "",
        recoveredAmount: 0,
        isRecovered: false,
        resubmittedTxId: null,
        attendant: "Alice",
        cashier: "Cashier 1",
      },
    ],
    suspicious: [
      {
        pattern: "Repeated decline attempts",
        severity: "high",
        detail: "Repeated attempts",
        cardNumber: "1234",
        amount: 100,
        shortfall: 0,
        attendant: "Alice",
      },
    ],
  });

  assert.equal(model.detail.matching.cardMatchPct, 87);
  assert.equal(model.detail.reconciliation.bankApprovedAmount, 69800);
  assert.equal(model.detail.bankTransactions.totals.approvedCount, 110);
  assert.equal(model.attendants.state, "ready");
  assert.equal(model.attendants.summary?.fuelCardSalesCount, 4);
  assert.equal(model.attendants.summary?.totalShortfall, 50.05);
  assert.equal(model.attendants.verified[0].attendant, "Alice");
  assert.equal(model.attendants.verified[0].declines?.totalCount, 2);
  assert.equal(model.attendants.unmatchedOnly[0].attendant, "Bob");
  assert.equal(model.declines.hasDeclined, true);
  assert.equal(model.declines.summary.resubmittedAmount, 60);
  assert.equal(model.declines.groups[0].badges.some((badge) => badge.label === "Repeated decline attempts"), true);
  assert.equal(model.declines.groups[0].badges.some((badge) => badge.label === "Late-night decline"), true);
});

test("buildInsightsReadModel returns no-attendant state when uploads have no attendant mapping", () => {
  const model = buildInsightsReadModel(
    makeSummary(),
    [
      {
        attendant: "Unknown",
        matchedCount: 0,
        matchedAmount: 0,
        matchedBankAmount: 0,
        unmatchedCount: 0,
        unmatchedAmount: 0,
        debtorCount: 0,
        debtorAmount: 0,
        declinedCount: 0,
        declinedAmount: 0,
        banks: [],
        totalCount: 0,
        totalAmount: 0,
      },
    ],
    {
      summary: {
        totalDeclined: 0,
        resubmittedCount: 0,
        unrecoveredCount: 0,
        netUnrecoveredAmount: 0,
        totalDeclinedAmount: 0,
      },
      transactions: [],
      suspicious: [],
    },
  );

  assert.equal(model.attendants.state, "no_attendant_data");
  assert.equal(model.attendants.summary, null);
});

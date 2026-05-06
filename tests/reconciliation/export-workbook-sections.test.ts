import assert from "node:assert/strict";
import test from "node:test";

import { buildReconciliationSummaryRows, buildAttendantSummaryRows, buildDeclinedRows } from "../../server/export/readModelWorkbook.ts";
import { buildInsightsReadModel } from "../../server/insights/insightsReadModel.ts";
import { buildResultsDashboardReadModel } from "../../server/reconciliation/dashboardReadModel.ts";
import type { ReviewQueueReadModel } from "../../shared/reconciliationReview.ts";
import type { MatchingRulesConfig, ReconciliationPeriod, TransactionResolution } from "../../shared/schema";
import type { AttendantSummaryRow, PeriodSummary } from "../../server/storage";

function makeSummary(): PeriodSummary {
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
    ],
  };
}

function makeResolution(
  transactionId: string,
  resolutionType: TransactionResolution["resolutionType"],
): TransactionResolution {
  return {
    id: `${transactionId}-${resolutionType}`,
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

const attendantSummary: AttendantSummaryRow[] = [
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
];

test("workbook section builders package reconciliation and insight reports without reinterpreting ownership", () => {
  const summary = makeSummary();
  const dashboard = buildResultsDashboardReadModel(summary, [
    makeResolution("fuel-1", "linked"),
    makeResolution("bank-1", "flagged"),
    makeResolution("bank-2", "dismissed"),
  ]);
  const review = {
    matchingRules: {
      amountTolerance: 2,
      dateWindowDays: 3,
      timeWindowMinutes: 120,
      attendantSubmissionDelayMinutes: 120,
      minimumConfidence: 60,
      autoMatchThreshold: 85,
      groupByInvoice: true,
      requireCardMatch: false,
    },
    sides: {
      fuel: {
        summary: {
          unresolvedCount: 15,
          unresolvedAmount: 5512.4,
          originalCount: 15,
          originalAmount: 5512.4,
          matchedCount: 0,
          matchedAmount: 0,
          flaggedCount: 0,
          flaggedAmount: 0,
        },
        transactions: [],
      },
      bank: {
        summary: {
          unresolvedCount: 12,
          unresolvedAmount: 7533.3,
          originalCount: 12,
          originalAmount: 7533.3,
          matchedCount: 0,
          matchedAmount: 0,
          flaggedCount: 0,
          flaggedAmount: 0,
        },
        transactions: [],
      },
    },
    investigate: {
      totalCount: 1,
      totalAmount: 50,
      bankAmount: 50,
      fuelAmount: 0,
      bank: [],
      fuel: [],
    },
  } as ReviewQueueReadModel;

  const insights = buildInsightsReadModel(summary, attendantSummary, {
    summary: {
      totalDeclined: 1,
      resubmittedCount: 1,
      unrecoveredCount: 0,
      netUnrecoveredAmount: 0,
      totalDeclinedAmount: 60,
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
    ],
    suspicious: [],
  });

  const rules = {
    amountTolerance: 2,
    dateWindowDays: 3,
    timeWindowMinutes: 120,
    attendantSubmissionDelayMinutes: 120,
    minimumConfidence: 60,
    autoMatchThreshold: 85,
    groupByInvoice: true,
    requireCardMatch: false,
  } as MatchingRulesConfig;
  const period = {
    id: "period-1",
    name: "26/4",
    description: null,
    organizationId: "org-1",
    propertyId: "property-1",
    startDate: "2026-04-26",
    endDate: "2026-04-26",
    createdBy: "user-1",
    createdAt: new Date("2026-05-06T10:00:00.000Z"),
    updatedAt: new Date("2026-05-06T10:00:00.000Z"),
  } as unknown as ReconciliationPeriod;

  const summaryRows = buildReconciliationSummaryRows({
    period,
    matchingRules: rules,
    dashboard,
    review,
  });
  const fuelMatchRateRow = summaryRows.find((row) => row.Metric === "  Fuel card sales match rate");
  const bankReviewRow = summaryRows.find((row) => row.Metric === "  Unmatched bank still to review");

  assert.equal(fuelMatchRateRow?.Count, "87% (111/127)");
  assert.equal(bankReviewRow?.Count, 12);

  const attendantRows = buildAttendantSummaryRows(insights.attendants);
  assert.equal(attendantRows.some((row) => row.Metric === "ATTENDANT ACCOUNTABILITY"), true);
  assert.equal(attendantRows.some((row) => row.Metric === "  Attendant shortfall"), true);

  const declinedRows = buildDeclinedRows(insights.declines);
  assert.equal(declinedRows.some((row) => row.Metric === "DECLINE SUMMARY"), true);
  assert.equal(declinedRows.some((row) => row.Metric === "  Resubmitted successfully"), true);
});

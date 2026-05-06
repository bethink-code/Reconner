import { deriveSummaryStats } from "../../shared/reconciliationDerivedStats.ts";
import type { InsightsBankBreakdown, InsightsDetailReadModel } from "../../shared/periodInsights.ts";
import type { PeriodSummary } from "../storage";

function buildBankBreakdown(summary: PeriodSummary): InsightsDetailReadModel["bankTransactions"] {
  const stats = deriveSummaryStats(summary);
  const byBank = summary.perBankBreakdown || [];
  const totals = byBank.reduce(
    (acc, bank) => ({
      approvedCount: acc.approvedCount + bank.approvedCount,
      approvedAmount: acc.approvedAmount + bank.approvedAmount,
      declinedCount: acc.declinedCount + bank.declinedCount,
      declinedAmount: acc.declinedAmount + bank.declinedAmount,
      cancelledCount: acc.cancelledCount + bank.cancelledCount,
      cancelledAmount: acc.cancelledAmount + bank.cancelledAmount,
      totalCount: acc.totalCount + bank.totalCount,
      totalAmount: acc.totalAmount + bank.totalAmount,
    }),
    {
      approvedCount: 0,
      approvedAmount: 0,
      declinedCount: 0,
      declinedAmount: 0,
      cancelledCount: 0,
      cancelledAmount: 0,
      totalCount: 0,
      totalAmount: 0,
    },
  );

  return {
    totalCount: summary.bankTransactions,
    matchableCount: stats.matchableBankTotal,
    outsideDateRange: {
      count: stats.unmatchableBank,
      amount: stats.outsideRangeAmt,
    },
    excluded: {
      count: stats.excludedBank,
      amount: summary.excludedBankAmount || 0,
    },
    byBank: byBank.map((bank): InsightsBankBreakdown => ({
      bankName: bank.bankName,
      approvedCount: bank.approvedCount,
      approvedAmount: bank.approvedAmount,
      declinedCount: bank.declinedCount,
      declinedAmount: bank.declinedAmount,
      cancelledCount: bank.cancelledCount,
      cancelledAmount: bank.cancelledAmount,
      totalCount: bank.totalCount,
      totalAmount: bank.totalAmount,
    })),
    totals,
  };
}

export function buildReconciliationOverviewReport(
  summary: PeriodSummary,
): InsightsDetailReadModel {
  const stats = deriveSummaryStats(summary);

  return {
    fuelSales: {
      card: {
        count: stats.cardOnly,
        amount: stats.cardOnlyAmount,
      },
      debtor: {
        count: summary.debtorFuelTransactions,
        amount: summary.debtorFuelAmount,
      },
      cash: {
        count: summary.cashFuelTransactions,
        amount: summary.cashFuelAmount,
      },
      total: {
        count: summary.fuelTransactions,
        amount: summary.totalFuelAmount,
      },
    },
    bankTransactions: buildBankBreakdown(summary),
    matching: {
      cardMatchPct: stats.cardMatchPct,
      matchedCardCount: stats.matchedCardCount,
      unmatchedCardCount: stats.unmatchedFuelCount,
    },
    reconciliation: {
      bankApprovedAmount: stats.bankApprovedAmount,
      fuelCardSalesAmount: stats.cardOnlyAmount,
      fileSurplus: stats.fileSurplus,
    },
    surplusAnalysis: {
      matchedFuelInPeriod: stats.matchedFuelInPeriod,
      matchedBankAmount: summary.matchedBankAmount,
      matchedVariance: stats.matchedVariance,
      lagFuelAmount: stats.lagFuelAmount,
      unmatchedFuelCoveredAmount: stats.unmatchedFuelCoveredAmount,
      unmatchedFuelUncoveredAmount: stats.unmatchedFuelUncoveredAmount,
      unmatchedBankAmount: stats.unmatchedBankAmt,
      lagExplainedBankAmount: stats.lagExplainedBankAmount,
      excludedBankAmount: summary.excludedBankAmount || 0,
      totalSurplusShortfall:
        stats.matchedVariance -
        stats.lagFuelAmount -
        stats.unmatchedFuelCoveredAmount -
        stats.unmatchedFuelUncoveredAmount +
        stats.unmatchedBankAmt +
        stats.lagExplainedBankAmount,
      tenantBankCoverage: stats.tenantBankCoverage,
    },
  };
}

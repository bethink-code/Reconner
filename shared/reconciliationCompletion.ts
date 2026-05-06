import type { ResultsDashboardReadModel } from "./reconciliationDashboard";

export interface ReconciliationCompletionMetrics {
  headlineRate: number;
  matchedCardTransactions: number;
  totalCardTransactions: number;
  unmatchedFuelTransactions: number;
  unmatchedBankTransactions: number;
  bankApprovedTransactions: number;
  totalInPeriodBankTransactions: number;
}

export function deriveCompletionMetrics(
  dashboard: ResultsDashboardReadModel,
): ReconciliationCompletionMetrics {
  const { summary, stats } = dashboard;

  return {
    headlineRate: stats.cardMatchPct,
    matchedCardTransactions: stats.matchedCardCount,
    totalCardTransactions: summary.cardFuelTransactions,
    unmatchedFuelTransactions: stats.unmatchedFuelCount,
    unmatchedBankTransactions: stats.unmatchedBank,
    bankApprovedTransactions: Math.max(0, stats.matchableBankTotal - stats.unmatchedBank),
    totalInPeriodBankTransactions: summary.bankTransactions,
  };
}

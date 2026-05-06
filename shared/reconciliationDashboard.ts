import type { TransactionResolution } from "./schema";
import type { PeriodSummaryLike } from "./reconciliationDerivedStats.ts";

export interface ResultsDashboardSummary extends PeriodSummaryLike {
  cardFuelAmount: number;
  cashFuelAmount: number;
  cashFuelTransactions: number;
  debtorFuelAmount: number;
  debtorFuelTransactions: number;
  excludedBankTransactions?: number;
  excludedBankAmount?: number;
  fuelTransactions: number;
  matchedPairs: number;
  perBankBreakdown?: {
    bankName: string;
    approvedCount: number;
    approvedAmount: number;
    declinedCount: number;
    declinedAmount: number;
    cancelledCount: number;
    cancelledAmount: number;
    totalCount: number;
    totalAmount: number;
  }[];
  totalFuelAmount: number;
  unmatchedBankAmount: number;
  unmatchedBankTransactions: number;
  unmatchedCardAmount: number;
  unmatchedCardTransactions: number;
}

export interface DashboardResolutionCounts {
  total: number;
  linked: number;
  flagged: number;
  dismissed: number;
  partial: number;
  resolved: number;
  review: number;
  investigate: number;
}

export interface ResultsDashboardStats {
  bankApprovedAmount: number;
  cardMatchPct: number;
  cardOnlyAmount: number;
  excludedBank: number;
  fileSurplus: number;
  matchedCardCount: number;
  matchableBankTotal: number;
  unmatchedBank: number;
  unmatchedFuelCount: number;
  unmatchableBank: number;
}

export interface ResultsDashboardReadModel {
  summary: ResultsDashboardSummary;
  stats: ResultsDashboardStats;
  counts: DashboardResolutionCounts;
}

export type ResultsDashboardResolution = Pick<TransactionResolution, "resolutionType">;

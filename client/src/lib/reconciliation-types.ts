import type { Transaction } from "@shared/schema";
export type {
  CategorizedTransaction,
  PotentialMatch,
  ReviewQueueReadModel,
  ReviewSideReadModel,
  ReviewSideSummary,
  TransactionInsight,
} from "../../../shared/reconciliationReview.ts";

export interface PeriodSummary {
  totalTransactions: number;
  matchedTransactions: number;
  matchedPairs: number;
  unmatchedTransactions: number;
  matchRate: number;
  totalFuelAmount: number;
  totalBankAmount: number;
  discrepancy: number;
  fuelTransactions: number;
  bankTransactions: number;
  cardFuelTransactions: number;
  cashFuelTransactions: number;
  cardFuelAmount: number;
  cashFuelAmount: number;
  debtorFuelTransactions: number;
  debtorFuelAmount: number;
  unmatchedBankTransactions: number;
  unmatchedBankAmount: number;
  unmatchedCardTransactions: number;
  unmatchedCardAmount: number;
  unmatchableBankTransactions?: number;
  unmatchableBankAmount?: number;
  lagExplainedBankTransactions?: number;
  lagExplainedBankAmount?: number;
  excludedBankTransactions?: number;
  excludedBankAmount?: number;
  matchedBankAmount: number;
  matchedFuelAmount: number;
  // 6-bucket reconciliation fields
  matchedFuelAmountInPeriod?: number;
  lagFuelAmount?: number;
  unmatchedFuelCoveredTransactions?: number;
  unmatchedFuelCoveredAmount?: number;
  unmatchedFuelUncoveredTransactions?: number;
  unmatchedFuelUncoveredAmount?: number;
  tenantBankCoverage?: { min: string; max: string };
  resolvedBankTransactions?: number;
  scopedCardCount: number;
  scopedCardAmount: number;
  scopedMatchedCount: number;
  scopedMatchedAmount: number;
  scopedUnmatchedCount: number;
  scopedUnmatchedAmount: number;
  fuelDateRange?: { min: string; max: string };
  bankDateRange?: { min: string; max: string };
  bankCoverageRange?: { min: string; max: string };
  bankAccountRanges?: { fileId: string; sourceName: string; bankName: string | null; min: string; max: string; txCount: number; inRangeCount?: number }[];
  perBankBreakdown?: { bankName: string; approvedCount: number; approvedAmount: number; declinedCount: number; declinedAmount: number; cancelledCount: number; cancelledAmount: number; totalCount: number; totalAmount: number }[];
}

export interface PaginatedResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const CATEGORY_LABELS: Record<string, string> = {
  quick_win: "Quick win",
  investigate: "Needs review",
  no_match: "No match",
  low_value: "Low value",
  resolved: "Reviewed",
};

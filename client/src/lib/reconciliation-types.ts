import type { Transaction } from "@shared/schema";

export interface PaginatedResponse {
  transactions: Transaction[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PotentialMatch {
  transaction: Transaction;
  confidence: number;
  timeDiff: string;
  amountDiff: number;
}

export interface TransactionInsight {
  type: 'possible_tip' | 'overfill' | 'duplicate_charge' | 'no_fuel_record';
  message: string;
  detail?: string;
}

export interface CategorizedTransaction {
  transaction: Transaction;
  category: 'quick_win' | 'investigate' | 'no_match' | 'low_value' | 'resolved';
  bestMatch?: PotentialMatch;
  potentialMatches: PotentialMatch[];
  nearestByAmount: PotentialMatch[];
  insights: TransactionInsight[];
}

export const CATEGORY_LABELS: Record<string, string> = {
  quick_win: "Quick win",
  investigate: "Needs review",
  no_match: "No match",
  low_value: "Low value",
  resolved: "Matched",
};

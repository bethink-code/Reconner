import type {
  MatchingRulesConfig,
  Transaction,
  TransactionResolution,
} from "./schema";

export interface PotentialMatch {
  transaction: Transaction;
  confidence: number;
  timeDiff: string;
  amountDiff: number;
  stageId?: string;
  stageLabel?: string;
}

export interface TransactionInsight {
  type: "possible_tip" | "overfill" | "duplicate_charge" | "no_fuel_record";
  message: string;
  detail?: string;
}

export interface CategorizedTransaction {
  transaction: Transaction;
  category: "quick_win" | "investigate" | "no_match" | "low_value" | "resolved";
  bestMatch?: PotentialMatch;
  potentialMatches: PotentialMatch[];
  nearestByAmount: PotentialMatch[];
  insights: TransactionInsight[];
  resolution?: TransactionResolution | null;
}

export interface ReviewSideSummary {
  unresolvedCount: number;
  unresolvedAmount: number;
  originalCount: number;
  originalAmount: number;
  matchedCount: number;
  matchedAmount: number;
  flaggedCount: number;
  flaggedAmount: number;
}

export interface ReviewSideReadModel {
  summary: ReviewSideSummary;
  transactions: CategorizedTransaction[];
}

export interface InvestigateQueueItem {
  transaction: Transaction;
  resolution: TransactionResolution | null;
  analysis: CategorizedTransaction;
}

export interface InvestigateReadModel {
  totalCount: number;
  totalAmount: number;
  bankAmount: number;
  fuelAmount: number;
  bank: InvestigateQueueItem[];
  fuel: InvestigateQueueItem[];
}

export interface ReviewQueueReadModel {
  matchingRules: MatchingRulesConfig;
  sides: {
    fuel: ReviewSideReadModel;
    bank: ReviewSideReadModel;
  };
  investigate: InvestigateReadModel;
}

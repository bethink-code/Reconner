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
  /**
   * When an item has no viable match candidate, why — so the UI can stop presenting structural
   * surplus as if it needs action:
   *  - "surplus": a same-amount counterpart exists in the settlement window but it already matched
   *    another line. Nothing to do — there are simply more lines on one side than the other.
   *  - "unaccounted": nothing comparable on the other side at all — the real signal (a bank deposit
   *    with no sale behind it, or a sale not yet settled / missing).
   * null when a candidate match exists (needs a confirm/flag decision) or the row is resolved.
   */
  noMatchReason?: "surplus" | "unaccounted" | null;
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
  /** Of the unresolved items, those classed "surplus" (no partner available — no action needed). */
  noActionCount: number;
  noActionAmount: number;
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

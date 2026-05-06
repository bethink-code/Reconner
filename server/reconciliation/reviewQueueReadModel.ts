import type {
  MatchingRulesConfig,
  Transaction,
  TransactionResolution,
} from "../../shared/schema";
import type {
  CategorizedTransaction,
  InvestigateQueueItem,
  PotentialMatch,
  ReviewQueueReadModel,
  ReviewSideSummary,
  TransactionInsight,
} from "../../shared/reconciliationReview.ts";
import { buildMatchingStages } from "../../shared/matchingStages.ts";
import { parseTimeToMinutes } from "./matching.ts";

const LOW_VALUE_THRESHOLD = 50;
const REVIEW_STAGE_BADGE_LABELS: Record<string, string> = {
  strict_same_day_exact: "Strict same-day",
  operational_close_match: "Operational close",
  boundary_transactions: "Boundary",
  settlement_fallback: "Settlement fallback",
};

type ReviewSide = "bank" | "fuel";

type ReviewPeriodLike = {
  startDate: string;
  endDate: string;
};

type SideResolutionCounts = {
  matched: number;
  matchedAmount: number;
  flagged: number;
  flaggedAmount: number;
};

function resolutionSortScore(resolution: TransactionResolution) {
  const createdAt = resolution.createdAt ? new Date(resolution.createdAt).getTime() : 0;
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

function buildLatestResolutionMap(resolutions: TransactionResolution[]) {
  const latestByTransactionId = new Map<string, TransactionResolution>();

  for (const resolution of resolutions) {
    const existing = latestByTransactionId.get(resolution.transactionId);
    if (!existing) {
      latestByTransactionId.set(resolution.transactionId, resolution);
      continue;
    }

    const existingScore = resolutionSortScore(existing);
    const nextScore = resolutionSortScore(resolution);
    if (nextScore > existingScore) {
      latestByTransactionId.set(resolution.transactionId, resolution);
      continue;
    }

    if (nextScore === existingScore && resolution.id > existing.id) {
      latestByTransactionId.set(resolution.transactionId, resolution);
    }
  }

  return latestByTransactionId;
}

function isInPeriod(transaction: Transaction, period: ReviewPeriodLike) {
  return transaction.transactionDate >= period.startDate && transaction.transactionDate <= period.endDate;
}

function isBankTransaction(transaction: Transaction) {
  return !!transaction.sourceType?.startsWith("bank");
}

function isFuelCardTransaction(transaction: Transaction) {
  return transaction.sourceType === "fuel" && transaction.isCardTransaction === "yes";
}

function buildFuelBoundaryPositions(transactions: Transaction[]) {
  const grouped = new Map<string, Transaction[]>();

  for (const transaction of transactions) {
    if (!isFuelCardTransaction(transaction)) continue;
    const key = transaction.transactionDate;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(transaction);
  }

  const positions = new Map<string, "start" | "end" | "both" | "none">();

  for (const dayTransactions of grouped.values()) {
    const sorted = [...dayTransactions].sort((a, b) => {
      const timeA = parseTimeToMinutes(a.transactionTime || "") ?? Number.MAX_SAFE_INTEGER;
      const timeB = parseTimeToMinutes(b.transactionTime || "") ?? Number.MAX_SAFE_INTEGER;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    if (sorted.length === 0) continue;

    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    positions.set(first.id, first.id === last.id ? "both" : "start");
    positions.set(last.id, first.id === last.id ? "both" : "end");
  }

  return positions;
}

function buildPerSideCounts(
  bankTransactions: Transaction[],
  fuelTransactions: Transaction[],
  resolutions: TransactionResolution[],
) {
  const counts: Record<ReviewSide, SideResolutionCounts> = {
    bank: { matched: 0, matchedAmount: 0, flagged: 0, flaggedAmount: 0 },
    fuel: { matched: 0, matchedAmount: 0, flagged: 0, flaggedAmount: 0 },
  };

  const transactionLookup = new Map<string, { side: ReviewSide; amount: number }>();
  for (const transaction of bankTransactions) {
    transactionLookup.set(transaction.id, {
      side: "bank",
      amount: parseFloat(transaction.amount) || 0,
    });
  }
  for (const transaction of fuelTransactions) {
    transactionLookup.set(transaction.id, {
      side: "fuel",
      amount: parseFloat(transaction.amount) || 0,
    });
  }

  for (const resolution of resolutions) {
    const transaction = transactionLookup.get(resolution.transactionId);
    if (!transaction) continue;

    if (resolution.resolutionType === "flagged") {
      counts[transaction.side].flagged += 1;
      counts[transaction.side].flaggedAmount += transaction.amount;
    } else {
      counts[transaction.side].matched += 1;
      counts[transaction.side].matchedAmount += transaction.amount;
    }
  }

  return counts;
}

function scoreSuggestion(
  primaryTransaction: Transaction,
  candidateTransaction: Transaction,
  side: ReviewSide,
  matchingRules: MatchingRulesConfig,
  fuelBoundaryPositions: Map<string, "start" | "end" | "both" | "none">,
): PotentialMatch | null {
  const matchingStages = buildMatchingStages({
    amountTolerance: matchingRules.amountTolerance,
    dateWindowDays: matchingRules.dateWindowDays,
    timeWindowMinutes: matchingRules.timeWindowMinutes,
    attendantSubmissionDelayMinutes: matchingRules.attendantSubmissionDelayMinutes,
    requireCardMatch: matchingRules.requireCardMatch,
    minimumConfidence: matchingRules.minimumConfidence,
    autoMatchThreshold: matchingRules.autoMatchThreshold,
  });

  const primaryAmount = parseFloat(primaryTransaction.amount);
  const candidateAmount = parseFloat(candidateTransaction.amount);
  const amountDiff = Math.abs(candidateAmount - primaryAmount);
  const primaryDate = new Date(primaryTransaction.transactionDate).getTime();
  const candidateDate = new Date(candidateTransaction.transactionDate).getTime();
  const dayDiff = Math.round((candidateDate - primaryDate) / 86400000);

  const bankTransaction = side === "fuel" ? candidateTransaction : primaryTransaction;
  const fuelTransaction = side === "fuel" ? primaryTransaction : candidateTransaction;
  const fuelTime = parseTimeToMinutes(fuelTransaction.transactionTime || "");
  const bankTime = parseTimeToMinutes(bankTransaction.transactionTime || "");
  const boundaryPosition = fuelBoundaryPositions.get(fuelTransaction.id) || "none";

  for (const stage of matchingStages) {
    if (amountDiff > stage.maxAmountDiff) continue;
    if (stage.requireExactAmount && amountDiff > 0.01) continue;
    if (dayDiff < stage.minDateDiffDays || dayDiff > stage.maxDateDiffDays) continue;

    if (stage.boundaryMode === "boundary") {
      const allowsPreviousDay = boundaryPosition === "start" || boundaryPosition === "both";
      const allowsNextDay = boundaryPosition === "end" || boundaryPosition === "both";
      const isDirectionalBoundary =
        (dayDiff === -1 && allowsPreviousDay) ||
        (dayDiff === 1 && allowsNextDay);
      if (!isDirectionalBoundary) continue;
    }

    if (dayDiff === 0 && fuelTime !== null && bankTime !== null) {
      const timeGap = Math.abs(bankTime - fuelTime);
      if (stage.maxTimeDiffMinutes !== null && timeGap > stage.maxTimeDiffMinutes) continue;
    }

    let confidence = 70;
    if (dayDiff === 0) confidence = 85;
    else if (Math.abs(dayDiff) === 1) confidence = 75;
    else if (Math.abs(dayDiff) === 2) confidence = 68;
    else confidence = 65;

    let timeDiffLabel = dayDiff === 0 ? "Same day" : `${Math.abs(dayDiff)} day${Math.abs(dayDiff) >= 2 ? "s" : ""}`;
    if (dayDiff === 0 && fuelTime !== null && bankTime !== null) {
      const timeGap = Math.abs(bankTime - fuelTime);
      timeDiffLabel = timeGap === 0 ? "Same time" : `${timeGap} min`;
      if (timeGap <= 5) confidence = 100;
      else if (timeGap <= 15) confidence = 95;
      else if (timeGap <= 30) confidence = 85;
      else confidence = 75;
    }

    if (amountDiff > 0) {
      const divisor = stage.maxAmountDiff <= 0 ? 0.01 : stage.maxAmountDiff;
      confidence -= Math.min(5, (amountDiff / divisor) * 5);
    }

    if (stage.requireCardMatch) {
      if (!bankTransaction.cardNumber || !fuelTransaction.cardNumber) continue;
      if (bankTransaction.cardNumber !== fuelTransaction.cardNumber) continue;
      confidence += 25;
    } else if (bankTransaction.cardNumber && fuelTransaction.cardNumber) {
      if (bankTransaction.cardNumber === fuelTransaction.cardNumber) confidence += 25;
      else confidence -= 30;
    }

    confidence = Math.max(0, Math.min(100, confidence));
    if (confidence < stage.minimumConfidence) continue;

    return {
      transaction: candidateTransaction,
      confidence,
      timeDiff: timeDiffLabel,
      amountDiff,
      stageId: stage.id,
      stageLabel: REVIEW_STAGE_BADGE_LABELS[stage.id] || stage.name,
    };
  }

  return null;
}

function buildInsights(
  item: CategorizedTransaction,
  side: ReviewSide,
): TransactionInsight[] {
  const insights: TransactionInsight[] = [];
  const primaryAmount = parseFloat(item.transaction.amount);
  const nearest = item.nearestByAmount[0];

  if (!nearest || (item.category !== "no_match" && item.category !== "investigate")) {
    return insights;
  }

  const diff = primaryAmount - parseFloat(nearest.transaction.amount);
  const absDiff = Math.abs(diff);

  if (absDiff > 2 && absDiff <= 25) {
    if (side === "fuel") {
      insights.push(diff > 0
        ? {
            type: "overfill",
            message: `Fuel sale R${absDiff.toFixed(2)} more than bank payment`,
            detail: `Bank: R${parseFloat(nearest.transaction.amount).toFixed(2)} on ${nearest.transaction.transactionDate} — possible overfill by attendant`,
          }
        : {
            type: "possible_tip",
            message: `Bank payment R${absDiff.toFixed(2)} more than fuel sale`,
            detail: `Bank: R${parseFloat(nearest.transaction.amount).toFixed(2)} on ${nearest.transaction.transactionDate} — difference may include attendant tip`,
          });
    } else {
      insights.push(diff > 0
        ? {
            type: "possible_tip",
            message: `Bank paid R${absDiff.toFixed(2)} more than fuel record`,
            detail: `Fuel: R${parseFloat(nearest.transaction.amount).toFixed(2)} on ${nearest.transaction.transactionDate} — difference may include attendant tip`,
          }
        : {
            type: "overfill",
            message: `Fuel record R${absDiff.toFixed(2)} more than bank payment`,
            detail: `Fuel: R${parseFloat(nearest.transaction.amount).toFixed(2)} on ${nearest.transaction.transactionDate} — possible overfill by attendant`,
          });
    }
  } else if (absDiff > 25) {
    insights.push(side === "fuel"
      ? {
          type: "no_fuel_record",
          message: `Nearest bank payment is R${absDiff.toFixed(2)} away`,
          detail: "No close bank match found — may not have settled yet",
        }
      : {
          type: "no_fuel_record",
          message: `Nearest fuel record is R${absDiff.toFixed(2)} away`,
          detail: "No close fuel match found — may be a non-fuel POS charge or missing fuel record",
        });
  }

  return insights;
}

function applyDuplicateInsights(
  result: CategorizedTransaction[],
  side: ReviewSide,
  candidateTransactions: Transaction[],
) {
  const groups = new Map<string, CategorizedTransaction[]>();

  for (const item of result) {
    const key = `${parseFloat(item.transaction.amount).toFixed(2)}_${item.transaction.transactionDate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(item);
  }

  for (const group of groups.values()) {
    if (group.length <= 1) continue;

    const amount = parseFloat(group[0].transaction.amount);
    const date = group[0].transaction.transactionDate;
    const candidatesOnDate = candidateTransactions.filter((transaction) => {
      const diff = Math.abs(parseFloat(transaction.amount) - amount);
      return diff < 15 && transaction.transactionDate === date;
    }).length;

    const chargeLabel = side === "fuel" ? "fuel sales" : "bank charges";
    const recordLabel = side === "fuel" ? "bank payment" : "fuel record";

    for (const item of group) {
      item.insights.unshift({
        type: "duplicate_charge",
        message: `${group.length} identical ${chargeLabel} of R${amount.toFixed(2)} on this date`,
        detail: candidatesOnDate < group.length
          ? `Only ${candidatesOnDate} matching ${recordLabel}${candidatesOnDate !== 1 ? "s" : ""} found — ${group.length - candidatesOnDate} may be duplicate ${chargeLabel} or missing ${recordLabel}s`
          : `${candidatesOnDate} ${recordLabel}s found at similar amounts`,
      });
    }
  }
}

function buildCategorizedTransactions(
  side: ReviewSide,
  primaryTransactions: Transaction[],
  candidateTransactions: Transaction[],
  matchingRules: MatchingRulesConfig,
  fuelBoundaryPositions: Map<string, "start" | "end" | "both" | "none">,
  latestResolutionByTransactionId: Map<string, TransactionResolution>,
) {
  const result = primaryTransactions
    .map((primaryTransaction): CategorizedTransaction => {
      const primaryAmount = parseFloat(primaryTransaction.amount);

      const allScored = candidateTransactions
        .map((candidateTransaction) => scoreSuggestion(
          primaryTransaction,
          candidateTransaction,
          side,
          matchingRules,
          fuelBoundaryPositions,
        ))
        .filter((match): match is PotentialMatch => !!match);

      const potentialMatches = [...allScored]
        .sort((a, b) => {
          if (b.confidence !== a.confidence) return b.confidence - a.confidence;
          return a.amountDiff - b.amountDiff;
        })
        .slice(0, 5);

      const nearestByAmount = [...allScored]
        .sort((a, b) => a.amountDiff - b.amountDiff)
        .slice(0, 3);

      const bestMatch = potentialMatches[0];
      const resolution = latestResolutionByTransactionId.get(primaryTransaction.id) || null;

      let category: CategorizedTransaction["category"];
      if (resolution && resolution.resolutionType !== "flagged") category = "resolved";
      else if (primaryAmount < LOW_VALUE_THRESHOLD) category = "low_value";
      else if (bestMatch && bestMatch.confidence >= matchingRules.autoMatchThreshold) category = "quick_win";
      else if (bestMatch && bestMatch.confidence >= matchingRules.minimumConfidence) category = "investigate";
      else category = "no_match";

      const item: CategorizedTransaction = {
        transaction: primaryTransaction,
        category,
        bestMatch,
        potentialMatches,
        nearestByAmount,
        insights: [],
        resolution,
      };

      item.insights = buildInsights(item, side);
      return item;
    })
    .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));

  applyDuplicateInsights(result, side, candidateTransactions);
  return result;
}

function buildInvestigateItems(
  items: CategorizedTransaction[],
  latestResolutionByTransactionId: Map<string, TransactionResolution>,
) {
  return items
    .map((item): InvestigateQueueItem => ({
      transaction: item.transaction,
      resolution: latestResolutionByTransactionId.get(item.transaction.id) || null,
      analysis: item,
    }))
    .sort((a, b) => parseFloat(b.transaction.amount) - parseFloat(a.transaction.amount));
}

function buildSideSummary(
  unresolvedTransactions: Transaction[],
  counts: SideResolutionCounts,
): ReviewSideSummary {
  const unresolvedCount = unresolvedTransactions.length;
  const unresolvedAmount = unresolvedTransactions.reduce((sum, transaction) => sum + parseFloat(transaction.amount), 0);

  return {
    unresolvedCount,
    unresolvedAmount,
    originalCount: unresolvedCount + counts.matched + counts.flagged,
    originalAmount: unresolvedAmount + counts.matchedAmount + counts.flaggedAmount,
    matchedCount: counts.matched,
    matchedAmount: counts.matchedAmount,
    flaggedCount: counts.flagged,
    flaggedAmount: counts.flaggedAmount,
  };
}

export function buildReviewQueueReadModel(
  period: ReviewPeriodLike,
  transactions: Transaction[],
  resolutions: TransactionResolution[],
  matchingRules: MatchingRulesConfig,
): ReviewQueueReadModel {
  const latestResolutionByTransactionId = buildLatestResolutionMap(resolutions);
  const latestResolutions = [...latestResolutionByTransactionId.values()];
  const inPeriodBankTransactions = transactions.filter(
    (transaction) => isBankTransaction(transaction) && isInPeriod(transaction, period),
  );
  const inPeriodFuelTransactions = transactions.filter(
    (transaction) => isFuelCardTransaction(transaction) && isInPeriod(transaction, period),
  );
  const unmatchedBankTransactions = inPeriodBankTransactions.filter((transaction) => transaction.matchStatus === "unmatched");
  const unmatchedFuelTransactions = inPeriodFuelTransactions.filter((transaction) => transaction.matchStatus === "unmatched");

  const resolvedIds = new Set(
    latestResolutions
      .filter((resolution) => resolution.resolutionType !== "flagged")
      .map((resolution) => resolution.transactionId),
  );
  const flaggedTransactionIds = new Set(
    latestResolutions
      .filter((resolution) => resolution.resolutionType === "flagged")
      .map((resolution) => resolution.transactionId),
  );
  const perSideCounts = buildPerSideCounts(inPeriodBankTransactions, inPeriodFuelTransactions, latestResolutions);
  const fuelBoundaryPositions = buildFuelBoundaryPositions(inPeriodFuelTransactions);
  const reviewFuelTransactions = unmatchedFuelTransactions.filter(
    (transaction) => !resolvedIds.has(transaction.id) && !flaggedTransactionIds.has(transaction.id),
  );
  const reviewBankTransactions = unmatchedBankTransactions.filter(
    (transaction) => !resolvedIds.has(transaction.id) && !flaggedTransactionIds.has(transaction.id),
  );

  const fuelTransactions = buildCategorizedTransactions(
    "fuel",
    reviewFuelTransactions,
    unmatchedBankTransactions,
    matchingRules,
    fuelBoundaryPositions,
    latestResolutionByTransactionId,
  );
  const bankTransactions = buildCategorizedTransactions(
    "bank",
    reviewBankTransactions,
    unmatchedFuelTransactions,
    matchingRules,
    fuelBoundaryPositions,
    latestResolutionByTransactionId,
  );
  const flaggedBank = buildInvestigateItems(
    buildCategorizedTransactions(
      "bank",
      inPeriodBankTransactions.filter((transaction) => flaggedTransactionIds.has(transaction.id)),
      unmatchedFuelTransactions,
      matchingRules,
      fuelBoundaryPositions,
      latestResolutionByTransactionId,
    ),
    latestResolutionByTransactionId,
  );
  const flaggedFuel = buildInvestigateItems(
    buildCategorizedTransactions(
      "fuel",
      inPeriodFuelTransactions.filter((transaction) => flaggedTransactionIds.has(transaction.id)),
      unmatchedBankTransactions,
      matchingRules,
      fuelBoundaryPositions,
      latestResolutionByTransactionId,
    ),
    latestResolutionByTransactionId,
  );
  const investigateItems = [...flaggedBank, ...flaggedFuel];

  return {
    matchingRules,
    sides: {
      fuel: {
        summary: buildSideSummary(
          reviewFuelTransactions,
          perSideCounts.fuel,
        ),
        transactions: fuelTransactions,
      },
      bank: {
        summary: buildSideSummary(
          reviewBankTransactions,
          perSideCounts.bank,
        ),
        transactions: bankTransactions,
      },
    },
    investigate: {
      totalCount: investigateItems.length,
      totalAmount: investigateItems.reduce((sum, item) => sum + parseFloat(item.transaction.amount), 0),
      bankAmount: flaggedBank.reduce((sum, item) => sum + parseFloat(item.transaction.amount), 0),
      fuelAmount: flaggedFuel.reduce((sum, item) => sum + parseFloat(item.transaction.amount), 0),
      bank: flaggedBank,
      fuel: flaggedFuel,
    },
  };
}

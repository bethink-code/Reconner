import { buildMatchingStages, type MatchingStage } from "../../shared/matchingStages.ts";
import {
  groupFuelByInvoice,
  parseDateToDays,
  parseTimeToMinutes,
  runSequentialMatchingStages,
  scoreBankToInvoices,
  type FuelInvoice,
} from "./matching.ts";

export interface AutoMatchTransactionLike {
  id: string;
  sourceType: string | null;
  isCardTransaction: string | null;
  paymentType: string | null;
  matchStatus: string | null;
  transactionDate: string | null;
  transactionTime: string | null;
  amount: string;
  cardNumber: string | null;
  referenceNumber: string | null;
}

export interface AutoMatchPeriodLike {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface AutoMatchRulesLike {
  amountTolerance: number;
  dateWindowDays: number;
  timeWindowMinutes: number;
  attendantSubmissionDelayMinutes: number;
  groupByInvoice: boolean;
  requireCardMatch: boolean;
  minimumConfidence: number;
  autoMatchThreshold: number;
}

export interface PendingAutoMatch {
  matchData: {
    periodId: string;
    fuelTransactionId: string;
    bankTransactionId: string;
    matchType: string;
    matchConfidence: string;
  };
  bankTxId: string;
  fuelItemIds: string[];
  stageId: string;
}

export interface AutoMatchPlan {
  pendingMatches: PendingAutoMatch[];
  lagExplainedBankIds: string[];
  unmatchableBankIds: string[];
  warnings: string[];
  stages: MatchingStage[];
  metrics: {
    matchesCreated: number;
    cardTransactionsProcessed: number;
    invoicesCreated: number;
    bankTransactionsTotal: number;
    bankTransactionsMatchable: number;
    bankTransactionsUnmatchable: number;
    bankTransactionsLagExplained: number;
    nonCardTransactionsSkipped: number;
    matchRate: string;
    competingSameDaySkipped: number;
  };
}

function toDateOnly(timestampMs: number) {
  const date = new Date(timestampMs);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isDebtorTransaction(transaction: AutoMatchTransactionLike) {
  const paymentType = transaction.paymentType?.toLowerCase();
  return (
    paymentType?.includes("debtor") ||
    paymentType?.includes("account") ||
    paymentType?.includes("fleet")
  );
}

function isWithinPeriodDay(day: number, startDay: number, endDay: number) {
  return !Number.isNaN(day) && day >= startDay && day <= endDay;
}

export function planAutoMatch(
  period: AutoMatchPeriodLike,
  rules: AutoMatchRulesLike,
  transactions: AutoMatchTransactionLike[],
): AutoMatchPlan {
  const periodStartDay = new Date(`${period.startDate}T00:00:00`).getTime();
  const periodEndDay = new Date(`${period.endDate}T00:00:00`).getTime();
  const dateBufferMs = rules.dateWindowDays * 86400000;

  const fuelTransactions = transactions.filter((transaction) => {
    if (
      transaction.sourceType !== "fuel" ||
      transaction.isCardTransaction !== "yes" ||
      isDebtorTransaction(transaction) ||
      transaction.matchStatus === "excluded" ||
      !transaction.transactionDate
    ) {
      return false;
    }

    const day = toDateOnly(new Date(transaction.transactionDate).getTime());
    return isWithinPeriodDay(day, periodStartDay, periodEndDay);
  });

  const bankTransactions = transactions.filter((transaction) =>
    transaction.sourceType?.startsWith("bank") &&
    transaction.matchStatus !== "excluded",
  );

  const unmatchableBankTransactions = bankTransactions.filter((transaction) => {
    if (!transaction.transactionDate) return false;
    const bankTime = new Date(transaction.transactionDate).getTime();
    if (Number.isNaN(bankTime)) return false;
    const bankDay = toDateOnly(bankTime);
    return bankDay > periodEndDay + dateBufferMs || bankDay < periodStartDay - 86400000;
  });

  const matchableBankTransactions = bankTransactions.filter(
    (transaction) => !unmatchableBankTransactions.includes(transaction),
  );

  const fuelInvoices = groupFuelByInvoice(fuelTransactions, rules.groupByInvoice);
  const stages = buildMatchingStages(rules);
  const operationalStage = stages.find((stage) => stage.id === "operational_close_match");
  const stageMatches = runSequentialMatchingStages(
    matchableBankTransactions,
    fuelInvoices,
    stages,
  );

  const hasCompetingSameDayCandidate = (
    stageId: string,
    bankTransaction: {
      id: string;
      amount: string;
      transactionDate: string | null;
      transactionTime: string | null;
      cardNumber: string | null;
    },
    bestMatch: (typeof stageMatches)[number]["bestMatch"],
  ) => {
    if (!operationalStage) return false;
    if (stageId !== "boundary_transactions" && stageId !== "settlement_fallback") return false;

    const fuelDate = bestMatch.invoice.firstDate;
    if (!fuelDate) return false;

    const fuelTime = parseTimeToMinutes(bestMatch.invoice.firstTime || "");

    return matchableBankTransactions.some((candidateBank) => {
      if (candidateBank.id === bankTransaction.id) return false;
      if (candidateBank.transactionDate !== fuelDate) return false;

      const amountDiff = Math.abs(parseFloat(candidateBank.amount) - bestMatch.invoice.totalAmount);
      if (amountDiff > operationalStage.maxAmountDiff) return false;

      const bankTime = parseTimeToMinutes(candidateBank.transactionTime || "");
      if (
        fuelTime !== null &&
        bankTime !== null &&
        operationalStage.maxTimeDiffMinutes !== null &&
        Math.abs(bankTime - fuelTime) > operationalStage.maxTimeDiffMinutes
      ) {
        return false;
      }

      if (operationalStage.requireCardMatch) {
        if (!candidateBank.cardNumber || !bestMatch.invoice.cardNumber) return false;
        if (candidateBank.cardNumber !== bestMatch.invoice.cardNumber) return false;
      }

      return true;
    });
  };

  let competingSameDaySkipped = 0;
  const pendingMatches: PendingAutoMatch[] = [];

  for (const stageMatch of stageMatches) {
    const { stage, bankTransaction, bestMatch } = stageMatch;
    if (hasCompetingSameDayCandidate(stage.id, bankTransaction, bestMatch)) {
      competingSameDaySkipped += 1;
      continue;
    }

    const isExact = Math.abs(bestMatch.amountDiff) < 0.005;
    const isStrictExactStage = stage.id === "strict_same_day_exact" && isExact;
    const aboveThreshold = bestMatch.confidence >= stage.autoConfirmConfidence;
    const matchType = isStrictExactStage && aboveThreshold
      ? "auto_exact"
      : isStrictExactStage
        ? "auto_exact_review"
        : aboveThreshold
          ? "auto_rules"
          : "auto_rules_review";

    pendingMatches.push({
      matchData: {
        periodId: period.id,
        fuelTransactionId: bestMatch.invoice.items[0].id,
        bankTransactionId: bankTransaction.id,
        matchType,
        matchConfidence: String(bestMatch.confidence),
      },
      bankTxId: bankTransaction.id,
      fuelItemIds: bestMatch.invoice.items.map((item) => item.id),
      stageId: stage.id,
    });
  }

  const matchedBankIds = new Set(pendingMatches.map((match) => match.bankTxId));
  const unmatchedInPeriodBank = matchableBankTransactions.filter((transaction) => {
    if (matchedBankIds.has(transaction.id)) return false;
    if (!transaction.transactionDate) return false;
    const day = toDateOnly(new Date(transaction.transactionDate).getTime());
    return isWithinPeriodDay(day, periodStartDay, periodEndDay);
  });

  const outOfPeriodCardFuel = transactions.filter((transaction) => {
    if (
      transaction.sourceType !== "fuel" ||
      transaction.isCardTransaction !== "yes" ||
      isDebtorTransaction(transaction) ||
      transaction.matchStatus === "excluded" ||
      !transaction.transactionDate
    ) {
      return false;
    }

    const day = toDateOnly(new Date(transaction.transactionDate).getTime());
    if (Number.isNaN(day)) return false;
    return day < periodStartDay || day > periodEndDay;
  });

  const outOfPeriodInvoices = groupFuelByInvoice(outOfPeriodCardFuel, rules.groupByInvoice);
  const outOfPeriodByDate = new Map<number, FuelInvoice<AutoMatchTransactionLike>[]>();

  for (const invoice of outOfPeriodInvoices) {
    const dayKey = parseDateToDays(invoice.firstDate || "");
    if (dayKey === null) continue;

    for (let offset = -1; offset <= rules.dateWindowDays; offset += 1) {
      const key = dayKey + offset;
      if (!outOfPeriodByDate.has(key)) outOfPeriodByDate.set(key, []);
      outOfPeriodByDate.get(key)?.push(invoice);
    }
  }

  const lagUsedInvoices = new Set<string>();
  const lagExplainedBankIds: string[] = [];

  for (const bankTransaction of unmatchedInPeriodBank) {
    const bankDayKey = parseDateToDays(bankTransaction.transactionDate || "");
    const candidates = bankDayKey !== null
      ? (outOfPeriodByDate.get(bankDayKey) || [])
      : outOfPeriodInvoices;
    const bestMatch = scoreBankToInvoices(
      bankTransaction,
      candidates,
      lagUsedInvoices,
      rules,
    );

    if (!bestMatch) continue;

    lagExplainedBankIds.push(bankTransaction.id);
    lagUsedInvoices.add(bestMatch.invoice.invoiceNumber);
  }

  const matchableCount = matchableBankTransactions.length;
  const matchCount = pendingMatches.length;
  const matchRate = matchableCount > 0
    ? ((matchCount / matchableCount) * 100).toFixed(1)
    : "0";

  const skippedNonCardCount = transactions.filter((transaction) => {
    if (transaction.sourceType !== "fuel" || transaction.isCardTransaction === "yes" || !transaction.transactionDate) {
      return false;
    }

    const day = toDateOnly(new Date(transaction.transactionDate).getTime());
    return isWithinPeriodDay(day, periodStartDay, periodEndDay);
  }).length;

  const warnings = [
    ...(unmatchableBankTransactions.length > 0
      ? [`${unmatchableBankTransactions.length} bank transaction(s) are outside the period date range (${period.startDate} to ${period.endDate}) + ${rules.dateWindowDays}-day window and cannot be matched.`]
      : []),
    ...(competingSameDaySkipped > 0
      ? [`${competingSameDaySkipped} later-pass match(es) were held back because a same-day operational candidate exists and should be reviewed manually.`]
      : []),
  ];

  return {
    pendingMatches,
    lagExplainedBankIds,
    unmatchableBankIds: unmatchableBankTransactions.map((transaction) => transaction.id),
    warnings,
    stages,
    metrics: {
      matchesCreated: matchCount,
      cardTransactionsProcessed: fuelTransactions.length,
      invoicesCreated: fuelInvoices.length,
      bankTransactionsTotal: bankTransactions.length,
      bankTransactionsMatchable: matchableCount,
      bankTransactionsUnmatchable: unmatchableBankTransactions.length,
      bankTransactionsLagExplained: lagExplainedBankIds.length,
      nonCardTransactionsSkipped: skippedNonCardCount,
      matchRate: `${matchRate}%`,
      competingSameDaySkipped,
    },
  };
}

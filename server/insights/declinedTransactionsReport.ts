import type {
  InsightsDeclineBadge,
  InsightsDeclineCardGroup,
  InsightsDeclinesReadModel,
} from "../../shared/periodInsights.ts";
import type {
  DeclineAnalysisResult,
  DeclineAnalysisSuspicious,
  DeclineAnalysisTransaction,
} from "./declineInsights.ts";

function chooseHigherSeverity(
  current: DeclineAnalysisSuspicious["severity"] | undefined,
  next: DeclineAnalysisSuspicious["severity"],
): DeclineAnalysisSuspicious["severity"] {
  const rank = { high: 0, medium: 1, low: 2 };
  if (!current) return next;
  return rank[next] < rank[current] ? next : current;
}

function buildDeclineBadges(
  cardNumber: string,
  transactions: DeclineAnalysisTransaction[],
  suspiciousByCard: Map<string, Map<string, DeclineAnalysisSuspicious["severity"]>>,
): InsightsDeclineBadge[] {
  const badges = Array.from(suspiciousByCard.get(cardNumber)?.entries() || []).map(
    ([label, severity]) => ({ label, severity }),
  );

  const hasLateNight = transactions.some((transaction) => {
    if (!transaction.time) return false;
    const hour = parseInt(transaction.time.split(":")[0] || "0", 10);
    return hour >= 22 || hour < 5;
  });

  if (hasLateNight) {
    badges.push({ label: "Late-night decline", severity: "low" });
  }

  return badges;
}

function stripShortfallSuffix(note: string): string {
  return note.split(/\s+(?:---|--|—|â€”|-)\s+shortfall/i)[0] || note;
}

function buildDeclineGroups(
  declineResult: DeclineAnalysisResult,
): InsightsDeclineCardGroup[] {
  const suspiciousByCard = new Map<
    string,
    Map<string, DeclineAnalysisSuspicious["severity"]>
  >();
  for (const suspicious of declineResult.suspicious) {
    if (!suspicious.cardNumber) continue;
    if (!suspiciousByCard.has(suspicious.cardNumber)) {
      suspiciousByCard.set(suspicious.cardNumber, new Map());
    }
    const existing = suspiciousByCard.get(suspicious.cardNumber)!;
    existing.set(
      suspicious.pattern,
      chooseHigherSeverity(existing.get(suspicious.pattern), suspicious.severity),
    );
  }

  const grouped = new Map<string, DeclineAnalysisTransaction[]>();
  for (const transaction of declineResult.transactions) {
    const cardKey = transaction.cardNumber || transaction.id;
    if (!grouped.has(cardKey)) {
      grouped.set(cardKey, []);
    }
    grouped.get(cardKey)!.push(transaction);
  }

  return Array.from(grouped.entries())
    .sort((left, right) => {
      const leftUnrecovered = left[1].some((transaction) => !transaction.isRecovered);
      const rightUnrecovered = right[1].some((transaction) => !transaction.isRecovered);
      if (leftUnrecovered !== rightUnrecovered) return leftUnrecovered ? -1 : 1;
      return right[1].length - left[1].length;
    })
    .map(([cardKey, transactions]) => {
      const hasUnrecovered = transactions.some((transaction) => !transaction.isRecovered);
      const attendant = transactions.find((transaction) => transaction.attendant)?.attendant || null;
      const items = [...transactions]
        .sort((left, right) => left.time.localeCompare(right.time))
        .map((transaction) => {
          const shortfall = transaction.amount - transaction.recoveredAmount;
          const isPartial = shortfall > 0.5 && transaction.recoveredAmount > 0;
          const outcomeType: "shortfall" | "recovered" | "none" = isPartial
            ? "shortfall"
            : transaction.recoveredAmount > 0
              ? "recovered"
              : "none";
          return {
            id: transaction.id,
            time: transaction.time,
            type: transaction.type,
            amount: transaction.amount,
            note: transaction.note,
            outcomeLabel: transaction.note
              ? isPartial
                ? `${stripShortfallSuffix(transaction.note)} of R ${transaction.recoveredAmount.toFixed(2)}`
                : transaction.note
              : null,
            recoveredAmount: transaction.recoveredAmount,
            shortfall,
            isRecovered: transaction.isRecovered,
            outcomeType,
          };
        });

      return {
        cardLabel: cardKey,
        bankName: transactions[0]?.bank || "Bank",
        transactionCount: transactions.length,
        attendant,
        statusLabel: hasUnrecovered ? "Unrecovered" : "Recovered",
        badges: buildDeclineBadges(cardKey, transactions, suspiciousByCard),
        items,
      };
    });
}

export function buildDeclinedTransactionsReport(
  declineResult: DeclineAnalysisResult,
): InsightsDeclinesReadModel {
  const banks = new Map<string, { count: number; amount: number }>();
  for (const transaction of declineResult.transactions) {
    const key = transaction.bank || "Unknown";
    const current = banks.get(key) || { count: 0, amount: 0 };
    current.count += 1;
    current.amount += transaction.amount;
    banks.set(key, current);
  }

  return {
    hasDeclined: declineResult.summary.totalDeclined > 0,
    summary: {
      totalDeclined: declineResult.summary.totalDeclined,
      totalDeclinedAmount: declineResult.summary.totalDeclinedAmount,
      resubmittedCount: declineResult.summary.resubmittedCount,
      resubmittedAmount:
        declineResult.summary.totalDeclinedAmount - declineResult.summary.netUnrecoveredAmount,
      unrecoveredCount: declineResult.summary.unrecoveredCount,
      netUnrecoveredAmount: declineResult.summary.netUnrecoveredAmount,
    },
    banks: Array.from(banks.entries())
      .map(([bankName, stats]) => ({
        bankName,
        count: stats.count,
        amount: stats.amount,
      }))
      .sort((left, right) => right.count - left.count),
    groups: buildDeclineGroups(declineResult),
  };
}

/**
 * Retail summary — vertical-specific headline for a retail/POS reconciliation.
 *
 * The story a retail owner wants: total takings split into Cash + Card (which must tie back to the
 * total), and then the Card portion reconciled to what the bank actually settled. Computed straight
 * from the period's transactions — deliberately NOT from the fuel-shaped getPeriodSummary.
 */

export interface RetailSummaryAmount {
  count: number;
  amount: number;
}

export interface RetailSummaryReadModel {
  /** Point-of-sale takings. total === card + cash (the split ties back to the total). */
  sales: {
    total: RetailSummaryAmount;
    card: RetailSummaryAmount;
    cash: RetailSummaryAmount;
  };
  /** Card sales reconciled to the bank. */
  reconciliation: {
    /** % of card sales that matched a bank settlement (by count). The headline reconciliation rate. */
    cardMatchRate: number;
    /** Card POS sales (= sales.card). */
    cardSales: RetailSummaryAmount;
    /** Bank card settlements in the period. */
    bankSettled: RetailSummaryAmount;
    /** Card sales that matched a bank settlement. */
    matched: RetailSummaryAmount;
    /** Card sales with no bank settlement (sale not yet/never settled). */
    unmatchedCard: RetailSummaryAmount;
    /** Bank settlements with no matching sale (investigate). */
    unmatchedBank: RetailSummaryAmount;
    /** Card POS − bank settled. Positive = took more on card than the bank shows. */
    difference: number;
  };
}

export interface RetailSummaryTxn {
  sourceType: string | null;
  isCardTransaction: string | null;
  amount: string;
  transactionDate: string | null;
  matchStatus: string | null;
}

const ZERO: RetailSummaryAmount = { count: 0, amount: 0 };

function add(acc: RetailSummaryAmount, amount: number): RetailSummaryAmount {
  return { count: acc.count + 1, amount: acc.amount + amount };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildRetailSummary(
  transactions: RetailSummaryTxn[],
  salesSideSourceType: string,
  period: { startDate: string; endDate: string },
): RetailSummaryReadModel {
  const inPeriod = (tx: RetailSummaryTxn) =>
    !!tx.transactionDate && tx.transactionDate >= period.startDate && tx.transactionDate <= period.endDate;

  let card = ZERO, cash = ZERO, matched = ZERO, unmatchedCard = ZERO;
  let bankSettled = ZERO, unmatchedBank = ZERO;

  for (const tx of transactions) {
    if (!inPeriod(tx)) continue;
    const value = parseFloat(tx.amount) || 0;
    const isMatched = tx.matchStatus === "matched";

    if (tx.sourceType === salesSideSourceType) {
      if (tx.isCardTransaction === "yes") {
        card = add(card, value);
        if (isMatched) matched = add(matched, value);
        else unmatchedCard = add(unmatchedCard, value);
      } else {
        cash = add(cash, value); // not card → cash (retail has no debtor concept)
      }
    } else if (tx.sourceType?.startsWith("bank")) {
      bankSettled = add(bankSettled, value);
      if (!isMatched) unmatchedBank = add(unmatchedBank, value);
    }
  }

  const total: RetailSummaryAmount = {
    count: card.count + cash.count,
    amount: round(card.amount + cash.amount),
  };

  return {
    sales: {
      total,
      card: { count: card.count, amount: round(card.amount) },
      cash: { count: cash.count, amount: round(cash.amount) },
    },
    reconciliation: {
      cardMatchRate: card.count > 0 ? Math.round((matched.count / card.count) * 100) : 0,
      cardSales: { count: card.count, amount: round(card.amount) },
      bankSettled: { count: bankSettled.count, amount: round(bankSettled.amount) },
      matched: { count: matched.count, amount: round(matched.amount) },
      unmatchedCard: { count: unmatchedCard.count, amount: round(unmatchedCard.amount) },
      unmatchedBank: { count: unmatchedBank.count, amount: round(unmatchedBank.amount) },
      difference: round(card.amount - bankSettled.amount),
    },
  };
}

/**
 * Retail summary — vertical-specific headline for a retail/POS reconciliation.
 *
 * The story a retail owner wants: total takings split into Card + Cash + Other (which must tie back
 * to the total), and then the Card portion reconciled to what the bank actually settled. Computed
 * straight from the period's transactions — deliberately NOT from the fuel-shaped getPeriodSummary.
 *
 * "Cash" means tenders whose payment type says cash (the same shared predicate the cash-gap report
 * uses, so the two surfaces always agree). Everything else non-card — "Other"/EFT/voucher tenders,
 * including refunds booked against them — is surfaced as its own `other` line, never hidden inside
 * the cash figure.
 */

import { isCashPaymentType } from "./cashGap.ts";

export interface RetailSummaryAmount {
  count: number;
  amount: number;
}

export interface RetailSummaryReadModel {
  /** Point-of-sale takings. total === card + cash + other (the split ties back to the total). */
  sales: {
    total: RetailSummaryAmount;
    card: RetailSummaryAmount;
    cash: RetailSummaryAmount;
    /** Non-card, non-cash tenders (e.g. "Other", EFT, vouchers) — surfaced, never folded into cash. */
    other: RetailSummaryAmount;
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
  paymentType: string | null;
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

  let card = ZERO, cash = ZERO, other = ZERO, matched = ZERO, unmatchedCard = ZERO;
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
      } else if (isCashPaymentType(tx.paymentType)) {
        cash = add(cash, value);
      } else {
        other = add(other, value); // non-card, non-cash tenders — never hidden inside cash
      }
    } else if (tx.sourceType?.startsWith("bank")) {
      bankSettled = add(bankSettled, value);
      if (!isMatched) unmatchedBank = add(unmatchedBank, value);
    }
  }

  const total: RetailSummaryAmount = {
    count: card.count + cash.count + other.count,
    amount: round(card.amount + cash.amount + other.amount),
  };

  return {
    sales: {
      total,
      card: { count: card.count, amount: round(card.amount) },
      cash: { count: cash.count, amount: round(cash.amount) },
      other: { count: other.count, amount: round(other.amount) },
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

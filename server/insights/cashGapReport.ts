import {
  buildCashGapView,
  type CashGapView,
  type CashSaleItem,
  type CashSpentItem,
} from "../../shared/cashGap.ts";

/** Minimal shape this report reads — a sales-side transaction as loaded from storage. */
export interface CashGapSaleLike {
  id: string;
  sourceType: string | null;
  paymentType: string | null;
  isCardTransaction: string | null;
  amount: string;
  transactionDate: string | null;
}

/**
 * A sale counts as "cash" when its payment type matches /cash/i. We do NOT rely on
 * `isCardTransaction === 'no'` alone because that bucket includes debtors and other
 * non-card categories — cash is its own category in our model.
 */
export function isCashSale(tx: CashGapSaleLike): boolean {
  if (!tx.paymentType) return false;
  return /\bcash\b/i.test(tx.paymentType);
}

/** The period date window cash sales are bounded to (inclusive, YYYY-MM-DD strings). */
export interface CashGapPeriodBounds {
  startDate: string;
  endDate: string;
}

/**
 * Extract every sales-side cash transaction with a usable date and amount.
 * Period is boss: uploads may span beyond the period (buffer days for matching),
 * so cash sales outside the period dates never count toward the gap.
 */
export function extractCashSales(
  salesTransactions: CashGapSaleLike[],
  bounds: CashGapPeriodBounds,
): CashSaleItem[] {
  const items: CashSaleItem[] = [];
  for (const tx of salesTransactions) {
    if (!isCashSale(tx)) continue;
    if (!tx.transactionDate) continue;
    if (tx.transactionDate < bounds.startDate || tx.transactionDate > bounds.endDate) continue;
    const amount = parseFloat(tx.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    items.push({ id: tx.id, date: tx.transactionDate, amount });
  }
  return items;
}

/** The stored cash-spent row shape we read from. */
export interface CashGapSpentLike {
  id: string;
  amount: string;
  paymentDate: string;
  reason: string;
}

export function buildCashGapReadModel(
  salesTransactions: CashGapSaleLike[],
  received: number | null,
  spent: CashGapSpentLike[],
  bounds: CashGapPeriodBounds,
): CashGapView {
  const cashSales = extractCashSales(salesTransactions, bounds);
  const spentItems: CashSpentItem[] = spent.map((s) => ({
    id: s.id,
    date: s.paymentDate,
    amount: parseFloat(s.amount),
    reason: s.reason,
  }));
  // Pass received through as null — the view distinguishes "not captured" from "explicitly zero".
  return buildCashGapView({
    cashSales,
    received,
    spent: spentItems,
  });
}

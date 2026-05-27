import test from "node:test";
import assert from "node:assert/strict";

import { buildRetailSummary, type RetailSummaryTxn } from "../../shared/retailSummary.ts";

const period = { startDate: "2026-04-25", endDate: "2026-04-25" };

function tx(
  sourceType: string,
  isCard: string | null,
  amount: number,
  matchStatus = "unmatched",
  date = "2026-04-25",
): RetailSummaryTxn {
  return { sourceType, isCardTransaction: isCard, amount: String(amount), transactionDate: date, matchStatus };
}

test("retail summary: total = card + cash, card reconciled to bank", () => {
  const s = buildRetailSummary(
    [
      tx("retail", "yes", 100, "matched"),
      tx("retail", "yes", 50, "unmatched"), // card, not settled
      tx("retail", "no", 30), // cash
      tx("bank", null, 100, "matched"),
      tx("bank", null, 20, "unmatched"), // bank, no sale
    ],
    "retail",
    period,
  );

  assert.equal(s.sales.total.amount, 180); // 150 card + 30 cash
  assert.equal(s.sales.card.amount, 150);
  assert.equal(s.sales.cash.amount, 30);
  assert.equal(s.sales.total.count, 3);

  assert.equal(s.reconciliation.cardMatchRate, 50); // 1 of 2 card sales matched
  assert.equal(s.reconciliation.matched.amount, 100);
  assert.equal(s.reconciliation.unmatchedCard.amount, 50);
  assert.equal(s.reconciliation.bankSettled.amount, 120);
  assert.equal(s.reconciliation.unmatchedBank.amount, 20);
  assert.equal(s.reconciliation.difference, 30); // card 150 − bank 120
});

test("retail summary excludes out-of-period transactions", () => {
  const s = buildRetailSummary(
    [tx("retail", "yes", 100, "matched", "2026-04-20")],
    "retail",
    period,
  );
  assert.equal(s.sales.total.amount, 0);
  assert.equal(s.reconciliation.cardSales.count, 0);
});

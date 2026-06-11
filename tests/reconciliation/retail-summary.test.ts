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
  paymentType: string | null = isCard === "yes" ? "Card" : isCard === "no" ? "Cash" : null,
): RetailSummaryTxn {
  return {
    sourceType,
    isCardTransaction: isCard,
    paymentType,
    amount: String(amount),
    transactionDate: date,
    matchStatus,
  };
}

test("retail summary: total = card + cash + other, card reconciled to bank", () => {
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
  assert.equal(s.sales.other.count, 0);
  assert.equal(s.sales.total.count, 3);

  assert.equal(s.reconciliation.cardMatchRate, 50); // 1 of 2 card sales matched
  assert.equal(s.reconciliation.matched.amount, 100);
  assert.equal(s.reconciliation.unmatchedCard.amount, 50);
  assert.equal(s.reconciliation.bankSettled.amount, 120);
  assert.equal(s.reconciliation.unmatchedBank.amount, 20);
  assert.equal(s.reconciliation.difference, 30); // card 150 − bank 120
});

test("retail summary surfaces non-cash tenders as Other, never folded into cash", () => {
  // Bruchs May 2026: 90 refunds tendered as "Other" were silently netted into the
  // Cash figure, making it disagree with the cash-gap card. Other is its own line.
  const s = buildRetailSummary(
    [
      tx("retail", "yes", 500),
      tx("retail", "no", 200), // cash sale
      tx("retail", "no", -25, "unmatched", "2026-04-25", "Cash"), // cash refund nets off cash
      tx("retail", "no", 80, "unmatched", "2026-04-25", "Other"), // EFT/voucher-style tender
      tx("retail", "no", -40, "unmatched", "2026-04-25", "Other"), // refund booked as Other
    ],
    "retail",
    period,
  );

  assert.equal(s.sales.card.amount, 500);
  assert.equal(s.sales.cash.amount, 175); // 200 − 25, refunds net within cash
  assert.equal(s.sales.other.amount, 40); // 80 − 40, visible — not hidden in cash
  assert.equal(s.sales.other.count, 2);
  assert.equal(s.sales.total.amount, 715); // 500 + 175 + 40 ties back
  assert.equal(s.sales.total.count, 5);
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

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCashGapReadModel,
  extractCashSales,
  isCashSale,
  type CashGapSpentLike,
  type CashGapSaleLike,
} from "../../server/insights/cashGapReport.ts";

function makeSale(overrides: Partial<CashGapSaleLike> = {}): CashGapSaleLike {
  return {
    id: Math.random().toString(36).slice(2),
    sourceType: "retail",
    paymentType: "Cash",
    isCardTransaction: "no",
    amount: "100.00",
    transactionDate: "2026-05-01",
    ...overrides,
  };
}

function makeSpent(overrides: Partial<CashGapSpentLike> = {}): CashGapSpentLike {
  return {
    id: Math.random().toString(36).slice(2),
    amount: "10.00",
    paymentDate: "2026-05-01",
    reason: "food",
    ...overrides,
  };
}

test("isCashSale matches paymentType containing 'cash' case-insensitively", () => {
  assert.equal(isCashSale(makeSale({ paymentType: "Cash" })), true);
  assert.equal(isCashSale(makeSale({ paymentType: "cash" })), true);
  assert.equal(isCashSale(makeSale({ paymentType: "CASH SALE" })), true);
  assert.equal(isCashSale(makeSale({ paymentType: "Card" })), false);
  assert.equal(isCashSale(makeSale({ paymentType: "Debtor" })), false);
  assert.equal(isCashSale(makeSale({ paymentType: null })), false);
  assert.equal(isCashSale(makeSale({ paymentType: "" })), false);
});

test("extractCashSales drops non-cash, zero-amount, and undated rows", () => {
  const sales = extractCashSales([
    makeSale({ paymentType: "Cash", amount: "100", transactionDate: "2026-05-01" }),
    makeSale({ paymentType: "Card", amount: "200", transactionDate: "2026-05-01" }),
    makeSale({ paymentType: "Cash", amount: "0", transactionDate: "2026-05-01" }),
    makeSale({ paymentType: "Cash", amount: "50", transactionDate: null }),
  ]);
  assert.equal(sales.length, 1);
  assert.equal(sales[0].amount, 100);
});

test("buildCashGapReadModel: leak = sum(cash sales) − received; spend feeds cash in hand only", () => {
  const view = buildCashGapReadModel(
    [
      makeSale({ amount: "1000", transactionDate: "2026-05-01" }),
      makeSale({ amount: "500", transactionDate: "2026-05-02" }),
    ],
    800,
    [makeSpent({ amount: "100" }), makeSpent({ amount: "50" })],
  );
  assert.equal(view.state, "ready");
  assert.equal(view.summary.cashSalesAmount, 1500);
  assert.equal(view.summary.received, 800);
  assert.equal(view.summary.spentAmount, 150);
  // leak: 1500 − 800 = 700 (spend does not change it)
  assert.equal(view.summary.discrepancy, 700);
  // cash in hand: 800 − 150 = 650
  assert.equal(view.summary.cashInHand, 650);
});

test("buildCashGapReadModel: received = null → awaiting_input, no fabricated leak", () => {
  const view = buildCashGapReadModel(
    [makeSale({ amount: "500", transactionDate: "2026-05-01" })],
    null,
    [],
  );
  assert.equal(view.state, "awaiting_input");
  assert.equal(view.summary.received, null);
  assert.equal(view.summary.discrepancy, null);
  assert.equal(view.summary.cashSalesAmount, 500);
});

test("buildCashGapReadModel: received = 0 (explicit) → ready, leak is real", () => {
  const view = buildCashGapReadModel(
    [makeSale({ amount: "500", transactionDate: "2026-05-01" })],
    0,
    [],
  );
  assert.equal(view.state, "ready");
  assert.equal(view.summary.discrepancy, 500);
});

test("buildCashGapReadModel: no_cash_data when no cash sales and nothing entered", () => {
  // No POS cash sales (only card), received null, no spend
  const view = buildCashGapReadModel(
    [makeSale({ paymentType: "Card", amount: "1000" })],
    null,
    [],
  );
  assert.equal(view.state, "no_cash_data");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCashGapView,
  calculateCashDiscrepancy,
  type CashGapInputs,
  type CashSaleItem,
  type CashSpentItem,
} from "../../shared/cashGap.ts";

function sale(date: string, amount: number, id = randomId()): CashSaleItem {
  return { id, date, amount };
}

function spent(date: string, amount: number, reason = "food", id = randomId()): CashSpentItem {
  return { id, date, amount, reason };
}

function randomId() {
  return Math.random().toString(36).slice(2);
}

test("the worked example: sales 13000, received 10000, spent 2000 → leak 3000, cash in hand 8000", () => {
  const view = buildCashGapView({
    cashSales: [sale("2026-05-01", 13000)],
    received: 10000,
    spent: [spent("2026-05-01", 2000, "Uber")],
  });
  assert.equal(view.state, "ready");
  // The leak: 13000 − 10000 = 3000. Spend does not touch it.
  assert.equal(view.summary.discrepancy, 3000);
  // Cash in hand: 10000 − 2000 = 8000.
  assert.equal(view.summary.cashInHand, 8000);
});

test("spend NEVER changes the leak — only cash in hand moves", () => {
  const base = { cashSales: [sale("2026-05-01", 13000)], received: 10000 };
  const noSpend = buildCashGapView({ ...base, spent: [] });
  const withSpend = buildCashGapView({ ...base, spent: [spent("2026-05-01", 5000, "stock")] });

  // Same leak regardless of spend.
  assert.equal(noSpend.summary.discrepancy, 3000);
  assert.equal(withSpend.summary.discrepancy, 3000);
  // Cash in hand absorbs the spend.
  assert.equal(noSpend.summary.cashInHand, 10000);
  assert.equal(withSpend.summary.cashInHand, 5000);
});

test("calculateCashDiscrepancy: discrepancy = sales − received", () => {
  const inputs: CashGapInputs = {
    cashSales: [sale("2026-05-01", 1000), sale("2026-05-02", 500)],
    received: 800,
    spent: [spent("2026-05-01", 100), spent("2026-05-02", 50)],
  };
  // 1500 − 800 = 700 (spend is irrelevant to the leak)
  assert.equal(calculateCashDiscrepancy(inputs), 700);
});

test("discrepancy is negative when received exceeds cash sales (more received than rang up)", () => {
  const inputs: CashGapInputs = {
    cashSales: [sale("2026-05-01", 200)],
    received: 300,
    spent: [],
  };
  // 200 − 300 = −100 (surplus — worth a look the other way)
  assert.equal(calculateCashDiscrepancy(inputs), -100);
});

test("calculateCashDiscrepancy returns null when received is null", () => {
  const result = calculateCashDiscrepancy({
    cashSales: [sale("2026-05-01", 1000)],
    received: null,
    spent: [],
  });
  assert.equal(result, null);
});

test("buildCashGapView returns no_cash_data when truly empty (null received, no sales, no spend)", () => {
  const view = buildCashGapView({ cashSales: [], received: null, spent: [] });
  assert.equal(view.state, "no_cash_data");
  assert.equal(view.summary.discrepancy, null);
  assert.equal(view.summary.cashInHand, null);
  assert.deepEqual(view.daily, []);
});

test("buildCashGapView is ready when received is explicitly entered (even as 0)", () => {
  const explicitZero = buildCashGapView({ cashSales: [], received: 0, spent: [] });
  assert.equal(explicitZero.state, "ready");
  assert.equal(explicitZero.summary.discrepancy, 0);

  const onlyReceived = buildCashGapView({ cashSales: [], received: 500, spent: [] });
  assert.equal(onlyReceived.state, "ready");
  // 0 − 500 = −500
  assert.equal(onlyReceived.summary.discrepancy, -500);
});

test("buildCashGapView is awaiting_input when cash sales exist but received is null", () => {
  const view = buildCashGapView({
    cashSales: [sale("2026-05-01", 100), sale("2026-05-02", 200)],
    received: null,
    spent: [],
  });
  assert.equal(view.state, "awaiting_input");
  assert.equal(view.summary.discrepancy, null);
  assert.equal(view.summary.cashInHand, null);
  assert.equal(view.summary.received, null);
  assert.equal(view.summary.cashSalesAmount, 300);
  // Daily breakdown still works — we show what we know
  assert.equal(view.daily.length, 2);
});

test("buildCashGapView is awaiting_input even with spend present, as long as received is null", () => {
  const view = buildCashGapView({
    cashSales: [sale("2026-05-01", 100)],
    received: null,
    spent: [spent("2026-05-01", 20)],
  });
  assert.equal(view.state, "awaiting_input");
  assert.equal(view.summary.discrepancy, null);
});

test("daily breakdown aggregates sales and spend by date", () => {
  const inputs: CashGapInputs = {
    cashSales: [
      sale("2026-05-01", 100),
      sale("2026-05-01", 200),
      sale("2026-05-02", 50),
    ],
    received: 0,
    spent: [
      spent("2026-05-01", 30, "soap"),
      spent("2026-05-03", 80, "deposit book"),
    ],
  };
  const view = buildCashGapView(inputs);

  assert.equal(view.daily.length, 3);

  const day1 = view.daily.find((d) => d.date === "2026-05-01")!;
  assert.equal(day1.cashSalesCount, 2);
  assert.equal(day1.cashSalesAmount, 300);
  assert.equal(day1.spentCount, 1);
  assert.equal(day1.spentAmount, 30);

  const day2 = view.daily.find((d) => d.date === "2026-05-02")!;
  assert.equal(day2.cashSalesCount, 1);
  assert.equal(day2.spentCount, 0);

  const day3 = view.daily.find((d) => d.date === "2026-05-03")!;
  assert.equal(day3.cashSalesCount, 0);
  assert.equal(day3.spentAmount, 80);
});

test("daily rows are sorted by date ascending", () => {
  const view = buildCashGapView({
    cashSales: [sale("2026-05-05", 10), sale("2026-05-02", 10), sale("2026-05-03", 10)],
    received: 0,
    spent: [],
  });
  assert.deepEqual(
    view.daily.map((d) => d.date),
    ["2026-05-02", "2026-05-03", "2026-05-05"],
  );
});

test("summary count fields match input lengths", () => {
  const view = buildCashGapView({
    cashSales: [sale("2026-05-01", 10), sale("2026-05-02", 20)],
    received: 100,
    spent: [spent("2026-05-01", 5), spent("2026-05-02", 10), spent("2026-05-03", 15)],
  });
  assert.equal(view.summary.cashSalesCount, 2);
  assert.equal(view.summary.cashSalesAmount, 30);
  assert.equal(view.summary.received, 100);
  assert.equal(view.summary.spentCount, 3);
  assert.equal(view.summary.spentAmount, 30);
  // discrepancy: 30 − 100 = −70
  assert.equal(view.summary.discrepancy, -70);
  // cash in hand: 100 − 30 = 70
  assert.equal(view.summary.cashInHand, 70);
});

test("decimals: math uses raw numbers — caller is responsible for currency rounding", () => {
  const view = buildCashGapView({
    cashSales: [sale("2026-05-01", 100.33), sale("2026-05-01", 200.67)],
    received: 250.5,
    spent: [spent("2026-05-01", 25.25)],
  });
  // discrepancy: 301 − 250.5 = 50.5
  assert.ok(Math.abs((view.summary.discrepancy ?? 0) - 50.5) < 1e-9);
  // cash in hand: 250.5 − 25.25 = 225.25
  assert.ok(Math.abs((view.summary.cashInHand ?? 0) - 225.25) < 1e-9);
});

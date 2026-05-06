import test from "node:test";
import assert from "node:assert/strict";

import { planAutoMatch } from "../../server/reconciliation/autoMatchPlanner.ts";
import {
  defaultRules,
  makeBankTransaction,
  makeFuelTransaction,
} from "./helpers.ts";

test("planAutoMatch keeps orchestration out of the route while preserving staged matching outcomes", () => {
  const period = {
    id: "period-1",
    name: "26/4",
    startDate: "2026-04-26",
    endDate: "2026-04-26",
  };
  const rules = {
    ...defaultRules,
    groupByInvoice: true,
  };
  const transactions = [
    makeFuelTransaction({
      referenceNumber: "INV-STRICT",
      amount: "100.00",
      transactionTime: "08:00:00",
      cardNumber: "1111",
    }),
    makeFuelTransaction({
      referenceNumber: "INV-OPER",
      amount: "75.00",
      transactionTime: "09:00:00",
      cardNumber: "2222",
    }),
    makeFuelTransaction({
      referenceNumber: "INV-FALLBACK",
      amount: "60.00",
      transactionTime: "12:00:00",
      cardNumber: "3333",
    }),
    makeFuelTransaction({
      referenceNumber: "INV-BOUNDARY",
      amount: "50.00",
      transactionTime: "00:05:00",
      cardNumber: "4444",
    }),
    makeFuelTransaction({
      referenceNumber: "INV-LAST",
      amount: "88.00",
      transactionTime: "23:55:00",
      cardNumber: "6666",
    }),
    makeFuelTransaction({
      referenceNumber: "INV-CASH",
      amount: "40.00",
      transactionTime: "14:00:00",
      isCardTransaction: "no",
    }),
    makeFuelTransaction({
      referenceNumber: "INV-LAG",
      amount: "90.00",
      transactionDate: "2026-04-25",
      transactionTime: "11:00:00",
      cardNumber: "5555",
    }),
    makeBankTransaction({
      id: "bank-strict",
      amount: "100.00",
      transactionDate: "2026-04-26",
      transactionTime: "08:03:00",
      cardNumber: "1111",
    }),
    makeBankTransaction({
      id: "bank-oper",
      amount: "75.75",
      transactionDate: "2026-04-26",
      transactionTime: "09:48:00",
      cardNumber: "2222",
    }),
    makeBankTransaction({
      id: "bank-fallback",
      amount: "60.20",
      transactionDate: "2026-04-27",
      transactionTime: "11:30:00",
      cardNumber: "3333",
    }),
    makeBankTransaction({
      id: "bank-boundary",
      amount: "50.50",
      transactionDate: "2026-04-25",
      transactionTime: "23:58:00",
      cardNumber: "4444",
    }),
    makeBankTransaction({
      id: "bank-lag",
      amount: "90.00",
      transactionDate: "2026-04-26",
      transactionTime: "11:20:00",
      cardNumber: "5555",
    }),
    makeBankTransaction({
      id: "bank-unmatchable",
      amount: "10.00",
      transactionDate: "2026-05-02",
      transactionTime: "10:00:00",
      cardNumber: null,
    }),
  ];

  const plan = planAutoMatch(period, rules, transactions);

  assert.equal(plan.metrics.matchesCreated, 4);
  assert.equal(plan.metrics.cardTransactionsProcessed, 5);
  assert.equal(plan.metrics.bankTransactionsTotal, 6);
  assert.equal(plan.metrics.bankTransactionsMatchable, 5);
  assert.equal(plan.metrics.bankTransactionsUnmatchable, 1);
  assert.equal(plan.metrics.bankTransactionsLagExplained, 1);
  assert.equal(plan.metrics.nonCardTransactionsSkipped, 1);
  assert.equal(plan.metrics.matchRate, "80.0%");
  assert.deepEqual(
    plan.pendingMatches.map((match) => match.stageId).sort(),
    [
      "boundary_transactions",
      "operational_close_match",
      "settlement_fallback",
      "strict_same_day_exact",
    ],
  );
  assert.deepEqual(plan.unmatchableBankIds, ["bank-unmatchable"]);
  assert.deepEqual(plan.lagExplainedBankIds, ["bank-lag"]);
});

test("planAutoMatch reserves exact labels for the strict same-day pass", () => {
  const period = {
    id: "period-2",
    name: "01/5",
    startDate: "2026-05-01",
    endDate: "2026-05-01",
  };
  const rules = {
    ...defaultRules,
    groupByInvoice: true,
  };
  const transactions = [
    makeFuelTransaction({
      id: "fuel-strict",
      referenceNumber: "INV-STRICT-ONLY",
      amount: "100.00",
      transactionDate: "2026-05-01",
      transactionTime: "08:00:00",
      cardNumber: "1111",
    }),
    makeFuelTransaction({
      id: "fuel-middle",
      referenceNumber: "INV-FALLBACK-EXACT",
      amount: "60.00",
      transactionDate: "2026-05-01",
      transactionTime: "12:00:00",
      cardNumber: "2222",
    }),
    makeFuelTransaction({
      id: "fuel-last",
      referenceNumber: "INV-LAST-ONLY",
      amount: "77.00",
      transactionDate: "2026-05-01",
      transactionTime: "18:00:00",
      cardNumber: "3333",
    }),
    makeBankTransaction({
      id: "bank-strict-exact",
      amount: "100.00",
      transactionDate: "2026-05-01",
      transactionTime: "08:02:00",
      cardNumber: "1111",
    }),
    makeBankTransaction({
      id: "bank-fallback-exact",
      amount: "60.00",
      transactionDate: "2026-05-02",
      transactionTime: "12:20:00",
      cardNumber: "2222",
    }),
  ];

  const plan = planAutoMatch(period, rules, transactions);
  const matchTypeByStage = new Map(
    plan.pendingMatches.map((match) => [match.stageId, match.matchData.matchType]),
  );

  assert.equal(matchTypeByStage.get("strict_same_day_exact"), "auto_exact");
  assert.match(matchTypeByStage.get("settlement_fallback") || "", /^auto_rules/);
});

test("planAutoMatch replans previously matched transactions on rerun", () => {
  const period = {
    id: "period-3",
    name: "rerun",
    startDate: "2026-05-01",
    endDate: "2026-05-01",
  };
  const rules = {
    ...defaultRules,
    groupByInvoice: true,
  };
  const transactions = [
    makeFuelTransaction({
      id: "fuel-rerun",
      referenceNumber: "INV-RERUN",
      amount: "120.00",
      transactionDate: "2026-05-01",
      transactionTime: "10:00:00",
      cardNumber: "4444",
      matchStatus: "matched",
    }),
    makeBankTransaction({
      id: "bank-rerun",
      amount: "120.00",
      transactionDate: "2026-05-01",
      transactionTime: "10:04:00",
      cardNumber: "4444",
      matchStatus: "matched",
    }),
  ];

  const plan = planAutoMatch(period, rules, transactions);

  assert.equal(plan.metrics.matchesCreated, 1);
  assert.equal(plan.pendingMatches[0]?.matchData.matchType, "auto_exact");
});

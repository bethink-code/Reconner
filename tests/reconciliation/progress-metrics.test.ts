import test from "node:test";
import assert from "node:assert/strict";

import { deriveAutoMatchProgressMetrics } from "../../shared/reconciliationProgress.ts";

test("deriveAutoMatchProgressMetrics uses invoice wording when invoice grouping is enabled", () => {
  const metrics = deriveAutoMatchProgressMetrics(
    {
      bankStatements: { totalTransactions: 187 },
      fuelSystem: { cardTransactions: 193, matchableInvoices: 186 },
    },
    { groupByInvoice: true },
  );

  assert.deepEqual(metrics, {
    bank: 187,
    fuel: 186,
    fuelLabel: "Fuel card invoices",
  });
});

test("deriveAutoMatchProgressMetrics uses transaction wording when invoice grouping is off", () => {
  const metrics = deriveAutoMatchProgressMetrics(
    {
      bankStatements: { totalTransactions: 187 },
      fuelSystem: { cardTransactions: 193, matchableInvoices: 186 },
    },
    { groupByInvoice: false },
  );

  assert.deepEqual(metrics, {
    bank: 187,
    fuel: 193,
    fuelLabel: "Fuel card transactions",
  });
});

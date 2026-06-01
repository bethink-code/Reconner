import test from "node:test";
import assert from "node:assert/strict";

import { buildMatchingStages } from "../../shared/matchingStages.ts";
import { planAutoMatch } from "../../server/reconciliation/autoMatchPlanner.ts";
import { defaultRules, makeBankTransaction, makeFuelTransaction } from "./helpers.ts";

const RETAIL = { sourceType: "retail", requireCardFlag: true, forceInvoiceGrouping: true, intradayTimeSignal: false } as const;
const period = { id: "period-retail", name: "25/4", startDate: "2026-04-25", endDate: "2026-04-25" };

test("fuel parity: buildMatchingStages default equals the explicit fuel (time-sensitive) config", () => {
  // Fuel callers (and all display callers) omit the option → must get the historical behaviour.
  const byDefault = buildMatchingStages(defaultRules);
  const explicitFuel = buildMatchingStages(defaultRules, { intradayTimeSignal: true });

  assert.deepEqual(byDefault, explicitFuel);
  assert.ok(byDefault.every((stage) => stage.intradayTimeSignal === true));
});

test("retail isolation: planAutoMatch never treats a fuel-typed row as the retail sales side", () => {
  const fixture = [
    // A genuine retail card receipt that should reconcile.
    makeFuelTransaction({
      id: "retail-sale", sourceType: "retail", amount: "100.00",
      transactionDate: "2026-04-25", isCardTransaction: "yes", paymentType: "card",
    }),
    makeBankTransaction({ id: "bank-retail", sourceType: "bank", amount: "100.00", transactionDate: "2026-04-25" }),
    // A stray fuel-typed row + its bank line. If any path still hardcodes source_type='fuel',
    // this would get pulled into the retail reconciliation. It must be ignored.
    makeFuelTransaction({
      id: "fuel-stray", sourceType: "fuel", amount: "200.00",
      transactionDate: "2026-04-25", isCardTransaction: "yes", paymentType: "card",
    }),
    makeBankTransaction({ id: "bank-fuel", sourceType: "bank", amount: "200.00", transactionDate: "2026-04-25" }),
  ];

  const plan = planAutoMatch(period, { ...defaultRules, groupByInvoice: false }, fixture, RETAIL);

  // Only the retail receipt is processed as a sale and matched.
  assert.equal(plan.metrics.cardTransactionsProcessed, 1);
  assert.equal(plan.metrics.matchesCreated, 1);
  assert.equal(plan.pendingMatches[0].bankTxId, "bank-retail");

  // The fuel-typed row is never referenced as a sales item in any match.
  const allSalesIds = plan.pendingMatches.flatMap((m) => m.fuelItemIds);
  assert.ok(!allSalesIds.includes("fuel-stray"));
  assert.ok(!plan.pendingMatches.some((m) => m.bankTxId === "bank-fuel"));
});

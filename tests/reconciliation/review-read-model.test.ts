import test from "node:test";
import assert from "node:assert/strict";

import { buildReviewQueueReadModel } from "../../server/reconciliation/reviewQueueReadModel.ts";
import type {
  MatchingRulesConfig,
  Transaction,
  TransactionResolution,
} from "../../shared/schema";
import {
  defaultRules,
  makeBankTransaction,
  makeFuelTransaction,
} from "./helpers.ts";

function asTransaction(
  base: ReturnType<typeof makeFuelTransaction> | ReturnType<typeof makeBankTransaction>,
  overrides: Partial<Transaction> = {},
): Transaction {
  return {
    id: base.id,
    fileId: "file-1",
    periodId: "period-1",
    sourceType: base.sourceType ?? "fuel",
    sourceName: base.sourceName ?? null,
    rawData: {},
    transactionDate: base.transactionDate,
    transactionTime: base.transactionTime,
    amount: base.amount,
    description: null,
    referenceNumber: base.referenceNumber,
    cardNumber: base.cardNumber,
    paymentType: base.paymentType,
    isCardTransaction: base.isCardTransaction,
    attendant: null,
    cashier: null,
    pump: null,
    matchStatus: base.matchStatus ?? "unmatched",
    matchId: null,
    createdAt: new Date("2026-05-06T10:00:00.000Z"),
    ...overrides,
  };
}

function makeResolution(
  transactionId: string,
  resolutionType: TransactionResolution["resolutionType"],
): TransactionResolution {
  return {
    id: `resolution-${transactionId}-${resolutionType}`,
    transactionId,
    periodId: "period-1",
    resolutionType,
    reason: null,
    notes: resolutionType === "flagged" ? "Needs site follow-up" : null,
    userId: null,
    userName: null,
    userEmail: null,
    linkedTransactionId: null,
    assignee: null,
    createdAt: new Date("2026-05-06T10:00:00.000Z"),
  };
}

test("buildReviewQueueReadModel centralizes review queues, claimed bank visibility, and investigate totals", () => {
  const rules: MatchingRulesConfig = {
    ...defaultRules,
    groupByInvoice: true,
  };

  const fuelQuick = asTransaction(
    makeFuelTransaction({
      amount: "100.00",
      transactionDate: "2026-04-26",
      transactionTime: "10:00:00",
    }),
  );
  const bankQuick = asTransaction(
    makeBankTransaction({
      amount: "100.00",
      transactionDate: "2026-04-26",
      transactionTime: "10:05:00",
    }),
  );

  const fuelInvestigate = asTransaction(
    makeFuelTransaction({
      amount: "80.00",
      transactionDate: "2026-04-26",
      transactionTime: "11:00:00",
    }),
  );
  const bankInvestigate = asTransaction(
    makeBankTransaction({
      amount: "81.50",
      transactionDate: "2026-04-26",
      transactionTime: "11:20:00",
    }),
  );

  const fuelLowValue = asTransaction(
    makeFuelTransaction({
      amount: "20.00",
      transactionDate: "2026-04-26",
      transactionTime: "12:00:00",
    }),
  );
  const fuelResolved = asTransaction(
    makeFuelTransaction({
      amount: "150.00",
      transactionDate: "2026-04-26",
      transactionTime: "13:00:00",
      matchStatus: "matched",
    }),
  );
  const fuelFlagged = asTransaction(
    makeFuelTransaction({
      amount: "70.00",
      transactionDate: "2026-04-26",
      transactionTime: "14:00:00",
    }),
  );

  const bankVisible = asTransaction(
    makeBankTransaction({
      amount: "240.00",
      transactionDate: "2026-04-26",
      transactionTime: "15:00:00",
    }),
  );
  const bankFlagged = asTransaction(
    makeBankTransaction({
      amount: "60.00",
      transactionDate: "2026-04-26",
      transactionTime: "16:00:00",
    }),
  );

  const model = buildReviewQueueReadModel(
    { startDate: "2026-04-26", endDate: "2026-04-26" },
    [
      fuelQuick,
      bankQuick,
      fuelInvestigate,
      bankInvestigate,
      fuelLowValue,
      fuelResolved,
      fuelFlagged,
      bankVisible,
      bankFlagged,
    ],
    [
      makeResolution(fuelResolved.id, "reviewed"),
      makeResolution(fuelFlagged.id, "flagged"),
      makeResolution(bankFlagged.id, "flagged"),
    ],
    rules,
  );

  const fuelCategories = Object.fromEntries(
    model.sides.fuel.transactions.map((item) => [item.transaction.id, item]),
  );

  assert.equal(fuelCategories[fuelQuick.id].category, "quick_win");
  assert.equal(fuelCategories[fuelQuick.id].bestMatch?.transaction.id, bankQuick.id);

  assert.equal(fuelCategories[fuelInvestigate.id].category, "investigate");
  assert.equal(fuelCategories[fuelInvestigate.id].bestMatch?.transaction.id, bankInvestigate.id);
  assert.equal(fuelCategories[fuelInvestigate.id].bestMatch?.stageId, "operational_close_match");

  assert.equal(fuelCategories[fuelLowValue.id].category, "low_value");
  assert.equal(fuelCategories[fuelResolved.id].category, "resolved");

  assert.equal(model.sides.fuel.summary.unresolvedCount, 3);
  assert.equal(model.sides.fuel.summary.unresolvedAmount, 200);
  assert.equal(model.sides.fuel.summary.originalCount, 5);
  assert.equal(model.sides.fuel.summary.matchedCount, 1);
  assert.equal(model.sides.fuel.summary.flaggedCount, 1);

  assert.deepEqual(
    model.sides.bank.transactions.map((item) => item.transaction.id),
    [bankVisible.id],
  );
  assert.equal(model.sides.bank.summary.unresolvedCount, 1);
  assert.equal(model.sides.bank.summary.unresolvedAmount, 240);
  assert.equal(model.sides.bank.summary.originalCount, 2);
  assert.equal(model.sides.bank.summary.flaggedCount, 1);

  assert.equal(model.investigate.totalCount, 2);
  assert.equal(model.investigate.totalAmount, 130);
  assert.equal(model.investigate.bankAmount, 60);
  assert.equal(model.investigate.fuelAmount, 70);
  assert.deepEqual(
    model.investigate.bank.map((item) => item.transaction.id),
    [bankFlagged.id],
  );
  assert.deepEqual(
    model.investigate.fuel.map((item) => item.transaction.id),
    [fuelFlagged.id],
  );
});

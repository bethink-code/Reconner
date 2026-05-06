import test from "node:test";
import assert from "node:assert/strict";

import {
  groupFuelByInvoice,
  parseDateToDays,
  parseTimeToMinutes,
  runSequentialMatchingStages,
} from "../../server/reconciliation/matching.ts";
import { buildMatchingStages } from "../../shared/matchingStages.ts";
import {
  defaultRules,
  makeBankTransaction,
  makeFuelTransaction,
} from "./helpers.ts";

test("groupFuelByInvoice preserves invoice grouping and totals", () => {
  const fuelTransactions = [
    makeFuelTransaction({
      referenceNumber: "INV-100",
      amount: "60.00",
      transactionTime: "08:00:00",
    }),
    makeFuelTransaction({
      referenceNumber: "INV-100",
      amount: "40.00",
      transactionTime: "08:05:00",
    }),
    makeFuelTransaction({
      referenceNumber: "INV-200",
      amount: "55.50",
      transactionTime: "09:00:00",
    }),
  ];

  const invoices = groupFuelByInvoice(fuelTransactions, true);

  assert.equal(invoices.length, 2);
  assert.equal(invoices[0].invoiceNumber, "INV-100");
  assert.equal(invoices[0].totalAmount, 100);
  assert.equal(invoices[0].items.length, 2);
  assert.equal(invoices[1].invoiceNumber, "INV-200");
  assert.equal(invoices[1].totalAmount, 55.5);
});

test("runSequentialMatchingStages preserves strict, operational, boundary, and fallback behavior", () => {
  const stages = buildMatchingStages(defaultRules);
  const fuelTransactions = [
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
      cardNumber: "5555",
    }),
  ];
  const bankTransactions = [
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
  ];

  const matches = runSequentialMatchingStages(
    bankTransactions,
    groupFuelByInvoice(fuelTransactions, true),
    stages,
  );

  assert.equal(matches.length, 4);

  const byStage = new Map(matches.map((match) => [match.stage.id, match]));
  assert.equal(byStage.get("strict_same_day_exact")?.bestMatch.invoice.invoiceNumber, "INV-STRICT");
  assert.equal(byStage.get("operational_close_match")?.bestMatch.invoice.invoiceNumber, "INV-OPER");
  assert.equal(byStage.get("boundary_transactions")?.bestMatch.invoice.invoiceNumber, "INV-BOUNDARY");
  assert.equal(byStage.get("settlement_fallback")?.bestMatch.invoice.invoiceNumber, "INV-FALLBACK");
});

test("runSequentialMatchingStages allows same-day fallback matches beyond the tight operational windows", () => {
  const stages = buildMatchingStages(defaultRules);
  const fuelTransactions = [
    makeFuelTransaction({
      referenceNumber: "INV-SAME-DAY-FALLBACK",
      amount: "2173.55",
      transactionDate: "2026-05-01",
      transactionTime: "07:49:00",
    }),
  ];
  const bankTransactions = [
    makeBankTransaction({
      id: "bank-same-day-fallback",
      amount: "2173.55",
      transactionDate: "2026-05-01",
      transactionTime: "09:55:00",
    }),
  ];

  const matches = runSequentialMatchingStages(
    bankTransactions,
    groupFuelByInvoice(fuelTransactions, true),
    stages,
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].stage.id, "settlement_fallback");
  assert.equal(matches[0].bestMatch.invoice.invoiceNumber, "INV-SAME-DAY-FALLBACK");
});

test("runSequentialMatchingStages prefers card-aligned candidates when card matching is optional", () => {
  const stages = buildMatchingStages(defaultRules);
  const fuelTransactions = [
    makeFuelTransaction({
      referenceNumber: "INV-CARD",
      amount: "100.00",
      transactionTime: "10:00:00",
      cardNumber: "7777",
    }),
  ];
  const bankTransactions = [
    makeBankTransaction({
      id: "bank-card-match",
      amount: "100.00",
      transactionTime: "10:02:00",
      cardNumber: "7777",
    }),
    makeBankTransaction({
      id: "bank-card-mismatch",
      amount: "100.00",
      transactionTime: "10:01:00",
      cardNumber: "9999",
    }),
  ];

  const matches = runSequentialMatchingStages(
    bankTransactions,
    groupFuelByInvoice(fuelTransactions, true),
    stages,
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0].bankTransaction.id, "bank-card-match");
});

test("matching date and time parsers reject empty input and normalize valid values", () => {
  assert.equal(parseTimeToMinutes(""), null);
  assert.equal(parseTimeToMinutes("09:15:00"), 555);
  assert.equal(parseDateToDays(""), null);
  assert.ok(parseDateToDays("2026-04-26") !== null);
});

import test from "node:test";
import assert from "node:assert/strict";

import { planAutoMatch } from "../../server/reconciliation/autoMatchPlanner.ts";
import { defaultRules, makeBankTransaction, makeFuelTransaction } from "./helpers.ts";

/**
 * Retail reconciliation (Bruchs Biltong shape), card-aware.
 * The Loyverse Receipts export carries a Payment type column, so each receipt is flagged
 * card vs cash (isCardTransaction). The retail vertical pre-filters CARD (requireCardFlag: true,
 * like fuel) and matches those to the Nedbank batch. CASH receipts are excluded from matching —
 * they are not flagged for review, even when their amount happens to equal a bank settlement.
 */

const period = { id: "period-retail", name: "25/4", startDate: "2026-04-25", endDate: "2026-04-25" };
const rules = { ...defaultRules, groupByInvoice: false }; // vertical forces grouping itself
const RETAIL = { sourceType: "retail", requireCardFlag: true, forceInvoiceGrouping: true } as const;

function receipt(ref: string, amount: number, time: string, payment: "Card" | "Cash") {
  return makeFuelTransaction({
    sourceType: "retail",
    referenceNumber: ref,
    amount: amount.toFixed(2),
    transactionDate: "2026-04-25",
    transactionTime: time,
    isCardTransaction: payment === "Card" ? "yes" : "no",
    paymentType: payment.toLowerCase(),
    cardNumber: null,
  });
}

test("retail card-aware: card receipts reconcile to the bank; cash is excluded even at a matching amount", () => {
  const fixture = [
    receipt("4-38461", 167.99, "16:41:00", "Card"), // matches a Nedbank settlement
    receipt("4-38458", 140.13, "15:59:00", "Card"), // matches a Nedbank settlement
    receipt("4-38462", 159.49, "16:56:00", "Cash"), // CASH — must NOT match, even though 159.49 is in the batch
    makeBankTransaction({ id: "ned-1", sourceType: "bank", amount: "167.99", transactionDate: "2026-04-25", transactionTime: "16:42:00" }),
    makeBankTransaction({ id: "ned-2", sourceType: "bank", amount: "140.13", transactionDate: "2026-04-25", transactionTime: "16:00:00" }),
    makeBankTransaction({ id: "ned-cashamt", sourceType: "bank", amount: "159.49", transactionDate: "2026-04-25", transactionTime: "16:57:00" }),
  ];

  const plan = planAutoMatch(period, rules, fixture, RETAIL);

  // Only the two CARD receipts reconcile.
  assert.equal(plan.metrics.matchesCreated, 2);
  assert.deepEqual(plan.pendingMatches.map((m) => m.bankTxId).sort(), ["ned-1", "ned-2"]);

  // The R159.49 settlement has a same-amount receipt, but it's CASH → excluded → left for review.
  assert.ok(!plan.pendingMatches.some((m) => m.bankTxId === "ned-cashamt"));
});

test("retail without the card flag would wrongly pull a cash sale into matching", () => {
  // Contrast: if we did NOT pre-filter card (requireCardFlag false), the cash R159.49 receipt
  // would match the R159.49 settlement — the bug the Payment type column lets us avoid.
  const fixture = [
    receipt("4-38462", 159.49, "16:56:00", "Cash"),
    makeBankTransaction({ id: "ned-cashamt", sourceType: "bank", amount: "159.49", transactionDate: "2026-04-25", transactionTime: "16:57:00" }),
  ];

  const cardAware = planAutoMatch(period, rules, fixture, RETAIL);
  assert.equal(cardAware.metrics.matchesCreated, 0); // cash excluded

  const naive = planAutoMatch(period, rules, fixture, { sourceType: "retail", requireCardFlag: false, forceInvoiceGrouping: true });
  assert.equal(naive.metrics.matchesCreated, 1); // would have matched the cash sale
});

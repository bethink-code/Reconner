import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REPRINT_SCAM_RULES,
  clusterReprints,
  isRoundAmount,
} from "../../shared/reprintScam.ts";
import {
  extractReprintCandidates,
  type ReprintScamFuelLike,
} from "../../server/insights/reprintScamReport.ts";

function makeFuel(overrides: Partial<ReprintScamFuelLike> = {}): ReprintScamFuelLike {
  return {
    id: Math.random().toString(36).slice(2),
    sourceType: "fuel",
    isCardTransaction: "yes",
    amount: "400.00",
    transactionDate: "2026-05-01",
    transactionTime: "12:00:00",
    attendant: "Attendant",
    cashier: "Cashier",
    pump: "1",
    cardNumber: null,
    matchStatus: "matched",
    ...overrides,
  };
}

function rules(overrides: Partial<typeof DEFAULT_REPRINT_SCAM_RULES> = {}) {
  return { ...DEFAULT_REPRINT_SCAM_RULES, ...overrides };
}

test("isRoundAmount honours the cents tolerance band", () => {
  assert.equal(isRoundAmount(400.0, rules()), true);
  assert.equal(isRoundAmount(400.05, rules()), true);
  assert.equal(isRoundAmount(399.96, rules()), true);
  assert.equal(isRoundAmount(400.1, rules()), false);
  assert.equal(isRoundAmount(405.0, rules()), false);
  assert.equal(isRoundAmount(0, rules()), false);
});

test("tolerance is a live lever: .05 endings drop out at exact-.00", () => {
  const candidates = extractReprintCandidates([
    makeFuel({ amount: "300.05" }),
    makeFuel({ amount: "300.05" }),
    makeFuel({ amount: "400.00" }),
  ]);

  assert.equal(clusterReprints(candidates, rules({ roundCentsTolerance: 0.05 })).summary.roundAmountCount, 3);
  assert.equal(clusterReprints(candidates, rules({ roundCentsTolerance: 0 })).summary.roundAmountCount, 1);
});

test("strongest suspects: same amount + attendant + cashier, repeated and unsettled", () => {
  // The 1 May screenshot pattern: 3x R300.05 by Letlhogonolo/RETHABILE that never reached the bank.
  const candidates = extractReprintCandidates([
    makeFuel({ amount: "300.05", attendant: "Letlhogonolo", cashier: "RETHABILE", transactionTime: "11:05:00", matchStatus: "unmatched" }),
    makeFuel({ amount: "300.05", attendant: "Letlhogonolo", cashier: "RETHABILE", transactionTime: "11:13:00", matchStatus: "unmatched" }),
    makeFuel({ amount: "300.05", attendant: "Letlhogonolo", cashier: "RETHABILE", transactionTime: "11:48:00", matchStatus: "unmatched" }),
    // A repeated amount that DID settle must not be a suspect group.
    makeFuel({ amount: "400.00", attendant: "Ernest", cashier: "RETHABILE", matchStatus: "matched" }),
    makeFuel({ amount: "400.00", attendant: "Ernest", cashier: "RETHABILE", matchStatus: "matched" }),
  ]);

  const view = clusterReprints(candidates, rules());

  assert.equal(view.summary.suspectGroupCount, 1);
  const suspect = view.topSuspects[0];
  assert.equal(suspect.amount, 300.05);
  assert.equal(suspect.attendant, "Letlhogonolo");
  assert.equal(suspect.cashier, "RETHABILE");
  assert.equal(suspect.count, 3);
  assert.equal(suspect.unmatchedCount, 3);
  assert.equal(suspect.items[0].time, "11:05:00"); // sorted by time
});

test("a single unsettled round amount is not yet a suspect group", () => {
  const candidates = extractReprintCandidates([
    makeFuel({ amount: "300.00", attendant: "Solo", cashier: "C", matchStatus: "unmatched" }),
  ]);
  assert.equal(clusterReprints(candidates, rules()).summary.suspectGroupCount, 0);
});

test("same-day cluster still groups all round-amount sales for the day", () => {
  const candidates = extractReprintCandidates([
    makeFuel({ amount: "300.00", transactionTime: "08:00:00", matchStatus: "matched" }),
    makeFuel({ amount: "400.00", transactionTime: "09:00:00", matchStatus: "matched" }),
    makeFuel({ amount: "500.00", transactionTime: "10:00:00", matchStatus: "unmatched" }),
  ]);

  const view = clusterReprints(candidates, rules());
  assert.equal(view.dayClusters.length, 1);
  assert.equal(view.dayClusters[0].count, 3);
  assert.equal(view.dayClusters[0].unmatchedCount, 1);
});

test("suspect card-tail: a card number reused across round-amount sales is flagged", () => {
  const candidates = extractReprintCandidates([
    makeFuel({ cardNumber: "****1234", matchStatus: "matched" }),
    makeFuel({ cardNumber: "****1234", matchStatus: "unmatched" }),
    makeFuel({ cardNumber: "****9999", matchStatus: "matched" }),
  ]);

  const view = clusterReprints(candidates, rules());
  assert.equal(view.suspectCardTails.length, 1);
  assert.equal(view.suspectCardTails[0].cardTail, "****1234");
  assert.equal(view.suspectCardTails[0].count, 2);
});

test("extractReprintCandidates ignores non-card fuel and bank rows", () => {
  const candidates = extractReprintCandidates([
    makeFuel({ id: "card", amount: "400.00" }),
    makeFuel({ id: "not-card", amount: "400.00", isCardTransaction: "no" }),
    makeFuel({ id: "bank", amount: "400.00", sourceType: "bank" }),
  ]);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, "card");
});

test("no round-amount card sales yields the empty state", () => {
  const candidates = extractReprintCandidates([makeFuel({ amount: "412.35" })]);
  const view = clusterReprints(candidates, rules());
  assert.equal(view.state, "no_round_amounts");
  assert.equal(view.summary.roundAmountCount, 0);
});

import test from "node:test";
import assert from "node:assert/strict";

import { buildMatchAssignments } from "../../server/reconciliation/matchAssignments.ts";

test("buildMatchAssignments tags the bank tx and every fuel item with its match id", () => {
  const assignments = buildMatchAssignments([
    { matchId: "m1", bankTxId: "bank-1", fuelItemIds: ["fuel-1"] },
    { matchId: "m2", bankTxId: "bank-2", fuelItemIds: ["fuel-2", "fuel-3", "fuel-4"] },
  ]);

  assert.deepEqual(assignments, [
    { txId: "bank-1", matchId: "m1" },
    { txId: "fuel-1", matchId: "m1" },
    { txId: "bank-2", matchId: "m2" },
    { txId: "fuel-2", matchId: "m2" },
    { txId: "fuel-3", matchId: "m2" },
    { txId: "fuel-4", matchId: "m2" },
  ]);
});

test("buildMatchAssignments handles an invoice match with no extra items", () => {
  const assignments = buildMatchAssignments([
    { matchId: "m1", bankTxId: "bank-1", fuelItemIds: [] },
  ]);

  assert.deepEqual(assignments, [{ txId: "bank-1", matchId: "m1" }]);
});

test("buildMatchAssignments returns nothing when there are no matches", () => {
  assert.deepEqual(buildMatchAssignments([]), []);
});

test("buildMatchAssignments emits one row per transaction across many matches", () => {
  const pairs = Array.from({ length: 300 }, (_, i) => ({
    matchId: `m${i}`,
    bankTxId: `bank-${i}`,
    fuelItemIds: [`fuel-${i}-a`, `fuel-${i}-b`],
  }));

  const assignments = buildMatchAssignments(pairs);

  // 1 bank + 2 items per match
  assert.equal(assignments.length, 300 * 3);
  // every assignment points at exactly one match, no tx tagged twice
  assert.equal(new Set(assignments.map(a => a.txId)).size, assignments.length);
});

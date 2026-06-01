import test from "node:test";
import assert from "node:assert/strict";

import { scopeToSalesSource } from "../../server/reconciliation/salesSourceQuery.ts";

const FUEL_QUERY = `
  SELECT
    COUNT(CASE WHEN source_type = 'fuel' THEN 1 END) as sales_txns,
    COUNT(CASE WHEN source_type LIKE 'bank%' THEN 1 END) as bank_txns,
    MIN(CASE WHEN source_type = 'fuel' THEN transaction_date END) as sales_min
  FROM transactions WHERE period_id = $1
`;

test("fuel queries are returned byte-for-byte unchanged", () => {
  // The fuel path must never regress — same string in, same string out (no replace at all).
  assert.equal(scopeToSalesSource(FUEL_QUERY, "fuel"), FUEL_QUERY);
});

test("a non-fuel vertical swaps in its sales source, leaving the bank side intact", () => {
  const scoped = scopeToSalesSource(FUEL_QUERY, "retail");

  assert.ok(scoped.includes("source_type = 'retail'"));
  assert.ok(!scoped.includes("source_type = 'fuel'"));
  // bank side untouched
  assert.ok(scoped.includes("source_type LIKE 'bank%'"));
  // every fuel sales-side predicate was rewritten (two in the fixture)
  assert.equal((scoped.match(/source_type = 'retail'/g) || []).length, 2);
});

test("an unrecognised source type is rejected before it can reach the query", () => {
  assert.throws(() => scopeToSalesSource(FUEL_QUERY, "retail'; DROP TABLE transactions; --"), /Unsupported sales source type/);
  assert.throws(() => scopeToSalesSource(FUEL_QUERY, "bank%"), /Unsupported sales source type/);
});

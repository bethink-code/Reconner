/**
 * Pure helper for the auto-match write path.
 *
 * Each created match owns one bank transaction and one or more sales-side
 * (fuel/retail) items. To mark them all `matched`, we need a flat list of
 * (transactionId -> matchId) assignments. The storage layer turns that list
 * into a single batched `UPDATE ... FROM (VALUES ...)` instead of one UPDATE
 * per match, collapsing ~1000 sequential round-trips into a handful.
 */

export interface MatchAssignmentPair {
  matchId: string;
  bankTxId: string;
  fuelItemIds: string[];
}

export interface MatchAssignment {
  txId: string;
  matchId: string;
}

/**
 * Flatten created matches into one (txId -> matchId) row per transaction.
 * The bank transaction and every grouped sales-side item are tagged with the
 * match they belong to. Order is preserved (bank first, then items) so the
 * generated SQL is deterministic and easy to inspect.
 */
export function buildMatchAssignments(pairs: MatchAssignmentPair[]): MatchAssignment[] {
  const assignments: MatchAssignment[] = [];
  for (const pair of pairs) {
    assignments.push({ txId: pair.bankTxId, matchId: pair.matchId });
    for (const fuelItemId of pair.fuelItemIds) {
      assignments.push({ txId: fuelItemId, matchId: pair.matchId });
    }
  }
  return assignments;
}

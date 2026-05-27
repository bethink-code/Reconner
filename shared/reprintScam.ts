/**
 * Reprint-scam (phantom-slip) detection — pure, deterministic, runs on BOTH server and client.
 *
 * The server extracts the period's fuel card sales as candidates; the client re-runs
 * `clusterReprints` live as the owner adjusts the on-report filter (what counts as a "round
 * amount" varies by station, so the owner judges it in the moment — not a hidden setting).
 */

export interface ReprintScamRules {
  /** A "round amount" is a multiple of this many Rand... */
  roundDenomination: number;
  /** ...within this many Rand of that multiple (0 = exact .00 only). */
  roundCentsTolerance: number;
  /** N+ round-amount card sales on one day = a flagged cluster. */
  minClusterSize: number;
  /** A card-tail on N+ round-amount sales = suspect. */
  minCardTailReuse: number;
  /** Same exact amount by the same attendant+cashier, repeated N+ times = a suspect group. */
  minRepeatSameAmount: number;
}

export const DEFAULT_REPRINT_SCAM_RULES: ReprintScamRules = {
  roundDenomination: 10,
  roundCentsTolerance: 0.05,
  minClusterSize: 3,
  minCardTailReuse: 2,
  minRepeatSameAmount: 2,
};

/** Tolerance presets offered as the on-report filter control. */
export const ROUND_TOLERANCE_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "Exact (.00)" },
  { value: 0.05, label: "± 5c" },
  { value: 0.1, label: "± 10c" },
  { value: 0.2, label: "± 20c" },
];

/** One fuel card sale, already extracted from a transaction row. */
export interface ReprintScamItem {
  id: string;
  date: string;
  time: string | null;
  amount: number;
  attendant: string | null;
  cashier: string | null;
  pump: string | null;
  cardTail: string | null;
  matched: boolean;
}

export interface ReprintScamDayCluster {
  date: string;
  count: number;
  totalAmount: number;
  matchedCount: number;
  unmatchedCount: number;
  items: ReprintScamItem[];
}

export interface ReprintScamCardTail {
  cardTail: string;
  count: number;
  totalAmount: number;
  matchedCount: number;
  unmatchedCount: number;
}

/** The real tell: one (attendant + cashier + exact amount) rung up repeatedly, with sales that
 * never reached the bank. Ranked to the top of the report. */
export interface ReprintScamSuspectGroup {
  attendant: string | null;
  cashier: string | null;
  amount: number;
  count: number;
  matchedCount: number;
  unmatchedCount: number;
  unmatchedAmount: number;
  items: ReprintScamItem[];
}

export interface ReprintScamView {
  state: "ready" | "no_round_amounts";
  rules: ReprintScamRules;
  summary: {
    roundAmountCount: number;
    roundAmountTotal: number;
    matchedCount: number;
    unmatchedCount: number;
    unmatchedAmount: number;
    clusterCount: number;
    suspectCardTailCount: number;
    suspectGroupCount: number;
  };
  topSuspects: ReprintScamSuspectGroup[];
  dayClusters: ReprintScamDayCluster[];
  suspectCardTails: ReprintScamCardTail[];
}

/** Server → client payload: the raw candidates plus the default filter to seed the control. */
export interface ReprintScamReadModel {
  candidates: ReprintScamItem[];
  defaultRules: ReprintScamRules;
}

/** True when `amount` sits within the cents tolerance of a positive multiple of the denomination. */
export function isRoundAmount(amount: number, rules: ReprintScamRules): boolean {
  if (amount <= 0) return false;
  const nearest = Math.round(amount / rules.roundDenomination) * rules.roundDenomination;
  if (nearest <= 0) return false;
  return Math.abs(amount - nearest) <= rules.roundCentsTolerance + 1e-9;
}

/** Cluster a candidate list under the given rules. Pure — same input, same output, anywhere. */
export function clusterReprints(
  candidates: ReprintScamItem[],
  rules: ReprintScamRules,
): ReprintScamView {
  const roundItems = candidates.filter((item) => isRoundAmount(item.amount, rules));

  if (roundItems.length === 0) {
    return {
      state: "no_round_amounts",
      rules,
      summary: {
        roundAmountCount: 0,
        roundAmountTotal: 0,
        matchedCount: 0,
        unmatchedCount: 0,
        unmatchedAmount: 0,
        clusterCount: 0,
        suspectCardTailCount: 0,
        suspectGroupCount: 0,
      },
      topSuspects: [],
      dayClusters: [],
      suspectCardTails: [],
    };
  }

  const topSuspects = buildTopSuspects(roundItems, rules);
  const dayClusters = buildDayClusters(roundItems, rules);
  const suspectCardTails = buildSuspectCardTails(roundItems, rules);
  const unmatched = roundItems.filter((item) => !item.matched);

  return {
    state: "ready",
    rules,
    summary: {
      roundAmountCount: roundItems.length,
      roundAmountTotal: sumAmount(roundItems),
      matchedCount: roundItems.length - unmatched.length,
      unmatchedCount: unmatched.length,
      unmatchedAmount: sumAmount(unmatched),
      clusterCount: dayClusters.length,
      suspectCardTailCount: suspectCardTails.length,
      suspectGroupCount: topSuspects.length,
    },
    topSuspects,
    dayClusters,
    suspectCardTails,
  };
}

function buildTopSuspects(
  items: ReprintScamItem[],
  rules: ReprintScamRules,
): ReprintScamSuspectGroup[] {
  const byKey = new Map<string, ReprintScamItem[]>();
  for (const item of items) {
    // Same person handling the money, same exact amount.
    const key = `${item.attendant ?? ""}||${item.cashier ?? ""}||${item.amount.toFixed(2)}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(item);
    else byKey.set(key, [item]);
  }

  const groups: ReprintScamSuspectGroup[] = [];
  for (const groupItems of byKey.values()) {
    const unmatched = groupItems.filter((item) => !item.matched);
    // A suspect group is a repeated identical amount that didn't fully settle.
    if (groupItems.length < rules.minRepeatSameAmount || unmatched.length === 0) continue;
    const sorted = [...groupItems].sort(compareByTimeThenId);
    groups.push({
      attendant: sorted[0].attendant,
      cashier: sorted[0].cashier,
      amount: sorted[0].amount,
      count: sorted.length,
      matchedCount: sorted.length - unmatched.length,
      unmatchedCount: unmatched.length,
      unmatchedAmount: sumAmount(unmatched),
      items: sorted,
    });
  }

  // Strongest first: most unmatched, then most unmatched value, then largest amount.
  return groups.sort((a, b) => {
    if (a.unmatchedCount !== b.unmatchedCount) return b.unmatchedCount - a.unmatchedCount;
    if (a.unmatchedAmount !== b.unmatchedAmount) return b.unmatchedAmount - a.unmatchedAmount;
    return b.amount - a.amount;
  });
}

function buildDayClusters(
  items: ReprintScamItem[],
  rules: ReprintScamRules,
): ReprintScamDayCluster[] {
  const byDay = new Map<string, ReprintScamItem[]>();
  for (const item of items) {
    const day = item.date || "(no date)";
    const bucket = byDay.get(day);
    if (bucket) bucket.push(item);
    else byDay.set(day, [item]);
  }

  const clusters: ReprintScamDayCluster[] = [];
  for (const [date, dayItems] of byDay) {
    if (dayItems.length < rules.minClusterSize) continue;
    const sorted = [...dayItems].sort(compareByTimeThenId);
    clusters.push({
      date,
      count: sorted.length,
      totalAmount: sumAmount(sorted),
      matchedCount: sorted.filter((item) => item.matched).length,
      unmatchedCount: sorted.filter((item) => !item.matched).length,
      items: sorted,
    });
  }

  // Most suspicious first: most unmatched, then largest cluster, then most recent day.
  return clusters.sort((a, b) => {
    if (a.unmatchedCount !== b.unmatchedCount) return b.unmatchedCount - a.unmatchedCount;
    if (a.count !== b.count) return b.count - a.count;
    return b.date.localeCompare(a.date);
  });
}

function buildSuspectCardTails(
  items: ReprintScamItem[],
  rules: ReprintScamRules,
): ReprintScamCardTail[] {
  const byTail = new Map<string, ReprintScamItem[]>();
  for (const item of items) {
    if (!item.cardTail) continue;
    const bucket = byTail.get(item.cardTail);
    if (bucket) bucket.push(item);
    else byTail.set(item.cardTail, [item]);
  }

  const tails: ReprintScamCardTail[] = [];
  for (const [cardTail, tailItems] of byTail) {
    if (tailItems.length < rules.minCardTailReuse) continue;
    tails.push({
      cardTail,
      count: tailItems.length,
      totalAmount: sumAmount(tailItems),
      matchedCount: tailItems.filter((item) => item.matched).length,
      unmatchedCount: tailItems.filter((item) => !item.matched).length,
    });
  }

  return tails.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.cardTail.localeCompare(b.cardTail);
  });
}

function sumAmount(items: ReprintScamItem[]): number {
  return items.reduce((total, item) => total + item.amount, 0);
}

function compareByTimeThenId(a: ReprintScamItem, b: ReprintScamItem): number {
  const timeA = a.time || "";
  const timeB = b.time || "";
  if (timeA !== timeB) return timeA.localeCompare(timeB);
  return a.id.localeCompare(b.id);
}

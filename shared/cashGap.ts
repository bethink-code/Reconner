/**
 * Cash Gap calculation — pure, deterministic, runs on BOTH server and client.
 *
 * Two independent figures come out of three inputs. They never touch each other:
 *
 *   Discrepancy (THE LEAK) = POS cash sales − cash received
 *   Cash in hand           = cash received − cash spent
 *
 * The leak is the only number that answers "is money going missing": what the till
 * says came in as cash, versus what the owner says they actually received. You cannot
 * spend cash that never arrived, so documented spend NEVER reduces (or inflates) the
 * leak — it only explains where the received cash went (the cash-in-hand line).
 *
 * The server extracts POS cash sales from the period's transactions. The owner captures
 * the received total and the cash-spent list. This module joins them and produces a view.
 */

export interface CashSaleItem {
  id: string;
  date: string;
  amount: number;
}

export interface CashSpentItem {
  id: string;
  date: string;
  amount: number;
  reason: string;
}

export interface CashGapInputs {
  cashSales: CashSaleItem[];
  /** Null = owner has not entered received yet ("not captured"). 0 = explicitly entered as nothing received. */
  received: number | null;
  spent: CashSpentItem[];
}

export interface CashGapDailyRow {
  date: string;
  cashSalesCount: number;
  cashSalesAmount: number;
  spentCount: number;
  spentAmount: number;
}

export interface CashGapSummary {
  /** POS cash sales — what the till says came in as cash. Automatic, from the data. */
  cashSalesCount: number;
  cashSalesAmount: number;
  /** Null when received hasn't been entered yet. */
  received: number | null;
  /** THE LEAK: cashSalesAmount − received. Null when received is null (we don't fabricate a leak). */
  discrepancy: number | null;
  /** Documented cash spent (food/Uber/etc.) — trusted because the owner captured it. */
  spentCount: number;
  spentAmount: number;
  /** received − spentAmount. What should physically be on hand. Null when received is null. */
  cashInHand: number | null;
}

export type CashGapState =
  | "ready"               // received entered (even as 0) — discrepancy + cash in hand are computed
  | "awaiting_input"      // POS cash sales exist but received is null — soft prompt, no leak shown
  | "no_cash_data";       // nothing at all to talk about — hide entirely

export interface CashGapView {
  state: CashGapState;
  summary: CashGapSummary;
  daily: CashGapDailyRow[];
}

/** Server → client payload: the raw inputs needed to render. */
export interface CashGapReadModel {
  cashSales: CashSaleItem[];
  received: number;
  spent: CashSpentItem[];
}

/**
 * Build the cash-gap view from inputs. Pure — same input, same output.
 *
 * States:
 * - "no_cash_data": nothing to show — auto-hide.
 * - "awaiting_input": POS has cash sales but the owner hasn't told us how much they received.
 *   Surface the cash-sales total as context, but DO NOT fabricate a leak.
 * - "ready": received is entered (even as 0). Discrepancy and cash in hand are computed.
 */
export function buildCashGapView(inputs: CashGapInputs): CashGapView {
  const cashSalesAmount = sumAmounts(inputs.cashSales);
  const spentAmount = sumAmounts(inputs.spent);

  const hasNoData =
    inputs.cashSales.length === 0 &&
    inputs.received === null &&
    inputs.spent.length === 0;

  if (hasNoData) {
    return {
      state: "no_cash_data",
      summary: emptySummary(),
      daily: [],
    };
  }

  if (inputs.received === null) {
    return {
      state: "awaiting_input",
      summary: {
        cashSalesCount: inputs.cashSales.length,
        cashSalesAmount,
        received: null,
        discrepancy: null,
        spentCount: inputs.spent.length,
        spentAmount,
        cashInHand: null,
      },
      daily: buildDailyRows(inputs),
    };
  }

  return {
    state: "ready",
    summary: {
      cashSalesCount: inputs.cashSales.length,
      cashSalesAmount,
      received: inputs.received,
      discrepancy: cashSalesAmount - inputs.received,
      spentCount: inputs.spent.length,
      spentAmount,
      cashInHand: inputs.received - spentAmount,
    },
    daily: buildDailyRows(inputs),
  };
}

/** The headline leak (POS cash − received), or null if received hasn't been entered. */
export function calculateCashDiscrepancy(inputs: CashGapInputs): number | null {
  if (inputs.received === null) return null;
  return sumAmounts(inputs.cashSales) - inputs.received;
}

function emptySummary(): CashGapSummary {
  return {
    cashSalesCount: 0,
    cashSalesAmount: 0,
    received: null,
    discrepancy: null,
    spentCount: 0,
    spentAmount: 0,
    cashInHand: null,
  };
}

function sumAmounts(items: Array<{ amount: number }>): number {
  return items.reduce((acc, item) => acc + item.amount, 0);
}

function buildDailyRows(inputs: CashGapInputs): CashGapDailyRow[] {
  const byDate = new Map<string, CashGapDailyRow>();

  for (const sale of inputs.cashSales) {
    const row = ensureRow(byDate, sale.date);
    row.cashSalesCount += 1;
    row.cashSalesAmount += sale.amount;
  }

  for (const item of inputs.spent) {
    const row = ensureRow(byDate, item.date);
    row.spentCount += 1;
    row.spentAmount += item.amount;
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

function ensureRow(map: Map<string, CashGapDailyRow>, date: string): CashGapDailyRow {
  let row = map.get(date);
  if (!row) {
    row = {
      date,
      cashSalesCount: 0,
      cashSalesAmount: 0,
      spentCount: 0,
      spentAmount: 0,
    };
    map.set(date, row);
  }
  return row;
}

import type { MatchingRulesConfig } from "./schema";

export interface VerificationSummaryOverviewLike {
  bankStatements?: {
    totalTransactions?: number;
  };
  fuelSystem?: {
    cardTransactions?: number;
    matchableInvoices?: number;
  };
}

export interface AutoMatchProgressMetrics {
  bank: number;
  fuel: number;
  fuelLabel: string;
}

export function deriveAutoMatchProgressMetrics(
  overview: VerificationSummaryOverviewLike | undefined,
  rules: Pick<MatchingRulesConfig, "groupByInvoice"> | null | undefined,
): AutoMatchProgressMetrics {
  const bank = overview?.bankStatements?.totalTransactions || 0;
  const cardTransactions = overview?.fuelSystem?.cardTransactions || 0;
  const matchableInvoices = overview?.fuelSystem?.matchableInvoices || 0;
  const groupByInvoice = rules?.groupByInvoice ?? false;

  if (groupByInvoice) {
    return {
      bank,
      fuel: matchableInvoices || cardTransactions,
      fuelLabel: "Fuel card invoices",
    };
  }

  return {
    bank,
    fuel: cardTransactions,
    fuelLabel: "Fuel card transactions",
  };
}

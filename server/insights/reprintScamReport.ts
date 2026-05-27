import {
  DEFAULT_REPRINT_SCAM_RULES,
  type ReprintScamItem,
  type ReprintScamReadModel,
} from "../../shared/reprintScam.ts";

/** Minimal shape this report reads — a fuel transaction as loaded from storage. */
export interface ReprintScamFuelLike {
  id: string;
  sourceType: string | null;
  isCardTransaction: string | null;
  amount: string;
  transactionDate: string | null;
  transactionTime: string | null;
  attendant: string | null;
  cashier: string | null;
  pump: string | null;
  cardNumber: string | null;
  matchStatus: string | null;
}

/** Extract every fuel CARD sale as a candidate. Round-amount filtering happens later, in the
 * client, so the owner can adjust what "round" means live without a re-fetch. */
export function extractReprintCandidates(
  fuelTransactions: ReprintScamFuelLike[],
): ReprintScamItem[] {
  return fuelTransactions
    .filter((tx) => tx.sourceType === "fuel" && tx.isCardTransaction === "yes")
    .map((tx) => ({
      id: tx.id,
      date: tx.transactionDate || "",
      time: tx.transactionTime,
      amount: parseFloat(tx.amount),
      attendant: tx.attendant,
      cashier: tx.cashier,
      pump: tx.pump,
      cardTail: tx.cardNumber,
      matched: tx.matchStatus === "matched",
    }));
}

export function buildReprintScamReadModel(
  fuelTransactions: ReprintScamFuelLike[],
): ReprintScamReadModel {
  return {
    candidates: extractReprintCandidates(fuelTransactions),
    defaultRules: DEFAULT_REPRINT_SCAM_RULES,
  };
}

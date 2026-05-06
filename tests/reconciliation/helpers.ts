import type { MatchingRulesStageInput } from "../../shared/matchingStages.ts";

export interface TestFuelTransaction {
  id: string;
  sourceType: string | null;
  sourceName?: string | null;
  amount: string;
  transactionDate: string;
  transactionTime: string | null;
  cardNumber: string | null;
  referenceNumber: string | null;
  paymentType: string | null;
  isCardTransaction: string | null;
  matchStatus: string | null;
}

export interface TestBankTransaction {
  id: string;
  sourceType: string | null;
  sourceName?: string | null;
  amount: string;
  transactionDate: string;
  transactionTime: string | null;
  cardNumber: string | null;
  referenceNumber: string | null;
  paymentType: string | null;
  isCardTransaction: string | null;
  matchStatus: string | null;
}

export const defaultRules: MatchingRulesStageInput = {
  amountTolerance: 2,
  dateWindowDays: 3,
  timeWindowMinutes: 60,
  attendantSubmissionDelayMinutes: 120,
  requireCardMatch: false,
  minimumConfidence: 60,
  autoMatchThreshold: 85,
};

let fuelCounter = 0;
let bankCounter = 0;

export function makeFuelTransaction(
  overrides: Partial<TestFuelTransaction> = {},
): TestFuelTransaction {
  fuelCounter += 1;

  return {
    id: `fuel-${fuelCounter}`,
    sourceType: "fuel",
    amount: "100.00",
    transactionDate: "2026-04-26",
    transactionTime: "10:00:00",
    cardNumber: null,
    referenceNumber: null,
    paymentType: "card",
    isCardTransaction: "yes",
    matchStatus: "unmatched",
    ...overrides,
  };
}

export function makeBankTransaction(
  overrides: Partial<TestBankTransaction> = {},
): TestBankTransaction {
  bankCounter += 1;

  return {
    id: `bank-${bankCounter}`,
    sourceType: "bank",
    amount: "100.00",
    transactionDate: "2026-04-26",
    transactionTime: "10:00:00",
    cardNumber: null,
    referenceNumber: null,
    paymentType: null,
    isCardTransaction: null,
    matchStatus: "unmatched",
    ...overrides,
  };
}

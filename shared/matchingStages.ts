export interface MatchingRulesStageInput {
  amountTolerance: number;
  dateWindowDays: number;
  timeWindowMinutes: number;
  attendantSubmissionDelayMinutes: number;
  requireCardMatch: boolean;
  minimumConfidence: number;
  autoMatchThreshold: number;
}

export interface MatchingStage {
  id: string;
  name: string;
  description: string;
  order: number;
  maxAmountDiff: number;
  minDateDiffDays: number;
  maxDateDiffDays: number;
  maxTimeDiffMinutes: number | null;
  requireExactAmount: boolean;
  requireCardMatch: boolean;
  minimumConfidence: number;
  autoConfirmConfidence: number;
  boundaryMode: "none" | "boundary";
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export function buildMatchingStages(rules: MatchingRulesStageInput): MatchingStage[] {
  const minimumConfidence = clampPercent(rules.minimumConfidence);
  const autoConfirmConfidence = clampPercent(rules.autoMatchThreshold);

  const strictStage: MatchingStage = {
    id: "strict_same_day_exact",
    name: "Strict Same-Day Exact",
    description: "Exact-amount, same-day matches first. This is the cleanest operational pass.",
    order: 1,
    maxAmountDiff: 0.01,
    minDateDiffDays: 0,
    maxDateDiffDays: 0,
    maxTimeDiffMinutes: rules.attendantSubmissionDelayMinutes,
    requireExactAmount: true,
    requireCardMatch: rules.requireCardMatch,
    minimumConfidence,
    autoConfirmConfidence,
    boundaryMode: "none",
  };

  const closeOperationalStage: MatchingStage = {
    id: "operational_close_match",
    name: "Operational Close Match",
    description: "Then we allow small amount and timing variation for normal same-day settlement only.",
    order: 2,
    maxAmountDiff: Math.max(0.01, rules.amountTolerance),
    minDateDiffDays: 0,
    maxDateDiffDays: 0,
    maxTimeDiffMinutes: rules.timeWindowMinutes,
    requireExactAmount: false,
    requireCardMatch: rules.requireCardMatch,
    minimumConfidence,
    autoConfirmConfidence,
    boundaryMode: "none",
  };

  const boundaryStage: MatchingStage = {
    id: "boundary_transactions",
    name: "Boundary Transactions",
    description: "Checks first-of-day fuel sales against the previous bank day, and last-of-day fuel sales against the next bank day, before broad fallback matching.",
    order: 3,
    maxAmountDiff: Math.max(0.01, Math.min(rules.amountTolerance, 1.0)),
    minDateDiffDays: -1,
    maxDateDiffDays: 1,
    maxTimeDiffMinutes: null,
    requireExactAmount: false,
    requireCardMatch: rules.requireCardMatch,
    minimumConfidence,
    autoConfirmConfidence,
    boundaryMode: "boundary",
  };

  const settlementFallbackStage: MatchingStage = {
    id: "settlement_fallback",
    name: "Settlement Fallback",
    description: "Finally, we use the wider date window for delayed bank settlement and lower-confidence review candidates.",
    order: 4,
    maxAmountDiff: Math.max(0.01, rules.amountTolerance),
    minDateDiffDays: 0,
    maxDateDiffDays: Math.max(rules.dateWindowDays, 0),
    maxTimeDiffMinutes: null,
    requireExactAmount: false,
    requireCardMatch: rules.requireCardMatch,
    minimumConfidence,
    autoConfirmConfidence,
    boundaryMode: "none",
  };

  return [
    strictStage,
    closeOperationalStage,
    boundaryStage,
    settlementFallbackStage,
  ].filter((stage, index, stages) => {
    if (stage.id === "settlement_fallback" && stage.maxDateDiffDays <= stages[1].maxDateDiffDays) {
      return false;
    }
    return true;
  });
}

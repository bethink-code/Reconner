import type { TransactionResolution } from "../../shared/schema";
import { deriveSummaryStats } from "../../shared/reconciliationDerivedStats.ts";
import type {
  DashboardResolutionCounts,
  ResultsDashboardReadModel,
} from "../../shared/reconciliationDashboard.ts";
import type { PeriodSummary } from "../storage";

function buildResolutionCounts(
  summary: PeriodSummary,
  resolutions: TransactionResolution[],
): DashboardResolutionCounts {
  const linked = resolutions.filter((resolution) => resolution.resolutionType === "linked").length;
  const flagged = resolutions.filter((resolution) => resolution.resolutionType === "flagged").length;
  const dismissed = resolutions.filter((resolution) => resolution.resolutionType === "dismissed").length;
  const partial = resolutions.filter((resolution) => resolution.resolutionType === "partial").length;
  const resolved = resolutions.filter((resolution) => resolution.resolutionType !== "flagged").length;
  const review = Math.max(
    0,
    summary.unmatchedBankTransactions + Math.max(0, summary.unmatchedCardTransactions) - resolved - flagged,
  );

  return {
    total: resolutions.length,
    linked,
    flagged,
    dismissed,
    partial,
    resolved,
    review,
    investigate: flagged,
  };
}

export function buildResultsDashboardReadModel(
  summary: PeriodSummary,
  resolutions: TransactionResolution[],
): ResultsDashboardReadModel {
  const stats = deriveSummaryStats(summary);
  const counts = buildResolutionCounts(summary, resolutions);

  return {
    summary,
    stats: {
      bankApprovedAmount: stats.bankApprovedAmount,
      cardMatchPct: stats.cardMatchPct,
      cardOnlyAmount: stats.cardOnlyAmount,
      excludedBank: stats.excludedBank,
      fileSurplus: stats.fileSurplus,
      matchedCardCount: stats.matchedCardCount,
      matchableBankTotal: stats.matchableBankTotal,
      unmatchedBank: stats.unmatchedBank,
      unmatchedFuelCount: stats.unmatchedFuelCount,
      unmatchableBank: stats.unmatchableBank,
    },
    counts,
  };
}

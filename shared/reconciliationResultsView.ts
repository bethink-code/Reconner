import type { ReviewQueueReadModel } from "./reconciliationReview.ts";

export interface ResultsDashboardQueueMetrics {
  investigateCount: number;
  reviewCount: number;
  unmatchedBankAmount: number;
  unmatchedBankCount: number;
  unmatchedFuelAmount: number;
  unmatchedFuelCount: number;
}

export function deriveResultsDashboardQueueMetrics(
  reviewModel: ReviewQueueReadModel,
): ResultsDashboardQueueMetrics {
  const fuelSummary = reviewModel.sides.fuel.summary;
  const bankSummary = reviewModel.sides.bank.summary;

  return {
    investigateCount: reviewModel.investigate.totalCount,
    reviewCount: fuelSummary.unresolvedCount + bankSummary.unresolvedCount,
    unmatchedBankAmount: bankSummary.unresolvedAmount,
    unmatchedBankCount: bankSummary.unresolvedCount,
    unmatchedFuelAmount: fuelSummary.unresolvedAmount,
    unmatchedFuelCount: fuelSummary.unresolvedCount,
  };
}

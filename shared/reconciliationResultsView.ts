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

  // Counts shown as "to review" exclude "no action" (surplus) leftovers — items with no partner to
  // match by nature. Surfacing them would imply there's matching to do when there isn't. The raw
  // unmatched totals still live in the reconciliation (CARD SALES VS BANK) table.
  const fuelAttentionCount = fuelSummary.unresolvedCount - fuelSummary.noActionCount;
  const bankAttentionCount = bankSummary.unresolvedCount - bankSummary.noActionCount;

  return {
    investigateCount: reviewModel.investigate.totalCount,
    reviewCount: fuelAttentionCount + bankAttentionCount,
    unmatchedBankAmount: bankSummary.unresolvedAmount - bankSummary.noActionAmount,
    unmatchedBankCount: bankAttentionCount,
    unmatchedFuelAmount: fuelSummary.unresolvedAmount - fuelSummary.noActionAmount,
    unmatchedFuelCount: fuelAttentionCount,
  };
}

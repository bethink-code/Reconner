import test from "node:test";
import assert from "node:assert/strict";

import { deriveResultsDashboardQueueMetrics } from "../../shared/reconciliationResultsView.ts";
import type { ReviewQueueReadModel } from "../../shared/reconciliationReview.ts";
import type { MatchingRulesConfig } from "../../shared/schema.ts";
import { defaultRules } from "./helpers.ts";

const matchingRules = {
  ...defaultRules,
  groupByInvoice: true,
} as MatchingRulesConfig;

test("deriveResultsDashboardQueueMetrics uses the canonical review model totals", () => {
  const reviewModel: ReviewQueueReadModel = {
    matchingRules,
    sides: {
      fuel: {
        summary: {
          unresolvedCount: 15,
          unresolvedAmount: 5512.4,
          originalCount: 33,
          originalAmount: 21958.75,
          matchedCount: 12,
          matchedAmount: 16446.35,
          flaggedCount: 0,
          flaggedAmount: 0,
          noActionCount: 0,
          noActionAmount: 0,
        },
        transactions: [],
      },
      bank: {
        summary: {
          unresolvedCount: 12,
          unresolvedAmount: 7533.3,
          originalCount: 19,
          originalAmount: 10733.3,
          matchedCount: 7,
          matchedAmount: 3200,
          flaggedCount: 0,
          flaggedAmount: 0,
          noActionCount: 0,
          noActionAmount: 0,
        },
        transactions: [],
      },
    },
    investigate: {
      totalCount: 3,
      totalAmount: 850,
      bankAmount: 500,
      fuelAmount: 350,
      bank: [],
      fuel: [],
    },
  };

  const metrics = deriveResultsDashboardQueueMetrics(reviewModel);

  assert.deepEqual(metrics, {
    investigateCount: 3,
    reviewCount: 27,
    unmatchedBankAmount: 7533.3,
    unmatchedBankCount: 12,
    unmatchedFuelAmount: 5512.4,
    unmatchedFuelCount: 15,
  });
});

test("deriveResultsDashboardQueueMetrics excludes no-action surplus from the review counts", () => {
  const reviewModel: ReviewQueueReadModel = {
    matchingRules,
    sides: {
      fuel: {
        summary: {
          unresolvedCount: 24, unresolvedAmount: 3037.33,
          originalCount: 1005, originalAmount: 141868.51,
          matchedCount: 981, matchedAmount: 138831.18,
          flaggedCount: 0, flaggedAmount: 0,
          noActionCount: 14, noActionAmount: 1800,
        },
        transactions: [],
      },
      bank: {
        summary: {
          unresolvedCount: 41, unresolvedAmount: 3934.74,
          originalCount: 1018, originalAmount: 142339.65,
          matchedCount: 981, matchedAmount: 138831.18,
          flaggedCount: 0, flaggedAmount: 0,
          noActionCount: 34, noActionAmount: 3100,
        },
        transactions: [],
      },
    },
    investigate: { totalCount: 0, totalAmount: 0, bankAmount: 0, fuelAmount: 0, bank: [], fuel: [] },
  };

  const metrics = deriveResultsDashboardQueueMetrics(reviewModel);

  // 65 raw leftovers (24 + 41) collapse to 17 that actually need attention (10 + 7).
  assert.equal(metrics.reviewCount, 17);
  assert.equal(metrics.unmatchedFuelCount, 10);
  assert.equal(metrics.unmatchedBankCount, 7);
  assert.equal(Math.round(metrics.unmatchedBankAmount * 100) / 100, 834.74);
});

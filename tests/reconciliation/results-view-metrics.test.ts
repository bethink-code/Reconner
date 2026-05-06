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

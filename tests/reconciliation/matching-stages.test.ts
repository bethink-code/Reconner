import test from "node:test";
import assert from "node:assert/strict";

import { buildMatchingStages } from "../../shared/matchingStages.ts";
import { defaultRules } from "./helpers.ts";

test("buildMatchingStages returns the ordered staged passes", () => {
  const stages = buildMatchingStages(defaultRules);

  assert.deepEqual(
    stages.map((stage) => stage.id),
    [
      "strict_same_day_exact",
      "operational_close_match",
      "boundary_transactions",
      "settlement_fallback",
    ],
  );

  assert.equal(stages[0].requireExactAmount, true);
  assert.equal(stages[1].maxTimeDiffMinutes, 60);
  assert.equal(stages[2].maxAmountDiff, 1);
  assert.equal(stages[3].minDateDiffDays, 0);
});

test("buildMatchingStages drops settlement fallback when the wider date window is closed", () => {
  const stages = buildMatchingStages({
    ...defaultRules,
    dateWindowDays: 0,
  });

  assert.deepEqual(
    stages.map((stage) => stage.id),
    [
      "strict_same_day_exact",
      "operational_close_match",
      "boundary_transactions",
    ],
  );
});

test("buildMatchingStages clamps confidence settings into valid percentages", () => {
  const stages = buildMatchingStages({
    ...defaultRules,
    minimumConfidence: -20,
    autoMatchThreshold: 140,
  });

  for (const stage of stages) {
    assert.equal(stage.minimumConfidence, 0);
    assert.equal(stage.autoConfirmConfidence, 100);
  }
});

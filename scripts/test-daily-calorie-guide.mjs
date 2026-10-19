import assert from "node:assert/strict";
import test from "node:test";
import { estimateDailyCalorieGuide } from "../lib/utils/daily-calorie-guide.ts";

const adult = { age: 30, gender: "male", heightCm: 170, weightKg: 70, goal: "maintain" };

test("adult maintenance uses height, weight, age and a low-to-light activity range", () => {
  assert.deepEqual(estimateDailyCalorieGuide(adult), {
    status: "ready", minKcal: 2250, maxKcal: 2600, broadRange: false,
  });
});

test("goal adjusts only the guide, with modest changes", () => {
  const muscle = estimateDailyCalorieGuide({ ...adult, goal: "build-muscle" });
  const loss = estimateDailyCalorieGuide({ ...adult, goal: "lose-fat" });
  assert.deepEqual(muscle, { status: "ready", minKcal: 2400, maxKcal: 2700, broadRange: false });
  assert.deepEqual(loss, { status: "ready", minKcal: 2050, maxKcal: 2350, broadRange: false });
});

test("unspecified gender shows the full equation-coefficient range", () => {
  assert.deepEqual(estimateDailyCalorieGuide({ ...adult, gender: "prefer-not-to-say" }), {
    status: "ready", minKcal: 2050, maxKcal: 2600, broadRange: true,
  });
});

test("missing, non-adult, underweight and implausibly low targets are not displayed", () => {
  assert.deepEqual(estimateDailyCalorieGuide({ ...adult, age: undefined }), { status: "missing-profile" });
  assert.deepEqual(estimateDailyCalorieGuide({ ...adult, weightKg: Number.NaN }), { status: "missing-profile" });
  assert.deepEqual(estimateDailyCalorieGuide({ ...adult, age: 17 }), { status: "outside-adult-range" });
  assert.deepEqual(estimateDailyCalorieGuide({ ...adult, weightKg: 50, goal: "lose-fat" }), { status: "underweight" });
  assert.deepEqual(estimateDailyCalorieGuide({ ...adult, gender: "female", age: 78, heightCm: 150, weightKg: 40, goal: "maintain" }), { status: "low-estimate" });
});

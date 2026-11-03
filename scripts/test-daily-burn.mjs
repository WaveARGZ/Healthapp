import assert from "node:assert/strict";
import test from "node:test";
import { validateRecord } from "../backend/domain.mjs";
import { burnMinusIntake, dailyBurnId, splitWorkoutRecords } from "../lib/utils/daily-burn.ts";

test("daily burn records stay separate from workout sessions", () => {
  const workout = { id: "workout-one", performedAt: "2026-11-03", createdAt: "2026-11-03T12:00:00Z", exercises: [{ id: "exercise-one", name: "チェストプレス" }] };
  const burn = { id: dailyBurnId("2026-11-03"), performedAt: "2026-11-03", createdAt: "2026-11-03T13:00:00Z", recordType: "daily-burn", caloriesBurned: 2200, exercises: [] };
  const malformedBurn = { ...burn, caloriesBurned: Number.NaN };
  assert.equal(validateRecord("workouts", burn.id, burn, "test-subject"), burn);
  assert.deepEqual(splitWorkoutRecords([workout, burn]), { workouts: [workout], burns: [burn] });
  assert.deepEqual(splitWorkoutRecords([workout, malformedBurn]), { workouts: [workout], burns: [] });
});

test("consumption is subtracted only when both amounts are known", () => {
  assert.equal(burnMinusIntake(2400, 2000), 400);
  assert.equal(burnMinusIntake(1800, 2000), -200);
  assert.equal(burnMinusIntake(0, 2000), -2000);
  assert.equal(burnMinusIntake(null, 2000), null);
  assert.equal(burnMinusIntake(2200, null), null);
});

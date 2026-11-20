import assert from "node:assert/strict";
import test from "node:test";
import { summarizeWeeklyMuscles } from "../lib/workouts/weekly-muscle-review.ts";

function workout(date, exercises) {
  return { id: date, performedAt: date, createdAt: `${date}T12:00:00`, exercises };
}

test("selected week groups user-defined exercises and reports the highest recorded set weight", () => {
  const review = summarizeWeeklyMuscles([
    workout("2026-11-15", [{ id: "old", name: "オリジナルプレス", category: "胸", setRecords: [{ id: "1", weightKg: 90, reps: 2, completed: true }] }]),
    workout("2026-11-16", [{ id: "a", name: "オリジナルプレス", category: "胸", setRecords: [{ id: "1", weightKg: 40, reps: 10, completed: true }, { id: "2", weightKg: 50, reps: 5, completed: false }] }]),
    workout("2026-11-18", [{ id: "b", name: "オリジナルプレス", category: "胸", setRecords: [{ id: "1", weightKg: 55, reps: 4, completed: true }] }]),
    workout("2026-11-19", [{ id: "c", name: "レッグプレス", weightKg: 80, reps: 8, sets: 3 }]),
  ], "2026-11-16", "2026-11-22");
  assert.equal(review.activity["胸"], 2);
  assert.equal(review.activity["脚"], 1);
  assert.equal(review.groups["胸"].exercises[0].maxWeightKg, 55);
  assert.equal(review.groups["胸"].exercises[0].repsAtMax, 4);
  assert.deepEqual(review.groups["胸"].exercises[0].dates, ["2026-11-18", "2026-11-16"]);
  assert.equal(review.groups["胸"].exercises[0].recordedSets, 3);
  assert.equal(review.groups["脚"].exercises[0].maxWeightKg, 80);
});

test("unweighted exercises remain unweighted and repeated records count one day", () => {
  const review = summarizeWeeklyMuscles([
    workout("2026-11-17", [{ id: "a", name: "自由腕", category: "腕", setRecords: [{ id: "1", reps: 12, completed: true }] }]),
    workout("2026-11-17", [{ id: "b", name: "自由腕", category: "腕", setRecords: [{ id: "1", reps: 10, completed: false }] }]),
  ], "2026-11-16", "2026-11-22");
  assert.equal(review.activity["腕"], 1);
  assert.equal(review.groups["腕"].exercises[0].maxWeightKg, null);
  assert.equal(review.groups["腕"].exercises[0].recordedSets, 2);
});

test("旧名と新しい表示名で登録したベンチプレスを同じ種目として集計する", () => {
  const review = summarizeWeeklyMuscles([
    workout("2026-11-19", [{ id: "old", name: "バーベルベンチプレス", weightKg: 60, reps: 5, sets: 1 }]),
    workout("2026-11-20", [{ id: "new", name: "ベンチプレス", category: "胸", weightKg: 65, reps: 5, sets: 1 }]),
  ], "2026-11-16", "2026-11-22");
  assert.equal(review.groups["胸"].exercises.length, 1);
  assert.equal(review.groups["胸"].exercises[0].name, "ベンチプレス");
  assert.equal(review.groups["胸"].exercises[0].maxWeightKg, 65);
  assert.equal(review.groups["胸"].exercises[0].recordedSets, 2);
});

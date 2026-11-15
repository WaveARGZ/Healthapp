import assert from "node:assert/strict";
import test from "node:test";
import { getWorkoutDayPlan, getWorkoutWeek } from "../lib/workouts/workout-split.ts";
import { normalizeWorkoutPreferences } from "../types/workout-preferences.ts";

test("5分割は週5日トレーニング・2日休みで繰り返す", () => {
  const plan = { kind: "five", trainingDays: [1, 2, 3, 4, 5], anchorDate: "2026-10-12" };
  assert.deepEqual(getWorkoutWeek(plan, "2026-10-14").map((day) => day.label), ["胸", "背中", "肩", "腕", "脚", "休み", "休み"]);
  assert.equal(getWorkoutDayPlan(plan, "2026-10-19").label, "胸");
});

test("3分割は週が変わっても順番をリセットしない", () => {
  const plan = { kind: "three", trainingDays: [1, 2, 3, 4, 5], anchorDate: "2026-10-12" };
  assert.deepEqual(getWorkoutWeek(plan, "2026-10-14").map((day) => day.label), ["胸・腕", "背中・肩", "脚", "胸・腕", "背中・肩", "休み", "休み"]);
  assert.deepEqual(getWorkoutWeek(plan, "2026-10-21").map((day) => day.label), ["脚", "胸・腕", "背中・肩", "脚", "胸・腕", "休み", "休み"]);
  assert.deepEqual(getWorkoutDayPlan(plan, "2026-10-13").categories, ["背中", "肩"]);
  assert.equal(getWorkoutDayPlan(plan, "2026-10-09").label, "脚");
});

test("通う曜日を変更しても選択した回数を保つ", () => {
  const plan = { kind: "three", trainingDays: [0, 1, 3, 4, 6], anchorDate: "2026-10-12" };
  const week = getWorkoutWeek(plan, "2026-10-12");
  assert.equal(week.filter((day) => day.isRest).length, 2);
  assert.deepEqual(week.map((day) => day.label), ["胸・腕", "休み", "背中・肩", "脚", "休み", "胸・腕", "背中・肩"]);
});

test("週2回の5分割は週をまたいで部位を続ける", () => {
  const plan = { kind: "five", trainingDays: [1, 4], anchorDate: "2026-10-12" };
  assert.deepEqual(getWorkoutWeek(plan, "2026-10-12").map((day) => day.label), ["胸", "休み", "休み", "背中", "休み", "休み", "休み"]);
  assert.deepEqual(getWorkoutWeek(plan, "2026-10-19").map((day) => day.label), ["肩", "休み", "休み", "腕", "休み", "休み", "休み"]);
});

test("全身と自由設定は通う曜日だけ提案対象になる", () => {
  const full = { kind: "full", trainingDays: [1, 3, 5], anchorDate: "2026-10-12" };
  assert.equal(getWorkoutDayPlan(full, "2026-10-12").label, "全身");
  assert.ok(getWorkoutDayPlan(full, "2026-10-12").categories.includes("脚"));
  assert.equal(getWorkoutDayPlan(full, "2026-10-13").isRest, true);
  const custom = { kind: "custom", trainingDays: [1, 3], anchorDate: "2026-10-12", customByWeekday: { "1": ["胸", "肩"], "3": ["脚"] } };
  assert.deepEqual(getWorkoutDayPlan(custom, "2026-10-12").categories, ["胸", "肩"]);
  assert.equal(getWorkoutDayPlan(custom, "2026-10-14").label, "脚");
});

test("旧設定や壊れた設定を安全に読み込む", () => {
  const old = normalizeWorkoutPreferences({ favoriteExercises: ["ベンチプレス"] });
  assert.equal(old.splitPlan, undefined);
  const invalid = normalizeWorkoutPreferences({ splitPlan: { kind: "three", trainingDays: [1, 1], anchorDate: "2026-10-12" } });
  assert.equal(invalid.splitPlan, undefined);
  const legacy = normalizeWorkoutPreferences({ splitPlan: { kind: "three", restDays: [0, 6], anchorDate: "2026-10-12" } });
  assert.deepEqual(legacy.splitPlan?.trainingDays, [1, 2, 3, 4, 5]);
  const invalidLegacy = normalizeWorkoutPreferences({ splitPlan: { kind: "three", restDays: [0, 0], anchorDate: "2026-10-12" } });
  assert.equal(invalidLegacy.splitPlan, undefined);
  const valid = normalizeWorkoutPreferences({ splitPlan: { kind: "custom", trainingDays: [1], anchorDate: "2026-10-12", customByWeekday: { "1": ["胸", "脚", "不明"] } } });
  assert.deepEqual(valid.splitPlan?.customByWeekday["1"], ["胸", "脚"]);
  assert.equal(normalizeWorkoutPreferences({ isGymMember: false }).isGymMember, false);
  assert.equal(normalizeWorkoutPreferences({ isGymMember: "false" }).isGymMember, undefined);
});

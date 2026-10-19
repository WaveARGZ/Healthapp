import assert from "node:assert/strict";
import test from "node:test";
import { summarizeDailyFeedback } from "../lib/utils/daily-feedback.ts";
import { summarizeDailyCalories } from "../lib/utils/meal-calories.ts";

const day = "2026-10-19";
const workout = (performedAt, setRecords = []) => ({
  id: performedAt,
  performedAt,
  createdAt: `${performedAt}T12:00:00Z`,
  exercises: [{ id: "exercise", name: "スクワット", setRecords }],
});

test("記録がない日は食事や運動を採点しない", () => {
  const feedback = summarizeDailyFeedback(summarizeDailyCalories([], day), [], day);
  assert.match(feedback.meal.title, /まだありません/);
  assert.match(feedback.workout.title, /記録はありません/);
});

test("未入力カロリーを0 kcalと誤認せず、過不足を判定しない", () => {
  const calories = summarizeDailyCalories([
    { id: "a", recordedAt: day, calories: 180 },
    { id: "b", recordedAt: day },
  ], day);
  const feedback = summarizeDailyFeedback(calories, [], day);
  assert.match(feedback.meal.detail, /入力済み分だけ/);
  assert.doesNotMatch(feedback.meal.title, /180 kcal/);
});

test("完了セットのみ数え、7日間の境界より前の記録は除外する", () => {
  const feedback = summarizeDailyFeedback(summarizeDailyCalories([], day), [
    workout("2026-10-12"),
    workout("2026-10-13"),
    workout(day, [{ id: "a", completed: true }, { id: "b", completed: false }]),
  ], day);
  assert.match(feedback.workout.detail, /直近7日で2日/);
  assert.match(feedback.workout.detail, /完了したセットが1件/);
});

test("休養日か未記録かは推測しない", () => {
  const feedback = summarizeDailyFeedback(summarizeDailyCalories([], day), [workout("2026-10-18")], day);
  assert.match(feedback.workout.detail, /休養日か未記録かは判定しません/);
});

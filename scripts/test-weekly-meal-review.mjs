import assert from "node:assert/strict";
import test from "node:test";
import { reviewEndDate, summarizeWeeklyMealReview } from "../lib/utils/weekly-meal-review.ts";

function meal(id, recordedAt, calories) {
  return { id, recordedAt, mealType: "lunch", name: id, calories, createdAt: `${recordedAt}T12:00:00` };
}

test("week controls move in complete seven-day blocks across a month", () => {
  assert.equal(reviewEndDate("2026-11-02", 0), "2026-11-02");
  assert.equal(reviewEndDate("2026-11-02", 1), "2026-10-26");
  assert.equal(reviewEndDate("2026-11-02", 2), "2026-10-19");
});

test("weekly food summary includes only the selected seven days and preserves unknown calories", () => {
  const entries = [
    meal("older", "2026-10-24", 500),
    meal("known", "2026-10-25", 420),
    meal("unknown", "2026-10-25"),
    meal("end", "2026-10-31", 300),
    meal("future", "2026-11-01", 600),
  ];
  const review = summarizeWeeklyMealReview(entries, "2026-10-31");
  assert.equal(review.startDate, "2026-10-25");
  assert.equal(review.endDate, "2026-10-31");
  assert.equal(review.mealDays, 2);
  assert.equal(review.mealCount, 3);
  assert.equal(review.recordedCalories, 720);
  assert.equal(review.incompleteDays, 1);
  assert.deepEqual(review.days[0], { date: "2026-10-25", mealCount: 2, calories: 420, incomplete: true });
  assert.equal(review.days[6].calories, 300);
  assert.match(review.comment, /入力済み分/);
});

test("a meal with no calories remains unknown rather than zero", () => {
  const review = summarizeWeeklyMealReview([meal("unknown", "2026-11-17")], "2026-11-17");
  assert.equal(review.recordedCalories, 0);
  assert.equal(review.countedDays, 0);
  assert.equal(review.days[6].calories, null);
  assert.equal(review.incompleteDays, 1);
});

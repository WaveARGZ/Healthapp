import { summarizeDailyCalories } from "./meal-calories.ts";
import { burnMinusIntake } from "./daily-burn.ts";
import type { MealEntry } from "../../types/meal";
import type { DailyBurnEntry } from "../../types/workout";

function dayNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value / 86_400_000 : null;
}

function dateAt(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

export function weekStartForDate(date: string): string {
  const day = dayNumber(date) ?? dayNumber("2000-01-03")!;
  const weekday = new Date(day * 86_400_000).getUTCDay();
  return dateAt(day - ((weekday + 6) % 7));
}

export function weekEndForDate(date: string): string {
  return dateAt(dayNumber(weekStartForDate(date))! + 6);
}

export function reviewEndDate(today: string, weeksAgo: number): string {
  const day = dayNumber(today) ?? dayNumber("2000-01-01")!;
  return dateAt(day - Math.max(0, Math.floor(weeksAgo)) * 7);
}

/** A local seven-day summary. Missing nutrition remains unknown, never a zero-calorie day. */
export function summarizeWeeklyMealReview(entries: readonly MealEntry[], endDate: string, burns: readonly DailyBurnEntry[] = []) {
  const endDay = dayNumber(endDate) ?? dayNumber("2000-01-01")!;
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = dateAt(endDay - 6 + index);
    const total = summarizeDailyCalories(entries, date);
    const calories = total.countedMeals > 0 ? Math.round(total.calories) : null;
    const recordedBurn = burns.find((entry) => entry.performedAt === date)?.caloriesBurned;
    const burned = typeof recordedBurn === "number" && Number.isFinite(recordedBurn) && recordedBurn >= 0 ? recordedBurn : null;
    return {
      date,
      mealCount: total.mealCount,
      calories,
      burned,
      balance: burnMinusIntake(burned, calories),
      incomplete: total.missingMeals > 0 || total.partiallyCountedMeals > 0,
    };
  });
  const mealDays = days.filter((day) => day.mealCount > 0).length;
  const mealCount = days.reduce((sum, day) => sum + day.mealCount, 0);
  const countedDays = days.filter((day) => day.calories !== null).length;
  const incompleteDays = days.filter((day) => day.incomplete).length;
  const recordedCalories = days.reduce((sum, day) => sum + (day.calories ?? 0), 0);
  const comment = mealDays === 0
    ? "この7日間の食事記録はまだありません。記録すると、食事を取った日やカロリーの入力状況を確認できます。"
    : incompleteDays > 0
      ? `${mealDays}日に${mealCount}件の食事を記録しました。${incompleteDays}日はカロリー未入力の食事を含むため、合計は入力済み分です。`
      : `${mealDays}日に${mealCount}件の食事を記録しました。食事を記録した日と、入力したカロリーを下で振り返れます。`;
  return { startDate: days[0].date, endDate: days[6].date, days, mealDays, mealCount, countedDays, incompleteDays, recordedCalories, comment };
}

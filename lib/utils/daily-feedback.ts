import type { WorkoutEntry } from "../../types/workout";
import type { summarizeDailyCalories } from "./meal-calories";

export interface DailyFeedbackItem {
  title: string;
  detail: string;
  href: "/meals" | "/workouts";
}

/** Describes recorded facts only. This does not grade nutrition, exercise quality or health. */
export function summarizeDailyFeedback(calories: ReturnType<typeof summarizeDailyCalories>, workouts: readonly WorkoutEntry[], day: string): {
  meal: DailyFeedbackItem;
  workout: DailyFeedbackItem;
} {
  const meal: DailyFeedbackItem = calories.mealCount === 0
    ? { title: "今日の食事記録はまだありません", detail: "食べたものを1つから記録すると、あとで内容をふり返れます。", href: "/meals" }
    : calories.missingMeals > 0 || calories.partiallyCountedMeals > 0
      ? { title: `今日の食事を${calories.mealCount}件記録`, detail: "カロリーが未入力の料理・食事があります。表示される合計は入力済み分だけなので、過不足は判定しません。", href: "/meals" }
      : { title: `今日の食事を${calories.mealCount}件・${Math.round(calories.calories).toLocaleString("ja-JP")} kcal記録`, detail: "カロリーは入力値の合計です。主食・主菜・副菜など、食事の組み合わせも記録から確認できます。", href: "/meals" };

  const firstDay = new Date(`${day}T12:00:00Z`);
  firstDay.setUTCDate(firstDay.getUTCDate() - 6);
  const firstDayKey = firstDay.toISOString().slice(0, 10);
  const recentDays = new Set(workouts.filter((entry) => entry.performedAt >= firstDayKey && entry.performedAt <= day).map((entry) => entry.performedAt));
  const todayWorkouts = workouts.filter((entry) => entry.performedAt === day);
  const completedSets = todayWorkouts.flatMap((entry) => entry.exercises).flatMap((exercise) => exercise.setRecords ?? []).filter((set) => set.completed).length;
  const workout: DailyFeedbackItem = todayWorkouts.length > 0
    ? { title: `今日は筋トレを${todayWorkouts.length}件記録`, detail: `記録上、直近7日で${recentDays.size}日に筋トレしました。${completedSets > 0 ? `今日は完了したセットが${completedSets}件あります。` : "セットの完了状況はまだ分かりません。"}フォームや負荷の適切さは、この記録だけでは判定できません。`, href: "/workouts" }
    : recentDays.size > 0
      ? { title: `直近7日で筋トレを${recentDays.size}日記録`, detail: "今日は筋トレの記録がありません。休養日か未記録かは判定しません。", href: "/workouts" }
      : { title: "直近7日間に筋トレ記録はありません", detail: "運動した日は種目だけでも記録すると、あとで頻度をふり返れます。", href: "/workouts" };

  return { meal, workout };
}

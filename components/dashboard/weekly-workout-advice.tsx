"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { muscleGroups } from "@/lib/workouts/muscle-activity";
import { summarizeWeeklyWorkoutAdvice } from "@/lib/workouts/weekly-advice";
import { reviewEndDate, summarizeWeeklyMealReview } from "@/lib/utils/weekly-meal-review";
import type { MealEntry } from "@/types/meal";
import type { FitnessGoal } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";

interface WeeklyWorkoutAdviceProps {
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  today: string;
  goal: FitnessGoal | null;
  loading: boolean;
  workoutUnavailable: boolean;
  mealUnavailable: boolean;
  profileUnavailable: boolean;
}

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function WeeklyWorkoutAdvice({ workouts, meals, today, goal, loading, workoutUnavailable, mealUnavailable, profileUnavailable }: WeeklyWorkoutAdviceProps) {
  const [weeksAgo, setWeeksAgo] = useState(0);
  const endDate = reviewEndDate(today, weeksAgo);
  const advice = summarizeWeeklyWorkoutAdvice(workouts, endDate, goal);
  const food = summarizeWeeklyMealReview(meals, endDate);
  const earliestDate = [...workouts.map((entry) => entry.performedAt), ...meals.map((entry) => entry.recordedAt)]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today).sort()[0];
  const canGoPrevious = !loading && Boolean(earliestDate && earliestDate < advice.startDate);
  const workoutNamesByDate = new Map<string, string[]>();
  for (const entry of workouts) {
    const names = workoutNamesByDate.get(entry.performedAt) ?? [];
    for (const exercise of entry.exercises) {
      const name = exercise.name.trim();
      if (name && !names.includes(name)) names.push(name);
    }
    workoutNamesByDate.set(entry.performedAt, names);
  }
  const mealNamesByDate = new Map<string, string[]>();
  for (const entry of meals) {
    const names = mealNamesByDate.get(entry.recordedAt) ?? [];
    const name = entry.name.trim();
    if (name && !names.includes(name)) names.push(name);
    mealNamesByDate.set(entry.recordedAt, names);
  }
  return <section aria-labelledby="weekly-workout-advice-title" aria-busy={loading} className="mt-6 overflow-hidden rounded-xl border border-[var(--line)] bg-white sm:mt-8">
    <div className="bg-[var(--sand)] px-6 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-widest text-[var(--sage-deep)]"><Icon name="sparkle" className="size-4" />WEEKLY REVIEW</p>
          <h2 id="weekly-workout-advice-title" className="section-title mt-2">1週間のふり返り</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">{advice.startDate.replaceAll("-", "/")}〜{advice.endDate.replaceAll("-", "/")} · 筋トレと食事の記録</p>
        </div>
        <span className="rounded-full border border-[#c8d8c7] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--sage-deep)]">端末内で自動集計</span>
      </div>
      <div className="mt-5 flex items-center gap-2" aria-label="振り返る週を切り替え">
        <button type="button" onClick={() => setWeeksAgo((value) => value + 1)} disabled={!canGoPrevious} className="min-h-11 rounded-full border border-[var(--line)] bg-white px-4 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--sage-deep)] hover:bg-[var(--sage-soft)] disabled:cursor-not-allowed disabled:opacity-40">前の7日間</button>
        <button type="button" onClick={() => setWeeksAgo((value) => Math.max(0, value - 1))} disabled={weeksAgo === 0} className="min-h-11 rounded-full border border-[var(--line)] bg-white px-4 text-xs font-semibold text-[var(--ink)] transition-colors hover:border-[var(--sage-deep)] hover:bg-[var(--sage-soft)] disabled:cursor-not-allowed disabled:opacity-40">次の7日間</button>
      </div>
      {!loading && !workoutUnavailable && <div className="mt-7 flex flex-wrap gap-x-10 gap-y-5 border-t border-[var(--line)] pt-6">
        {[["記録した日", `${advice.trainingDays}日`], ["筋トレ", `${advice.strengthDays}日`], ["有酸素", `${advice.cardioDays}日`]].map(([label, value]) =>
          <div key={label}><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="metric mt-1 text-2xl font-semibold text-[var(--ink)]">{value}</p></div>) }
      </div>}
    </div>
    {loading || workoutUnavailable ? <p className="px-5 py-6 text-sm text-[var(--muted)] sm:px-6">{loading ? "筋トレ記録を読み込み中…" : "筋トレ記録を読み込めませんでした。再読み込みしてお試しください。"}</p>
      : <div className="px-6 pb-7 pt-6 sm:px-8 sm:pb-9">
        <h3 className="mb-5 text-lg font-bold text-[var(--ink)]">筋トレのふり返り</h3>
        <div className="grid gap-7 lg:grid-cols-[1.15fr_.85fr]">
          <article className="border-b border-[var(--line)] pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
            <h3 className="text-sm font-bold text-[var(--ink)]">続ける力</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{advice.encouragement}</p>
          </article>
          <article className="border-b border-[var(--line)] pb-4 lg:border-b-0 lg:pb-0">
            <h3 className="text-sm font-bold text-[var(--ink)]">部位のバランス</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{advice.balance}</p>
            {advice.trainingDays > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label="部位ごとの記録日数">
              {muscleGroups.map((group) => <span key={group} className={`rounded-full px-2.5 py-1 text-[11px] ${advice.muscleDays[group] > 0 ? "bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "bg-[var(--sand)] text-[var(--muted)]"}`}>{group} {advice.muscleDays[group]}日</span>)}
            </div>}
          </article>
          <article className="lg:col-span-2 lg:border-t lg:border-[var(--line)] lg:pt-6">
            <h3 className="text-sm font-bold text-[var(--ink)]">目標とのつながり</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--ink-soft)]">{profileUnavailable ? "目標を読み込めなかったため、記録とのつながりは表示できません。" : advice.goal}</p>
            {!profileUnavailable && <p className="mt-3 rounded-lg bg-[var(--sand)] px-3 py-2.5 text-xs leading-6 text-[var(--ink-soft)]"><strong className="text-[var(--sage-deep)]">次の一歩：</strong>{advice.nextStep}</p>}
            {!goal && !profileUnavailable && <Link href="/onboarding" className="text-link mt-2">目標を設定<Icon name="arrow-right" className="size-3.5" /></Link>}
          </article>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--line)] pt-3">
          <p className="text-xs leading-5 text-[var(--muted)]">入力された記録だけで作る自動コメントです。部位は種目名から推定し、フォーム・運動強度・体型への効果量は判定できません。外部AIへ記録を送信しません。</p>
          <Link href="/workouts" className="text-link shrink-0">筋トレ記録を見る<Icon name="arrow-right" className="size-3.5" /></Link>
        </div>
      </div>}
    <div className="border-t border-[var(--line)] px-6 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-[var(--ink)]">食事のふり返り</h3><Link href="/meals" className="text-link text-xs">食事記録を見る<Icon name="arrow-right" className="size-3.5" /></Link></div>
      {loading || mealUnavailable ? <p className="mt-5 text-sm text-[var(--muted)]">{loading ? "食事記録を読み込み中…" : "食事記録を読み込めませんでした。"}</p> : <>
        <div className="mt-5 flex flex-wrap gap-x-9 gap-y-4 border-t border-[var(--line)] pt-5">
          {[["記録した日", `${food.mealDays}日`], ["食事", `${food.mealCount}件`], ["入力済みカロリー", food.countedDays > 0 ? `${food.recordedCalories.toLocaleString("ja-JP")} kcal` : "—"]].map(([label, value]) => <div key={label}><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="metric mt-1 text-2xl font-semibold text-[var(--ink)]">{value}</p></div>)}
        </div>
        <p className="mt-5 text-sm leading-7 text-[var(--ink-soft)]">{food.comment}</p>
        {food.incompleteDays > 0 && <p className="mt-2 text-xs leading-6 text-[var(--muted)]">カロリー合計は入力済み分です。未入力の日を0 kcalとして集計していません。</p>}
      </>}
    </div>
    {!loading && !workoutUnavailable && !mealUnavailable && <div className="border-t border-[var(--line)] px-6 py-6 sm:px-8">
      <h3 className="text-sm font-bold text-[var(--ink)]">日ごとの記録</h3>
      <div className="mt-3 divide-y divide-[var(--line)]">{[...food.days].reverse().map((day) => {
        const names = workoutNamesByDate.get(day.date) ?? [];
        const mealNames = mealNamesByDate.get(day.date) ?? [];
        return <div key={day.date} className="grid grid-cols-[4rem_1fr] gap-x-4 gap-y-1 py-3 text-xs sm:grid-cols-[4rem_1fr_1fr]">
          <time dateTime={day.date} className="metric font-semibold text-[var(--ink)]">{shortDate(day.date)}</time>
          <span className="text-[var(--ink-soft)]">筋トレ：{names.length ? `${names.slice(0, 2).join("・")}${names.length > 2 ? ` ほか${names.length - 2}種目` : ""}` : "記録なし"}</span>
          <span className="col-start-2 text-[var(--ink-soft)] sm:col-start-auto">食事：{day.mealCount ? `${day.mealCount}件 · ${day.calories === null ? "カロリー未入力" : `${day.calories.toLocaleString("ja-JP")} kcal${day.incomplete ? "（一部未入力）" : ""}`}${mealNames.length ? ` · ${mealNames.slice(0, 2).join("・")}${mealNames.length > 2 ? " ほか" : ""}` : ""}` : "記録なし"}</span>
        </div>;
      })}</div>
    </div>}
  </section>;
}

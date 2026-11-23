"use client";

import { useState } from "react";
import Link from "next/link";
import { AnatomyFigure } from "@/components/dashboard/anatomy-figure";
import { muscleGroups, type MuscleGroup } from "@/lib/workouts/muscle-activity";
import { summarizeWeeklyWorkoutAdvice } from "@/lib/workouts/weekly-advice";
import { summarizeWeeklyMuscles } from "@/lib/workouts/weekly-muscle-review";
import { reviewEndDate, summarizeWeeklyMealReview, weekEndForDate, weekStartForDate } from "@/lib/utils/weekly-meal-review";
import { summarizeDailyCalories } from "@/lib/utils/meal-calories";
import { mealTypeLabels, type MealEntry } from "@/types/meal";
import type { FitnessGoal } from "@/types/user";
import type { DailyBurnEntry, WorkoutEntry } from "@/types/workout";

interface WeeklyReviewProps {
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  burns: DailyBurnEntry[];
  restingOn: (date: string) => number | null;
  today: string;
  goal: FitnessGoal | null;
  loading: boolean;
  workoutUnavailable: boolean;
  mealUnavailable: boolean;
  burnUnavailable: boolean;
  profileUnavailable: boolean;
}

function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function balanceText(value: number | null): string {
  return value === null ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("ja-JP")}`;
}

function balanceColor(value: number | null): string {
  return value === null || value === 0 ? "var(--ink)" : value > 0 ? "#4d6875" : "#9c5149";
}

export function WeeklyReview({ workouts, meals, burns, restingOn, today, goal, loading, workoutUnavailable, mealUnavailable, burnUnavailable, profileUnavailable }: WeeklyReviewProps) {
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState<MuscleGroup>("胸");
  const currentWeekStart = weekStartForDate(today);
  const currentWeekEnd = weekEndForDate(today);
  const endDate = reviewEndDate(currentWeekEnd, weeksAgo);
  const startDate = weekStartForDate(endDate);
  const recordedDates = [...workouts.map((entry) => entry.performedAt), ...meals.map((entry) => entry.recordedAt), ...burns.map((entry) => entry.performedAt)]
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today).sort();
  const earliestWeek = weekStartForDate(recordedDates[0] ?? today);
  const historyWeeks = Math.round((Date.parse(`${currentWeekStart}T00:00:00Z`) - Date.parse(`${earliestWeek}T00:00:00Z`)) / 604_800_000);
  const selectableWeeks = Math.max(12, historyWeeks) + 1;
  const visibleWorkouts = workouts.filter((entry) => entry.performedAt <= today);
  const visibleMeals = meals.filter((entry) => entry.recordedAt <= today);
  const visibleBurns = burns.filter((entry) => entry.performedAt <= today);
  const advice = summarizeWeeklyWorkoutAdvice(visibleWorkouts, endDate, goal);
  const muscle = summarizeWeeklyMuscles(visibleWorkouts, startDate, endDate);
  const food = summarizeWeeklyMealReview(visibleMeals, endDate, visibleBurns, restingOn);
  const groupDetails = muscle.groups[selectedGroup];

  return <section aria-labelledby="weekly-review-title" aria-busy={loading} className="mt-4 min-w-0 overflow-hidden rounded-lg border border-[var(--line)] bg-white">
    <div className="grid items-end gap-4 border-b border-[var(--line)] bg-white px-5 py-6 sm:px-7 sm:py-7 md:grid-cols-[1fr_auto]">
      <h1 id="weekly-review-title" className="text-[clamp(1.75rem,4vw,2.5rem)] font-bold leading-tight tracking-[-.045em] text-[var(--ink)]">1週間のふり返り</h1>
      <div className="min-w-0">
        <label htmlFor="weekly-review-week" className="text-sm font-semibold text-[var(--ink)]">週を選ぶ
          <select id="weekly-review-week" value={weeksAgo} onChange={(event) => setWeeksAgo(Number(event.target.value))} className="form-input mt-1 block max-w-[26rem] font-semibold">
            {Array.from({ length: selectableWeeks }, (_, offset) => {
              const weekEnd = reviewEndDate(currentWeekEnd, offset);
              const weekStart = weekStartForDate(weekEnd);
              return <option key={weekStart} value={offset}>{weekStart.replaceAll("-", "/")}〜{weekEnd.replaceAll("-", "/")}{offset === 0 ? "（今週）" : ""}</option>;
            })}
          </select>
        </label>
      </div>
    </div>

    <div className="px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="section-title">筋トレ</h2><Link href="/workouts" className="text-link text-sm">記録を見る</Link></div>
      {loading || workoutUnavailable ? <p className="mt-5 text-sm text-[var(--muted)]">{loading ? "筋トレ記録を読み込み中…" : "筋トレ記録を読み込めませんでした。"}</p> : <>
        <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--line)] rounded-md bg-[var(--canvas)] py-3">
          {[["記録日", `${advice.trainingDays}日`], ["筋トレ", `${advice.strengthDays}日`], ["有酸素", `${advice.cardioDays}日`]].map(([label, value]) => <div key={label} className="min-w-0 px-3 sm:px-5"><p className="text-sm text-[var(--muted)]">{label}</p><p className="metric mt-1 text-[1.7rem] font-semibold text-[var(--ink)]">{value}</p></div>)}
        </div>
        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="mb-3 text-sm font-semibold text-[var(--sage-deep)]">部位マップ</p>
            <div className="grid grid-cols-2 gap-2 [&>div]:min-w-0"><AnatomyFigure view="front" activity={muscle.activity} /><AnatomyFigure view="back" activity={muscle.activity} /></div>
            <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="部位を選択">
              {muscleGroups.map((group) => <button key={group} type="button" aria-pressed={selectedGroup === group} aria-label={`${group} ${muscle.groups[group].days}日`} onClick={() => setSelectedGroup(group)} className={`min-h-12 rounded-md border px-2 py-2 text-sm font-semibold transition-colors ${selectedGroup === group ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--sage-deep)]"}`}>{group === "腹筋・体幹" ? "腹筋" : group}<span className="metric ml-1 text-xs">{muscle.groups[group].days}日</span></button>)}
            </div>
          </div>
          <div className="min-w-0 rounded-md border border-[var(--line)] bg-white p-5 sm:p-6">
            <h3 className="text-lg font-bold text-[var(--ink)]">{selectedGroup} <span className="metric ml-2 text-sm font-normal text-[var(--sage-deep)]">{groupDetails.days}日</span></h3>
            {groupDetails.exercises.length === 0 ? <p className="mt-4 text-base text-[var(--muted)]">この週の記録はありません。</p> : <ul className="mt-4 divide-y divide-[var(--line)]">{groupDetails.exercises.map((exercise) => <li key={exercise.name} className="py-3 first:pt-0 last:pb-0">
              <p className="break-words text-base font-semibold text-[var(--ink)]">{exercise.name}</p>
              <p className="metric mt-1 text-base font-semibold text-[var(--sage-deep)]">最高 {exercise.maxWeightKg === null ? "重量未入力" : `${exercise.maxWeightKg.toLocaleString("ja-JP")} kg${exercise.repsAtMax === null ? "" : ` × ${exercise.repsAtMax}回`}`}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{exercise.dates.map(shortDate).join("・")}{exercise.recordedSets > 0 ? ` · ${exercise.recordedSets}セット` : ""}</p>
            </li>)}</ul>}
          </div>
        </div>
        <details className="mt-6 border-t border-[var(--line)] pt-4">
          <summary className="min-h-11 cursor-pointer text-base font-semibold text-[var(--sage-deep)]">週間アドバイスを見る</summary>
          <div className="grid gap-3 pb-2 text-[15px] leading-7 text-[var(--ink-soft)] lg:grid-cols-2">
            <p>{advice.encouragement}<br />{advice.balance}</p>
            <p>{profileUnavailable ? "目標を読み込めなかったため、目標とのつながりは表示できません。" : advice.goal}<br />{!profileUnavailable && <span className="text-[var(--sage-deep)]">次の一歩：{advice.nextStep}</span>}</p>
          </div>
          {!goal && !profileUnavailable && <Link href="/onboarding" className="text-link mt-2 text-sm">目標を設定</Link>}
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">部位は種目名か選択部位から判定。最高重量は登録値です。体型への効果量は判定できません。</p>
        </details>
      </>}
    </div>

    <div className="border-t border-[var(--line)] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="section-title">食事と収支</h2><Link href="/meals" className="text-link text-sm">記録を見る</Link></div>
      <p className="mt-2 text-sm text-[var(--muted)]">収支 = 基礎代謝を含む消費 − 摂取</p>
      {loading || mealUnavailable ? <p className="mt-5 text-sm text-[var(--muted)]">{loading ? "食事記録を読み込み中…" : "食事記録を読み込めませんでした。"}</p> : <>
        {burnUnavailable && <p className="mt-3 text-xs text-[var(--coral)]">消費カロリーを読み込めなかったため、収支を表示できません。</p>}
        <div className="mt-5 divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {food.days.filter((day) => day.date <= today).map((day) => {
            const dayMeals = visibleMeals.filter((entry) => entry.recordedAt === day.date);
            const balance = burnUnavailable ? null : day.balance;
            return <div key={day.date} className="py-4">
              <div className="grid grid-cols-[3.5rem_1fr_1fr] gap-x-3 sm:grid-cols-[5rem_1fr_1fr] sm:gap-x-6">
                <time dateTime={day.date} className="metric pt-5 text-base font-bold text-[var(--ink)]">{shortDate(day.date)}</time>
                <div><p className="text-sm text-[var(--muted)]">摂取</p><p className="metric mt-1 text-xl font-bold text-[var(--ink)]">{day.calories === null ? "—" : day.calories.toLocaleString("ja-JP")}<small className="ml-1 text-xs font-normal">{day.calories !== null ? "kcal" : ""}</small></p>{day.incomplete && <p className="text-xs text-[var(--muted)]">入力済み分</p>}</div>
                <div><p className="text-sm text-[var(--muted)]">収支</p><p className="metric mt-1 text-xl font-bold" style={{ color: balanceColor(balance) }}>{balanceText(balance)}<small className="ml-1 text-xs font-normal">{balance !== null ? "kcal" : ""}</small></p><p className="text-xs font-semibold" style={{ color: balanceColor(balance) }}>{balance === null ? "未計算" : balance > 0 ? "消費が多い" : balance < 0 ? "摂取が多い" : "同じ"}</p>{day.burned !== null && !burnUnavailable && <p className="text-xs text-[var(--muted)]">消費 {day.burned.toLocaleString("ja-JP")} kcal</p>}</div>
              </div>
              {dayMeals.length > 0 && <details className="mt-3 ml-[4.25rem] rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-3 py-1.5 sm:ml-[6.5rem]">
                <summary className="min-h-10 cursor-pointer py-2.5 text-sm font-semibold text-[var(--sage-deep)]">食事の詳細 <span className="ml-1 font-normal text-[var(--muted)]">{dayMeals.length}件</span></summary>
                <ul className="mt-3 divide-y divide-[var(--line)]">{dayMeals.map((meal) => {
                  const calories = summarizeDailyCalories([meal], day.date);
                  return <li key={meal.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">{mealTypeLabels[meal.mealType]}{meal.recordedTime ? ` ${meal.recordedTime}` : ""} · {meal.name}</p>
                    <p className="metric mt-1 text-sm text-[var(--muted)]">{calories.countedMeals > 0 ? `${Math.round(calories.calories).toLocaleString("ja-JP")} kcal` : "カロリー未入力"}</p>
                    {meal.items && meal.items.length > 0 && <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">食品：{meal.items.map((item) => item.name).join("・")}</p>}
                  </li>;
                })}</ul>
              </details>}
            </div>;
          })}
        </div>
        <details className="mt-3 text-sm text-[var(--muted)]"><summary className="min-h-10 cursor-pointer font-semibold text-[var(--sage-deep)]">集計について</summary><p className="pb-2 leading-6">収支は消費と摂取の両方を記録した日に計算します。カロリー未入力の食事を含む日は入力済み分で表示し、記録がない日は0 kcalとは扱いません。</p></details>
      </>}
    </div>
  </section>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AnatomyFigure } from "@/components/dashboard/anatomy-figure";
import { Icon } from "@/components/ui/icon";
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
  return value === null || value === 0 ? "var(--ink)" : value > 0 ? "#9c5149" : "#4d6875";
}

export function WeeklyReview({ workouts, meals, burns, today, goal, loading, workoutUnavailable, mealUnavailable, burnUnavailable, profileUnavailable }: WeeklyReviewProps) {
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
  const food = summarizeWeeklyMealReview(visibleMeals, endDate, visibleBurns);
  const groupDetails = muscle.groups[selectedGroup];

  return <section aria-labelledby="weekly-review-title" aria-busy={loading} className="mt-6 overflow-hidden rounded-xl border border-[var(--line)] bg-white sm:mt-8">
    <div className="bg-[var(--sand)] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-[var(--sage-deep)]">WEEKLY REVIEW</p>
          <h2 id="weekly-review-title" className="section-title mt-2">1週間のふり返り</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">筋トレと食事を、週ごとに確認できます。</p>
        </div>
        <span className="rounded-full border border-[#c8d8c7] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--sage-deep)]">端末内で自動集計</span>
      </div>
      <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-[var(--line)] pt-5">
        <label htmlFor="weekly-review-week" className="text-xs font-semibold text-[var(--ink)]">振り返る週を選択
          <select id="weekly-review-week" value={weeksAgo} onChange={(event) => setWeeksAgo(Number(event.target.value))} className="mt-2 block min-h-11 min-w-[15rem] max-w-full rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold text-[var(--ink)] focus:border-[var(--sage-deep)] focus:outline-none">
            {Array.from({ length: selectableWeeks }, (_, offset) => {
              const weekEnd = reviewEndDate(currentWeekEnd, offset);
              const weekStart = weekStartForDate(weekEnd);
              return <option key={weekStart} value={offset}>{weekStart.replaceAll("-", "/")}〜{weekEnd.replaceAll("-", "/")}{offset === 0 ? "（今週）" : ""}</option>;
            })}
          </select>
        </label>
        <p className="pb-2 text-xs text-[var(--muted)]">選択中：{startDate.replaceAll("-", "/")}〜{endDate.replaceAll("-", "/")}</p>
      </div>
    </div>

    <div className="px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-[var(--ink)]">筋トレのふり返り</h3><Link href="/workouts" className="text-link text-xs">筋トレ記録を見る<Icon name="arrow-right" className="size-3.5" /></Link></div>
      {loading || workoutUnavailable ? <p className="mt-5 text-sm text-[var(--muted)]">{loading ? "筋トレ記録を読み込み中…" : "筋トレ記録を読み込めませんでした。"}</p> : <>
        <div className="mt-5 flex flex-wrap gap-x-9 gap-y-3 border-t border-[var(--line)] pt-5">
          {[["記録した日", `${advice.trainingDays}日`], ["筋トレ", `${advice.strengthDays}日`], ["有酸素", `${advice.cardioDays}日`]].map(([label, value]) => <div key={label}><p className="text-[11px] text-[var(--muted)]">{label}</p><p className="metric mt-1 text-2xl font-semibold text-[var(--ink)]">{value}</p></div>)}
        </div>
        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--sage-deep)]">選択した週の部位マップ</p>
            <div className="grid grid-cols-2 gap-2 [&>div]:min-w-0"><AnatomyFigure view="front" activity={muscle.activity} /><AnatomyFigure view="back" activity={muscle.activity} /></div>
            <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="部位を選択">
              {muscleGroups.map((group) => <button key={group} type="button" aria-pressed={selectedGroup === group} onClick={() => setSelectedGroup(group)} className={`min-h-11 rounded-md border px-2 py-2 text-xs font-semibold transition-colors ${selectedGroup === group ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--sage-deep)]"}`}>{group}<span className="metric ml-1 text-[10px]">{muscle.groups[group].days}日</span></button>)}
            </div>
          </div>
          <div className="relative rounded-xl border border-[#c8d8c7] bg-[var(--sage-soft)] p-5 sm:p-6">
            <span aria-hidden="true" className="absolute -top-2 left-8 size-4 rotate-45 border-l border-t border-[#c8d8c7] bg-[var(--sage-soft)]" />
            <h4 className="text-base font-bold text-[var(--ink)]">{selectedGroup}の登録内容 <span className="metric ml-2 text-sm font-normal text-[var(--sage-deep)]">{groupDetails.days}日</span></h4>
            {groupDetails.exercises.length === 0 ? <p className="mt-4 text-sm text-[var(--muted)]">この週の{selectedGroup}の記録はありません。</p> : <ul className="mt-4 divide-y divide-[#c8d8c7]">{groupDetails.exercises.map((exercise) => <li key={exercise.name} className="py-3 first:pt-0 last:pb-0">
              <p className="break-words text-sm font-semibold text-[var(--ink)]">{exercise.name}</p>
              <p className="metric mt-1 text-sm text-[var(--sage-deep)]">最高重量 {exercise.maxWeightKg === null ? "未入力" : `${exercise.maxWeightKg.toLocaleString("ja-JP")} kg${exercise.repsAtMax === null ? "" : ` × ${exercise.repsAtMax}回`}`}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">登録日 {exercise.dates.map(shortDate).join("・")}{exercise.recordedSets > 0 ? ` · 入力セット ${exercise.recordedSets}` : ""}</p>
            </li>)}</ul>}
          </div>
        </div>
        <div className="mt-6 grid gap-4 border-t border-[var(--line)] pt-5 text-sm leading-7 text-[var(--ink-soft)] lg:grid-cols-2">
          <p>{advice.encouragement}<br />{advice.balance}</p>
          <p>{profileUnavailable ? "目標を読み込めなかったため、目標とのつながりは表示できません。" : advice.goal}<br />{!profileUnavailable && <span className="text-[var(--sage-deep)]">次の一歩：{advice.nextStep}</span>}</p>
        </div>
        {!goal && !profileUnavailable && <Link href="/onboarding" className="text-link mt-2">目標を設定<Icon name="arrow-right" className="size-3.5" /></Link>}
        <p className="mt-4 text-xs leading-6 text-[var(--muted)]">最高重量はこの週に登録されたセットの値です。部位は種目名または選択した部位から判定します。体型への効果量は判定できません。</p>
      </>}
    </div>

    <div className="border-t border-[var(--line)] px-5 py-7 sm:px-8 sm:py-9">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-[var(--ink)]">食事とカロリー収支</h3><Link href="/meals" className="text-link text-xs">食事記録を見る<Icon name="arrow-right" className="size-3.5" /></Link></div>
      <p className="mt-2 text-xs leading-6 text-[var(--muted)]">収支 = 記録した消費 − 摂取。両方の値がある日のみ計算します。</p>
      {loading || mealUnavailable ? <p className="mt-5 text-sm text-[var(--muted)]">{loading ? "食事記録を読み込み中…" : "食事記録を読み込めませんでした。"}</p> : <>
        {burnUnavailable && <p className="mt-3 text-xs text-[var(--coral)]">消費カロリーを読み込めなかったため、収支を表示できません。</p>}
        <div className="mt-5 divide-y divide-[var(--line)] border-t border-[var(--line)]">
          {food.days.map((day) => {
            const dayMeals = visibleMeals.filter((entry) => entry.recordedAt === day.date);
            const future = day.date > today;
            const balance = burnUnavailable ? null : day.balance;
            return <div key={day.date} className="py-4">
              <div className="grid grid-cols-[3.5rem_1fr_1fr] gap-x-3 sm:grid-cols-[5rem_1fr_1fr] sm:gap-x-6">
                <time dateTime={day.date} className="metric pt-4 text-sm font-bold text-[var(--ink)]">{shortDate(day.date)}</time>
                <div><p className="text-[11px] text-[var(--muted)]">摂取カロリー</p><p className="metric mt-1 text-base font-bold text-[var(--ink)] sm:text-xl">{future ? "これから" : day.calories === null ? "—" : day.calories.toLocaleString("ja-JP")}<small className="ml-1 text-[10px] font-normal">{!future && day.calories !== null ? "kcal" : ""}</small></p>{day.incomplete && <p className="text-[10px] text-[var(--muted)]">入力済み分</p>}</div>
                <div><p className="text-[11px] text-[var(--muted)]">収支</p><p className="metric mt-1 text-base font-bold sm:text-xl" style={{ color: balanceColor(balance) }}>{future ? "これから" : balanceText(balance)}<small className="ml-1 text-[10px] font-normal">{!future && balance !== null ? "kcal" : ""}</small></p>{!future && <><p className="text-[10px] font-semibold" style={{ color: balanceColor(balance) }}>{balance === null ? "未計算" : balance > 0 ? "消費が多い" : balance < 0 ? "摂取が多い" : "消費と摂取が同じ"}</p><p className="text-[10px] text-[var(--muted)]">消費 {burnUnavailable || day.burned === null ? "—" : `${day.burned.toLocaleString("ja-JP")} kcal`}</p></>}</div>
              </div>
              {dayMeals.length > 0 && <details className="mt-3 ml-[4.25rem] rounded-lg border border-[var(--line)] bg-[var(--canvas)] px-3 py-2 sm:ml-[6.5rem]">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--sage-deep)]">食事の詳細を見る <span className="font-normal text-[var(--muted)]">{dayMeals.length}件</span></summary>
                <ul className="mt-3 divide-y divide-[var(--line)]">{dayMeals.map((meal) => {
                  const calories = summarizeDailyCalories([meal], day.date);
                  return <li key={meal.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-xs font-semibold text-[var(--ink)]">{mealTypeLabels[meal.mealType]}{meal.recordedTime ? ` ${meal.recordedTime}` : ""} · {meal.name}</p>
                    <p className="metric mt-1 text-xs text-[var(--muted)]">{calories.countedMeals > 0 ? `${Math.round(calories.calories).toLocaleString("ja-JP")} kcal` : "カロリー未入力"}</p>
                    {meal.items && meal.items.length > 0 && <p className="mt-1 text-xs leading-5 text-[var(--ink-soft)]">食品：{meal.items.map((item) => item.name).join("・")}</p>}
                  </li>;
                })}</ul>
              </details>}
            </div>;
          })}
        </div>
        <p className="mt-3 text-xs leading-6 text-[var(--muted)]">カロリー未入力の食事を含む日は入力済み分で表示します。記録がない日は0 kcalとは扱いません。</p>
      </>}
    </div>
  </section>;
}

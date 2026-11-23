"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileDashboard } from "@/components/dashboard/mobile-dashboard";
import { WeeklyReview } from "@/components/dashboard/weekly-review";
import { bodyMakeClient } from "@/lib/api/client";
import { latestWeightEntry } from "@/lib/utils/current-weight";
import { totalDailyBurn } from "@/lib/utils/daily-burn";
import { estimateRestingCalories } from "@/lib/utils/daily-calorie-guide";
import { toDateInputValue } from "@/lib/utils/date";
import { summarizeDailyCalories } from "@/lib/utils/meal-calories";
import { summarizeDailyMacros } from "@/lib/utils/meal-macros";
import { summarizeDailyFeedback } from "@/lib/utils/daily-feedback";
import type { UserProfile } from "@/types/user";
import type { MealEntry } from "@/types/meal";
import type { WeightEntry } from "@/types/progress";
import type { WorkoutEntry } from "@/types/workout";
import type { DailyBurnEntry } from "@/types/workout";

interface DashboardData {
  profile: UserProfile | null;
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  weights: WeightEntry[];
  weightsUnavailable?: boolean;
  burns: DailyBurnEntry[];
}
const initialData: DashboardData = { profile: null, workouts: [], meals: [], weights: [], burns: [] };

export function DashboardContent({ view = "dashboard" }: { view?: "dashboard" | "weekly-review" } = {}) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [mealLoadFailed, setMealLoadFailed] = useState(false);
  const [workoutLoadFailed, setWorkoutLoadFailed] = useState(false);
  const [burnLoadFailed, setBurnLoadFailed] = useState(false);
  const [today, setToday] = useState(toDateInputValue);
  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout>;
    function refreshToday() {
      setToday(toDateInputValue());
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      midnightTimer = setTimeout(refreshToday, Math.max(1000, nextMidnight.getTime() - now.getTime() + 1000));
    }
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") { clearTimeout(midnightTimer); refreshToday(); }
    }
    refreshToday();
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => { clearTimeout(midnightTimer); document.removeEventListener("visibilitychange", refreshWhenVisible); };
  }, []);
  useEffect(() => {
    let active = true;
    let refreshingRecords = false;
    function refreshRecords() {
      if (!active || document.visibilityState !== "visible" || refreshingRecords) return;
      refreshingRecords = true;
      void Promise.allSettled([bodyMakeClient.getWorkouts(), bodyMakeClient.getWeightEntries(), bodyMakeClient.getDailyBurnEntries()]).then(([workouts, weights, burns]) => {
        if (!active) return;
        setData((current) => ({
          ...current,
          workouts: workouts.status === "fulfilled" ? workouts.value : current.workouts,
          weights: weights.status === "fulfilled" ? weights.value : current.weights,
          weightsUnavailable: weights.status === "fulfilled" ? false : current.weightsUnavailable,
          burns: burns.status === "fulfilled" ? burns.value : current.burns,
        }));
        setWorkoutLoadFailed(workouts.status === "rejected");
        setBurnLoadFailed(burns.status === "rejected");
      }).finally(() => { refreshingRecords = false; });
    }
    void Promise.allSettled([bodyMakeClient.getProfile(), bodyMakeClient.getWorkouts(), bodyMakeClient.getMeals(), bodyMakeClient.getWeightEntries(), bodyMakeClient.getDailyBurnEntries()])
      .then(([profile, workouts, meals, weights, burns]) => {
        if (!active) return;
        setData({
          profile: profile.status === "fulfilled" ? profile.value : null,
          workouts: workouts.status === "fulfilled" ? workouts.value : [],
          meals: meals.status === "fulfilled" ? meals.value : [],
          weights: weights.status === "fulfilled" ? weights.value : [],
          weightsUnavailable: weights.status === "rejected",
          burns: burns.status === "fulfilled" ? burns.value : [],
        });
        setProfileLoadFailed(profile.status === "rejected");
        setMealLoadFailed(meals.status === "rejected");
        setWorkoutLoadFailed(workouts.status === "rejected");
        setBurnLoadFailed(burns.status === "rejected");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        window.addEventListener("focus", refreshRecords);
        window.addEventListener("pageshow", refreshRecords);
        document.addEventListener("visibilitychange", refreshRecords);
      });
    return () => {
      active = false;
      window.removeEventListener("focus", refreshRecords);
      window.removeEventListener("pageshow", refreshRecords);
      document.removeEventListener("visibilitychange", refreshRecords);
    };
  }, []);

  const summary = useMemo(() => {
    const workouts = data.workouts.filter((entry) => entry.performedAt === today);
    const meals = data.meals.filter((entry) => entry.recordedAt === today);
    return {
      currentWeightKg: latestWeightEntry(data.weights, today)?.weightKg ?? data.profile?.startingWeightKg,
      workouts, meals,
      weightDone: data.weights.some((entry) => entry.measuredOn === today),
    };
  }, [data, today]);
  const dailyCalories = useMemo(() => summarizeDailyCalories(data.meals, today), [data.meals, today]);
  const dailyMacros = useMemo(() => summarizeDailyMacros(data.meals, today), [data.meals, today]);
  const dailyFeedback = useMemo(() => summarizeDailyFeedback(dailyCalories, data.workouts, today), [dailyCalories, data.workouts, today]);
  const recordedCalories = loading || mealLoadFailed || (dailyCalories.mealCount > 0 && dailyCalories.countedMeals === 0)
    ? null : Math.round(dailyCalories.calories);
  function restingOn(date: string) {
    const { profile, weights, weightsUnavailable } = data;
    if (!profile || weightsUnavailable) return null;
    const weightKg = date === today ? summary.currentWeightKg : latestWeightEntry(weights, date)?.weightKg ?? profile.startingWeightKg;
    return estimateRestingCalories({ age: profile.age, gender: profile.gender, heightCm: profile.heightCm, weightKg });
  }
  const burnEntry = loading || burnLoadFailed ? undefined : data.burns.find((entry) => entry.performedAt === today);
  const restingToday = loading || burnLoadFailed ? null : restingOn(today);
  const burnedCalories = burnEntry ? totalDailyBurn(burnEntry, restingToday) : restingToday;
  const consumedForDifference = dailyCalories.countedMeals > 0 ? recordedCalories : null;
  const error = profileLoadFailed || mealLoadFailed || workoutLoadFailed || burnLoadFailed || data.weightsUnavailable
    ? "一部の記録を読み込めませんでした。保存済みの記録は表示しています。ページを再読み込みしてください。" : "";
  return <div className="dashboard-unified">
    {view === "dashboard" ? <MobileDashboard
      today={today}
      recordedToday={{
        workout: workoutLoadFailed ? null : summary.workouts.length > 0,
        meal: mealLoadFailed ? null : summary.meals.length > 0,
        weight: data.weightsUnavailable ? null : summary.weightDone,
      }}
      currentWeightKg={summary.currentWeightKg}
      profile={data.profile}
      macros={dailyMacros}
      intake={recordedCalories}
      consumed={consumedForDifference}
      burned={burnedCalories}
      burnRestingOnly={!burnEntry && restingToday !== null}
      burnNeedsProfile={burnEntry?.burnScope === "activity" && restingToday === null}
      incompleteCalories={dailyCalories.missingMeals > 0 || dailyCalories.partiallyCountedMeals > 0}
      workouts={data.workouts}
      feedback={dailyFeedback}
      loading={loading}
      profileUnavailable={profileLoadFailed}
      weightsUnavailable={Boolean(data.weightsUnavailable)}
      mealUnavailable={mealLoadFailed}
      burnUnavailable={burnLoadFailed}
      workoutUnavailable={workoutLoadFailed}
      error={error}
    /> : <WeeklyReview workouts={data.workouts} meals={data.meals} burns={data.burns} restingOn={restingOn} today={today} goal={data.profile?.goal ?? null} loading={loading} workoutUnavailable={workoutLoadFailed} mealUnavailable={mealLoadFailed} burnUnavailable={burnLoadFailed} profileUnavailable={profileLoadFailed} />}
  </div>;
}

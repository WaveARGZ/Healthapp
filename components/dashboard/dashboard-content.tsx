"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileDashboard } from "@/components/dashboard/mobile-dashboard";
import { WeeklyReview } from "@/components/dashboard/weekly-review";
import { bodyMakeClient } from "@/lib/api/client";
import { toDateInputValue } from "@/lib/utils/date";
import { summarizeDailyCalories } from "@/lib/utils/meal-calories";
import { summarizeDailyMacros } from "@/lib/utils/meal-macros";
import { summarizeDailyFeedback } from "@/lib/utils/daily-feedback";
import { estimateRestingCalories } from "@/lib/utils/daily-calorie-guide";
import { fitnessGoalLabels, type UserProfile } from "@/types/user";
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

function weightOn(date: string, data: DashboardData): number | undefined {
  return data.weights.filter((entry) => entry.measuredOn <= date)
    .sort((a, b) => b.measuredOn.localeCompare(a.measuredOn) || b.createdAt.localeCompare(a.createdAt))[0]?.weightKg ?? data.profile?.startingWeightKg;
}

export function DashboardContent({ view = "dashboard" }: { view?: "dashboard" | "weekly-review" } = {}) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    let refreshingWorkouts = false;
    function refreshWorkouts() {
      if (!active || document.visibilityState !== "visible" || refreshingWorkouts) return;
      refreshingWorkouts = true;
      void bodyMakeClient.getWorkouts().then((workouts) => {
        if (!active) return;
        setData((current) => ({ ...current, workouts }));
        setWorkoutLoadFailed(false);
      }).catch(() => {
        if (active) setWorkoutLoadFailed(true);
      }).finally(() => { refreshingWorkouts = false; });
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
        if ([profile, workouts, meals, weights, burns].some((result) => result.status === "rejected")) {
          setError("一部の記録を読み込めませんでした。保存済みの記録は表示しています。ページを再読み込みしてください。");
        }
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        window.addEventListener("focus", refreshWorkouts);
        window.addEventListener("pageshow", refreshWorkouts);
        document.addEventListener("visibilitychange", refreshWorkouts);
      });
    return () => {
      active = false;
      window.removeEventListener("focus", refreshWorkouts);
      window.removeEventListener("pageshow", refreshWorkouts);
      document.removeEventListener("visibilitychange", refreshWorkouts);
    };
  }, []);

  const summary = useMemo(() => {
    const workouts = data.workouts.filter((entry) => entry.performedAt === today);
    const meals = data.meals.filter((entry) => entry.recordedAt === today);
    return {
      currentWeight: weightOn(today, data),
      workouts, meals,
      weightDone: data.weights.some((entry) => entry.measuredOn === today),
    };
  }, [data, today]);
  const dailyCalories = useMemo(() => summarizeDailyCalories(data.meals, today), [data.meals, today]);
  const dailyMacros = useMemo(() => summarizeDailyMacros(data.meals, today), [data.meals, today]);
  const dailyFeedback = useMemo(() => summarizeDailyFeedback(dailyCalories, data.workouts, today), [dailyCalories, data.workouts, today]);
  const recordedCalories = loading || mealLoadFailed || (dailyCalories.mealCount > 0 && dailyCalories.countedMeals === 0)
    ? null : Math.round(dailyCalories.calories);
  const burnEntry = loading || burnLoadFailed ? undefined : data.burns.find((entry) => entry.performedAt === today);
  const consumedForDifference = dailyCalories.countedMeals > 0 ? recordedCalories : null;
  function restingOn(date: string) {
    return data.profile ? estimateRestingCalories({ ...data.profile, weightKg: weightOn(date, data) }) : null;
  }
  return <div className="dashboard-unified">
    {view === "dashboard" ? <MobileDashboard
      today={today}
      recordedToday={{
        workout: workoutLoadFailed ? null : summary.workouts.length > 0,
        meal: mealLoadFailed ? null : summary.meals.length > 0,
        weight: data.weightsUnavailable ? null : summary.weightDone,
      }}
      weight={summary.currentWeight ?? null}
      goal={data.profile ? fitnessGoalLabels[data.profile.goal] : "未設定"}
      profile={data.profile}
      macros={dailyMacros}
      intake={recordedCalories}
      consumed={consumedForDifference}
      burned={burnEntry?.caloriesBurned ?? null}
      burnScope={burnEntry?.burnScope}
      resting={restingOn(today)}
      incompleteCalories={dailyCalories.missingMeals > 0 || dailyCalories.partiallyCountedMeals > 0}
      workouts={data.workouts}
      feedback={dailyFeedback}
      loading={loading}
      profileUnavailable={profileLoadFailed}
      mealUnavailable={mealLoadFailed}
      burnUnavailable={burnLoadFailed}
      workoutUnavailable={workoutLoadFailed}
      error={error}
    /> : <WeeklyReview workouts={data.workouts} meals={data.meals} burns={data.burns} restingOn={restingOn} today={today} goal={data.profile?.goal ?? null} loading={loading} workoutUnavailable={workoutLoadFailed} mealUnavailable={mealLoadFailed} burnUnavailable={burnLoadFailed} profileUnavailable={profileLoadFailed} />}
  </div>;
}

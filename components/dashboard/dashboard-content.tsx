"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { WeightTrendChart } from "@/components/progress/weight-trend-chart";
import { bodyMakeClient } from "@/lib/api/client";
import { loadWorkoutPreferences } from "@/lib/api/workout-preferences-client";
import { formatToday, toDateInputValue } from "@/lib/utils/date";
import { summarizeDailyCalories } from "@/lib/utils/meal-calories";
import { summarizeDailyFeedback } from "@/lib/utils/daily-feedback";
import { estimateDailyCalorieGuide } from "@/lib/utils/daily-calorie-guide";
import { fitnessGoalLabels, type UserProfile } from "@/types/user";
import type { MealEntry } from "@/types/meal";
import type { WeightEntry } from "@/types/progress";
import type { WorkoutEntry } from "@/types/workout";

interface DashboardData {
  profile: UserProfile | null;
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  weights: WeightEntry[];
}
const initialData: DashboardData = { profile: null, workouts: [], meals: [], weights: [] };

function RecordRow({ href, icon, label, description, complete }: { href: string; icon: IconName; label: string; description: string; complete: boolean }) {
  return <Link href={href} className="group flex min-h-20 items-center gap-4 border-b border-[var(--line)] px-1 py-4 transition-colors hover:bg-[var(--sand)] sm:gap-5">
    <Icon name={icon} className="size-[22px] shrink-0 text-[var(--sage-deep)]" />
    <div className="min-w-0 flex-1"><p className="text-sm font-bold">{label}</p><p className="mt-1 truncate text-xs text-[var(--muted)]">{description}</p></div>
    <span className={`flex shrink-0 items-center gap-1 text-xs ${complete ? "text-[var(--sage-deep)]" : "text-[var(--muted)]"}`}>{complete ? <><Icon name="check" className="size-3.5" />記録済み</> : "記録する"}</span>
    <Icon name="chevron-right" className="size-4 shrink-0 text-[var(--muted)]" />
  </Link>;
}

export function DashboardContent() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [mealLoadFailed, setMealLoadFailed] = useState(false);
  const [workoutLoadFailed, setWorkoutLoadFailed] = useState(false);
  const [hasFacilityEquipment, setHasFacilityEquipment] = useState<boolean | null>(null);
  const today = toDateInputValue();
  useEffect(() => {
    void Promise.allSettled([bodyMakeClient.getProfile(), bodyMakeClient.getWorkouts(), bodyMakeClient.getMeals(), bodyMakeClient.getWeightEntries(), loadWorkoutPreferences()])
      .then(([profile, workouts, meals, weights, preferences]) => {
        setData({
          profile: profile.status === "fulfilled" ? profile.value : null,
          workouts: workouts.status === "fulfilled" ? workouts.value : [],
          meals: meals.status === "fulfilled" ? meals.value : [],
          weights: weights.status === "fulfilled" ? weights.value : [],
        });
        setProfileLoadFailed(profile.status === "rejected");
        setMealLoadFailed(meals.status === "rejected");
        setWorkoutLoadFailed(workouts.status === "rejected");
        if (preferences.status === "fulfilled") {
          setHasFacilityEquipment(preferences.value.facilityEquipment.length + preferences.value.customEquipment.length > 0);
        }
        if ([profile, workouts, meals, weights, preferences].some((result) => result.status === "rejected")) {
          setError("一部の記録を読み込めませんでした。保存済みの記録は表示しています。ページを再読み込みしてください。");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const workouts = data.workouts.filter((entry) => entry.performedAt === today);
    const meals = data.meals.filter((entry) => entry.recordedAt === today);
    return {
      currentWeight: data.weights.filter((entry) => entry.measuredOn <= today).sort((a, b) => b.measuredOn.localeCompare(a.measuredOn) || b.createdAt.localeCompare(a.createdAt))[0]?.weightKg ?? data.profile?.startingWeightKg,
      workouts, meals,
      weightDone: data.weights.some((entry) => entry.measuredOn === today),
    };
  }, [data, today]);
  const doneCount = [summary.workouts.length > 0, summary.meals.length > 0, summary.weightDone].filter(Boolean).length;
  const dailyCalories = useMemo(() => summarizeDailyCalories(data.meals, today), [data.meals, today]);
  const dailyFeedback = useMemo(() => summarizeDailyFeedback(dailyCalories, data.workouts, today), [dailyCalories, data.workouts, today]);
  const calorieGuide = useMemo(() => data.profile ? estimateDailyCalorieGuide({
    age: data.profile.age,
    gender: data.profile.gender,
    heightCm: data.profile.heightCm,
    weightKg: summary.currentWeight,
    goal: data.profile.goal,
  }) : null, [data.profile, summary.currentWeight]);
  const recordedDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const iso = toDateInputValue(date);
    return { date: iso, day: new Intl.DateTimeFormat("ja-JP", { weekday: "narrow" }).format(date), number: date.getDate(), active: data.workouts.some((entry) => entry.performedAt === iso) || data.meals.some((entry) => entry.recordedAt === iso) || data.weights.some((entry) => entry.measuredOn === iso) };
  });

  return <>
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div><p className="text-xs text-[var(--muted)]">{formatToday()}</p><h1 className="mt-2 text-[28px] font-bold tracking-tight">今日の記録</h1></div>
      <Link href="/onboarding" className="text-link max-w-[45%]"><span className="truncate">{data.profile?.name ? `${data.profile.name}さん` : "プロフィール設定"}</span><Icon name="user" className="size-4 shrink-0" /></Link>
    </header>
    {error && <p role="alert" className="mt-4 text-xs text-[var(--coral)]">{error}</p>}
    <section aria-label="今日の摂取カロリー" aria-busy={loading} className="mt-6 rounded-md border border-[var(--line)] bg-[var(--sand)] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3"><h2 className="section-title">今日の摂取カロリー</h2><Link href="/meals" className="text-link shrink-0">食事を記録<Icon name="arrow-right" className="size-3.5" /></Link></div>
      <p className="metric mt-3 flex flex-wrap items-baseline gap-x-2 text-[36px] font-semibold leading-none sm:text-[44px]"><span>{loading || mealLoadFailed ? "—" : dailyCalories.mealCount > 0 && dailyCalories.countedMeals === 0 ? "—" : Math.round(dailyCalories.calories).toLocaleString("ja-JP")}</span><span className="text-sm font-normal tracking-normal text-[var(--muted)]">kcal</span></p>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{loading ? "食事記録を読み込み中…" : mealLoadFailed ? "合計を表示できません" : dailyCalories.mealCount === 0 ? "まだ食事の記録はありません" : dailyCalories.countedMeals === 0 ? "食事は記録済みですが、カロリーは未入力です" : dailyCalories.missingMeals > 0 || dailyCalories.partiallyCountedMeals > 0 ? `${dailyCalories.mealCount}件のうち、カロリー入力済み分の合計です。未入力の料理・食事は含みません。` : `${dailyCalories.mealCount}件の食事を合計`}</p>
      <div className="mt-5 border-t border-[var(--line)] pt-4" aria-label="一日の摂取カロリーの目安">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><h3 className="text-sm font-bold text-[var(--ink)]">一日の摂取目安</h3>{data.profile && <span className="text-xs text-[var(--sage-deep)]">{fitnessGoalLabels[data.profile.goal]}</span>}</div>
        {loading ? <p className="mt-2 text-sm text-[var(--muted)]">計算中…</p>
          : profileLoadFailed ? <p className="mt-2 text-sm text-[var(--muted)]">プロフィールを読み込めないため表示できません。</p>
          : calorieGuide?.status === "ready" ? <>
            <p className="metric mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[24px] font-semibold leading-tight sm:text-[30px]"><span>約 {calorieGuide.minKcal.toLocaleString("ja-JP")}〜{calorieGuide.maxKcal.toLocaleString("ja-JP")}</span><span className="text-sm font-normal tracking-normal text-[var(--muted)]">kcal / 日</span></p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">身長{data.profile?.heightCm}cm・体重{summary.currentWeight}kg・年齢と目標から計算。活動量は低め〜標準を仮定{calorieGuide.broadRange ? "し、性別を計算に用いない設定のため幅を広げています" : "しています"}。今日の記録との差はノルマではありません。</p>
          </> : <p className="mt-2 text-xs leading-6 text-[var(--muted)]">{calorieGuide?.status === "outside-adult-range" ? "この計算式は20〜78歳向けです。個別の目安は専門家に相談してください。" : calorieGuide?.status === "underweight" ? "現在の身長・体重からは減量用の目安を表示しません。体型については専門家に相談してください。" : calorieGuide?.status === "low-estimate" ? "計算結果が低すぎるため、数値を表示しません。専門家に相談してください。" : "年齢・身長・体重を設定すると目安を表示できます。"}</p>}
        {!loading && !profileLoadFailed && calorieGuide?.status !== "ready" && <Link href="/onboarding" className="text-link mt-2">プロフィールを確認<Icon name="arrow-right" className="size-3.5" /></Link>}
        <details className="mt-3 text-xs leading-5 text-[var(--muted)]"><summary className="min-h-11 cursor-pointer content-center">計算方法と注意点</summary><p className="pb-2">成人のMifflin-St Jeor式を使用し、活動量を1.4〜1.6倍で概算しています。目標による補正（筋肉を増やす +5%、体脂肪を減らす -10%）はアプリ独自の控えめな仮定です。妊娠・授乳中や持病のある方には適用せず、必要に応じて医療・栄養の専門家に相談してください。<a className="underline underline-offset-2" href="https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" target="_blank" rel="noopener noreferrer">参考：米国NIH</a></p></details>
      </div>
    </section>
    <WeightTrendChart entries={data.weights.filter((entry) => entry.measuredOn <= today)} loading={loading} />
    <section aria-label="現在の身体と目標" className="mt-7 grid grid-cols-2 border-y border-[var(--ink)] py-6 sm:py-7">
      <Link href="/weight" className="min-w-0 pr-4"><p className="text-xs text-[var(--muted)]">現在の体重</p><p className="metric mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[34px] font-medium leading-none sm:text-[56px]"><span>{loading ? "—" : summary.currentWeight ?? "—"}</span><span className="text-sm font-normal tracking-normal text-[var(--muted)]">kg</span></p><p className="mt-3 text-xs text-[var(--sage-deep)]">体重を記録する ↗</p></Link>
      <div className="flex flex-col justify-center border-l border-[var(--line)] pl-5 sm:pl-8"><p className="text-xs text-[var(--muted)]">いまの目標</p><p className="mt-2 text-sm font-bold leading-6 sm:text-base">{loading ? "読み込み中…" : profileLoadFailed ? "読み込めませんでした" : data.profile ? fitnessGoalLabels[data.profile.goal] : "目標を設定しましょう"}</p><Link href="/onboarding" className="text-link mt-1">{data.profile ? "目標を変更" : "プロフィールへ"}<Icon name="arrow-right" className="size-3.5" /></Link></div>
    </section>
    {hasFacilityEquipment === false && <section className="mt-6 grid grid-cols-[32px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 rounded-md border border-[var(--line)] bg-[var(--sand)] p-4 sm:grid-cols-[40px_minmax(0,1fr)_auto] sm:items-center" aria-label="ジムの器具を登録">
      <span className="grid size-8 place-items-center rounded-full bg-white text-[var(--sage-deep)] sm:size-10"><Icon name="dumbbell" className="size-4 sm:size-5" /></span>
      <div className="min-w-0"><h2 className="text-sm font-bold leading-6">ジムの器具を登録しましょう</h2><p className="mt-1 text-[13px] leading-6 text-[var(--muted)]">使えるマシン・器具に合わせて、筋トレのおすすめを表示します。</p></div>
      <Link href="/workouts?setup=equipment" className="col-start-2 inline-flex min-h-11 items-center justify-center gap-2 rounded bg-[var(--sage-deep)] px-4 text-[13px] font-bold text-white sm:col-start-auto">器具を登録<Icon name="arrow-right" className="size-4" /></Link>
    </section>}
    <section className="mt-9" aria-busy={loading}>
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-3"><h2 className="section-title">記録をつける</h2><span className="metric text-xs text-[var(--muted)]">{loading ? "—" : doneCount} / 3 記録済み</span></div>
      <RecordRow href="/workouts" icon="dumbbell" label="筋トレ" description={summary.workouts.length ? summary.workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.name)).join("・") : "種目・重量・回数"} complete={summary.workouts.length > 0} />
      <RecordRow href="/meals" icon="leaf" label="食事" description={summary.meals.length ? `${summary.meals.length}件の食事を記録` : "朝食・昼食・夕食・間食"} complete={summary.meals.length > 0} />
      <RecordRow href="/weight" icon="scale" label="体重" description={summary.weightDone ? `${summary.currentWeight} kg` : "今日の体重を入力"} complete={summary.weightDone} />
    </section>
    <Link href="/photos" className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs text-[var(--muted)] underline underline-offset-4"><Icon name="camera" className="size-4" />身体写真は任意で記録できます</Link>
    <section className="mt-9" aria-label="食事と筋トレのふり返り" aria-busy={loading}>
      <h2 className="section-title">食事と筋トレのふり返り</h2>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">入力された記録から作る自動コメントです。写真やフォームをAIが判定した結果ではありません。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["meal", "workout"] as const).map((kind) => {
          const item = dailyFeedback[kind];
          const unavailable = kind === "meal" ? mealLoadFailed : workoutLoadFailed;
          return <article key={kind} className="rounded-md border border-[var(--line)] bg-white p-4">
            <p className="text-xs font-semibold text-[var(--sage-deep)]">{kind === "meal" ? "食事" : "筋トレ"}</p>
            <h3 className="mt-2 text-sm font-bold leading-6">{loading ? "記録を読み込み中…" : unavailable ? "記録を読み込めませんでした" : item.title}</h3>
            <p className="mt-2 text-xs leading-6 text-[var(--muted)]">{loading ? "" : unavailable ? "再読み込みしてから確認してください。" : item.detail}</p>
            <Link href={item.href} className="text-link mt-3">記録を見る<Icon name="arrow-right" className="size-3.5" /></Link>
          </article>;
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">記録のない食事や運動は含みません。栄養・運動の良し悪しや健康状態の診断ではありません。</p>
    </section>
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between"><h2 className="section-title">この7日間</h2><Link href="/progress" className="text-link">進捗<Icon name="arrow-right" className="size-3.5" /></Link></div>
      <div className="grid grid-cols-7 gap-1 border-y border-[var(--line)] py-5">{recordedDays.map((item, index) => <div key={item.date} className="flex flex-col items-center gap-3" aria-label={`${item.date} ${item.active ? "記録あり" : "記録なし"}`}><span className="text-xs text-[var(--muted)]">{item.day}</span><span className={`metric grid h-10 w-full max-w-9 place-items-center rounded-sm text-xs font-semibold ${item.active ? "bg-[var(--sage-deep)] text-white" : "bg-[var(--sand)] text-[var(--muted)]"} ${index === 6 ? "outline outline-1 outline-offset-2 outline-[var(--sage-deep)]" : ""}`}>{item.active ? <Icon name="check" className="size-4" /> : item.number}</span></div>)}</div>
      <p className="mt-3 text-xs text-[var(--muted)]">記録のある日 <span className="font-semibold text-[var(--ink)]">{recordedDays.filter((day) => day.active).length}日</span></p>
    </section>
  </>;
}

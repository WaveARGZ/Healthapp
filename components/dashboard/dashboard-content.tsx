"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { WeightTrendChart } from "@/components/progress/weight-trend-chart";
import { bodyMakeClient } from "@/lib/api/client";
import { loadWorkoutPreferences } from "@/lib/api/workout-preferences-client";
import { formatDate, formatToday, toDateInputValue } from "@/lib/utils/date";
import { fitnessGoalLabels, type UserProfile } from "@/types/user";
import type { MealEntry } from "@/types/meal";
import { bodyPhotoViewLabels, type BodyPhotoEntry, type WeightEntry } from "@/types/progress";
import type { WorkoutEntry } from "@/types/workout";

interface DashboardData {
  profile: UserProfile | null;
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  weights: WeightEntry[];
  photos: BodyPhotoEntry[];
}
const initialData: DashboardData = { profile: null, workouts: [], meals: [], weights: [], photos: [] };

function RecordRow({ href, icon, label, description, complete }: { href: string; icon: IconName; label: string; description: string; complete: boolean }) {
  return <Link href={href} className="group flex min-h-20 items-center gap-4 border-b border-[var(--line)] px-1 py-4 transition-colors hover:bg-[var(--sand)] sm:gap-5">
    <Icon name={icon} className="size-[22px] shrink-0 text-[var(--sage-deep)]" />
    <div className="min-w-0 flex-1"><p className="text-sm font-bold">{label}</p><p className="mt-1 truncate text-xs text-[var(--muted)]">{description}</p></div>
    <span className={`flex shrink-0 items-center gap-1 text-[11px] ${complete ? "text-[var(--sage-deep)]" : "text-[var(--muted)]"}`}>{complete ? <><Icon name="check" className="size-3.5" />記録済み</> : "記録する"}</span>
    <Icon name="chevron-right" className="size-4 shrink-0 text-[var(--muted)]" />
  </Link>;
}

export function DashboardContent() {
  const [data, setData] = useState<DashboardData>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasFacilityEquipment, setHasFacilityEquipment] = useState<boolean | null>(null);
  const today = toDateInputValue();
  useEffect(() => {
    void Promise.all([bodyMakeClient.getProfile(), bodyMakeClient.getWorkouts(), bodyMakeClient.getMeals(), bodyMakeClient.getWeightEntries(), bodyMakeClient.getBodyPhotos(), loadWorkoutPreferences()])
      .then(([profile, workouts, meals, weights, photos, preferences]) => {
        setData({ profile, workouts, meals, weights, photos });
        setHasFacilityEquipment(preferences.facilityEquipment.length + preferences.customEquipment.length > 0);
      })
      .catch(() => setError("記録を読み込めませんでした。ページを再読み込みしてください。"))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const workouts = data.workouts.filter((entry) => entry.performedAt === today);
    const meals = data.meals.filter((entry) => entry.recordedAt === today);
    return {
      currentWeight: data.weights.filter((entry) => entry.measuredOn <= today).sort((a, b) => b.measuredOn.localeCompare(a.measuredOn) || b.createdAt.localeCompare(a.createdAt))[0]?.weightKg ?? data.profile?.startingWeightKg,
      workouts, meals,
      weightDone: data.weights.some((entry) => entry.measuredOn === today),
      photoDone: data.photos.some((entry) => entry.capturedAt === today),
    };
  }, [data, today]);
  const doneCount = [summary.workouts.length > 0, summary.meals.length > 0, summary.weightDone, summary.photoDone].filter(Boolean).length;
  const recordedDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const iso = toDateInputValue(date);
    return { date: iso, day: new Intl.DateTimeFormat("ja-JP", { weekday: "narrow" }).format(date), number: date.getDate(), active: data.workouts.some((entry) => entry.performedAt === iso) || data.meals.some((entry) => entry.recordedAt === iso) || data.weights.some((entry) => entry.measuredOn === iso) || data.photos.some((entry) => entry.capturedAt === iso) };
  });

  return <>
    <header className="flex items-end justify-between gap-4">
      <div><p className="text-xs text-[var(--muted)]">{formatToday()}</p><h1 className="mt-2 text-[28px] font-bold tracking-tight">今日の記録</h1></div>
      <Link href="/onboarding" className="text-link max-w-[45%]"><span className="truncate">{data.profile?.name ? `${data.profile.name}さん` : "プロフィール設定"}</span><Icon name="user" className="size-4 shrink-0" /></Link>
    </header>
    {hasFacilityEquipment === false && <section className="mt-5 flex items-center gap-4 rounded-md border border-[var(--line)] bg-[var(--sand)] p-4" aria-label="ジムの器具を登録">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[var(--sage-deep)]"><Icon name="dumbbell" className="size-5" /></span>
      <div className="min-w-0 flex-1"><h2 className="text-sm font-bold">ジムのマシン・器具を登録しましょう</h2><p className="mt-1 text-xs leading-5 text-[var(--muted)]">登録すると、使える器具に合わせて筋トレのおすすめを絞り込めます。</p><p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">筋トレ画面 →「種目一覧から選ぶ」→「器具を登録・編集」</p></div>
      <Link href="/workouts" className="flex min-h-11 shrink-0 items-center gap-1 rounded bg-[var(--sage-deep)] px-3 text-xs font-bold text-white">登録する<Icon name="arrow-right" className="size-3.5" /></Link>
    </section>}
    {error && <p role="alert" className="mt-4 text-xs text-[var(--coral)]">{error}</p>}
    <WeightTrendChart entries={data.weights.filter((entry) => entry.measuredOn <= today)} loading={loading} />
    <section aria-label="現在の身体と目標" className="mt-7 grid grid-cols-2 border-y border-[var(--ink)] py-6 sm:py-7">
      <Link href="/weight" className="pr-4"><p className="text-xs text-[var(--muted)]">現在の体重</p><p className="metric mt-2 text-[42px] font-medium leading-none sm:text-[56px]">{loading ? "—" : summary.currentWeight ?? "—"}<span className="ml-2 text-sm font-normal tracking-normal text-[var(--muted)]">kg</span></p><p className="mt-3 text-[11px] text-[var(--sage-deep)]">体重を記録する ↗</p></Link>
      <div className="flex flex-col justify-center border-l border-[var(--line)] pl-5 sm:pl-8"><p className="text-xs text-[var(--muted)]">いまの目標</p><p className="mt-2 text-sm font-bold leading-6 sm:text-base">{data.profile ? fitnessGoalLabels[data.profile.goal] : "目標を設定しましょう"}</p><Link href="/onboarding" className="text-link mt-1">{data.profile ? "目標を変更" : "プロフィールへ"}<Icon name="arrow-right" className="size-3.5" /></Link></div>
    </section>
    <section className="mt-9" aria-busy={loading}>
      <div className="flex items-center justify-between border-b border-[var(--line)] pb-3"><h2 className="section-title">記録をつける</h2><span className="metric text-xs text-[var(--muted)]">{loading ? "—" : doneCount} / 4 記録済み</span></div>
      <RecordRow href="/workouts" icon="dumbbell" label="筋トレ" description={summary.workouts.length ? summary.workouts.flatMap((workout) => workout.exercises.map((exercise) => exercise.name)).join("・") : "種目・重量・回数"} complete={summary.workouts.length > 0} />
      <RecordRow href="/meals" icon="leaf" label="食事" description={summary.meals.length ? `${summary.meals.length}件の食事を記録` : "朝食・昼食・夕食・間食"} complete={summary.meals.length > 0} />
      <RecordRow href="/weight" icon="scale" label="体重" description={summary.weightDone ? `${summary.currentWeight} kg` : "今日の体重を入力"} complete={summary.weightDone} />
      <RecordRow href="/photos" icon="camera" label="身体写真" description={summary.photoDone ? "今日の写真を保存済み" : "正面・背面の写真"} complete={summary.photoDone} />
    </section>
    <div className="mt-10 grid gap-10 sm:grid-cols-2 sm:gap-8">
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="section-title">この7日間</h2><Link href="/progress" className="text-link">進捗<Icon name="arrow-right" className="size-3.5" /></Link></div>
        <div className="grid grid-cols-7 gap-1 border-y border-[var(--line)] py-5">{recordedDays.map((item, index) => <div key={item.date} className="flex flex-col items-center gap-3" aria-label={`${item.date} ${item.active ? "記録あり" : "記録なし"}`}><span className="text-[10px] text-[var(--muted)]">{item.day}</span><span className={`metric grid h-10 w-full max-w-9 place-items-center rounded-sm text-xs font-semibold ${item.active ? "bg-[var(--sage-deep)] text-white" : "bg-[var(--sand)] text-[var(--muted)]"} ${index === 6 ? "outline outline-1 outline-offset-2 outline-[var(--sage-deep)]" : ""}`}>{item.active ? <Icon name="check" className="size-4" /> : item.number}</span></div>)}</div>
        <p className="mt-3 text-[11px] text-[var(--muted)]">記録のある日 <span className="font-semibold text-[var(--ink)]">{recordedDays.filter((day) => day.active).length}日</span></p>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="section-title">最近の身体写真</h2><Link href="/photos" className="text-link">一覧<Icon name="arrow-right" className="size-3.5" /></Link></div>
        {data.photos.length ? <div className="flex gap-4 border-y border-[var(--line)] py-4">{data.photos.slice(0, 2).map((photo) => <Link key={photo.id} href="/photos" className="flex-1"><div className="relative h-28 bg-[var(--sand)]"><Image src={photo.imageUrl} alt={`${bodyPhotoViewLabels[photo.view]}の身体写真`} fill unoptimized className="object-contain" /></div><p className="mt-2 text-[10px] text-[var(--muted)]">{formatDate(photo.capturedAt)}・{bodyPhotoViewLabels[photo.view]}</p></Link>)}</div> : <EmptyState title="まだ写真がありません" description="正面と背面の写真を残せます。" href="/photos" action="写真を登録" />}
      </section>
    </div>
    <details className="mt-10 border-t border-[var(--line)] py-4 text-xs text-[var(--muted)]"><summary>今日のフィードバックについて</summary><p className="mt-3 leading-6">記録に合わせたフィードバックは今後追加予定です。現在は筋トレ・食事・体重・写真の記録と振り返りができます。</p></details>
  </>;
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppTopBar } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { bodyMakeClient } from "@/lib/api/client";
import { formatToday, toDateInputValue } from "@/lib/utils/date";
import { fitnessGoalLabels, type UserProfile } from "@/types/user";
import type { MealEntry } from "@/types/meal";
import type { BodyPhotoEntry, WeightEntry } from "@/types/progress";
import type { WorkoutEntry } from "@/types/workout";

interface DashboardData {
  profile: UserProfile | null;
  workouts: WorkoutEntry[];
  meals: MealEntry[];
  weights: WeightEntry[];
  photos: BodyPhotoEntry[];
}

const initialData: DashboardData = { profile: null, workouts: [], meals: [], weights: [], photos: [] };

function RecordCard({ href, icon, label, description, complete, tint }: { href: string; icon: IconName; label: string; description: string; complete: boolean; tint: string }) {
  return <Link href={href} className="group block rounded-2xl bg-white p-4 shadow-[0_10px_25px_rgba(50,60,52,0.05)] ring-1 ring-black/[0.035] transition hover:-translate-y-0.5"><div className="flex items-start justify-between"><span className={`grid size-10 place-items-center rounded-xl ${tint}`}><Icon name={icon} className="size-5" /></span><span className={`grid size-5 place-items-center rounded-full ${complete ? "bg-[var(--sage-deep)] text-white" : "bg-[var(--sand)] text-[#a0a6a3]"}`}>{complete ? <Icon name="check" className="size-3" /> : <Icon name="plus" className="size-3" />}</span></div><p className="mt-4 text-sm font-bold text-[var(--ink)]">{label}</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{complete ? "今日の記録済み" : description}</p></Link>;
}

export function DashboardContent() {
  const [data, setData] = useState<DashboardData>(initialData);
  const today = toDateInputValue();

  useEffect(() => {
    void Promise.all([bodyMakeClient.getProfile(), bodyMakeClient.getWorkouts(), bodyMakeClient.getMeals(), bodyMakeClient.getWeightEntries(), bodyMakeClient.getBodyPhotos()]).then(([profile, workouts, meals, weights, photos]) => setData({ profile, workouts, meals, weights, photos }));
  }, []);

  const summary = useMemo(() => {
    const currentWeight = data.weights.find((entry) => entry.measuredOn <= today)?.weightKg ?? data.profile?.startingWeightKg;
    return {
      currentWeight,
      workoutDone: data.workouts.some((entry) => entry.performedAt === today),
      mealDone: data.meals.some((entry) => entry.recordedAt === today),
      weightDone: data.weights.some((entry) => entry.measuredOn === today),
      photoDone: data.photos.some((entry) => entry.capturedAt === today),
    };
  }, [data, today]);

  const recordedDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (6 - index));
    const iso = toDateInputValue(date);
    return { day: new Intl.DateTimeFormat("ja-JP", { weekday: "narrow" }).format(date), active: data.workouts.some((entry) => entry.performedAt === iso) || data.meals.some((entry) => entry.recordedAt === iso) || data.weights.some((entry) => entry.measuredOn === iso) };
  });

  return <>
    <AppTopBar />
    <section><p className="text-sm text-[var(--muted)]">{formatToday()}</p><h1 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.055em] text-[var(--ink)]">{data.profile?.name ? `${data.profile.name}さん、` : "今日も、"}<br />自分のペースで。</h1></section>
    <Card className="mt-6 overflow-hidden bg-[var(--ink)] p-5 text-white"><div className="flex items-start justify-between"><div><p className="text-xs font-semibold tracking-[0.08em] text-white/55">CURRENT WEIGHT</p><p className="mt-2 font-display text-4xl font-semibold tracking-[-0.05em]">{summary.currentWeight ?? "--"}<span className="ml-1 text-base font-medium text-white/60">kg</span></p></div><span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-[var(--peach)]"><Icon name="scale" className="size-5" /></span></div><div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4"><span className="text-sm text-white/65">目標</span><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">{fitnessGoalLabels[data.profile?.goal ?? "build-muscle"]}</span></div></Card>
    <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">今日の記録</h2><span className="text-xs font-medium text-[var(--muted)]">4つの習慣</span></div><div className="grid grid-cols-2 gap-3"><RecordCard href="/workouts" icon="dumbbell" label="筋トレ" description="運動を追加する" complete={summary.workoutDone} tint="bg-[#edf3ee] text-[var(--sage-deep)]" /><RecordCard href="/meals" icon="leaf" label="食事" description="食事を記録する" complete={summary.mealDone} tint="bg-[#fff3e9] text-[#cb7c47]" /><RecordCard href="/weight" icon="scale" label="体重" description="数値を記録する" complete={summary.weightDone} tint="bg-[#eeeef9] text-[#6e68a6]" /><RecordCard href="/photos" icon="camera" label="身体写真" description="変化を残す" complete={summary.photoDone} tint="bg-[#f9eeee] text-[#b66d70]" /></div></section>
    <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">今日のフィードバック</h2><Icon name="sparkle" className="size-5 text-[var(--sage-deep)]" /></div><Card className="bg-[#edf3ee]"><p className="text-sm font-semibold leading-6 text-[var(--ink)]">今日の一歩を記録して、変化の輪郭を少しずつはっきりさせましょう。</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">AIフィードバックは今後追加予定です。</p></Card></section>
    <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">最近の身体変化</h2><Link href="/photos" className="text-xs font-bold text-[var(--sage-deep)]">写真を見る</Link></div><Card className="flex items-center gap-4"><div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--sand)] text-[#a8aea9]"><Icon name="camera" className="size-6" /></div><div><p className="text-sm font-bold text-[var(--ink)]">変化を写真で残しましょう</p><p className="mt-1 text-xs leading-5 text-[var(--muted)]">正面・背面から、同じ条件で撮るのがおすすめです。</p></div></Card></section>
    <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">週間記録</h2><Link href="/progress" className="text-xs font-bold text-[var(--sage-deep)]">進捗を見る</Link></div><Card><div className="flex items-end justify-between gap-2">{recordedDays.map((item, index) => <div key={`${item.day}-${index}`} className="flex flex-1 flex-col items-center gap-2"><div className={`h-10 w-full max-w-7 rounded-full ${item.active ? "bg-[var(--sage-deep)]" : "bg-[var(--sand)]"}`} /><span className={`text-[10px] font-bold ${item.active ? "text-[var(--sage-deep)]" : "text-[var(--muted)]"}`}>{item.day}</span></div>)}</div><p className="mt-4 text-center text-xs text-[var(--muted)]">記録した日が、あなたの積み重ねになります。</p></Card></section>
  </>;
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { bodyMakeClient } from "@/lib/api/client";
import { loadWorkoutPreferences, storeWorkoutPreferences } from "@/lib/api/workout-preferences-client";
import { getWorkoutWeek, weekdayLabels } from "@/lib/workouts/workout-split";
import { recommendExercises } from "@/lib/workouts/workout-recommender";
import { toDateInputValue } from "@/lib/utils/date";
import { fitnessGoalLabels, type UserProfile } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";
import type { WorkoutPreferences, WorkoutSplitPlan } from "@/types/workout-preferences";

const muscleCategories = ["胸", "背中", "肩", "腕", "脚", "腹筋・体幹", "有酸素"];
const splitOptions: Array<{ kind: WorkoutSplitPlan["kind"]; title: string; description: string }> = [
  { kind: "five", title: "5分割", description: "胸・背中・肩・腕・脚を順番に" },
  { kind: "three", title: "3分割", description: "胸＋腕・背中・脚を順番に" },
  { kind: "full", title: "全身を少しずつ", description: "トレーニング日ごとに全身を少しずつ" },
  { kind: "custom", title: "自由に割り振る", description: "曜日ごとに鍛える部位を指定" },
];
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const suggestedDays: Record<number, number[]> = {
  1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
};

export function WorkoutPlanSetup({ date, onLoad, onSave }: { date: string; onLoad: (hasPlan: boolean) => void; onSave: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [preferences, setPreferences] = useState<WorkoutPreferences>({ facilityEquipment: [], customEquipment: [], favoriteExercises: [] });
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [draft, setDraft] = useState<WorkoutSplitPlan>({ kind: "three", trainingDays: [1, 3, 5], anchorDate: date, customByWeekday: {} });
  const [frequency, setFrequency] = useState(3);
  const [isGymMember, setIsGymMember] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([bodyMakeClient.getProfile(), loadWorkoutPreferences(), bodyMakeClient.getWorkouts()]).then(([loadedProfile, loadedPreferences, history]) => {
      if (!active) return;
      setProfile(loadedProfile);
      setPreferences(loadedPreferences);
      setIsGymMember(loadedPreferences.isGymMember ?? null);
      setWorkouts(history);
      if (loadedPreferences.splitPlan) {
        setDraft(loadedPreferences.splitPlan);
        setFrequency(loadedPreferences.splitPlan.trainingDays.length);
      }
      onLoad(Boolean(loadedPreferences.splitPlan));
    }).catch(() => {
      if (active) {
        setNotice("週間メニューを読み込めませんでした。ページを再読み込みしてください。");
        onLoad(false);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [onLoad]);

  function changeFrequency(count: number) {
    setFrequency(count);
    setDraft((current) => ({ ...current, trainingDays: suggestedDays[count], anchorDate: toDateInputValue() }));
    setNotice("");
  }

  function toggleWeekday(day: number) {
    setDraft((current) => {
      const selected = current.trainingDays.includes(day);
      if (!selected && current.trainingDays.length >= frequency) return current;
      const trainingDays = selected ? current.trainingDays.filter((item) => item !== day) : [...current.trainingDays, day].sort((a, b) => a - b);
      return { ...current, trainingDays, anchorDate: toDateInputValue() };
    });
    setNotice("");
  }

  function toggleCategory(day: number, category: string) {
    setDraft((current) => {
      const existing = current.customByWeekday?.[String(day)] ?? [];
      const categories = existing.includes(category) ? existing.filter((item) => item !== category) : [...existing, category];
      return { ...current, customByWeekday: { ...current.customByWeekday, [String(day)]: categories } };
    });
    setNotice("");
  }

  const customIncomplete = draft.kind === "custom" && draft.trainingDays.some((day) => !(draft.customByWeekday?.[String(day)]?.length));
  const canSave = !loading && !saving && Boolean(profile) && isGymMember !== null && draft.trainingDays.length === frequency && !customIncomplete && Boolean(date);
  const week = date && draft.trainingDays.length ? getWorkoutWeek(draft, date) : [];
  const selectedDay = week.find((day) => day.date === date);
  const suggestions = profile && date ? recommendExercises({
    goal: profile.goal,
    availableEquipment: [...preferences.facilityEquipment, ...preferences.customEquipment],
    favorites: preferences.favoriteExercises,
    workouts,
    selectedCategory: "すべて",
    query: "",
    splitPlan: draft,
    date,
    limit: 3,
  }) : [];

  async function savePlan() {
    if (!canSave || isGymMember === null) return;
    setSaving(true);
    setNotice("");
    try {
      // Merge with the latest preferences so changing the plan never drops gym equipment or favorites.
      const latest = await loadWorkoutPreferences();
      const updated = { ...latest, isGymMember, splitPlan: draft };
      await storeWorkoutPreferences(updated);
      setPreferences(updated);
      setNotice("週間メニューを保存しました。種目のおすすめに反映されます。");
      onSave();
    } catch {
      setNotice("週間メニューを保存できませんでした。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mb-7 rounded-md border border-[var(--line)] bg-white p-4 sm:p-5" aria-labelledby="workout-plan-title">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="workout-plan-title" className="text-base font-bold text-[var(--ink)]">週間メニュー</h2><span className="text-xs text-[var(--muted)]">目標 → ジム → 回数 → 分割 → 曜日</span></div>
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <p className="text-xs font-bold text-[var(--sage-deep)]">1. 体づくりの目標</p>
      {profile ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[var(--ink)]">{fitnessGoalLabels[profile.goal]}</p><Link href="/onboarding" className="min-h-11 content-center text-xs font-bold text-[var(--sage-deep)] underline underline-offset-2">プロフィールで変更</Link></div>
        : loading ? <p className="mt-2 text-xs text-[var(--muted)]">目標を読み込み中…</p>
        : <div className="mt-2"><p className="text-xs leading-5 text-[var(--muted)]">先にプロフィールと目標を設定してください。</p><Link href="/onboarding" className="mt-2 inline-flex min-h-11 items-center font-bold text-[var(--sage-deep)] underline underline-offset-2">目標を設定する</Link></div>}
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-xs font-bold text-[var(--sage-deep)]">2. ジムに加入していますか？</p>
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="ジムの加入状況">{([{ value: true, label: "はい" }, { value: false, label: "いいえ" }] as const).map(({ value, label }) => <button key={label} type="button" disabled={!profile || loading} aria-pressed={isGymMember === value} onClick={() => { setIsGymMember(value); setNotice(""); }} className={`min-h-12 rounded border px-3 text-sm font-semibold ${isGymMember === value ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] text-[var(--ink)]"}`}>{label}</button>)}</div>
      {!loading && profile && isGymMember === null && <p className="mt-2 text-xs text-[var(--muted)]">週間メニューを保存する前に選択してください。</p>}
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-xs font-bold text-[var(--sage-deep)]">3. 週に何回トレーニングする？</p>
      <div className="mt-3 flex gap-2 overflow-x-auto py-1" role="group" aria-label="週にトレーニングする回数">{Array.from({ length: 7 }, (_, index) => index + 1).map((count) => <button key={count} type="button" disabled={!profile || loading} aria-pressed={frequency === count} onClick={() => changeFrequency(count)} className={`min-h-11 min-w-11 shrink-0 rounded border px-3 text-sm font-semibold ${frequency === count ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] text-[var(--ink)]"}`}>{count}回</button>)}</div>
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-xs font-bold text-[var(--sage-deep)]">4. メニューの組み方</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="分割方法">{splitOptions.map((option) => <button key={option.kind} type="button" disabled={!profile || loading} aria-pressed={draft.kind === option.kind} onClick={() => { setDraft((current) => ({ ...current, kind: option.kind, anchorDate: toDateInputValue() })); setNotice(""); }} className={`min-h-16 rounded border px-3 py-2 text-left ${draft.kind === option.kind ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)]"}`}><span className="block text-sm font-bold text-[var(--ink)]">{option.title}</span><span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{option.description}</span></button>)}</div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">5分割・3分割は、週のトレーニング回数に合わせて順番を週をまたいで続けます。</p>
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-xs font-bold text-[var(--sage-deep)]">5. トレーニングする曜日を選ぶ <span className="font-normal text-[var(--muted)]">{draft.trainingDays.length} / {frequency}日</span></p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="トレーニングする曜日">{weekdayOrder.map((day) => <button key={day} type="button" disabled={!profile || loading} aria-pressed={draft.trainingDays.includes(day)} onClick={() => toggleWeekday(day)} className={`min-h-11 min-w-11 rounded border px-3 text-sm font-semibold ${draft.trainingDays.includes(day) ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[var(--line)] text-[var(--muted)]"}`}>{weekdayLabels[day]}</button>)}</div>
      {draft.trainingDays.length !== frequency && <p className="mt-2 text-xs text-[var(--coral)]">{frequency}日選んでください。別の曜日に変える場合は、先に1日外してください。</p>}
      {draft.kind === "custom" && <div className="mt-4 space-y-3">{weekdayOrder.filter((day) => draft.trainingDays.includes(day)).map((day) => <fieldset key={day} className="rounded border border-[var(--line)] p-3"><legend className="px-1 text-xs font-bold text-[var(--ink)]">{weekdayLabels[day]}曜日の部位</legend><div className="flex flex-wrap gap-2">{muscleCategories.map((category) => <label key={category} className={`inline-flex min-h-11 cursor-pointer items-center gap-1 rounded border px-2 text-xs ${draft.customByWeekday?.[String(day)]?.includes(category) ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)]"}`}><input type="checkbox" checked={Boolean(draft.customByWeekday?.[String(day)]?.includes(category))} onChange={() => toggleCategory(day, category)} className="accent-[var(--sage-deep)]" />{category}</label>)}</div></fieldset>)}</div>}
      {customIncomplete && <p className="mt-2 text-xs text-[var(--coral)]">トレーニングする曜日ごとに、部位を1つ以上選んでください。</p>}
    </div>
    {week.length > 0 && <div className="mt-5"><p className="mb-2 text-xs font-bold text-[var(--ink)]">今週の予定</p><div className="flex gap-1.5 overflow-x-auto pb-1">{week.map((day) => <div key={day.date} className={`min-h-16 min-w-16 flex-1 rounded px-1 py-2 text-center ${day.date === date ? "bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "bg-[var(--sand)] text-[var(--muted)]"}`}><span className="block text-[10px] font-bold">{weekdayLabels[day.weekday]}</span><span className="mt-1 block break-words text-[10px] leading-4">{day.label}</span></div>)}</div></div>}
    {profile && <div className="mt-5 rounded bg-[var(--sand)] p-3"><p className="text-xs font-bold text-[var(--ink)]">記録日のおすすめ <span className="font-normal text-[var(--muted)]">{selectedDay?.label}</span></p>
      {suggestions.length ? <ul className="mt-2 space-y-1 text-sm font-semibold leading-6 text-[var(--ink)]">{suggestions.map((item) => <li key={item.name}>・{item.name}</li>)}</ul>
        : <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{selectedDay?.isRest ? "休みの日です。" : preferences.favoriteExercises.length ? "この部位に合うお気に入り種目がありません。" : "器具とお気に入り種目を登録すると、ここに候補が出ます。"}</p>}
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">候補は登録済みのお気に入りから選びます。セット数や負荷は記録時に調整できます。</p>
    </div>}
    <Button type="button" className="mt-5 w-full" disabled={!canSave} onClick={() => void savePlan()}>{saving ? "保存中…" : "週間メニューを保存"}</Button>
    {notice && <p role="status" className="mt-2 text-xs leading-5 text-[var(--muted)]">{notice}</p>}
  </section>;
}

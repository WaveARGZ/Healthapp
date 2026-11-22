"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/form-fields";
import { bodyMakeClient } from "@/lib/api/client";
import { loadWorkoutPreferences, storeWorkoutPreferences } from "@/lib/api/workout-preferences-client";
import { facilityEquipmentOptions } from "@/lib/data/facility-equipment-options";
import { getWorkoutWeek, weekdayLabels } from "@/lib/workouts/workout-split";
import { recommendExercises } from "@/lib/workouts/workout-recommender";
import { toDateInputValue } from "@/lib/utils/date";
import { fitnessGoalLabels, type UserProfile } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";
import type { WorkoutPreferences, WorkoutSplitPlan } from "@/types/workout-preferences";

const muscleCategories = ["胸", "背中", "肩", "腕", "脚", "腹筋・体幹", "有酸素"];
const splitOptions: Array<{ kind: WorkoutSplitPlan["kind"]; title: string; description: string }> = [
  { kind: "five", title: "5分割", description: "胸・背中・肩・腕・脚を順番に" },
  { kind: "three", title: "3分割", description: "胸＋腕・背中＋肩・脚を順番に" },
  { kind: "full", title: "全身を少しずつ", description: "トレーニング日ごとに全身を少しずつ" },
  { kind: "custom", title: "自由に割り振る", description: "曜日ごとに鍛える部位を指定" },
];
const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
const suggestedDays: Record<number, number[]> = {
  1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5], 6: [1, 2, 3, 4, 5, 6], 7: [0, 1, 2, 3, 4, 5, 6],
};

export function WorkoutPlanSetup({ date, onSave }: { date: string; onSave: () => void }) {
  const [profile, setProfile] = useState<UserProfile | null | undefined>(undefined);
  const [preferences, setPreferences] = useState<WorkoutPreferences>({ facilityEquipment: [], customEquipment: [], favoriteExercises: [], customExercises: [] });
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [draft, setDraft] = useState<WorkoutSplitPlan>({ kind: "three", trainingDays: [1, 3, 5], anchorDate: date, customByWeekday: {} });
  const [frequency, setFrequency] = useState(3);
  const [isGymMember, setIsGymMember] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [equipmentInput, setEquipmentInput] = useState("");

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
    }).catch(() => {
      if (active) {
        setNotice("週間メニューを読み込めませんでした。ページを再読み込みしてください。");
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

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

  function toggleEquipment(equipment: string) {
    setPreferences((current) => ({ ...current, facilityEquipment: current.facilityEquipment.includes(equipment)
      ? current.facilityEquipment.filter((item) => item !== equipment)
      : [...current.facilityEquipment, equipment] }));
    setNotice("");
  }

  function addCustomEquipment() {
    const value = equipmentInput.trim();
    if (!value) return;
    if ([...facilityEquipmentOptions, ...preferences.customEquipment].some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      setNotice("同じ器具は既に一覧にあります。");
      return;
    }
    setPreferences((current) => ({ ...current, customEquipment: [...current.customEquipment, value] }));
    setEquipmentInput("");
    setNotice("");
  }

  const customIncomplete = draft.kind === "custom" && draft.trainingDays.some((day) => !(draft.customByWeekday?.[String(day)]?.length));
  const canSave = !loading && !saving && Boolean(profile) && isGymMember !== null && draft.trainingDays.length === frequency && !customIncomplete && Boolean(date) && (isGymMember === false || !equipmentInput.trim());
  const week = date && draft.trainingDays.length ? getWorkoutWeek(draft, date) : [];
  const selectedDay = week.find((day) => day.date === date);
  const suggestions = profile && date ? recommendExercises({
    goal: profile.goal,
    isGymMember: isGymMember ?? undefined,
    availableEquipment: [...preferences.facilityEquipment, ...preferences.customEquipment],
    favorites: preferences.favoriteExercises,
    customExercises: preferences.customExercises,
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
      // Preserve favorites saved from the exercise picker while updating the plan and gym equipment together.
      const latest = await loadWorkoutPreferences();
      const updated = { ...latest, isGymMember, splitPlan: draft, facilityEquipment: preferences.facilityEquipment, customEquipment: preferences.customEquipment };
      await storeWorkoutPreferences(updated);
      setPreferences(updated);
      setNotice(isGymMember ? "週間メニューと器具を保存しました。" : "週間メニューを保存しました。");
      onSave();
    } catch {
      setNotice("週間メニューを保存できませんでした。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mb-7 rounded-lg border border-[var(--line)] bg-white p-4 sm:p-6" aria-labelledby="workout-plan-title">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 id="workout-plan-title" className="text-base font-bold text-[var(--ink)]">週間メニューを設定</h2><p className="mt-1 text-xs text-[var(--muted)]">目標・ジム・曜日・使える器具を決めます</p></div><span className="rounded-full bg-[var(--sage-soft)] px-3 py-1.5 text-xs font-bold text-[var(--sage-deep)]">{isGymMember === false ? 5 : 6}ステップ</span></div>
    <div className="mt-5 border-t border-[var(--line)] pt-4">
      <p className="text-sm font-bold text-[var(--ink)]"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-[#18181b] text-xs text-white">1</span>体づくりの目標</p>
      {profile ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-semibold text-[var(--ink)]">{fitnessGoalLabels[profile.goal]}</p><Link href="/onboarding" className="min-h-11 content-center text-xs font-bold text-[var(--sage-deep)] underline underline-offset-2">プロフィールで変更</Link></div>
        : loading ? <p className="mt-2 text-xs text-[var(--muted)]">目標を読み込み中…</p>
        : <div className="mt-2"><p className="text-xs leading-5 text-[var(--muted)]">先にプロフィールと目標を設定してください。</p><Link href="/onboarding" className="mt-2 inline-flex min-h-11 items-center font-bold text-[var(--sage-deep)] underline underline-offset-2">目標を設定する</Link></div>}
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-sm font-bold text-[var(--ink)]"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-[#18181b] text-xs text-white">2</span>ジムに加入していますか？</p>
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="ジムの加入状況">{([{ value: true, label: "はい" }, { value: false, label: "いいえ" }] as const).map(({ value, label }) => <button key={label} type="button" disabled={!profile || loading} aria-pressed={isGymMember === value} onClick={() => { setIsGymMember(value); setNotice(""); }} className={`min-h-12 rounded-lg border px-3 text-sm font-semibold ${isGymMember === value ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] text-[var(--ink)] hover:bg-[var(--sand)]"}`}>{label}</button>)}</div>
      {!loading && profile && isGymMember === null && <p className="mt-2 text-xs text-[var(--muted)]">週間メニューを保存する前に選択してください。</p>}
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-sm font-bold text-[var(--ink)]"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-[#18181b] text-xs text-white">3</span>週に何回トレーニングする？</p>
      <div className="mt-3 flex gap-2 overflow-x-auto py-1" role="group" aria-label="週に通う回数">{Array.from({ length: 7 }, (_, index) => index + 1).map((count) => <button key={count} type="button" disabled={!profile || loading} aria-pressed={frequency === count} onClick={() => changeFrequency(count)} className={`min-h-11 min-w-11 shrink-0 rounded-lg border px-3 text-sm font-semibold ${frequency === count ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)] text-[var(--ink)] hover:bg-[var(--sand)]"}`}>{count}回</button>)}</div>
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-sm font-bold text-[var(--ink)]"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-[#18181b] text-xs text-white">4</span>メニューの組み方</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="group" aria-label="分割方法">{splitOptions.map((option) => <button key={option.kind} type="button" disabled={!profile || loading} aria-pressed={draft.kind === option.kind} onClick={() => { setDraft((current) => ({ ...current, kind: option.kind, anchorDate: toDateInputValue() })); setNotice(""); }} className={`min-h-16 rounded-lg border px-4 py-3 text-left transition-colors ${draft.kind === option.kind ? "border-[var(--sage-deep)] bg-[var(--sage-soft)]" : "border-[var(--line)] hover:bg-[var(--sand)]"}`}><span className="block text-sm font-bold text-[var(--ink)]">{option.title}</span><span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{option.description}</span></button>)}</div>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">5分割・3分割は、通う回数に合わせて順番を週をまたいで続けます。</p>
    </div>
    <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-sm font-bold text-[var(--ink)]"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-[#18181b] text-xs text-white">5</span>トレーニングする曜日を選ぶ <span className="text-xs font-normal text-[var(--muted)]">{draft.trainingDays.length} / {frequency}日</span></p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="通う曜日">{weekdayOrder.map((day) => <button key={day} type="button" disabled={!profile || loading} aria-pressed={draft.trainingDays.includes(day)} onClick={() => toggleWeekday(day)} className={`min-h-11 min-w-11 rounded-lg border px-3 text-sm font-semibold ${draft.trainingDays.includes(day) ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--sand)]"}`}>{weekdayLabels[day]}</button>)}</div>
      {draft.trainingDays.length !== frequency && <p className="mt-2 text-xs text-[var(--coral)]">{frequency}日選んでください。別の曜日に変える場合は、先に1日外してください。</p>}
      {draft.kind === "custom" && <div className="mt-4 space-y-3">{weekdayOrder.filter((day) => draft.trainingDays.includes(day)).map((day) => <fieldset key={day} className="rounded-lg border border-[var(--line)] p-3"><legend className="px-1 text-xs font-bold text-[var(--ink)]">{weekdayLabels[day]}曜日の部位</legend><div className="flex flex-wrap gap-2">{muscleCategories.map((category) => <label key={category} className={`inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border px-2 text-xs ${draft.customByWeekday?.[String(day)]?.includes(category) ? "border-[var(--sage-deep)] bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "border-[var(--line)]"}`}><input type="checkbox" checked={Boolean(draft.customByWeekday?.[String(day)]?.includes(category))} onChange={() => toggleCategory(day, category)} className="accent-[var(--sage-deep)]" />{category}</label>)}</div></fieldset>)}</div>}
      {customIncomplete && <p className="mt-2 text-xs text-[var(--coral)]">通う曜日ごとに、部位を1つ以上選んでください。</p>}
    </div>
    {isGymMember !== false && <div className="mt-4 border-t border-[var(--line)] pt-4">
      <p className="text-sm font-bold text-[var(--ink)]"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-[#18181b] text-xs text-white">6</span>ジムで使える器具</p>
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">選んだ器具が、登録時の種目一覧とおすすめに反映されます。</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="ジムで使える器具">{facilityEquipmentOptions.map((equipment) => <label key={equipment} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-semibold leading-5"><input type="checkbox" checked={preferences.facilityEquipment.includes(equipment)} disabled={loading || saving} onChange={() => toggleEquipment(equipment)} className="size-4 shrink-0 accent-[var(--sage-deep)]" /><span>{equipment}</span></label>)}</div>
      <div className="mt-3 flex gap-2"><TextInput aria-label="その他のジム器具" value={equipmentInput} disabled={loading || saving} onChange={(event) => { setEquipmentInput(event.target.value); setNotice(""); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomEquipment(); } }} placeholder="その他の器具を入力" /><button type="button" onClick={addCustomEquipment} disabled={!equipmentInput.trim() || loading || saving} className="min-h-12 shrink-0 rounded-lg bg-[var(--sage-deep)] px-4 text-xs font-bold text-white disabled:opacity-50">追加</button></div>
      {equipmentInput.trim() && <p className="mt-1 text-xs text-[var(--muted)]">入力した器具は「追加」を押してから保存してください。</p>}
      {preferences.customEquipment.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{preferences.customEquipment.map((equipment) => <span key={equipment} className="inline-flex max-w-full items-center rounded-lg bg-[var(--sage-soft)] pl-3 text-xs"><span className="min-w-0 break-words py-2">{equipment}</span><button type="button" onClick={() => { setPreferences((current) => ({ ...current, customEquipment: current.customEquipment.filter((item) => item !== equipment) })); setNotice(""); }} disabled={loading || saving} aria-label={`${equipment}を削除`} className="grid size-11 shrink-0 place-items-center text-lg text-[var(--muted)]">×</button></span>)}</div>}
    </div>}
    {week.length > 0 && <div className="mt-5"><p className="mb-2 text-xs font-bold text-[var(--ink)]">今週の予定</p><div className="flex gap-1.5 overflow-x-auto pb-1">{week.map((day) => <div key={day.date} className={`min-h-16 min-w-16 flex-1 rounded-lg px-1 py-2 text-center ${day.date === date ? "bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "bg-[var(--sand)] text-[var(--muted)]"}`}><span className="block text-[10px] font-bold">{weekdayLabels[day.weekday]}</span><span className="mt-1 block break-words text-[10px] leading-4">{day.label}</span></div>)}</div></div>}
    {profile && <div className="mt-5 rounded-lg bg-[var(--sand)] p-4"><p className="text-xs font-bold text-[var(--ink)]">記録日のおすすめ <span className="font-normal text-[var(--muted)]">{selectedDay?.label}</span></p>
      {suggestions.length ? <ul className="mt-2 space-y-1 text-sm font-semibold leading-6 text-[var(--ink)]">{suggestions.map((item) => <li key={item.name}>・{item.name}</li>)}</ul>
        : <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{selectedDay?.isRest ? "休みの日です。" : preferences.favoriteExercises.length ? "この部位とジム設定に合うお気に入り種目がありません。" : "お気に入り種目を登録すると、ここに候補が出ます。"}</p>}
      <p className="mt-2 text-xs leading-5 text-[var(--muted)]">候補は登録済みのお気に入りから選びます。セット数や負荷は記録時に調整できます。</p>
    </div>}
    <Button type="button" className="mt-5 w-full" disabled={!canSave} onClick={() => void savePlan()}>{saving ? "保存中…" : isGymMember === false ? "週間メニューを保存" : "週間メニューと器具を保存"}</Button>
    {notice && <p role="status" className="mt-2 text-xs leading-5 text-[var(--muted)]">{notice}</p>}
  </section>;
}

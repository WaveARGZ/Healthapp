"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { exerciseCatalog, exerciseCount } from "@/lib/data/exercise-catalog";
import { detectMuscleFocus, recommendExercises } from "@/lib/workouts/workout-recommender";
import { getWorkoutPreferences } from "@/lib/storage/workout-preferences";
import { loadWorkoutPreferences, storeWorkoutPreferences } from "@/lib/api/workout-preferences-client";
import { bodyMakeClient } from "@/lib/api/client";
import type { FitnessGoal } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";
import { defaultWorkoutPreferences, type WorkoutPreferences } from "@/types/workout-preferences";
import { isCloudConfigured } from "@/lib/cloud/config";

interface ExercisePickerProps {
  onSelect: (exerciseName: string) => void;
}

const facilityEquipmentOptions = ["バーベル", "ダンベル", "スミスマシン", "ケーブルマシン", "ウェイトマシン", "ベンチ", "懸垂バー", "ディップスバー", "トレッドミル", "エアロバイク", "クロストレーナー", "ローイングマシン", "スキーエルゴ", "縄跳び", "TRX"];

export function ExercisePicker({ onSelect }: ExercisePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("すべて");
  const [preferences, setPreferences] = useState<WorkoutPreferences>(() => isCloudConfigured ? defaultWorkoutPreferences : getWorkoutPreferences());
  const [showEquipmentEditor, setShowEquipmentEditor] = useState(false);
  const [equipmentInput, setEquipmentInput] = useState("");
  const [goal, setGoal] = useState<FitnessGoal>("maintain");
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryFocus = detectMuscleFocus(query);

  useEffect(() => {
    void Promise.all([bodyMakeClient.getProfile(), bodyMakeClient.getWorkouts(), loadWorkoutPreferences()]).then(([profile, history, savedPreferences]) => {
      if (profile) setGoal(profile.goal);
      setWorkouts(history);
      setPreferences(savedPreferences);
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    // Focus the close control on phones so opening the list does not open the keyboard.
    const initialFocus = window.matchMedia("(min-width: 640px)").matches
      ? dialogRef.current?.querySelector<HTMLInputElement>('input[type="search"]')
      : dialogRef.current?.querySelector<HTMLButtonElement>("button");
    initialFocus?.focus();
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setIsOpen(false); }
      if (event.key !== "Tab") return;
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]') ?? []).filter((control) => control.getClientRects().length > 0);
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      openerRef.current?.focus();
    };
  }, [isOpen]);

  const results = useMemo(() => exerciseCatalog
    .filter((category) => activeCategory === "すべて" || activeCategory === "お気に入り" || category.label === activeCategory)
    .map((category) => ({
      ...category,
      groups: category.groups.map((group) => ({
        ...group,
        exercises: group.exercises.filter((exercise) => (activeCategory !== "お気に入り" || preferences.favoriteExercises.includes(exercise)) && (exercise.toLocaleLowerCase().includes(normalizedQuery) || Boolean(queryFocus && category.label === queryFocus))),
      })).filter((group) => group.exercises.length),
    }))
    .filter((category) => category.groups.length), [activeCategory, normalizedQuery, preferences.favoriteExercises, queryFocus]);
  const availableEquipment = useMemo(() => [...preferences.facilityEquipment, ...preferences.customEquipment], [preferences.customEquipment, preferences.facilityEquipment]);
  const suggestions = useMemo(() => recommendExercises({
    goal,
    availableEquipment,
    favorites: preferences.favoriteExercises,
    workouts,
    selectedCategory: activeCategory,
    query,
    limit: 3,
  }), [activeCategory, availableEquipment, goal, preferences, query, workouts]);

  function updatePreferences(patch: Partial<WorkoutPreferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    void storeWorkoutPreferences(next).catch(() => setPreferences(preferences));
  }

  function toggleEquipment(equipment: string) {
    const selected = preferences.facilityEquipment.includes(equipment)
      ? preferences.facilityEquipment.filter((item) => item !== equipment)
      : [...preferences.facilityEquipment, equipment];
    updatePreferences({ facilityEquipment: selected });
  }

  function toggleFavorite(exercise: string) {
    const favoriteExercises = preferences.favoriteExercises.includes(exercise)
      ? preferences.favoriteExercises.filter((item) => item !== exercise)
      : [...preferences.favoriteExercises, exercise];
    updatePreferences({ favoriteExercises });
  }

  function addCustomEquipment() {
    const value = equipmentInput.trim();
    if (!value || availableEquipment.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    updatePreferences({ customEquipment: [...preferences.customEquipment, value] });
    setEquipmentInput("");
  }

  function choose(exerciseName: string) {
    onSelect(exerciseName);
    setIsOpen(false);
    setQuery("");
  }

  return <>
    <Button type="button" variant="secondary" size="small" className="mt-2 w-full text-[var(--sage-deep)]" onClick={(event) => { openerRef.current = event.currentTarget; setIsOpen(true); }}><Icon name="dumbbell" className="size-4" />種目一覧から選ぶ</Button>
    {isOpen ? <div ref={dialogRef} className="exercise-dialog" role="dialog" aria-modal="true" aria-label="筋トレ種目を選択" onClick={(event) => { if (event.target === event.currentTarget) setIsOpen(false); }}>
      <section className="exercise-dialog-panel">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5"><div><p className="text-base font-bold text-[var(--ink)]">種目を選択</p><p className="mt-0.5 text-xs text-[var(--muted)]">{exerciseCount}種目から検索できます</p></div><button type="button" onClick={() => setIsOpen(false)} className="grid size-11 shrink-0 place-items-center rounded bg-[var(--sand)] text-xl leading-none text-[var(--muted)]" aria-label="種目メニューを閉じる">×</button></header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-white px-4 py-3 sm:px-5">
          <TextInput type="search" aria-label="種目名を検索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="種目名を検索 例：ベンチプレス" />
          <div className="mt-3 flex gap-2 overflow-x-auto px-0.5 py-1" aria-label="部位で絞り込み">{["すべて", "お気に入り", ...exerciseCatalog.map((category) => category.label)].map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`min-h-11 shrink-0 rounded px-4 py-2 text-sm font-semibold transition ${activeCategory === category ? "bg-[var(--sage-deep)] text-white" : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"}`}>{category === "お気に入り" ? `${category} ${preferences.favoriteExercises.length}` : category}</button>)}</div>
        </div>
        <div className="px-4 sm:px-5">
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold leading-5 text-[var(--ink)]">施設の器具 <span className="block text-[var(--muted)] sm:inline">{availableEquipment.length}件登録</span></p>
            <button type="button" aria-expanded={showEquipmentEditor} onClick={() => setShowEquipmentEditor((shown) => !shown)} className="min-h-11 shrink-0 rounded border border-[var(--line)] bg-white px-3 text-xs font-bold text-[var(--sage-deep)]">{showEquipmentEditor ? "器具の編集を閉じる" : "器具を登録・編集"}</button>
          </div>
          {showEquipmentEditor && <section aria-label="施設にある器具を設定" className="mt-3 rounded border border-[var(--line)] bg-white p-3">
            <p className="text-xs leading-5 text-[var(--muted)]">おすすめは☆を付けた種目から選びます。ここに施設の器具を登録すると、使える種目だけにさらに絞り込みます。</p>
            <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">{facilityEquipmentOptions.map((equipment, index) => <label key={equipment} htmlFor={`facility-equipment-${index}`} className="flex min-h-12 cursor-pointer items-center gap-2 rounded border border-[var(--line)] px-2 py-2 text-xs font-medium leading-5"><input id={`facility-equipment-${index}`} type="checkbox" checked={preferences.facilityEquipment.includes(equipment)} onChange={() => toggleEquipment(equipment)} className="size-4 shrink-0 accent-[var(--sage-deep)]" /><span className="min-w-0 break-words">{equipment}</span></label>)}</div>
            <div className="mt-3 flex gap-2"><TextInput aria-label="その他の施設器具" value={equipmentInput} onChange={(event) => setEquipmentInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomEquipment(); } }} placeholder="その他の器具を入力" /><button type="button" onClick={addCustomEquipment} disabled={!equipmentInput.trim()} className="min-h-12 shrink-0 rounded bg-[var(--sage-deep)] px-4 text-xs font-bold text-white disabled:opacity-50">追加</button></div>
            {preferences.customEquipment.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{preferences.customEquipment.map((equipment) => <span key={equipment} className="inline-flex max-w-full items-center rounded bg-[var(--sage-soft)] pl-3 text-xs"><span className="min-w-0 break-words py-2">{equipment}</span><button type="button" onClick={() => updatePreferences({ customEquipment: preferences.customEquipment.filter((item) => item !== equipment) })} aria-label={`${equipment}を削除`} className="grid size-11 shrink-0 place-items-center text-lg font-bold text-[var(--muted)]">×</button></span>)}</div>}
          </section>}
          <details aria-label="入力内容に合わせた種目の提案" className="mt-3 rounded bg-[var(--sand)] px-3">
            <summary className="min-h-12 py-3 text-sm font-semibold leading-6 text-[var(--ink)]">お気に入りからおすすめ <span className="text-xs font-normal text-[var(--muted)]">{suggestions.length}件</span></summary>
            <div className="pb-3">
              <p className="text-xs leading-5 text-[var(--muted)]">目標「{goal === "build-muscle" ? "筋肉を増やす" : goal === "lose-fat" ? "体脂肪を減らす" : "現在の体型を維持する"}」と器具・最近の記録・検索内容に合わせて選びます。</p>
              {suggestions.length ? <div className="mt-3 space-y-2">{suggestions.map((suggestion) => <button key={suggestion.name} type="button" onClick={() => choose(suggestion.name)} className="min-h-12 w-full rounded border border-[var(--line)] bg-white px-3 py-3 text-left hover:border-[var(--sage-deep)]"><span className="block text-sm font-bold leading-6 text-[var(--ink)]">{suggestion.name}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{suggestion.reasons.join("・") || suggestion.category}</span></button>)}</div> : <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{preferences.favoriteExercises.length === 0 ? "種目一覧で、ジムにある器具でできる種目に☆を付けると、ここにおすすめが表示されます。" : "お気に入りの中に条件に合う候補がありません。器具設定や検索語を調整してください。"}</p>}
            </div>
          </details>
        </div>
        <div className="px-4 pt-5 sm:px-5">
          {results.length ? <div className="space-y-6">{results.map((category) => <section key={category.label}><h2 className="text-sm font-bold text-[var(--ink)]">{category.label}</h2><div className="mt-3 space-y-4">{category.groups.map((group) => <div key={group.label}><p className="mb-2 text-xs font-semibold leading-5 text-[var(--sage-deep)]">{group.label}</p><div className="overflow-hidden rounded-md border border-[var(--line)] bg-white">{group.exercises.map((exercise, index) => <div key={exercise} className={`flex min-h-16 items-stretch ${index ? "border-t border-[var(--line)]" : ""}`}><button type="button" onClick={() => choose(exercise)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left transition hover:bg-[var(--sage-soft)] sm:gap-3"><span className="grid size-6 shrink-0 place-items-center text-[var(--muted)]"><Icon name="dumbbell" className="size-4" /></span><span className="min-w-0 flex-1 break-words text-sm font-semibold leading-6 text-[var(--ink)]">{exercise}</span><Icon name="chevron-right" className="size-4 shrink-0 text-[var(--muted)]" /></button><button type="button" aria-label={preferences.favoriteExercises.includes(exercise) ? `${exercise}をお気に入りから削除` : `${exercise}をお気に入りに登録`} aria-pressed={preferences.favoriteExercises.includes(exercise)} onClick={() => toggleFavorite(exercise)} className="grid min-h-16 w-11 shrink-0 place-items-center border-l border-[var(--line)] text-xl text-[var(--sage-deep)] sm:w-12" title="お気に入り">{preferences.favoriteExercises.includes(exercise) ? "★" : "☆"}</button></div>)}</div></div>)}</div></section>)}</div> : <div className="py-14 text-center"><Icon name="dumbbell" className="mx-auto size-6 text-[#a6ada8]" /><p className="mt-3 text-sm font-semibold text-[var(--ink)]">{activeCategory === "お気に入り" && !query ? "お気に入りはまだありません" : "該当する種目がありません"}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">種目名を変えるか、種目の☆を押して登録してください。</p></div>}
        </div>
        </div>
      </section>
    </div> : null}
  </>;
}

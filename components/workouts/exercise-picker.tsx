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
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]');
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
        <header className="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-5 py-4"><div><p className="text-sm font-bold text-[var(--ink)]">種目を選択</p><p className="mt-0.5 text-[11px] text-[var(--muted)]">{exerciseCount}種目から検索できます</p></div><button type="button" onClick={() => setIsOpen(false)} className="grid size-11 place-items-center rounded bg-[var(--sand)] text-xl leading-none text-[var(--muted)]" aria-label="種目メニューを閉じる">×</button></header>
        <div className="shrink-0 border-b border-[var(--line)] px-5 py-3">
          <TextInput type="search" aria-label="種目名を検索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="種目名を検索 例：ベンチプレス" />
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-[var(--ink)]">施設の器具 <span className="text-[var(--muted)]">{availableEquipment.length}件登録</span></p>
            <button type="button" aria-expanded={showEquipmentEditor} onClick={() => setShowEquipmentEditor((shown) => !shown)} className="min-h-11 rounded border border-[var(--line)] bg-white px-3 text-xs font-bold text-[var(--sage-deep)]">{showEquipmentEditor ? "閉じる" : "器具を登録・編集"}</button>
          </div>
          {showEquipmentEditor && <section aria-label="施設にある器具を設定" className="mt-3 rounded border border-[var(--line)] bg-white p-3">
            <p className="text-xs leading-5 text-[var(--muted)]">おすすめは☆を付けた種目から選びます。ここに施設の器具を登録すると、使える種目だけにさらに絞り込みます。</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{facilityEquipmentOptions.map((equipment, index) => <label key={equipment} htmlFor={`facility-equipment-${index}`} className="flex min-h-10 cursor-pointer items-center gap-2 rounded border border-[var(--line)] px-2 text-xs font-medium"><input id={`facility-equipment-${index}`} type="checkbox" checked={preferences.facilityEquipment.includes(equipment)} onChange={() => toggleEquipment(equipment)} className="accent-[var(--sage-deep)]" />{equipment}</label>)}</div>
            <div className="mt-3 flex gap-2"><TextInput aria-label="その他の施設器具" value={equipmentInput} onChange={(event) => setEquipmentInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomEquipment(); } }} placeholder="その他の器具を入力" /><button type="button" onClick={addCustomEquipment} disabled={!equipmentInput.trim()} className="min-h-12 shrink-0 rounded bg-[var(--sage-deep)] px-4 text-xs font-bold text-white disabled:opacity-50">追加</button></div>
            {preferences.customEquipment.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{preferences.customEquipment.map((equipment) => <span key={equipment} className="inline-flex min-h-9 items-center gap-2 rounded bg-[var(--sage-soft)] px-2 text-xs">{equipment}<button type="button" onClick={() => updatePreferences({ customEquipment: preferences.customEquipment.filter((item) => item !== equipment) })} aria-label={`${equipment}を削除`} className="font-bold text-[var(--muted)]">×</button></span>)}</div>}
          </section>}
          <section aria-label="入力内容に合わせた種目の提案" className="mt-3 rounded bg-[var(--sand)] p-3">
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-xs font-bold text-[var(--ink)]">AIおすすめ</h2><p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">お気に入り {preferences.favoriteExercises.length}種目の中から、目標・器具・最近の記録・検索内容に合わせて端末内で選びます。</p></div><span className="shrink-0 text-[10px] font-medium text-[var(--muted)]">{goal === "build-muscle" ? "筋肉を増やす" : goal === "lose-fat" ? "体脂肪を減らす" : "維持"}</span></div>
            {suggestions.length ? <div className="mt-2 grid gap-2 sm:grid-cols-3">{suggestions.map((suggestion) => <button key={suggestion.name} type="button" onClick={() => choose(suggestion.name)} className="min-h-12 rounded border border-[var(--line)] bg-white px-3 py-2 text-left hover:border-[var(--sage-deep)]"><span className="block text-xs font-bold text-[var(--ink)]">{suggestion.name}</span><span className="mt-1 block text-[10px] text-[var(--muted)]">{suggestion.reasons.join("・") || suggestion.category}</span></button>)}</div> : <p className="mt-2 text-[11px] text-[var(--muted)]">{preferences.favoriteExercises.length === 0 ? "種目一覧で、ジムにある器具でできる種目に☆を付けると、ここにおすすめが表示されます。" : "お気に入りの中に条件に合う候補がありません。器具設定や検索語を調整してください。"}</p>}
            <p className="mt-2 text-[10px] text-[var(--muted)]">外部AIへの送信は行わず、入力内容をもとに推薦順を調整します。</p>
          </section>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{["すべて", "お気に入り", ...exerciseCatalog.map((category) => category.label)].map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`min-h-11 shrink-0 rounded px-4 py-2 text-xs font-bold transition ${activeCategory === category ? "bg-[var(--sage-deep)] text-white" : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"}`}>{category === "お気に入り" ? `${category} ${preferences.favoriteExercises.length}` : category}</button>)}</div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {results.length ? <div className="space-y-6">{results.map((category) => <section key={category.label}><h2 className="text-sm font-bold text-[var(--ink)]">{activeCategory === "お気に入り" ? "お気に入り" : category.label}</h2><div className="mt-3 space-y-4">{category.groups.map((group) => <div key={group.label}><p className="mb-2 text-[11px] font-bold tracking-[0.06em] text-[var(--sage-deep)]">{group.label}</p><div className="overflow-hidden rounded-md border border-[var(--line)] bg-white">{group.exercises.map((exercise, index) => <div key={exercise} className={`flex min-h-14 items-stretch ${index ? "border-t border-[var(--line)]" : ""}`}><button type="button" onClick={() => choose(exercise)} className="flex min-w-0 flex-1 items-center gap-3 px-4 text-left transition hover:bg-[var(--sage-soft)]"><span className="grid size-6 shrink-0 place-items-center text-[var(--muted)]"><Icon name="dumbbell" className="size-3.5" /></span><span className="min-w-0 flex-1 text-sm font-semibold text-[var(--ink)]">{exercise}</span><span className="text-[11px] font-bold text-[var(--muted)]">{category.label}</span><Icon name="chevron-right" className="size-4 shrink-0 text-[#aab0ac]" /></button><button type="button" aria-label={preferences.favoriteExercises.includes(exercise) ? `${exercise}をお気に入りから削除` : `${exercise}をお気に入りに登録`} aria-pressed={preferences.favoriteExercises.includes(exercise)} onClick={() => toggleFavorite(exercise)} className="grid min-h-14 w-12 shrink-0 place-items-center text-lg text-[var(--sage-deep)]" title="お気に入り">{preferences.favoriteExercises.includes(exercise) ? "★" : "☆"}</button></div>)}</div></div>)}</div></section>)}</div> : <div className="py-14 text-center"><Icon name="dumbbell" className="mx-auto size-6 text-[#a6ada8]" /><p className="mt-3 text-sm font-semibold text-[var(--ink)]">{activeCategory === "お気に入り" ? "お気に入りはまだありません" : "該当する種目がありません"}</p><p className="mt-1 text-xs text-[var(--muted)]">種目名を変えるか、種目の☆を押して登録してください。</p></div>}
        </div>
      </section>
    </div> : null}
  </>;
}

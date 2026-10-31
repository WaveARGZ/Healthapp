"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { beginnerExerciseCatalog, beginnerExerciseCount } from "@/lib/data/beginner-exercise-catalog";
import { getExerciseShortEmbedUrl } from "@/lib/data/exercise-short-videos";
import { detectMuscleFocus, recommendExercises, usesRegisteredEquipment } from "@/lib/workouts/workout-recommender";
import { getWorkoutDayPlan, getWorkoutWeek, weekdayLabels } from "@/lib/workouts/workout-split";
import { getWorkoutPreferences } from "@/lib/storage/workout-preferences";
import { loadWorkoutPreferences, storeWorkoutPreferences } from "@/lib/api/workout-preferences-client";
import { bodyMakeClient } from "@/lib/api/client";
import type { FitnessGoal } from "@/types/user";
import type { WorkoutEntry } from "@/types/workout";
import { defaultWorkoutPreferences, type WorkoutPreferences } from "@/types/workout-preferences";
import { isCloudConfigured } from "@/lib/cloud/config";
import { isFirebaseSelected } from "@/lib/firebase/config";

interface ExercisePickerProps {
  onSelect: (exerciseName: string) => void;
  date: string;
  startWithEquipmentSetup?: boolean;
}

const facilityEquipmentOptions = ["バーベル", "ダンベル", "スミスマシン", "ケーブルマシン", "ウェイトマシン", "ベンチ", "懸垂バー", "ディップスバー", "トレッドミル", "エアロバイク", "クロストレーナー", "ローイングマシン", "スキーエルゴ", "縄跳び", "TRX"];
type TutorialStage = "equipment" | "favorite" | "recommendation" | null;

export function ExercisePicker({ onSelect, date, startWithEquipmentSetup = false }: ExercisePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("すべて");
  const [preferences, setPreferences] = useState<WorkoutPreferences>(() => isCloudConfigured || isFirebaseSelected ? defaultWorkoutPreferences : getWorkoutPreferences());
  const [showEquipmentEditor, setShowEquipmentEditor] = useState(false);
  const [tutorialStage, setTutorialStage] = useState<TutorialStage>(null);
  const [equipmentInput, setEquipmentInput] = useState("");
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");
  const [pendingPreferenceWrites, setPendingPreferenceWrites] = useState(0);
  const [goal, setGoal] = useState<FitnessGoal>("maintain");
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [videoExercise, setVideoExercise] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoCloseRef = useRef<HTMLButtonElement>(null);
  const videoOpenerNameRef = useRef<string | null>(null);
  const videoExerciseRef = useRef<string | null>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const savedListScrollRef = useRef(0);
  const firstFavoriteRef = useRef<HTMLButtonElement>(null);
  const recommendationsRef = useRef<HTMLDetailsElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const queryFocus = detectMuscleFocus(query);

  useEffect(() => {
    videoExerciseRef.current = videoExercise;
    if (videoExercise) videoCloseRef.current?.focus();
    else if (isOpen && videoOpenerNameRef.current) {
      const frame = requestAnimationFrame(() => {
        if (listScrollRef.current) listScrollRef.current.scrollTop = savedListScrollRef.current;
        Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button[data-exercise-video]") ?? [])
          .find((button) => button.dataset.exerciseVideo === videoOpenerNameRef.current)?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isOpen, videoExercise]);

  useEffect(() => {
    void Promise.all([bodyMakeClient.getProfile(), bodyMakeClient.getWorkouts()]).then(([profile, history]) => {
      if (profile) setGoal(profile.goal);
      setWorkouts(history);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    void loadWorkoutPreferences().then((loaded) => {
      if (active) { setPreferences(loaded); setPreferencesError(""); }
    }).catch(() => {
      if (active) setPreferencesError("器具情報を読み込めませんでした。もう一度お試しください。");
    }).finally(() => {
      if (active) setPreferencesReady(true);
    });
    return () => { active = false; };
  }, [isOpen]);

  useEffect(() => {
    if (!startWithEquipmentSetup || new URLSearchParams(window.location.search).get("setup") !== "equipment") return;
    const frame = requestAnimationFrame(() => {
      openerRef.current = document.querySelector<HTMLButtonElement>('[data-equipment-setup-trigger="true"]');
      setIsOpen(true);
      setShowEquipmentEditor(true);
      setTutorialStage("equipment");
    });
    return () => cancelAnimationFrame(frame);
  }, [startWithEquipmentSetup]);

  useEffect(() => {
    if (!isOpen || tutorialStage !== "favorite") return;
    const frame = requestAnimationFrame(() => {
      firstFavoriteRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, tutorialStage]);

  useEffect(() => {
    if (!isOpen || tutorialStage !== "recommendation") return;
    if (recommendationsRef.current) recommendationsRef.current.open = true;
    const frame = requestAnimationFrame(() => {
      recommendationsRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, tutorialStage]);

  useEffect(() => {
    if (isOpen && recommendationsRef.current) recommendationsRef.current.open = true;
  }, [isOpen]);

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
      if (event.key === "Escape") {
        event.preventDefault();
        if (videoExerciseRef.current) setVideoExercise(null);
        else closePicker();
      }
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

  const visibleFavoriteCount = useMemo(() => beginnerExerciseCatalog.flatMap((category) => category.groups.flatMap((group) => group.exercises))
    .filter((exercise) => preferences.favoriteExercises.includes(exercise)).length, [preferences.favoriteExercises]);
  const results = useMemo(() => beginnerExerciseCatalog
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
  const scheduledDay = preferences.splitPlan && date ? getWorkoutDayPlan(preferences.splitPlan, date) : undefined;
  const week = preferences.splitPlan && date ? getWorkoutWeek(preferences.splitPlan, date) : [];
  const suggestions = useMemo(() => recommendExercises({
    goal,
    availableEquipment,
    favorites: preferences.favoriteExercises,
    workouts,
    selectedCategory: activeCategory,
    query,
    splitPlan: preferences.splitPlan,
    date,
    limit: 3,
  }), [activeCategory, availableEquipment, date, goal, preferences, query, workouts]);
  const guideExerciseName = useMemo(() => results.flatMap((category) => category.groups.flatMap((group) => group.exercises))
    .find((exercise) => usesRegisteredEquipment(exercise, availableEquipment)) ?? results[0]?.groups[0]?.exercises[0], [availableEquipment, results]);

  function updatePreferences(patch: Partial<WorkoutPreferences>): Promise<boolean> {
    if (!preferencesReady || preferencesError) return Promise.resolve(false);
    const next = { ...preferences, ...patch };
    setPreferences(next);
    setPendingPreferenceWrites((count) => count + 1);
    const save = saveQueueRef.current.catch(() => {}).then(() => storeWorkoutPreferences(next));
    saveQueueRef.current = save;
    return save.then(() => true).catch(() => {
      setPreferences((current) => current === next ? preferences : current);
      setPreferencesError("登録内容を保存できませんでした。ページを再読み込みしてお試しください。");
      return false;
    }).finally(() => setPendingPreferenceWrites((count) => count - 1));
  }

  function toggleEquipment(equipment: string) {
    const selected = preferences.facilityEquipment.includes(equipment)
      ? preferences.facilityEquipment.filter((item) => item !== equipment)
      : [...preferences.facilityEquipment, equipment];
    void updatePreferences({ facilityEquipment: selected });
  }

  function toggleFavorite(exercise: string) {
    const wasFavorite = preferences.favoriteExercises.includes(exercise);
    const favoriteExercises = preferences.favoriteExercises.includes(exercise)
      ? preferences.favoriteExercises.filter((item) => item !== exercise)
      : [...preferences.favoriteExercises, exercise];
    void updatePreferences({ favoriteExercises }).then((saved) => {
      if (saved && tutorialStage === "favorite" && !wasFavorite) setTutorialStage("recommendation");
    });
  }

  function addCustomEquipment() {
    const value = equipmentInput.trim();
    if (!value || availableEquipment.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
    void updatePreferences({ customEquipment: [...preferences.customEquipment, value] });
    setEquipmentInput("");
  }

  function choose(exerciseName: string) {
    onSelect(exerciseName);
    closePicker();
    setQuery("");
  }

  function closePicker() {
    setIsOpen(false);
    setVideoExercise(null);
    setTutorialStage(null);
  }

  return <>
    <Button type="button" variant="secondary" size="small" className="mt-2 w-full text-[var(--sage-deep)]" data-equipment-setup-trigger={startWithEquipmentSetup || undefined} onClick={(event) => { openerRef.current = event.currentTarget; setPreferencesReady(false); setTutorialStage(null); setIsOpen(true); }}><Icon name="dumbbell" className="size-4" />種目一覧から選ぶ</Button>
    {isOpen ? <div ref={dialogRef} className="exercise-dialog" role="dialog" aria-modal="true" aria-label={videoExercise ? `${videoExercise}の動作動画` : "筋トレ種目を選択"} onClick={(event) => { if (event.target === event.currentTarget) { if (videoExercise) setVideoExercise(null); else closePicker(); } }}>
      {videoExercise ? <section className="exercise-dialog-panel">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5">
          <div><p className="text-base font-bold text-[var(--ink)]">{videoExercise}</p><p className="mt-0.5 text-xs text-[var(--muted)]">動作説明の動画</p></div>
          <button ref={videoCloseRef} type="button" onClick={() => setVideoExercise(null)} className="min-h-11 rounded bg-[var(--sand)] px-4 text-sm font-bold text-[var(--sage-deep)]">種目一覧に戻る</button>
        </header>
        <div className="min-h-0 overflow-y-auto px-4 py-4 text-center sm:px-5">
          <iframe key={videoExercise} src={getExerciseShortEmbedUrl(videoExercise)} title={`${videoExercise}の動作説明`} className="mx-auto aspect-[9/16] w-full max-w-[300px] rounded bg-black" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" />
          <p className="mt-3 text-xs text-[var(--muted)]">動画を閉じると再生が止まります。</p>
        </div>
      </section> : <>
      <section className="exercise-dialog-panel">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3 sm:px-5"><div><p className="text-base font-bold text-[var(--ink)]">{tutorialStage === "equipment" ? "ジムの器具を登録" : "種目を選択"}</p><p className="mt-0.5 text-xs text-[var(--muted)]">初心者向けの{beginnerExerciseCount}種目から選べます</p><p className="mt-0.5 text-xs text-[var(--muted)]">再生ボタンでアプリ内に動画を表示します</p></div><button type="button" onClick={closePicker} className="grid size-11 shrink-0 place-items-center rounded bg-[var(--sand)] text-xl leading-none text-[var(--muted)]" aria-label="種目メニューを閉じる">×</button></header>
        <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(16px,env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-10 border-b border-[var(--line)] bg-white px-4 py-3 sm:px-5">
          <TextInput type="search" aria-label="種目名を検索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="種目名を検索 例：ベンチプレス" />
          <div className="mt-3 flex gap-2 overflow-x-auto px-0.5 py-1" aria-label="部位で絞り込み">{["すべて", "お気に入り", ...beginnerExerciseCatalog.map((category) => category.label)].map((category) => <button key={category} type="button" onClick={() => setActiveCategory(category)} aria-pressed={activeCategory === category} className={`min-h-11 shrink-0 rounded px-4 py-2 text-sm font-semibold transition ${activeCategory === category ? "bg-[var(--sage-deep)] text-white" : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"}`}>{category === "お気に入り" ? `${category} ${visibleFavoriteCount}` : category}</button>)}</div>
        </div>
        <div className="px-4 sm:px-5">
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold leading-5 text-[var(--ink)]">施設の器具 <span className="block text-[var(--muted)] sm:inline">{availableEquipment.length}件登録</span></p>
            <button type="button" aria-expanded={showEquipmentEditor} onClick={() => { if (showEquipmentEditor && tutorialStage === "equipment") setTutorialStage(null); setShowEquipmentEditor((shown) => !shown); }} className="min-h-11 shrink-0 rounded border border-[var(--line)] bg-white px-3 text-xs font-bold text-[var(--sage-deep)]">{showEquipmentEditor ? "器具の編集を閉じる" : "器具を登録・編集"}</button>
          </div>
          {showEquipmentEditor && <section aria-label="施設にある器具を設定" className="mt-3 rounded border border-[var(--line)] bg-white p-3">
            <p className="text-xs leading-5 text-[var(--muted)]">ジムで使える器具を選んでください。あとから変更できます。</p>
            {!preferencesReady && <p role="status" className="mt-2 text-xs text-[var(--muted)]">器具情報を読み込み中…</p>}
            {preferencesError && <p role="alert" className="mt-2 text-xs leading-5 text-[var(--coral)]">{preferencesError}</p>}
            <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">{facilityEquipmentOptions.map((equipment, index) => <label key={equipment} htmlFor={`facility-equipment-${index}`} className="flex min-h-12 cursor-pointer items-center gap-2 rounded border border-[var(--line)] px-2 py-2 text-xs font-medium leading-5"><input id={`facility-equipment-${index}`} type="checkbox" checked={preferences.facilityEquipment.includes(equipment)} disabled={!preferencesReady || Boolean(preferencesError)} onChange={() => toggleEquipment(equipment)} className="size-4 shrink-0 accent-[var(--sage-deep)]" /><span className="min-w-0 break-words">{equipment}</span></label>)}</div>
            <div className="mt-3 flex gap-2"><TextInput aria-label="その他の施設器具" value={equipmentInput} disabled={!preferencesReady || Boolean(preferencesError)} onChange={(event) => setEquipmentInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomEquipment(); } }} placeholder="その他の器具を入力" /><button type="button" onClick={addCustomEquipment} disabled={!equipmentInput.trim() || !preferencesReady || Boolean(preferencesError)} className="min-h-12 shrink-0 rounded bg-[var(--sage-deep)] px-4 text-xs font-bold text-white disabled:opacity-50">追加</button></div>
            {preferences.customEquipment.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{preferences.customEquipment.map((equipment) => <span key={equipment} className="inline-flex max-w-full items-center rounded bg-[var(--sage-soft)] pl-3 text-xs"><span className="min-w-0 break-words py-2">{equipment}</span><button type="button" onClick={() => void updatePreferences({ customEquipment: preferences.customEquipment.filter((item) => item !== equipment) })} aria-label={`${equipment}を削除`} className="grid size-11 shrink-0 place-items-center text-lg font-bold text-[var(--muted)]">×</button></span>)}</div>}
          </section>}
          <details ref={recommendationsRef} aria-label="入力内容に合わせた種目の提案" className={`mt-3 scroll-mt-28 rounded bg-[var(--sand)] px-3 ${tutorialStage === "recommendation" ? "workout-recommendation-nudge" : ""}`}>
            <summary className="min-h-12 py-3 text-sm font-semibold leading-6 text-[var(--ink)]">お気に入りからおすすめ <span className="text-xs font-normal text-[var(--muted)]">{suggestions.length}件</span></summary>
            <div className="pb-3">
              <section aria-label="週間トレーニングプラン" className="mb-4 rounded border border-[var(--line)] bg-white p-3">
                <p className="text-xs font-bold text-[var(--ink)]">週間メニュー <span className="font-normal text-[var(--muted)]">{preferences.splitPlan ? `週${preferences.splitPlan.trainingDays.length}回` : "未設定"}</span></p>
                {preferences.splitPlan && <>
                  <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="選択日の週の予定">{week.map((day) => <div key={day.date} className={`min-h-16 min-w-16 flex-1 rounded px-1 py-2 text-center ${day.date === date ? "bg-[var(--sage-soft)] text-[var(--sage-deep)]" : "bg-[var(--sand)] text-[var(--muted)]"}`}><span className="block text-[10px] font-bold">{weekdayLabels[day.weekday]}</span><span className="mt-1 block break-words text-[10px] leading-4">{day.label}</span></div>)}</div>
                  <p className="mt-2 text-xs font-semibold text-[var(--ink)]">記録日：{scheduledDay?.label}の日</p>
                </>}
                <p className="mt-2 text-xs text-[var(--muted)]">目標・通う回数・曜日・分割方法は筋トレ画面上部の「週間メニュー」で変更できます。</p>
              </section>
              <p className="text-xs leading-5 text-[var(--muted)]">目標「{goal === "build-muscle" ? "筋肉を増やす" : goal === "lose-fat" ? "体脂肪を減らす" : "現在の体型を維持する"}」と器具・最近の記録・検索内容に合わせて選びます。</p>
              {suggestions.length ? <div className="mt-3 space-y-2">{suggestions.map((suggestion) => <button key={suggestion.name} type="button" onClick={() => choose(suggestion.name)} className="min-h-12 w-full rounded border border-[var(--line)] bg-white px-3 py-3 text-left hover:border-[var(--sage-deep)]"><span className="block text-sm font-bold leading-6 text-[var(--ink)]">{suggestion.name}</span><span className="mt-1 block text-xs leading-5 text-[var(--muted)]">{suggestion.reasons.join("・") || suggestion.category}</span></button>)}</div> : <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{scheduledDay?.isRest ? "今日は休みの日です。必要なら下の一覧から手動で種目を選べます。" : visibleFavoriteCount === 0 ? "下の初心者向け種目に☆を付けると、ここにおすすめが表示されます。" : "お気に入りの中に条件に合う候補がありません。器具設定や検索語を調整してください。"}</p>}
            </div>
          </details>
        </div>
        <div className="px-4 pt-5 sm:px-5">
          {results.length ? <div className="space-y-6">{results.map((category) => <section key={category.label}><h2 className="text-sm font-bold text-[var(--ink)]">{category.label}</h2><div className="mt-3 space-y-4">{category.groups.map((group) => <div key={group.label}><p className="mb-2 text-xs font-semibold leading-5 text-[var(--sage-deep)]">{group.label}</p><div className="overflow-hidden rounded-md border border-[var(--line)] bg-white">{group.exercises.map((exercise, index) => <div key={exercise} className={`flex min-h-16 items-stretch ${index ? "border-t border-[var(--line)]" : ""}`}><button type="button" onClick={() => choose(exercise)} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left transition hover:bg-[var(--sage-soft)] sm:gap-3"><span className="grid size-6 shrink-0 place-items-center text-[var(--muted)]"><Icon name="dumbbell" className="size-4" /></span><span className="min-w-0 flex-1 break-words text-sm font-semibold leading-6 text-[var(--ink)]">{exercise}</span><Icon name="chevron-right" className="size-4 shrink-0 text-[var(--muted)]" /></button><button type="button" data-exercise-video={exercise} onClick={() => { videoOpenerNameRef.current = exercise; savedListScrollRef.current = listScrollRef.current?.scrollTop ?? 0; setVideoExercise(exercise); }} aria-label={`${exercise}の動作説明をアプリ内で見る`} title="動作動画を見る" className="grid min-h-16 w-11 shrink-0 place-items-center border-l border-[var(--line)] text-[var(--sage-deep)] hover:bg-[var(--sage-soft)] sm:w-12"><Icon name="play" className="size-5" /></button><button ref={exercise === guideExerciseName ? firstFavoriteRef : undefined} type="button" disabled={!preferencesReady || Boolean(preferencesError)} aria-label={preferences.favoriteExercises.includes(exercise) ? `${exercise}をお気に入りから削除` : `${exercise}をお気に入りに登録`} aria-pressed={preferences.favoriteExercises.includes(exercise)} onClick={() => toggleFavorite(exercise)} className={`grid min-h-16 w-11 shrink-0 place-items-center border-l border-[var(--line)] text-xl text-[var(--sage-deep)] disabled:opacity-40 sm:w-12 ${tutorialStage === "favorite" && exercise === guideExerciseName ? "workout-favorite-nudge" : ""}`} title="お気に入り">{preferences.favoriteExercises.includes(exercise) ? "★" : "☆"}</button></div>)}</div></div>)}</div></section>)}</div> : <div className="py-14 text-center"><Icon name="dumbbell" className="mx-auto size-6 text-[#a6ada8]" /><p className="mt-3 text-sm font-semibold text-[var(--ink)]">{activeCategory === "お気に入り" && !query ? "お気に入りはまだありません" : "該当する種目がありません"}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">種目名を変えるか、種目の☆を押して登録してください。</p></div>}
        </div>
        </div>
        {tutorialStage && <div className="shrink-0 border-t border-[var(--line)] bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:px-5">
          <div key={tutorialStage} className="workout-guide-enter grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:flex sm:gap-3" aria-live="polite">
            <span className="metric shrink-0 rounded bg-[var(--sage-soft)] px-2 py-1 text-xs font-bold text-[var(--sage-deep)]">{tutorialStage === "equipment" ? "1 / 3" : tutorialStage === "favorite" ? "2 / 3" : "3 / 3"}</span>
            <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--ink)]">{tutorialStage === "equipment" ? "使える器具を選びましょう。複数選べます。" : tutorialStage === "favorite" ? "種目名の右にある ☆ を押して、お気に入りに登録しましょう。" : "☆を付けた種目は、上のおすすめ候補になります。器具や目標に合うものが表示されます。"}</p>
            {tutorialStage === "equipment" && <button type="button" disabled={availableEquipment.length === 0 || !preferencesReady || pendingPreferenceWrites > 0 || Boolean(preferencesError)} onClick={() => { setActiveCategory("すべて"); setQuery(""); setShowEquipmentEditor(false); setTutorialStage("favorite"); }} className="col-span-2 min-h-11 rounded bg-[var(--sage-deep)] px-3 text-xs font-bold text-white disabled:opacity-40 sm:shrink-0">次へ</button>}
            {tutorialStage === "recommendation" && <button type="button" onClick={() => setTutorialStage(null)} className="col-span-2 min-h-11 rounded bg-[var(--sage-deep)] px-3 text-xs font-bold text-white sm:shrink-0">完了</button>}
          </div>
          <button type="button" onClick={() => setTutorialStage(null)} className="mt-1 min-h-11 text-xs font-medium text-[var(--muted)] underline underline-offset-2">案内を閉じる</button>
        </div>}
      </section>
      </>}
    </div> : null}
  </>;
}

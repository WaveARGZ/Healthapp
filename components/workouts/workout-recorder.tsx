"use client";

import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { ExerciseMotionIcon } from "@/components/workouts/exercise-motion-icon";
import { RecordActions } from "@/components/ui/record-actions";
import { PageHeader } from "@/components/ui/page-header";
import { ExercisePicker } from "@/components/workouts/exercise-picker";
import { DailyBurnRecorder } from "@/components/workouts/daily-burn-recorder";
import { WorkoutTimer, WorkoutTimerProvider } from "@/components/workouts/workout-timer";
import { AnatomyFigure } from "@/components/dashboard/anatomy-figure";
import { activityTint, inactiveOutlineColor } from "@/components/dashboard/activity-color";
import { WorkoutPlanSetup } from "@/components/workouts/workout-plan-setup";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate, toDateInputValue, toTimeInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import { summarizeMuscleActivity } from "@/lib/workouts/muscle-activity";
import { defaultStrengthSetCount, formatWorkoutSet, isCardioExercise, selectDraftExercise, setsFor, type WorkoutExerciseDraft } from "@/lib/workouts/workout-sets";
import type { WorkoutEntry, WorkoutExercise, WorkoutSet } from "@/types/workout";

function newSet(): WorkoutSet {
  return { id: createId("set"), completed: false };
}

function newExercise(): WorkoutExerciseDraft {
  return { id: createId("exercise"), name: "", setRecords: Array.from({ length: defaultStrengthSetCount }, newSet) };
}

function volumeFor(exercise: WorkoutExercise): number {
  return setsFor(exercise).reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0);
}

const calendarWeekdays = ["月", "火", "水", "木", "金", "土", "日"];

function WorkoutCalendarMuscleMap({ history }: { history: WorkoutEntry[] }) {
  const activity = summarizeMuscleActivity(history, toDateInputValue());
  return <section aria-labelledby="workout-calendar-map-title" className="rounded-lg border border-[var(--line)] bg-white p-4 sm:p-5">
    <h3 id="workout-calendar-map-title" className="text-lg font-bold">筋トレ部位マップ</h3>
    <p className="mt-1 text-sm text-[var(--muted)]">直近14日間に鍛えた部位</p>
    <div className="mt-4 grid grid-cols-2 gap-3"><AnatomyFigure view="front" activity={activity} /><AnatomyFigure view="back" activity={activity} /></div>
    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-[var(--muted)]" aria-label="0日は青の輪郭、1日は薄い赤、2日以上は濃い赤">
      <span className="size-3 rounded-full border-2 bg-white" style={{ borderColor: inactiveOutlineColor }} />0日
      <span className="size-3 rounded-full" style={{ backgroundColor: activityTint(1).color }} />1日
      <span className="size-3 rounded-full" style={{ backgroundColor: activityTint(2).color }} />2日以上
    </div>
  </section>;
}

function WorkoutHistoryCalendar({ history, month, selectedDate, onMonthChange, onDateSelect, onDelete, children }: {
  history: WorkoutEntry[];
  month: string;
  selectedDate: string | null;
  onMonthChange: (month: string) => void;
  onDateSelect: (date: string | null) => void;
  onDelete: (id: string) => void;
  children: ReactNode;
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const recordedByDate = new Map<string, WorkoutEntry[]>();
  for (const entry of history) {
    const entries = recordedByDate.get(entry.performedAt) ?? [];
    entries.push(entry);
    recordedByDate.set(entry.performedAt, entries);
  }
  const selectedEntries = selectedDate ? recordedByDate.get(selectedDate) ?? [] : [];
  const recordedDaysThisMonth = [...recordedByDate.keys()].filter((date) => date.startsWith(`${month}-`)).length;
  const today = toDateInputValue();
  const currentYear = Number(today.slice(0, 4));
  const recordedYears = history.map((entry) => entry.performedAt).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).map((date) => Number(date.slice(0, 4)));
  const firstYear = Math.min(currentYear - 5, year, ...recordedYears);
  const lastYear = Math.max(2030, currentYear + 1, year, ...recordedYears);

  function changeMonth(offset: number) {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    onMonthChange(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  function registerToday() {
    onMonthChange(today.slice(0, 7));
    onDateSelect(today);
    requestAnimationFrame(() => document.getElementById("workout-calendar-back")?.focus());
  }

  return <section aria-labelledby={selectedDate ? "workout-selected-date-title" : "workout-history-title"}>
    <div hidden={selectedDate !== null}>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="workout-history-title" className="section-title">筋トレカレンダー</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">表示月の記録日数 <strong className="metric text-[var(--sage-deep)]">{recordedDaysThisMonth}日</strong></p>
      </div>
      <Button type="button" onClick={registerToday} aria-label="今日の筋トレを登録"><Icon name="plus" className="size-4" />今日の筋トレを登録</Button>
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
    <div className="rounded-lg border border-[var(--line)] bg-white p-3 sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-2">
        <button type="button" aria-label="前の月" onClick={() => changeMonth(-1)} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--sand)]">‹</button>
        <div className="flex min-w-0 items-center justify-center gap-1.5">
          <select aria-label="表示する年" value={year} onChange={(event) => onMonthChange(`${event.target.value}-${String(monthNumber).padStart(2, "0")}`)} className="min-h-11 rounded-lg border border-[var(--line)] bg-white px-2 text-sm font-semibold">
            {Array.from({ length: lastYear - firstYear + 1 }, (_, index) => firstYear + index).map((option) => <option key={option} value={option}>{option}年</option>)}
          </select>
          <select aria-label="表示する月" value={monthNumber} onChange={(event) => onMonthChange(`${year}-${String(event.target.value).padStart(2, "0")}`)} className="min-h-11 rounded-lg border border-[var(--line)] bg-white px-2 text-sm font-semibold">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((option) => <option key={option} value={option}>{option}月</option>)}
          </select>
        </div>
        <button type="button" aria-label="次の月" onClick={() => changeMonth(1)} className="grid size-11 shrink-0 place-items-center rounded-lg border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--sand)]">›</button>
      </div>
      <div>
          <div className="grid grid-cols-7 border-b border-[var(--line)] pb-1 text-center text-sm font-semibold text-[var(--muted)]">{calendarWeekdays.map((day) => <span key={day} className="py-2">{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-y-1">{Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
            const day = index - firstWeekday + 1;
            if (day < 1) return <span key={`empty-${index}`} aria-hidden="true" />;
            const date = `${month}-${String(day).padStart(2, "0")}`;
            const count = recordedByDate.get(date)?.length ?? 0;
            return <div key={date} className="flex justify-center"><button
              id={`workout-day-${date}`}
              type="button"
              aria-label={`${year}年${monthNumber}月${day}日${count ? `、筋トレ記録${count}件` : "、記録なし"}`}
              aria-current={date === today ? "date" : undefined}
              onClick={() => {
                onDateSelect(date);
                requestAnimationFrame(() => document.getElementById("workout-calendar-back")?.focus());
              }}
              className={`relative grid h-11 w-full max-w-11 place-items-center rounded-full text-base font-semibold aria-[current=date]:ring-1 aria-[current=date]:ring-offset-1 aria-[current=date]:ring-[var(--sage-deep)] ${selectedDate === date ? "bg-[var(--ink)] text-white" : count ? "bg-[var(--sage-deep)] text-white hover:bg-[#3e503b]" : "text-[var(--ink-soft)] hover:bg-[var(--sand)]"}`}
            >{day}{count > 0 && <span className="absolute bottom-0.5 size-1 rounded-full bg-current" />}</button></div>;
          })}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--line)] pt-3 text-xs leading-6 text-[var(--muted)]">
        <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full bg-[var(--sage-deep)]" />記録あり</span>
        <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full border border-[var(--sage-deep)]" />今日</span>
      </div>
    </div>
    <WorkoutCalendarMuscleMap history={history} />
    </div>
    </div>
    {selectedDate && <div id="workout-selected-date">
      <button id="workout-calendar-back" type="button" onClick={() => {
        onDateSelect(null);
        requestAnimationFrame(() => document.getElementById(`workout-day-${selectedDate}`)?.focus());
      }} className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--sage-deep)] underline underline-offset-2">← カレンダーへ戻る</button>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--sage-soft)] p-4">
        <div><p className="text-xs font-bold text-[var(--sage-deep)]">選択した日</p><h2 id="workout-selected-date-title" className="mt-1 text-lg font-bold text-[var(--ink)]">{formatDate(selectedDate, { year: "numeric" })}の記録</h2></div>
        {selectedEntries.length > 0 && <a href="#workout-selected-records" className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--sage-deep)] underline underline-offset-2">この日の記録 {selectedEntries.length}件を見る</a>}
      </div>
      {children}
    </div>}
    {selectedDate && <div id="workout-selected-records" className="mt-7 rounded-lg border border-[var(--line)] bg-white p-4 sm:p-5" aria-live="polite">
      <h3 className="text-sm font-bold">{formatDate(selectedDate, { year: "numeric" })}の記録 <span className="ml-1 font-normal text-[var(--muted)]">{selectedEntries.length}件</span></h3>
      {selectedEntries.length ? <div className="mt-3 border-t border-[var(--line)]">{selectedEntries.map((entry) => <article key={entry.id} className="border-b border-[var(--line)] py-5 last:border-b-0">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-[var(--sage-deep)]">{entry.performedTime ? <span className="metric">{entry.performedTime}</span> : "時刻未記録"}</p><p className="mt-2 break-words text-sm font-semibold leading-6">{entry.exercises.map((exercise) => exercise.name).join("・")}</p></div><button type="button" aria-label={`${formatDate(entry.performedAt)}の筋トレ記録を削除`} onClick={() => onDelete(entry.id)} className="delete-button shrink-0"><Icon name="trash" className="size-4" /></button></div>
        <div className="mt-3 space-y-3">{entry.exercises.map((exercise) => <div key={exercise.id} className="text-xs leading-6 text-[var(--muted)]">
          <div className="flex items-center gap-3"><ExerciseMotionIcon name={exercise.name} category={exercise.category} className="size-16" /><p className="min-w-0 break-words font-medium">{exercise.name}</p></div>
          <div className="mt-1 flex flex-wrap gap-2">
            {setsFor(exercise).map((set, setIndex) => <div key={set.id} className="min-w-0 max-w-full rounded-lg bg-[var(--sand)] px-2 py-1">
              <p className="metric"><span className="mr-2 text-[var(--muted)]">{setIndex + 1}.</span>{formatWorkoutSet(exercise, set)}</p>
              {set.note?.trim() && <p className="whitespace-pre-wrap text-sm text-[var(--ink-soft)]">{set.note}</p>}
            </div>)}
          </div>
        </div>)}</div>
      </article>)}</div> : <p className="mt-3 text-sm text-[var(--muted)]">この日の記録はありません。</p>}
    </div>}
  </section>;
}

export function WorkoutRecorder() {
  const [performedAt, setPerformedAt] = useState(toDateInputValue());
  const [performedTime, setPerformedTime] = useState("");
  // Stable first-render IDs keep the server HTML and hydrated client inputs identical.
  const [exercises, setExercises] = useState<WorkoutExerciseDraft[]>([{ id: "exercise-initial", name: "", setRecords: Array.from({ length: defaultStrengthSetCount }, (_, index) => ({ id: `set-initial-${index + 1}`, completed: false })) }]);
  const [history, setHistory] = useState<WorkoutEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"record" | "plan">("record");
  const [calendarMonth, setCalendarMonth] = useState(toDateInputValue().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function handlePlanSave() {
    setNotice("週間メニューと器具を保存しました。種目のおすすめに反映されます。");
    setActiveTab("record");
    document.getElementById("workout-record-tab")?.focus();
  }

  useEffect(() => {
    void loadHistory();
    const frame = requestAnimationFrame(() => setPerformedTime(toTimeInputValue()));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function openBurnFromHash() {
      if (window.location.hash !== "#daily-burn-title") return;
      const day = toDateInputValue();
      setActiveTab("record");
      setCalendarMonth(day.slice(0, 7));
      setSelectedDate(day);
      setPerformedAt(day);
    }
    openBurnFromHash();
    window.addEventListener("hashchange", openBurnFromHash);
    return () => window.removeEventListener("hashchange", openBurnFromHash);
  }, []);

  useEffect(() => {
    if (activeTab !== "record" || !selectedDate || window.location.hash !== "#daily-burn-title") return;
    requestAnimationFrame(() => document.getElementById("daily-burn-title")?.scrollIntoView({ block: "start" }));
  }, [activeTab, selectedDate]);

  async function loadHistory() { setHistory(await bodyMakeClient.getWorkouts()); }
  function selectExercise(id: string, name: string, category: WorkoutExercise["category"]) {
    setExercises((current) => current.map((exercise) => exercise.id === id ? selectDraftExercise(exercise, { name, category }, newSet) : exercise));
  }
  function updateSet(exerciseId: string, setId: string, patch: Partial<WorkoutSet>) {
    setExercises((current) => current.map((exercise) => exercise.id !== exerciseId ? exercise : { ...exercise, setRecords: exercise.setRecords.map((set) => set.id === setId ? { ...set, ...patch } : set) }));
  }
  function addSet(exerciseId: string) { setExercises((current) => current.map((exercise) => exercise.id === exerciseId ? { ...exercise, setRecords: [...exercise.setRecords, newSet()] } : exercise)); }
  function removeSet(exerciseId: string, setId: string) { setExercises((current) => current.map((exercise) => exercise.id === exerciseId && exercise.setRecords.length > 1 ? { ...exercise, setRecords: exercise.setRecords.filter((set) => set.id !== setId) } : exercise)); }
  function removeExercise(id: string) { setExercises((current) => current.length > 1 ? current.filter((exercise) => exercise.id !== id) : current); }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validExercises = exercises.filter((exercise) => exercise.name.trim()).map(({ id, name, category, setRecords }) => ({ id, name, category, setRecords }));
    if (!validExercises.length) return;
    setIsSaving(true);
    setNotice("");
    try {
      await bodyMakeClient.saveWorkout({ id: createId("workout"), performedAt, performedTime, exercises: validExercises, createdAt: new Date().toISOString() });
      setExercises([newExercise()]);
      setPerformedTime(toTimeInputValue());
      await loadHistory();
      setCalendarMonth(performedAt.slice(0, 7));
      setSelectedDate(performedAt);
      setNotice("筋トレを保存しました。");
    } catch {
      setNotice("保存できませんでした。入力内容を確認して再度お試しください。");
    } finally { setIsSaving(false); }
  }

  async function deleteEntry(id: string) { await bodyMakeClient.deleteWorkout(id); await loadHistory(); }

  return <>
    <PageHeader title="筋トレ" />
    <div role="tablist" aria-label="筋トレの表示切り替え" className="mb-7 grid w-full max-w-sm grid-cols-2 gap-1 rounded-lg border border-[var(--line)] bg-[var(--sand)] p-1">
      {([{ id: "record", label: "筋トレ記録" }, { id: "plan", label: "週間メニュー" }] as const).map((tab) => <button
        key={tab.id}
        id={`workout-${tab.id}-tab`}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls={`workout-${tab.id}-panel`}
        tabIndex={activeTab === tab.id ? 0 : -1}
        onClick={() => setActiveTab(tab.id)}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "record" : event.key === "End" ? "plan" : tab.id === "record" ? "plan" : "record";
          setActiveTab(next);
          document.getElementById(`workout-${next}-tab`)?.focus();
        }}
        className={`min-h-11 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${activeTab === tab.id ? "bg-white text-[var(--sage-deep)]" : "text-[var(--muted)] hover:text-[var(--ink)]"}`}
      >{tab.label}</button>)}
    </div>
    <div id="workout-plan-panel" role="tabpanel" aria-labelledby="workout-plan-tab" hidden={activeTab !== "plan"}>
      <WorkoutPlanSetup date={performedAt} onSave={handlePlanSave} />
    </div>
    <div id="workout-record-panel" role="tabpanel" aria-labelledby="workout-record-tab" hidden={activeTab !== "record"}>
    <WorkoutTimerProvider>
    <WorkoutTimer />
    <WorkoutHistoryCalendar history={history} month={calendarMonth} selectedDate={selectedDate} onMonthChange={(month) => { setCalendarMonth(month); setSelectedDate(null); }} onDateSelect={(date) => { setSelectedDate(date); if (date) setPerformedAt(date); setNotice(""); }} onDelete={(id) => { void deleteEntry(id); }}>
    <form onSubmit={handleSubmit}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="w-full min-w-0 sm:max-w-[180px]"><FieldLabel htmlFor="workout-time">時刻</FieldLabel><TextInput id="workout-time" type="time" step="60" value={performedTime} onChange={(event) => setPerformedTime(event.target.value)} required /></div>
        <p className="metric py-2 text-sm text-[var(--muted)]">{exercises.length} 種目</p>
      </div>
      <div className="space-y-4">
        {exercises.map((exercise, index) => {
          const sets = exercise.setRecords;
          const cardio = isCardioExercise(exercise);
          const completedCount = sets.filter((set) => set.completed).length;
          return <section key={exercise.id} className="overflow-hidden rounded-lg border border-[var(--line)] bg-white">
            <div className="flex min-h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--sand)] pl-4 pr-2">
              <h2 className="text-sm font-semibold">種目 {index + 1}</h2>
              {exercises.length > 1 && <button type="button" aria-label={`${index + 1}番目の種目を削除`} onClick={() => removeExercise(exercise.id)} className="delete-button"><Icon name="trash" className="size-4" /></button>}
            </div>
            <div className="px-3 py-5 sm:px-5">
              <div className="mt-2 flex items-center gap-3">{exercise.name && <ExerciseMotionIcon name={exercise.name} category={exercise.category} className="size-20" />}<p className={`min-w-0 break-words text-sm font-bold ${exercise.name ? "text-[var(--ink)]" : "text-[var(--muted)]"}`}>{exercise.name || "種目を選んでください"}</p></div>
              <ExercisePicker date={performedAt} time={performedTime} workouts={history} startWithEquipmentSetup={index === 0}
                exerciseName={exercise.name} exerciseCategory={exercise.category} cardio={cardio} sets={sets}
                onSelect={(name, category) => selectExercise(exercise.id, name, category ?? null)}
                onUpdateSet={(setId, patch) => updateSet(exercise.id, setId, patch)} onAddSet={() => addSet(exercise.id)} onRemoveSet={(setId) => removeSet(exercise.id, setId)} />
              {exercise.name && <>
                <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm leading-6 text-[var(--muted)]">{!cardio && <span>総ボリューム <strong className="metric font-semibold text-[var(--ink)]">{volumeFor(exercise).toLocaleString()} kg</strong></span>}<span>完了 {completedCount} / {sets.length}</span></div>
                <div aria-label={`${exercise.name}のセット内容`} className="divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)]">{sets.map((set, setIndex) => <div key={set.id} className="px-3">
                  <div className="flex min-h-14 items-center gap-3">
                    <span className="metric w-7 shrink-0 text-sm font-semibold text-[var(--muted)]">{setIndex + 1}</span>
                    <span className="metric min-w-0 flex-1 text-sm font-semibold text-[var(--ink)]">{formatWorkoutSet(exercise, set)}</span>
                    <button type="button" onClick={() => updateSet(exercise.id, set.id, { completed: !set.completed })} aria-pressed={set.completed} aria-label={`${setIndex + 1}セット目の完了`} className={`grid size-11 shrink-0 place-items-center rounded border ${set.completed ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[var(--line)] text-[var(--muted)]"}`}><Icon name="check" className="size-5" /></button>
                  </div>
                  {set.note?.trim() && <p className="pb-3 pl-10 text-sm whitespace-pre-wrap text-[var(--ink-soft)]">{set.note}</p>}
                </div>)}</div>
              </>}
            </div>
          </section>;
        })}
      </div>
      <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setExercises((current) => [...current, newExercise()])}><Icon name="plus" className="size-4" />種目を追加</Button>
      <RecordActions label={isSaving ? "保存中…" : "筋トレを保存"} summary={`${exercises.filter((exercise) => exercise.name.trim()).length} 種目`} disabled={isSaving || !exercises.some((exercise) => exercise.name.trim())} notice={notice} />
    </form>
    {selectedDate && <div className="mt-7"><DailyBurnRecorder day={selectedDate} /></div>}
    </WorkoutHistoryCalendar>
    </WorkoutTimerProvider>
    </div>
  </>;
}

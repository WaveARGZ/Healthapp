"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldLabel, TextInput } from "@/components/ui/form-fields";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { ExercisePicker } from "@/components/workouts/exercise-picker";
import { bodyMakeClient } from "@/lib/api/client";
import { formatDate, toDateInputValue } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import type { WorkoutEntry, WorkoutExercise, WorkoutSet } from "@/types/workout";

function newSet(): WorkoutSet {
  return { id: createId("set"), weightKg: undefined, reps: undefined, completed: false };
}

function newExercise(): WorkoutExercise {
  return { id: createId("exercise"), name: "", setRecords: [newSet()] };
}

function setsFor(exercise: WorkoutExercise): WorkoutSet[] {
  if (Array.isArray(exercise.setRecords)) return exercise.setRecords;
  return Array.from({ length: exercise.sets ?? 1 }, (_, index) => ({
    id: `${exercise.id}-legacy-${index}`,
    weightKg: exercise.weightKg,
    reps: exercise.reps,
    completed: false,
  }));
}

function volumeFor(exercise: WorkoutExercise): number {
  return setsFor(exercise).reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0);
}

export function WorkoutRecorder() {
  const [performedAt, setPerformedAt] = useState(toDateInputValue());
  const [exercises, setExercises] = useState<WorkoutExercise[]>([newExercise()]);
  const [history, setHistory] = useState<WorkoutEntry[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { void loadHistory(); }, []);

  async function loadHistory() { setHistory(await bodyMakeClient.getWorkouts()); }
  function updateExercise(id: string, patch: Partial<WorkoutExercise>) { setExercises((current) => current.map((exercise) => exercise.id === id ? { ...exercise, ...patch } : exercise)); }
  function updateSet(exerciseId: string, setId: string, patch: Partial<WorkoutSet>) {
    setExercises((current) => current.map((exercise) => exercise.id !== exerciseId ? exercise : { ...exercise, setRecords: setsFor(exercise).map((set) => set.id === setId ? { ...set, ...patch } : set) }));
  }
  function addSet(exerciseId: string) { setExercises((current) => current.map((exercise) => exercise.id === exerciseId ? { ...exercise, setRecords: [...setsFor(exercise), newSet()] } : exercise)); }
  function removeSet(exerciseId: string, setId: string) { setExercises((current) => current.map((exercise) => { const sets = setsFor(exercise); return exercise.id === exerciseId && sets.length > 1 ? { ...exercise, setRecords: sets.filter((set) => set.id !== setId) } : exercise; })); }
  function removeExercise(id: string) { setExercises((current) => current.length > 1 ? current.filter((exercise) => exercise.id !== id) : current); }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validExercises = exercises.filter((exercise) => exercise.name.trim());
    if (!validExercises.length) return;
    setIsSaving(true);
    setNotice("");
    try {
      await bodyMakeClient.saveWorkout({ id: createId("workout"), performedAt, exercises: validExercises, createdAt: new Date().toISOString() });
      setExercises([newExercise()]);
      await loadHistory();
      setNotice("筋トレを保存しました。");
    } catch {
      setNotice("保存できませんでした。入力内容を確認して再度お試しください。");
    } finally { setIsSaving(false); }
  }

  async function deleteEntry(id: string) { await bodyMakeClient.deleteWorkout(id); await loadHistory(); }

  return <>
    <PageHeader title="筋トレ" description="種目を選んで、セットごとに記録。" />
    <form onSubmit={handleSubmit}>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="w-48 max-w-[65%]"><FieldLabel htmlFor="workout-date">記録日</FieldLabel><TextInput id="workout-date" type="date" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} required /></div>
        <p className="pb-3 text-xs text-[var(--muted)]">{exercises.length} 種目</p>
      </div>
      <div className="space-y-6">
        {exercises.map((exercise, index) => {
          const sets = setsFor(exercise);
          const completedCount = sets.filter((set) => set.completed).length;
          return <section key={exercise.id} className="overflow-hidden rounded-md border border-[var(--line)]">
            <div className="flex min-h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--sand)] pl-4 pr-2">
              <h2 className="flex items-center gap-3 text-sm font-semibold"><span className="metric text-xs text-[var(--muted)]">{String(index + 1).padStart(2, "0")}</span>トレーニング</h2>
              {exercises.length > 1 && <button type="button" aria-label={`${index + 1}番目の種目を削除`} onClick={() => removeExercise(exercise.id)} className="delete-button"><Icon name="trash" className="size-4" /></button>}
            </div>
            <div className="px-3 py-5 sm:px-5">
              <FieldLabel htmlFor={`exercise-${exercise.id}`}>種目名</FieldLabel>
              <TextInput id={`exercise-${exercise.id}`} value={exercise.name} onChange={(event) => updateExercise(exercise.id, { name: event.target.value })} placeholder="例：ベンチプレス" />
              <ExercisePicker onSelect={(name) => updateExercise(exercise.id, { name })} />
              <div className="mb-3 mt-6 flex items-center justify-between text-[11px] text-[var(--muted)]"><span>総ボリューム <strong className="metric font-semibold text-[var(--ink)]">{volumeFor(exercise).toLocaleString()} kg</strong></span><span>完了 {completedCount} / {sets.length}</span></div>
              <div className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_44px_32px] gap-2 border-y border-[var(--line)] py-2 text-center text-[10px] font-semibold text-[var(--muted)]"><span>#</span><span>重量 kg</span><span>回数</span><span>完了</span><span className="sr-only">削除</span></div>
              <div className="mt-3 space-y-2">{sets.map((set, setIndex) => <div key={set.id} className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_44px_32px] items-center gap-2">
                <span className="metric text-center text-xs text-[var(--muted)]">{setIndex + 1}</span>
                <TextInput type="number" min="0" step="0.5" inputMode="decimal" aria-label={`${setIndex + 1}セット目の重量`} value={set.weightKg ?? ""} onChange={(event) => updateSet(exercise.id, set.id, { weightKg: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" className="metric h-11 px-1 text-center" />
                <TextInput type="number" min="0" inputMode="numeric" aria-label={`${setIndex + 1}セット目の回数`} value={set.reps ?? ""} onChange={(event) => updateSet(exercise.id, set.id, { reps: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" className="metric h-11 px-1 text-center" />
                <button type="button" onClick={() => updateSet(exercise.id, set.id, { completed: !set.completed })} aria-pressed={set.completed} aria-label={`${setIndex + 1}セット目の完了`} className={`grid size-11 place-items-center rounded border ${set.completed ? "border-[var(--sage-deep)] bg-[var(--sage-deep)] text-white" : "border-[var(--line)] text-[var(--muted)]"}`}><Icon name="check" className="size-5" /></button>
                <button type="button" disabled={sets.length === 1} onClick={() => removeSet(exercise.id, set.id)} aria-label={`${setIndex + 1}セット目を削除`} className="grid h-11 w-8 place-items-center text-[var(--muted)] hover:text-[var(--coral)] disabled:opacity-25"><Icon name="trash" className="size-3.5" /></button>
              </div>)}</div>
              <Button type="button" variant="ghost" size="small" className="mt-4 w-full text-[var(--sage-deep)]" onClick={() => addSet(exercise.id)}><Icon name="plus" className="size-4" />セットを追加</Button>
            </div>
          </section>;
        })}
      </div>
      <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => setExercises((current) => [...current, newExercise()])}><Icon name="plus" className="size-4" />種目を追加</Button>
      <Button type="submit" className="mt-6 w-full" disabled={isSaving || !exercises.some((exercise) => exercise.name.trim())}>{isSaving ? "保存中…" : "筋トレを保存"}</Button>
      {notice && <p role="status" className="mt-3 text-sm text-[var(--sage-deep)]">{notice}</p>}
    </form>
    <section className="mt-12">
      <div className="mb-4 flex items-center justify-between"><h2 className="section-title">これまでの記録</h2><span className="text-xs text-[var(--muted)]">{history.length}件</span></div>
      {history.length === 0 ? <EmptyState description="保存したトレーニングはここに表示されます。" /> : <div className="border-t border-[var(--line)]">{history.map((entry) => <article key={entry.id} className="border-b border-[var(--line)] py-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--sage-deep)]">{formatDate(entry.performedAt)}</p><p className="mt-2 text-sm font-semibold leading-6">{entry.exercises.map((exercise) => exercise.name).join("・")}</p></div><button type="button" aria-label="この筋トレ記録を削除" onClick={() => void deleteEntry(entry.id)} className="delete-button shrink-0"><Icon name="trash" className="size-4" /></button></div>
        <div className="mt-3 space-y-2">{entry.exercises.map((exercise) => <p key={exercise.id} className="text-xs leading-6 text-[var(--muted)]">{exercise.name}<span className="metric ml-2">{setsFor(exercise).map((set) => `${set.weightKg ?? "—"}kg × ${set.reps ?? "—"}回`).join(" / ")}</span></p>)}</div>
      </article>)}</div>}
    </section>
  </>;
}

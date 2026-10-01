"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    await bodyMakeClient.saveWorkout({ id: createId("workout"), performedAt, exercises: validExercises, createdAt: new Date().toISOString() });
    setExercises([newExercise()]);
    setIsSaving(false);
    await loadHistory();
  }

  async function deleteEntry(id: string) { await bodyMakeClient.deleteWorkout(id); await loadHistory(); }

  return <>
    <PageHeader eyebrow="WORKOUT LOG" title="筋トレを記録" description="種目ごとにセットを積み上げて、今日のトレーニングを残しましょう。" />
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <div className="flex items-end gap-3"><div className="flex-1"><FieldLabel htmlFor="workout-date">日付</FieldLabel><TextInput id="workout-date" type="date" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} required /></div><div className="mb-1.5 rounded-xl bg-[var(--sage-soft)] px-3 py-2 text-xs font-bold text-[var(--sage-deep)]">セット単位で記録</div></div>
        <div className="mt-6 space-y-5">
          {exercises.map((exercise, index) => {
            const sets = setsFor(exercise);
            const completedCount = sets.filter((set) => set.completed).length;
            return <div key={exercise.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[#fdfdfc]">
              <div className="flex items-center justify-between border-b border-[var(--line)] bg-white px-4 py-3"><p className="text-xs font-bold tracking-[0.08em] text-[var(--sage-deep)]">トレーニング {index + 1}</p>{exercises.length > 1 ? <button type="button" onClick={() => removeExercise(exercise.id)} className="inline-flex items-center gap-1 text-xs font-bold text-[var(--coral)]"><Icon name="trash" className="size-3.5" />削除</button> : null}</div>
              <div className="p-4"><FieldLabel htmlFor={`exercise-${exercise.id}`}>種目名</FieldLabel><TextInput id={`exercise-${exercise.id}`} value={exercise.name} onChange={(event) => updateExercise(exercise.id, { name: event.target.value })} placeholder="例：ベンチプレス" /><ExercisePicker onSelect={(name) => updateExercise(exercise.id, { name })} />
                <div className="mt-5 flex items-center justify-between"><div><p className="text-xs font-bold text-[var(--ink)]">セット</p><p className="mt-1 text-[11px] text-[var(--muted)]">総ボリューム {volumeFor(exercise).toLocaleString()} kg</p></div><span className="rounded-full bg-[var(--sand)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)]">完了 {completedCount}/{sets.length}</span></div>
                <div className="mt-3 grid grid-cols-[38px_1fr_1fr_42px] gap-2 px-1 text-[10px] font-bold text-[#88928b]"><span>セット</span><span>kg</span><span>回</span><span className="text-center">完了</span></div>
                <div className="mt-2 space-y-2">{sets.map((set, setIndex) => <div key={set.id} className="grid grid-cols-[38px_1fr_1fr_42px] items-center gap-2"><button type="button" onClick={() => removeSet(exercise.id, set.id)} aria-label={`${setIndex + 1}セット目を削除`} className="grid size-9 place-items-center rounded-xl bg-[var(--sand)] text-xs font-bold text-[var(--muted)]">{setIndex + 1}</button><TextInput type="number" min="0" step="0.5" inputMode="decimal" aria-label={`${setIndex + 1}セット目の重量`} value={set.weightKg ?? ""} onChange={(event) => updateSet(exercise.id, set.id, { weightKg: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" className="h-10 px-2 text-center" /><TextInput type="number" min="0" inputMode="numeric" aria-label={`${setIndex + 1}セット目の回数`} value={set.reps ?? ""} onChange={(event) => updateSet(exercise.id, set.id, { reps: event.target.value ? Number(event.target.value) : undefined })} placeholder="0" className="h-10 px-2 text-center" /><button type="button" onClick={() => updateSet(exercise.id, set.id, { completed: !set.completed })} aria-label={`${setIndex + 1}セット目を${set.completed ? "未完了" : "完了"}にする`} className={`grid size-10 place-items-center rounded-xl transition ${set.completed ? "bg-[var(--sage-deep)] text-white" : "bg-[#e7ece8] text-[#a5afa8]"}`}><Icon name="check" className="size-5" /></button></div>)}</div>
                <Button type="button" variant="ghost" size="small" className="mt-4 w-full border border-dashed border-[var(--line)] text-[var(--sage-deep)]" onClick={() => addSet(exercise.id)}><Icon name="plus" className="size-4" />セットを追加</Button>
              </div>
            </div>;
          })}
        </div>
        <Button type="button" variant="secondary" className="mt-5 w-full border-dashed" onClick={() => setExercises((current) => [...current, newExercise()])}><Icon name="plus" className="size-4" />トレーニングを追加</Button>
      </Card>
      <Button type="submit" className="w-full" disabled={isSaving}>{isSaving ? "保存中..." : "今日の筋トレを保存"}</Button>
    </form>
    <section className="mt-9"><h2 className="font-display text-xl font-semibold tracking-[-0.035em] text-[var(--ink)]">過去の筋トレ</h2>{history.length === 0 ? <Card className="mt-3 text-center"><Icon name="dumbbell" className="mx-auto size-6 text-[#a5aca7]" /><p className="mt-2 text-sm font-semibold text-[var(--ink)]">まだ記録がありません</p><p className="mt-1 text-xs text-[var(--muted)]">最初のトレーニングを残してみましょう。</p></Card> : <div className="mt-3 space-y-3">{history.map((entry) => <Card key={entry.id} className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs font-bold text-[var(--sage-deep)]">{formatDate(entry.performedAt)}</p><p className="mt-1 text-sm font-bold text-[var(--ink)]">{entry.exercises.map((exercise) => exercise.name).join("・")}</p></div><button type="button" aria-label="この筋トレ記録を削除" onClick={() => void deleteEntry(entry.id)} className="rounded-lg p-1.5 text-[#9aa19e] hover:bg-[var(--coral-soft)] hover:text-[var(--coral)]"><Icon name="trash" className="size-4" /></button></div><div className="mt-3 space-y-1.5">{entry.exercises.map((exercise) => <p key={exercise.id} className="text-xs text-[var(--muted)]">{exercise.name} <span className="ml-1">{setsFor(exercise).map((set) => `${set.weightKg ?? "--"}kg × ${set.reps ?? "--"}回`).join(" / ")}</span></p>)}</div></Card>)}</div>}</section>
  </>;
}

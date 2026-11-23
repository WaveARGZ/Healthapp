import { canonicalExerciseName, registeredExerciseForName } from "../data/registration-exercise-catalog.ts";
import type { WorkoutEntry, WorkoutExercise, WorkoutSet } from "../../types/workout";

type ExerciseSelection = Pick<WorkoutExercise, "name" | "category">;

export type WorkoutExerciseDraft = WorkoutExercise & {
  setRecords: WorkoutSet[];
  alternateSetRecords?: WorkoutSet[];
};

export const defaultStrengthSetCount = 4;

export function isCardioExercise({ name, category }: ExerciseSelection): boolean {
  return (category ?? registeredExerciseForName(name)?.category) === "有酸素";
}

export function selectDraftExercise(exercise: WorkoutExerciseDraft, selection: ExerciseSelection, createSet: () => WorkoutSet): WorkoutExerciseDraft {
  const next = { ...exercise, ...selection };
  const cardio = isCardioExercise(next);
  if (isCardioExercise(exercise) === cardio) return next;
  return {
    ...next,
    setRecords: exercise.alternateSetRecords ?? Array.from({ length: cardio ? 1 : defaultStrengthSetCount }, createSet),
    alternateSetRecords: exercise.setRecords,
  };
}

export function setsFor(exercise: WorkoutExercise): WorkoutSet[] {
  if (Array.isArray(exercise.setRecords)) return exercise.setRecords;
  return Array.from({ length: exercise.sets ?? 1 }, (_, index) => ({
    id: `${exercise.id}-legacy-${index}`,
    weightKg: exercise.weightKg,
    reps: exercise.reps,
    completed: false,
  }));
}

export function previousWorkoutSets(
  workouts: readonly WorkoutEntry[],
  selection: ExerciseSelection,
  { performedAt, performedTime }: Pick<WorkoutEntry, "performedAt" | "performedTime">,
): readonly WorkoutSet[] {
  const name = canonicalExerciseName(selection.name);
  if (!name) return [];

  const category = selection.category ?? registeredExerciseForName(name)?.category;
  const metrics = isCardioExercise(selection) ? ["durationMinutes", "distanceKm"] as const : ["weightKg", "reps"] as const;
  const prior = workouts.filter((entry) => {
    if (entry.performedAt !== performedAt) return entry.performedAt < performedAt;
    return !entry.performedTime || !performedTime || entry.performedTime <= performedTime;
  }).sort((a, b) => b.performedAt.localeCompare(a.performedAt)
    || (b.performedTime ?? "").localeCompare(a.performedTime ?? "")
    || b.createdAt.localeCompare(a.createdAt));

  for (const workout of prior) {
    for (let index = workout.exercises.length - 1; index >= 0; index--) {
      const exercise = workout.exercises[index];
      if (canonicalExerciseName(exercise.name) !== name || (category && exercise.category && exercise.category !== category)) continue;
      const sets = setsFor(exercise);
      if (sets.some((set) => set.note?.trim() || metrics.some((key) => Number.isFinite(set[key])))) return sets;
    }
  }

  return [];
}

export function formatWorkoutSet(exercise: ExerciseSelection, set: WorkoutSet): string {
  if (isCardioExercise(exercise)) {
    const hasCardioValues = set.durationMinutes !== undefined || set.distanceKm !== undefined;
    const hasLegacyValues = set.weightKg !== undefined || set.reps !== undefined;
    if (hasCardioValues || !hasLegacyValues) return `${set.durationMinutes ?? "—"} 分・${set.distanceKm ?? "—"} km`;
  }
  return `${set.weightKg ?? "—"} kg × ${set.reps ?? "—"} 回`;
}

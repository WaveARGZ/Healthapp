import { registeredExerciseForName } from "../data/registration-exercise-catalog.ts";
import type { WorkoutExercise, WorkoutSet } from "../../types/workout";

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

export function formatWorkoutSet(exercise: ExerciseSelection, set: WorkoutSet): string {
  if (isCardioExercise(exercise)) {
    const hasCardioValues = set.durationMinutes !== undefined || set.distanceKm !== undefined;
    const hasLegacyValues = set.weightKg !== undefined || set.reps !== undefined;
    if (hasCardioValues || !hasLegacyValues) return `${set.durationMinutes ?? "—"} 分・${set.distanceKm ?? "—"} km`;
  }
  return `${set.weightKg ?? "—"} kg × ${set.reps ?? "—"} 回`;
}

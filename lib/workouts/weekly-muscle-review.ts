import { groupsForExercise, muscleGroups, type MuscleActivity, type MuscleGroup } from "./muscle-activity.ts";
import { canonicalExerciseName, registeredExerciseForName } from "../data/registration-exercise-catalog.ts";
import type { WorkoutEntry } from "../../types/workout";

export interface WeeklyMuscleExercise {
  name: string;
  dates: string[];
  maxWeightKg: number | null;
  repsAtMax: number | null;
  recordedSets: number;
}

export interface WeeklyMuscleGroup {
  days: number;
  exercises: WeeklyMuscleExercise[];
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Uses the exercise category or catalog for the selected week; weights are recorded values, not estimated one-rep maxima. */
export function summarizeWeeklyMuscles(workouts: readonly WorkoutEntry[], startDate: string, endDate: string) {
  const grouped = Object.fromEntries(muscleGroups.map((group) => [group, new Map<string, WeeklyMuscleExercise>()])) as Record<MuscleGroup, Map<string, WeeklyMuscleExercise>>;
  for (const workout of workouts) {
    if (workout.performedAt < startDate || workout.performedAt > endDate) continue;
    for (const exercise of workout.exercises) {
      const originalName = exercise.name.trim();
      const defaultExercise = registeredExerciseForName(originalName);
      const name = !exercise.category || exercise.category === defaultExercise?.category ? canonicalExerciseName(originalName) : originalName;
      if (!name) continue;
      const weights = (exercise.setRecords ?? []).filter((set) => validNumber(set.weightKg))
        .map((set) => ({ weight: set.weightKg!, reps: validNumber(set.reps) ? set.reps : null }));
      if (validNumber(exercise.weightKg)) weights.push({ weight: exercise.weightKg, reps: validNumber(exercise.reps) ? exercise.reps : null });
      const peak = weights.sort((a, b) => b.weight - a.weight || (b.reps ?? 0) - (a.reps ?? 0))[0];
      const recordedSets = exercise.setRecords?.filter((set) => validNumber(set.weightKg) || validNumber(set.reps) || set.completed).length
        ?? (validNumber(exercise.sets) ? exercise.sets : 0);
      for (const group of groupsForExercise(originalName, exercise.category)) {
        const existing = grouped[group].get(name) ?? { name, dates: [], maxWeightKg: null, repsAtMax: null, recordedSets: 0 };
        if (!existing.dates.includes(workout.performedAt)) existing.dates.push(workout.performedAt);
        existing.recordedSets += recordedSets;
        if (peak && (existing.maxWeightKg === null || peak.weight > existing.maxWeightKg
          || (peak.weight === existing.maxWeightKg && (peak.reps ?? 0) > (existing.repsAtMax ?? 0)))) {
          existing.maxWeightKg = peak.weight;
          existing.repsAtMax = peak.reps;
        }
        grouped[group].set(name, existing);
      }
    }
  }
  const groups = Object.fromEntries(muscleGroups.map((group) => {
    const exercises = [...grouped[group].values()].map((exercise) => ({ ...exercise, dates: exercise.dates.sort().reverse() }))
      .sort((a, b) => b.dates[0].localeCompare(a.dates[0]) || a.name.localeCompare(b.name, "ja"));
    const days = new Set(exercises.flatMap((exercise) => exercise.dates)).size;
    return [group, { days, exercises }];
  })) as Record<MuscleGroup, WeeklyMuscleGroup>;
  const activity = Object.fromEntries(muscleGroups.map((group) => [group, groups[group].days])) as MuscleActivity;
  return { groups, activity };
}

import { exerciseCatalog } from "../data/exercise-catalog.ts";
import type { WorkoutEntry } from "../../types/workout";

export const muscleGroups = ["胸", "背中", "腕", "肩", "腹筋・体幹", "脚"] as const;
export type MuscleGroup = typeof muscleGroups[number];
export type MuscleActivity = Record<MuscleGroup, number>;

const muscleGroupSet = new Set<string>(muscleGroups);
const groupsByExercise = new Map<string, MuscleGroup[]>();
for (const category of exerciseCatalog) {
  if (!muscleGroupSet.has(category.label)) continue;
  for (const exercise of category.groups.flatMap((group) => group.exercises)) {
    const groups = groupsByExercise.get(exercise) ?? [];
    if (!groups.includes(category.label as MuscleGroup)) groups.push(category.label as MuscleGroup);
    groupsByExercise.set(exercise, groups);
  }
}

function groupsForExercise(name: string): MuscleGroup[] {
  const trimmed = name.trim();
  const catalogGroups = groupsByExercise.get(trimmed);
  if (catalogGroups) return catalogGroups;
  const matches: MuscleGroup[] = [];
  if (/胸|大胸筋/.test(trimmed)) matches.push("胸");
  if (/背中|背筋|広背筋/.test(trimmed)) matches.push("背中");
  if (/腕|二頭筋|三頭筋|前腕/.test(trimmed)) matches.push("腕");
  if (/肩|三角筋/.test(trimmed)) matches.push("肩");
  if (/腹筋|腹直筋|腹斜筋|体幹|コア/.test(trimmed)) matches.push("腹筋・体幹");
  if (/脚|大腿|ハムストリング|臀部|ふくらはぎ/.test(trimmed)) matches.push("脚");
  return matches;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function summarizeMuscleActivity(workouts: WorkoutEntry[], today: string): MuscleActivity {
  const datesByGroup = Object.fromEntries(muscleGroups.map((group) => [group, new Set<string>()])) as Record<MuscleGroup, Set<string>>;
  if (!isValidDate(today)) {
    return Object.fromEntries(muscleGroups.map((group) => [group, 0])) as MuscleActivity;
  }
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 13);
  const startDate = end.toISOString().slice(0, 10);

  for (const workout of workouts) {
    if (!isValidDate(workout.performedAt) || workout.performedAt < startDate || workout.performedAt > today) continue;
    for (const exercise of workout.exercises) {
      for (const group of groupsForExercise(exercise.name)) datesByGroup[group].add(workout.performedAt);
    }
  }
  return Object.fromEntries(muscleGroups.map((group) => [group, datesByGroup[group].size])) as MuscleActivity;
}

import type { WorkoutExerciseCategory } from "./workout-preferences";

export interface WorkoutSet {
  id: string;
  weightKg?: number;
  reps?: number;
  note?: string;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  /** The body part selected for a user-defined exercise. Null clears a previous selection. */
  category?: WorkoutExerciseCategory | null;
  /** New set-level records. `weightKg`/`reps`/`sets` are retained for legacy entries. */
  setRecords?: WorkoutSet[];
  weightKg?: number;
  reps?: number;
  sets?: number;
}

export interface WorkoutEntry {
  id: string;
  /** Local calendar date (YYYY-MM-DD). */
  performedAt: string;
  /** Local clock time (HH:mm). Optional for records saved before time tracking. */
  performedTime?: string;
  exercises: WorkoutExercise[];
  createdAt: string;
}

/** A daily total stored alongside workouts for compatibility with the existing record API. */
export interface DailyBurnEntry extends WorkoutEntry {
  recordType: "daily-burn";
  caloriesBurned: number;
  exercises: [];
}

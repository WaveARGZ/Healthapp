export interface WorkoutSet {
  id: string;
  weightKg?: number;
  reps?: number;
  completed: boolean;
}

export interface WorkoutExercise {
  id: string;
  name: string;
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

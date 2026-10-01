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
  performedAt: string;
  exercises: WorkoutExercise[];
  createdAt: string;
}

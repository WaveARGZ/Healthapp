import type { DailyBurnEntry, WorkoutEntry } from "@/types/workout";

export function dailyBurnId(day: string): string {
  return `daily-burn-${day}`;
}

export function splitWorkoutRecords(entries: readonly WorkoutEntry[]): { workouts: WorkoutEntry[]; burns: DailyBurnEntry[] } {
  const workouts: WorkoutEntry[] = [];
  const burns: DailyBurnEntry[] = [];

  for (const entry of entries) {
    if ((entry as Partial<DailyBurnEntry>).recordType === "daily-burn") {
      const burn = entry as DailyBurnEntry;
      if (Number.isFinite(burn.caloriesBurned) && burn.caloriesBurned >= 0 && Array.isArray(burn.exercises) && burn.exercises.length === 0) burns.push(burn);
    } else workouts.push(entry);
  }

  return { workouts, burns };
}

export function burnMinusIntake(burned: number | null, consumed: number | null): number | null {
  if (burned === null || consumed === null || !Number.isFinite(burned) || !Number.isFinite(consumed)) return null;
  return Math.round(burned - consumed);
}

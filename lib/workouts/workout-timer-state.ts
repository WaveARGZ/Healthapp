export type TimerMode = "rest" | "cardio";
export type DurationUnit = "minutes" | "seconds";

export type WorkoutTimerState = {
  mode: TimerMode;
  durationDraft: Record<DurationUnit, string>;
  elapsedMs: number;
  startedAt: number | null;
};

export const initialWorkoutTimer: WorkoutTimerState = {
  mode: "rest",
  durationDraft: { minutes: "1", seconds: "30" },
  elapsedMs: 0,
  startedAt: null,
};

export function restDurationMs({ minutes, seconds }: WorkoutTimerState["durationDraft"]): number {
  const duration = (Number(minutes) * 60 + Number(seconds)) * 1000;
  return Number.isSafeInteger(duration) && duration > 0 && Number(seconds) < 60 ? duration : 0;
}

export function workoutTimerElapsed(state: WorkoutTimerState, now: number): number {
  return state.elapsedMs + (state.startedAt === null ? 0 : Math.max(0, now - state.startedAt));
}

export function restoreWorkoutTimer(serialized: string | null): WorkoutTimerState {
  if (!serialized) return initialWorkoutTimer;
  try {
    const state = JSON.parse(serialized) as WorkoutTimerState;
    if ((state.mode === "rest" || state.mode === "cardio") && [state.durationDraft?.minutes, state.durationDraft?.seconds].every((value) => typeof value === "string" && /^\d*$/.test(value))
      && Number.isSafeInteger(state.elapsedMs) && state.elapsedMs >= 0
      && (state.startedAt === null || Number.isSafeInteger(state.startedAt) && state.startedAt > 0)) return state;
  } catch { /* A damaged browser record can be reset safely. */ }
  return initialWorkoutTimer;
}

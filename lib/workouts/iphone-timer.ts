export const IPHONE_TIMER_SHORTCUT = "BodyMake休憩タイマー";
export const MAX_IPHONE_TIMER_SECONDS = 24 * 60 * 60 - 1;

// Only a duration is passed to Shortcuts. No workout or account data leaves BodyMake.
export function iphoneTimerURL(seconds: number): string | null {
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_IPHONE_TIMER_SECONDS) return null;
  return `shortcuts://run-shortcut?name=${encodeURIComponent(IPHONE_TIMER_SHORTCUT)}&input=text&text=${seconds}`;
}

export function remainingRestSeconds(durationMs: number, elapsed: number, startedAt: number | null, timestamp: number) {
  const currentElapsed = elapsed + (startedAt === null ? 0 : Math.max(0, timestamp - startedAt));
  return Math.max(0, Math.ceil((durationMs - currentElapsed) / 1000));
}

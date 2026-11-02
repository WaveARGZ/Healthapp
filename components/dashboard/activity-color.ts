export const maxActivityDays = 2;

const activityTints = [
  { color: "transparent", opacity: 0 },
  { color: "#e2bfb9", opacity: 0.55 },
  { color: "#ca8b80", opacity: 1 },
] as const;

export function activityTint(days: number): { color: string; opacity: number } {
  const count = Number.isFinite(days) ? Math.max(0, Math.min(maxActivityDays, Math.floor(days))) : 0;
  return activityTints[count];
}

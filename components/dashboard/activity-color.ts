export const maxActivityDays = 3;

const activityTints = [
  { color: "transparent", opacity: 0 },
  { color: "#42ad61", opacity: 0.85 },
  { color: "#397fcb", opacity: 0.9 },
  { color: "#ca8b80", opacity: 0 },
] as const;

export function activityTint(days: number): { color: string; opacity: number } {
  const count = Number.isFinite(days) ? Math.max(0, Math.min(maxActivityDays, Math.floor(days))) : 0;
  return activityTints[count];
}

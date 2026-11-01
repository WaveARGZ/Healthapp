export const maxActivityDays = 14;

const colorStops = [
  { days: 1, rgb: [66, 173, 97], opacity: 0.85 },
  { days: 4, rgb: [41, 182, 173], opacity: 0.88 },
  { days: 7, rgb: [57, 127, 203], opacity: 0.9 },
  { days: 10, rgb: [141, 117, 189], opacity: 0.7 },
  { days: 14, rgb: [202, 139, 128], opacity: 0 },
] as const;

function toHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0");
}

export function activityTint(days: number): { color: string; opacity: number } {
  const count = Number.isFinite(days) ? Math.max(0, Math.min(maxActivityDays, Math.floor(days))) : 0;
  if (count === 0) return { color: "transparent", opacity: 0 };

  const nextIndex = colorStops.findIndex((stop) => count <= stop.days);
  const next = colorStops[nextIndex];
  const previous = colorStops[Math.max(0, nextIndex - 1)];
  const progress = next === previous ? 0 : (count - previous.days) / (next.days - previous.days);
  const rgb = previous.rgb.map((channel, index) => channel + (next.rgb[index] - channel) * progress);

  return {
    color: `#${rgb.map(toHex).join("")}`,
    opacity: previous.opacity + (next.opacity - previous.opacity) * progress,
  };
}

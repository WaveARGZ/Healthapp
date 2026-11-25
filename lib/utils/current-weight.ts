import type { WeightEntry } from "../../types/progress";

export function isBodyWeightKg(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 20 && value <= 400;
}

export function compareWeightEntriesNewest(a: WeightEntry, b: WeightEntry): number {
  return (b.measuredOn ?? "").localeCompare(a.measuredOn ?? "") || (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}

export function latestWeightEntry(entries: readonly WeightEntry[], today: string): WeightEntry | undefined {
  let latest: WeightEntry | undefined;
  for (const entry of entries) {
    if (!entry.measuredOn || entry.measuredOn > today || !isBodyWeightKg(entry.weightKg)) continue;
    if (!latest || compareWeightEntriesNewest(entry, latest) < 0) latest = entry;
  }
  return latest;
}

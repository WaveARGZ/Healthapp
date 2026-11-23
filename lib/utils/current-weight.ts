import type { WeightEntry } from "../../types/progress";

export function latestWeightEntry(entries: readonly WeightEntry[], today: string): WeightEntry | undefined {
  let latest: WeightEntry | undefined;
  for (const entry of entries) {
    if (!entry.measuredOn || entry.measuredOn > today || !Number.isFinite(entry.weightKg) || entry.weightKg < 20 || entry.weightKg > 400) continue;
    if (!latest || entry.measuredOn > latest.measuredOn ||
      (entry.measuredOn === latest.measuredOn && (entry.createdAt ?? "") > (latest.createdAt ?? ""))) {
      latest = entry;
    }
  }
  return latest;
}

import { getWorkoutDayPlan } from "../workouts/workout-split.ts";
import { normalizeWorkoutPreferences } from "../../types/workout-preferences.ts";
import { registrationExercises } from "../data/registration-exercise-catalog.ts";
import { object, validDate, validateAdviceInput, type AdviceInput, type AdviceDay } from "./contracts.ts";

const label = (v: unknown) => typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80) : "";
const known = (v: unknown, max: number) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null;
function nutrient(meal: Record<string, unknown>, key: string, max: number) {
  if (Array.isArray(meal.items) && meal.items.length) {
    const values = meal.items.map(item => object(item) ? known(item[key], max) : null);
    return values.some(v => v === null) ? null : known(values.reduce<number>((s, v) => s + v!, 0), max);
  }
  return known(meal[key], max);
}
/** Allow-list outbound fields. No IDs, personal names, emails, photos, or workout notes. */
export function summarizeAdviceRecords(records: { profile: unknown; meals: unknown; workouts: unknown; preferences: unknown }, date: string, constraints = ""): AdviceInput {
  if (!validDate(date) || !Array.isArray(records.meals) || !Array.isArray(records.workouts)
    || (records.profile !== null && !object(records.profile)) || !object(records.preferences)) throw new Error("records_unavailable");
  const profile = records.profile; const preferences = normalizeWorkoutPreferences(records.preferences);
  const days: AdviceDay[] = Array.from({ length: 7 }, (_, i) => ({ date: new Date(Date.parse(date) - (6 - i) * 86400000).toISOString().slice(0, 10), meals: [], workouts: [] }));
  let truncated = false;
  for (const meal of records.meals) {
    if (!object(meal) || !validDate(meal.recordedAt) || !label(meal.name)) throw new Error("records_unavailable");
    const day = days.find(d => d.date === meal.recordedAt); if (!day) continue;
    if (day.meals.length >= 12) { truncated = true; continue; }
    day.meals.push({ name: label(meal.name), kcal: nutrient(meal, "calories", 20000), protein: nutrient(meal, "proteinG", 3000), fat: nutrient(meal, "fatG", 3000), carbs: nutrient(meal, "carbsG", 3000) });
  }
  for (const workout of records.workouts) {
    if (!object(workout)) throw new Error("records_unavailable");
    if (workout.recordType === "daily-burn") continue;
    if (!validDate(workout.performedAt) || !Array.isArray(workout.exercises)) throw new Error("records_unavailable");
    const day = days.find(d => d.date === workout.performedAt); if (!day) continue;
    for (const ex of workout.exercises) {
      if (!object(ex) || !label(ex.name)) throw new Error("records_unavailable");
      const completed = Array.isArray(ex.setRecords) ? ex.setRecords.filter(s => object(s) && s.completed === true) as Record<string, unknown>[] : [];
      if (Array.isArray(ex.setRecords) && !completed.length) continue;
      const count = completed.length || known(ex.sets, 200); if (!count) continue;
      if (day.workouts.length >= 16) { truncated = true; continue; }
      const values = (key: string, max: number) => completed.length ? completed.map(s => known(s[key], max)) : [known(ex[key], max)];
      const total = (key: string, max: number) => {
        const a = values(key, max);
        const sum = a.some(v => v === null) ? null : a.reduce<number>((s, v) => s + v!, 0);
        // Legacy reps are per set, whereas setRecords are summed across completed sets.
        return sum === null ? null : known(sum * (!completed.length && key === "reps" ? count : 1), max);
      };
      const peak = (key: string, max: number) => { const a = values(key, max); return a.some(v => v === null) ? null : Math.max(...a as number[]); };
      day.workouts.push({ name: label(ex.name), sets: count, reps: total("reps", 10000), kg: peak("weightKg", 2000), minutes: total("durationMinutes", 1440), km: total("distanceKm", 500) });
    }
  }
  const knownEquipment = new Set<string>(registrationExercises.flatMap(e => e.requiredEquipment));
  const plan = preferences.splitPlan ? getWorkoutDayPlan(preferences.splitPlan, date) : null;
  return validateAdviceInput({ version: 1, date,
    goal: profile && ["build-muscle", "lose-fat", "maintain"].includes(profile.goal as string) ? profile.goal : null,
    adult: Boolean(profile && typeof profile.age === "number" && profile.age >= 20 && profile.age <= 78), days,
    equipment: preferences.isGymMember === false ? [] : [...new Set(preferences.facilityEquipment.filter(e => knownEquipment.has(e)))].sort(),
    plan: plan ? { rest: plan.isRest, categories: plan.categories } : null,
    constraints: constraints.trim().slice(0, 400), truncated });
}

import { normalizeWorkoutPreferences } from "../../types/workout-preferences.ts";
import { isRecommendationPreferences } from "../../types/recommendation-preferences.ts";
import type { WorkoutPreferences, WorkoutSplitPlan } from "../../types/workout-preferences.ts";
import type { UserProfile } from "../../types/user.ts";
import type { MealEntry, MealFoodItem } from "../../types/meal.ts";
import type { WorkoutEntry, WorkoutExercise, WorkoutSet } from "../../types/workout.ts";
import type { RecommendationInput } from "./types.ts";

const keys = {
  profile: "bodymake.profile.v1",
  meals: "bodymake.meals.v1",
  workouts: "bodymake.workouts.v1",
  preferences: "bodymake.workout-preferences.v1",
} as const;
export const recommendationStorageKeys: readonly string[] = Object.values(keys);
type Records = Omit<RecommendationInput, "date" | "constraints">;
type ObjectValue = Record<string, unknown>;

function requireValid(condition: unknown): asserts condition {
  if (!condition) throw new Error("recommendation_records_invalid_shape");
}
function object(value: unknown): ObjectValue {
  requireValid(typeof value === "object" && value !== null && !Array.isArray(value));
  return value as ObjectValue;
}
function text(value: unknown, nonempty = false): string {
  requireValid(typeof value === "string" && (!nonempty || value.trim().length > 0));
  return value;
}
function finiteNumber(value: unknown, min = 0): number {
  requireValid(typeof value === "number" && Number.isFinite(value) && value >= min);
  return value;
}
function integer(value: unknown, min = 0): number {
  const number = finiteNumber(value, min);
  requireValid(Number.isInteger(number));
  return number;
}
function date(value: unknown): string {
  const string = text(value);
  requireValid(/^\d{4}-\d{2}-\d{2}$/.test(string));
  const parsed = Date.parse(`${string}T00:00:00Z`);
  requireValid(Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === string);
  return string;
}
function timestamp(value: unknown): string {
  const string = text(value, true);
  requireValid(Number.isFinite(Date.parse(string)));
  return string;
}
function time(value: unknown): string {
  const string = text(value);
  requireValid(/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(string));
  return string;
}
function uniqueRecords<T extends { id: string }>(value: unknown, convert: (entry: unknown) => T): T[] {
  requireValid(Array.isArray(value));
  const entries = value.map(convert);
  requireValid(new Set(entries.map((entry) => entry.id)).size === entries.length);
  return entries;
}
function nutrition(value: ObjectValue): Pick<MealEntry, "calories" | "proteinG" | "fatG" | "carbsG"> {
  const result: ReturnType<typeof nutrition> = {};
  for (const key of ["calories", "proteinG", "fatG", "carbsG"] as const) {
    if (value[key] !== undefined) result[key] = finiteNumber(value[key]);
  }
  return result;
}
function profile(value: unknown): UserProfile | null {
  if (value === null) return null;
  const source = object(value);
  requireValid(["build-muscle", "lose-fat", "maintain"].includes(String(source.goal)));
  const hasRecommendationPreferences = Object.hasOwn(source, "recommendationPreferences");
  if (hasRecommendationPreferences) requireValid(isRecommendationPreferences(source.recommendationPreferences));
  return {
    id: text(source.id, true), name: text(source.name), goal: source.goal as UserProfile["goal"],
    updatedAt: timestamp(source.updatedAt),
    ...(source.age === undefined ? {} : { age: integer(source.age) }),
    ...(isRecommendationPreferences(source.recommendationPreferences) ? { recommendationPreferences: { ...source.recommendationPreferences } } : {}),
  };
}
function mealFood(value: unknown): MealFoodItem {
  const source = object(value);
  return { id: text(source.id, true), name: text(source.name), ...nutrition(source) };
}
function meal(value: unknown): MealEntry {
  const source = object(value);
  requireValid(["breakfast", "lunch", "dinner", "snack"].includes(String(source.mealType)));
  return {
    id: text(source.id, true), name: text(source.name), mealType: source.mealType as MealEntry["mealType"],
    recordedAt: date(source.recordedAt), createdAt: timestamp(source.createdAt), ...nutrition(source),
    ...(source.recordedTime === undefined ? {} : { recordedTime: time(source.recordedTime) }),
    ...(source.items === undefined ? {} : { items: uniqueRecords(source.items, mealFood) }),
  };
}
function set(value: unknown): WorkoutSet {
  const source = object(value);
  requireValid(typeof source.completed === "boolean");
  return {
    id: text(source.id, true), completed: source.completed,
    ...(source.weightKg === undefined ? {} : { weightKg: finiteNumber(source.weightKg) }),
    ...(source.reps === undefined ? {} : { reps: integer(source.reps) }),
  };
}
function exercise(value: unknown): WorkoutExercise {
  const source = object(value);
  return {
    id: text(source.id, true), name: text(source.name, true),
    ...(source.setRecords === undefined ? {} : { setRecords: uniqueRecords(source.setRecords, set) }),
    ...(source.weightKg === undefined ? {} : { weightKg: finiteNumber(source.weightKg) }),
    ...(source.reps === undefined ? {} : { reps: integer(source.reps) }),
    ...(source.sets === undefined ? {} : { sets: integer(source.sets) }),
  };
}
function workout(value: unknown): WorkoutEntry {
  const source = object(value);
  return {
    id: text(source.id, true), performedAt: date(source.performedAt), createdAt: timestamp(source.createdAt),
    exercises: uniqueRecords(source.exercises, exercise),
    ...(source.performedTime === undefined ? {} : { performedTime: time(source.performedTime) }),
  };
}
function stringList(value: unknown): string[] {
  requireValid(Array.isArray(value));
  return value.map((entry) => text(entry, true));
}
function weekdays(value: unknown): number[] {
  requireValid(Array.isArray(value));
  const days = value.map((entry) => integer(entry));
  requireValid(days.length >= 1 && days.length <= 7 && days.every((day) => day <= 6) && new Set(days).size === days.length);
  return days;
}
function preferences(value: unknown): WorkoutPreferences {
  const source = object(value);
  const result: WorkoutPreferences = {
    facilityEquipment: source.facilityEquipment === undefined ? [] : stringList(source.facilityEquipment),
    customEquipment: source.customEquipment === undefined ? [] : stringList(source.customEquipment),
    favoriteExercises: source.favoriteExercises === undefined ? [] : stringList(source.favoriteExercises),
  };
  if (source.splitPlan !== undefined) {
    const plan = object(source.splitPlan);
    requireValid(["five", "three", "full", "custom"].includes(String(plan.kind)));
    let trainingDays: number[];
    if (plan.trainingDays !== undefined) trainingDays = weekdays(plan.trainingDays);
    else {
      // The pre-trainingDays format had exactly two explicit weekly rest days.
      const restDays = weekdays(plan.restDays);
      requireValid(restDays.length === 2);
      trainingDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => !restDays.includes(day));
    }
    const customByWeekday: Record<string, string[]> = {};
    if (plan.customByWeekday !== undefined) {
      const custom = object(plan.customByWeekday);
      const categories = new Set(["胸", "背中", "肩", "腕", "脚", "腹筋・体幹", "有酸素"]);
      for (const [day, values] of Object.entries(custom)) {
        requireValid(/^[0-6]$/.test(day));
        const list = stringList(values);
        requireValid(list.every((category) => categories.has(category)) && new Set(list).size === list.length);
        customByWeekday[day] = list;
      }
    }
    result.splitPlan = {
      kind: plan.kind as WorkoutSplitPlan["kind"], trainingDays, anchorDate: date(plan.anchorDate),
      ...(plan.kind === "custom" ? { customByWeekday } : {}),
    };
  }
  // Normalize only after validating: a broken schedule must never silently become "no plan".
  return normalizeWorkoutPreferences(result);
}

/** Validate either an explicit server snapshot or a local-demo snapshot without normalizing away bad fields. */
export function validateRecommendationRecords(raw: {
  profile: unknown; meals: unknown; workouts: unknown; preferences: unknown;
}): Records {
  return {
    profile: profile(raw.profile),
    meals: uniqueRecords(raw.meals, meal),
    workouts: uniqueRecords(raw.workouts, workout),
    preferences: preferences(raw.preferences),
  };
}

/** Strict, local-demo-only snapshot. Never falls back after storage or parse failure.
 * Missing keys are a new account, not a failure. Present-but-corrupt keys stop suggestions.
 * Only getItem is available; no write, delete, migration, photo read or learning persistence.
 */
export function readRecommendationRecords(storage: Pick<Storage, "getItem">): Records {
  function read(key: string, fallback: unknown): unknown {
    let serialized: string | null;
    try { serialized = storage.getItem(key); }
    catch { throw new Error("recommendation_records_unreadable"); }
    if (serialized === null) return fallback;
    let parsed: unknown;
    try { parsed = JSON.parse(serialized); }
    catch { throw new Error("recommendation_records_invalid_json"); }
    return parsed;
  }
  return validateRecommendationRecords({
    profile: read(keys.profile, null),
    meals: read(keys.meals, []),
    workouts: read(keys.workouts, []),
    preferences: read(keys.preferences, {}),
  });
}

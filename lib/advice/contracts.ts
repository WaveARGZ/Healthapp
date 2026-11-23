import { registrationExercises } from "../data/registration-exercise-catalog.ts";

export const ADVICE_ENDPOINT = "https://bodymake-recommendation-api.ajimo023.workers.dev";
export const ADVICE_ALERT_MICROS = 10_000_000;
export type AdviceDay = { date: string; meals: { name: string; kcal: number | null; protein: number | null; fat: number | null; carbs: number | null }[]; workouts: { name: string; sets: number; reps: number | null; kg: number | null; minutes: number | null; km: number | null }[] };
export type AdviceInput = {
  version: 1; date: string; goal: "build-muscle" | "lose-fat" | "maintain" | null;
  adult: boolean; days: AdviceDay[]; equipment: string[];
  plan: { rest: boolean; categories: string[] } | null;
  constraints: string; truncated: boolean;
};
export type Advice = {
  summary: string;
  meal: { title: string; foods: string[]; reason: string };
  workout: { title: string; exercises: { name: string; amount: string }[]; reason: string };
  recovery: string; missing: string[];
};
export type AdviceBudget = { limitMicros: number; estimatedMicros: number; heldMicros: number; remainingMicros: number; stopped: boolean; pending: boolean; alert: boolean };
export function object(v: unknown): v is Record<string, unknown> { return typeof v === "object" && v !== null && !Array.isArray(v); }
function exact(v: unknown, keys: string[]): asserts v is Record<string, unknown> {
  if (!object(v) || Object.keys(v).length !== keys.length || Object.keys(v).some(k => !keys.includes(k))) throw new Error("invalid_request");
}
function text(v: unknown, max: number): asserts v is string {
  if (typeof v !== "string" || !v.trim() || v.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) throw new Error("invalid_request");
}
function number(v: unknown, max: number): void {
  if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max)) throw new Error("invalid_request");
}
export function validDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
export function eligibleExercises(input: Pick<AdviceInput, "equipment">) {
  return registrationExercises.filter(e => e.requiredEquipment.every(x => input.equipment.includes(x)));
}
export function validateAdviceInput(v: unknown): AdviceInput {
  exact(v, ["version", "date", "goal", "adult", "days", "equipment", "plan", "constraints", "truncated"]);
  if (v.version !== 1 || !validDate(v.date) || ![null, "build-muscle", "lose-fat", "maintain"].includes(v.goal as string | null)
    || typeof v.adult !== "boolean" || typeof v.truncated !== "boolean" || typeof v.constraints !== "string" || v.constraints.length > 400
    || !Array.isArray(v.equipment) || v.equipment.length > 25 || !Array.isArray(v.days) || v.days.length !== 7) throw new Error("invalid_request");
  const known = new Set<string>(registrationExercises.flatMap(e => e.requiredEquipment));
  for (const item of v.equipment) if (typeof item !== "string" || !known.has(item)) throw new Error("invalid_request");
  if (new Set(v.equipment).size !== v.equipment.length) throw new Error("invalid_request");
  if (v.plan !== null) {
    exact(v.plan, ["rest", "categories"]);
    if (typeof v.plan.rest !== "boolean" || !Array.isArray(v.plan.categories) || v.plan.categories.length > 7
      || v.plan.categories.some(c => !["胸", "背中", "腕", "肩", "腹筋・体幹", "脚", "有酸素"].includes(c))) throw new Error("invalid_request");
  }
  for (let i = 0; i < 7; i++) {
    const day = v.days[i]; exact(day, ["date", "meals", "workouts"]);
    const expected = new Date(Date.parse(v.date) - (6 - i) * 86400000).toISOString().slice(0, 10);
    if (day.date !== expected || !Array.isArray(day.meals) || day.meals.length > 12 || !Array.isArray(day.workouts) || day.workouts.length > 16) throw new Error("invalid_request");
    for (const meal of day.meals) {
      exact(meal, ["name", "kcal", "protein", "fat", "carbs"]); text(meal.name, 80);
      number(meal.kcal, 20000); for (const key of ["protein", "fat", "carbs"]) number(meal[key], 3000);
    }
    for (const workout of day.workouts) {
      exact(workout, ["name", "sets", "reps", "kg", "minutes", "km"]); text(workout.name, 80);
      if (!Number.isInteger(workout.sets) || (workout.sets as number) < 1 || (workout.sets as number) > 200) throw new Error("invalid_request");
      number(workout.reps, 10000); number(workout.kg, 2000); number(workout.minutes, 1440); number(workout.km, 500);
    }
  }
  return v as AdviceInput;
}
export function validateAdvice(v: unknown, input: AdviceInput): Advice {
  exact(v, ["summary", "meal", "workout", "recovery", "missing"]); text(v.summary, 400); text(v.recovery, 300);
  exact(v.meal, ["title", "foods", "reason"]); text(v.meal.title, 100); text(v.meal.reason, 400);
  if (!Array.isArray(v.meal.foods) || v.meal.foods.length < 1 || v.meal.foods.length > 5) throw new Error("invalid_request");
  v.meal.foods.forEach(f => text(f, 150));
  exact(v.workout, ["title", "exercises", "reason"]); text(v.workout.title, 100); text(v.workout.reason, 400);
  if (!Array.isArray(v.workout.exercises) || v.workout.exercises.length > 4) throw new Error("invalid_request");
  const allowed = new Set(eligibleExercises(input).map(e => e.name)); const seen = new Set<string>();
  for (const e of v.workout.exercises) {
    exact(e, ["name", "amount"]); text(e.name, 80); text(e.amount, 120);
    if (!allowed.has(e.name) || seen.has(e.name)) throw new Error("invalid_request"); seen.add(e.name);
  }
  if (!Array.isArray(v.missing) || v.missing.length > 4) throw new Error("invalid_request");
  v.missing.forEach(m => text(m, 150)); return v as Advice;
}

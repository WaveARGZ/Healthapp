import type { WorkoutSplitPlan } from "../../types/workout-preferences";

export const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];

const rotations = {
  five: [["胸"], ["背中"], ["肩"], ["腕"], ["脚"]],
  three: [["胸", "腕"], ["背中", "肩"], ["脚"]],
} as const;
const fullBodyCategories = ["胸", "背中", "肩", "腕", "脚", "腹筋・体幹"];

function utcDay(date: string): number {
  const value = new Date(`${date}T00:00:00Z`).getTime();
  if (!Number.isFinite(value)) throw new Error("invalid_workout_date");
  return value / 86_400_000;
}

function dateAt(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function weekday(day: number): number {
  return new Date(day * 86_400_000).getUTCDay();
}

function countTrainingDays(start: number, end: number, trainingDays: readonly number[]): number {
  const days = end - start;
  const weeks = Math.floor(days / 7);
  let count = weeks * trainingDays.length;
  for (let day = start + weeks * 7; day < end; day++) {
    if (trainingDays.includes(weekday(day))) count++;
  }
  return count;
}

export interface WorkoutDayPlan {
  date: string;
  weekday: number;
  isRest: boolean;
  categories: string[];
  label: string;
}

export function getWorkoutDayPlan(plan: WorkoutSplitPlan, date: string): WorkoutDayPlan {
  const day = utcDay(date);
  const isRest = !plan.trainingDays.includes(weekday(day));
  if (isRest) return { date, weekday: weekday(day), isRest: true, categories: [], label: "休み" };
  if (plan.kind === "full") return { date, weekday: weekday(day), isRest: false, categories: [...fullBodyCategories], label: "全身" };
  if (plan.kind === "custom") {
    const categories = plan.customByWeekday?.[String(weekday(day))] ?? [];
    return { date, weekday: weekday(day), isRest: false, categories, label: categories.length ? categories.join("・") : "部位を設定" };
  }
  const anchor = utcDay(plan.anchorDate);
  const index = day >= anchor
    ? countTrainingDays(anchor, day, plan.trainingDays)
    : -countTrainingDays(day, anchor, plan.trainingDays);
  const rotation = rotations[plan.kind];
  const categories = [...rotation[((index % rotation.length) + rotation.length) % rotation.length]];
  return { date, weekday: weekday(day), isRest: false, categories, label: categories.join("・") };
}

export function getWorkoutWeek(plan: WorkoutSplitPlan, date: string): WorkoutDayPlan[] {
  const day = utcDay(date);
  const monday = day - ((weekday(day) + 6) % 7);
  return Array.from({ length: 7 }, (_, offset) => getWorkoutDayPlan(plan, dateAt(monday + offset)));
}

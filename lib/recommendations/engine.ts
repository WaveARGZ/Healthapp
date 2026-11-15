import { recommendationExercises, recommendationMeals } from "./catalog.ts";
import { getWorkoutDayPlan } from "../workouts/workout-split.ts";
import { normalizeWorkoutPreferences } from "../../types/workout-preferences.ts";
import type { WorkoutExercise } from "../../types/workout.ts";
import type { Nutrient, RecommendationCandidate, RecommendationContext, RecommendationInput, RecommendationRequest, RecommendationResult } from "./types.ts";

const nutrients: Nutrient[] = ["calories", "proteinG", "fatG", "carbsG"];
const dayMilliseconds = 86_400_000;
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
const rounded = (value: number) => Math.round(value * 1000) / 1000;

function dayNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const milliseconds = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString().slice(0, 10) === date ? milliseconds / dayMilliseconds : null;
}

function validNutrient(value: unknown, nutrient: Nutrient): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= (nutrient === "calories" ? 10000 : 1500);
}

/** Modern records only count performed sets. Legacy positive sets/reps are completed history. */
function wasPerformed(exercise: WorkoutExercise): boolean {
  if (Array.isArray(exercise.setRecords)) return exercise.setRecords.some((set) => set.completed === true
    && (set.reps === undefined || (Number.isFinite(set.reps) && set.reps > 0))
    && (set.weightKg === undefined || (Number.isFinite(set.weightKg) && set.weightKg >= 0)));
  return Number.isFinite(exercise.sets) && (exercise.sets ?? 0) > 0 && Number.isFinite(exercise.reps) && (exercise.reps ?? 0) > 0;
}

function aggregateNutrition(meals: RecommendationInput["meals"], date: string): RecommendationContext["nutrition"] {
  const today = meals.filter((meal) => meal.recordedAt === date);
  const totals = Object.fromEntries(nutrients.map((key) => [key, null])) as Record<Nutrient, number | null>;
  const complete = Object.fromEntries(nutrients.map((key) => [key, today.length > 0])) as Record<Nutrient, boolean>;
  for (const nutrient of nutrients) {
    let sum = 0;
    let known = false;
    for (const meal of today) {
      // Item-aware records take precedence: scalar totals can be sums that treated unknown as 0.
      // Never add item totals to the meal scalar, and never label a partial sum complete.
      const values = meal.items?.length ? meal.items.map((item) => item[nutrient]) : [meal[nutrient]];
      for (const value of values) {
        if (validNutrient(value, nutrient)) { sum += value; known = true; }
        else complete[nutrient] = false;
      }
    }
    if (sum > (nutrient === "calories" ? 100000 : 10000)) { complete[nutrient] = false; totals[nutrient] = null; }
    else totals[nutrient] = known ? Math.round(sum * 10) / 10 : null;
  }
  return { mealCount: Math.min(today.length, 10000), totals, complete };
}

export function buildRecommendationContext(input: RecommendationInput): RecommendationContext {
  const today = dayNumber(input.date);
  if (today === null) throw new Error("invalid_recommendation_date");
  const nutrition = aggregateNutrition(input.meals, input.date);
  const constraints = {
    pain: input.constraints.pain === true,
    tired: input.constraints.tired === true,
    dietaryRestriction: input.constraints.dietaryRestriction === true,
    professionalGuidance: input.constraints.professionalGuidance === true,
    availableMinutes: ([10, 20, 30, 45, 60].includes(input.constraints.availableMinutes) ? input.constraints.availableMinutes : 10) as RecommendationInput["constraints"]["availableMinutes"],
  };
  const goal = input.profile?.goal && ["build-muscle", "lose-fat", "maintain"].includes(input.profile.goal) ? input.profile.goal : "maintain";
  const recent = input.workouts.flatMap((workout) => {
    const performed = dayNumber(workout.performedAt);
    if (performed === null || performed > today || today - performed > 27) return [];
    const exercises = workout.exercises.filter(wasPerformed);
    return exercises.length ? [{ daysAgo: today - performed, exercises }] : [];
  });
  const notices = ["候補は参考情報です。食事量や運動負荷の処方・診断ではありません。食べた分を運動で相殺する提案はしません。"];
  const context: RecommendationContext = {
    version: "1", date: input.date, goal, nutrition,
    recentWorkoutCount: Math.min(recent.filter((workout) => workout.daysAgo < 7).length, 10000),
    constraints, candidates: [], notices,
  };
  if (!input.profile || !Number.isFinite(input.profile.age) || (input.profile.age ?? 0) < 20 || (input.profile.age ?? 0) > 78 || constraints.professionalGuidance) {
    notices.push("年齢未設定・20歳未満・79歳以上、または専門家の指導が必要な場合は個別候補を表示しません。必要に応じて医師・管理栄養士・運動指導者に相談してください。");
    return context;
  }
  if (!nutrients.every((nutrient) => nutrition.complete[nutrient])) notices.push("今日の記録には未入力の栄養値があります。表示値は入力済み分のみで、未記録を0とは扱いません。摂取不足や残り必要量は判定しません。");

  // Relative composition only; these features do not imply a daily calorie/PFC target.
  const completePfc = ["proteinG", "fatG", "carbsG"].every((key) => nutrition.complete[key as Nutrient]);
  const pfcEnergy = (nutrition.totals.proteinG ?? 0) * 4 + (nutrition.totals.fatG ?? 0) * 9 + (nutrition.totals.carbsG ?? 0) * 4;
  const priorProteinShare = completePfc && pfcEnergy > 0 ? (nutrition.totals.proteinG ?? 0) * 4 / pfcEnergy : null;
  const priorCarbShare = completePfc && pfcEnergy > 0 ? (nutrition.totals.carbsG ?? 0) * 4 / pfcEnergy : null;
  const recentMealNames = input.meals.filter((meal) => {
    const day = dayNumber(meal.recordedAt);
    return day !== null && day <= today && today - day < 7;
  }).flatMap((meal) => meal.items?.length ? meal.items.map((item) => item.name) : [meal.name]);
  if (constraints.dietaryRestriction) notices.push("アレルギー・食事制限ありのため、原材料と交差接触を確認できない食事候補は表示しません。");
  else {
    context.candidates.push(...recommendationMeals.map((meal): RecommendationCandidate => {
      const energy = meal.nutrition.proteinG * 4 + meal.nutrition.fatG * 9 + meal.nutrition.carbsG * 4;
      const proteinShare = energy > 0 ? meal.nutrition.proteinG * 4 / energy : 0;
      const carbShare = energy > 0 ? meal.nutrition.carbsG * 4 / energy : 0;
      const familiarity = meal.foodNames.filter((name) => recentMealNames.some((entry) => entry.includes(name))).length / meal.foodNames.length;
      return {
        id: meal.id, kind: "meal", title: meal.title, nutrition: { ...meal.nutrition },
        reason: `主食とたんぱく質を含む食品の組み合わせ例。${meal.source}の初期目安量で計算（調味料の追加分は含みません）。量は空腹感や普段の食事に合わせて確認してください。`,
        features: [goal === "build-muscle" ? clamp(proteinShare * 2) : 0.5,
          priorProteinShare === null ? 0.5 : clamp(0.5 + proteinShare - priorProteinShare),
          priorCarbShare === null ? 0.5 : clamp(0.5 + carbShare - priorCarbShare),
          1, familiarity, 0.5].map(rounded),
      };
    }));
  }

  if (constraints.pain || constraints.tired) {
    notices.push("痛み・強い疲労の申告があるため、今回は運動候補を表示せず休息を優先します。痛みが続く、強い、普段と違う場合は医療機関に相談してください。");
    return context;
  }
  const preferences = normalizeWorkoutPreferences(input.preferences);
  if (input.preferences.splitPlan && !preferences.splitPlan) {
    notices.push("運動スケジュールを確認できません。設定を見直すまで運動候補を表示しません。");
    return context;
  }
  const scheduled = preferences.splitPlan ? getWorkoutDayPlan(preferences.splitPlan, input.date) : undefined;
  if (scheduled?.isRest) { notices.push("今日は設定された休養日です。運動の追加は勧めません。"); return context; }
  if (!preferences.favoriteExercises.length) { notices.push("運動候補には、筋トレ画面で普段行う種目をお気に入りに登録してください。"); return context; }
  const equipment = new Set([...preferences.facilityEquipment, ...preferences.customEquipment].map((value) => value.normalize("NFKC").trim()));
  const categoryLast = new Map<string, number>();
  const exerciseLast = new Map<string, number>();
  for (const workout of recent) for (const exercise of workout.exercises) {
    const canonical = recommendationExercises.find((candidate) => candidate.name === exercise.name.trim());
    if (!canonical) continue;
    categoryLast.set(canonical.category, Math.min(categoryLast.get(canonical.category) ?? Infinity, workout.daysAgo));
    exerciseLast.set(canonical.id, Math.min(exerciseLast.get(canonical.id) ?? Infinity, workout.daysAgo));
  }
  const workouts = recommendationExercises.filter((exercise) => preferences.favoriteExercises.includes(exercise.name)
    && (!scheduled || scheduled.categories.includes(exercise.category))
    && exercise.equipment.every((item) => equipment.has(item) || (item === "ウェイトマシン" && equipment.has(exercise.name)))
    && (exercise.category === "有酸素" ? (exerciseLast.get(exercise.id) ?? Infinity) >= 1 : (categoryLast.get(exercise.category) ?? Infinity) >= 2));
  if (categoryLast.size) notices.push("今日・昨日に完了セットがある同じ部位は候補から除外します（有酸素は今日の同種目を除外）。記録だけで回復を判断できないため体調も確認してください。");
  context.candidates.push(...workouts.map((exercise): RecommendationCandidate => ({
    id: exercise.id, kind: "workout", title: exercise.name,
    reason: `${scheduled ? `今日の「${scheduled.label}」に対応。` : ""}お気に入りと登録器具を確認済み。${constraints.availableMinutes}分の枠内で候補から選び、普段の無理のない負荷で。重量・回数の自動増加は行いません。`,
    features: [goal === "build-muscle" ? (exercise.category === "有酸素" ? 0.4 : 0.8) : goal === "lose-fat" ? (exercise.category === "有酸素" ? 0.8 : 0.5) : 0.6,
      0.5, 0.5, 1, exerciseLast.has(exercise.id) ? 1 : 0.5, clamp((categoryLast.get(exercise.category) ?? 7) / 7)].map(rounded),
  })));
  if (!workouts.length) notices.push("予定部位・器具・直近の完了記録に合う確認済みのお気に入り候補がありません。無理に別種目へ置き換えません。");
  return context;
}

/** Explicit field projection: never forward profile, dates, names, text, images or extra keys. */
export function toRecommendationRequest(context: RecommendationContext): RecommendationRequest {
  return {
    version: "1", goal: context.goal,
    nutrition: {
      mealCount: context.nutrition.mealCount,
      totals: Object.fromEntries(nutrients.map((key) => [key, context.nutrition.totals[key]])) as RecommendationRequest["nutrition"]["totals"],
      complete: Object.fromEntries(nutrients.map((key) => [key, context.nutrition.complete[key]])) as RecommendationRequest["nutrition"]["complete"],
    },
    recentWorkoutCount: context.recentWorkoutCount,
    constraints: {
      pain: context.constraints.pain, tired: context.constraints.tired,
      dietaryRestriction: context.constraints.dietaryRestriction, professionalGuidance: context.constraints.professionalGuidance,
      availableMinutes: context.constraints.availableMinutes,
    },
    candidates: context.candidates.map(({ id, kind, features }) => ({ id, kind, features: [...features] })),
  };
}

/** Deterministic fallback. No weights here are learned from API output or user records. */
export function recommendLocally(context: RecommendationContext): RecommendationResult {
  const score = (candidate: RecommendationCandidate) => candidate.features.reduce((sum, value, index) => sum + value * [1, 1, 0.5, 0.5, 0.25, 1.5][index], 0);
  const rank = (kind: RecommendationCandidate["kind"]) => context.candidates.filter((candidate) => candidate.kind === kind)
    .sort((first, second) => score(second) - score(first) || first.id.localeCompare(second.id, "en"))
    .slice(0, 3).map((candidate) => candidate.id);
  return { source: "rules", model: "bodymake-safe-rules-v1", mealIds: rank("meal"), workoutIds: rank("workout") };
}

import library from "../data/food-library.json" with { type: "json" };
import type { Nutrition } from "./types.ts";

/** Versioned, hand-authored features, all in [0, 1], not learned weights/health targets.
 * 0 goalMatch: general stated-goal preference (not a calorie or load prescription).
 * 1 proteinBalance / 2 carbBalance: candidate vs complete recorded PFC energy shares;
 *   0.5 means unknown/neutral. They do not establish a deficiency or desired daily ratio.
 * 3 timeFit: 1 for these flexible, non-prescribed food/exercise options (not a duration estimate).
 * 4 familiarity: recent exact library-food match fraction / recently completed favorite exercise.
 * 5 recencyGap: days since completed work for the body part, capped at 7 days;
 *   0.5 is neutral for meals. Hard safety/schedule filters run before ranking.
 */
export const featureNames = ["goalMatch", "proteinBalance", "carbBalance", "timeFit", "familiarity", "recencyGap"] as const;

const mealTemplates = [
  { id: "meal_rice_chicken", foods: ["rice", "chicken-breast", "tomatoes"] },
  { id: "meal_rice_salmon", foods: ["rice", "salmon-baked", "tomatoes"] },
  { id: "meal_rice_tofu", foods: ["rice", "tofu", "edamame", "tomatoes"] },
  { id: "meal_rice_natto_egg", foods: ["rice", "natto", "boiled-egg", "tomatoes"] },
  { id: "meal_brown_rice_chicken", foods: ["brown-rice", "chicken-breast", "tomatoes"] },
  { id: "meal_brown_rice_salmon", foods: ["brown-rice", "salmon-baked", "tomatoes"] },
  { id: "meal_soba_tofu", foods: ["soba", "tofu", "edamame", "tomatoes"] },
  { id: "meal_rice_egg_edamame", foods: ["rice", "boiled-egg", "edamame", "tomatoes"] },
] as const;

/** All quantities and nutrients come from the same sourced library used in meal entry.
 * Its suggestedGrams are editable serving examples, NOT individualized prescriptions.
 * No sauces, salt or allergens are inferred from a photograph or a dish name.
 */
export const recommendationMeals = mealTemplates.map((template) => {
  const foods = template.foods.map((id) => {
    const food = library.foods.find((item) => item.id === id);
    if (!food || !Number.isFinite(food.suggestedGrams) || food.suggestedGrams <= 0) throw new Error("recommendation_food_missing");
    return food;
  });
  const nutrition: Nutrition = { calories: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  for (const food of foods) {
    for (const nutrient of Object.keys(nutrition) as (keyof Nutrition)[]) {
      const value = food.per100g[nutrient];
      if (!Number.isFinite(value) || value < 0) throw new Error("recommendation_food_nutrition_invalid");
      nutrition[nutrient] += value * food.suggestedGrams / 100;
    }
  }
  nutrition.calories = Math.round(nutrition.calories);
  for (const nutrient of ["proteinG", "fatG", "carbsG"] as const) nutrition[nutrient] = Math.round(nutrition[nutrient] * 10) / 10;
  return {
    id: template.id,
    title: foods.map((food) => `${food.name} ${food.suggestedGrams}g`).join(" ＋ "),
    foodNames: foods.map((food) => food.name),
    nutrition,
    source: `${library.sourceName}（既存食品ライブラリ ${library.version}）`,
  };
});

export interface RecommendationExercise {
  id: string;
  name: string;
  category: string;
  equipment: string[];
}

// Deliberate allowlist. A new/custom exercise must have its equipment reviewed here.
// Do not infer "equipment-free" from an unrecognized exercise name.
export const recommendationExercises: RecommendationExercise[] = [
  { id: "exercise_chest_press", name: "チェストプレス", category: "胸", equipment: ["ウェイトマシン"] },
  { id: "exercise_pec_deck", name: "ペックデックフライ", category: "胸", equipment: ["ウェイトマシン"] },
  { id: "exercise_barbell_bench", name: "バーベルベンチプレス", category: "胸", equipment: ["バーベル", "ベンチ"] },
  { id: "exercise_dumbbell_bench", name: "ダンベルベンチプレス", category: "胸", equipment: ["ダンベル", "ベンチ"] },
  { id: "exercise_knee_pushup", name: "膝つきプッシュアップ", category: "胸", equipment: [] },
  { id: "exercise_incline_pushup", name: "インクラインプッシュアップ", category: "胸", equipment: ["ベンチ"] },
  { id: "exercise_pushup", name: "プッシュアップ", category: "胸", equipment: [] },
  { id: "exercise_lat_pulldown", name: "ラットプルダウン", category: "背中", equipment: ["ウェイトマシン"] },
  { id: "exercise_seated_row", name: "シーテッドロー", category: "背中", equipment: ["ウェイトマシン"] },
  { id: "exercise_dumbbell_row", name: "ダンベルロウ", category: "背中", equipment: ["ダンベル", "ベンチ"] },
  { id: "exercise_superman", name: "スーパーマン", category: "背中", equipment: [] },
  { id: "exercise_bird_dog", name: "バードドッグ", category: "背中", equipment: [] },
  { id: "exercise_machine_shoulder_press", name: "マシンショルダープレス", category: "肩", equipment: ["ウェイトマシン"] },
  { id: "exercise_machine_lateral_raise", name: "マシンサイドレイズ", category: "肩", equipment: ["ウェイトマシン"] },
  { id: "exercise_dumbbell_shoulder_press", name: "ダンベルショルダープレス", category: "肩", equipment: ["ダンベル"] },
  { id: "exercise_lateral_raise", name: "サイドレイズ", category: "肩", equipment: ["ダンベル"] },
  { id: "exercise_cable_curl", name: "ケーブルカール", category: "腕", equipment: ["ケーブルマシン"] },
  { id: "exercise_triceps_pushdown", name: "トライセプスプッシュダウン", category: "腕", equipment: ["ケーブルマシン"] },
  { id: "exercise_barbell_curl", name: "バーベルカール", category: "腕", equipment: ["バーベル"] },
  { id: "exercise_dumbbell_curl", name: "ダンベルカール", category: "腕", equipment: ["ダンベル"] },
  { id: "exercise_hammer_curl", name: "ハンマーカール", category: "腕", equipment: ["ダンベル"] },
  { id: "exercise_kickback", name: "キックバック", category: "腕", equipment: ["ダンベル", "ベンチ"] },
  { id: "exercise_wall_pushup", name: "壁プッシュアップ", category: "腕", equipment: [] },
  { id: "exercise_towel_curl", name: "タオルカール", category: "腕", equipment: ["タオル"] },
  { id: "exercise_leg_press", name: "レッグプレス", category: "脚", equipment: ["ウェイトマシン"] },
  { id: "exercise_leg_extension", name: "レッグエクステンション", category: "脚", equipment: ["ウェイトマシン"] },
  { id: "exercise_seated_leg_curl", name: "シーテッドレッグカール", category: "脚", equipment: ["ウェイトマシン"] },
  { id: "exercise_adduction", name: "アダクション", category: "脚", equipment: ["ウェイトマシン"] },
  { id: "exercise_abduction", name: "アブダクション", category: "脚", equipment: ["ウェイトマシン"] },
  { id: "exercise_bodyweight_squat", name: "自重スクワット", category: "脚", equipment: [] },
  { id: "exercise_lunge", name: "ランジ", category: "脚", equipment: [] },
  { id: "exercise_wall_sit", name: "ウォールシット", category: "脚", equipment: [] },
  { id: "exercise_step_up", name: "ステップアップ", category: "脚", equipment: ["ステップ台"] },
  { id: "exercise_hip_bridge", name: "ヒップリフト", category: "脚", equipment: [] },
  { id: "exercise_calf_raise", name: "スタンディングカーフレイズ", category: "脚", equipment: [] },
  { id: "exercise_crunch", name: "クランチ", category: "腹筋・体幹", equipment: [] },
  { id: "exercise_dead_bug", name: "デッドバグ", category: "腹筋・体幹", equipment: [] },
  { id: "exercise_plank", name: "プランク", category: "腹筋・体幹", equipment: [] },
  { id: "exercise_side_crunch", name: "サイドクランチ", category: "腹筋・体幹", equipment: [] },
  { id: "exercise_treadmill", name: "トレッドミル", category: "有酸素", equipment: ["トレッドミル"] },
  { id: "exercise_stationary_bike", name: "エアロバイク", category: "有酸素", equipment: ["エアロバイク"] },
  { id: "exercise_cross_trainer", name: "クロストレーナー", category: "有酸素", equipment: ["クロストレーナー"] },
  { id: "exercise_walk", name: "ウォーキング", category: "有酸素", equipment: [] },
  { id: "exercise_brisk_walk", name: "早歩き", category: "有酸素", equipment: [] },
  { id: "exercise_march", name: "その場足踏み", category: "有酸素", equipment: [] },
  { id: "exercise_stairs", name: "階段昇降", category: "有酸素", equipment: ["階段"] },
];

export const recommendationCatalogIds: readonly string[] = [
  ...recommendationMeals.map((meal) => meal.id),
  ...recommendationExercises.map((exercise) => exercise.id),
];

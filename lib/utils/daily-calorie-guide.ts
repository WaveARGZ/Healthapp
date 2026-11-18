import type { FitnessGoal, Gender } from "@/types/user";

export type DailyCalorieGuide =
  | { status: "ready"; minKcal: number; maxKcal: number; minExpenditureKcal: number; maxExpenditureKcal: number; minRestingKcal: number; maxRestingKcal: number; minNonRestingKcal: number; maxNonRestingKcal: number; broadRange: boolean }
  | { status: "missing-profile" | "outside-adult-range" | "underweight" | "low-estimate" };

type ReadyGuide = Extract<DailyCalorieGuide, { status: "ready" }>;
type Macro = { percent: number; minG: number; maxG: number };
export type DailyMacroGuide = { protein: Macro; fat: Macro; carbs: Macro };

interface DailyCalorieGuideInput {
  age?: number;
  gender?: Gender;
  heightCm?: number;
  weightKg?: number;
  goal: FitnessGoal;
}

const roundTo50 = (value: number) => Math.round(value / 50) * 50;
const roundTo5 = (value: number) => Math.round(value / 5) * 5;

/** A goal-specific example within the adult PFC ranges in the 2025 Japanese DRIs. */
export function estimateDailyMacroGuide(guide: ReadyGuide, goal: FitnessGoal): DailyMacroGuide {
  const shares = goal === "build-muscle" ? { protein: 20, fat: 25, carbs: 55 }
    : goal === "lose-fat" ? { protein: 20, fat: 30, carbs: 50 }
    : { protein: 17, fat: 25, carbs: 58 };
  function macro(percent: number, kcalPerGram: number): Macro {
    return {
      percent,
      minG: roundTo5(guide.minKcal * percent / 100 / kcalPerGram),
      maxG: roundTo5(guide.maxKcal * percent / 100 / kcalPerGram),
    };
  }
  return { protein: macro(shares.protein, 4), fat: macro(shares.fat, 9), carbs: macro(shares.carbs, 4) };
}

/**
 * A rough adult starting range, not a prescribed calorie limit. Mifflin-St Jeor
 * estimates resting expenditure; NIDDK's 1.4–1.6 activity range covers a
 * sedentary to lightly active day. Goal adjustments are conservative app
 * heuristics (+5% / -10%), not values from those source equations.
 * https://pubmed.ncbi.nlm.nih.gov/2305711/
 * https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner
 */
export function estimateDailyCalorieGuide(input: DailyCalorieGuideInput): DailyCalorieGuide {
  const { age, gender, heightCm, weightKg, goal } = input;
  if (!Number.isFinite(age) || !Number.isFinite(heightCm) || !Number.isFinite(weightKg)
    || age === undefined || heightCm === undefined || weightKg === undefined
    || heightCm < 50 || heightCm > 250 || weightKg < 20 || weightKg > 400) {
    return { status: "missing-profile" };
  }
  // The source equation was derived in adults; do not turn it into guidance for children.
  if (age < 20 || age > 78) return { status: "outside-adult-range" };

  const bmi = weightKg / (heightCm / 100) ** 2;
  if (goal === "lose-fat" && bmi < 18.5) return { status: "underweight" };

  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  const femaleRmr = base - 161;
  const maleRmr = base + 5;
  const broadRange = gender !== "male" && gender !== "female";
  const minRmr = gender === "male" ? maleRmr : femaleRmr;
  const maxRmr = gender === "female" ? femaleRmr : maleRmr;
  const goalFactor = goal === "build-muscle" ? 1.05 : goal === "lose-fat" ? 0.9 : 1;
  const minExpenditure = minRmr * 1.4;
  const maxExpenditure = maxRmr * 1.6;
  const min = minExpenditure * goalFactor;
  const max = maxExpenditure * goalFactor;
  if (min < 1200 || !Number.isFinite(max)) return { status: "low-estimate" };

  // Subtract the same displayed resting estimate from each displayed total, so
  // the numbers in the UI add back up at the shown 50 kcal precision.
  const minRestingKcal = roundTo50(minRmr);
  const maxRestingKcal = roundTo50(maxRmr);
  const minExpenditureKcal = roundTo50(minExpenditure);
  const maxExpenditureKcal = roundTo50(maxExpenditure);

  return {
    status: "ready", minKcal: roundTo50(min), maxKcal: roundTo50(max),
    minExpenditureKcal, maxExpenditureKcal, minRestingKcal, maxRestingKcal,
    minNonRestingKcal: minExpenditureKcal - minRestingKcal,
    maxNonRestingKcal: maxExpenditureKcal - maxRestingKcal,
    broadRange,
  };
}

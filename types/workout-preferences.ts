export interface WorkoutPreferences {
  facilityEquipment: string[];
  customEquipment: string[];
  favoriteExercises: string[];
  isGymMember?: boolean;
  splitPlan?: WorkoutSplitPlan;
}

export interface WorkoutSplitPlan {
  kind: "five" | "three" | "full" | "custom";
  /** 0 = Sunday, 6 = Saturday. Between one and seven training days. */
  trainingDays: number[];
  /** The first training day in the rotation, YYYY-MM-DD. */
  anchorDate: string;
  /** Used for the custom plan; each training weekday can have multiple body parts. */
  customByWeekday?: Record<string, string[]>;
}

export const defaultWorkoutPreferences: WorkoutPreferences = {
  facilityEquipment: [],
  customEquipment: [],
  favoriteExercises: [],
};

export function normalizeWorkoutPreferences(value: unknown): WorkoutPreferences {
  const stored = value && typeof value === "object" ? value as Partial<WorkoutPreferences> : {};
  const plan = stored.splitPlan as (Partial<WorkoutSplitPlan> & { restDays?: number[] }) | undefined;
  const legacyTrainingDays = Array.isArray(plan?.restDays) && plan.restDays.length === 2
    && plan.restDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && plan.restDays[0] !== plan.restDays[1]
    ? [0, 1, 2, 3, 4, 5, 6].filter((day) => !plan.restDays?.includes(day)) : undefined;
  const trainingDays = plan?.trainingDays ?? legacyTrainingDays;
  const validPlan = plan && (["five", "three", "full", "custom"] as const).includes(plan.kind as WorkoutSplitPlan["kind"])
    && Array.isArray(trainingDays) && trainingDays.length >= 1 && trainingDays.length <= 7
    && trainingDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && new Set(trainingDays).size === trainingDays.length
    && typeof plan.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(plan.anchorDate)
    && !Number.isNaN(Date.parse(`${plan.anchorDate}T00:00:00Z`))
    && new Date(`${plan.anchorDate}T00:00:00Z`).toISOString().slice(0, 10) === plan.anchorDate;
  const validCategories = new Set(["胸", "背中", "肩", "腕", "脚", "腹筋・体幹", "有酸素"]);
  const customByWeekday = plan?.customByWeekday && typeof plan.customByWeekday === "object"
    ? Object.fromEntries(Object.entries(plan.customByWeekday)
      .filter(([day, categories]) => /^[0-6]$/.test(day) && Array.isArray(categories))
      .map(([day, categories]) => [day, [...new Set(categories.filter((category): category is string => typeof category === "string" && validCategories.has(category)))]]))
    : {};
  return {
    facilityEquipment: Array.isArray(stored.facilityEquipment) ? stored.facilityEquipment.filter((item): item is string => typeof item === "string") : [],
    customEquipment: Array.isArray(stored.customEquipment) ? stored.customEquipment.filter((item): item is string => typeof item === "string") : [],
    favoriteExercises: Array.isArray(stored.favoriteExercises) ? stored.favoriteExercises.filter((item): item is string => typeof item === "string") : [],
    ...(typeof stored.isGymMember === "boolean" ? { isGymMember: stored.isGymMember } : {}),
    ...(validPlan ? { splitPlan: { kind: plan.kind, trainingDays: [...trainingDays].sort((a, b) => a - b), anchorDate: plan.anchorDate, ...(plan.kind === "custom" ? { customByWeekday } : {}) } as WorkoutSplitPlan } : {}),
  };
}

import { isRecommendationPreferences } from "../../types/recommendation-preferences.ts";
import { buildRecommendationContext } from "./engine.ts";
import type { RecommendationContext, RecommendationInput } from "./types.ts";

/** Derive today's candidates from the supplied current profile snapshot.
 * Missing conditions are setup-required, never an implicit "no restrictions" default.
 * Profile preferences are not consent for API transfer or learning.
 */
export function buildProfileRecommendationContext(
  records: Omit<RecommendationInput, "date" | "constraints">,
  date: string,
): RecommendationContext {
  const preferences = records.profile?.recommendationPreferences;
  if (!isRecommendationPreferences(preferences)) throw new Error("recommendation_profile_required");
  return buildRecommendationContext({
    profile: records.profile,
    meals: records.meals,
    workouts: records.workouts,
    preferences: records.preferences,
    date,
    constraints: {
      pain: preferences.pain,
      tired: preferences.tired,
      dietaryRestriction: preferences.dietaryRestriction,
      professionalGuidance: preferences.professionalGuidance,
      availableMinutes: preferences.availableMinutes,
    },
  });
}

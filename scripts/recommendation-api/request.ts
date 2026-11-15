import { recommendationCatalogIds } from "../../lib/recommendations/catalog.ts";
import type { RecommendationRequest } from "../../lib/recommendations/types.ts";
import { RecommendationApiError } from "./provider.ts";

const NUTRIENTS = ["calories", "proteinG", "fatG", "carbsG"] as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return record(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function count(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}
function fail(code = "invalid_request", status = 400): never { throw new RecommendationApiError(code, status); }

/** Privacy allowlist. Unknown fields are rejected rather than silently forwarded. */
export function validateRequest(value: unknown): { requestId: string; request: RecommendationRequest } {
  if (!exact(value, ["requestId", "transferConsent", "request"])) fail();
  if (value.transferConsent !== true) fail("consent_required", 403);
  if (typeof value.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)) fail();
  const request = value.request;
  if (!exact(request, ["version", "goal", "nutrition", "recentWorkoutCount", "constraints", "candidates"]) || request.version !== "1" || !["build-muscle", "lose-fat", "maintain"].includes(String(request.goal))) fail();
  if (!count(request.recentWorkoutCount, 10_000)) fail();
  const nutrition = request.nutrition;
  if (!exact(nutrition, ["mealCount", "totals", "complete"]) || !count(nutrition.mealCount, 10_000) || !exact(nutrition.totals, NUTRIENTS) || !exact(nutrition.complete, NUTRIENTS)) fail();
  for (const key of NUTRIENTS) {
    const total = nutrition.totals[key];
    const complete = nutrition.complete[key];
    if (typeof complete !== "boolean" || (total !== null && (typeof total !== "number" || !Number.isFinite(total) || total < 0 || total > (key === "calories" ? 100_000 : 10_000)))) fail();
    if ((complete && total === null) || (nutrition.mealCount === 0 && (complete || total !== null))) fail();
  }
  const constraints = request.constraints;
  if (!exact(constraints, ["pain", "tired", "dietaryRestriction", "professionalGuidance", "availableMinutes"]) || ![10, 20, 30, 45, 60].includes(Number(constraints.availableMinutes)) || typeof constraints.availableMinutes !== "number") fail();
  for (const key of ["pain", "tired", "dietaryRestriction", "professionalGuidance"]) if (typeof constraints[key] !== "boolean") fail();
  if (!Array.isArray(request.candidates) || request.candidates.length < 1 || request.candidates.length > 54) fail();
  const catalog = new Set<string>(recommendationCatalogIds);
  const seen = new Set<string>();
  for (const item of request.candidates) {
    if (!exact(item, ["id", "kind", "features"]) || typeof item.id !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id) || !catalog.has(item.id) || seen.has(item.id) || !["meal", "workout"].includes(String(item.kind))) fail();
    if ((item.kind === "meal" && !item.id.startsWith("meal_")) || (item.kind === "workout" && !item.id.startsWith("exercise_"))) fail();
    if (constraints.professionalGuidance || (item.kind === "meal" && constraints.dietaryRestriction) || (item.kind === "workout" && (constraints.pain || constraints.tired))) fail("unsafe_candidates");
    if (!Array.isArray(item.features) || item.features.length !== 6 || item.features.some((feature) => typeof feature !== "number" || !Number.isFinite(feature) || feature < 0 || feature > 1)) fail();
    seen.add(item.id);
  }
  // Reconstruction fixes JSON property order and excludes object prototypes from fingerprints.
  const typed = request as unknown as RecommendationRequest;
  return {
    requestId: value.requestId.toLowerCase(),
    request: {
      version: "1", goal: typed.goal,
      nutrition: {
        mealCount: typed.nutrition.mealCount,
        totals: { calories: typed.nutrition.totals.calories, proteinG: typed.nutrition.totals.proteinG, fatG: typed.nutrition.totals.fatG, carbsG: typed.nutrition.totals.carbsG },
        complete: { calories: typed.nutrition.complete.calories, proteinG: typed.nutrition.complete.proteinG, fatG: typed.nutrition.complete.fatG, carbsG: typed.nutrition.complete.carbsG },
      },
      recentWorkoutCount: typed.recentWorkoutCount,
      constraints: { pain: typed.constraints.pain, tired: typed.constraints.tired, dietaryRestriction: typed.constraints.dietaryRestriction, professionalGuidance: typed.constraints.professionalGuidance, availableMinutes: typed.constraints.availableMinutes },
      candidates: typed.candidates.map((item) => ({ id: item.id, kind: item.kind, features: [...item.features] })),
    },
  };
}

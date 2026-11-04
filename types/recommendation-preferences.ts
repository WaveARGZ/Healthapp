/** Explicitly configured personal conditions. Absence is not equivalent to all false. */
export interface RecommendationPreferences {
  version: "1";
  pain: boolean;
  tired: boolean;
  dietaryRestriction: boolean;
  professionalGuidance: boolean;
  availableMinutes: 10 | 20 | 30 | 45 | 60;
}

const fields = ["version", "pain", "tired", "dietaryRestriction", "professionalGuidance", "availableMinutes"] as const;

/** Validate the exact versioned schema without coercion, defaults, mutation or persistence. */
export function isRecommendationPreferences(value: unknown): value is RecommendationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key as typeof fields[number]))) return false;
  const source = value as Record<string, unknown>;
  return source.version === "1"
    && ["pain", "tired", "dietaryRestriction", "professionalGuidance"].every((key) => typeof source[key] === "boolean")
    && typeof source.availableMinutes === "number"
    && [10, 20, 30, 45, 60].includes(source.availableMinutes);
}

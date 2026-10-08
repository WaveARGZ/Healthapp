export const recordKinds = new Set(["profile", "preferences", "workouts", "meals", "weights", "photos"]);
const validId = /^[A-Za-z0-9_-]{1,100}$/;

export function recordKey(kind, id) {
  if (!recordKinds.has(kind) || !validId.test(id) || (["profile", "preferences"].includes(kind) && id !== "main")) {
    throw new Error("invalid_record_key");
  }
  return `${kind}#${id}`;
}

export function userPartition(subject) {
  if (typeof subject !== "string" || !/^[\w-]{8,128}$/.test(subject)) throw new Error("invalid_user");
  return `USER#${subject}`;
}

export function photoKey(subject, id) {
  recordKey("photos", id);
  return `users/${subject}/${id}.jpg`;
}

function finite(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

export function validateRecord(kind, id, entry, subject) {
  recordKey(kind, id);
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("invalid_record");
  if (kind === "preferences") {
    for (const key of ["facilityEquipment", "customEquipment", "favoriteExercises"]) {
      if (!Array.isArray(entry[key]) || entry[key].length > 250 || entry[key].some((value) => typeof value !== "string" || value.length > 100)) throw new Error("invalid_preferences");
    }
  } else if (kind === "profile") {
    if (typeof entry.name !== "string" || !entry.name.trim() || entry.name.length > 100 ||
      !["build-muscle", "lose-fat", "maintain"].includes(entry.goal)) throw new Error("invalid_profile");
    for (const [field, min, max] of [["age", 1, 120], ["heightCm", 50, 250], ["startingWeightKg", 20, 500]]) {
      if (entry[field] !== undefined && !finite(entry[field], min, max)) throw new Error("invalid_profile");
    }
  } else {
    if (entry.id !== id || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))) {
      throw new Error("invalid_record");
    }
    if (kind === "weights" && (!finite(entry.weightKg, 20, 500) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.measuredOn))) {
      throw new Error("invalid_weight");
    }
    if (kind === "workouts" && (!Array.isArray(entry.exercises) || entry.exercises.length > 60 || typeof entry.performedAt !== "string")) {
      throw new Error("invalid_workout");
    }
    if (kind === "meals" && (entry.items !== undefined && (!Array.isArray(entry.items) || entry.items.length > 100) || !["breakfast", "lunch", "dinner", "snack"].includes(entry.mealType))) {
      throw new Error("invalid_meal");
    }
    if (kind === "photos" && (!["front", "back"].includes(entry.view) || entry.imageKey !== photoKey(subject, id))) {
      throw new Error("invalid_photo");
    }
  }
  if (JSON.stringify(entry).length > 60_000) throw new Error("record_too_large");
  return entry;
}

export function validateTrainingSignal(signal) {
  if (!signal || typeof signal !== "object" || Array.isArray(signal) ||
    typeof signal.confirmedFoodId !== "string" || signal.confirmedFoodId.length > 120 || !validId.test(signal.id) ||
    signal.modelId !== "Xenova/clip-vit-base-patch32" ||
    !Array.isArray(signal.labelIds) || signal.labelIds.length !== 27 ||
    signal.labelIds.some((label) => typeof label !== "string" || !label || label.length > 120) ||
    new Set(signal.labelIds).size !== 27 ||
    !Array.isArray(signal.scores) || signal.scores.length !== 27 ||
    signal.scores.some((score) => !finite(score, 0, 1)) ||
    !finite(signal.scores.reduce((sum, score) => sum + score, 0), 0.99, 1.01)) {
    throw new Error("invalid_training_signal");
  }
  const nutrition = signal.nutrition;
  if (nutrition && ["calories", "proteinG", "fatG", "carbsG"].some((key) => !finite(nutrition[key], 0, 10000))) {
    throw new Error("invalid_nutrition");
  }
  return {
    id: signal.id,
    confirmedFoodId: signal.confirmedFoodId,
    confirmedFoodName: typeof signal.confirmedFoodName === "string" ? signal.confirmedFoodName.slice(0, 100) : "",
    modelId: signal.modelId,
    labelIds: signal.labelIds,
    scores: signal.scores,
    nutrition: nutrition ?? null,
    createdAt: new Date().toISOString(),
    source: "user-correction",
  };
}

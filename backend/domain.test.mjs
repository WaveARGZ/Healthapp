import assert from "node:assert/strict";
import { test } from "node:test";
import { photoKey, recordKey, userPartition, validateRecord, validateTrainingSignal } from "./domain.mjs";
import { handler } from "./handler.mjs";

test("record keys are scoped and reject path-like IDs", () => {
  assert.equal(userPartition("11111111-2222-3333-4444-555555555555"), "USER#11111111-2222-3333-4444-555555555555");
  assert.equal(recordKey("profile", "main"), "profile#main");
  assert.equal(photoKey("11111111-2222-3333-4444-555555555555", "photo_123"), "users/11111111-2222-3333-4444-555555555555/photo_123.jpg");
  assert.throws(() => recordKey("meals", "../other"));
  assert.throws(() => recordKey("profile", "other"));
});

test("a photo can only reference its own private key", () => {
  const subject = "11111111-2222-3333-4444-555555555555";
  const entry = { id: "photo_123", view: "front", imageKey: photoKey(subject, "photo_123"), createdAt: new Date().toISOString() };
  assert.equal(validateRecord("photos", entry.id, entry, subject).imageKey, entry.imageKey);
  assert.throws(() => validateRecord("photos", entry.id, { ...entry, imageKey: "users/another/photo_123.jpg" }, subject));
});

test("training signal keeps only the allowlisted non-photo fields", () => {
  const signal = validateTrainingSignal({
    id: "sample_1", modelId: "Xenova/clip-vit-base-patch32", labelIds: Array.from({ length: 27 }, (_, index) => `food_${index}`), scores: Array(27).fill(1 / 27), confirmedFoodId: "rice",
    confirmedFoodName: "ご飯", nutrition: { calories: 150, proteinG: 3, fatG: 0, carbsG: 35 },
    image: "data:image/jpeg;base64,secret", email: "private@example.com",
  });
  assert.equal(signal.confirmedFoodName, "ご飯");
  assert.equal("image" in signal, false);
  assert.equal("email" in signal, false);
  assert.throws(() => validateTrainingSignal({ id: "sample_1", modelId: "Xenova/clip-vit-base-patch32", labelIds: Array.from({ length: 27 }, (_, index) => `food_${index}`), scores: Array(27).fill(0), confirmedFoodId: "rice" }));
});

test("API refuses requests without a Cognito access token before touching storage", async () => {
  const response = await handler({ rawPath: "/records/meals", requestContext: { http: { method: "GET" }, authorizer: { jwt: { claims: { token_use: "id", sub: "11111111-2222-3333-4444-555555555555" } } } } });
  assert.equal(response.statusCode, 401);
});

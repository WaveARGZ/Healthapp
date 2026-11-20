import assert from "node:assert/strict";
import test from "node:test";
import { registrationExercises, registeredExerciseForName } from "../lib/data/registration-exercise-catalog.ts";
import { exerciseShortVideoIds, getExerciseShortEmbedUrl } from "../lib/data/exercise-short-videos.ts";

test("known shorts still play for their original and updated menu names", () => {
  const videos = Object.entries(exerciseShortVideoIds);
  assert.equal(new Set(videos.map(([, id]) => id)).size, videos.length);
  for (const [exerciseName, videoId] of videos) {
    const item = registeredExerciseForName(exerciseName);
    assert.ok(item, `Catalog entry not found for ${exerciseName}`);
    assert.match(videoId, /^[A-Za-z0-9_-]{11}$/);
    const expected = `https://www.youtube.com/embed/${videoId}?playlist=${videoId}&loop=1&playsinline=1&rel=0&autoplay=1`;
    assert.equal(getExerciseShortEmbedUrl(exerciseName), expected);
    assert.equal(getExerciseShortEmbedUrl(item.name), expected);
  }
  assert.ok(registrationExercises.length > videos.length);
  assert.equal(getExerciseShortEmbedUrl("ゴブレットスクワット"), undefined);
  assert.equal(getExerciseShortEmbedUrl("登録されていない種目"), undefined);
});

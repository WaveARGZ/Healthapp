import assert from "node:assert/strict";
import test from "node:test";
import { beginnerExerciseCatalog } from "../lib/data/beginner-exercise-catalog.ts";
import { exerciseShortVideoIds, getExerciseShortEmbedUrl } from "../lib/data/exercise-short-videos.ts";

test("every beginner exercise has its own YouTube Short", () => {
  const exerciseNames = beginnerExerciseCatalog.flatMap((category) => category.groups.flatMap((group) => group.exercises));
  assert.equal(new Set(exerciseNames).size, exerciseNames.length);
  assert.deepEqual(Object.keys(exerciseShortVideoIds).sort(), [...exerciseNames].sort());
  assert.equal(new Set(Object.values(exerciseShortVideoIds)).size, exerciseNames.length);

  for (const exerciseName of exerciseNames) {
    const videoId = exerciseShortVideoIds[exerciseName];
    assert.match(videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.equal(getExerciseShortEmbedUrl(exerciseName), `https://www.youtube.com/embed/${videoId}?playlist=${videoId}&loop=1&playsinline=1&rel=0&autoplay=1`);
  }
  assert.equal(getExerciseShortEmbedUrl("登録されていない種目"), undefined);
});

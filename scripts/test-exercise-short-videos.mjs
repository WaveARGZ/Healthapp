import assert from "node:assert/strict";
import test from "node:test";
import { beginnerExerciseCatalog } from "../lib/data/beginner-exercise-catalog.ts";
import { exerciseShortVideoIds, getExerciseShortUrl } from "../lib/data/exercise-short-videos.ts";

test("every beginner exercise has its own YouTube Short", () => {
  const exerciseNames = beginnerExerciseCatalog.flatMap((category) => category.groups.flatMap((group) => group.exercises));
  assert.equal(new Set(exerciseNames).size, exerciseNames.length);
  assert.deepEqual(Object.keys(exerciseShortVideoIds).sort(), [...exerciseNames].sort());
  assert.equal(new Set(Object.values(exerciseShortVideoIds)).size, exerciseNames.length);

  for (const exerciseName of exerciseNames) {
    const videoId = exerciseShortVideoIds[exerciseName];
    assert.match(videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.equal(getExerciseShortUrl(exerciseName), `https://www.youtube.com/shorts/${videoId}`);
  }
  assert.equal(getExerciseShortUrl("登録されていない種目"), undefined);
});

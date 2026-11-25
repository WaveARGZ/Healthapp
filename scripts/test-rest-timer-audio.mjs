import assert from "node:assert/strict";
import test from "node:test";
import { allowTimerAudioMixing, scheduleRestChime } from "../lib/workouts/rest-timer-audio.ts";
import { initialWorkoutTimer, restDurationMs, restoreWorkoutTimer, workoutTimerElapsed } from "../lib/workouts/workout-timer-state.ts";

test("the chime uses mixable audio and begins at the deadline", () => {
  const browser = { audioSession: { type: "auto" } };
  assert.equal(allowTimerAudioMixing(browser), true);
  assert.equal(browser.audioSession.type, "ambient");
  assert.equal(allowTimerAudioMixing({}), false);
  assert.equal(allowTimerAudioMixing({ audioSession: Object.freeze({ type: "auto" }) }), false);
  const calls = [];
  const sampleRate = 8000;
  const source = { connect: () => {}, start: (time) => calls.push(time) };
  const context = {
    currentTime: 20, sampleRate,
    createBuffer: (_channels, frames) => ({ copyToChannel(samples) {
      assert.equal(frames, sampleRate * 2);
      assert.notEqual(samples[2], 0);
    } }),
    createBufferSource: () => source,
  };
  const chime = scheduleRestChime(context, 1250);
  assert.equal(chime.playAt, 21.25);
  assert.deepEqual(calls, [21.25]);
  assert.equal(source.loop, true);
});

test("the rest deadline survives a hidden interval or reload independently of elapsed callbacks", () => {
  const stored = { ...initialWorkoutTimer, startedAt: 100_000, elapsedMs: 15_000 };
  const restored = restoreWorkoutTimer(JSON.stringify(stored));
  assert.deepEqual(restored, stored);
  const deadline = stored.startedAt + restDurationMs(stored.durationDraft) - stored.elapsedMs;
  assert.equal(workoutTimerElapsed(restored, deadline - 1000), 89_000);
  assert.equal(workoutTimerElapsed(restored, deadline), 90_000);
  assert.equal(workoutTimerElapsed(restored, deadline + 60_000), 150_000);
  assert.equal(workoutTimerElapsed({ ...restored, startedAt: null }, deadline + 60_000), 15_000);
  assert.equal(restoreWorkoutTimer('{"mode":"rest","elapsedMs":-1}'), initialWorkoutTimer);
  assert.equal(restDurationMs({ minutes: "1", seconds: "60" }), 0);
});

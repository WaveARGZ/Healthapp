import assert from "node:assert/strict";
import test from "node:test";
import { scheduledRestAlarm } from "../lib/workouts/rest-timer-audio.ts";

test("a rest alarm WAV contains the requested delay before the first chime", async () => {
  const delayMs = 1250;
  const track = scheduledRestAlarm(delayMs);
  assert.equal(track.type, "audio/wav");
  const bytes = await track.arrayBuffer();
  const view = new DataView(bytes);
  const extract = (start, length) => new TextDecoder().decode(new Uint8Array(bytes, start, length));
  assert.equal(extract(0, 4), "RIFF");
  assert.equal(extract(8, 8), "WAVEfmt ");
  assert.equal(extract(36, 4), "data");
  assert.equal(view.getUint32(4, true), bytes.byteLength - 8);
  assert.equal(view.getUint32(40, true), bytes.byteLength - 44);
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint16(34, true), 16);

  const rate = view.getUint32(24, true);
  const startOfAlarm = 44 + rate * delayMs / 1000 * 2;
  const silence = new Uint8Array(bytes, 44, startOfAlarm - 44);
  assert.ok(silence.every((sample) => sample === 0));
  assert.notEqual(view.getInt16(startOfAlarm + 4, true), 0);
  assert.equal(view.getUint32(40, true) / (2 * rate), delayMs / 1000 + 30);
});

test("unsupported delays leave the timer free to use its existing audio fallback", () => {
  for (const delay of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, 30 * 60 * 1000 + 1]) {
    assert.equal(scheduledRestAlarm(delay), null);
  }
});

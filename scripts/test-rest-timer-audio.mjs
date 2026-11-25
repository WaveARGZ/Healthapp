import assert from "node:assert/strict";
import test from "node:test";
import { prepareRestAlarmSession, restAlarmTrack } from "../lib/workouts/rest-timer-audio.ts";

test("the alarm begins with the chime and can loop at a fixed length", async () => {
  const track = restAlarmTrack();
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
  assert.notEqual(view.getInt16(48, true), 0);
  assert.equal(view.getUint32(40, true) / (2 * rate), 2);
});

test("countdown keeps audio mixable and finishing takes priority until the alarm is stopped", () => {
  const browser = { audioSession: { type: "auto" } };
  const alarm = prepareRestAlarmSession(browser);
  assert.equal(browser.audioSession.type, "ambient");
  assert.equal(alarm.prioritize(), true);
  assert.equal(browser.audioSession.type, "playback");
  alarm.restore();
  assert.equal(browser.audioSession.type, "auto");
});

test("pausing restores audio and browsers without audio sessions can use ordinary media", () => {
  const browser = { audioSession: { type: "auto" } };
  const alarm = prepareRestAlarmSession(browser);
  alarm.restore();
  assert.equal(browser.audioSession.type, "auto");
  assert.equal(prepareRestAlarmSession({}), null);
});

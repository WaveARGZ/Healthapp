import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMuscleActivity } from "../lib/workouts/muscle-activity.ts";

function workout(performedAt, ...names) {
  return {
    id: `${performedAt}-${names.join("-")}`,
    performedAt,
    createdAt: `${performedAt}T12:00:00`,
    exercises: names.map((name, index) => ({ id: String(index), name })),
  };
}

test("today and the 13 preceding dates count; day 14 has faded", () => {
  const activity = summarizeMuscleActivity([
    workout("2026-10-26", "バーベルベンチプレス"),
    workout("2026-10-13", "ダンベルベンチプレス"),
    workout("2026-10-12", "チェストプレス"),
    workout("2026-10-27", "ペックデックフライ"),
  ], "2026-10-26");
  assert.equal(activity["胸"], 2);
  assert.equal(summarizeMuscleActivity([workout("2026-10-13", "チェストプレス")], "2026-10-27")["胸"], 0);
});

test("sets and exercises on the same day count only once for each region", () => {
  const activity = summarizeMuscleActivity([
    workout("2026-10-26", "バーベルベンチプレス", "ダンベルフライ", "ラットプルダウン"),
    workout("2026-10-26", "チェストプレス", "バーベルカール"),
    workout("2026-10-25", "プランク", "バックスクワット"),
  ], "2026-10-26");
  assert.deepEqual(activity, { "胸": 1, "背中": 1, "腕": 1, "肩": 0, "腹筋・体幹": 1, "脚": 1 });
});

test("shared catalog names credit each listed region and unrecognized names do not count", () => {
  const activity = summarizeMuscleActivity([
    workout("2026-10-26", "シュラッグ", "トレッドミル", "自由入力", "肩の自作種目"),
  ], "2026-10-26");
  assert.equal(activity["肩"], 1);
  assert.equal(activity["背中"], 1);
  assert.equal(activity["胸"], 0);
});

test("year rollover and malformed calendar dates are handled", () => {
  const activity = summarizeMuscleActivity([
    workout("2025-12-18", "レッグプレス"),
    workout("2025-12-19", "レッグプレス"),
    workout("2026-01-01", "レッグプレス"),
    workout("2025-12-32", "レッグプレス"),
  ], "2026-01-01");
  assert.equal(activity["脚"], 2);
  assert.equal(summarizeMuscleActivity([workout("2026-01-01", "レッグプレス")], "invalid")["脚"], 0);
});

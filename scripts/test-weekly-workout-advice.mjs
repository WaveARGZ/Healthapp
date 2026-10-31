import assert from "node:assert/strict";
import test from "node:test";
import { summarizeWeeklyWorkoutAdvice } from "../lib/workouts/weekly-advice.ts";

function workout(date, ...exercises) {
  return {
    id: `${date}-${exercises.map((exercise) => exercise.name).join("-")}`,
    performedAt: date,
    createdAt: `${date}T12:00:00`,
    exercises: exercises.map((exercise, index) => ({ id: String(index), ...exercise })),
  };
}

test("recent seven days include today, exclude old/future dates, and deduplicate same-day records", () => {
  const advice = summarizeWeeklyWorkoutAdvice([
    workout("2026-10-17", { name: "レッグプレス" }),
    workout("2026-10-18", { name: "チェストプレス" }),
    workout("2026-10-24", { name: "ラットプルダウン" }),
    workout("2026-10-25", { name: "チェストプレス", setRecords: [{ id: "1", completed: true }] }),
    workout("2026-10-25", { name: "ペックデックフライ", setRecords: [{ id: "2", completed: true }] }),
    workout("2026-10-31", { name: "レッグプレス" }, { name: "ウォーキング" }),
    workout("2026-11-01", { name: "プランク" }),
    workout("2026-10-32", { name: "自重スクワット" }),
  ], "2026-10-31", "build-muscle");
  assert.equal(advice.startDate, "2026-10-25");
  assert.equal(advice.trainingDays, 2);
  assert.equal(advice.previousTrainingDays, 2);
  assert.equal(advice.strengthDays, 2);
  assert.equal(advice.cardioDays, 1);
  assert.equal(advice.completedSets, 2);
  assert.equal(advice.muscleDays["胸"], 1);
  assert.equal(advice.muscleDays["脚"], 1);
  assert.match(advice.goal, /完了チェック済みのセットは2件/);
  assert.doesNotMatch(advice.encouragement, /前の7日より/);
});

test("balance advice distinguishes one day, missing major groups and unclassified names", () => {
  const oneDay = summarizeWeeklyWorkoutAdvice([workout("2026-10-31", { name: "チェストプレス" })], "2026-10-31", "maintain");
  assert.match(oneDay.balance, /1日分だけでは/);

  const twoDays = summarizeWeeklyWorkoutAdvice([
    workout("2026-10-30", { name: "チェストプレス" }, { name: "自由入力" }),
    workout("2026-10-31", { name: "チェストプレス" }, { name: "ウォーキング" }),
  ], "2026-10-31", "maintain");
  assert.match(twoDays.balance, /背中・脚の記録がない/);
  assert.match(twoDays.balance, /部位を判定できない種目が1件/);
  assert.equal(twoDays.muscleDays["胸"], 2);
  assert.equal(twoDays.unclassifiedExercises, 1);

  const mixed = summarizeWeeklyWorkoutAdvice([
    workout("2026-10-30", { name: "チェストプレス" }, { name: "ラットプルダウン" }),
    workout("2026-10-31", { name: "レッグプレス" }),
  ], "2026-10-31", "maintain");
  assert.match(mixed.balance, /腕・肩・腹筋・体幹の個別種目は未記録/);
});

test("goal feedback uses recorded exercise types without promising body-shape results", () => {
  const records = [
    workout("2026-10-30", { name: "チェストプレス" }),
    workout("2026-10-31", { name: "トレッドミル" }),
  ];
  assert.match(summarizeWeeklyWorkoutAdvice(records, "2026-10-31", "build-muscle").goal, /筋肉を増やす目標/);
  assert.match(summarizeWeeklyWorkoutAdvice(records, "2026-10-31", "lose-fat").goal, /筋トレを1日、有酸素を1日/);
  assert.match(summarizeWeeklyWorkoutAdvice(records, "2026-10-31", "maintain").goal, /体型を維持/);
  assert.match(summarizeWeeklyWorkoutAdvice(records, "2026-10-31", null).goal, /目標体型を設定/);
  assert.doesNotMatch(summarizeWeeklyWorkoutAdvice(records, "2026-10-31", "lose-fat").goal, /%|確実|効果がある/);
});

test("empty or unclassified weeks do not invent activity or judge balance", () => {
  const empty = summarizeWeeklyWorkoutAdvice([workout("2026-10-24", { name: "プランク" })], "2026-10-31", "maintain");
  assert.equal(empty.trainingDays, 0);
  assert.match(empty.encouragement, /前の7日間には1日/);

  const blank = summarizeWeeklyWorkoutAdvice([workout("2026-10-31", { name: " " })], "2026-10-31", "maintain");
  assert.equal(blank.trainingDays, 0);

  const unknown = summarizeWeeklyWorkoutAdvice([workout("2026-10-31", { name: "自由入力" })], "2026-10-31", "build-muscle");
  assert.equal(unknown.trainingDays, 1);
  assert.equal(unknown.strengthDays, 0);
  assert.match(unknown.balance, /偏りを評価できません/);
  assert.match(unknown.goal, /照らし合わせられる運動記録がまだありません/);
});

test("encouragement describes a recorded increase without scoring a decrease", () => {
  const advice = summarizeWeeklyWorkoutAdvice([
    workout("2026-10-23", { name: "チェストプレス" }),
    workout("2026-10-29", { name: "ラットプルダウン" }),
    workout("2026-10-31", { name: "レッグプレス" }),
  ], "2026-10-31", "maintain");
  assert.match(advice.encouragement, /前の7日より1日増えました/);
});

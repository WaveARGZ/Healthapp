import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { summarizeDailyCalories } from "../lib/utils/meal-calories.ts";
import { summarizeDailyMacros } from "../lib/utils/meal-macros.ts";
import { burnMinusIntake } from "../lib/utils/daily-burn.ts";

// Actual aggregation, parent prop wiring, and rendered shared component, using
// synthetic records in RAM. No account, browser storage, network, or file writes.
const root = new URL("../", import.meta.url);
const day = "2026-11-15";
const known = { recordedAt: day, calories: 500, proteinG: 20, fatG: 10, carbsG: 80 };
const empty = { recordedAt: day };
const partialNotice = "カロリーと収支は入力済み分で計算しています。未入力の料理・食事は含みません。";
const macroNotice = "PFCは入力済み分の合計です。未入力の栄養素は含みません。";

function load(relativePath, modules) {
  const source = ts.transpileModule(readFileSync(new URL(relativePath, root), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(id) {
      assert.ok(Object.hasOwn(modules, id), `Unexpected dependency: ${id}`);
      return modules[id];
    },
  });
  return exports;
}

const sharedModules = { "react/jsx-runtime": jsxRuntime, "next/link": { default: "a" } };
const { MobileDashboard } = load("components/dashboard/mobile-dashboard.tsx", {
  ...sharedModules,
  "@/components/dashboard/anatomy-figure": { AnatomyFigure: () => null },
  "@/lib/workouts/muscle-activity": { summarizeMuscleActivity: () => ({}) },
  "@/lib/utils/daily-burn": { burnMinusIntake },
});

function renderDashboard(meals, { loading = false, mealUnavailable = false, burnUnavailable = false } = {}) {
  const data = { profile: null, workouts: [], meals, weights: [], burns: [{ performedAt: day, caloriesBurned: 2000 }] };
  const states = [data, loading, "", false, mealUnavailable, false, burnUnavailable, day];
  let stateIndex = 0;
  const { DashboardContent } = load("components/dashboard/dashboard-content.tsx", {
    ...sharedModules,
    react: { useState: () => [states[stateIndex++], () => {}], useEffect() {}, useMemo: (callback) => callback() },
    "@/components/ui/icon": { Icon: () => null },
    "@/components/progress/weight-trend-chart": { WeightTrendChart: () => null },
    "@/components/dashboard/muscle-activity-map": { MuscleActivityMap: () => null },
    "@/components/dashboard/daily-calorie-rings": { DailyCalorieRings: () => null },
    "@/components/dashboard/mobile-dashboard": { MobileDashboard },
    "@/components/dashboard/weekly-workout-advice": { WeeklyWorkoutAdvice: () => null },
    "@/lib/api/client": { bodyMakeClient: {} },
    "@/lib/utils/date": { formatToday: () => day, toDateInputValue: () => day },
    "@/lib/utils/meal-calories": { summarizeDailyCalories },
    "@/lib/utils/meal-macros": { summarizeDailyMacros },
    "@/lib/utils/daily-feedback": { summarizeDailyFeedback: () => ({ meal: { href: "/meals", title: "" }, workout: { href: "/workouts", title: "" } }) },
    "@/lib/utils/daily-calorie-guide": { estimateDailyCalorieGuide: () => null },
    "@/types/user": { fitnessGoalLabels: {} },
  });
  function findShared(node) {
    if (!node || typeof node !== "object") return undefined;
    if (Array.isArray(node)) return node.map(findShared).find(Boolean);
    return node.type === MobileDashboard ? node : findShared(node.props?.children);
  }
  const shared = findShared(DashboardContent());
  assert.ok(shared, "DashboardContent must render the shared dashboard");
  assert.equal(typeof shared.props.incompleteCalories, "boolean", "Parent must pass calorie completeness, including after desktop unification");
  return renderToStaticMarkup(shared);
}

test("fully entered meals display complete totals without partial-total warnings", () => {
  const html = renderDashboard([known]);
  assert.match(html, /摂取 500 kcal/);
  assert.match(html, /消費から摂取を引いた差 \+1,500 kcal/);
  assert.ok(!html.includes(partialNotice));
  assert.ok(!html.includes(macroNotice));
});

test("missing meal calories are explained beside the subtotal and balance, including for screen readers", () => {
  // Complete PFC does not imply complete calories.
  const html = renderDashboard([known, { ...known, calories: undefined }]);
  assert.match(html, /摂取 500 kcal/);
  assert.match(html, /消費から摂取を引いた差 \+1,500 kcal/);
  assert.ok(html.includes(partialNotice));
  assert.ok(!html.includes(macroNotice));
  assert.equal((html.match(/aria-describedby="mobile-calorie-status"/g) ?? []).length, 2);
});

test("partially entered dishes within a meal retain the calorie warning", () => {
  const html = renderDashboard([{ ...known, items: [known, empty] }]);
  assert.ok(html.includes(partialNotice));
  assert.ok(html.includes(macroNotice));
});

test("all unknown calories and PFC remain unknown, not zero or a complete balance", () => {
  const html = renderDashboard([empty]);
  assert.match(html, /摂取 — kcal/);
  assert.match(html, /消費から摂取を引いた差 — kcal/);
  assert.match(html, /カロリーは未入力です。収支は計算できません。/);
  assert.match(html, /PFCは未入力です。/);
  assert.ok(!html.includes(partialNotice));
});

test("explicit zero is a known value and is not described as missing", () => {
  const html = renderDashboard([{ ...known, calories: 0, proteinG: 0, fatG: 0, carbsG: 0 }]);
  assert.match(html, /摂取 0 kcal/);
  assert.match(html, /消費から摂取を引いた差 \+2,000 kcal/);
  assert.ok(!html.includes("未入力"));
});

test("no meals differs from recorded meals with unknown calories", () => {
  const html = renderDashboard([]);
  assert.match(html, /まだ食事の記録はありません。/);
  assert.match(html, /消費から摂取を引いた差 — kcal/);
  assert.ok(!html.includes("カロリーは未入力"));
});

test("partial PFC has its own explanation even when calories are complete", () => {
  const html = renderDashboard([known, { ...known, proteinG: undefined }]);
  assert.ok(html.includes(macroNotice));
  assert.ok(!html.includes(partialNotice));
  assert.match(html, /aria-describedby="mobile-macro-status"/);
});

test("loading and failed meal requests do not misreport missing user input", () => {
  for (const options of [{ loading: true }, { mealUnavailable: true }]) {
    const html = renderDashboard([known, empty], options);
    assert.match(html, /摂取 — kcal/);
    assert.ok(!html.includes(partialNotice));
    assert.ok(!html.includes(macroNotice));
    assert.ok(!html.includes("カロリーは未入力"));
  }
});

test("unavailable burn records do not hide the partial-intake warning or invent a balance", () => {
  const html = renderDashboard([known, empty], { burnUnavailable: true });
  assert.ok(html.includes(partialNotice));
  assert.match(html, /消費から摂取を引いた差 — kcal/);
});

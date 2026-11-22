import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { summarizeDailyCalories } from "../lib/utils/meal-calories.ts";
import { summarizeDailyMacros } from "../lib/utils/meal-macros.ts";
import { burnMinusIntake, totalDailyBurn } from "../lib/utils/daily-burn.ts";
import { estimateDailyCalorieGuide, estimateDailyMacroGuide, estimateRestingCalories } from "../lib/utils/daily-calorie-guide.ts";

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
  "@/components/dashboard/personal-nutrition-guide": { PersonalNutritionGuide: () => null },
  "@/lib/workouts/muscle-activity": { summarizeMuscleActivity: () => ({}) },
  "@/lib/utils/daily-burn": { burnMinusIntake, totalDailyBurn },
  "@/lib/utils/daily-calorie-guide": { estimateDailyCalorieGuide, estimateDailyMacroGuide },
});
const { PersonalNutritionGuide } = load("components/dashboard/personal-nutrition-guide.tsx", {
  ...sharedModules,
  "@/lib/utils/daily-calorie-guide": { estimateDailyCalorieGuide, estimateDailyMacroGuide },
  "@/types/user": { fitnessGoalLabels: { "build-muscle": "筋肉を増やす", "lose-fat": "体脂肪を減らす", maintain: "現在の体型を維持する" } },
});

function renderDashboard(meals, { loading = false, mealUnavailable = false, burnUnavailable = false, profile = null, burns = [{ performedAt: day, caloriesBurned: 2000 }] } = {}) {
  const data = { profile, workouts: [], meals, weights: [], burns };
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
    "@/components/dashboard/weekly-review": { WeeklyReview: () => null },
    "@/lib/api/client": { bodyMakeClient: {} },
    "@/lib/utils/date": { formatToday: () => day, toDateInputValue: () => day },
    "@/lib/utils/meal-calories": { summarizeDailyCalories },
    "@/lib/utils/meal-macros": { summarizeDailyMacros },
    "@/lib/utils/daily-feedback": { summarizeDailyFeedback: () => ({ meal: { href: "/meals", title: "" }, workout: { href: "/workouts", title: "" } }) },
    "@/lib/utils/daily-calorie-guide": { estimateRestingCalories },
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
  assert.match(html, /消費から摂取を引いた収支 \+1,500 kcal。消費が多い/);
  assert.match(html, /PFCの摂取量/);
  assert.match(html, /20g.*目安上限比 —/);
  assert.ok(!html.includes(partialNotice));
  assert.ok(!html.includes(macroNotice));
});

test("calorie balance shows higher expenditure in blue, higher intake in red, and equality in charcoal", () => {
  const higherExpenditure = renderDashboard([known]);
  const higherIntake = renderDashboard([{ ...known, calories: 2500 }]);
  const equal = renderDashboard([{ ...known, calories: 2000 }]);
  assert.match(higherExpenditure, /消費から摂取を引いた収支 \+1,500 kcal。消費が多い/);
  assert.match(higherExpenditure, /style="color:#1e40af"[^>]*><strong[^>]*>\+1,500/);
  assert.match(higherIntake, /消費から摂取を引いた収支 -500 kcal。摂取が多い/);
  assert.match(higherIntake, /style="color:#b91c1c"[^>]*><strong[^>]*>-500/);
  assert.match(equal, /消費から摂取を引いた収支 0 kcal。消費と摂取が同じ/);
  assert.match(equal, /style="color:var\(--ink\)"[^>]*><strong[^>]*>0/);
});

test("today's balance adds resting calories only to activity expenditure", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "maintain" };
  const activity = { performedAt: day, caloriesBurned: 400, burnScope: "activity" };
  const html = renderDashboard([known], { profile, burns: [activity] });
  assert.match(html, /※基礎代謝の値を考慮した数値です/);
  assert.doesNotMatch(html, /推定基礎代謝 1,618 kcal|活動消費 400 kcal|2,018 kcal/);
  assert.match(html, /消費から摂取を引いた収支 \+1,518 kcal/);
  assert.match(renderDashboard([known], { profile }), /消費から摂取を引いた収支 \+1,500 kcal/);
  const restingOnly = renderDashboard([known], { profile, burns: [] });
  assert.match(restingOnly, /収支 \+1,118 kcal/);
  assert.match(restingOnly, /活動消費は未記録です。/);
  const withoutEstimate = renderDashboard([known], { burns: [activity] });
  assert.match(withoutEstimate, /カロリー収支は未計算/);
  assert.doesNotMatch(withoutEstimate, /※基礎代謝の値を考慮した数値です/);
  assert.match(renderDashboard([known], { profile, burnUnavailable: true }), /カロリー収支は未計算/);
});

test("missing meal calories are explained beside the subtotal and balance, including for screen readers", () => {
  // Complete PFC does not imply complete calories.
  const html = renderDashboard([known, { ...known, calories: undefined }]);
  assert.match(html, /摂取 500 kcal/);
  assert.match(html, /消費から摂取を引いた収支 \+1,500 kcal。消費が多い/);
  assert.ok(html.includes(partialNotice));
  assert.ok(!html.includes(macroNotice));
  assert.match(html, /aria-describedby="mobile-calorie-status"/);
  assert.match(html, /aria-describedby="mobile-calorie-status mobile-balance-note"/);
});

test("partially entered dishes within a meal retain the calorie warning", () => {
  const html = renderDashboard([{ ...known, items: [known, empty] }]);
  assert.ok(html.includes(partialNotice));
  assert.ok(html.includes(macroNotice));
});

test("all unknown calories and PFC remain unknown, not zero or a complete balance", () => {
  const html = renderDashboard([empty]);
  assert.match(html, /摂取 — kcal/);
  assert.match(html, /カロリー収支は未計算/);
  assert.match(html, /カロリーは未入力です。収支は計算できません。/);
  assert.match(html, /PFCは未入力です。/);
  assert.ok(!html.includes(partialNotice));
});

test("explicit zero is a known value and is not described as missing", () => {
  const html = renderDashboard([{ ...known, calories: 0, proteinG: 0, fatG: 0, carbsG: 0 }]);
  assert.match(html, /摂取 0 kcal/);
  assert.match(html, /消費から摂取を引いた収支 \+2,000 kcal。消費が多い/);
  assert.ok(!html.includes("未入力"));
});

test("no meals differs from recorded meals with unknown calories", () => {
  const html = renderDashboard([]);
  assert.match(html, /まだ食事の記録はありません。/);
  assert.match(html, /カロリー収支は未計算/);
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

test("actual intake and PFC appear beside daily targets without crowding the balance with burn estimates", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  const html = renderDashboard([known], { profile });
  assert.match(html, /摂取/);
  assert.match(html, /500/);
  assert.match(html, /1日の目安/);
  assert.match(html, /2,400～2,700/);
  assert.match(html, /目安：120～135 g/);
  assert.match(html, /20g.*目安上限比 15%/);
  assert.doesNotMatch(html, /記録した総消費|活動による消費の推定/);
  assert.match(html, /※基礎代謝の値を考慮した数値です/);
  assert.match(html, /濃色：今日の記録/);
  assert.match(html, /淡色：1日の目安/);
  assert.match(html, /role="meter"/);
  assert.doesNotMatch(html, /conic-gradient|size-\[80px\]/);
});

test("PFC markers and displayed ratios follow recorded grams against the target upper bound", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  const belowTarget = renderDashboard([known], { profile });
  assert.match(belowTarget, /aria-label="たんぱく質の摂取量" aria-valuemin="0" aria-valuemax="168\.75" aria-valuenow="20"/);
  assert.match(belowTarget, /width:80%;background-color:#dce8e2/);
  assert.match(belowTarget, /left:11\.851[0-9]*%;background-color:#4f7668/);
  assert.match(belowTarget, /20g.*目安上限比 15%/);

  const aboveTarget = renderDashboard([{ ...known, proteinG: 200 }], { profile });
  assert.match(aboveTarget, /aria-label="たんぱく質の摂取量" aria-valuemin="0" aria-valuemax="200" aria-valuenow="200"/);
  assert.match(aboveTarget, /width:67\.5%;background-color:#dce8e2/);
  assert.match(aboveTarget, /left:100%;background-color:#4f7668/);
  assert.match(aboveTarget, /200g.*目安上限比 148%/);
});

test("the calorie target uses one bar with an actual marker and a separate upper bound", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  const below = renderDashboard([known], { profile });
  assert.match(below, /aria-label="今日の摂取カロリー" aria-valuemin="0" aria-valuemax="3375" aria-valuenow="500"/);
  assert.match(below, /width:80%;background-color:color-mix\(in srgb, var\(--sage-deep\) 22%, white\)/);
  assert.match(below, /left:14\.814[0-9]*%;background-color:var\(--sage-deep\)/);
  assert.match(below, /1日の摂取目安.*2,400～2,700 kcal.*目安上限比 19%/);

  const above = renderDashboard([{ ...known, calories: 3600 }], { profile });
  assert.match(above, /aria-label="今日の摂取カロリー" aria-valuemin="0" aria-valuemax="3600" aria-valuenow="3600"/);
  assert.match(above, /width:75%;background-color:color-mix\(in srgb, var\(--sage-deep\) 22%, white\)/);
  assert.match(above, /left:100%;background-color:var\(--sage-deep\)/);
  assert.match(above, /1日の摂取目安.*目安上限比 133%/);
});

test("the calorie target distinguishes unrecorded intake, recorded zero and missing profiles", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  for (const meals of [[], [empty]]) {
    const html = renderDashboard(meals, { profile });
    const meter = html.match(/aria-label="今日の摂取カロリー"[^>]+/);
    assert.ok(meter);
    assert.match(meter[0], /未入力。目安2,400～2,700 kcal/);
    assert.doesNotMatch(meter[0], /aria-valuenow/);
  }
  const zero = renderDashboard([{ ...known, calories: 0 }], { profile });
  assert.match(zero, /aria-label="今日の摂取カロリー"[^>]+aria-valuenow="0"/);
  assert.match(zero, /1日の摂取目安.*目安上限比 0%/);
  assert.doesNotMatch(renderDashboard([known]), /aria-label="今日の摂取カロリー"/);
});

test("calculation details retain resting and total expenditure estimates", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  const html = renderToStaticMarkup(PersonalNutritionGuide({ profile, weightKg: 70, loading: false, unavailable: false }));
  assert.match(html, /基礎代謝/);
  assert.match(html, /1,600/);
  assert.match(html, /2,250～2,600/);
  assert.match(html, /運動だけで消費すべき量ではありません/);
});

test("personal guide requests missing profile details instead of inventing calorie targets", () => {
  const html = renderToStaticMarkup(PersonalNutritionGuide({ profile: null, weightKg: null, loading: false, unavailable: false }));
  assert.match(html, /年齢・身長・体重を登録すると/);
  assert.ok(!html.includes("総消費"));
});

test("unavailable burn records do not hide the partial-intake warning or invent a balance", () => {
  const html = renderDashboard([known, empty], { burnUnavailable: true });
  assert.ok(html.includes(partialNotice));
  assert.match(html, /カロリー収支は未計算/);
});

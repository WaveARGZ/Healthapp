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
import { compareWeightEntriesNewest, isBodyWeightKg, latestWeightEntry } from "../lib/utils/current-weight.ts";

// Actual aggregation, parent prop wiring, and rendered shared component, using
// synthetic records in RAM. No account, browser storage, network, or file writes.
const root = new URL("../", import.meta.url);
const day = "2026-11-15";
const known = { recordedAt: day, calories: 500, proteinG: 20, fatG: 10, carbsG: 80 };
const empty = { recordedAt: day };
const partialNotice = "カロリーと収支は入力済み分で計算しています。未入力の料理・食事は含みません。";
const macroNotice = "PFCは入力済み分の合計です。未入力の栄養素は含みません。";

function load(relativePath, modules, globals = {}) {
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
    ...globals,
  });
  return exports;
}

const sharedModules = { "react/jsx-runtime": jsxRuntime, "next/link": { default: "a" } };
const { PersonalNutritionGuide } = load("components/dashboard/personal-nutrition-guide.tsx", sharedModules);
const { MobileDashboard } = load("components/dashboard/mobile-dashboard.tsx", {
  ...sharedModules,
  "@/components/dashboard/anatomy-figure": { AnatomyFigure: () => null },
  "@/components/dashboard/personal-nutrition-guide": { PersonalNutritionGuide },
  // Nutrition rendering is isolated from the separately tested, opt-in API panel.
  "@/components/dashboard/home-advice-card": { HomeAdviceCard: () => null },
  "@/lib/workouts/muscle-activity": { summarizeMuscleActivity: () => ({}) },
  "@/lib/utils/daily-burn": { burnMinusIntake },
  "@/lib/utils/daily-calorie-guide": { estimateDailyCalorieGuide, estimateDailyMacroGuide },
});
function renderDashboard(meals, { loading = false, mealUnavailable = false, burnUnavailable = false, profile = null,
  weights = [], weightsUnavailable = false, burns = [{ performedAt: day, caloriesBurned: 2000 }] } = {}) {
  const data = { profile, workouts: [], meals, weights, weightsUnavailable, burns };
  const states = [data, loading, false, mealUnavailable, false, burnUnavailable, day];
  let stateIndex = 0;
  const { DashboardContent } = load("components/dashboard/dashboard-content.tsx", {
    ...sharedModules,
    react: { useState: () => [states[stateIndex++], () => {}], useEffect() {}, useMemo: (callback) => callback() },
    "@/components/dashboard/mobile-dashboard": { MobileDashboard },
    "@/components/dashboard/weekly-review": { WeeklyReview: () => null },
    "@/lib/api/client": { bodyMakeClient: {} },
    "@/lib/utils/current-weight": { isBodyWeightKg, latestWeightEntry },
    "@/lib/utils/daily-burn": { totalDailyBurn },
    "@/lib/utils/daily-calorie-guide": { estimateRestingCalories },
    "@/lib/utils/date": { formatToday: () => day, toDateInputValue: () => day },
    "@/lib/utils/meal-calories": { summarizeDailyCalories },
    "@/lib/utils/meal-macros": { summarizeDailyMacros },
    "@/lib/utils/daily-feedback": { summarizeDailyFeedback: () => ({ meal: { href: "/meals", title: "" }, workout: { href: "/workouts", title: "" } }) },
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

test("calorie balance shows the sign, amount, and which side is larger", () => {
  assert.match(renderDashboard([{ ...known, calories: 2500 }]), /消費から摂取を引いた収支 -500 kcal。摂取が多い/);
  assert.match(renderDashboard([{ ...known, calories: 2000 }]), /消費から摂取を引いた収支 0 kcal。消費と摂取が同じ/);
});

test("missing meal calories are explained beside the subtotal and balance, including for screen readers", () => {
  // Complete PFC does not imply complete calories.
  const html = renderDashboard([known, { ...known, calories: undefined }]);
  assert.match(html, /摂取 500 kcal/);
  assert.match(html, /消費から摂取を引いた収支 \+1,500 kcal。消費が多い/);
  assert.ok(html.includes(partialNotice));
  assert.ok(!html.includes(macroNotice));
  assert.equal((html.match(/aria-describedby="mobile-calorie-status(?: mobile-balance-note)?"/g) ?? []).length, 2);
});

test("partially entered dishes within a meal retain the calorie warning", () => {
  const html = renderDashboard([{ ...known, items: [known, empty] }]);
  assert.ok(html.includes(partialNotice));
  assert.ok(html.includes(macroNotice));
});

test("all unknown calories and PFC remain unknown, not zero or a complete balance", () => {
  const html = renderDashboard([empty]);
  assert.match(html, /摂取 — kcal/);
  assert.match(html, /消費から摂取を引いた収支 — kcal。収支は未計算/);
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
  assert.match(html, /消費から摂取を引いた収支 — kcal。収支は未計算/);
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

test("actual intake and PFC appear beside daily targets; burn estimate is distinguished from the record", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  const html = renderDashboard([known], { profile });
  assert.match(html, /摂取/);
  assert.match(html, /500/);
  assert.match(html, /1日の目安/);
  assert.match(html, /2,400～2,700/);
  assert.match(html, /目安：120～135 g/);
  assert.match(html, /20g.*目安上限比 15%/);
  assert.match(html, /※基礎代謝の値を考慮した数値です/);
  assert.match(html, /活動による消費の推定/);
  assert.match(html, /650～1,000/);
  assert.match(html, /活動による消費の推定/);
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
  const html = renderDashboard([known], { profile });
  assert.match(html, /基礎代謝/);
  assert.match(html, /1,600/);
  assert.match(html, /2,250～2,600/);
  assert.match(html, /運動だけで消費すべき量ではありません/);
});

test("personal guide requests missing profile details instead of inventing calorie targets", () => {
  const html = renderDashboard([known]);
  assert.match(html, /年齢・身長・体重を登録すると/);
  assert.ok(!html.includes("総消費"));
});

test("the same latest measurement drives the calorie target and resting estimate without displaying weight or goal", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  const weights = [
    { measuredOn: "2026-11-14", createdAt: "2026-11-15T13:00:00.000Z", weightKg: 94 },
    { measuredOn: day, createdAt: "2026-11-15T12:00:00.000Z", weightKg: 82 },
    { measuredOn: day, createdAt: "2026-11-15T08:00:00.000Z", weightKg: 75 },
    { measuredOn: "2026-11-16", createdAt: "2026-11-15T10:00:00.000Z", weightKg: 105 },
  ];
  const html = renderDashboard([known], { profile, weights });
  assert.match(html, /1日の摂取目安.*2,550～2,900 kcal/);
  assert.match(html, /基礎代謝 <span[^>]*>1,750 kcal/);
  assert.doesNotMatch(html, />82\s*kg|筋肉を増やす|目標：/);

  const afterDeletion = renderDashboard([known], { profile, weights: weights.slice(2) });
  assert.match(afterDeletion, /1日の摂取目安.*2,450～2,800 kcal/);
  assert.match(afterDeletion, /基礎代謝 <span[^>]*>1,650 kcal/);
});

test("an unavailable weight log is distinguished from a user with no weight entries", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  const html = renderDashboard([known], { profile, weightsUnavailable: true });
  assert.match(html, /体重記録を読み込めないため、目安を表示できません/);
  assert.doesNotMatch(html, /aria-label="今日の摂取カロリー"|基礎代謝 <span/);
});

test("unavailable burn records do not hide the partial-intake warning or invent a balance", () => {
  const html = renderDashboard([known, empty], { burnUnavailable: true });
  assert.ok(html.includes(partialNotice));
  assert.match(html, /消費から摂取を引いた収支 — kcal。収支は未計算/);
});

test("the daily balance adds resting expenditure using the latest weight only for activity readings", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 70, goal: "build-muscle" };
  const weights = [{ measuredOn: day, weightKg: 82 }];
  const activity = { performedAt: day, caloriesBurned: 400, burnScope: "activity" };
  const meals = [{ ...known, calories: 1800 }];
  const html = renderDashboard(meals, { profile, weights, burns: [activity] });
  assert.match(html, /収支 \+338 kcal。消費が多い/);
  assert.match(html, /style="color:#4d6875">\+338/);
  assert.match(html, /※基礎代謝の値を考慮した数値です/);

  const legacy = renderDashboard(meals, { profile, weights, burns: [{ ...activity, caloriesBurned: 2000, burnScope: undefined }] });
  assert.match(legacy, /収支 \+200 kcal。消費が多い/);

  const restingOnly = renderDashboard(meals, { profile, weights, burns: [] });
  assert.match(restingOnly, /収支 -62 kcal。摂取が多い/);
  assert.match(restingOnly, /style="color:#9c5149">-62/);
  assert.match(restingOnly, /活動消費は未記録です/);

  const missingProfile = renderDashboard(meals, { burns: [activity] });
  assert.match(missingProfile, /基礎代謝を推定できないため、収支は未計算です/);
  const missingWeights = renderDashboard(meals, { profile, weightsUnavailable: true, burns: [activity] });
  assert.match(missingWeights, /収支 — kcal。収支は未計算/);
});

test("editing the initial weight updates calorie, PFC and resting targets when there is no measurement", () => {
  const profile = { age: 30, gender: "male", heightCm: 170, startingWeightKg: 82, goal: "build-muscle" };
  const meals = [{ ...known, calories: 1800 }];
  const burns = [{ performedAt: day, caloriesBurned: 400, burnScope: "activity" }];
  const html = renderDashboard(meals, { profile, burns });
  assert.match(html, /1日の摂取目安.*2,550～2,900 kcal/);
  assert.match(html, /目安：130～145 g/);
  assert.match(html, /基礎代謝 <span[^>]*>1,750 kcal/);
  assert.match(html, /収支 \+338 kcal/);
});

test("progress shows the initial weight as an undated reference and compares the latest measurement to it", () => {
  let history = { entries: [], startingWeightKg: 72, today: day, loading: false, weightsUnavailable: false, profileUnavailable: false };
  const date = { formatDate: (value) => value };
  const { WeightTrendChart } = load("components/progress/weight-trend-chart.tsx", {
    ...sharedModules, "@/lib/utils/date": date, "@/components/ui/empty-state": { EmptyState: () => null },
  });
  const { ProgressOverview } = load("components/progress/progress-overview.tsx", {
    ...sharedModules, "@/lib/utils/date": date, "@/components/ui/icon": { Icon: () => null },
    "@/components/ui/page-header": { PageHeader: () => null }, "@/components/progress/weight-trend-chart": { WeightTrendChart },
    "@/hooks/use-weight-history": { useWeightHistory: () => history }, "@/lib/utils/current-weight": { isBodyWeightKg },
  });
  const initial = renderToStaticMarkup(ProgressOverview());
  assert.match(initial, /初期設定の体重/);
  assert.match(initial, /体重の変化。初期設定、72キログラム/);
  assert.doesNotMatch(initial, /初期設定、72キログラム。2026|数値を一覧で見る/);

  history = { ...history, entries: [
    { id: "future", measuredOn: "2026-11-16", createdAt: "2026-11-15T10:00:00Z", weightKg: 95 },
    { id: "recorded", measuredOn: day, createdAt: "2026-11-15T09:00:00Z", weightKg: 70.5 },
  ] };
  const measured = renderToStaticMarkup(ProgressOverview());
  assert.match(measured, /初期設定、72キログラム。2026-11-15、70.5キログラム/);
  assert.match(measured, /-1\.5<span[^>]*>kg/);
  assert.match(measured, /初期設定から/);
  assert.doesNotMatch(measured, /95キログラム/);
});

test("weight screens reload both the initial setting and measurements after returning or saving", async () => {
  const listeners = new Map();
  const events = {
    addEventListener: (event, handler) => listeners.set(event, handler),
    removeEventListener: (event) => listeners.delete(event),
  };
  let history;
  let mount;
  let initialWeight = 72;
  let entries = [];
  const { useWeightHistory } = load("hooks/use-weight-history.ts", {
    react: {
      useState: (initialize) => [history = initialize(), (update) => { history = update(history); }],
      useRef: (current) => ({ current }), useCallback: (callback) => callback,
      useEffect: (effect) => { mount = effect; },
    },
    "@/lib/utils/current-weight": { compareWeightEntriesNewest, isBodyWeightKg },
    "@/lib/utils/date": { toDateInputValue: () => day },
    "@/lib/api/client": { bodyMakeClient: { getProfile: async () => ({ startingWeightKg: initialWeight }), getWeightEntries: async () => entries } },
  }, { window: events, document: { ...events, visibilityState: "visible" } });
  const { refresh } = useWeightHistory();
  const unmount = mount();
  await new Promise(setImmediate);
  assert.equal(history.startingWeightKg, 72);
  assert.equal(history.loading, false);
  initialWeight = 71;
  listeners.get("focus")();
  await new Promise(setImmediate);
  assert.equal(history.startingWeightKg, 71);
  entries = [{ id: "new", measuredOn: day, weightKg: 70.5 }];
  await refresh();
  assert.equal(latestWeightEntry(history.entries, day).weightKg, 70.5);
  unmount();
  assert.equal(listeners.size, 0);
});

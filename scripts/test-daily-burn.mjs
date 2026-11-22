import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { validateRecord } from "../backend/domain.mjs";
import { burnMinusIntake, dailyBurnId, splitWorkoutRecords, totalDailyBurn } from "../lib/utils/daily-burn.ts";

test("daily burn records stay separate from workout sessions", () => {
  const workout = { id: "workout-one", performedAt: "2026-11-03", createdAt: "2026-11-03T12:00:00Z", exercises: [{ id: "exercise-one", name: "チェストプレス" }] };
  const burn = { id: dailyBurnId("2026-11-03"), performedAt: "2026-11-03", createdAt: "2026-11-03T13:00:00Z", recordType: "daily-burn", caloriesBurned: 2200, exercises: [] };
  const malformedBurn = { ...burn, caloriesBurned: Number.NaN };
  assert.equal(validateRecord("workouts", burn.id, burn, "test-subject"), burn);
  assert.deepEqual(splitWorkoutRecords([workout, burn]), { workouts: [workout], burns: [burn] });
  assert.deepEqual(splitWorkoutRecords([workout, malformedBurn]), { workouts: [workout], burns: [] });
});

test("consumption is subtracted only when both amounts are known", () => {
  assert.equal(burnMinusIntake(2400, 2000), 400);
  assert.equal(burnMinusIntake(1800, 2000), -200);
  assert.equal(burnMinusIntake(0, 2000), -2000);
  assert.equal(burnMinusIntake(null, 2000), null);
  assert.equal(burnMinusIntake(2200, null), null);
});

test("the burn form accepts only activity calories and never reuses a saved total as activity", async () => {
  const day = "2026-11-23";
  const previous = { id: dailyBurnId(day), performedAt: day, recordType: "daily-burn", caloriesBurned: 2200, exercises: [], createdAt: "2026-11-23T12:00:00Z" };
  const saved = [];
  const exports = {};
  const compiled = ts.transpileModule(readFileSync(new URL("../components/workouts/daily-burn-recorder.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let states;
  const modules = {
    react: { useState: () => [states.shift(), () => {}], useEffect() {} },
    "react/jsx-runtime": jsxRuntime,
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/form-fields": { FieldLabel: "label", TextInput: "input" },
    "@/lib/api/client": { bodyMakeClient: { saveDailyBurnEntry: async (entry) => saved.push(entry) } },
    "@/lib/utils/daily-burn": { dailyBurnId },
    "@/lib/utils/date": { formatDate: () => day },
  };
  vm.runInNewContext(compiled, { exports, require: (module) => modules[module] });

  function find(node, type) {
    if (Array.isArray(node)) return node.map((item) => find(item, type)).find(Boolean);
    if (!node || typeof node !== "object") return undefined;
    return node.type === type ? node : find(node.props.children, type);
  }
  function render(entry, draft = null) {
    states = [draft, [entry], false, false, false, null];
    return exports.DailyBurnRecorder({ day });
  }
  function submit(tree) {
    return find(tree, "form").props.onSubmit({ preventDefault() {} });
  }

  const legacyForm = render(previous);
  assert.equal(find(legacyForm, "select"), undefined);
  assert.equal(find(legacyForm, "input").props.value, "");
  await submit(legacyForm);
  assert.equal(saved.length, 0);
  assert.equal(totalDailyBurn(previous, 1600), 2200);

  await submit(render(previous, { day, value: "400" }));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].burnScope, "activity");
  assert.equal(saved[0].caloriesBurned, 400);
  assert.equal(saved[0].createdAt, previous.createdAt);
  assert.equal(find(render(saved[0]), "input").props.value, "400");
  assert.equal(burnMinusIntake(totalDailyBurn(saved[0], 1600), 1800), 200);
});

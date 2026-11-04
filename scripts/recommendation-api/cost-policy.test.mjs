import assert from "node:assert/strict";
import test from "node:test";
import { getProductionCostPolicy } from "./cost-policy.ts";

const checked = "2026-11-04T06:00:00.000Z";
const now = Date.parse(checked);
test("production pricing is disabled without an explicit fresh verification", () => {
  for (const value of [undefined, "", "true", "2026-11-04", "2026-02-31T00:00:00.000Z"]) {
    assert.throws(() => getProductionCostPolicy({ BODYMAKE_PRICING_VERIFIED_AT: value }, now), /pricing_/);
  }
});
test("future, expired and invalid clocks cannot authorize spending", () => {
  for (const clock of [now - 1, now + 86400000, now + 86400001, NaN, Infinity]) {
    assert.throws(() => getProductionCostPolicy({ BODYMAKE_PRICING_VERIFIED_AT: checked }, clock), /pricing_verification_expired/);
  }
});
test("fixed policy covers full model context, cache write, long context and output", () => {
  const policy = getProductionCostPolicy({ BODYMAKE_PRICING_VERIFIED_AT: checked }, now + 86399999);
  assert.deepEqual(policy, { model: "gpt-5.6-luna", maximumInputTokens: 922000, maxOutputTokens: 400, upperBoundMicros: 500000,
    timeoutMs: 20000, serviceTier: "default", reasoningEffort: "none" });
  assert.ok(policy.upperBoundMicros >= 922000 * .20 * 1.25 * 2 + 400 * 1.20 * 1.5);
  assert.equal(Math.floor(5000000 / policy.upperBoundMicros), 10);
});

import assert from "node:assert/strict";
import test from "node:test";
import { assessFreeTierUsage } from "../free-tier-guard.js";

test("keeps the API available when Free Tier usage has not been reported yet", () => {
  assert.equal(assessFreeTierUsage([]).stop, false);
});

test("stops when Free Tier data is invalid", () => {
  assert.equal(assessFreeTierUsage(null).stop, true);
});

test("stops before an offer reaches its limit", () => {
  assert.equal(assessFreeTierUsage([
    { service: "AWS Lambda", limit: 100, actualUsageAmount: 80, forecastedUsageAmount: 70 },
  ]).stop, true);
});

test("stops when forecast usage reaches the threshold", () => {
  assert.equal(assessFreeTierUsage([
    { service: "AWS Lambda", limit: 100, actualUsageAmount: 20, forecastedUsageAmount: 81 },
  ]).stop, true);
});

test("keeps the API available below the threshold", () => {
  assert.equal(assessFreeTierUsage([
    { service: "AWS Lambda", limit: 100, actualUsageAmount: 20, forecastedUsageAmount: 70 },
  ]).stop, false);
});

test("fails closed for invalid Free Tier data", () => {
  assert.equal(assessFreeTierUsage([
    { service: "AWS Lambda", limit: 0, actualUsageAmount: 0 },
  ]).stop, true);
});

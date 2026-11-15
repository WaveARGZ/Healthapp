import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("checked-in Cloudflare configuration is an inactive, SQLite-only preparation deployment", () => {
  const config = JSON.parse(readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.name, "bodymake-recommendation-api");
  assert.equal(config.account_id, "f20582cb2543f13f263b9ebc6917e700");
  assert.equal(config.main, "cloudflare-worker.ts");
  assert.deepEqual(config.vars, { BODYMAKE_RECOMMENDATION_API_ENABLED: "false" });
  assert.deepEqual(config.observability, { enabled: false });
  assert.equal(config.preview_urls, false);
  assert.equal(config.send_metrics, false);
  assert.equal(config.workers_dev, true);
  assert.deepEqual(config.durable_objects.bindings, [
    { name: "RECOMMENDATION_BUDGET", class_name: "BodyMakeRecommendationBudget" },
  ]);
  assert.deepEqual(config.migrations, [{ tag: "lifetime-usd5-v1", new_sqlite_classes: ["BodyMakeRecommendationBudget"] }]);
  for (const field of ["env", "routes", "route", "triggers", "queues", "ai", "r2_buckets", "kv_namespaces", "d1_databases", "containers", "tail_consumers"]) {
    assert.equal(config[field], undefined, field);
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { createDriveModelCache } from "./model-cache.mjs";

test("model cache reuses verified RAM bytes but returns independent responses", async () => {
  let reads = 0;
  const cache = createDriveModelCache({ cacheUrl: (x) => x, cacheToken: "test", fetchImpl: async () => {
    reads++; return new Response("asset");
  }});
  const [a, b] = await Promise.all([cache.match("a"), cache.match("a")]);
  assert.equal(await a.text(), "asset"); assert.equal(await b.text(), "asset");
  assert.equal(await (await cache.match("a")).text(), "asset"); assert.equal(reads, 1);
  cache.clear(); await cache.match("a"); assert.equal(reads, 2);
});

test("model cache uses only confirmed upload bytes and evicts within RAM bound", async () => {
  let reads = 0, writes = 0;
  const cache = createDriveModelCache({ cacheUrl: (x) => x, cacheToken: "test", maxBytes: 5,
    fetchImpl: async (_, options) => {
      if (options.method === "PUT") { writes++; return new Response("ok"); }
      reads++; return new Response("abcde");
    }});
  await cache.put("a", new Response("abcde"));
  assert.equal(await (await cache.match("a")).text(), "abcde"); assert.equal(reads, 0);
  await cache.match("b"); await cache.match("a"); assert.equal(reads, 2); assert.equal(writes, 1);
});

test("model cache refuses oversized bodies and never treats errors as saved", async () => {
  let requests = 0;
  const cache = createDriveModelCache({ cacheUrl: (x) => x, cacheToken: "test", maxBytes: 3,
    fetchImpl: async () => { requests++; return new Response("abcde"); }});
  await assert.rejects(cache.match("a"), /RAM limit/);
  await assert.rejects(cache.match("a"), /RAM limit/); assert.equal(requests, 2);
  const failed = createDriveModelCache({ cacheUrl: (x) => x, cacheToken: "test",
    fetchImpl: async (_, options) => new Response("fail", { status: options.method === "PUT" ? 502 : 404 }) });
  await assert.rejects(failed.put("a", new Response("ok")), /write failed/);
  assert.equal(await failed.match("a"), undefined);
});

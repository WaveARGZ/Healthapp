import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireLock, inputFingerprint, writeJsonAtomic, readJson } from "./agent-utils.mjs";

test("同じプロセスでも重複サイクルを防ぎ、解放後に再実行できる", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bodymake-agent-lock-"));
  try {
    const file = path.join(directory, "agent.lock.json");
    const release = await acquireLock(file);
    assert.equal(typeof release, "function");
    assert.equal(await acquireLock(file), null);
    await release();
    const nextRelease = await acquireLock(file);
    assert.equal(typeof nextRelease, "function");
    // An old run cannot remove the next run's lock.
    await release();
    assert.equal(await acquireLock(file), null);
    await nextRelease();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("写真、正解、学習コードの変更を検出し、収集レポート時刻は無視する", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bodymake-agent-input-"));
  try {
    const data = path.join(directory, "data");
    await mkdir(data);
    const code = path.join(directory, "learn.mjs");
    await writeFile(code, "version 1");
    await writeFile(path.join(data, "a.jpg"), "pixels");
    await writeJsonAtomic(path.join(data, "a.json"), { label: "rice" });
    const first = await inputFingerprint(data, [code]);
    await writeJsonAtomic(path.join(data, "collection-summary.json"), { now: Date.now() });
    assert.equal(await inputFingerprint(data, [code]), first);
    await writeJsonAtomic(path.join(data, "a.json"), { label: "soup" });
    const corrected = await inputFingerprint(data, [code]);
    assert.notEqual(corrected, first);
    await writeFile(path.join(data, "a.jpg"), "other pixels");
    const photoChanged = await inputFingerprint(data, [code]);
    assert.notEqual(photoChanged, corrected);
    await writeFile(code, "version 2");
    assert.notEqual(await inputFingerprint(data, [code]), photoChanged);
    assert.deepEqual(await readJson(path.join(data, "a.json")), { label: "soup" });
    await writeFile(path.join(data, "a.json"), "broken json");
    await assert.rejects(readJson(path.join(data, "a.json"), {}));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("中断ロックを同時回復しても取得できるサイクルは1つだけ", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bodymake-agent-recovery-"));
  try {
    const file = path.join(directory, "agent.lock.json");
    // This PID is outside the OS process ID range on supported local hosts.
    await writeJsonAtomic(file, { pid: 2147483647, token: "stale" });
    const locks = await Promise.all(Array.from({ length: 8 }, () => acquireLock(file)));
    const owners = locks.filter(Boolean);
    assert.equal(owners.length, 1);
    assert.equal(await acquireLock(file), null);
    await owners[0]();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

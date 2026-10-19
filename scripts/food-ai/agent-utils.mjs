import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

export async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

export async function fileHash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}

// Hash actual image contents, reviews, and training code, not just timestamps.
export async function inputFingerprint(dataDir, codeFiles = []) {
  const files = (await readdir(dataDir)).filter((name) => /\.(json|jpe?g|png)$/i.test(name) &&
    !["sources.json", "collection-summary.json", "collect-state.json", "collection-state.json", "split-registry.json"].includes(name)).sort();
  const digest = createHash("sha256");
  digest.update(JSON.stringify({ node: process.versions.node, platform: process.platform, arch: process.arch }));
  for (const name of files) digest.update(`${name}\0${await fileHash(path.join(dataDir, name))}\n`);
  for (const file of codeFiles) {
    try { digest.update(`${file}\0${await fileHash(file)}\n`); }
    catch (error) { if (error.code !== "ENOENT") throw error; digest.update(`${file}\0missing\n`); }
  }
  return digest.digest("hex");
}

async function claimLock(file, owner) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(owner), { flag: "wx" });
  try { await link(temporary, file); }
  finally { await unlink(temporary); }
}

function ownerIsAlive(owner) {
  if (!owner || !Number.isInteger(owner.pid) || owner.pid < 1) throw new Error("ロック情報が不正です");
  try { process.kill(owner.pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; return true; }
}

export async function acquireLock(file) {
  await mkdir(path.dirname(file), { recursive: true });
  const owner = { pid: process.pid, token: randomUUID(), startedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      // A hard link publishes complete JSON atomically without replacing a lock.
      await claimLock(file, owner);
      return async () => {
        const current = await readJson(file, null);
        if (current?.token === owner.token) await unlink(file);
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const existing = await readJson(file, null);
      if (!existing) continue;
      if (ownerIsAlive(existing)) return null;
      const recoveryFile = `${file}.recovery`;
      try { await claimLock(recoveryFile, owner); }
      catch (recoveryError) {
        if (recoveryError.code !== "EEXIST") throw recoveryError;
        const recovering = await readJson(recoveryFile, null);
        if (recovering && !ownerIsAlive(recovering)) throw new Error(`中断されたロック回復を確認してください: ${recoveryFile}`);
        return null;
      }
      try {
        // Another process may have acquired the main lock since the first read.
        const current = await readJson(file, null);
        if (current && ownerIsAlive(current)) return null;
        if (current) await rename(file, `${file}.stale-${randomUUID()}`);
      } finally {
        await unlink(recoveryFile);
      }
    }
  }
  return null;
}

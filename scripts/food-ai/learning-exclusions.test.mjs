import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { digest } from "./dataset-splits.mjs";
import { matchLearningExclusion, validateLearningExclusions } from "./learning-exclusions.mjs";

const script = fileURLToPath(new URL("./learn.mjs", import.meta.url));
const entry = (imageSha256 = "a".repeat(64)) => ({
  id: "sample-a", imageSha256, reason: "Fixture scene occurs in multiple historical splits.",
  reviewer: "Test fixture", reviewedAt: "2026-10-09T02:52:45.000Z",
});
const ledger = (items = [entry()]) => ({ schemaVersion: 1, exclusions: items });

test("an exclusion requires the exact reviewed ID and hash", () => {
  const exclusions = validateLearningExclusions(ledger());
  assert.deepEqual(matchLearningExclusion(exclusions, "sample-a", "a".repeat(64)), entry());
  assert.equal(matchLearningExclusion(exclusions, "other-id", "a".repeat(64)), null);
  assert.throws(() => matchLearningExclusion(exclusions, "sample-a", "b".repeat(64)), /ハッシュが一致しません/);
});

test("malformed, duplicate or incomplete exclusion decisions fail closed", () => {
  for (const value of [null, [], {}, { ...ledger(), schemaVersion: 2 }, { ...ledger(), extra: true },
    ledger([entry(), entry()]), ledger([{ ...entry(), id: "../sample-a" }]),
    ledger([{ ...entry(), imageSha256: "invalid" }]), ledger([{ ...entry(), reason: " " }]),
    ledger([{ ...entry(), reviewer: "" }]), ledger([{ ...entry(), reviewedAt: "2026-02-30T00:00:00.000Z" }]),
    ledger([{ ...entry(), reviewedAt: "not a date" }]), ledger([{ ...entry(), extra: true }]),
  ]) assert.throws(() => validateLearningExclusions(value), /学習除外台帳/);
  assert.deepEqual(validateLearningExclusions(ledger([])), ledger([]));
});

async function fixture(context) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "bodymake-exclusions-test-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const data = path.join(temporary, "data");
  await mkdir(data);
  const bytes = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 40, g: 150, b: 60 } } }).png().toBuffer();
  const hash = digest(bytes);
  const metadata = { schemaVersion: 1, id: "sample-a", confirmedFoodId: "natto", confirmedFoodName: "納豆", labelVerified: true,
    review: { method: "human", reviewer: "Test fixture", reviewedAt: entry().reviewedAt, imageSha256: hash } };
  await writeFile(path.join(data, "sample-a.png"), bytes);
  await writeFile(path.join(data, "sample-a.json"), JSON.stringify(metadata));
  const registryFile = path.join(temporary, "splits.json");
  const registry = { schemaVersion: 1, id: "fixture-history", assignments: {
    [hash]: { split: "train", label: "natto", dhash: "f".repeat(16) },
    ["b".repeat(64)]: { split: "test", label: "rice", dhash: "0".repeat(16) },
  } };
  const registryText = `${JSON.stringify(registry, null, 2)}\n`;
  await writeFile(registryFile, registryText);
  const exclusionsFile = path.join(temporary, "exclusions.json");
  await writeFile(exclusionsFile, JSON.stringify(ledger([entry(hash)])));
  const deployment = path.join(temporary, "model.json");
  const modelText = JSON.stringify({ schemaVersion: 1, status: "baseline", baseModel: "Xenova/clip-vit-base-patch32" });
  await writeFile(deployment, modelText);
  const run = (artifacts, extra = []) => spawnSync(process.execPath, [script, "--data", data, "--artifacts", artifacts,
    "--split-registry", registryFile, "--deployment", deployment, "--exclusions", exclusionsFile, ...extra], { encoding: "utf8" });
  return { temporary, data, bytes, hash, metadata, registryFile, registryText, exclusionsFile, deployment, modelText, run };
}

test("matched scene exclusions skip verified and research learning while preserving historical assignments and source files", async (context) => {
  const f = await fixture(context);
  for (const research of [false, true]) {
    const artifacts = path.join(f.temporary, research ? "research" : "verified");
    const result = f.run(artifacts, research ? ["--allow-unreviewed"] : ["--promote"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(path.join(artifacts, "evaluation.json"), "utf8"));
    assert.equal(report.excludedImages, 1);
    assert.deepEqual(report.exclusions, [{ ...entry(f.hash), imageName: "sample-a.png" }]);
    assert.match(report.exclusionsFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(report.validImages, 0);
    assert.equal(report.independentlyReviewedImages, 0);
    assert.equal(report.promoted, false);
    assert.ok(Object.values(report.splits).every((split) => split.total === 0));
    assert.match(await readFile(path.join(artifacts, "review.csv"), "utf8"), /sample-a.*学習と評価から除外.*Fixture scene/);
    assert.equal(await readFile(f.registryFile, "utf8"), f.registryText);
    assert.equal(await readFile(f.deployment, "utf8"), f.modelText);
    assert.deepEqual(await readFile(path.join(f.data, "sample-a.png")), f.bytes);
    assert.deepEqual(JSON.parse(await readFile(path.join(f.data, "sample-a.json"), "utf8")), f.metadata);
    await assert.rejects(access(path.join(artifacts, "candidate-calibration.json")), { code: "ENOENT" });
  }
});

test("hash mismatch stops the CLI before training, reports or split writes", async (context) => {
  const f = await fixture(context);
  await writeFile(f.exclusionsFile, JSON.stringify(ledger([entry("c".repeat(64))])));
  const artifacts = path.join(f.temporary, "mismatch");
  const result = f.run(artifacts, ["--promote"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /除外指定の写真ハッシュが一致しません: sample-a/);
  assert.equal(await readFile(f.registryFile, "utf8"), f.registryText);
  assert.equal(await readFile(f.deployment, "utf8"), f.modelText);
  await assert.rejects(access(path.join(artifacts, "evaluation.json")), { code: "ENOENT" });
  await assert.rejects(access(`${f.registryFile}.lock`), { code: "ENOENT" });
});

test("invalid exclusion schema and missing explicit override cannot silently disable exclusions", async (context) => {
  const f = await fixture(context);
  await writeFile(f.exclusionsFile, JSON.stringify({ schemaVersion: 1, exclusions: [{ id: "sample-a" }] }));
  const invalid = f.run(path.join(f.temporary, "invalid"), ["--prepare-only"]);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /学習除外台帳/);
  await rm(f.exclusionsFile);
  const missing = f.run(path.join(f.temporary, "missing"), ["--prepare-only"]);
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /ENOENT/);
  assert.equal(await readFile(f.registryFile, "utf8"), f.registryText);
  assert.equal(await readFile(f.deployment, "utf8"), f.modelText);
});

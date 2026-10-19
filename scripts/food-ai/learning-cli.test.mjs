import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("./learn.mjs", import.meta.url));

test("収集メタデータを写真と誤認せず、データ不足を報告して既存モデルを維持", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "bodymake-learning-test-"));
  try {
    const data = path.join(temporary, "data");
    const artifacts = path.join(temporary, "run");
    const deployment = path.join(temporary, "test-model.json");
    await mkdir(data);
    await writeFile(path.join(data, "collection-summary.json"), JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString() }));
    await writeFile(path.join(data, "collect-state.json"), JSON.stringify({ cursor: "page2" }));
    await writeFile(path.join(data, "sample.json"), JSON.stringify({ schemaVersion: 1, id: "sample", confirmedFoodName: "ご飯", confirmedFoodId: "rice" }));
    const original = JSON.stringify({ schemaVersion: 1, status: "baseline", baseModel: "Xenova/clip-vit-base-patch32" });
    await writeFile(deployment, original);
    const result = spawnSync(process.execPath, [script, "--data", data, "--artifacts", artifacts, "--deployment", deployment, "--promote"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(await readFile(path.join(artifacts, "evaluation.json"), "utf8"));
    assert.equal(report.status, "insufficient-data");
    assert.equal(report.inspectedRecords, 1);
    assert.equal(report.reviewCount, 1);
    assert.equal(report.promoted, false);
    assert.equal(report.independentlyReviewedImages, 0);
    assert.match(report.datasetFingerprint, /^[a-f0-9]{64}$/);
    assert.equal(await readFile(deployment, "utf8"), original);
    await assert.rejects(access(path.join(data, "split-registry.json.lock")), { code: "ENOENT" });

    const researchPromotion = spawnSync(process.execPath, [script, "--data", data, "--artifacts", artifacts, "--deployment", deployment, "--promote", "--allow-unreviewed"], { encoding: "utf8" });
    assert.notEqual(researchPromotion.status, 0);
    assert.match(researchPromotion.stderr, /仮ラベルの実験はモデルに反映できません/);
    assert.equal(await readFile(deployment, "utf8"), original);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

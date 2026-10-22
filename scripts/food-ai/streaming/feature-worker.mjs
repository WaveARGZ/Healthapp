// JSON-lines protocol. Images, model assets, tokens and output never touch the filesystem.
import { createInterface } from "node:readline";
import { pipeline, env, RawImage } from "@huggingface/transformers";
import { CLIP_FEATURE_CONTRACT, extractClipFeatures } from "../../../lib/food-ai/clip-features.mjs";
import { createHash } from "node:crypto";
import { createDriveModelCache } from "./model-cache.mjs";

env.useFSCache = false;
env.useBrowserCache = false;
env.allowLocalModels = false;
env.useCustomCache = true;
env.backends.onnx.wasm.numThreads = 1;
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let classifier;
for await (const line of lines) {
  let operation;
  try {
    const request = JSON.parse(line);
    operation = request.op;
    if (request.op === "init") {
      if (env.version !== CLIP_FEATURE_CONTRACT.transformersVersion) throw new Error("Transformers version mismatch");
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(request.cacheUrl)) throw new Error("Invalid cache bridge");
      const url = (key) => request.cacheUrl + "/cache/" + createHash("sha256").update(String(key)).digest("hex");
      const cache = createDriveModelCache({ cacheUrl: url, cacheToken: request.cacheToken });
      env.customCache = cache;
      try {
        classifier = await pipeline("zero-shot-image-classification", CLIP_FEATURE_CONTRACT.baseModel, {
          revision: CLIP_FEATURE_CONTRACT.baseRevision, dtype: "q4", device: "cpu",
          session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
        });
      } finally { cache.clear(); }
      process.stdout.write(JSON.stringify({ ok: true, contract: CLIP_FEATURE_CONTRACT }) + "\n");
    } else if (request.op === "extract" && classifier) {
      const image = new Blob([Buffer.from(request.image, "base64")], { type: "image/jpeg" });
      const features = await extractClipFeatures(classifier, image, request.labels, RawImage);
      process.stdout.write(JSON.stringify({ ok: true, ...features }) + "\n");
    } else throw new Error("Unknown worker operation");
  } catch (error) {
    // Fixed diagnostic codes only: no remote bodies, URLs, image data or tokens.
    const message = error instanceof Error ? error.message : "";
    const code = /Transformers version mismatch/.test(message) ? "model_contract_mismatch"
      : /Drive cache (read|write) failed/.test(message) ? "model_cache_failed"
      : /Could not locate file|404|not found/i.test(message) ? "model_asset_missing"
      : /fetch failed|network|ECONN|ENOTFOUND|timeout/i.test(message) ? "model_download_failed"
      : operation === "init" ? "model_initialization_failed" : "image_feature_failed";
    process.stdout.write(JSON.stringify({ ok: false, error: code }) + "\n");
  }
}
await classifier?.dispose();

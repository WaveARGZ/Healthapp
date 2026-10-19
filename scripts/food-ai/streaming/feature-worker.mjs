// JSON-lines protocol. Images, model assets, tokens and output never touch the filesystem.
import { createInterface } from "node:readline";
import { pipeline, env, RawImage } from "@huggingface/transformers";
import { CLIP_FEATURE_CONTRACT, extractClipFeatures } from "../../../lib/food-ai/clip-features.mjs";
import { createHash } from "node:crypto";

env.useFSCache = false;
env.useBrowserCache = false;
env.allowLocalModels = false;
env.useCustomCache = true;
env.backends.onnx.wasm.numThreads = 1;
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let classifier;
for await (const line of lines) {
  try {
    const request = JSON.parse(line);
    if (request.op === "init") {
      if (env.version !== CLIP_FEATURE_CONTRACT.transformersVersion) throw new Error("Transformers version mismatch");
      if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(request.cacheUrl)) throw new Error("Invalid cache bridge");
      const headers = { "X-BodyMake-Bridge": request.cacheToken };
      const url = (key) => request.cacheUrl + "/cache/" + createHash("sha256").update(String(key)).digest("hex");
      env.customCache = {
        match: async (key) => {
          const response = await fetch(url(key), { headers });
          if (response.status === 404) return undefined;
          if (!response.ok) throw new Error("Drive cache read failed");
          return response;
        },
        put: async (key, response) => {
          const saved = await fetch(url(key), { method: "PUT", headers, body: await response.arrayBuffer() });
          if (!saved.ok) throw new Error("Drive cache write failed");
        },
      };
      classifier = await pipeline("zero-shot-image-classification", CLIP_FEATURE_CONTRACT.baseModel, {
        revision: CLIP_FEATURE_CONTRACT.baseRevision, dtype: "q4", device: "cpu",
        session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
      });
      process.stdout.write(JSON.stringify({ ok: true, contract: CLIP_FEATURE_CONTRACT }) + "\n");
    } else if (request.op === "extract" && classifier) {
      const image = new Blob([Buffer.from(request.image, "base64")], { type: "image/jpeg" });
      const features = await extractClipFeatures(classifier, image, request.labels, RawImage);
      process.stdout.write(JSON.stringify({ ok: true, ...features }) + "\n");
    } else throw new Error("Unknown worker operation");
  } catch {
    process.stdout.write(JSON.stringify({ ok: false, error: "feature_worker_failed" }) + "\n");
  }
}
await classifier?.dispose();

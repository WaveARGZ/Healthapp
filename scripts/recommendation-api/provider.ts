import { featureNames } from "../../lib/recommendations/catalog.ts";
import type { RecommendationRanking, RecommendationRequest } from "../../lib/recommendations/types.ts";

export class RecommendationApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 502) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export interface ProviderConfig {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
  serviceTier?: "default";
  reasoningEffort?: "none";
  maximumInputTokens?: number;
}
export type RecommendationProvider = (request: RecommendationRequest) => Promise<RecommendationRanking>;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate even strict structured output: no extra prose, duplicate or invented IDs. */
export function validateRanking(value: unknown, request: RecommendationRequest): RecommendationRanking {
  if (!object(value) || Object.keys(value).sort().join(",") !== "mealIds,workoutIds") {
    throw new RecommendationApiError("provider_bad_output");
  }
  const result: RecommendationRanking = { mealIds: [], workoutIds: [] };
  for (const [key, kind] of [["mealIds", "meal"], ["workoutIds", "workout"]] as const) {
    const ids = value[key];
    const allowed = new Set(request.candidates.filter((item) => item.kind === kind).map((item) => item.id));
    if (!Array.isArray(ids) || ids.length > 3 || ids.some((id) => typeof id !== "string" || !allowed.has(id)) || new Set(ids).size !== ids.length) {
      throw new RecommendationApiError("provider_bad_output");
    }
    result[key] = ids.slice();
  }
  return result;
}

function rankingSchema(request: RecommendationRequest) {
  const field = (kind: "meal" | "workout") => {
    const ids = request.candidates.filter((candidate) => candidate.kind === kind).map((candidate) => candidate.id);
    return {
      type: "array", minItems: 0, maxItems: Math.min(ids.length, 3),
      items: ids.length ? { type: "string", enum: ids } : { type: "string" },
    };
  };
  return {
    type: "object", additionalProperties: false, required: ["mealIds", "workoutIds"],
    properties: { mealIds: field("meal"), workoutIds: field("workout") },
  };
}

async function boundedJson(response: Response): Promise<unknown> {
  // Do not trust Content-Length alone or buffer an unbounded upstream response.
  const reader = response.body?.getReader();
  if (!reader) throw new RecommendationApiError("provider_bad_output");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 65_536) {
        await reader.cancel();
        throw new RecommendationApiError("provider_bad_output");
      }
      chunks.push(chunk.value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch (error) {
    if (error instanceof RecommendationApiError) throw error;
    throw new RecommendationApiError("provider_bad_output");
  } finally {
    reader.releaseLock();
  }
}

/** No SDK disk cache, tools, conversation, retries, arbitrary URL, or request logging. */
export function createOpenAIProvider(config: ProviderConfig, fetcher: typeof fetch = fetch): RecommendationProvider {
  return async (request) => {
    if (config.serviceTier && (!Number.isSafeInteger(config.maximumInputTokens) || config.maximumInputTokens! <= 0)) {
      throw new RecommendationApiError("pricing_not_verified", 503);
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetcher("https://api.openai.com/v1/responses", {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          store: false,
          max_output_tokens: config.maxOutputTokens,
          ...(config.serviceTier ? { service_tier: config.serviceTier } : {}),
          ...(config.reasoningEffort ? { reasoning: { effort: config.reasoningEffort } } : {}),
          instructions: [
            "Rank only the supplied eligible meal/workout IDs for a general wellness suggestion.",
            "Return zero to three IDs per kind, best first. Never invent items, nutrition, diagnoses, or exercise prescriptions.",
            "The application has already filtered safety constraints. Do not reintroduce excluded items.",
            "Nutrition null means unknown, not zero. If complete is false, a numeric total is only a partial recorded sum. Do not infer a calorie deficit or require compensatory exercise.",
            `Features in order are ${featureNames.join(", ")}; all are 0 to 1, higher means better match.`,
            "Balance goal match and feasibility with familiarity and recovery. If no suitable candidate exists return an empty list.",
          ].join(" "),
          input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(request) }] }],
          text: { format: { type: "json_schema", name: "bodymake_recommendation_ranking", strict: true, schema: rankingSchema(request) } },
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new RecommendationApiError("provider_failed");
      }
      const data = await boundedJson(response);
      if (!object(data)) throw new RecommendationApiError("provider_bad_output");
      if (config.serviceTier) {
        const usage = data.usage;
        const tokenCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
        if (data.model !== config.model || data.service_tier !== config.serviceTier || !object(usage)
          || !tokenCount(usage.input_tokens) || usage.input_tokens > config.maximumInputTokens!
          || !tokenCount(usage.output_tokens) || usage.output_tokens > config.maxOutputTokens
          || usage.total_tokens !== usage.input_tokens + usage.output_tokens) {
          throw new RecommendationApiError("provider_cost_unconfirmed");
        }
      }
      if (data.status !== "completed") throw new RecommendationApiError("provider_incomplete");
      if (!Array.isArray(data.output)) throw new RecommendationApiError("provider_bad_output");
      const texts: string[] = [];
      for (const item of data.output) {
        if (!object(item)) throw new RecommendationApiError("provider_bad_output");
        // Reasoning metadata is ignored; it is never logged, returned, or used for learning.
        if (item.type === "reasoning") continue;
        if (item.type !== "message" || item.role !== "assistant" || item.status !== "completed" || !Array.isArray(item.content)) {
          throw new RecommendationApiError("provider_bad_output");
        }
        for (const content of item.content) {
          if (!object(content)) throw new RecommendationApiError("provider_bad_output");
          if (content.type === "refusal") throw new RecommendationApiError("provider_refusal");
          if (content.type !== "output_text" || typeof content.text !== "string" || content.text.length > 2048) {
            throw new RecommendationApiError("provider_bad_output");
          }
          texts.push(content.text);
        }
      }
      if (texts.length !== 1) throw new RecommendationApiError("provider_bad_output");
      let parsed: unknown;
      try { parsed = JSON.parse(texts[0]); } catch { throw new RecommendationApiError("provider_bad_output"); }
      return validateRanking(parsed, request);
    } catch (error) {
      if (controller.signal.aborted) throw new RecommendationApiError("provider_timeout", 504);
      if (error instanceof RecommendationApiError) throw error;
      // Never relay provider errors, headers, request bodies, or credentials to the browser.
      throw new RecommendationApiError("provider_failed");
    } finally {
      clearTimeout(timeout);
    }
  };
}

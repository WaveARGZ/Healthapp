import { FreeTierClient, GetFreeTierUsageCommand } from "@aws-sdk/client-freetier";
import { LambdaClient, PutFunctionConcurrencyCommand } from "@aws-sdk/client-lambda";

const freeTier = new FreeTierClient({ region: "us-east-1" });
const lambda = new LambdaClient({});

export function assessFreeTierUsage(usages, thresholdPercent = 80) {
  if (!Array.isArray(usages) || usages.length === 0) {
    return { stop: true, reason: "無料枠の使用状況を取得できませんでした" };
  }

  for (const usage of usages) {
    const limit = Number(usage.limit);
    const actual = Number(usage.actualUsageAmount);
    const forecast = Number(usage.forecastedUsageAmount);
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(actual)) {
      return { stop: true, reason: "無料枠の使用状況に不明な値があります" };
    }

    const highest = Math.max(actual, Number.isFinite(forecast) ? forecast : 0);
    if ((highest / limit) * 100 >= thresholdPercent) {
      return {
        stop: true,
        reason: `${usage.service ?? "AWS"} の無料枠使用率が ${thresholdPercent}% 以上です`,
      };
    }
  }

  return { stop: false, reason: "無料枠の使用率は停止水準未満です" };
}

async function loadAllUsage() {
  const usages = [];
  let nextToken;
  do {
    const result = await freeTier.send(new GetFreeTierUsageCommand({ nextToken, maxResults: 100 }));
    usages.push(...(result.freeTierUsages ?? []));
    nextToken = result.nextToken;
  } while (nextToken);
  return usages;
}

export async function handler(event) {
  const functionName = process.env.API_FUNCTION_NAME;
  if (!functionName) throw new Error("API_FUNCTION_NAME is required");

  let assessment;
  if (event?.Records?.some((record) => record.EventSource === "aws:sns")) {
    assessment = { stop: true, reason: "AWS予算の超過通知を受信しました" };
  } else {
    try {
      assessment = assessFreeTierUsage(
        await loadAllUsage(),
        Number(process.env.STOP_THRESHOLD_PERCENT ?? "80"),
      );
    } catch (error) {
      assessment = { stop: true, reason: `無料枠の確認に失敗しました: ${error.name ?? "UnknownError"}` };
    }
  }

  if (assessment.stop) {
    await lambda.send(new PutFunctionConcurrencyCommand({
      FunctionName: functionName,
      ReservedConcurrentExecutions: 0,
    }));
  }

  console.log(JSON.stringify({ stopped: assessment.stop, reason: assessment.reason }));
  return { stopped: assessment.stop, reason: assessment.reason };
}

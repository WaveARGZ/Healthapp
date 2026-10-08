import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { photoKey, recordKey, recordKinds, userPartition, validateRecord, validateTrainingSignal } from "./domain.mjs";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const s3 = new S3Client({});
const userTable = process.env.USER_TABLE;
const trainingTable = process.env.TRAINING_TABLE;
const photoBucket = process.env.PHOTO_BUCKET;

function json(statusCode, body) {
  return { statusCode, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, body: JSON.stringify(body) };
}
function parseBody(event) {
  const raw = event.isBase64Encoded ? Buffer.from(event.body ?? "", "base64").toString("utf8") : event.body ?? "";
  if (raw.length > 80_000) throw new Error("body_too_large");
  return JSON.parse(raw);
}
function subjectOf(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (claims?.token_use !== "access" || typeof claims?.sub !== "string") throw new Error("unauthorized");
  return claims.sub;
}
async function attachPhotoUrl(record) {
  if (!record?.imageKey) return record;
  const { imageKey, ...fields } = record;
  const imageUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: photoBucket, Key: imageKey }), { expiresIn: 3600 });
  return { ...fields, imageUrl };
}

export async function handler(event) {
  try {
    const subject = subjectOf(event);
    const partition = userPartition(subject);
    const method = event.requestContext?.http?.method;
    const path = event.rawPath ?? "";

    if (path === "/photos/upload" && method === "POST") {
      const request = parseBody(event);
      if (request?.mimeType !== "image/jpeg" || typeof request?.id !== "string") throw new Error("invalid_photo_upload");
      const key = photoKey(subject, request.id);
      const upload = await createPresignedPost(s3, {
        Bucket: photoBucket, Key: key, Expires: 300,
        Fields: { "Content-Type": "image/jpeg" },
        Conditions: [["content-length-range", 1, 2_100_000], ["eq", "$Content-Type", "image/jpeg"]],
      });
      return json(200, { imageKey: key, upload });
    }

    if (path === "/training/signals" && method === "POST") {
      const signal = validateTrainingSignal(parseBody(event));
      await db.send(new PutCommand({ TableName: trainingTable, Item: {
        PK: partition, SK: `SIGNAL#${signal.createdAt}#${signal.id}`, ...signal,
      }, ConditionExpression: "attribute_not_exists(PK) AND attribute_not_exists(SK)" }));
      return json(201, { saved: true });
    }

    const match = /^\/records\/(profile|preferences|workouts|meals|weights|photos)(?:\/([A-Za-z0-9_-]{1,100}))?$/.exec(path);
    if (!match || !recordKinds.has(match[1])) return json(404, { error: "not_found" });
    const [, kind, id] = match;

    if (method === "GET" && !id) {
      if (kind === "profile" || kind === "preferences") {
        const result = await db.send(new GetCommand({ TableName: userTable, Key: { PK: partition, SK: `${kind}#main` } }));
        return json(200, result.Item?.data ?? null);
      }
      const entries = [];
      let cursor;
      do {
        const result = await db.send(new QueryCommand({ TableName: userTable,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: { ":pk": partition, ":prefix": `${kind}#` },
          Limit: 100, ExclusiveStartKey: cursor,
        }));
        entries.push(...(result.Items?.map((item) => item.data) ?? []));
        cursor = result.LastEvaluatedKey;
        if (entries.length > 5000) return json(413, { error: "too_many_records" });
      } while (cursor);
      entries.sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
      return json(200, kind === "photos" ? await Promise.all(entries.map(attachPhotoUrl)) : entries);
    }

    if (method === "PUT" && id) {
      const record = validateRecord(kind, id, parseBody(event), subject);
      await db.send(new PutCommand({ TableName: userTable, Item: { PK: partition, SK: recordKey(kind, id), data: record } }));
      return json(200, kind === "photos" ? await attachPhotoUrl(record) : record);
    }

    if (method === "DELETE" && id && kind !== "profile" && kind !== "preferences") {
      const key = { PK: partition, SK: recordKey(kind, id) };
      await db.send(new DeleteCommand({ TableName: userTable, Key: key }));
      if (kind === "photos") await s3.send(new DeleteObjectCommand({ Bucket: photoBucket, Key: photoKey(subject, id) }));
      return { statusCode: 204, body: "" };
    }
    return json(405, { error: "method_not_allowed" });
  } catch (error) {
    if (error.message === "unauthorized") return json(401, { error: "unauthorized" });
    if (error.name === "ConditionalCheckFailedException") return json(409, { error: "already_exists" });
    if (error instanceof SyntaxError || error.message?.startsWith("invalid_") || error.message === "body_too_large" || error.message === "record_too_large") {
      return json(400, { error: "invalid_request" });
    }
    console.error("BodyMake API failed", error);
    return json(500, { error: "server_error" });
  }
}

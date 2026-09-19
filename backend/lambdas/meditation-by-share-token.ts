/**
 * Public (no auth) lookup by unlisted share_token.
 * Separate code path from authenticated get-by-id / library list.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { meditationPlaybackS3Key } from "./_shared/playback-keys";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
    },
    body: JSON.stringify(payload),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const tableName = process.env.MEDITATION_ANALYTICS_TABLE_NAME;
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!tableName) {
    return json(500, { error: "MEDITATION_ANALYTICS_TABLE_NAME is not set" });
  }

  const token =
    event.pathParameters?.token?.trim() ||
    event.queryStringParameters?.token?.trim() ||
    "";
  if (!token || token.length < 16 || token.length > 64) {
    return json(400, { error: "Invalid token" });
  }

  try {
    const q = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "shareTokenIndex",
        KeyConditionExpression: "shareToken = :t",
        ExpressionAttributeValues: { ":t": token },
        Limit: 1,
      }),
    );
    const row = q.Items?.[0];
    if (!row) {
      return json(404, { error: "Share link not found or revoked" });
    }

    const title =
      (typeof row.title === "string" && row.title.trim()) || "Meditation";
    const description =
      (typeof row.description === "string" && row.description.trim()) || "";
    const durationSec =
      typeof row.durationSec === "number" && Number.isFinite(row.durationSec)
        ? row.durationSec
        : null;
    const rawKey = typeof row.s3Key === "string" ? row.s3Key.trim() : "";
    const s3Key = rawKey ? meditationPlaybackS3Key(rawKey) : "";
    const audioUrl =
      s3Key && cfDomain ? `https://${cfDomain}/${s3Key}` : null;

    return json(200, {
      title,
      description,
      durationSec,
      audioUrl,
      shareToken: token,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed";
    return json(500, { error: msg });
  }
}

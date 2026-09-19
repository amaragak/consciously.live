/**
 * Public (no auth) lookup of a Community-published meditation by id.
 * Used by marketing SSR `/library/[slug]` (slug === id).
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
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

  const id =
    event.pathParameters?.id?.trim() ||
    event.queryStringParameters?.id?.trim() ||
    "";
  if (!id || id.length < 8 || id.length > 128) {
    return json(400, { error: "Invalid id" });
  }

  try {
    let row: Record<string, unknown> | undefined;
    let lek: Record<string, unknown> | undefined;
    do {
      const out = await ddb.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression:
            "id = :id AND #p = :t AND (attribute_not_exists(archived) OR archived = :f) AND (attribute_not_exists(isDraft) OR isDraft = :f)",
          ExpressionAttributeNames: { "#p": "isPublic" },
          ExpressionAttributeValues: {
            ":id": id,
            ":t": true,
            ":f": false,
          },
          ExclusiveStartKey: lek,
        }),
      );
      row = out.Items?.[0] as Record<string, unknown> | undefined;
      lek = out.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (!row && lek);
    if (!row) {
      return json(404, { error: "Meditation not found" });
    }

    const title =
      (typeof row.title === "string" && row.title.trim()) || "Meditation";
    const description =
      (typeof row.description === "string" && row.description.trim()) || "";
    const durationSec =
      typeof row.durationSec === "number" && Number.isFinite(row.durationSec)
        ? row.durationSec
        : typeof row.durationSeconds === "number" &&
            Number.isFinite(row.durationSeconds)
          ? row.durationSeconds
          : null;
    const rawKey = typeof row.s3Key === "string" ? row.s3Key.trim() : "";
    const s3Key = rawKey ? meditationPlaybackS3Key(rawKey) : "";
    const audioUrl =
      s3Key && cfDomain ? `https://${cfDomain}/${s3Key}` : null;
    const shareToken =
      typeof row.shareToken === "string" && row.shareToken.trim()
        ? row.shareToken.trim()
        : null;

    return json(200, {
      id,
      title,
      description,
      durationSec,
      audioUrl,
      shareToken,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed";
    return json(500, { error: msg });
  }
}

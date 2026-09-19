/**
 * Authenticated share-link manage: create or revoke an unlisted share_token.
 * Distinct from PATCH /library/meditations/public (Community publish).
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";
import { optionalUserJson } from "./_shared/consciously-auth-http";
import { updateMeditationRowFirstMatchingPartition } from "./_shared/meditation-library-update";
import {
  LEGACY_MEDITATION_PARTITION_PK,
  meditationGlobalUserPk,
  meditationUserPk,
} from "./_shared/meditation-user-pk";

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
    },
    body: JSON.stringify(payload),
  };
}

function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method !== "PATCH") {
    return json(405, { error: "Method not allowed" });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const auth = await optionalUserJson(
    event,
    typeof body.sessionToken === "string" ? body.sessionToken : null,
  );
  if (!auth?.sub) {
    return json(401, { error: "Sign in required" });
  }

  const partitionKeys = [
    meditationUserPk(auth.sub),
    meditationGlobalUserPk(),
    LEGACY_MEDITATION_PARTITION_PK,
  ];

  const tableName = process.env.MEDITATION_ANALYTICS_TABLE_NAME;
  if (!tableName) {
    return json(500, { error: "MEDITATION_ANALYTICS_TABLE_NAME is not set" });
  }

  const sk = typeof body.sk === "string" ? body.sk.trim() : "";
  if (!sk) {
    return json(400, { error: "`sk` is required" });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action !== "create" && action !== "revoke") {
    return json(400, { error: '`action` must be "create" or "revoke"' });
  }

  try {
    if (action === "revoke") {
      const ok = await updateMeditationRowFirstMatchingPartition({
        ddb,
        tableName,
        partitionKeys,
        sk,
        update: {
          UpdateExpression: "REMOVE shareToken",
          ConditionExpression: "attribute_exists(pk)",
        },
      });
      if (!ok) return json(404, { error: "Meditation not found" });
      return json(200, { ok: true, shareToken: null });
    }

    // Reuse existing token if present; otherwise mint a new one.
    let existing: string | null = null;
    for (const pk of partitionKeys) {
      const got = await ddb.send(
        new GetCommand({ TableName: tableName, Key: { pk, sk } }),
      );
      const tok = got.Item?.shareToken;
      if (typeof tok === "string" && tok.trim()) {
        existing = tok.trim();
        break;
      }
    }
    if (existing) {
      return json(200, { ok: true, shareToken: existing });
    }

    const shareToken = newShareToken();
    const ok = await updateMeditationRowFirstMatchingPartition({
      ddb,
      tableName,
      partitionKeys,
      sk,
      update: {
        UpdateExpression: "SET shareToken = :t",
        ExpressionAttributeValues: { ":t": shareToken },
        ConditionExpression: "attribute_exists(pk)",
      },
    });
    if (!ok) return json(404, { error: "Meditation not found" });
    return json(200, { ok: true, shareToken });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return json(500, { error: msg });
  }
}

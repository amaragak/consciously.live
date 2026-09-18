import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { optionsAuth } from "../lib/medimade-auth-http";
import { corsHeadersForEvent, sha256Hex } from "../lib/medimade-auth-tokens";
import { issueMedimadeSession } from "../lib/medimade-session";
import { getOrCreateUserByEmail } from "../lib/medimade-users";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(
  event: APIGatewayProxyEventV2,
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeadersForEvent(event),
    },
    body: JSON.stringify(payload),
  };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") return json(event, 405, { error: "Method not allowed" });

  const magicTable = process.env.MAGIC_LINK_TABLE_NAME?.trim();
  if (!magicTable) {
    return json(event, 500, { error: "Auth tables are not configured" });
  }
  if (!process.env.USERS_TABLE_NAME?.trim()) {
    return json(event, 500, { error: "Auth tables are not configured" });
  }

  let body: { token?: unknown };
  try {
    body = JSON.parse(event.body || "{}") as { token?: unknown };
  } catch {
    return json(event, 400, { error: "Invalid JSON body" });
  }
  const rawToken =
    typeof body.token === "string" && body.token.trim() ? body.token.trim() : null;
  if (!rawToken) {
    return json(event, 400, { error: "`token` is required" });
  }

  const tokenHash = sha256Hex(rawToken);
  let email: string | null = null;
  try {
    const got = await ddb.send(
      new GetCommand({ TableName: magicTable, Key: { token: tokenHash } }),
    );
    const item = got.Item as { email?: string; ttl?: number; kind?: string } | undefined;
    if (
      !item?.email ||
      typeof item.email !== "string" ||
      item.kind === "rate" ||
      item.kind === "handoff"
    ) {
      return json(event, 400, { error: "Invalid or expired sign-in link" });
    }
    const ttl =
      typeof item.ttl === "number" && Number.isFinite(item.ttl) ? item.ttl : 0;
    if (ttl < Math.floor(Date.now() / 1000)) {
      await ddb.send(
        new DeleteCommand({ TableName: magicTable, Key: { token: tokenHash } }),
      );
      return json(event, 400, { error: "Sign-in link expired" });
    }
    email = item.email.trim().toLowerCase();
    await ddb.send(
      new DeleteCommand({ TableName: magicTable, Key: { token: tokenHash } }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token lookup failed";
    return json(event, 500, { error: msg });
  }

  if (!email) {
    return json(event, 400, { error: "Invalid or expired sign-in link" });
  }

  try {
    const user = await getOrCreateUserByEmail(email);
    return await issueMedimadeSession({
      event,
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      needsProfileName: !Boolean(user.displayName?.trim()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not mint session";
    return json(event, 500, { error: msg });
  }
}

/**
 * Cross-origin session handoff: mint a short-lived one-time code on the
 * marketing origin, redeem it on the SPA to establish localStorage session.
 *
 * POST /auth/handoff/create  (Bearer access JWT)
 * POST /auth/handoff/redeem  { handoffToken }
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { signMedimadeJwt } from "../lib/medimade-jwt";
import {
  optionsAuth,
  requireUserJson,
} from "../lib/medimade-auth-http";
import {
  corsHeadersForEvent,
  newOpaqueToken,
  REFRESH_TOKEN_TTL_SEC,
  sessionSetCookieHeaders,
  sha256Hex,
} from "../lib/medimade-auth-tokens";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/** Handoff codes expire quickly — only for the marketing → SPA hop. */
const HANDOFF_TTL_SEC = 90;

function json(
  event: APIGatewayProxyEventV2,
  statusCode: number,
  payload: Record<string, unknown>,
  setCookies?: string[],
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeadersForEvent(event),
    },
    ...(setCookies?.length ? { cookies: setCookies } : {}),
    body: JSON.stringify(payload),
  };
}

function pathOf(event: APIGatewayProxyEventV2): string {
  return event.rawPath || event.requestContext.http.path || "";
}

function isHttpResult(
  v: unknown,
): v is APIGatewayProxyStructuredResultV2 {
  return (
    !!v &&
    typeof v === "object" &&
    "statusCode" in v &&
    typeof (v as { statusCode: unknown }).statusCode === "number"
  );
}

async function issueSession(params: {
  event: APIGatewayProxyEventV2;
  userId: string;
  email: string;
  displayName: string | null;
}): Promise<APIGatewayProxyStructuredResultV2> {
  const refreshTable = process.env.REFRESH_TABLE_NAME?.trim();
  if (!refreshTable) {
    return json(params.event, 500, { error: "REFRESH_TABLE_NAME is not set" });
  }

  const accessToken = await signMedimadeJwt({
    sub: params.userId,
    email: params.email,
    name: params.displayName ?? undefined,
  });
  const refreshToken = newOpaqueToken(32);
  const refreshHash = sha256Hex(refreshToken);
  const nowSec = Math.floor(Date.now() / 1000);

  await ddb.send(
    new PutCommand({
      TableName: refreshTable,
      Item: {
        tokenHash: refreshHash,
        userId: params.userId,
        email: params.email,
        ...(params.displayName ? { displayName: params.displayName } : {}),
        createdAt: new Date().toISOString(),
        ttl: nowSec + REFRESH_TOKEN_TTL_SEC,
      },
    }),
  );

  return json(
    params.event,
    200,
    {
      token: accessToken,
      refreshToken,
      userId: params.userId,
      email: params.email,
      displayName: params.displayName,
      needsProfileName: !params.displayName,
    },
    sessionSetCookieHeaders({ accessToken, refreshToken }),
  );
}

async function createHandoff(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const magicTable = process.env.MAGIC_LINK_TABLE_NAME?.trim();
  const usersTable = process.env.USERS_TABLE_NAME?.trim();
  if (!magicTable || !usersTable) {
    return json(event, 500, { error: "Auth tables are not configured" });
  }

  let bodySession: string | null = null;
  try {
    const body = JSON.parse(event.body || "{}") as { sessionToken?: unknown };
    if (typeof body.sessionToken === "string" && body.sessionToken.trim()) {
      bodySession = body.sessionToken.trim();
    }
  } catch {
    /* ignore */
  }

  const auth = await requireUserJson(event, bodySession);
  if (isHttpResult(auth)) return auth;

  const email = auth.email?.trim().toLowerCase();
  if (!email) {
    return json(event, 401, { error: "Session missing email" });
  }

  let displayName: string | null =
    typeof auth.name === "string" && auth.name.trim() ? auth.name.trim() : null;
  if (!displayName) {
    try {
      const userRow = await ddb.send(
        new GetCommand({ TableName: usersTable, Key: { email } }),
      );
      const dn = userRow.Item?.displayName;
      if (typeof dn === "string" && dn.trim()) displayName = dn.trim();
    } catch {
      /* optional */
    }
  }

  const raw = newOpaqueToken(24);
  const tokenHash = sha256Hex(raw);
  const nowSec = Math.floor(Date.now() / 1000);

  await ddb.send(
    new PutCommand({
      TableName: magicTable,
      Item: {
        token: tokenHash,
        kind: "handoff",
        userId: auth.sub,
        email,
        ...(displayName ? { displayName } : {}),
        ttl: nowSec + HANDOFF_TTL_SEC,
        createdAt: new Date().toISOString(),
      },
    }),
  );

  return json(event, 200, { handoffToken: raw, expiresInSec: HANDOFF_TTL_SEC });
}

async function redeemHandoff(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const magicTable = process.env.MAGIC_LINK_TABLE_NAME?.trim();
  const refreshTable = process.env.REFRESH_TABLE_NAME?.trim();
  if (!magicTable || !refreshTable) {
    return json(event, 500, { error: "Auth tables are not configured" });
  }

  let body: { handoffToken?: unknown };
  try {
    body = JSON.parse(event.body || "{}") as { handoffToken?: unknown };
  } catch {
    return json(event, 400, { error: "Invalid JSON body" });
  }
  const raw =
    typeof body.handoffToken === "string" && body.handoffToken.trim()
      ? body.handoffToken.trim()
      : "";
  if (!raw || raw.length < 16) {
    return json(event, 400, { error: "Invalid handoff token" });
  }

  const tokenHash = sha256Hex(raw);
  const got = await ddb.send(
    new GetCommand({ TableName: magicTable, Key: { token: tokenHash } }),
  );
  const item = got.Item as
    | {
        kind?: string;
        userId?: string;
        email?: string;
        displayName?: string;
        ttl?: number;
      }
    | undefined;

  if (!item || item.kind !== "handoff" || !item.userId || !item.email) {
    return json(event, 400, { error: "Invalid or expired handoff" });
  }
  const ttl = typeof item.ttl === "number" ? item.ttl : 0;
  if (ttl < Math.floor(Date.now() / 1000)) {
    await ddb.send(
      new DeleteCommand({ TableName: magicTable, Key: { token: tokenHash } }),
    );
    return json(event, 400, { error: "Handoff expired" });
  }

  await ddb.send(
    new DeleteCommand({ TableName: magicTable, Key: { token: tokenHash } }),
  );

  const displayName =
    typeof item.displayName === "string" && item.displayName.trim()
      ? item.displayName.trim()
      : null;

  return issueSession({
    event,
    userId: item.userId,
    email: item.email.trim().toLowerCase(),
    displayName,
  });
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") {
    return json(event, 405, { error: "Method not allowed" });
  }

  const path = pathOf(event);
  if (path.endsWith("/auth/handoff/create") || path.endsWith("/handoff/create")) {
    try {
      return await createHandoff(event);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Handoff create failed";
      return json(event, 500, { error: msg });
    }
  }
  if (path.endsWith("/auth/handoff/redeem") || path.endsWith("/handoff/redeem")) {
    try {
      return await redeemHandoff(event);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Handoff redeem failed";
      return json(event, 500, { error: msg });
    }
  }
  return json(event, 404, { error: "Not found" });
}

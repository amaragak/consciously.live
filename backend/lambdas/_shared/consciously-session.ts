import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { signConsciouslyJwt } from "./consciously-jwt";
import {
  resolvePrivileges,
  type ConsciouslyPlan,
  type ConsciouslyRole,
} from "./consciously-privileges";
import {
  corsHeadersForEvent,
  newOpaqueToken,
  REFRESH_TOKEN_TTL_SEC,
  sessionSetCookieHeaders,
  sha256Hex,
} from "./consciously-auth-tokens";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type IssuedSessionPayload = {
  token: string;
  refreshToken: string;
  userId: string;
  email: string;
  needsProfileName: boolean;
  displayName: string | null;
  role: ConsciouslyRole;
  plan: ConsciouslyPlan;
};

/**
 * Mint Consciously access + refresh tokens (same shape as magic-link verify).
 * Cognito / magic-link / guest all converge here so APIs stay JWT-based.
 */
export async function issueConsciouslySession(params: {
  event: APIGatewayProxyEventV2;
  userId: string;
  email: string;
  displayName: string | null;
  needsProfileName: boolean;
  /** From Users row; ADMIN_EMAILS may still elevate role. */
  role?: ConsciouslyRole;
  plan?: ConsciouslyPlan;
}): Promise<APIGatewayProxyStructuredResultV2> {
  const refreshTable = process.env.REFRESH_TABLE_NAME?.trim();
  if (!refreshTable) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeadersForEvent(params.event),
      },
      body: JSON.stringify({ error: "REFRESH_TABLE_NAME is not set" }),
    };
  }

  const privileges = resolvePrivileges({
    email: params.email,
    role: params.role,
    plan: params.plan,
  });

  const accessToken = await signConsciouslyJwt({
    sub: params.userId,
    email: params.email,
    name: params.displayName ?? undefined,
    role: privileges.role,
    plan: privileges.plan,
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
        role: privileges.role,
        plan: privileges.plan,
        createdAt: new Date().toISOString(),
        ttl: nowSec + REFRESH_TOKEN_TTL_SEC,
      },
    }),
  );

  const payload: IssuedSessionPayload = {
    token: accessToken,
    refreshToken,
    userId: params.userId,
    email: params.email,
    needsProfileName: params.needsProfileName,
    displayName: params.displayName,
    role: privileges.role,
    plan: privileges.plan,
  };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeadersForEvent(params.event),
    },
    cookies: sessionSetCookieHeaders({
      accessToken,
      refreshToken,
    }),
    body: JSON.stringify(payload),
  };
}

/**
 * Guest login — issues a normal session for the shared guest account.
 * POST /auth/guest (no body). No email / magic link.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { signConsciouslyJwt } from "./_shared/consciously-jwt";
import { optionsAuth } from "./_shared/consciously-auth-http";
import {
  corsHeadersForEvent,
  newOpaqueToken,
  REFRESH_TOKEN_TTL_SEC,
  sessionSetCookieHeaders,
  sha256Hex,
} from "./_shared/consciously-auth-tokens";
import { resolvePrivileges } from "./_shared/consciously-privileges";

/** Shared guest account — Continue-as-guest logs into this user. */
export const GUEST_ACCOUNT_EMAIL = "alexmaragakis@hotmail.co.uk";
export const GUEST_ACCOUNT_DISPLAY_NAME = "Alex";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

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

async function getOrCreateGuestUser(usersTable: string): Promise<{
  userId: string;
  email: string;
  displayName: string;
}> {
  const email = GUEST_ACCOUNT_EMAIL.trim().toLowerCase();
  const displayName = GUEST_ACCOUNT_DISPLAY_NAME;
  const got = await ddb.send(
    new GetCommand({
      TableName: usersTable,
      Key: { email },
    }),
  );
  const existingId = got.Item?.userId;
  if (typeof existingId === "string" && existingId.trim()) {
    // Never overwrite an existing account's display name on guest login.
    const existingName =
      typeof got.Item?.displayName === "string" && got.Item.displayName.trim()
        ? got.Item.displayName.trim()
        : displayName;
    return { userId: existingId.trim(), email, displayName: existingName };
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new PutCommand({
        TableName: usersTable,
        Item: {
          email,
          userId,
          displayName,
          createdAt: now,
          updatedAt: now,
          isGuestAccount: true,
        },
        ConditionExpression: "attribute_not_exists(#e)",
        ExpressionAttributeNames: { "#e": "email" },
      }),
    );
    return { userId, email, displayName };
  } catch (e: unknown) {
    const name =
      e && typeof e === "object" && "name" in e
        ? String((e as { name: string }).name)
        : "";
    if (name !== "ConditionalCheckFailedException") throw e;
    const again = await ddb.send(
      new GetCommand({ TableName: usersTable, Key: { email } }),
    );
    const u = again.Item?.userId;
    if (typeof u !== "string" || !u.trim()) {
      throw new Error("Guest user race without userId");
    }
    const againName =
      typeof again.Item?.displayName === "string" && again.Item.displayName.trim()
        ? again.Item.displayName.trim()
        : displayName;
    return { userId: u.trim(), email, displayName: againName };
  }
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") {
    return json(event, 405, { error: "Method not allowed" });
  }

  const usersTable = process.env.USERS_TABLE_NAME?.trim();
  const refreshTable = process.env.REFRESH_TABLE_NAME?.trim();
  if (!usersTable || !refreshTable) {
    return json(event, 500, { error: "Auth tables are not configured" });
  }

  try {
    const guest = await getOrCreateGuestUser(usersTable);
    const privileges = resolvePrivileges({
      email: guest.email,
      role: "user",
      plan: "free",
    });
    const accessToken = await signConsciouslyJwt({
      sub: guest.userId,
      email: guest.email,
      name: guest.displayName,
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
          userId: guest.userId,
          email: guest.email,
          displayName: guest.displayName,
          role: privileges.role,
          plan: privileges.plan,
          createdAt: new Date().toISOString(),
          ttl: nowSec + REFRESH_TOKEN_TTL_SEC,
        },
      }),
    );

    return json(
      event,
      200,
      {
        token: accessToken,
        refreshToken,
        userId: guest.userId,
        email: guest.email,
        needsProfileName: false,
        displayName: guest.displayName,
        role: privileges.role,
        plan: privileges.plan,
      },
      sessionSetCookieHeaders({ accessToken, refreshToken }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Guest login failed";
    return json(event, 500, { error: msg });
  }
}

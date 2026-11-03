import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { timingSafeEqual } from "crypto";
import { optionsAuth } from "./_shared/consciously-auth-http";
import { corsHeadersForEvent, sha256Hex } from "./_shared/consciously-auth-tokens";
import { issueConsciouslySession } from "./_shared/consciously-session";
import { getOrCreateUserByEmail } from "./_shared/consciously-users";
import { MAGIC_CODE_MAX_ATTEMPTS, magicCodeKey } from "./_shared/magic-code";

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

  let body: { token?: unknown; email?: unknown; code?: unknown };
  try {
    body = JSON.parse(event.body || "{}") as typeof body;
  } catch {
    return json(event, 400, { error: "Invalid JSON body" });
  }
  const rawToken =
    typeof body.token === "string" && body.token.trim() ? body.token.trim() : null;
  const codeEmail =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code.replace(/\s+/g, "") : "";

  if (!rawToken) {
    if (!codeEmail || !/^\d{6}$/.test(code)) {
      return json(event, 400, { error: "`token`, or `email` and a 6-digit `code`, is required" });
    }
    const verified = isReviewAccountCode(codeEmail, code)
      ? codeEmail
      : await redeemCode(magicTable, codeEmail, code);
    if (typeof verified !== "string") return json(event, 400, verified);
    return issueFor(event, verified);
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
    await retireCodeForLink(magicTable, email, tokenHash);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token lookup failed";
    return json(event, 500, { error: msg });
  }

  if (!email) {
    return json(event, 400, { error: "Invalid or expired sign-in link" });
  }
  return issueFor(event, email);
}

/** App Review: one designated account signs in with a fixed code (env, never emailed). */
function isReviewAccountCode(email: string, code: string): boolean {
  const reviewEmail = process.env.REVIEW_ACCOUNT_EMAIL?.trim().toLowerCase();
  const reviewCode = process.env.REVIEW_ACCOUNT_CODE?.trim();
  if (!reviewEmail || !reviewCode || email !== reviewEmail) return false;
  return safeEqual(code, reviewCode);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type CodeError = { error: string; code: "invalid" | "expired" | "attempts" };

/** Check and consume the 6-digit code; also retires the matching link. */
async function redeemCode(
  table: string,
  email: string,
  code: string,
): Promise<string | CodeError> {
  const key = magicCodeKey(email);
  const got = await ddb.send(new GetCommand({ TableName: table, Key: { token: key } }));
  const row = got.Item as
    | { codeHash?: string; linkTokenHash?: string; ttl?: number; attempts?: number }
    | undefined;
  if (!row?.codeHash) {
    return { error: "That code isn’t right. Request a new one.", code: "invalid" };
  }
  const ttl = typeof row.ttl === "number" ? row.ttl : 0;
  if (ttl < Math.floor(Date.now() / 1000)) {
    await ddb.send(new DeleteCommand({ TableName: table, Key: { token: key } }));
    return { error: "That code has expired. Request a new one.", code: "expired" };
  }
  if (!safeEqual(sha256Hex(`${email}:${code}`), row.codeHash)) {
    const attempts = (typeof row.attempts === "number" ? row.attempts : 0) + 1;
    if (attempts >= MAGIC_CODE_MAX_ATTEMPTS) {
      await ddb.send(new DeleteCommand({ TableName: table, Key: { token: key } }));
      return { error: "Too many tries. Request a new code.", code: "attempts" };
    }
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: { token: key },
        UpdateExpression: "SET attempts = :a",
        ExpressionAttributeValues: { ":a": attempts },
      }),
    );
    return { error: "That code isn’t right. Check the email and try again.", code: "invalid" };
  }
  // Conditional delete: two parallel submits of the same code can't both win.
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: table,
        Key: { token: key },
        ConditionExpression: "codeHash = :h",
        ExpressionAttributeValues: { ":h": row.codeHash },
      }),
    );
  } catch {
    return { error: "That code has already been used.", code: "invalid" };
  }
  if (row.linkTokenHash) {
    await ddb.send(
      new DeleteCommand({ TableName: table, Key: { token: row.linkTokenHash } }),
    );
  }
  return email;
}

async function retireCodeForLink(table: string, email: string, tokenHash: string) {
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: table,
        Key: { token: magicCodeKey(email) },
        ConditionExpression: "linkTokenHash = :h",
        ExpressionAttributeValues: { ":h": tokenHash },
      }),
    );
  } catch {
    /* No code row, or it belongs to a newer email. */
  }
}

async function issueFor(
  event: APIGatewayProxyEventV2,
  email: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const user = await getOrCreateUserByEmail(email);
    return await issueConsciouslySession({
      event,
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      needsProfileName: !Boolean(user.displayName?.trim()),
      role: user.role,
      plan: user.plan,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not mint session";
    return json(event, 500, { error: msg });
  }
}

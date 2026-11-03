/**
 * POST /auth/account/delete — permanently delete the signed-in user's account and data
 * (App Store guideline 5.1.1(v)). Clears the session cookies on the way out.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { optionsAuth, requireUserJson } from "./_shared/consciously-auth-http";
import {
  corsHeadersForEvent,
  sessionClearCookieHeaders,
} from "./_shared/consciously-auth-tokens";
import { meditationUserPk } from "./_shared/meditation-user-pk";
import { HOUSE_EMAIL, USERNAME_PK } from "./_shared/usernames";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const cognito = new CognitoIdentityProviderClient({});

const GUEST_ACCOUNT_EMAIL = "alexmaragakis@hotmail.co.uk";
const USER_MEDIA_PREFIXES = [
  "meditations",
  "meditation-covers",
  "drafts",
  "journal-transcriptions",
];

function json(
  event: APIGatewayProxyEventV2,
  statusCode: number,
  payload: Record<string, unknown>,
  cookies?: string[],
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...corsHeadersForEvent(event) },
    ...(cookies?.length ? { cookies } : {}),
    body: JSON.stringify(payload),
  };
}

function envTables(names: string[]): string[] {
  return names
    .map((n) => process.env[n]?.trim())
    .filter((t): t is string => Boolean(t));
}

async function batchDelete(table: string, keys: Record<string, unknown>[]) {
  for (let i = 0; i < keys.length; i += 25) {
    let pending = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
    for (let tries = 0; pending.length && tries < 6; tries++) {
      const out = await ddb.send(
        new BatchWriteCommand({ RequestItems: { [table]: pending } }),
      );
      pending = (out.UnprocessedItems?.[table] ?? []) as typeof pending;
      if (pending.length) await new Promise((r) => setTimeout(r, 100 * 2 ** tries));
    }
  }
}

/** Delete every item under one partition key (tables keyed pk/sk). */
async function deletePartition(table: string, pk: string) {
  let start: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ProjectionExpression: "pk, sk",
        ExclusiveStartKey: start,
      }),
    );
    const keys = (page.Items ?? []).map((it) => ({ pk: it.pk, sk: it.sk }));
    if (keys.length) await batchDelete(table, keys);
    start = page.LastEvaluatedKey;
  } while (start);
}

/** Refresh tokens are keyed by hash with no user index. */
async function deleteRefreshTokens(table: string, userId: string) {
  let start: Record<string, unknown> | undefined;
  do {
    const page = await ddb.send(
      new ScanCommand({
        TableName: table,
        FilterExpression: "userId = :u",
        ExpressionAttributeValues: { ":u": userId },
        ProjectionExpression: "tokenHash",
        ExclusiveStartKey: start,
      }),
    );
    const keys = (page.Items ?? []).map((it) => ({ tokenHash: it.tokenHash }));
    if (keys.length) await batchDelete(table, keys);
    start = page.LastEvaluatedKey;
  } while (start);
}

async function deletePrefix(bucket: string, prefix: string) {
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
    );
    const objects = (page.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k))
      .map((Key) => ({ Key }));
    if (objects.length) {
      await s3.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
      );
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
}

async function deleteCognitoUser(email: string) {
  const poolId = process.env.COGNITO_USER_POOL_ID?.trim();
  if (!poolId) return;
  const found = await cognito.send(
    new ListUsersCommand({
      UserPoolId: poolId,
      Filter: `email = "${email.replace(/"/g, "")}"`,
      Limit: 10,
    }),
  );
  for (const u of found.Users ?? []) {
    if (u.Username) {
      await cognito.send(
        new AdminDeleteUserCommand({ UserPoolId: poolId, Username: u.Username }),
      );
    }
  }
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return optionsAuth(event);
  if (method !== "POST") return json(event, 405, { error: "Method not allowed" });

  const auth = await requireUserJson(event);
  if (!("sub" in auth)) return auth;
  const userId = auth.sub;
  const email = auth.email?.trim().toLowerCase();
  if (!email) return json(event, 400, { error: "Session has no email" });
  if (email === GUEST_ACCOUNT_EMAIL || email === HOUSE_EMAIL) {
    return json(event, 403, { error: "This account can’t be deleted." });
  }

  const usersTable = process.env.USERS_TABLE_NAME!;
  try {
    const userRow = await ddb.send(
      new GetCommand({ TableName: usersTable, Key: { email } }),
    );
    if (userRow.Item && userRow.Item.userId !== userId) {
      return json(event, 403, { error: "Session doesn’t match this account." });
    }
    const username =
      typeof userRow.Item?.username === "string"
        ? userRow.Item.username.trim().toLowerCase()
        : "";

    for (const table of envTables([
      "JOURNAL_TABLE_NAME",
      "ASSISTANT_CHAT_TABLE_NAME",
      "IDEATE_TABLE_NAME",
      "HABITS_TABLE_NAME",
      "JOURNAL_INSIGHTS_TABLE_NAME",
    ])) {
      await deletePartition(table, userId);
    }
    for (const table of envTables([
      "MEDITATION_ANALYTICS_TABLE_NAME",
      "MEDITATION_LISTENER_MIX_TABLE_NAME",
    ])) {
      await deletePartition(table, meditationUserPk(userId));
    }

    const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
    if (bucket) {
      for (const p of USER_MEDIA_PREFIXES) await deletePrefix(bucket, `${p}/${userId}/`);
    }

    const analytics = process.env.MEDITATION_ANALYTICS_TABLE_NAME?.trim();
    if (analytics && username) {
      await ddb
        .send(
          new DeleteCommand({
            TableName: analytics,
            Key: { pk: USERNAME_PK, sk: username },
            ConditionExpression: "attribute_not_exists(userId) OR userId = :u",
            ExpressionAttributeValues: { ":u": userId },
          }),
        )
        .catch(() => undefined);
    }

    const refreshTable = process.env.REFRESH_TABLE_NAME?.trim();
    if (refreshTable) await deleteRefreshTokens(refreshTable, userId);

    await deleteCognitoUser(email);
    await ddb.send(new DeleteCommand({ TableName: usersTable, Key: { email } }));
  } catch (e) {
    console.error("account delete failed", { userId, error: e });
    return json(event, 500, { error: "Could not delete the account. Try again or contact support." });
  }

  return json(event, 200, { ok: true }, sessionClearCookieHeaders());
}

import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  normalizePlan,
  normalizeRole,
  type ConsciouslyPlan,
  type ConsciouslyRole,
} from "./consciously-privileges";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function usersTableName(): string {
  const n = process.env.USERS_TABLE_NAME?.trim();
  if (!n) throw new Error("USERS_TABLE_NAME is not set");
  return n;
}

export type ConsciouslyUserRecord = {
  email: string;
  userId: string;
  displayName: string | null;
  cognitoSub: string | null;
  role: ConsciouslyRole;
  plan: ConsciouslyPlan;
  createdAt: string;
};

function fromItem(
  email: string,
  existing: Record<string, unknown>,
  cognitoSubOverride?: string | null,
): ConsciouslyUserRecord {
  const userId =
    typeof existing.userId === "string" ? existing.userId.trim() : "";
  if (!userId) throw new Error("User record missing userId");
  const displayName =
    typeof existing.displayName === "string" && existing.displayName.trim()
      ? existing.displayName.trim()
      : null;
  const cognitoSub =
    (cognitoSubOverride && cognitoSubOverride.trim()) ||
    (typeof existing.cognitoSub === "string" && existing.cognitoSub.trim()
      ? existing.cognitoSub.trim()
      : null);
  return {
    email,
    userId,
    displayName,
    cognitoSub,
    role: normalizeRole(existing.role),
    plan: normalizePlan(existing.plan),
    createdAt:
      typeof existing.createdAt === "string"
        ? existing.createdAt
        : new Date().toISOString(),
  };
}

/**
 * Stable Consciously identity is email → userId (JWT `sub`).
 * Cognito `sub` is stored as `cognitoSub` for linking; never used as JWT sub.
 * `role` / `plan` default to user / free; elevate via Users row or ADMIN_EMAILS.
 */
export async function getOrCreateUserByEmail(
  emailRaw: string,
  opts?: { cognitoSub?: string | null },
): Promise<ConsciouslyUserRecord> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Valid email is required");
  }
  const table = usersTableName();
  const got = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { email },
    }),
  );
  const existing = got.Item as Record<string, unknown> | undefined;
  if (existing && typeof existing.userId === "string" && existing.userId.trim()) {
    const incoming = opts?.cognitoSub?.trim() || null;
    const prior =
      typeof existing.cognitoSub === "string" && existing.cognitoSub.trim()
        ? existing.cognitoSub.trim()
        : null;
    if (incoming && incoming !== prior) {
      await ddb.send(
        new UpdateCommand({
          TableName: table,
          Key: { email },
          UpdateExpression: "SET cognitoSub = :c",
          ExpressionAttributeValues: { ":c": incoming },
        }),
      );
    }
    return fromItem(email, existing, incoming);
  }

  const userId = randomUUID();
  const now = new Date().toISOString();
  const cognitoSub = opts?.cognitoSub?.trim() || null;
  try {
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          email,
          userId,
          createdAt: now,
          role: "user",
          plan: "free",
          ...(cognitoSub ? { cognitoSub } : {}),
        },
        ConditionExpression: "attribute_not_exists(#e)",
        ExpressionAttributeNames: { "#e": "email" },
      }),
    );
    return {
      email,
      userId,
      displayName: null,
      cognitoSub,
      role: "user",
      plan: "free",
      createdAt: now,
    };
  } catch (e: unknown) {
    const name =
      e && typeof e === "object" && "name" in e
        ? String((e as { name: string }).name)
        : "";
    if (name !== "ConditionalCheckFailedException") throw e;
    return getOrCreateUserByEmail(email, opts);
  }
}

/** Load privileges for an existing email (refresh / handoff). Missing → defaults. */
export async function getUserPrivilegesByEmail(emailRaw: string): Promise<{
  role: ConsciouslyRole;
  plan: ConsciouslyPlan;
  displayName: string | null;
}> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) {
    return { role: "user", plan: "free", displayName: null };
  }
  try {
    const got = await ddb.send(
      new GetCommand({
        TableName: usersTableName(),
        Key: { email },
      }),
    );
    const item = got.Item as Record<string, unknown> | undefined;
    if (!item) {
      return { role: "user", plan: "free", displayName: null };
    }
    const displayName =
      typeof item.displayName === "string" && item.displayName.trim()
        ? item.displayName.trim()
        : null;
    return {
      role: normalizeRole(item.role),
      plan: normalizePlan(item.plan),
      displayName,
    };
  } catch {
    return { role: "user", plan: "free", displayName: null };
  }
}

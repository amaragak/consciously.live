import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

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
  createdAt: string;
};

/**
 * Stable Consciously identity is email → userId (JWT `sub`).
 * Cognito `sub` is stored as `cognitoSub` for linking; never used as JWT sub.
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
  const existing = got.Item;
  if (existing && typeof existing.userId === "string" && existing.userId.trim()) {
    const userId = existing.userId.trim();
    const displayName =
      typeof existing.displayName === "string" && existing.displayName.trim()
        ? existing.displayName.trim()
        : null;
    const cognitoSub =
      typeof existing.cognitoSub === "string" && existing.cognitoSub.trim()
        ? existing.cognitoSub.trim()
        : null;
    const incoming = opts?.cognitoSub?.trim() || null;
    if (incoming && incoming !== cognitoSub) {
      await ddb.send(
        new UpdateCommand({
          TableName: table,
          Key: { email },
          UpdateExpression: "SET cognitoSub = :c",
          ExpressionAttributeValues: { ":c": incoming },
        }),
      );
    }
    return {
      email,
      userId,
      displayName,
      cognitoSub: incoming || cognitoSub,
      createdAt:
        typeof existing.createdAt === "string"
          ? existing.createdAt
          : new Date().toISOString(),
    };
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
          ...(cognitoSub ? { cognitoSub } : {}),
        },
        ConditionExpression: "attribute_not_exists(#e)",
        ExpressionAttributeNames: { "#e": "email" },
      }),
    );
    return { email, userId, displayName: null, cognitoSub, createdAt: now };
  } catch (e: unknown) {
    const name =
      e && typeof e === "object" && "name" in e
        ? String((e as { name: string }).name)
        : "";
    if (name !== "ConditionalCheckFailedException") throw e;
    const again = await ddb.send(
      new GetCommand({ TableName: table, Key: { email } }),
    );
    const u = again.Item?.userId;
    if (typeof u !== "string" || !u.trim()) {
      throw new Error("User record race without userId");
    }
    return getOrCreateUserByEmail(email, opts);
  }
}

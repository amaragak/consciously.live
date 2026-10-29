/**
 * Username registry on the meditation analytics table:
 *   pk: USERNAME, sk: <username>
 *   status: active | retired
 *   email, userId, redirectTo?
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  HOUSE_EMAIL,
  HOUSE_USERNAME,
  USERNAME_PK,
  USERNAME_UNAVAILABLE_MESSAGE,
  isAllDigitUsername,
  newDefaultUsername,
  usernameChangeAllowed,
  validateChosenUsername,
} from "./usernames";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function usersTable(): string {
  const n = process.env.USERS_TABLE_NAME?.trim();
  if (!n) throw new Error("USERS_TABLE_NAME is not set");
  return n;
}

function analyticsTable(): string {
  const n = process.env.MEDITATION_ANALYTICS_TABLE_NAME?.trim();
  if (!n) throw new Error("MEDITATION_ANALYTICS_TABLE_NAME is not set");
  return n;
}

export type UsernameRegistryRow = {
  username: string;
  status: "active" | "retired";
  email: string;
  userId: string;
  redirectTo: string | null;
};

export async function getUsernameRegistry(
  username: string,
): Promise<UsernameRegistryRow | null> {
  const u = username.trim().toLowerCase();
  if (!u) return null;
  const got = await ddb.send(
    new GetCommand({
      TableName: analyticsTable(),
      Key: { pk: USERNAME_PK, sk: u },
    }),
  );
  const item = got.Item as Record<string, unknown> | undefined;
  if (!item) return null;
  const status = item.status === "retired" ? "retired" : "active";
  const email = typeof item.email === "string" ? item.email.trim() : "";
  const userId = typeof item.userId === "string" ? item.userId.trim() : "";
  if (!email || !userId) return null;
  return {
    username: u,
    status,
    email,
    userId,
    redirectTo:
      typeof item.redirectTo === "string" && item.redirectTo.trim()
        ? item.redirectTo.trim().toLowerCase()
        : null,
  };
}

async function putRegistry(params: {
  username: string;
  status: "active" | "retired";
  email: string;
  userId: string;
  redirectTo?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: analyticsTable(),
      Item: {
        pk: USERNAME_PK,
        sk: params.username,
        status: params.status,
        email: params.email,
        userId: params.userId,
        redirectTo: params.redirectTo ?? null,
        updatedAt: now,
      },
    }),
  );
}

/** Assign a unique 11-digit default if the user has none yet. */
export async function ensureDefaultUsername(params: {
  email: string;
  userId: string;
}): Promise<{ username: string; isDefault: boolean; chosen: boolean }> {
  const email = params.email.trim().toLowerCase();
  const users = usersTable();
  const got = await ddb.send(
    new GetCommand({ TableName: users, Key: { email } }),
  );
  const item = (got.Item ?? {}) as Record<string, unknown>;
  const existing =
    typeof item.username === "string" && item.username.trim()
      ? item.username.trim().toLowerCase()
      : "";
  if (existing) {
    return {
      username: existing,
      isDefault: item.usernameIsDefault === true || isAllDigitUsername(existing),
      chosen: item.usernameChosen === true,
    };
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = newDefaultUsername();
    const taken = await getUsernameRegistry(candidate);
    if (taken) continue;
    try {
      await ddb.send(
        new PutCommand({
          TableName: analyticsTable(),
          Item: {
            pk: USERNAME_PK,
            sk: candidate,
            status: "active",
            email,
            userId: params.userId,
            redirectTo: null,
            updatedAt: new Date().toISOString(),
          },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
      await ddb.send(
        new UpdateCommand({
          TableName: users,
          Key: { email },
          UpdateExpression:
            "SET username = :u, usernameIsDefault = :d, usernameChosen = :c",
          ExpressionAttributeValues: {
            ":u": candidate,
            ":d": true,
            ":c": false,
          },
        }),
      );
      return { username: candidate, isDefault: true, chosen: false };
    } catch (e: unknown) {
      const name =
        e && typeof e === "object" && "name" in e
          ? String((e as { name: string }).name)
          : "";
      if (name !== "ConditionalCheckFailedException") throw e;
    }
  }
  throw new Error("Could not allocate a default username");
}

export async function getUserUsernameFields(emailRaw: string): Promise<{
  username: string | null;
  isDefault: boolean;
  chosen: boolean;
  changedAt: string | null;
}> {
  const email = emailRaw.trim().toLowerCase();
  if (!email) {
    return { username: null, isDefault: false, chosen: false, changedAt: null };
  }
  const got = await ddb.send(
    new GetCommand({ TableName: usersTable(), Key: { email } }),
  );
  const item = got.Item as Record<string, unknown> | undefined;
  if (!item) {
    return { username: null, isDefault: false, chosen: false, changedAt: null };
  }
  const username =
    typeof item.username === "string" && item.username.trim()
      ? item.username.trim().toLowerCase()
      : null;
  return {
    username,
    isDefault: item.usernameIsDefault === true || (username ? isAllDigitUsername(username) : false),
    chosen: item.usernameChosen === true,
    changedAt:
      typeof item.usernameChangedAt === "string" && item.usernameChangedAt.trim()
        ? item.usernameChangedAt.trim()
        : null,
  };
}

/**
 * Claim a chosen username. Retires the previous one (redirects forever).
 * Defaults may be replaced freely; chosen names are limited to once / 30 days.
 */
export async function setChosenUsername(params: {
  email: string;
  userId: string;
  desired: string;
}): Promise<
  | {
      ok: true;
      username: string;
      nextAllowedAt: string | null;
    }
  | { ok: false; error: string; nextAllowedAt?: string | null }
> {
  const email = params.email.trim().toLowerCase();
  const validated = validateChosenUsername(params.desired);
  if (!validated.ok) return { ok: false, error: validated.error };

  const desired = validated.username;
  const current = await getUserUsernameFields(email);

  if (current.username === desired && current.chosen) {
    return { ok: true, username: desired, nextAllowedAt: null };
  }

  if (current.chosen) {
    const gate = usernameChangeAllowed(current.changedAt);
    if (!gate.ok) {
      return {
        ok: false,
        error: `You can change your username again after ${gate.nextAllowedAt?.slice(0, 10) ?? "30 days"}.`,
        nextAllowedAt: gate.nextAllowedAt,
      };
    }
  }

  const existingReg = await getUsernameRegistry(desired);
  if (existingReg) {
    if (
      existingReg.status === "active" &&
      existingReg.email === email &&
      existingReg.userId === params.userId
    ) {
      // Same user reclaiming — fine.
    } else {
      return { ok: false, error: USERNAME_UNAVAILABLE_MESSAGE };
    }
  }

  // Reserve desired.
  try {
    await ddb.send(
      new PutCommand({
        TableName: analyticsTable(),
        Item: {
          pk: USERNAME_PK,
          sk: desired,
          status: "active",
          email,
          userId: params.userId,
          redirectTo: null,
          updatedAt: new Date().toISOString(),
        },
        ConditionExpression:
          "attribute_not_exists(pk) OR (email = :e AND userId = :id)",
        ExpressionAttributeValues: { ":e": email, ":id": params.userId },
      }),
    );
  } catch (e: unknown) {
    const name =
      e && typeof e === "object" && "name" in e
        ? String((e as { name: string }).name)
        : "";
    if (name === "ConditionalCheckFailedException") {
      return { ok: false, error: USERNAME_UNAVAILABLE_MESSAGE };
    }
    throw e;
  }

  // Retire previous.
  if (current.username && current.username !== desired) {
    await putRegistry({
      username: current.username,
      status: "retired",
      email,
      userId: params.userId,
      redirectTo: desired,
    });
  }

  const now = new Date().toISOString();
  await ddb.send(
    new UpdateCommand({
      TableName: usersTable(),
      Key: { email },
      UpdateExpression:
        "SET username = :u, usernameIsDefault = :d, usernameChosen = :c, usernameChangedAt = :t",
      ExpressionAttributeValues: {
        ":u": desired,
        ":d": false,
        ":c": true,
        ":t": now,
      },
    }),
  );

  const next = new Date(Date.parse(now) + 30 * 24 * 60 * 60 * 1000).toISOString();
  return { ok: true, username: desired, nextAllowedAt: next };
}

/** Resolve a username for public Listen pages (follows one redirect hop). */
export async function resolvePublicUsername(
  raw: string,
): Promise<
  | { status: "ok"; username: string; email: string; userId: string }
  | { status: "redirect"; to: string }
  | { status: "missing" }
> {
  const u = raw.trim().toLowerCase();
  if (!u) return { status: "missing" };
  const row = await getUsernameRegistry(u);
  if (!row) return { status: "missing" };
  if (row.status === "retired" && row.redirectTo) {
    return { status: "redirect", to: row.redirectTo };
  }
  if (row.status !== "active") return { status: "missing" };
  return {
    status: "ok",
    username: row.username,
    email: row.email,
    userId: row.userId,
  };
}

export async function ensureHouseUsernameRegistry(params: {
  userId: string;
}): Promise<void> {
  await putRegistry({
    username: HOUSE_USERNAME,
    status: "active",
    email: HOUSE_EMAIL,
    userId: params.userId,
    redirectTo: null,
  });
}

/**
 * Ensure the Consciously house account exists (users row + username registry).
 * Idempotent. Used for Listen examples and "Create as Consciously".
 */
export async function ensureHouseAccount(): Promise<{
  email: string;
  userId: string;
  username: string;
}> {
  const { randomUUID } = await import("crypto");
  const users = usersTable();
  const got = await ddb.send(
    new GetCommand({ TableName: users, Key: { email: HOUSE_EMAIL } }),
  );
  let userId =
    typeof got.Item?.userId === "string" && got.Item.userId.trim()
      ? got.Item.userId.trim()
      : "";
  if (!userId) {
    userId = randomUUID();
    const now = new Date().toISOString();
    try {
      await ddb.send(
        new PutCommand({
          TableName: users,
          Item: {
            email: HOUSE_EMAIL,
            userId,
            displayName: "Consciously",
            createdAt: now,
            role: "user",
            plan: "pro",
            username: HOUSE_USERNAME,
            usernameIsDefault: false,
            usernameChosen: true,
            isHouseAccount: true,
          },
          ConditionExpression: "attribute_not_exists(email)",
        }),
      );
    } catch (e: unknown) {
      const name =
        e && typeof e === "object" && "name" in e
          ? String((e as { name: string }).name)
          : "";
      if (name !== "ConditionalCheckFailedException") throw e;
      const again = await ddb.send(
        new GetCommand({ TableName: users, Key: { email: HOUSE_EMAIL } }),
      );
      userId =
        typeof again.Item?.userId === "string" && again.Item.userId.trim()
          ? again.Item.userId.trim()
          : userId;
    }
  } else {
    await ddb.send(
      new UpdateCommand({
        TableName: users,
        Key: { email: HOUSE_EMAIL },
        UpdateExpression:
          "SET displayName = :n, username = :u, usernameIsDefault = :d, usernameChosen = :c, isHouseAccount = :h",
        ExpressionAttributeValues: {
          ":n": "Consciously",
          ":u": HOUSE_USERNAME,
          ":d": false,
          ":c": true,
          ":h": true,
        },
      }),
    );
  }
  await ensureHouseUsernameRegistry({ userId });
  return { email: HOUSE_EMAIL, userId, username: HOUSE_USERNAME };
}

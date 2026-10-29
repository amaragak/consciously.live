/**
 * Authenticated Listen share manage: create / update / revoke a public share.
 * Distinct from PATCH /library/meditations/public (Community publish).
 *
 * Body:
 *   sk, action: "create" | "update" | "revoke"
 *   On create/update: title, description, shownAs, showBrief, listed, kind?,
 *                     isExample? (admin only), brief? (optional override)
 *
 * Legacy: action "create" with no title still mints/reuses opaque shareToken
 * for old clients; prefer the Listen payload going forward.
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
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomBytes } from "crypto";
import { optionalUserJson } from "./_shared/consciously-auth-http";
import { updateMeditationRowFirstMatchingPartition } from "./_shared/meditation-library-update";
import {
  LEGACY_MEDITATION_PARTITION_PK,
  meditationGlobalUserPk,
  meditationUserPk,
} from "./_shared/meditation-user-pk";
import {
  LISTEN_LISTED_PK,
  LISTEN_PATH_PK,
  LISTEN_SLUG_PK,
  briefFromMeditationRow,
  newSlugSuffix,
  parseListenShare,
  slugifyTitle,
  type ListenShareKind,
  type ListenShareSnapshot,
} from "./_shared/listen-share";
import {
  getUserUsernameFields,
} from "./_shared/username-registry";
import {
  listenPublicUrl,
  newListenLinkToken,
} from "./_shared/usernames";

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

async function getMeditationRow(
  tableName: string,
  partitionKeys: string[],
  sk: string,
): Promise<{ pk: string; row: Record<string, unknown> } | null> {
  for (const pk of partitionKeys) {
    const got = await ddb.send(
      new GetCommand({ TableName: tableName, Key: { pk, sk } }),
    );
    if (got.Item) return { pk, row: got.Item as Record<string, unknown> };
  }
  return null;
}

async function slugTaken(
  tableName: string,
  slug: string,
): Promise<"active" | "revoked" | null> {
  const got = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: LISTEN_SLUG_PK, sk: slug },
    }),
  );
  if (!got.Item) {
    // Also check GSI in case registry is missing but row still has slug.
    const q = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "listenSlugIndex",
        KeyConditionExpression: "listenSlug = :s",
        ExpressionAttributeValues: { ":s": slug },
        Limit: 1,
      }),
    );
    return q.Items?.[0] ? "active" : null;
  }
  return got.Item.status === "revoked" ? "revoked" : "active";
}

async function mintUniqueSlug(
  tableName: string,
  title: string,
): Promise<string> {
  const base = slugifyTitle(title);
  for (let i = 0; i < 12; i += 1) {
    const candidate = i === 0 ? base : `${base}-${newSlugSuffix()}`;
    const taken = await slugTaken(tableName, candidate);
    if (!taken) return candidate;
  }
  return `${base}-${newSlugSuffix()}${newSlugSuffix()}`;
}

async function putSlugRegistry(params: {
  tableName: string;
  slug: string;
  status: "active" | "revoked";
  ownerPk?: string;
  ownerSk?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: params.tableName,
      Item: {
        pk: LISTEN_SLUG_PK,
        sk: params.slug,
        status: params.status,
        ...(params.status === "active" && params.ownerPk && params.ownerSk
          ? { ownerPk: params.ownerPk, ownerSk: params.ownerSk }
          : {}),
        updatedAt: now,
        ...(params.status === "revoked" ? { revokedAt: now } : {}),
      },
    }),
  );
}

function shareResponse(params: {
  slug: string;
  username: string;
  pathSlug: string;
  linkToken: string | null;
  share: ListenShareSnapshot;
  shareToken: string | null;
}) {
  const url = listenPublicUrl({
    username: params.username,
    pathSlug: params.pathSlug,
    listed: params.share.listed,
    linkToken: params.linkToken,
  });
  return {
    ok: true,
    slug: params.slug,
    username: params.username,
    pathSlug: params.pathSlug,
    linkToken: params.linkToken,
    url,
    shareToken: params.shareToken,
    listenShare: params.share,
  };
}

async function pathTaken(
  tableName: string,
  username: string,
  pathKey: string,
): Promise<boolean> {
  const sk = `${username}/${pathKey}`;
  const got = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: LISTEN_PATH_PK, sk },
    }),
  );
  return Boolean(got.Item && got.Item.status === "active");
}

async function mintUniquePathSlug(
  tableName: string,
  username: string,
  title: string,
): Promise<string> {
  const base = slugifyTitle(title);
  for (let i = 0; i < 12; i += 1) {
    const candidate = i === 0 ? base : i === 1 ? `${base}-2` : `${base}-${i + 1}`;
    const taken = await pathTaken(tableName, username, candidate);
    if (!taken) return candidate;
  }
  return `${base}-${newSlugSuffix()}`;
}

async function putPathRegistry(params: {
  tableName: string;
  username: string;
  pathKey: string;
  status: "active" | "revoked";
  ownerPk?: string;
  ownerSk?: string;
  redirectTo?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: params.tableName,
      Item: {
        pk: LISTEN_PATH_PK,
        sk: `${params.username}/${params.pathKey}`,
        status: params.status,
        username: params.username,
        pathKey: params.pathKey,
        ...(params.status === "active" && params.ownerPk && params.ownerSk
          ? { ownerPk: params.ownerPk, ownerSk: params.ownerSk }
          : {}),
        redirectTo: params.redirectTo ?? null,
        updatedAt: now,
        ...(params.status === "revoked" ? { revokedAt: now } : {}),
      },
    }),
  );
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

  const asHouse =
    body.asHouse === true ||
    body.as === "consciously" ||
    (typeof body.username === "string" &&
      body.username.trim().toLowerCase() === "consciously");
  let actingUserId = auth.sub;
  let houseUsername: string | null = null;
  if (asHouse) {
    if (auth.role !== "admin") {
      return json(403, { error: "Admin only for Consciously library shares" });
    }
    const { ensureHouseAccount } = await import("./_shared/username-registry");
    const house = await ensureHouseAccount();
    actingUserId = house.userId;
    houseUsername = house.username;
  }

  const partitionKeys = [
    meditationUserPk(actingUserId),
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
  if (action !== "create" && action !== "update" && action !== "revoke") {
    return json(400, {
      error: '`action` must be "create", "update", or "revoke"',
    });
  }

  try {
    if (action === "revoke") {
      const found = await getMeditationRow(tableName, partitionKeys, sk);
      if (!found) return json(404, { error: "Meditation not found" });
      const existingSlug =
        typeof found.row.listenSlug === "string" && found.row.listenSlug.trim()
          ? found.row.listenSlug.trim()
          : null;
      if (existingSlug) {
        await putSlugRegistry({
          tableName,
          slug: existingSlug,
          status: "revoked",
        });
      }
      const ok = await updateMeditationRowFirstMatchingPartition({
        ddb,
        tableName,
        partitionKeys,
        sk,
        update: {
          UpdateExpression:
            "REMOVE shareToken, listenSlug, listenShare, listenListed, listenListedAt",
          ConditionExpression: "attribute_exists(pk)",
        },
      });
      if (!ok) return json(404, { error: "Meditation not found" });
      return json(200, { ok: true, shareToken: null, slug: null, listenShare: null });
    }

    const hasListenFields =
      typeof body.title === "string" ||
      typeof body.description === "string" ||
      typeof body.shownAs === "string" ||
      typeof body.showBrief === "boolean" ||
      typeof body.listed === "boolean" ||
      body.kind === "story" ||
      body.kind === "meditation";

    // Legacy token-only create (old SPA clipboard share).
    if (action === "create" && !hasListenFields) {
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
    }

    if (!auth.email) {
      return json(401, { error: "Sign in required" });
    }
    let username = houseUsername;
    if (!username) {
      const usernameFields = await getUserUsernameFields(auth.email);
      if (!usernameFields.chosen || !usernameFields.username) {
        return json(400, {
          error: "Choose a username before sharing",
          code: "username_required",
        });
      }
      username = usernameFields.username;
    }

    const found = await getMeditationRow(tableName, partitionKeys, sk);
    if (!found) return json(404, { error: "Meditation not found" });

    const prev = parseListenShare(found.row.listenShare);
    const existingSlug =
      typeof found.row.listenSlug === "string" && found.row.listenSlug.trim()
        ? found.row.listenSlug.trim()
        : null;
    const existingPathSlug =
      typeof found.row.listenPathSlug === "string" &&
      found.row.listenPathSlug.trim()
        ? found.row.listenPathSlug.trim()
        : null;
    const existingLinkToken =
      typeof found.row.listenLinkToken === "string" &&
      found.row.listenLinkToken.trim()
        ? found.row.listenLinkToken.trim()
        : null;

    if (action === "update" && (!prev || !existingSlug)) {
      return json(400, { error: "Create a share link before updating" });
    }

    const kind: ListenShareKind =
      body.kind === "story" || prev?.kind === "story" ? "story" : "meditation";

    const titleRaw =
      typeof body.title === "string"
        ? body.title.trim()
        : prev?.title ||
          (typeof found.row.title === "string" ? found.row.title.trim() : "") ||
          "Meditation";
    if (!titleRaw) return json(400, { error: "`title` is required" });

    const description =
      typeof body.description === "string"
        ? body.description.trim()
        : (prev?.description ??
          (typeof found.row.description === "string"
            ? found.row.description.trim()
            : ""));

    const shownAs =
      typeof body.shownAs === "string"
        ? body.shownAs.trim().slice(0, 80)
        : (prev?.shownAs ?? "");

    const showBrief =
      kind === "story"
        ? false
        : typeof body.showBrief === "boolean"
          ? body.showBrief
          : (prev?.showBrief ?? false);

    let brief: string | null =
      typeof body.brief === "string" && body.brief.trim()
        ? body.brief.trim().slice(0, 500)
        : (prev?.brief ?? briefFromMeditationRow(found.row));
    if (kind === "story") brief = null;

    const listed =
      kind === "story" && username !== "consciously"
        ? false
        : typeof body.listed === "boolean"
          ? body.listed
          : (prev?.listed ?? false);

    // Listen examples are the house account (`consciously`) listed items.
    // The old admin `isExample` flag is retired — preserve existing true values only.
    const isExample = prev?.isExample === true;
    // if (typeof body.isExample === "boolean") { … } — commented out; use Create as Consciously instead.

    const now = new Date().toISOString();
    const share: ListenShareSnapshot = {
      kind,
      title: titleRaw.slice(0, 160),
      description: description.slice(0, 2000),
      shownAs,
      showBrief,
      brief,
      listed: listed || isExample,
      isExample,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };

    // Flat listenSlug kept for legacy /listen/<slug> redirects.
    // pathSlug is stable per share; title edits do not change it.
    let slug = existingSlug;
    let pathSlug = existingPathSlug;
    if (action === "create") {
      if (existingSlug && prev && pathSlug) {
        slug = existingSlug;
      } else {
        pathSlug = await mintUniquePathSlug(tableName, username, share.title);
        slug = await mintUniqueSlug(tableName, share.title);
      }
    } else if (!pathSlug) {
      pathSlug = await mintUniquePathSlug(tableName, username, share.title);
    }
    if (!slug || !pathSlug) {
      return json(500, { error: "Could not mint slug" });
    }

    const wasListed = prev?.listed === true;
    let linkToken: string | null = existingLinkToken;
    if (share.listed) {
      // Link-only → listed: clean URL works; old token path redirects.
      if (!wasListed && existingLinkToken) {
        await putPathRegistry({
          tableName,
          username,
          pathKey: `${pathSlug}-${existingLinkToken}`,
          status: "revoked",
          redirectTo: `${username}/${pathSlug}`,
        });
      }
      linkToken = null;
    } else {
      // Listed → link only (or first unlisted): new token; clean URL dies.
      if (wasListed || !linkToken || action === "create") {
        if (wasListed) {
          await putPathRegistry({
            tableName,
            username,
            pathKey: pathSlug,
            status: "revoked",
          });
        }
        linkToken = newListenLinkToken();
      }
    }

    // Keep opaque shareToken for legacy /listen/{token} redirects.
    let shareToken =
      typeof found.row.shareToken === "string" && found.row.shareToken.trim()
        ? found.row.shareToken.trim()
        : null;
    if (!shareToken || action === "create") shareToken = newShareToken();

    const listedAt = share.listed ? now : null;
    const pathKey = share.listed
      ? pathSlug
      : `${pathSlug}-${linkToken ?? newListenLinkToken()}`;
    if (!share.listed && !linkToken) linkToken = pathKey.slice(pathSlug.length + 1);

    await putSlugRegistry({
      tableName,
      slug,
      status: "active",
      ownerPk: found.pk,
      ownerSk: sk,
    });
    await putPathRegistry({
      tableName,
      username,
      pathKey,
      status: "active",
      ownerPk: found.pk,
      ownerSk: sk,
    });

    const ok = await updateMeditationRowFirstMatchingPartition({
      ddb,
      tableName,
      partitionKeys,
      sk,
      update: share.listed
        ? {
            UpdateExpression:
              "SET shareToken = :tok, listenSlug = :slug, listenShare = :share, listenUsername = :user, listenPathSlug = :ps, listenListed = :listed, listenListedAt = :listedAt REMOVE listenLinkToken",
            ExpressionAttributeValues: {
              ":tok": shareToken,
              ":slug": slug,
              ":share": share,
              ":user": username,
              ":ps": pathSlug,
              ":listed": LISTEN_LISTED_PK,
              ":listedAt": listedAt,
            },
            ConditionExpression: "attribute_exists(pk)",
          }
        : {
            UpdateExpression:
              "SET shareToken = :tok, listenSlug = :slug, listenShare = :share, listenUsername = :user, listenPathSlug = :ps, listenLinkToken = :lt REMOVE listenListed, listenListedAt",
            ExpressionAttributeValues: {
              ":tok": shareToken,
              ":slug": slug,
              ":share": share,
              ":user": username,
              ":ps": pathSlug,
              ":lt": linkToken,
            },
            ConditionExpression: "attribute_exists(pk)",
          },
    });
    if (!ok) return json(404, { error: "Meditation not found" });

    return json(
      200,
      shareResponse({
        slug,
        username,
        pathSlug,
        linkToken,
        share,
        shareToken,
      }),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return json(500, { error: msg });
  }
}

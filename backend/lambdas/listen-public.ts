/**
 * Public Listen endpoints (no auth):
 *   GET /public/listen                     — index (house listed + community)
 *   GET /public/listen/{username}          — user listed page / legacy slug redirect
 *   GET /public/listen/{username}/{path}   — shared item (200 / 410 / 404)
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { meditationPlaybackS3Key } from "./_shared/playback-keys";
import {
  LISTEN_LISTED_PK,
  LISTEN_PATH_PK,
  LISTEN_SLUG_PK,
  coverUrlFromRow,
  parseListenShare,
  styleFromMeditationRow,
  type ListenPublicItem,
} from "./_shared/listen-share";
import { resolvePublicUsername } from "./_shared/username-registry";
import { HOUSE_USERNAME, listenPublicPath } from "./_shared/usernames";

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
      "Cache-Control": "public, max-age=60",
    },
    body: JSON.stringify(payload),
  };
}

function publicHref(item: {
  username: string | null;
  pathSlug: string | null;
  listed: boolean;
  linkToken: string | null;
  slug: string;
}): string {
  if (item.username && item.pathSlug) {
    return listenPublicPath({
      username: item.username,
      pathSlug: item.pathSlug,
      listed: item.listed,
      linkToken: item.linkToken,
    });
  }
  return `/listen/${encodeURIComponent(item.slug)}`;
}

function toPublicItem(
  slug: string,
  row: Record<string, unknown>,
  cfDomain: string | undefined,
): ListenPublicItem | null {
  const share = parseListenShare(row.listenShare);
  if (!share) return null;
  const rawKey = typeof row.s3Key === "string" ? row.s3Key.trim() : "";
  const s3Key = rawKey ? meditationPlaybackS3Key(rawKey) : "";
  const audioUrl =
    s3Key && cfDomain ? `https://${cfDomain}/${s3Key}` : null;
  const durationSec =
    typeof row.durationSec === "number" && Number.isFinite(row.durationSec)
      ? row.durationSec
      : typeof row.durationSeconds === "number" &&
          Number.isFinite(row.durationSeconds)
        ? row.durationSeconds
        : null;
  const storyText =
    share.kind === "story" &&
    typeof row.scriptText === "string" &&
    row.scriptText.trim()
      ? row.scriptText.trim()
      : null;
  const username =
    typeof row.listenUsername === "string" && row.listenUsername.trim()
      ? row.listenUsername.trim().toLowerCase()
      : null;
  const pathSlug =
    typeof row.listenPathSlug === "string" && row.listenPathSlug.trim()
      ? row.listenPathSlug.trim()
      : null;
  const linkToken =
    typeof row.listenLinkToken === "string" && row.listenLinkToken.trim()
      ? row.listenLinkToken.trim()
      : null;
  const isExample =
    share.isExample ||
    (share.listed && username === HOUSE_USERNAME);
  return {
    slug,
    username,
    pathSlug,
    kind: share.kind,
    title: share.title,
    description: share.description,
    shownAs:
      isExample && !share.shownAs.trim()
        ? "Consciously"
        : share.shownAs.trim()
          ? share.shownAs.trim()
          : null,
    showBrief: share.showBrief,
    brief: share.showBrief ? share.brief : null,
    listed: share.listed || isExample,
    isExample,
    style: styleFromMeditationRow(row),
    durationSec,
    audioUrl,
    coverImageUrl: coverUrlFromRow(row, cfDomain),
    storyText,
    href: publicHref({
      username,
      pathSlug,
      listed: share.listed || isExample,
      linkToken,
      slug,
    }),
  };
}

async function resolveLegacySlug(
  tableName: string,
  slug: string,
): Promise<
  | { status: "active"; row: Record<string, unknown> }
  | { status: "revoked" }
  | { status: "missing" }
> {
  const reg = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: LISTEN_SLUG_PK, sk: slug },
    }),
  );
  if (reg.Item?.status === "revoked") return { status: "revoked" };

  if (
    reg.Item?.status === "active" &&
    typeof reg.Item.ownerPk === "string" &&
    typeof reg.Item.ownerSk === "string"
  ) {
    const got = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: reg.Item.ownerPk, sk: reg.Item.ownerSk },
      }),
    );
    if (got.Item && parseListenShare(got.Item.listenShare)) {
      return { status: "active", row: got.Item as Record<string, unknown> };
    }
    return { status: "revoked" };
  }

  const q = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: "listenSlugIndex",
      KeyConditionExpression: "listenSlug = :s",
      ExpressionAttributeValues: { ":s": slug },
      Limit: 1,
    }),
  );
  const row = q.Items?.[0] as Record<string, unknown> | undefined;
  if (row && parseListenShare(row.listenShare)) {
    return { status: "active", row };
  }
  return { status: "missing" };
}

async function resolvePath(
  tableName: string,
  username: string,
  pathKey: string,
): Promise<
  | { status: "active"; row: Record<string, unknown>; pathKey: string }
  | { status: "revoked" }
  | { status: "redirect"; to: string }
  | { status: "missing" }
> {
  const sk = `${username}/${pathKey}`;
  const reg = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk: LISTEN_PATH_PK, sk },
    }),
  );
  if (!reg.Item) return { status: "missing" };
  if (
    reg.Item.status === "revoked" &&
    typeof reg.Item.redirectTo === "string" &&
    reg.Item.redirectTo.trim()
  ) {
    return { status: "redirect", to: `/listen/${reg.Item.redirectTo.trim()}` };
  }
  if (reg.Item.status === "revoked") return { status: "revoked" };
  if (
    reg.Item.status === "active" &&
    typeof reg.Item.ownerPk === "string" &&
    typeof reg.Item.ownerSk === "string"
  ) {
    const got = await ddb.send(
      new GetCommand({
        TableName: tableName,
        Key: { pk: reg.Item.ownerPk, sk: reg.Item.ownerSk },
      }),
    );
    if (got.Item && parseListenShare(got.Item.listenShare)) {
      return {
        status: "active",
        row: got.Item as Record<string, unknown>,
        pathKey,
      };
    }
    return { status: "revoked" };
  }
  return { status: "missing" };
}

async function listListed(
  tableName: string,
  cfDomain: string | undefined,
  opts?: { username?: string },
): Promise<ListenPublicItem[]> {
  const items: ListenPublicItem[] = [];
  let lek: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: "listenListedIndex",
        KeyConditionExpression: "listenListed = :p",
        ExpressionAttributeValues: { ":p": LISTEN_LISTED_PK },
        ScanIndexForward: false,
        ExclusiveStartKey: lek,
      }),
    );
    for (const raw of out.Items ?? []) {
      const row = raw as Record<string, unknown>;
      const slug =
        typeof row.listenSlug === "string" && row.listenSlug.trim()
          ? row.listenSlug.trim()
          : "";
      if (!slug) continue;
      if (row.archived === true || row.isDraft === true) continue;
      if (opts?.username) {
        const u =
          typeof row.listenUsername === "string"
            ? row.listenUsername.trim().toLowerCase()
            : "";
        if (u !== opts.username) continue;
      }
      const item = toPublicItem(slug, row, cfDomain);
      if (item) items.push(item);
    }
    lek = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lek);
  return items;
}

function itemRedirectPath(item: ListenPublicItem): string | null {
  if (item.href) return item.href;
  if (item.username && item.pathSlug) {
    return listenPublicPath({
      username: item.username,
      pathSlug: item.pathSlug,
      listed: item.listed,
      linkToken: null,
    });
  }
  return null;
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  if (event.requestContext.http.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const tableName = process.env.MEDITATION_ANALYTICS_TABLE_NAME;
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!tableName) {
    return json(500, { error: "MEDITATION_ANALYTICS_TABLE_NAME is not set" });
  }

  const usernameParam =
    event.pathParameters?.username?.trim().toLowerCase() ||
    event.pathParameters?.slug?.trim().toLowerCase() ||
    "";
  const pathParam =
    event.pathParameters?.path?.trim() ||
    event.queryStringParameters?.path?.trim() ||
    "";

  try {
    // Item: /public/listen/{username}/{path}
    if (usernameParam && pathParam) {
      if (usernameParam.length < 2 || usernameParam.length > 40) {
        return json(400, { error: "Invalid username" });
      }
      if (pathParam.length < 2 || pathParam.length > 80) {
        return json(400, { error: "Invalid path" });
      }

      const userRes = await resolvePublicUsername(usernameParam);
      if (userRes.status === "redirect") {
        return json(200, {
          status: "redirect",
          redirectTo: `/listen/${encodeURIComponent(userRes.to)}/${encodeURIComponent(pathParam)}`,
        });
      }
      if (userRes.status === "missing") {
        return json(404, { error: "Not found" });
      }

      const resolved = await resolvePath(tableName, userRes.username, pathParam);
      if (resolved.status === "redirect") {
        return json(200, { status: "redirect", redirectTo: resolved.to });
      }
      if (resolved.status === "revoked") {
        return json(410, {
          error: "This link isn't shared any more",
          status: "revoked",
        });
      }
      if (resolved.status === "missing") {
        return json(404, { error: "Not found" });
      }

      const slug =
        typeof resolved.row.listenSlug === "string"
          ? resolved.row.listenSlug
          : pathParam;
      const item = toPublicItem(slug, resolved.row, cfDomain);
      if (!item) return json(404, { error: "Not found" });

      // Unlisted items must use the token path; clean path without token → 410.
      const share = parseListenShare(resolved.row.listenShare);
      if (share && !share.listed) {
        const token =
          typeof resolved.row.listenLinkToken === "string"
            ? resolved.row.listenLinkToken
            : "";
        const expected = token
          ? `${resolved.row.listenPathSlug}-${token}`
          : "";
        if (expected && pathParam !== expected) {
          return json(410, {
            error: "This link isn't shared any more",
            status: "revoked",
          });
        }
      }

      const listed = await listListed(tableName, cfDomain);
      const more = listed
        .filter((x) => x.slug !== item.slug && x.kind === "meditation")
        .slice(0, 3);

      return json(200, { item, more });
    }

    // Single segment: username page OR legacy flat slug
    if (usernameParam) {
      if (usernameParam.length < 2 || usernameParam.length > 80) {
        return json(400, { error: "Invalid slug" });
      }

      const userRes = await resolvePublicUsername(usernameParam);
      if (userRes.status === "redirect") {
        return json(200, {
          status: "redirect",
          redirectTo: `/listen/${encodeURIComponent(userRes.to)}`,
        });
      }
      if (userRes.status === "ok") {
        const listed = await listListed(tableName, cfDomain, {
          username: userRes.username,
        });
        if (!listed.length) {
          return json(404, { error: "Not found" });
        }
        const displayName =
          userRes.username === HOUSE_USERNAME
            ? "Consciously"
            : listed.find((x) => x.shownAs)?.shownAs || userRes.username;
        return json(200, {
          username: userRes.username,
          displayName,
          meditations: listed.filter((x) => x.kind === "meditation"),
          stories: listed.filter((x) => x.kind === "story"),
        });
      }

      // Legacy flat slug → redirect payload when possible.
      const legacy = await resolveLegacySlug(tableName, usernameParam);
      if (legacy.status === "revoked") {
        return json(410, {
          error: "This link isn't shared any more",
          status: "revoked",
        });
      }
      if (legacy.status === "active") {
        const item = toPublicItem(usernameParam, legacy.row, cfDomain);
        if (!item) return json(404, { error: "Not found" });
        const redirectTo = itemRedirectPath(item);
        if (redirectTo && redirectTo !== `/listen/${usernameParam}`) {
          return json(200, { status: "redirect", redirectTo, item });
        }
        const listed = await listListed(tableName, cfDomain);
        const more = listed
          .filter((x) => x.slug !== item.slug && x.kind === "meditation")
          .slice(0, 3);
        return json(200, { item, more });
      }
      return json(404, { error: "Not found" });
    }

    // Index
    const listed = await listListed(tableName, cfDomain);
    const house = listed.filter((x) => x.username === HOUSE_USERNAME || x.isExample);
    const community = listed.filter(
      (x) => x.username !== HOUSE_USERNAME && !x.isExample,
    );
    const meditations = [
      ...house.filter((x) => x.kind === "meditation"),
      ...community.filter((x) => x.kind === "meditation"),
    ];
    const stories = [
      ...house.filter((x) => x.kind === "story"),
      ...community.filter((x) => x.kind === "story"),
    ];
    return json(200, { meditations, stories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed";
    return json(500, { error: msg });
  }
}

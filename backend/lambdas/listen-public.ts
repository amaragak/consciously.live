/**
 * Public Listen endpoints (no auth):
 *   GET /public/listen          — index (examples + listed)
 *   GET /public/listen/{slug}   — shared item (200 / 410 / 404)
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
  LISTEN_SLUG_PK,
  coverUrlFromRow,
  parseListenShare,
  styleFromMeditationRow,
  type ListenPublicItem,
} from "./_shared/listen-share";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function json(
  statusCode: number,
  payload: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
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
  return {
    slug,
    kind: share.kind,
    title: share.title,
    description: share.description,
    shownAs: share.shownAs.trim() ? share.shownAs.trim() : null,
    showBrief: share.showBrief,
    brief: share.showBrief ? share.brief : null,
    listed: share.listed || share.isExample,
    isExample: share.isExample,
    style: styleFromMeditationRow(row),
    durationSec,
    audioUrl,
    coverImageUrl: coverUrlFromRow(row, cfDomain),
    storyText,
  };
}

async function resolveSlug(
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

async function listListed(
  tableName: string,
  cfDomain: string | undefined,
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
      const item = toPublicItem(slug, row, cfDomain);
      if (item) items.push(item);
    }
    lek = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (lek);
  return items;
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

  const slugParam =
    event.pathParameters?.slug?.trim() ||
    event.queryStringParameters?.slug?.trim() ||
    "";

  try {
    if (slugParam) {
      if (slugParam.length < 2 || slugParam.length > 80) {
        return json(400, { error: "Invalid slug" });
      }
      const resolved = await resolveSlug(tableName, slugParam);
      if (resolved.status === "revoked") {
        return json(410, { error: "This link isn't shared any more", status: "revoked" });
      }
      if (resolved.status === "missing") {
        return json(404, { error: "Not found" });
      }
      const item = toPublicItem(slugParam, resolved.row, cfDomain);
      if (!item) return json(404, { error: "Not found" });

      // Related: up to 3 other listed meditations.
      const listed = await listListed(tableName, cfDomain);
      const more = listed
        .filter((x) => x.slug !== item.slug && x.kind === "meditation")
        .slice(0, 3);

      return json(200, { item, more });
    }

    const listed = await listListed(tableName, cfDomain);
    const examples = listed.filter((x) => x.isExample);
    const community = listed.filter((x) => !x.isExample);
    const meditations = [
      ...examples.filter((x) => x.kind === "meditation"),
      ...community.filter((x) => x.kind === "meditation"),
    ];
    const stories = [
      ...examples.filter((x) => x.kind === "story"),
      ...community.filter((x) => x.kind === "story"),
    ];
    return json(200, { meditations, stories });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed";
    return json(500, { error: msg });
  }
}

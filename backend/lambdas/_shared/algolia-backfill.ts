/**
 * Backfill Algolia from Dynamo for one user (email + Cognito/Dynamo userId).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  ALGOLIA_GUEST_USER_ID,
  algoliaUserIdFromEmail,
  getAlgoliaCreds,
  replaceUserRecords,
  upsertRecords,
  type AlgoliaUserRecord,
} from "./algolia";
import { journalEntriesToAlgoliaRecords } from "./algolia-index-journal";
import {
  ideateBundleToAlgoliaRecords,
  MANIFEST_ALGOLIA_TYPES,
} from "./algolia-index-ideate";
import { meditationUserPk } from "./meditation-user-pk";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export type AlgoliaBackfillResult = {
  email: string;
  userId: string;
  journal: number;
  gratitude: number;
  manifest: number;
  meditation: number;
  total: number;
};

async function queryAllItems(
  table: string,
  pk: string,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const r = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :p",
        ExpressionAttributeValues: { ":p": pk },
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    for (const it of r.Items ?? []) {
      items.push(it as Record<string, unknown>);
    }
    startKey = r.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

function journalEntriesFromItems(
  items: Record<string, unknown>[],
): Array<{
  id: string;
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  contentHtml?: string;
  kind?: string;
  gratitude?: unknown;
  mood?: string;
  tags?: string[];
}> {
  const entries: Array<{
    id: string;
    createdAt?: string;
    updatedAt?: string;
    title?: string;
    contentHtml?: string;
    kind?: string;
    gratitude?: unknown;
    mood?: string;
    tags?: string[];
    listPosition: number;
  }> = [];

  for (const it of items) {
    const sk = typeof it.sk === "string" ? it.sk : "";
    if (!sk.startsWith("ENTRY#")) continue;
    const id = sk.slice("ENTRY#".length);
    if (!id) continue;
    if (
      typeof it.createdAt !== "string" ||
      typeof it.updatedAt !== "string" ||
      typeof it.title !== "string" ||
      typeof it.contentHtml !== "string"
    ) {
      continue;
    }
    entries.push({
      id,
      createdAt: it.createdAt,
      updatedAt: it.updatedAt,
      title: it.title,
      contentHtml: it.contentHtml,
      kind: it.kind === "gratitude" ? "gratitude" : undefined,
      gratitude: it.gratitude,
      mood: typeof it.mood === "string" ? it.mood : undefined,
      tags: Array.isArray(it.tags)
        ? it.tags.filter((t): t is string => typeof t === "string")
        : undefined,
      listPosition:
        typeof it.listPosition === "number" && Number.isFinite(it.listPosition)
          ? it.listPosition
          : entries.length,
    });
  }

  entries.sort((a, b) => a.listPosition - b.listPosition);
  return entries;
}

function meditationRecordsFromItems(
  algoliaUserId: string,
  items: Record<string, unknown>[],
): AlgoliaUserRecord[] {
  const out: AlgoliaUserRecord[] = [];
  for (const it of items) {
    const sk = typeof it.sk === "string" ? it.sk : "";
    if (!sk) continue;
    // Skip pure analytics-only rows without a title/draft identity.
    const title =
      typeof it.title === "string" && it.title.trim()
        ? it.title.trim()
        : null;
    if (!title) continue;
    if (it.archived === true) continue;
    const description =
      typeof it.description === "string" ? it.description.trim() : "";
    const style =
      typeof it.meditationStyle === "string" ? it.meditationStyle.trim() : "";
    const type =
      typeof it.meditationType === "string" ? it.meditationType.trim() : "";
    const updatedAt =
      Date.parse(
        (typeof it.updatedAt === "string" && it.updatedAt) ||
          (typeof it.createdAt === "string" && it.createdAt) ||
          "",
      ) || Date.now();
    out.push({
      objectID: `meditation:${sk}`,
      userId: algoliaUserId,
      type: "meditation",
      title,
      body: [description, style, type, it.favourite === true ? "favourite" : ""]
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000),
      href: `/meditate/library/creations?focus=${encodeURIComponent(sk)}`,
      updatedAt,
    });
  }
  return out;
}

export async function backfillAlgoliaForUser(opts: {
  email: string;
  /** Dynamo owner id (JWT `sub` / users.userId). */
  ownerId: string;
  journalTable: string;
  ideateTable: string;
  meditationTable: string;
  dryRun?: boolean;
}): Promise<AlgoliaBackfillResult> {
  const email = opts.email.trim().toLowerCase();
  const ownerId = opts.ownerId.trim();
  if (!email || !ownerId) {
    throw new Error("email and ownerId are required");
  }
  const algoliaUserId = algoliaUserIdFromEmail(email);

  if (!opts.dryRun) {
    const creds = await getAlgoliaCreds();
    if (!creds) {
      throw new Error(
        "Algolia not configured (set ALGOLIA_SECRET_ARN or secret medimade/ALGOLIA)",
      );
    }
  }

  const journalItems = await queryAllItems(opts.journalTable, ownerId);
  const journalEntries = journalEntriesFromItems(journalItems);
  const journalRecords = journalEntriesToAlgoliaRecords(
    algoliaUserId,
    journalEntries,
  );

  const ideateOut = await ddb.send(
    new GetCommand({
      TableName: opts.ideateTable,
      Key: { pk: ownerId, sk: "STORE" },
    }),
  );
  const ideateBundle = ideateOut.Item?.store ?? null;
  const manifestRecords = ideateBundle
    ? ideateBundleToAlgoliaRecords(algoliaUserId, ideateBundle)
    : [];

  const medItems = await queryAllItems(
    opts.meditationTable,
    meditationUserPk(ownerId),
  );
  const meditationRecords = meditationRecordsFromItems(
    algoliaUserId,
    medItems,
  );

  if (!opts.dryRun) {
    await replaceUserRecords({
      userId: algoliaUserId,
      types: ["journal", "gratitude"],
      records: journalRecords,
    });
    await replaceUserRecords({
      userId: algoliaUserId,
      types: [...MANIFEST_ALGOLIA_TYPES],
      records: manifestRecords,
    });
    await replaceUserRecords({
      userId: algoliaUserId,
      types: ["meditation"],
      records: meditationRecords,
    });
    // Belt-and-braces: ensure upserts landed even if deleteBy was empty.
    await upsertRecords([
      ...journalRecords,
      ...manifestRecords,
      ...meditationRecords,
    ]);
  }

  const gratitude = journalRecords.filter((r) => r.type === "gratitude").length;
  const journal = journalRecords.filter((r) => r.type === "journal").length;
  const total =
    journalRecords.length + manifestRecords.length + meditationRecords.length;

  return {
    email,
    userId: algoliaUserId,
    journal,
    gratitude,
    manifest: manifestRecords.length,
    meditation: meditationRecords.length,
    total,
  };
}

export { ALGOLIA_GUEST_USER_ID };

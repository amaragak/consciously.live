/**
 * Dynamo storage for Claude preprompts (VoiceAdmin pk/sk).
 * Written only by deploy seed; admin API is read-only.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  buildClaudePrepromptCatalog,
  type ClaudePrepromptEntry,
  type ClaudePrepromptKind,
} from "./claude-preprompts-catalog";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const CLAUDE_PREPROMPT_PK = "CLAUDE_PREPROMPT";
export const CLAUDE_PREPROMPT_META_SK = "_META";

export type ClaudePrepromptStored = ClaudePrepromptEntry & {
  deployedAt: string;
};

export type ClaudePrepromptMeta = {
  deployedAt: string;
  count: number;
  ids: string[];
};

function tableName(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function queryAllPrepromptItems(table: string): Promise<
  Array<{ pk: string; sk: string }>
> {
  const items: Array<{ pk: string; sk: string }> = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": CLAUDE_PREPROMPT_PK },
        ExclusiveStartKey,
        ProjectionExpression: "pk, sk",
      }),
    );
    for (const raw of out.Items ?? []) {
      if (typeof raw.pk === "string" && typeof raw.sk === "string") {
        items.push({ pk: raw.pk, sk: raw.sk });
      }
    }
    ExclusiveStartKey = out.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (ExclusiveStartKey);
  return items;
}

/**
 * Replace all Claude preprompt rows with the current codebase catalog.
 * Only called from deploy seed — never from the admin UI.
 */
export async function seedClaudePrepromptsToDynamo(params?: {
  tableName?: string;
  deployedAt?: string;
}): Promise<{ count: number; deployedAt: string; ids: string[] }> {
  const table = params?.tableName?.trim() || tableName();
  if (!table) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");

  const deployedAt = params?.deployedAt ?? new Date().toISOString();
  const catalog = buildClaudePrepromptCatalog();
  const ids = catalog.map((e) => e.id);

  const existing = await queryAllPrepromptItems(table);
  for (const batch of chunk(existing, 25)) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [table]: batch.map((item) => ({
            DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
          })),
        },
      }),
    );
  }

  const puts = [
    ...catalog.map((entry) => ({
      PutRequest: {
        Item: {
          pk: CLAUDE_PREPROMPT_PK,
          sk: entry.id,
          ...entry,
          deployedAt,
        },
      },
    })),
    {
      PutRequest: {
        Item: {
          pk: CLAUDE_PREPROMPT_PK,
          sk: CLAUDE_PREPROMPT_META_SK,
          deployedAt,
          count: catalog.length,
          ids,
        },
      },
    },
  ];

  for (const batch of chunk(puts, 25)) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: { [table]: batch },
      }),
    );
  }

  return { count: catalog.length, deployedAt, ids };
}

export async function listClaudePrepromptsFromDynamo(): Promise<{
  prompts: ClaudePrepromptStored[];
  meta: ClaudePrepromptMeta | null;
}> {
  const table = tableName();
  if (!table) return { prompts: [], meta: null };

  const prompts: ClaudePrepromptStored[] = [];
  let meta: ClaudePrepromptMeta | null = null;
  let ExclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": CLAUDE_PREPROMPT_PK },
        ExclusiveStartKey,
      }),
    );
    for (const raw of out.Items ?? []) {
      const sk = typeof raw.sk === "string" ? raw.sk : "";
      if (sk === CLAUDE_PREPROMPT_META_SK) {
        meta = {
          deployedAt:
            typeof raw.deployedAt === "string" ? raw.deployedAt : "",
          count: typeof raw.count === "number" ? raw.count : 0,
          ids: Array.isArray(raw.ids)
            ? raw.ids.filter((x): x is string => typeof x === "string")
            : [],
        };
        continue;
      }
      if (
        typeof raw.id !== "string" ||
        typeof raw.title !== "string" ||
        typeof raw.text !== "string"
      ) {
        continue;
      }
      prompts.push({
        id: raw.id,
        title: raw.title,
        feature: typeof raw.feature === "string" ? raw.feature : "",
        kind: (typeof raw.kind === "string"
          ? raw.kind
          : "system") as ClaudePrepromptKind,
        sourcePath:
          typeof raw.sourcePath === "string" ? raw.sourcePath : "",
        text: raw.text,
        sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : 0,
        deployedAt:
          typeof raw.deployedAt === "string" ? raw.deployedAt : "",
      });
    }
    ExclusiveStartKey = out.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (ExclusiveStartKey);

  prompts.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  return { prompts, meta };
}

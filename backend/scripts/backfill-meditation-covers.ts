/**
 * Generate gpt-image-1-mini cover art for library meditations missing coverImageKey.
 *
 *   AWS_PROFILE=mm npx tsx scripts/backfill-meditation-covers.ts
 *   AWS_PROFILE=mm npx tsx scripts/backfill-meditation-covers.ts --email=you@example.com
 *   AWS_PROFILE=mm npx tsx scripts/backfill-meditation-covers.ts --all --dry-run
 *   AWS_PROFILE=mm OPENAI_API_KEY=sk-… npx tsx scripts/backfill-meditation-covers.ts --limit=3
 *
 * Default email: Continue-as-guest account (alexmaragakis@hotmail.co.uk).
 * Uses OPENAI_API_KEY env, else Secrets Manager medimade/OPENAI_API_KEY.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  createPromptFromProvenance,
  generateAndStoreMeditationCover,
  type MeditationCoverInput,
} from "../lambdas/_shared/meditation-cover";
import {
  LEGACY_MEDITATION_PARTITION_PK,
  meditationUserPk,
} from "../lambdas/_shared/meditation-user-pk";
import { OPENAI_SECRET_NAME } from "../lib/consciously/secret-names";

const rawDdb = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(rawDdb, {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({});

const USERS =
  process.env.USERS_TABLE_NAME?.trim() ||
  "ConsciouslyBackend-DatabaseNestedStackDatabaseNestedStackResource223659CE-PHK3M7SWT1MT-UsersTable9725E9C8-NYX8VSTAJIBE";
const ANALYTICS =
  process.env.MEDITATION_ANALYTICS_TABLE_NAME?.trim() ||
  "ConsciouslyBackend-DatabaseNestedStackDatabaseNestedStackResource223659CE-PHK3M7SWT1MT-MeditationAnalyticsTableDBD22E65-L4UBT6X8Z3NR";
const MEDIA_BUCKET =
  process.env.MEDIA_BUCKET_NAME?.trim() ||
  "consciouslybackend-medianested-mediabucketbcbb02ba-teu1qg0gltjz";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const force = args.includes("--force");

function argValue(flag: string): string | null {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1]?.trim() || null;
}

const emailArg =
  argValue("--email") ??
  args
    .find((a) => a.startsWith("--email="))
    ?.slice("--email=".length)
    ?.trim()
    .toLowerCase() ??
  null;
const limitRaw = argValue("--limit") ?? args.find((a) => a.startsWith("--limit="))?.slice(8);
const limit = limitRaw ? Math.max(1, Number(limitRaw) || 0) : 0;

async function ensureOpenAiEnv(): Promise<void> {
  if (process.env.OPENAI_API_KEY?.trim() || process.env.OPENAI_SECRET_ARN?.trim()) {
    return;
  }
  process.env.OPENAI_SECRET_ARN = OPENAI_SECRET_NAME;
}

async function userIdForEmail(email: string): Promise<string> {
  const out = await ddb.send(
    new GetCommand({
      TableName: USERS,
      Key: { email: email.trim().toLowerCase() },
    }),
  );
  const uid = out.Item?.userId;
  if (typeof uid !== "string" || !uid.trim()) {
    throw new Error(`No userId for ${email}`);
  }
  return uid.trim();
}

type LibRow = {
  pk: string;
  sk: string;
  id: string;
  userId: string;
  title: string;
  description: string | null;
  meditationStyle: string | null;
  meditationType: string | null;
  coverImageKey: string | null;
  raw: Record<string, unknown>;
};

async function queryUserMeditations(userId: string): Promise<LibRow[]> {
  const pk = meditationUserPk(userId);
  const rows: LibRow[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: ANALYTICS,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of out.Items ?? []) {
      const parsed = parseRow(item as Record<string, unknown>, userId);
      if (parsed) rows.push(parsed);
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return rows;
}

function parseRow(
  item: Record<string, unknown>,
  userId: string,
): LibRow | null {
  const sk = typeof item.sk === "string" ? item.sk : "";
  const id = typeof item.id === "string" ? item.id.trim() : "";
  if (!sk || !id) return null;
  if (item.isDraft === true) return null;
  if (item.archived === true) return null;
  const s3Key = typeof item.s3Key === "string" ? item.s3Key.trim() : "";
  if (!s3Key) return null;
  return {
    pk: typeof item.pk === "string" ? item.pk : meditationUserPk(userId),
    sk,
    id,
    userId,
    title:
      (typeof item.title === "string" && item.title.trim()) || "Meditation",
    description:
      typeof item.description === "string" ? item.description.trim() : null,
    meditationStyle:
      typeof item.meditationStyle === "string"
        ? item.meditationStyle.trim()
        : null,
    meditationType:
      typeof item.meditationType === "string"
        ? item.meditationType.trim()
        : null,
    coverImageKey:
      typeof item.coverImageKey === "string" && item.coverImageKey.trim()
        ? item.coverImageKey.trim()
        : null,
    raw: item,
  };
}

async function scanAllMeditations(): Promise<LibRow[]> {
  const rows: LibRow[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: ANALYTICS,
        ExclusiveStartKey: startKey,
      }),
    );
    for (const item of out.Items ?? []) {
      const pk = typeof item.pk === "string" ? item.pk : "";
      if (!pk.startsWith("USER#") && pk !== LEGACY_MEDITATION_PARTITION_PK) {
        continue;
      }
      const userId = pk.startsWith("USER#")
        ? pk.slice(5)
        : "_";
      const parsed = parseRow(item as Record<string, unknown>, userId);
      if (parsed) rows.push(parsed);
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return rows;
}

async function resolveBucket(): Promise<string> {
  return (
    argValue("--bucket") ??
    process.env.MEDIA_BUCKET_NAME?.trim() ??
    MEDIA_BUCKET
  );
}

async function main(): Promise<void> {
  await ensureOpenAiEnv();
  const bucket = await resolveBucket();

  let rows: LibRow[];
  if (all) {
    console.log("scanning all library rows…");
    rows = await scanAllMeditations();
  } else {
    const email =
      emailArg || "alexmaragakis@hotmail.co.uk";
    const userId = await userIdForEmail(email);
    console.log(`user ${email} → ${userId}`);
    rows = await queryUserMeditations(userId);
  }

  const targets = rows.filter((r) => force || !r.coverImageKey);
  console.log(
    `found ${rows.length} catalogued meditations, ${targets.length} need covers` +
      (limit ? ` (limit ${limit})` : ""),
  );

  let done = 0;
  for (const row of targets) {
    if (limit && done >= limit) break;
    const input: MeditationCoverInput = {
      title: row.title,
      description: row.description,
      meditationStyle: row.meditationStyle,
      meditationType: row.meditationType,
      createPrompt: createPromptFromProvenance(
        row.raw.creationProvenance as Record<string, unknown> | undefined,
      ),
    };
    if (dryRun) {
      console.log("would cover", row.id, row.title);
      done += 1;
      continue;
    }
    const key = await generateAndStoreMeditationCover({
      s3,
      bucket,
      userId: row.userId,
      meditationId: row.id,
      input,
    });
    if (!key) {
      console.warn("failed", row.id, row.title);
      continue;
    }
    await ddb.send(
      new UpdateCommand({
        TableName: ANALYTICS,
        Key: { pk: row.pk, sk: row.sk },
        UpdateExpression: "SET coverImageKey = :k",
        ExpressionAttributeValues: { ":k": key },
      }),
    );
    console.log("ok", row.id, key);
    done += 1;
  }
  console.log(`done ${done}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

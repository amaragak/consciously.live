/**
 * Re-encode every background-audio bed AAC as stereo, re-applying catalog
 * trim/EQ when present. Invokes AdminSoundsEqFunction async workers.
 *
 *   AWS_PROFILE=mm AWS_REGION=eu-west-2 \
 *     npx tsx scripts/backfill-bg-stereo-rebake.ts --dry-run
 *   AWS_PROFILE=mm AWS_REGION=eu-west-2 \
 *     npx tsx scripts/backfill-bg-stereo-rebake.ts --concurrency 4
 *   AWS_PROFILE=mm AWS_REGION=eu-west-2 \
 *     npx tsx scripts/backfill-bg-stereo-rebake.ts --only-edits
 */

import {
  InvokeCommand,
  LambdaClient,
  ListFunctionsCommand,
} from "@aws-sdk/client-lambda";
import {
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { BG_AUDIO_PREFIX } from "../lambdas/_shared/background-audio-keys";
import { STREAMING_BAKE_DETAIL_REBAKE } from "../lambdas/_shared/sound-streaming-bake-async";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const onlyEdits = args.includes("--only-edits");

function argValue(flag: string): string | null {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  return args[i + 1]?.trim() || null;
}

const bucket =
  argValue("--bucket") ??
  process.env.MEDIA_BUCKET_NAME ??
  "consciouslybackend-medianested-mediabucketbcbb02ba-teu1qg0gltjz";
const table =
  argValue("--table") ??
  process.env.SOUND_CATALOG_TABLE_NAME ??
  "";
const concurrency = Math.max(1, Number(argValue("--concurrency") ?? "3") || 3);
const waveSize = Math.max(1, Number(argValue("--wave") ?? String(concurrency)) || concurrency);
const limit = Number(argValue("--limit") ?? "0") || 0;
const waveTimeoutMs = Math.max(
  60_000,
  Number(argValue("--wave-timeout-ms") ?? String(14 * 60 * 1000)) || 14 * 60 * 1000,
);

const s3 = new S3Client({});
const lambda = new LambdaClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function resolveEqFunctionName(): Promise<string> {
  const fromEnv = process.env.ADMIN_SOUNDS_EQ_FUNCTION?.trim();
  if (fromEnv) return fromEnv;
  let marker: string | undefined;
  do {
    const page = await lambda.send(
      new ListFunctionsCommand({ Marker: marker, MaxItems: 50 }),
    );
    const hit = (page.Functions ?? []).find((f) =>
      (f.FunctionName ?? "").includes("AdminSoundsEqFunction"),
    );
    if (hit?.FunctionName) return hit.FunctionName;
    marker = page.NextMarker;
  } while (marker);
  throw new Error("AdminSoundsEqFunction not found");
}

async function resolveTableName(): Promise<string> {
  if (table) return table;
  const { CloudFormationClient, ListStackResourcesCommand } = await import(
    "@aws-sdk/client-cloudformation"
  );
  const cfn = new CloudFormationClient({});
  // Nested DB stack physical id varies; scan SoundCatalog via env is preferred.
  const env = process.env.SOUND_CATALOG_TABLE_NAME?.trim();
  if (env) return env;
  // Fallback: known ConsciouslyBackend database nested stack resource name pattern
  // — caller should pass --table if this fails.
  throw new Error(
    "SOUND_CATALOG_TABLE_NAME or --table required (and MEDIA_BUCKET_NAME)",
  );
}

async function listWavStems(): Promise<string[]> {
  const stems = new Set<string>();
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: BG_AUDIO_PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key;
      if (!key || !key.toLowerCase().endsWith(".wav")) continue;
      // Skip pack internals under Ambient-Meditations etc. that aren't beds?
      // Include all — rebake no-ops meaningfully only if wav decodes.
      stems.add(key.slice(0, -4));
    }
    token = page.NextContinuationToken;
  } while (token);
  return [...stems].sort();
}

type CatalogFlags = { hasEq: boolean; hasTrim: boolean };

async function loadCatalogFlags(
  tableName: string,
): Promise<Map<string, CatalogFlags>> {
  const map = new Map<string, CatalogFlags>();
  let startKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression:
          "sk, eqBands, trimStartSec, trimEndSec, fadeInSec, fadeOutSec",
        ExclusiveStartKey: startKey,
      }),
    );
    for (const it of out.Items ?? []) {
      const sk = typeof it.sk === "string" ? it.sk : "";
      if (!sk.startsWith(BG_AUDIO_PREFIX)) continue;
      const bands = Array.isArray(it.eqBands) ? it.eqBands : [];
      const start = Number(it.trimStartSec ?? 0);
      const end = it.trimEndSec;
      const fi = Number(it.fadeInSec ?? 0);
      const fo = Number(it.fadeOutSec ?? 0);
      const hasTrim =
        (Number.isFinite(start) && start > 0.01) ||
        (end != null && end !== "" && Number.isFinite(Number(end))) ||
        (Number.isFinite(fi) && fi > 0) ||
        (Number.isFinite(fo) && fo > 0);
      map.set(sk, { hasEq: bands.length > 0, hasTrim });
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return map;
}

async function markStarted(tableName: string, mp3Key: string): Promise<void> {
  const now = new Date().toISOString();
  const { UpdateCommand } = await import("@aws-sdk/lib-dynamodb");
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { pk: "SOUND", sk: mp3Key },
        UpdateExpression: "SET processing = :p, updatedAt = :u",
        ExpressionAttributeValues: {
          ":p": {
            stage: "encoding",
            detail: STREAMING_BAKE_DETAIL_REBAKE,
            updatedAt: now,
          },
          ":u": now,
        },
        ConditionExpression: "attribute_exists(sk)",
      }),
    );
  } catch {
    /* orphan wav without catalog row — worker still encodes AAC */
  }
}

async function invokeRebake(fn: string, mp3Key: string): Promise<void> {
  await lambda.send(
    new InvokeCommand({
      FunctionName: fn,
      InvocationType: "Event",
      Payload: Buffer.from(
        JSON.stringify({
          worker: true,
          job: { kind: "rebake", mp3Key },
        }),
      ),
    }),
  );
}

async function waitWaveDone(
  tableName: string,
  mp3Keys: string[],
  startedAt: string,
): Promise<{ ok: string[]; failed: string[]; timedOut: string[] }> {
  const pending = new Set(mp3Keys);
  const ok: string[] = [];
  const failed: string[] = [];
  const deadline = Date.now() + waveTimeoutMs;
  const { GetCommand } = await import("@aws-sdk/lib-dynamodb");

  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    for (const key of [...pending]) {
      try {
        const res = await ddb.send(
          new GetCommand({
            TableName: tableName,
            Key: { pk: "SOUND", sk: key },
            ConsistentRead: true,
          }),
        );
        const proc = res.Item?.processing as
          | { stage?: string; detail?: string; updatedAt?: string; error?: string }
          | undefined;
        if (!proc) continue;
        const stage = proc.stage;
        const detail = typeof proc.detail === "string" ? proc.detail : "";
        const updated = typeof proc.updatedAt === "string" ? proc.updatedAt : "";
        if (stage === "failed" && detail.includes("stereo-rebake")) {
          failed.push(key);
          pending.delete(key);
          console.error(`  FAIL ${key}: ${proc.error ?? detail}`);
          continue;
        }
        if (
          stage === "done" &&
          detail.includes("stereo-rebake") &&
          updated >= startedAt
        ) {
          ok.push(key);
          pending.delete(key);
        }
      } catch {
        /* retry */
      }
    }
    if (pending.size > 0) {
      console.log(`  … waiting ${pending.size} in wave`);
    }
  }
  return { ok, failed, timedOut: [...pending] };
}

async function main(): Promise<void> {
  const tableName =
    process.env.SOUND_CATALOG_TABLE_NAME?.trim() ||
    argValue("--table") ||
    "ConsciouslyBackend-DatabaseNestedStackDatabaseNestedStackResource223659CE-PHK3M7SWT1MT-SoundCatalogTable9BD8B920-1SCZCJHWQX328";

  const fn = await resolveEqFunctionName();
  const stems = await listWavStems();
  const flags = await loadCatalogFlags(tableName);

  let jobs = stems.map((stem) => {
    const mp3Key = `${stem}.mp3`;
    const f = flags.get(mp3Key) ?? { hasEq: false, hasTrim: false };
    return { mp3Key, ...f };
  });
  // EQ/trim beds first so edited masters recover before the long tail.
  jobs.sort((a, b) => {
    const ae = a.hasEq || a.hasTrim ? 0 : 1;
    const be = b.hasEq || b.hasTrim ? 0 : 1;
    if (ae !== be) return ae - be;
    return a.mp3Key.localeCompare(b.mp3Key);
  });
  if (onlyEdits) {
    jobs = jobs.filter((j) => j.hasEq || j.hasTrim);
  }
  if (limit > 0) jobs = jobs.slice(0, limit);

  const withEdits = jobs.filter((j) => j.hasEq || j.hasTrim).length;
  console.log(
    `[stereo-rebake] ${jobs.length} beds (${withEdits} with EQ/trim), fn=${fn}, wave=${waveSize}${dryRun ? " (dry-run)" : ""}`,
  );

  if (dryRun) {
    for (const j of jobs.slice(0, 40)) {
      console.log(
        `  ${j.mp3Key}${j.hasEq ? " eq" : ""}${j.hasTrim ? " trim" : ""}`,
      );
    }
    if (jobs.length > 40) console.log(`  … +${jobs.length - 40} more`);
    return;
  }

  let okTotal = 0;
  let failTotal = 0;
  let timeoutTotal = 0;

  for (let offset = 0; offset < jobs.length; offset += waveSize) {
    const wave = jobs.slice(offset, offset + waveSize);
    const startedAt = new Date().toISOString();
    console.log(
      `[stereo-rebake] wave ${Math.floor(offset / waveSize) + 1} — ${wave.length} jobs (from ${offset + 1})`,
    );
    for (const job of wave) {
      await markStarted(tableName, job.mp3Key);
      await invokeRebake(fn, job.mp3Key);
      console.log(
        `  queued ${job.mp3Key}${job.hasEq ? " eq" : ""}${job.hasTrim ? " trim" : ""}`,
      );
    }
    // Orphans without catalog rows won't update processing — don't wait forever.
    const waitKeys = wave
      .map((j) => j.mp3Key)
      .filter((k) => flags.has(k));
    if (waitKeys.length === 0) {
      await new Promise((r) => setTimeout(r, 30_000));
      continue;
    }
    const result = await waitWaveDone(tableName, waitKeys, startedAt);
    okTotal += result.ok.length;
    failTotal += result.failed.length;
    timeoutTotal += result.timedOut.length;
    for (const k of result.timedOut) {
      console.error(`  TIMEOUT ${k}`);
    }
    console.log(
      `[stereo-rebake] wave done — ok=${result.ok.length} fail=${result.failed.length} timeout=${result.timedOut.length} | totals ok=${okTotal} fail=${failTotal} timeout=${timeoutTotal}`,
    );
  }

  console.log(
    `[stereo-rebake] complete — ok=${okTotal} fail=${failTotal} timeout=${timeoutTotal}`,
  );
  if (failTotal + timeoutTotal > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

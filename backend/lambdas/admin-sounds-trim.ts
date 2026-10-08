import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  CopyObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  BG_AUDIO_PREFIX,
  originalKeyForPublicKey,
  parseBgAudioKey,
  siblingWavKey,
} from "./_shared/background-audio-keys";
import { coerceSoundEqBands } from "./_shared/sound-eq-bands";
import { bakeStreamingAac } from "./_shared/sound-streaming-bake";
import {
  enqueueStreamingBakeWorker,
  isStreamingBakeWorkerEvent,
  markStreamingBakeFailed,
  markStreamingBakeStarted,
  STREAMING_BAKE_DETAIL_TRIM,
} from "./_shared/sound-streaming-bake-async";
import {
  getSoundRow,
  putSoundRow,
  soundEnabledFromStatus,
  type SoundCatalogRow,
} from "./_shared/sound-catalog";

const s3 = new S3Client({});

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload);
}

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function copyObject(bucket: string, fromKey: string, toKey: string): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${fromKey}`,
      Key: toKey,
      MetadataDirective: "COPY",
    }),
  );
}

function buildRow(params: {
  mp3Key: string;
  existing: SoundCatalogRow | null;
  archiveKey: string | undefined;
  startSec: number;
  endSec: number | null;
  fadeInSec: number;
  fadeOutSec: number;
  now: string;
  keepEq: boolean;
}): SoundCatalogRow {
  const { mp3Key, existing, archiveKey, startSec, endSec, fadeInSec, fadeOutSec, now } =
    params;
  const parsed = parseBgAudioKey(mp3Key);
  return {
    pk: "SOUND",
    sk: mp3Key,
    name: existing?.name ?? parsed?.name ?? mp3Key,
    category: existing?.category ?? parsed?.category ?? "music",
    subcategory: existing?.subcategory,
    categoryPinned: existing?.categoryPinned,
    suggestedCategory: existing?.suggestedCategory,
    suggestedSubcategory: existing?.suggestedSubcategory,
    suggestedName: existing?.suggestedName,
    packPath: existing?.packPath,
    tags: existing?.tags ?? [],
    status: existing?.status ?? "in_use",
    enabled: soundEnabledFromStatus(existing?.status ?? "in_use"),
    notes: existing?.notes,
    originalKey: archiveKey ?? existing?.originalKey,
    trimStartSec: startSec,
    trimEndSec: endSec,
    fadeInSec,
    fadeOutSec,
    streamingEditedAt: now,
    eqBands:
      params.keepEq && coerceSoundEqBands(existing?.eqBands).length
        ? existing?.eqBands
        : undefined,
    processing: {
      stage: "done",
      detail: STREAMING_BAKE_DETAIL_TRIM,
      updatedAt: now,
    },
    importedAt: existing?.importedAt ?? existing?.updatedAt,
    updatedAt: now,
    coverImageKey: existing?.coverImageKey,
    coverImageUrl: existing?.coverImageUrl,
    coverImageThumbKey: existing?.coverImageThumbKey,
    coverImageThumbUrl: existing?.coverImageThumbUrl,
    lastCoverPrompt: existing?.lastCoverPrompt,
    coverPromptHistory: existing?.coverPromptHistory,
    binauralHz: existing?.binauralHz,
    adminFavourite: existing?.adminFavourite,
    customPackName: existing?.customPackName,
  };
}

type TrimJob = {
  kind: "trim";
  mp3Key: string;
  clearTrim: boolean;
  clearEq: boolean;
  startSec: number;
  endSec: number | null;
  fadeInSec: number;
  fadeOutSec: number;
  archiveKey?: string;
};

async function runTrimBake(job: TrimJob): Promise<void> {
  const bucket = process.env.MEDIA_BUCKET_NAME;
  if (!bucket) throw new Error("MEDIA_BUCKET_NAME is not set");
  const existing = await getSoundRow(job.mp3Key);

  let nextStart = job.startSec;
  let nextEnd = job.endSec;
  let nextFi = job.fadeInSec;
  let nextFo = job.fadeOutSec;
  if (job.clearTrim) {
    nextStart = 0;
    nextEnd = null;
    nextFi = 0;
    nextFo = 0;
  } else if (job.clearEq) {
    const catalogStart = Number(existing?.trimStartSec ?? 0);
    const catalogEndRaw = existing?.trimEndSec;
    nextStart = Number.isFinite(catalogStart) && catalogStart > 0 ? catalogStart : 0;
    nextEnd =
      catalogEndRaw === null || catalogEndRaw === undefined
        ? null
        : Number(catalogEndRaw);
    if (nextEnd != null && !Number.isFinite(nextEnd)) nextEnd = null;
    const catalogFi = Number(existing?.fadeInSec ?? 0);
    const catalogFo = Number(existing?.fadeOutSec ?? 0);
    nextFi = Number.isFinite(catalogFi) && catalogFi > 0 ? catalogFi : 0;
    nextFo = Number.isFinite(catalogFo) && catalogFo > 0 ? catalogFo : 0;
  }
  const keepEq = !job.clearEq;

  await bakeStreamingAac({
    s3,
    bucket,
    mp3Key: job.mp3Key,
    preferOriginal: true,
    trimStartSec: nextStart,
    trimEndSec: nextEnd,
    fadeInSec: nextFi,
    fadeOutSec: nextFo,
    eqBands: keepEq ? existing?.eqBands ?? [] : [],
  });

  const doneAt = new Date().toISOString();
  await putSoundRow(
    buildRow({
      mp3Key: job.mp3Key,
      existing,
      archiveKey: job.archiveKey,
      startSec: nextStart,
      endSec: nextEnd,
      fadeInSec: nextFi,
      fadeOutSec: nextFo,
      now: doneAt,
      keepEq,
    }),
  );
}

export async function handler(
  event: APIGatewayProxyEventV2 | Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2 | void> {
  if (isStreamingBakeWorkerEvent(event)) {
    const job = event.job as TrimJob;
    if (job?.kind !== "trim" || typeof job.mp3Key !== "string") {
      console.error("admin-sounds-trim worker: bad job", event.job);
      return;
    }
    try {
      await runTrimBake(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("admin-sounds-trim worker", msg);
      await markStreamingBakeFailed(job.mp3Key, STREAMING_BAKE_DETAIL_TRIM, msg);
    }
    return;
  }

  const httpEvent = event as APIGatewayProxyEventV2;
  if (httpEvent.requestContext?.http?.method === "OPTIONS") {
    return json(204, {});
  }
  if (httpEvent.requestContext?.http?.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const admin = await requireAdminJson(httpEvent);
  if ("statusCode" in admin) return admin;

  const bucket = process.env.MEDIA_BUCKET_NAME;
  if (!bucket) return json(500, { error: "MEDIA_BUCKET_NAME is not set" });

  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(httpEvent.body || "{}") as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith(BG_AUDIO_PREFIX)) {
    return json(400, { error: "key must be a background-audio object" });
  }

  const clearTrim =
    body.clear === true ||
    body.clear === "true" ||
    body.action === "clear" ||
    body.clearTrim === true ||
    body.clearTrim === "true";
  const clearEq =
    body.clearEq === true ||
    body.clearEq === "true" ||
    body.action === "clearEq";
  const mp3Key = key.toLowerCase().endsWith(".wav")
    ? `${key.slice(0, -4)}.mp3`
    : key;
  const wavKey = siblingWavKey(mp3Key) ?? `${mp3Key.slice(0, -4)}.wav`;
  const origMp3 = originalKeyForPublicKey(mp3Key);
  const origWav = originalKeyForPublicKey(wavKey);

  let startSec = 0;
  let endSec: number | null = null;
  let fadeInSec = 0;
  let fadeOutSec = 0;

  if (!clearTrim && !clearEq) {
    startSec = Number(body.startSec ?? 0);
    const endSecRaw = body.endSec;
    endSec =
      endSecRaw === null || endSecRaw === undefined || endSecRaw === ""
        ? null
        : Number(endSecRaw);
    if (!Number.isFinite(startSec) || startSec < 0) {
      return json(400, { error: "startSec must be a non-negative number" });
    }
    if (endSec != null && (!Number.isFinite(endSec) || endSec <= startSec)) {
      return json(400, { error: "endSec must be greater than startSec" });
    }
    function fadeArg(raw: unknown): number {
      const n = Number(raw ?? 0);
      if (!Number.isFinite(n) || n <= 0) return 0;
      return Math.min(n, 30);
    }
    fadeInSec = fadeArg(body.fadeInSec);
    fadeOutSec = fadeArg(body.fadeOutSec);
  }

  try {
    // Fast archive copies stay on the request path; AAC bake is async.
    if (!(await objectExists(bucket, origWav)) && (await objectExists(bucket, wavKey))) {
      await copyObject(bucket, wavKey, origWav);
    }
    if (!(await objectExists(bucket, origMp3)) && (await objectExists(bucket, mp3Key))) {
      await copyObject(bucket, mp3Key, origMp3);
    }

    const existing = await getSoundRow(mp3Key);
    const hasOrigWav = await objectExists(bucket, origWav);
    const hasOrigMp3 = await objectExists(bucket, origMp3);
    const archiveKey = hasOrigWav ? origWav : hasOrigMp3 ? origMp3 : undefined;

    let nextStart = startSec;
    let nextEnd = endSec;
    let nextFi = fadeInSec;
    let nextFo = fadeOutSec;
    if (clearTrim) {
      nextStart = 0;
      nextEnd = null;
      nextFi = 0;
      nextFo = 0;
    } else if (clearEq) {
      const catalogStart = Number(existing?.trimStartSec ?? 0);
      const catalogEndRaw = existing?.trimEndSec;
      nextStart = Number.isFinite(catalogStart) && catalogStart > 0 ? catalogStart : 0;
      nextEnd =
        catalogEndRaw === null || catalogEndRaw === undefined
          ? null
          : Number(catalogEndRaw);
      if (nextEnd != null && !Number.isFinite(nextEnd)) nextEnd = null;
      const catalogFi = Number(existing?.fadeInSec ?? 0);
      const catalogFo = Number(existing?.fadeOutSec ?? 0);
      nextFi = Number.isFinite(catalogFi) && catalogFi > 0 ? catalogFi : 0;
      nextFo = Number.isFinite(catalogFo) && catalogFo > 0 ? catalogFo : 0;
    }

    const bakeStartedAt = await markStreamingBakeStarted(
      mp3Key,
      STREAMING_BAKE_DETAIL_TRIM,
      existing,
    );
    await enqueueStreamingBakeWorker({
      kind: "trim",
      mp3Key,
      clearTrim,
      clearEq,
      startSec: nextStart,
      endSec: nextEnd,
      fadeInSec: nextFi,
      fadeOutSec: nextFo,
      archiveKey,
    } satisfies TrimJob);

    return json(202, {
      ok: true,
      accepted: true,
      async: true,
      key: mp3Key,
      bakeStartedAt,
      cleared: clearTrim || undefined,
      clearedEq: clearEq || undefined,
      originalKey: archiveKey ?? null,
      startSec: nextStart,
      endSec: nextEnd,
      fadeInSec: nextFi,
      fadeOutSec: nextFo,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-sounds-trim enqueue", msg);
    return json(500, { error: msg });
  }
}

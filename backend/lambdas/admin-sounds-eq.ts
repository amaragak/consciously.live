import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { S3Client } from "@aws-sdk/client-s3";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  BG_AUDIO_PREFIX,
  parseBgAudioKey,
  siblingWavKey,
} from "./_shared/background-audio-keys";
import { AAC_EXTENSION, siblingAacKey } from "./_shared/audio-aac";
import { coerceSoundEqBands } from "./_shared/sound-eq-bands";
import { bakeStreamingAac } from "./_shared/sound-streaming-bake";
import {
  enqueueStreamingBakeWorker,
  isStreamingBakeWorkerEvent,
  markStreamingBakeFailed,
  markStreamingBakeStarted,
  STREAMING_BAKE_DETAIL_EQ,
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

type EqJob = {
  kind: "eq";
  mp3Key: string;
  clear: boolean;
  bands: ReturnType<typeof coerceSoundEqBands>;
};

async function runEqBake(job: EqJob): Promise<{
  streamingEditedAt: string;
  bands: EqJob["bands"];
  aacKey: string;
  wavKey: string;
  filter: string | null;
}> {
  const { mp3Key, clear } = job;
  const bands = clear ? [] : job.bands;
  const bucket = process.env.MEDIA_BUCKET_NAME;
  if (!bucket) throw new Error("MEDIA_BUCKET_NAME is not set");

  const wavKey = siblingWavKey(mp3Key) ?? `${mp3Key.slice(0, -4)}.wav`;
  const aacKey = siblingAacKey(mp3Key) ?? `${mp3Key.slice(0, -4)}${AAC_EXTENSION}`;
  const existing = await getSoundRow(mp3Key);

  const trimStart = Number(existing?.trimStartSec ?? 0);
  const trimEndRaw = existing?.trimEndSec;
  const trimEnd =
    trimEndRaw === null || trimEndRaw === undefined ? null : Number(trimEndRaw);
  const fadeInSec = Number(existing?.fadeInSec ?? 0);
  const fadeOutSec = Number(existing?.fadeOutSec ?? 0);

  const eqBands = bands.map((b) => ({
    type: b.type,
    frequency: b.frequency,
    Q: b.Q,
    gain: b.gain,
    enabled: true as const,
  }));
  const parsed = parseBgAudioKey(mp3Key);

  const bake = await bakeStreamingAac({
    s3,
    bucket,
    mp3Key,
    preferOriginal: true,
    trimStartSec: Number.isFinite(trimStart) ? trimStart : 0,
    trimEndSec: trimEnd != null && Number.isFinite(trimEnd) ? trimEnd : null,
    fadeInSec: Number.isFinite(fadeInSec) ? fadeInSec : 0,
    fadeOutSec: Number.isFinite(fadeOutSec) ? fadeOutSec : 0,
    eqBands: bands,
  });

  const now = new Date().toISOString();
  const next: SoundCatalogRow = existing
    ? {
        ...existing,
        enabled: soundEnabledFromStatus(existing.status),
        streamingEditedAt: now,
        eqBands: clear ? undefined : eqBands,
        processing: {
          stage: "done",
          detail: STREAMING_BAKE_DETAIL_EQ,
          updatedAt: now,
        },
        updatedAt: now,
      }
    : {
        pk: "SOUND",
        sk: mp3Key,
        name: parsed?.name ?? mp3Key,
        category: parsed?.category ?? "music",
        tags: [],
        status: "categorised",
        enabled: true,
        streamingEditedAt: now,
        eqBands: clear ? undefined : eqBands,
        processing: {
          stage: "done",
          detail: STREAMING_BAKE_DETAIL_EQ,
          updatedAt: now,
        },
        updatedAt: now,
      };
  await putSoundRow(next);

  return {
    streamingEditedAt: now,
    bands: clear ? [] : eqBands,
    aacKey: bake.aacKey || aacKey,
    wavKey: bake.wavKey || wavKey,
    filter: bake.filter,
  };
}

export async function handler(
  event: APIGatewayProxyEventV2 | Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2 | void> {
  if (isStreamingBakeWorkerEvent(event)) {
    const job = event.job as EqJob;
    if (job?.kind !== "eq" || typeof job.mp3Key !== "string") {
      console.error("admin-sounds-eq worker: bad job", event.job);
      return;
    }
    try {
      await runEqBake(job);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("admin-sounds-eq worker", msg);
      await markStreamingBakeFailed(job.mp3Key, STREAMING_BAKE_DETAIL_EQ, msg);
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

  if (!process.env.MEDIA_BUCKET_NAME) {
    return json(500, { error: "MEDIA_BUCKET_NAME is not set" });
  }

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

  const clear =
    body.clear === true ||
    body.clear === "true" ||
    body.action === "clear";
  const bands = clear ? [] : coerceSoundEqBands(body.bands);
  if (!clear && bands.length === 0) {
    return json(400, { error: "At least one active EQ band is required" });
  }

  const mp3Key = key.toLowerCase().endsWith(".wav")
    ? `${key.slice(0, -4)}.mp3`
    : key;

  try {
    const existing = await getSoundRow(mp3Key);
    const bakeStartedAt = await markStreamingBakeStarted(
      mp3Key,
      STREAMING_BAKE_DETAIL_EQ,
      existing,
    );
    await enqueueStreamingBakeWorker({
      kind: "eq",
      mp3Key,
      clear,
      bands,
    } satisfies EqJob);
    return json(202, {
      ok: true,
      accepted: true,
      async: true,
      key: mp3Key,
      bakeStartedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("admin-sounds-eq enqueue", msg);
    return json(500, { error: "EQ apply failed", detail: msg.slice(0, 2000) });
  }
}

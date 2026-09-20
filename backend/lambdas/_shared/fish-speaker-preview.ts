import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CreateInvalidationCommand,
  CloudFrontClient,
} from "@aws-sdk/client-cloudfront";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loudnormMp3Buffer } from "./ffmpeg-loudnorm";
import { putVoiceStemStreams, voiceStemStreamKeys } from "./voice-stem-stream";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  speakerPreviewLoudDrySampleKey,
  speakerPreviewLoudFxSampleKey,
  speakerPreviewLoudSampleKey,
  speakerPreviewLoudWetSampleKey,
  speakerPreviewSampleKey,
} from "./speaker-sample-speed";

const execFileAsync = promisify(execFile);
const cloudfront = new CloudFrontClient({});
const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
export const SPEAKER_PREVIEW_TEXT = "Welcome to your personalised meditation.";
const LOUD_PREVIEW_SECONDS = 6;
const MIXER_VOICE_FX_PRESET = "mixer";
/** Create plays these bare CDN URLs; immutable year-cache kept the old rate. */
const SPEAKER_SAMPLE_CACHE_CONTROL = "public, max-age=0, must-revalidate";

async function invalidateSpeakerPreviewKeys(keys: string[]): Promise<void> {
  const distId = process.env.MEDIA_CLOUDFRONT_DISTRIBUTION_ID?.trim();
  if (!distId || keys.length === 0) return;
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: distId,
      InvalidationBatch: {
        CallerReference: `speaker-preview-${Date.now()}`,
        Paths: {
          Quantity: keys.length,
          Items: keys.map((k) => `/${k}`),
        },
      },
    }),
  );
}

function fishTtsModel(): string {
  return (process.env.FISH_TTS_MODEL || "s2.1-pro-free").trim() || "s2.1-pro-free";
}

function isS3ObjectMissing(e: unknown): boolean {
  const err = e as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  if (err.$metadata?.httpStatusCode === 404) return true;
  const code = err.name ?? err.Code;
  return code === "NotFound" || code === "NoSuchKey";
}

async function s3ObjectExists(
  s3: S3Client,
  bucket: string,
  key: string,
): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e: unknown) {
    if (isS3ObjectMissing(e)) return false;
    throw e;
  }
}

export async function speakerPreviewExists(
  s3: S3Client,
  bucket: string,
  modelId: string,
  brand?: "fish" | "speechify" | null,
): Promise<boolean> {
  const key = speakerPreviewLoudSampleKey(
    modelId,
    FIXED_SPEECH_PREVIEW_SPEED,
    brand,
  );
  return s3ObjectExists(s3, bucket, key);
}

async function speakerStemStreamsReady(
  s3: S3Client,
  bucket: string,
  wavKey: string,
): Promise<boolean> {
  const streams = voiceStemStreamKeys(wavKey);
  if (!streams) return false;
  const [wav, mp3, opus] = await Promise.all([
    s3ObjectExists(s3, bucket, wavKey),
    s3ObjectExists(s3, bucket, streams.mp3Key),
    s3ObjectExists(s3, bucket, streams.opusKey),
  ]);
  return wav && mp3 && opus;
}

/** Create preview needs locked dry + mixer bounce as WAV, MP3, and Opus. */
export async function speakerPreviewReady(
  s3: S3Client,
  bucket: string,
  modelId: string,
  brand?: "fish" | "speechify" | null,
): Promise<boolean> {
  const speed = FIXED_SPEECH_PREVIEW_SPEED;
  const dryKey = speakerPreviewLoudDrySampleKey(modelId, speed, brand);
  const fxKey = speakerPreviewLoudFxSampleKey(modelId, speed, brand);
  const [dry, fx] = await Promise.all([
    speakerStemStreamsReady(s3, bucket, dryKey),
    speakerStemStreamsReady(s3, bucket, fxKey),
  ]);
  return dry && fx;
}

async function trimMp3ForPreview(buf: Buffer): Promise<Buffer> {
  const id = randomUUID();
  const inPath = `/tmp/spk-in-${id}.mp3`;
  const outPath = `/tmp/spk-trim-${id}.mp3`;
  try {
    fs.writeFileSync(inPath, buf);
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-y",
      "-i",
      inPath,
      "-t",
      String(LOUD_PREVIEW_SECONDS),
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      outPath,
    ]);
    return fs.readFileSync(outPath);
  } finally {
    for (const p of [inPath, outPath]) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* */
      }
    }
  }
}

async function fishTtsMp3(
  apiKey: string,
  referenceId: string,
  speed: number,
): Promise<Buffer> {
  const upstream = await fetch(FISH_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: fishTtsModel(),
    },
    body: JSON.stringify({
      text: SPEAKER_PREVIEW_TEXT,
      reference_id: referenceId,
      format: "mp3",
      latency: "normal",
      normalize: true,
      prosody: { speed, normalize_loudness: true },
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text();
    throw new Error(`Fish TTS failed (${upstream.status}): ${detail.slice(0, 500)}`);
  }
  return Buffer.from(await upstream.arrayBuffer());
}

async function voiceFxMixerPair(
  apiBase: string,
  mp3: Buffer,
  preset = MIXER_VOICE_FX_PRESET,
): Promise<{ fx: Buffer; dry: Buffer }> {
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/audio/voice-fx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64: mp3.toString("base64"),
      preset,
      inputFormat: "mp3",
      emitDry: true,
      ...(preset === "mixer-wet" || preset === MIXER_VOICE_FX_PRESET
        ? { tailPadSeconds: 2 }
        : {}),
    }),
  });
  const raw = await res.text();
  let data: { audioBase64?: string; dryAudioBase64?: string; error?: string } | null =
    null;
  try {
    data = JSON.parse(raw) as {
      audioBase64?: string;
      dryAudioBase64?: string;
      error?: string;
    };
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(
      `voice-fx HTTP ${res.status}${data?.error ? `: ${data.error}` : ""}`,
    );
  }
  if (!data?.audioBase64) throw new Error("voice-fx response missing audioBase64");
  if (!data.dryAudioBase64) throw new Error("voice-fx response missing dryAudioBase64");
  return {
    fx: Buffer.from(data.audioBase64, "base64"),
    dry: Buffer.from(data.dryAudioBase64, "base64"),
  };
}

async function bounceLockedPreviewStems(params: {
  s3: S3Client;
  bucket: string;
  apiBase: string;
  loudKey: string;
  loudDryKey: string;
  loudFxKey: string;
}): Promise<void> {
  const loudObj = await params.s3.send(
    new GetObjectCommand({
      Bucket: params.bucket,
      Key: params.loudKey,
    }),
  );
  const loudBytes = await loudObj.Body?.transformToByteArray();
  if (!loudBytes || loudBytes.byteLength === 0) {
    throw new Error(`empty loud stem ${params.loudKey}`);
  }
  const pair = await voiceFxMixerPair(
    params.apiBase,
    Buffer.from(loudBytes),
    MIXER_VOICE_FX_PRESET,
  );
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.loudDryKey,
      Body: pair.dry,
      ContentType: "audio/wav",
      CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
    }),
  );
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.loudFxKey,
      Body: pair.fx,
      ContentType: "audio/wav",
      CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
    }),
  );
  const streamKeys = (
    await Promise.all([
      putVoiceStemStreams({
        s3: params.s3,
        bucket: params.bucket,
        wavKey: params.loudDryKey,
        wavBuf: pair.dry,
        cacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
      putVoiceStemStreams({
        s3: params.s3,
        bucket: params.bucket,
        wavKey: params.loudFxKey,
        wavBuf: pair.fx,
        cacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    ])
  ).flat();
  await invalidateSpeakerPreviewKeys([
    params.loudDryKey,
    params.loudFxKey,
    ...streamKeys,
  ]);
}

/** Mixer preview (loud MP3 + FX WAV). Fish keys include the fixed speed stem. */
export async function generateFishSpeakerPreview(params: {
  s3: S3Client;
  bucket: string;
  apiKey?: string;
  modelId: string;
  brand?: "fish" | "speechify" | null;
  apiBase?: string | null;
  /** When true, replace an existing preview instead of skipping. */
  force?: boolean;
  synthesize?: (speed: number) => Promise<Buffer>;
}): Promise<{
  mp3Key: string;
  loudKey: string;
  loudFxKey: string | null;
  loudWetKey: string | null;
  skipped?: boolean;
}> {
  const speed = FIXED_SPEECH_PREVIEW_SPEED;
  const brand = params.brand === "speechify" ? "speechify" : "fish";
  const mp3Key = speakerPreviewSampleKey(params.modelId, speed, brand);
  const loudKey = speakerPreviewLoudSampleKey(params.modelId, speed, brand);
  const loudFxKey = speakerPreviewLoudFxSampleKey(params.modelId, speed, brand);
  const loudDryKey = speakerPreviewLoudDrySampleKey(params.modelId, speed, brand);
  const loudWetKey = speakerPreviewLoudWetSampleKey(
    params.modelId,
    speed,
    brand,
  );

  if (
    !params.force &&
    (await speakerPreviewExists(
      params.s3,
      params.bucket,
      params.modelId,
      brand,
    ))
  ) {
    let fxKey: string | null = null;
    if (params.apiBase) {
      const ready = await speakerPreviewReady(
        params.s3,
        params.bucket,
        params.modelId,
        brand,
      );
      if (!ready) {
        await bounceLockedPreviewStems({
          s3: params.s3,
          bucket: params.bucket,
          apiBase: params.apiBase,
          loudKey,
          loudDryKey,
          loudFxKey,
        });
      }
      fxKey = loudFxKey;
    }
    return { mp3Key, loudKey, loudFxKey: fxKey, loudWetKey: fxKey, skipped: true };
  }

  const buf = params.synthesize
    ? await params.synthesize(speed)
    : await fishTtsMp3(params.apiKey ?? "", params.modelId, speed);
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: mp3Key,
      Body: buf,
      ContentType: "audio/mpeg",
      CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
    }),
  );

  const previewMp3 = await trimMp3ForPreview(buf);
  const loudMp3 = await loudnormMp3Buffer(previewMp3);
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: loudKey,
      Body: loudMp3,
      ContentType: "audio/mpeg",
      CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
    }),
  );

  let uploadedFx: string | null = null;
  const uploaded: string[] = [];
  if (params.apiBase) {
    const pair = await voiceFxMixerPair(params.apiBase, loudMp3);
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: loudDryKey,
        Body: pair.dry,
        ContentType: "audio/wav",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    );
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: loudFxKey,
        Body: pair.fx,
        ContentType: "audio/wav",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    );
    uploadedFx = loudFxKey;
    uploaded.push(loudDryKey, loudFxKey, loudWetKey);
    uploaded.push(
      ...(await putVoiceStemStreams({
        s3: params.s3,
        bucket: params.bucket,
        wavKey: loudDryKey,
        wavBuf: pair.dry,
        cacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      })),
      ...(await putVoiceStemStreams({
        s3: params.s3,
        bucket: params.bucket,
        wavKey: loudFxKey,
        wavBuf: pair.fx,
        cacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      })),
    );
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: loudWetKey,
        Body: pair.fx,
        ContentType: "audio/wav",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    );
  }

  await invalidateSpeakerPreviewKeys(
    [mp3Key, loudKey, ...uploaded].filter((k): k is string => Boolean(k)),
  );

  return {
    mp3Key,
    loudKey,
    loudFxKey: uploadedFx,
    loudWetKey: uploaded.includes(loudWetKey) ? loudWetKey : null,
  };
}

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
import { recordFishTtsUsage } from "./ai-usage";
import { voiceStemStreamKeys } from "./voice-stem-stream";
import { applyCommittedVoiceFx } from "./voice-fx-apply";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  SPEECHIFY_EMOTION_SAMPLE_TAGS,
  speakerEmotionSampleKey,
  speakerLetterIntroSampleKey,
  speakerPreviewLoudDrySampleKey,
  speakerPreviewLoudFxSampleKey,
  speakerPreviewLoudSampleKey,
  speakerPreviewLoudWetSampleKey,
  speakerPreviewSampleKey,
  type SpeechifyEmotionSampleTag,
} from "./speaker-sample-speed";

const execFileAsync = promisify(execFile);
const cloudfront = new CloudFrontClient({});
const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
export const SPEAKER_PREVIEW_TEXT = "Welcome to your personalised meditation.";

/** Letter-narration audition line — Speechify only (`letter-intro.mp3`). */
export function letterIntroSampleText(speakerName: string): string {
  const name = speakerName.trim() || "your narrator";
  return `Hey I'm ${name}. I'll narrate your personal insights letter`;
}
const LOUD_PREVIEW_SECONDS = 6;
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
  const [wav, aac] = await Promise.all([
    s3ObjectExists(s3, bucket, wavKey),
    s3ObjectExists(s3, bucket, streams.aacKey),
  ]);
  // Legacy: MP3 sibling counts until AAC backfill lands.
  const mp3 =
    aac || (await s3ObjectExists(s3, bucket, streams.mp3Key));
  return wav && (aac || mp3);
}

/** Create preview needs locked dry + mixer bounce as WAV + AAC (or legacy MP3). */
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
  const buf = Buffer.from(await upstream.arrayBuffer());
  void recordFishTtsUsage({
    utf8Bytes: Buffer.byteLength(SPEAKER_PREVIEW_TEXT, "utf8"),
    model: fishTtsModel(),
    feature: "speaker-preview-tts",
  });
  return buf;
}

async function voiceFxFfmpegPair(
  s3: S3Client,
  bucket: string,
  mp3: Buffer,
): Promise<{ fx: Buffer; dry: Buffer }> {
  // MP3/AAC in → AAC out (no voice WAV encode).
  const result = await applyCommittedVoiceFx({
    s3,
    bucket,
    dryAudio: mp3,
    inputExt: ".mp3",
  });
  return { fx: result.fxAudio, dry: result.dryAudio };
}

async function bounceLockedPreviewStems(params: {
  s3: S3Client;
  bucket: string;
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
  const pair = await voiceFxFfmpegPair(
    params.s3,
    params.bucket,
    Buffer.from(loudBytes),
  );
  const dryStreams = voiceStemStreamKeys(params.loudDryKey);
  const fxStreams = voiceStemStreamKeys(params.loudFxKey);
  const uploaded: string[] = [];
  if (dryStreams) {
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: dryStreams.aacKey,
        Body: pair.dry,
        ContentType: "audio/mp4",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    );
    uploaded.push(dryStreams.aacKey);
  }
  if (fxStreams) {
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: fxStreams.aacKey,
        Body: pair.fx,
        ContentType: "audio/mp4",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    );
    uploaded.push(fxStreams.aacKey);
  }
  await invalidateSpeakerPreviewKeys(uploaded);
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
        loudKey,
        loudDryKey,
        loudFxKey,
      });
    }
    return {
      mp3Key,
      loudKey,
      loudFxKey,
      loudWetKey: loudFxKey,
      skipped: true,
    };
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
  const pair = await voiceFxFfmpegPair(params.s3, params.bucket, loudMp3);
  const dryStreams = voiceStemStreamKeys(loudDryKey);
  const fxStreams = voiceStemStreamKeys(loudFxKey);
  const wetStreams = voiceStemStreamKeys(loudWetKey);
  if (dryStreams) {
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: dryStreams.aacKey,
        Body: pair.dry,
        ContentType: "audio/mp4",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    );
    uploaded.push(dryStreams.aacKey);
  }
  if (fxStreams) {
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: fxStreams.aacKey,
        Body: pair.fx,
        ContentType: "audio/mp4",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    );
    uploaded.push(fxStreams.aacKey);
    uploadedFx = loudFxKey;
  }
  if (wetStreams) {
    await params.s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: wetStreams.aacKey,
        Body: pair.fx,
        ContentType: "audio/mp4",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    );
    uploaded.push(wetStreams.aacKey);
  }

  await invalidateSpeakerPreviewKeys(
    [mp3Key, loudKey, ...uploaded].filter((k): k is string => Boolean(k)),
  );

  return {
    mp3Key,
    loudKey,
    loudFxKey: uploadedFx,
    loudWetKey: wetStreams ? loudWetKey : null,
  };
}

/**
 * Speechify-only single-play letter intro for Insights narrator picker.
 * Does not generate Fish samples or FX stems.
 */
export async function generateSpeechifyLetterIntroSample(params: {
  s3: S3Client;
  bucket: string;
  modelId: string;
  speakerName: string;
  force?: boolean;
  synthesize: () => Promise<Buffer>;
}): Promise<{ key: string; skipped?: boolean }> {
  const key = speakerLetterIntroSampleKey(params.modelId);
  if (!params.force && (await s3ObjectExists(params.s3, params.bucket, key))) {
    return { key, skipped: true };
  }
  const buf = await params.synthesize();
  const loudMp3 = await loudnormMp3Buffer(buf);
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: key,
      Body: loudMp3,
      ContentType: "audio/mpeg",
      CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
    }),
  );
  await invalidateSpeakerPreviewKeys([key]);
  return { key };
}

/**
 * Speechify emotion audition clips (neutral / warm / calm).
 * Loudnorm only — no FX stems. Neutral omits the style tag.
 */
export async function generateSpeechifyEmotionSample(params: {
  s3: S3Client;
  bucket: string;
  modelId: string;
  tag: SpeechifyEmotionSampleTag;
  force?: boolean;
  synthesize: () => Promise<Buffer>;
}): Promise<{ key: string; skipped?: boolean }> {
  const key = speakerEmotionSampleKey(params.modelId, params.tag);
  if (!params.force && (await s3ObjectExists(params.s3, params.bucket, key))) {
    return { key, skipped: true };
  }
  const buf = await params.synthesize();
  const loudMp3 = await loudnormMp3Buffer(buf);
  await params.s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: key,
      Body: loudMp3,
      ContentType: "audio/mpeg",
      CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
    }),
  );
  await invalidateSpeakerPreviewKeys([key]);
  return { key };
}

export async function speechifyEmotionSampleUrls(params: {
  s3: S3Client;
  bucket: string;
  modelId: string;
  baseUrl: string | undefined;
  bust: string;
}): Promise<Partial<Record<SpeechifyEmotionSampleTag, string>>> {
  const out: Partial<Record<SpeechifyEmotionSampleTag, string>> = {};
  if (!params.baseUrl) return out;
  await Promise.all(
    SPEECHIFY_EMOTION_SAMPLE_TAGS.map(async (tag) => {
      const key = speakerEmotionSampleKey(params.modelId, tag);
      if (await s3ObjectExists(params.s3, params.bucket, key)) {
        out[tag] = `${params.baseUrl}/${key}?v=${params.bust}`;
      }
    }),
  );
  return out;
}

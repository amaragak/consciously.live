import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireAdminJson } from "./_shared/admin-auth";
import {
  applyVoiceFxFfmpegChain,
  loadIrFromS3,
  putIrToS3,
} from "./_shared/voice-fx-ffmpeg-chain";
import { voiceFxStemWetGain } from "./_shared/voice-fx-dial";
import {
  loadVoiceFxCommitted,
  loadVoiceFxDraft,
  normalizeVoiceFxSettings,
  saveVoiceFxCommitted,
  saveVoiceFxDraft,
  voiceFxIrFingerprint,
  VOICE_FX_IR_COMMITTED_KEY,
  VOICE_FX_IR_DRAFT_KEY,
  VOICE_FX_PREVIEW_DRY_KEY,
  type VoiceFxSettings,
} from "./_shared/voice-fx-settings";
import { listVoiceSpeakers } from "./_shared/voice-admin";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  speakerPreviewLoudDrySampleKey,
} from "./_shared/speaker-sample-speed";

const s3 = new S3Client({});
const SPEAKER_SAMPLE_CACHE_CONTROL = "public, max-age=0, must-revalidate";

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function mediaBase(): string | undefined {
  const domain = (process.env.MEDIA_CLOUDFRONT_DOMAIN || "").trim();
  return domain ? `https://${domain}` : undefined;
}

function requireBucket(): string {
  const b = process.env.MEDIA_BUCKET_NAME?.trim();
  if (!b) throw new Error("MEDIA_BUCKET_NAME is not set");
  return b;
}

async function ensureDraftIr(
  settings: VoiceFxSettings,
  existingFingerprint?: string,
): Promise<{ fingerprint: string; regenerated: boolean }> {
  const bucket = requireBucket();
  const fp = voiceFxIrFingerprint(settings);
  if (existingFingerprint === fp) {
    const existing = await loadIrFromS3({
      s3,
      bucket,
      key: VOICE_FX_IR_DRAFT_KEY,
    });
    if (existing) return { fingerprint: fp, regenerated: false };
  }
  const put = await putIrToS3({
    s3,
    bucket,
    key: VOICE_FX_IR_DRAFT_KEY,
    settings,
  });
  return { fingerprint: put.fingerprint, regenerated: true };
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;

  try {
    if (method === "GET") return await handleGet();
    if (method === "PATCH") return await handlePatch(event);
    if (method === "POST") return await handlePost(event);
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Admin voice FX failed";
    console.error("admin-voice-fx", msg);
    return json(500, { error: msg });
  }
}

async function handleGet() {
  const [draft, committed] = await Promise.all([
    loadVoiceFxDraft(),
    loadVoiceFxCommitted(),
  ]);
  const baseUrl = mediaBase();
  const draftDirty =
    JSON.stringify(normalizeVoiceFxSettings(draft)) !==
    JSON.stringify(normalizeVoiceFxSettings(committed));
  return json(200, {
    baseUrl,
    draft,
    committed,
    draftDirty,
    irDraftUrl: baseUrl
      ? `${baseUrl}/${VOICE_FX_IR_DRAFT_KEY}?v=${encodeURIComponent(draft.irFingerprint ?? draft.updatedAt)}`
      : null,
    irCommittedUrl: baseUrl
      ? `${baseUrl}/${VOICE_FX_IR_COMMITTED_KEY}?v=${encodeURIComponent(committed.irFingerprint ?? committed.updatedAt)}`
      : null,
    previewSpeakerModelId: "beatrice_32",
    previewDryKey: VOICE_FX_PREVIEW_DRY_KEY,
  });
}

async function handlePatch(event: APIGatewayProxyEventV2) {
  let body: { settings?: Partial<VoiceFxSettings> } = {};
  try {
    body = JSON.parse(event.body || "{}") as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const prev = await loadVoiceFxDraft();
  const settings = normalizeVoiceFxSettings({
    ...prev,
    ...(body.settings ?? {}),
  });
  const ir = await ensureDraftIr(settings, prev.irFingerprint);
  const draft = await saveVoiceFxDraft(settings, ir.fingerprint);
  return json(200, {
    ok: true,
    draft,
    irRegenerated: ir.regenerated,
    irDraftUrl: mediaBase()
      ? `${mediaBase()}/${VOICE_FX_IR_DRAFT_KEY}?v=${encodeURIComponent(ir.fingerprint)}`
      : null,
  });
}

async function handlePost(event: APIGatewayProxyEventV2) {
  let body: {
    action?: string;
    settings?: Partial<VoiceFxSettings>;
  } = {};
  try {
    body = JSON.parse(event.body || "{}") as typeof body;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  const action = (body.action || "").trim();
  if (action === "preview") return await handlePreview(body.settings);
  if (action === "commit") return await handleCommit(body.settings);
  return json(400, { error: "Unknown action (preview|commit)" });
}

async function handlePreview(patch?: Partial<VoiceFxSettings>) {
  const bucket = requireBucket();
  // Preview is ephemeral: use submitted (or current draft) settings, build IR
  // in-memory, write only tmp/admin-fx/* — do not touch draft/committed Dynamo or IR.
  const base = await loadVoiceFxDraft();
  const settings = normalizeVoiceFxSettings({ ...base, ...(patch ?? {}) });

  const dryObj = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: VOICE_FX_PREVIEW_DRY_KEY }),
  );
  const dryBytes = await dryObj.Body?.transformToByteArray();
  if (!dryBytes?.byteLength) {
    return json(404, {
      error: `Missing Beatrice dry sample at ${VOICE_FX_PREVIEW_DRY_KEY}`,
    });
  }
  // Always synthesize IR from these preview settings (no draft IR reuse).
  // AAC out — no voice WAV encode.
  const result = await applyVoiceFxFfmpegChain({
    dryAudio: Buffer.from(dryBytes),
    inputExt: ".wav",
    settings,
    emitWetOnly: true,
  });

  const stamp = Date.now();
  const previewKey = `tmp/admin-fx/preview-${stamp}.m4a`;
  const wetKey = `tmp/admin-fx/preview-${stamp}-wet.m4a`;
  await Promise.all([
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: previewKey,
        Body: result.fxAudio,
        ContentType: "audio/mp4",
        CacheControl: "no-store",
      }),
    ),
    s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: wetKey,
        Body: result.wetAudio ?? result.fxAudio,
        ContentType: "audio/mp4",
        CacheControl: "no-store",
      }),
    ),
  ]);

  const baseUrl = mediaBase();
  return json(200, {
    ok: true,
    settings,
    persisted: false,
    timings: result.timings,
    /** Full FX stem — never writes under speaker-samples/ or draft settings. */
    previewUrl: baseUrl ? `${baseUrl}/${previewKey}` : null,
    previewKey,
    wetOnlyUrl: baseUrl ? `${baseUrl}/${wetKey}` : null,
    wetOnlyKey: wetKey,
  });
}

async function rebuildFxFromDryKey(params: {
  bucket: string;
  dryKey: string;
  fxKey: string;
  wetKey: string;
  settings: VoiceFxSettings;
  irWav: Buffer;
}): Promise<void> {
  const dryObj = await s3.send(
    new GetObjectCommand({ Bucket: params.bucket, Key: params.dryKey }),
  );
  const dryBytes = await dryObj.Body?.transformToByteArray();
  if (!dryBytes?.byteLength) return;
  const dryExt = params.dryKey.toLowerCase().endsWith(".wav")
    ? ".wav"
    : params.dryKey.toLowerCase().endsWith(".m4a")
      ? ".m4a"
      : params.dryKey.toLowerCase().endsWith(".mp3")
        ? ".mp3"
        : ".wav";
  // Commit stems only: bake 1.5× admin wet mix. Preview uses settings.wetGain as-is.
  // Dry is already loudnormed — chain must not loudnorm again.
  const stemSettings: VoiceFxSettings = {
    ...params.settings,
    wetGain: voiceFxStemWetGain(params.settings.wetGain),
  };
  const result = await applyVoiceFxFfmpegChain({
    dryAudio: Buffer.from(dryBytes),
    inputExt: dryExt,
    settings: stemSettings,
    irWav: params.irWav,
  });
  // Prefer AAC siblings next to legacy .wav keys.
  const fxAacKey = params.fxKey.replace(/\.wav$/i, ".m4a");
  const wetAacKey = params.wetKey.replace(/\.wav$/i, ".m4a");
  await Promise.all([
    s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: fxAacKey,
        Body: result.fxAudio,
        ContentType: "audio/mp4",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    ),
    s3.send(
      new PutObjectCommand({
        Bucket: params.bucket,
        Key: wetAacKey,
        Body: result.fxAudio,
        ContentType: "audio/mp4",
        CacheControl: SPEAKER_SAMPLE_CACHE_CONTROL,
      }),
    ),
  ]);
}

function fxKeysFromDryKey(dryKey: string): { fxKey: string; wetKey: string } {
  if (dryKey.endsWith("/loud-dry.wav")) {
    return {
      fxKey: dryKey.replace(/\/loud-dry\.wav$/, "/loud-fx.wav"),
      wetKey: dryKey.replace(/\/loud-dry\.wav$/, "/loud-wet.wav"),
    };
  }
  return {
    fxKey: dryKey.replace(/-loud-dry\.wav$/, "-loud-fx.wav"),
    wetKey: dryKey.replace(/-loud-dry\.wav$/, "-loud-wet.wav"),
  };
}

async function handleCommit(patch?: Partial<VoiceFxSettings>) {
  const bucket = requireBucket();
  const base = await loadVoiceFxDraft();
  const settings = normalizeVoiceFxSettings({ ...base, ...(patch ?? {}) });

  const irPut = await putIrToS3({
    s3,
    bucket,
    key: VOICE_FX_IR_COMMITTED_KEY,
    settings,
  });
  await putIrToS3({
    s3,
    bucket,
    key: VOICE_FX_IR_DRAFT_KEY,
    settings,
  });

  const committed = await saveVoiceFxCommitted(settings, irPut.fingerprint);
  await saveVoiceFxDraft(settings, irPut.fingerprint);

  const irWav = await loadIrFromS3({
    s3,
    bucket,
    key: VOICE_FX_IR_COMMITTED_KEY,
  });
  if (!irWav) throw new Error("Committed IR missing after write");

  // Prefer listing dry stems so Fish speed variants are covered too.
  const dryKeys = new Set<string>();
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "speaker-samples/",
        ContinuationToken: token,
      }),
    );
    for (const obj of page.Contents ?? []) {
      const key = obj.Key;
      if (!key) continue;
      if (key.endsWith("-loud-dry.wav") || key.endsWith("/loud-dry.wav")) {
        dryKeys.add(key);
      }
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  // Ensure listed speakers' primary dry keys are attempted even if list missed.
  for (const sp of await listVoiceSpeakers()) {
    dryKeys.add(
      speakerPreviewLoudDrySampleKey(
        sp.modelId,
        FIXED_SPEECH_PREVIEW_SPEED,
        sp.brand,
      ),
    );
  }

  const rebuilt: string[] = [];
  const failed: Array<{ key: string; error: string }> = [];

  for (const dryKey of dryKeys) {
    const { fxKey, wetKey } = fxKeysFromDryKey(dryKey);
    try {
      const dry = await loadIrFromS3({ s3, bucket, key: dryKey });
      if (!dry) continue;
      await rebuildFxFromDryKey({
        bucket,
        dryKey,
        fxKey,
        wetKey,
        settings,
        irWav,
      });
      rebuilt.push(fxKey);
    } catch (e) {
      failed.push({
        key: fxKey,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const baseUrl = mediaBase();
  return json(200, {
    ok: true,
    committed,
    samplesRebuilt: rebuilt.length,
    rebuiltKeys: rebuilt,
    failed,
    irCommittedUrl: baseUrl
      ? `${baseUrl}/${VOICE_FX_IR_COMMITTED_KEY}?v=${encodeURIComponent(irPut.fingerprint)}`
      : null,
  });
}

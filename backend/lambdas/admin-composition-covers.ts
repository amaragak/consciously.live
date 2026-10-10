import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import fs from "fs";
import { pipeline } from "stream/promises";
import type { Readable } from "stream";
import { requireAdminJson } from "./_shared/admin-auth";
import { jsonAuth } from "./_shared/consciously-auth-http";
import {
  audioStemKey,
  BG_AUDIO_PREFIX,
  BG_AUDIO_RAW_PREFIX,
  leafNameFromKey,
  mergeByStemPreferMp3,
  normalizeBgAudioCategory,
  parseAnyBgAudioKey,
} from "./_shared/background-audio-keys";
import {
  loudnormReductionDbFromSource,
  measureIntegratedLufs,
} from "./_shared/bg-audio-loudnorm";
import {
  compositionCoverThumbObjectKey,
  resizeCoverBufferToThumbJpeg,
} from "./_shared/composition-cover-thumb";
import {
  appendCoverPromptHistory,
  buildCompositionCoverPrompt,
  coerceAdminImageModel,
  compositionCoverObjectKey,
  generateAdminImageFromPrompt,
  refineCompositionCoverPromptWithChange,
} from "./_shared/meditation-cover";
import { listAllS3Objects } from "./_shared/s3-list-all";
import {
  backfillMissingCompositionComposers,
  coerceBinauralHz,
  coerceCoverWideCropY,
  coerceLoudnormRestorePct,
  getSoundRow,
  listAllSoundRows,
  LOUDNORM_FULL_TARGET_LUFS,
  loudnormTargetFromRestore,
  normalizeTags,
  putSoundRow,
  SOUND_PK,
  soundEnabledFromStatus,
  soundIsInCustomerPicker,
  updateSoundLoudnorm,
  updateSoundProcessing,
  type SoundCatalogRow,
} from "./_shared/sound-catalog";
import {
  loadCompositionTagTypes,
  saveCompositionTagTypes,
} from "./_shared/composition-tag-types";
import {
  DEFAULT_COMPOSITION_COMPOSER,
  normalizeCompositionComposer,
  type CompositionComposer,
} from "./_shared/composition-composers";
import {
  loadCompositionPackNames,
  normalizeCompositionPackName,
  saveCompositionPackNames,
} from "./_shared/composition-pack-names";

const s3 = new S3Client({});

function json(
  statusCode: number,
  payload: Record<string, unknown>,
): APIGatewayProxyStructuredResultV2 {
  return jsonAuth(statusCode, payload);
}

function mediaConfig(): { bucket: string; cfDomain: string } {
  const bucket = process.env.MEDIA_BUCKET_NAME?.trim();
  const cfDomain = process.env.MEDIA_CLOUDFRONT_DOMAIN?.trim();
  if (!bucket || !cfDomain) {
    throw new Error("MEDIA_BUCKET_NAME or MEDIA_CLOUDFRONT_DOMAIN is not set");
  }
  return { bucket, cfDomain };
}

function publicUrl(cfDomain: string, key: string): string {
  return `https://${cfDomain}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function imageExt(mime: "image/jpeg" | "image/png" | "image/webp"): "jpg" | "png" | "webp" {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

function itemPayload(row: SoundCatalogRow) {
  return {
    key: row.sk,
    name: row.name,
    category: row.category,
    coverImageKey: row.coverImageKey ?? null,
    coverImageUrl: row.coverImageUrl ?? null,
    coverImageThumbKey: row.coverImageThumbKey ?? null,
    coverImageThumbUrl: row.coverImageThumbUrl ?? null,
    coverWideCropY: coerceCoverWideCropY(row.coverWideCropY),
    lastCoverPrompt: row.lastCoverPrompt ?? null,
    coverPromptHistory: row.coverPromptHistory ?? [],
    tags: row.tags ?? [],
    binauralHz: row.binauralHz ?? null,
    adminFavourite: row.adminFavourite === true,
    customPackName: row.customPackName ?? null,
    composer: normalizeCompositionComposer(row.composer),
    processing: row.processing ?? null,
    loudnormSourceLufs: row.loudnormSourceLufs ?? null,
    loudnormOutputLufs: row.loudnormOutputLufs ?? null,
    loudnormTargetLufs: row.loudnormTargetLufs ?? null,
    loudnormReductionDb: row.loudnormReductionDb ?? null,
    loudnormRestorePct: coerceLoudnormRestorePct(row.loudnormRestorePct, 0),
    trimStartSec: row.trimStartSec ?? 0,
    trimEndSec: row.trimEndSec ?? null,
    fadeInSec: row.fadeInSec ?? 0,
    fadeOutSec: row.fadeOutSec ?? 0,
    streamingEditedAt: row.streamingEditedAt ?? null,
    eqBands: row.eqBands ?? null,
    updatedAt: row.updatedAt || null,
  };
}

function rawCandidatesForComposition(row: SoundCatalogRow): string[] {
  const out: string[] = [];
  const pack = row.packPath?.trim();
  if (pack) out.push(`${BG_AUDIO_RAW_PREFIX}${pack}`);
  const parsed = parseAnyBgAudioKey(row.sk);
  if (parsed) {
    const stem = audioStemKey(parsed.rel);
    out.push(
      `${BG_AUDIO_RAW_PREFIX}${stem}.wav`,
      `${BG_AUDIO_RAW_PREFIX}${stem}.mp3`,
    );
  }
  return [...new Set(out.filter(Boolean))];
}

async function firstExistingRaw(
  bucket: string,
  candidates: string[],
): Promise<string | null> {
  for (const key of candidates) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return key;
    } catch {
      /* next */
    }
  }
  return null;
}

/**
 * Measure raw LUFS only — updates catalog fields, does not write audio objects.
 */
async function handleMeasureLoudnorm(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const { bucket } = mediaConfig();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith(BG_AUDIO_PREFIX)) {
    return json(400, { error: "key must be a background-audio object" });
  }
  const row = await getSoundRow(key);
  if (!row) return json(404, { error: "Composition not found" });
  const cat =
    normalizeBgAudioCategory(row.category) ||
    parseAnyBgAudioKey(key)?.folderCategory;
  if (cat !== "compositions") {
    return json(400, { error: "loudnorm measure is only for compositions" });
  }

  const rawKey = await firstExistingRaw(bucket, rawCandidatesForComposition(row));
  if (!rawKey) {
    return json(409, {
      error: "No raw upload in S3 — re-upload or replace the file first.",
    });
  }

  const lower = rawKey.toLowerCase();
  const ext = lower.endsWith(".wav") ? "wav" : "mp3";
  const tmpPath = `/tmp/loudnorm-measure-${randomUUID()}.${ext}`;
  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: rawKey }),
    );
    if (!obj.Body) throw new Error("Empty raw object");
    await pipeline(obj.Body as Readable, fs.createWriteStream(tmpPath));
    const sourceLufs = await measureIntegratedLufs(tmpPath);
    if (sourceLufs == null) {
      return json(500, { error: "Could not measure LUFS for this file" });
    }
    const reductionDb = loudnormReductionDbFromSource(sourceLufs);
    const restorePct = coerceLoudnormRestorePct(row.loudnormRestorePct, 0);
    // Keep existing target/output if already set — do not invent a re-encode.
    const targetLufs =
      row.loudnormTargetLufs ?? LOUDNORM_FULL_TARGET_LUFS;
    const outputLufs = row.loudnormOutputLufs ?? targetLufs;
    await updateSoundLoudnorm(key, {
      loudnormSourceLufs: sourceLufs,
      loudnormOutputLufs: outputLufs,
      loudnormTargetLufs: targetLufs,
      loudnormReductionDb: reductionDb,
      loudnormRestorePct: restorePct,
    });
    const next = await getSoundRow(key);
    return json(200, {
      item: itemPayload(
        next ?? {
          ...row,
          loudnormSourceLufs: sourceLufs,
          loudnormOutputLufs: outputLufs,
          loudnormTargetLufs: targetLufs,
          loudnormReductionDb: reductionDb,
          loudnormRestorePct: restorePct,
        },
      ),
    });
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* */
    }
  }
}

/**
 * Set restore % and re-fire normalize from the raw upload (S3 copy onto self).
 * 0 = full −16 LUFS loudnorm; 100 = target source LUFS (no intentional cut).
 */
async function handleApplyLoudnormRestore(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const { bucket } = mediaConfig();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith(BG_AUDIO_PREFIX)) {
    return json(400, { error: "key must be a background-audio object" });
  }
  const row = await getSoundRow(key);
  if (!row) return json(404, { error: "Composition not found" });
  const cat =
    normalizeBgAudioCategory(row.category) ||
    parseAnyBgAudioKey(key)?.folderCategory;
  if (cat !== "compositions") {
    return json(400, { error: "loudnorm restore is only for compositions" });
  }

  const restorePct = coerceLoudnormRestorePct(body.restorePct, 0);
  const rawKey = await firstExistingRaw(bucket, rawCandidatesForComposition(row));
  if (!rawKey) {
    return json(409, {
      error: "No raw upload in S3 — re-upload or replace the file first.",
    });
  }

  const sourceLufs = row.loudnormSourceLufs;
  if (sourceLufs == null) {
    return json(409, {
      error: "Measure loudnorm first so restore has a source LUFS.",
    });
  }
  // Persist the fader target before re-encode so normalize aims at this level.
  const targetLufs = loudnormTargetFromRestore({ sourceLufs, restorePct });
  const now = new Date().toISOString();
  const detail =
    restorePct <= 0
      ? `loudnorm to ${targetLufs} LUFS (full −16)`
      : `restoring to ${targetLufs} LUFS (${restorePct}% toward original ${sourceLufs})`;
  await putSoundRow({
    ...row,
    loudnormRestorePct: restorePct,
    loudnormTargetLufs: targetLufs,
    processing: {
      stage: "downloading",
      detail,
      updatedAt: now,
    },
    updatedAt: now,
  });
  await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: rawKey,
      CopySource: `${bucket}/${encodeURIComponent(rawKey).replace(/%2F/g, "/")}`,
      MetadataDirective: "REPLACE",
      Metadata: {
        loudnormRestoreAt: now,
        loudnormRestorePct: String(restorePct),
        loudnormTargetLufs: String(targetLufs),
      },
    }),
  );
  const next = await getSoundRow(key);
  return json(200, {
    item: itemPayload(
      next ?? {
        ...row,
        loudnormRestorePct: restorePct,
        loudnormTargetLufs: targetLufs,
      },
    ),
  });
}

function catalogKeyVariants(key: string): string[] {
  const stem = key.replace(/\.(mp3|wav)$/i, "");
  return [key, `${stem}.mp3`, `${stem}.wav`];
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    return Buffer.from(
      await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray(),
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function putThumbFromFullBuffer(params: {
  bucket: string;
  cfDomain: string;
  fullCoverKey: string;
  fullBody: Buffer;
  prevThumbKey?: string | null;
}): Promise<{ thumbKey: string; thumbUrl: string }> {
  const thumbKey = compositionCoverThumbObjectKey(params.fullCoverKey);
  const thumbBody = await resizeCoverBufferToThumbJpeg(params.fullBody);
  await s3.send(
    new PutObjectCommand({
      Bucket: params.bucket,
      Key: thumbKey,
      Body: thumbBody,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  if (params.prevThumbKey && params.prevThumbKey !== thumbKey) {
    await s3
      .send(
        new DeleteObjectCommand({
          Bucket: params.bucket,
          Key: params.prevThumbKey,
        }),
      )
      .catch(() => undefined);
  }
  return { thumbKey, thumbUrl: publicUrl(params.cfDomain, thumbKey) };
}

/** Same compositions set Create › Audio › Soundscapes uses. */
async function handleList(): Promise<APIGatewayProxyStructuredResultV2> {
  const { bucket, cfDomain } = mediaConfig();
  const [objects, rows] = await Promise.all([
    listAllS3Objects(s3, bucket, BG_AUDIO_PREFIX),
    listAllSoundRows(),
  ]);
  // One-shot: existing compositions without a composer become zenmix.
  await backfillMissingCompositionComposers(rows);
  const metaBySk = new Map(rows.map((r) => [r.sk, r]));
  const pickerKeys = new Set<string>();
  for (const row of rows) {
    if (soundIsInCustomerPicker(row)) pickerKeys.add(row.sk);
  }

  const raw: { key: string; name: string; size: number | null }[] = [];
  for (const o of objects) {
    if (!o.Key) continue;
    const parsed = parseAnyBgAudioKey(o.Key);
    if (!parsed) continue;
    const lower = parsed.key.toLowerCase();
    const catalogKey = lower.endsWith(".wav")
      ? `${parsed.key.slice(0, -4)}.mp3`
      : parsed.key;
    if (rows.length > 0) {
      const inPicker =
        pickerKeys.has(catalogKey) ||
        pickerKeys.has(parsed.key) ||
        catalogKeyVariants(parsed.key).some((k) => pickerKeys.has(k));
      if (!inPicker) continue;
    }
    const meta =
      metaBySk.get(catalogKey) ??
      metaBySk.get(parsed.key) ??
      catalogKeyVariants(parsed.key)
        .map((k) => metaBySk.get(k))
        .find(Boolean);
    const category =
      (meta?.category && normalizeBgAudioCategory(meta.category)) ||
      parsed.folderCategory;
    if (category !== "compositions") continue;
    raw.push({
      key: parsed.key,
      name: meta?.name?.trim() || parsed.name,
      size: o.Size ?? null,
    });
  }

  const merged = mergeByStemPreferMp3(raw);
  const seen = new Set<string>();
  const items: ReturnType<typeof itemPayload>[] = [];

  for (const item of merged) {
    const meta =
      metaBySk.get(item.key) ??
      catalogKeyVariants(item.key)
        .map((k) => metaBySk.get(k))
        .find(Boolean);
    seen.add(item.key);
    for (const k of catalogKeyVariants(item.key)) seen.add(k);
    if (meta) {
      items.push(itemPayload(meta));
    } else {
      items.push({
        key: item.key,
        name: item.name,
        category: "compositions",
        coverImageKey: null,
        coverImageUrl: null,
        coverImageThumbKey: null,
        coverImageThumbUrl: null,
        coverWideCropY: 50,
        lastCoverPrompt: null,
        coverPromptHistory: [],
        tags: [],
        binauralHz: null,
        adminFavourite: false,
        customPackName: null,
        composer: DEFAULT_COMPOSITION_COMPOSER,
        processing: null,
        loudnormSourceLufs: null,
        loudnormOutputLufs: null,
        loudnormTargetLufs: null,
        loudnormReductionDb: null,
        loudnormRestorePct: 0,
        trimStartSec: 0,
        trimEndSec: null,
        fadeInSec: 0,
        fadeOutSec: 0,
        streamingEditedAt: null,
        eqBands: null,
        updatedAt: null,
      });
    }
  }

  for (const row of rows) {
    if (seen.has(row.sk)) continue;
    if (!soundIsInCustomerPicker(row)) continue;
    const category = normalizeBgAudioCategory(row.category) || row.category;
    if (category !== "compositions") continue;
    if (!row.sk.startsWith(BG_AUDIO_PREFIX)) continue;
    items.push(itemPayload(row));
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  const tagTypes = await loadCompositionTagTypes();
  const packNames = await loadCompositionPackNames();
  return json(200, {
    baseUrl: `https://${cfDomain}`,
    items,
    tagTypes,
    packNames,
  });
}

async function ensureCompositionRow(
  key: string,
  nameHint?: string,
): Promise<SoundCatalogRow> {
  const existing = await getSoundRow(key);
  if (existing) {
    const cat =
      normalizeBgAudioCategory(existing.category) || existing.category;
    if (cat !== "compositions") {
      throw new Error("Sound is not in the compositions category");
    }
    return existing;
  }
  for (const variant of catalogKeyVariants(key)) {
    if (variant === key) continue;
    const sibling = await getSoundRow(variant);
    if (!sibling) continue;
    const cat = normalizeBgAudioCategory(sibling.category) || sibling.category;
    if (cat === "compositions") return sibling;
  }
  const parsed = parseAnyBgAudioKey(key);
  const folderOk = parsed?.folderCategory === "compositions";
  if (!folderOk && !key.includes("/compositions/")) {
    throw new Error("key must be a compositions background-audio object");
  }
  const now = new Date().toISOString();
  const name =
    (nameHint && nameHint.trim()) ||
    leafNameFromKey(key) ||
    key.split("/").pop() ||
    "Untitled";
  const row: SoundCatalogRow = {
    pk: SOUND_PK,
    sk: key,
    name,
    category: "compositions",
    tags: [],
    status: "categorised",
    enabled: soundEnabledFromStatus("categorised"),
    composer: DEFAULT_COMPOSITION_COMPOSER,
    updatedAt: now,
  };
  await putSoundRow(row);
  return row;
}

async function handleGenerate(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const { bucket, cfDomain } = mediaConfig();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith("background-audio/")) {
    return json(400, { error: "key must be a background-audio object" });
  }
  const titleHint =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : undefined;
  const changeRequest =
    typeof body.changeRequest === "string" ? body.changeRequest.trim() : "";
  const guidePrompt =
    typeof body.guidePrompt === "string"
      ? body.guidePrompt.trim().slice(0, 800)
      : "";
  const model = coerceAdminImageModel(body.model);

  const row = await ensureCompositionRow(key, titleHint);
  const title = titleHint || row.name || leafNameFromKey(key) || "Untitled";

  const previousPrompts = appendCoverPromptHistory(
    row.coverPromptHistory,
    row.lastCoverPrompt,
  );

  let prompt: string;
  if (changeRequest) {
    // Revision: LLM rewrites prior prompt(s) using the change note.
    prompt = await refineCompositionCoverPromptWithChange({
      title,
      previousPrompts,
      changeRequest,
    });
  } else {
    // First gen or fresh idea — title + optional guide (ignores prior prompts).
    prompt = buildCompositionCoverPrompt({
      title,
      guidePrompt: guidePrompt || undefined,
    });
  }

  const { body: imageBody, mime } = await generateAdminImageFromPrompt({
    prompt,
    model,
  });
  const ext = imageExt(mime);
  const objectKey = compositionCoverObjectKey(key, ext);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: imageBody,
      ContentType: mime,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  const url = publicUrl(cfDomain, objectKey);
  const thumb = await putThumbFromFullBuffer({
    bucket,
    cfDomain,
    fullCoverKey: objectKey,
    fullBody: imageBody,
    prevThumbKey: row.coverImageThumbKey,
  });
  const prevKey = row.coverImageKey;
  const next: SoundCatalogRow = {
    ...row,
    name: title,
    category: "compositions",
    coverImageKey: objectKey,
    coverImageUrl: url,
    coverImageThumbKey: thumb.thumbKey,
    coverImageThumbUrl: thumb.thumbUrl,
    lastCoverPrompt: prompt.slice(0, 4000),
    coverPromptHistory: previousPrompts,
    updatedAt: new Date().toISOString(),
  };
  await putSoundRow(next);
  if (prevKey && prevKey !== objectKey) {
    await s3
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: prevKey }))
      .catch(() => undefined);
  }
  return json(200, { item: itemPayload(next) });
}

/**
 * Resize existing full covers → thumbs. No AI image regeneration.
 * Optional `keys: string[]` to limit the set; otherwise all picker compositions
 * that have a cover but no thumb.
 */
async function handleEnsureThumbs(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const { bucket, cfDomain } = mediaConfig();
  const keyFilter = Array.isArray(body.keys)
    ? new Set(
        body.keys
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim())
          .filter(Boolean),
      )
    : null;

  const rows = await listAllSoundRows();
  const targets = rows.filter((row) => {
    if (keyFilter && !keyFilter.has(row.sk)) return false;
    const cat = normalizeBgAudioCategory(row.category) || row.category;
    if (cat !== "compositions") return false;
    if (!row.coverImageKey?.trim()) return false;
    if (row.coverImageThumbKey?.trim() && row.coverImageThumbUrl?.trim()) {
      return false;
    }
    return true;
  });

  let ok = 0;
  let fail = 0;
  const errors: { key: string; error: string }[] = [];
  const updated: ReturnType<typeof itemPayload>[] = [];

  for (const row of targets) {
    const coverKey = row.coverImageKey!.trim();
    try {
      const got = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: coverKey }),
      );
      const fullBody = await streamToBuffer(got.Body);
      if (!fullBody.length) throw new Error("Empty cover object");
      const thumb = await putThumbFromFullBuffer({
        bucket,
        cfDomain,
        fullCoverKey: coverKey,
        fullBody,
        prevThumbKey: row.coverImageThumbKey,
      });
      const next: SoundCatalogRow = {
        ...row,
        coverImageThumbKey: thumb.thumbKey,
        coverImageThumbUrl: thumb.thumbUrl,
        coverImageUrl: row.coverImageUrl || publicUrl(cfDomain, coverKey),
        updatedAt: new Date().toISOString(),
      };
      await putSoundRow(next);
      updated.push(itemPayload(next));
      ok += 1;
    } catch (e) {
      fail += 1;
      errors.push({
        key: row.sk,
        error: e instanceof Error ? e.message : "Thumb failed",
      });
    }
  }

  return json(200, {
    ok,
    fail,
    processed: targets.length,
    errors,
    items: updated,
  });
}

async function handleClear(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const { bucket } = mediaConfig();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) return json(400, { error: "key is required" });
  const row = await getSoundRow(key);
  if (!row) return json(404, { error: "Composition not found in catalog" });
  const prevKey = row.coverImageKey;
  const prevThumb = row.coverImageThumbKey;
  const next: SoundCatalogRow = {
    ...row,
    coverImageKey: undefined,
    coverImageUrl: undefined,
    coverImageThumbKey: undefined,
    coverImageThumbUrl: undefined,
    lastCoverPrompt: undefined,
    coverPromptHistory: undefined,
    updatedAt: new Date().toISOString(),
  };
  await putSoundRow(next);
  for (const k of [prevKey, prevThumb]) {
    if (!k) continue;
    await s3
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: k }))
      .catch(() => undefined);
  }
  return json(200, { item: itemPayload(next) });
}

async function handleSetTagTypes(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const tagTypes = await saveCompositionTagTypes(body.tagTypes);
  return json(200, { tagTypes });
}

async function handleSetPackNames(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const packNames = await saveCompositionPackNames(body.packNames);
  return json(200, { packNames });
}

/**
 * Rename a pack label and rewrite every composition still assigned to the old
 * string (the label is the association key — there is no separate pack id).
 */
async function handleRenamePackName(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const from = normalizeCompositionPackName(body.from);
  const to = normalizeCompositionPackName(body.to);
  if (!from) return json(400, { error: "from is required" });
  if (!to) return json(400, { error: "to is required" });
  if (from === to) {
    const packNames = await loadCompositionPackNames();
    return json(200, { packNames, updatedCount: 0 });
  }

  const current = await loadCompositionPackNames();
  const hasFrom = current.some((n) => n.toLowerCase() === from.toLowerCase());
  if (!hasFrom) {
    return json(404, { error: `Pack “${from}” not found` });
  }
  const clash = current.some(
    (n) => n.toLowerCase() === to.toLowerCase() && n.toLowerCase() !== from.toLowerCase(),
  );
  if (clash) {
    return json(409, { error: `Pack “${to}” already exists` });
  }

  const nextNames = current.map((n) =>
    n.toLowerCase() === from.toLowerCase() ? to : n,
  );
  const packNames = await saveCompositionPackNames(nextNames);

  const rows = await listAllSoundRows();
  let updatedCount = 0;
  for (const row of rows) {
    const assigned = normalizeCompositionPackName(row.customPackName);
    if (!assigned || assigned.toLowerCase() !== from.toLowerCase()) continue;
    await putSoundRow({
      ...row,
      customPackName: to,
      updatedAt: new Date().toISOString(),
    });
    updatedCount += 1;
  }

  return json(200, { packNames, updatedCount });
}

async function handleSetTags(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith("background-audio/")) {
    return json(400, { error: "key must be a background-audio object" });
  }
  const titleHint =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : undefined;
  const row = await ensureCompositionRow(key, titleHint);
  const next: SoundCatalogRow = {
    ...row,
    tags: normalizeTags(body.tags),
    updatedAt: new Date().toISOString(),
  };
  await putSoundRow(next);
  return json(200, { item: itemPayload(next) });
}

async function handleUpdateMeta(
  body: Record<string, unknown>,
): Promise<APIGatewayProxyStructuredResultV2> {
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith("background-audio/")) {
    return json(400, { error: "key must be a background-audio object" });
  }
  const nameRaw = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!nameRaw) {
    return json(400, { error: "name is required" });
  }
  const row = await ensureCompositionRow(key, nameRaw);
  const binauralHz =
    body.binauralHz === undefined
      ? (row.binauralHz ?? null)
      : coerceBinauralHz(body.binauralHz);
  let customPackName = row.customPackName;
  if (body.customPackName !== undefined) {
    const n = normalizeCompositionPackName(body.customPackName);
    customPackName = n || undefined;
  }
  let composer: CompositionComposer =
    normalizeCompositionComposer(row.composer) ?? DEFAULT_COMPOSITION_COMPOSER;
  if (body.composer !== undefined) {
    const nextComposer = normalizeCompositionComposer(body.composer, {
      fallback: false,
    });
    if (!nextComposer) {
      return json(400, {
        error: "composer must be zenmix or Consciously Originals",
      });
    }
    composer = nextComposer;
  }
  const adminFavourite =
    body.adminFavourite === undefined
      ? row.adminFavourite === true
      : body.adminFavourite === true;
  // Always persist a concrete 0–100 number so Put+removeUndefinedValues cannot
  // drop a previously saved crop when the client omits the field.
  const coverWideCropY =
    body.coverWideCropY === undefined
      ? coerceCoverWideCropY(row.coverWideCropY)
      : coerceCoverWideCropY(body.coverWideCropY);
  const next: SoundCatalogRow = {
    ...row,
    name: nameRaw,
    binauralHz,
    customPackName,
    composer,
    adminFavourite: adminFavourite || undefined,
    coverWideCropY,
    updatedAt: new Date().toISOString(),
  };
  await putSoundRow(next);
  return json(200, { item: itemPayload(next) });
}

export async function handler(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const method = event.requestContext.http.method;
  if (method === "OPTIONS") return json(204, {});

  const admin = await requireAdminJson(event);
  if ("statusCode" in admin) return admin;

  try {
    if (method === "GET") return await handleList();
    if (method === "POST") {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(event.body || "{}") as Record<string, unknown>;
      } catch {
        return json(400, { error: "Invalid JSON" });
      }
      const action = String(body.action ?? "").trim();
      if (action === "generate-cover") return await handleGenerate(body);
      if (action === "ensure-thumbs") return await handleEnsureThumbs(body);
      if (action === "clear-cover") return await handleClear(body);
      if (action === "set-tags") return await handleSetTags(body);
      if (action === "update-meta") return await handleUpdateMeta(body);
      if (action === "measure-loudnorm") {
        return await handleMeasureLoudnorm(body);
      }
      if (action === "apply-loudnorm-restore") {
        return await handleApplyLoudnormRestore(body);
      }
      if (action === "set-tag-types") return await handleSetTagTypes(body);
      if (action === "set-pack-names") return await handleSetPackNames(body);
      if (action === "rename-pack-name") return await handleRenamePackName(body);
      return json(400, { error: "Unknown action" });
    }
    return json(405, { error: "Method not allowed" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Composition covers failed";
    console.error("admin-composition-covers", msg);
    return json(500, { error: msg });
  }
}

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { normalizeBgAudioCategory, type BgAudioCategory } from "./background-audio-keys";
import { invalidateBgAudioListCache } from "./bg-audio-list-cache";
import { normalizeCompositionPackName } from "./composition-pack-names";
import { coerceSoundSubcategory } from "./sound-taxonomy";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const SOUND_PK = "SOUND";

export type SoundReviewStatus =
  | "in_use"
  | "pending"
  | "unused"
  | "categorised"
  | "loop_verified";

export function storedSoundReviewStatus(raw: unknown): SoundReviewStatus | null {
  if (
    raw === "pending" ||
    raw === "unused" ||
    raw === "in_use" ||
    raw === "categorised" ||
    raw === "loop_verified"
  ) {
    return raw;
  }
  return null;
}

/** Legacy beds live under nature/music/drums/noise. Splice packs and admin imports do not. */
export function defaultSoundReviewStatus(row: {
  sk: string;
  importedAt?: string;
}): SoundReviewStatus {
  if (row.importedAt) return "pending";
  const rel = row.sk.replace(/^background-audio\//, "");
  const folder = rel.split("/")[0] ?? "";
  if (normalizeBgAudioCategory(folder)) return "in_use";
  return "pending";
}

export function resolveSoundReviewStatus(
  stored: unknown,
  row: { sk: string; importedAt?: string },
): SoundReviewStatus {
  return storedSoundReviewStatus(stored) ?? defaultSoundReviewStatus(row);
}

export function parseSoundReviewStatus(raw: unknown): SoundReviewStatus {
  return storedSoundReviewStatus(raw) ?? "in_use";
}

export function soundIsInCustomerPicker(row: { status: SoundReviewStatus }): boolean {
  // loop_verified is categorised plus an admin-only note that the loop was
  // checked, so both belong in the customer picker.
  return row.status === "categorised" || row.status === "loop_verified";
}

export function soundEnabledFromStatus(status: SoundReviewStatus): boolean {
  return soundIsInCustomerPicker({ status });
}

/** Where an upload is in the raw -> normalized pipeline, so stalls are legible. */
export type SoundProcessingStage =
  | "uploading"
  | "downloading"
  | "normalizing"
  | "encoding"
  | "storing"
  | "done"
  | "failed";

export type SoundProcessing = {
  stage: SoundProcessingStage;
  /** Failure detail (ffmpeg stderr tail, S3 error, out-of-memory hint). */
  error?: string;
  /** Source characteristics, useful when a specific file keeps failing. */
  detail?: string;
  attempt?: number;
  updatedAt: string;
};

export function parseSoundProcessing(raw: unknown): SoundProcessing | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const stage = r.stage;
  if (
    stage !== "uploading" &&
    stage !== "downloading" &&
    stage !== "normalizing" &&
    stage !== "encoding" &&
    stage !== "storing" &&
    stage !== "done" &&
    stage !== "failed"
  ) {
    return undefined;
  }
  return {
    stage,
    error: typeof r.error === "string" ? r.error : undefined,
    detail: typeof r.detail === "string" ? r.detail : undefined,
    attempt: typeof r.attempt === "number" ? r.attempt : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
  };
}

export type SoundCatalogRow = {
  pk: typeof SOUND_PK;
  sk: string;
  name: string;
  category: BgAudioCategory;
  subcategory?: string;
  /** Category was chosen by an admin, so the classifier must not move it. */
  categoryPinned?: boolean;
  suggestedCategory?: BgAudioCategory;
  suggestedSubcategory?: string;
  suggestedName?: string;
  packPath?: string;
  tags: string[];
  /** in_use = approved but uncategorised (not in mixer); categorised = in mixer; loop_verified = in mixer, loop seam checked; pending = fresh import; unused = skip */
  status: SoundReviewStatus;
  enabled: boolean;
  notes?: string;
  originalKey?: string;
  trimStartSec?: number;
  trimEndSec?: number | null;
  /** Fades baked in at the trim edges when the trim is applied. */
  fadeInSec?: number;
  fadeOutSec?: number;
  /**
   * When the AAC streaming sibling (.m4a) was last rewritten by trim or EQ.
   * Admin UI shows a second waveform vs the WAV/original master.
   */
  streamingEditedAt?: string;
  /** Last EQ bands baked into the AAC (admin UI restore). */
  eqBands?: Array<{
    type: string;
    frequency: number;
    Q: number;
    gain: number;
    enabled: boolean;
  }>;
  importedAt?: string;
  processing?: SoundProcessing;
  /** Square cover for Music › Compositions admin art. */
  coverImageKey?: string;
  coverImageUrl?: string;
  /** Smaller JPEG derived from the full cover (list / picker thumbs). */
  coverImageThumbKey?: string;
  coverImageThumbUrl?: string;
  /**
   * Vertical focus for the Create · Sound widescreen band (CSS object-position Y %).
   * Sound card is 4:1; 50 = centre band (legacy default).
   */
  coverWideCropY?: number;
  /** Last prompt used to generate the cover (admin). */
  lastCoverPrompt?: string;
  /** Prior cover prompts (oldest → newest), used when refining with a change note. */
  coverPromptHistory?: string[];
  /** Beat / carrier difference frequency in Hz when the bed has a binaural component. */
  binauralHz?: number | null;
  /** Admin-curated pick — shown to customers as “Our Picks”. */
  adminFavourite?: boolean;
  /** Consumer-facing pack label (not the S3 folder / subcategory). */
  customPackName?: string;
  updatedAt: string;
};

export function coerceBinauralHz(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0 || n > 1000) return null;
  // Keep one decimal for values like 7.83 Hz; round integers cleanly.
  return Math.round(n * 10) / 10;
}

/** Create · Sound cover band is 4:1 (card width ÷ 136px band). */
export const SOUND_CARD_COVER_ASPECT = 4;

/** CSS object-position Y % for the widescreen sound-card crop (default centre). */
export function coerceCoverWideCropY(
  raw: unknown,
  fallback = 50,
): number {
  if (raw == null || raw === "") return fallback;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function tableName(): string {
  const n = process.env.SOUND_CATALOG_TABLE_NAME?.trim();
  if (!n) throw new Error("SOUND_CATALOG_TABLE_NAME is not set");
  return n;
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const v = t.trim().toLowerCase().slice(0, 32);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= 24) break;
  }
  return out;
}

function rowFromItem(it: Record<string, unknown>): SoundCatalogRow | null {
  const sk = typeof it.sk === "string" ? it.sk : "";
  if (!sk) return null;
  const importedAt = typeof it.importedAt === "string" ? it.importedAt : undefined;
  const status = resolveSoundReviewStatus(it.status, { sk, importedAt });
  const category =
    normalizeBgAudioCategory(String(it.category ?? "")) ?? "music";
  const suggestedCategory = normalizeBgAudioCategory(
    String(it.suggestedCategory ?? ""),
  );
  return {
    pk: SOUND_PK,
    sk,
    name: typeof it.name === "string" ? it.name : sk,
    category,
    subcategory:
      typeof it.subcategory === "string" && it.subcategory.trim()
        ? coerceSoundSubcategory(category, it.subcategory)
        : undefined,
    categoryPinned: it.categoryPinned === true ? true : undefined,
    suggestedCategory: suggestedCategory ?? undefined,
    suggestedSubcategory:
      typeof it.suggestedSubcategory === "string"
        ? coerceSoundSubcategory(
            suggestedCategory ?? category,
            it.suggestedSubcategory,
          )
        : undefined,
    suggestedName:
      typeof it.suggestedName === "string" ? it.suggestedName : undefined,
    packPath: typeof it.packPath === "string" ? it.packPath : undefined,
    tags: normalizeTags(it.tags),
    status,
    enabled: soundEnabledFromStatus(status),
    notes: typeof it.notes === "string" ? it.notes : undefined,
    originalKey: typeof it.originalKey === "string" ? it.originalKey : undefined,
    trimStartSec: typeof it.trimStartSec === "number" ? it.trimStartSec : undefined,
    trimEndSec: typeof it.trimEndSec === "number" ? it.trimEndSec : null,
    fadeInSec: typeof it.fadeInSec === "number" ? it.fadeInSec : undefined,
    fadeOutSec: typeof it.fadeOutSec === "number" ? it.fadeOutSec : undefined,
    streamingEditedAt:
      typeof it.streamingEditedAt === "string" && it.streamingEditedAt.trim()
        ? it.streamingEditedAt.trim()
        : undefined,
    eqBands: (() => {
      if (!Array.isArray(it.eqBands)) return undefined;
      const out: NonNullable<SoundCatalogRow["eqBands"]> = [];
      for (const row of it.eqBands) {
        if (!row || typeof row !== "object") continue;
        const o = row as Record<string, unknown>;
        const type = String(o.type ?? "").trim();
        const frequency = Number(o.frequency);
        const Q = Number(o.Q ?? o.q);
        const gain = Number(o.gain ?? 0);
        if (!type) continue;
        if (!Number.isFinite(frequency) || !Number.isFinite(Q) || !Number.isFinite(gain)) {
          continue;
        }
        out.push({
          type,
          frequency: Math.round(frequency * 10) / 10,
          Q: Math.round(Q * 100) / 100,
          gain: Math.round(gain * 10) / 10,
          enabled: o.enabled !== false,
        });
        if (out.length >= 12) break;
      }
      return out.length > 0 ? out : undefined;
    })(),
    importedAt,
    processing: parseSoundProcessing(it.processing),
    coverImageKey:
      typeof it.coverImageKey === "string" && it.coverImageKey.trim()
        ? it.coverImageKey.trim()
        : undefined,
    coverImageUrl:
      typeof it.coverImageUrl === "string" && it.coverImageUrl.trim()
        ? it.coverImageUrl.trim()
        : undefined,
    coverImageThumbKey:
      typeof it.coverImageThumbKey === "string" && it.coverImageThumbKey.trim()
        ? it.coverImageThumbKey.trim()
        : undefined,
    coverImageThumbUrl:
      typeof it.coverImageThumbUrl === "string" && it.coverImageThumbUrl.trim()
        ? it.coverImageThumbUrl.trim()
        : undefined,
    coverWideCropY: (() => {
      if (it.coverWideCropY == null || it.coverWideCropY === "") return undefined;
      return coerceCoverWideCropY(it.coverWideCropY);
    })(),
    lastCoverPrompt:
      typeof it.lastCoverPrompt === "string" && it.lastCoverPrompt.trim()
        ? it.lastCoverPrompt.trim().slice(0, 4000)
        : undefined,
    coverPromptHistory: Array.isArray(it.coverPromptHistory)
      ? it.coverPromptHistory
          .filter((p): p is string => typeof p === "string")
          .map((p) => p.trim().slice(0, 4000))
          .filter(Boolean)
          .slice(-5)
      : undefined,
    binauralHz: coerceBinauralHz(it.binauralHz),
    adminFavourite: it.adminFavourite === true ? true : undefined,
    customPackName: (() => {
      const n = normalizeCompositionPackName(it.customPackName);
      return n || undefined;
    })(),
    updatedAt: typeof it.updatedAt === "string" ? it.updatedAt : "",
  };
}

export async function listAllSoundRows(): Promise<SoundCatalogRow[]> {
  const items: SoundCatalogRow[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": SOUND_PK },
        ExclusiveStartKey: startKey,
        // Admin reviews re-list immediately after a status write; an eventually
        // consistent read here resurrects the old status in the UI.
        ConsistentRead: true,
      }),
    );
    for (const it of out.Items ?? []) {
      const row = rowFromItem(it as Record<string, unknown>);
      if (row) items.push(row);
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  return items;
}

export async function getSoundRow(sk: string): Promise<SoundCatalogRow | null> {
  const key = sk.trim();
  if (!key) return null;
  const res = await ddb.send(
    new GetCommand({
      TableName: tableName(),
      Key: { pk: SOUND_PK, sk: key },
      ConsistentRead: true,
    }),
  );
  if (!res.Item) return null;
  return rowFromItem(res.Item as Record<string, unknown>);
}

export async function putSoundRow(row: SoundCatalogRow): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        ...row,
        pk: SOUND_PK,
        tags: normalizeTags(row.tags),
        updatedAt: row.updatedAt || new Date().toISOString(),
      },
    }),
  );
  void invalidateBgAudioListCache();
}

/**
 * Records pipeline progress without touching the rest of the row, so a crash
 * mid-normalize still leaves a readable trail. No-ops when the row is gone.
 */
export async function updateSoundProcessing(
  sk: string,
  processing: Omit<SoundProcessing, "updatedAt">,
): Promise<void> {
  const value: SoundProcessing = {
    ...processing,
    error: processing.error ? processing.error.slice(0, 3000) : undefined,
    detail: processing.detail ? processing.detail.slice(0, 500) : undefined,
    updatedAt: new Date().toISOString(),
  };
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { pk: SOUND_PK, sk },
        UpdateExpression: "SET #p = :p",
        ExpressionAttributeNames: { "#p": "processing" },
        ExpressionAttributeValues: { ":p": value },
        ConditionExpression: "attribute_exists(sk)",
      }),
    );
  } catch (e) {
    const name = (e as { name?: string })?.name;
    if (name === "ConditionalCheckFailedException") return;
    console.warn("updateSoundProcessing failed", { sk, stage: value.stage, name });
  }
}

export async function deleteSoundRow(sk: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: tableName(),
      Key: { pk: SOUND_PK, sk },
    }),
  );
  void invalidateBgAudioListCache();
}

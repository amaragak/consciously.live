/**
 * Committed / draft voice FX settings (echo → SoX-IR convolution).
 * Persisted on VoiceAdminTable under VOICE_SETTINGS / fx*.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const VOICE_SETTINGS_PK = "VOICE_SETTINGS";
export const VOICE_FX_DRAFT_SK = "fx-draft";
export const VOICE_FX_COMMITTED_SK = "fx";

/** S3 keys for SoX impulse responses used by ffmpeg afir. */
export const VOICE_FX_IR_DRAFT_KEY = "voice-fx/ir/draft.wav";
export const VOICE_FX_IR_COMMITTED_KEY = "voice-fx/ir/committed.wav";

/** Beatrice dry used for admin FX tuning (never overwritten by preview). */
export const VOICE_FX_PREVIEW_SPEAKER_MODEL_ID = "beatrice_32";
export const VOICE_FX_PREVIEW_DRY_KEY =
  "speaker-samples/beatrice_32/loud-dry.wav";

export type VoiceFxSettings = {
  /** First echo tap (ms). */
  delayMs: number;
  /** Second echo tap (ms). */
  delayMs2: number;
  /** Third echo tap (ms). */
  delayMs3: number;
  /** Decay of first tap (0–1). */
  delayDecay: number;
  /** Decay of second tap (0–1). */
  delayDecay2: number;
  /** Decay of third tap (0–1). */
  delayDecay3: number;
  /** Impulse length fed into SoX reverb (seconds). */
  irLengthSec: number;
  /** SoX reverb reverberance (0–100). */
  soxReverberance: number;
  /** SoX HF damping (0–100). */
  soxHfDamping: number;
  /** SoX room scale (0–100). */
  soxRoomScale: number;
  /** SoX stereo depth (0–100). */
  soxStereoDepth: number;
  /** SoX pre-delay (ms). */
  soxPredelayMs: number;
  /** SoX wet-gain (dB, typically 0). */
  soxWetGain: number;
  /**
   * How much wet (echo→afir) is baked into the FX stem vs dry.
   * FX stem = 1.0*dry + wetGain*peakMatched(wet). Dial still crossfades dry↔FX.
   */
  wetGain: number;
  /** Tail pad after convolution (seconds). */
  tailPadSec: number;
};

export type VoiceFxSettingsRecord = VoiceFxSettings & {
  updatedAt: string;
  /** IR fingerprint last written for these settings (irLength + sox params). */
  irFingerprint?: string;
};

export function defaultVoiceFxSettings(): VoiceFxSettings {
  return {
    delayMs: 320,
    delayMs2: 640,
    delayMs3: 960,
    delayDecay: 0.7,
    delayDecay2: 0.4,
    delayDecay3: 0.25,
    irLengthSec: 2,
    soxReverberance: 70,
    soxHfDamping: 50,
    soxRoomScale: 90,
    soxStereoDepth: 100,
    soxPredelayMs: 10,
    soxWetGain: 0,
    wetGain: 0.25,
    tailPadSec: 1.5,
  };
}

function tableName(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

function requireTable(): string {
  const n = tableName();
  if (!n) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  return n;
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Normalize / clamp a partial settings patch onto defaults. */
export function normalizeVoiceFxSettings(
  input: Partial<VoiceFxSettings> | null | undefined,
): VoiceFxSettings {
  const d = defaultVoiceFxSettings();
  const src = input ?? {};
  const delayMs = clamp(Number(src.delayMs ?? d.delayMs), 20, 2000);
  let delayMs2 = clamp(Number(src.delayMs2 ?? d.delayMs2), 40, 4000);
  let delayMs3 = clamp(Number(src.delayMs3 ?? d.delayMs3), 60, 6000);
  if (delayMs2 < delayMs) delayMs2 = Math.min(4000, delayMs * 2);
  if (delayMs3 < delayMs2) delayMs3 = Math.min(6000, Math.round(delayMs2 * 1.5));
  return {
    delayMs: Math.round(delayMs),
    delayMs2: Math.round(delayMs2),
    delayMs3: Math.round(delayMs3),
    delayDecay: clamp(Number(src.delayDecay ?? d.delayDecay), 0.05, 1),
    delayDecay2: clamp(Number(src.delayDecay2 ?? d.delayDecay2), 0.05, 1),
    delayDecay3: clamp(Number(src.delayDecay3 ?? d.delayDecay3), 0.05, 1),
    irLengthSec: clamp(Number(src.irLengthSec ?? d.irLengthSec), 0.25, 8),
    soxReverberance: clamp(
      Number(src.soxReverberance ?? d.soxReverberance),
      0,
      100,
    ),
    soxHfDamping: clamp(Number(src.soxHfDamping ?? d.soxHfDamping), 0, 100),
    soxRoomScale: clamp(Number(src.soxRoomScale ?? d.soxRoomScale), 0, 100),
    soxStereoDepth: clamp(
      Number(src.soxStereoDepth ?? d.soxStereoDepth),
      0,
      100,
    ),
    soxPredelayMs: clamp(Number(src.soxPredelayMs ?? d.soxPredelayMs), 0, 500),
    soxWetGain: clamp(Number(src.soxWetGain ?? d.soxWetGain), -24, 12),
    wetGain: clamp(Number(src.wetGain ?? d.wetGain), 0.05, 1),
    tailPadSec: clamp(Number(src.tailPadSec ?? d.tailPadSec), 0, 4),
  };
}

/** Fingerprint of IR-affecting params (regen IR when this changes). */
export function voiceFxIrFingerprint(s: VoiceFxSettings): string {
  return [
    s.irLengthSec.toFixed(3),
    Math.round(s.soxReverberance),
    Math.round(s.soxHfDamping),
    Math.round(s.soxRoomScale),
    Math.round(s.soxStereoDepth),
    Math.round(s.soxPredelayMs),
    s.soxWetGain.toFixed(2),
  ].join("|");
}

function parseRecord(item: Record<string, unknown> | undefined): VoiceFxSettingsRecord {
  const base = normalizeVoiceFxSettings(item as Partial<VoiceFxSettings>);
  return {
    ...base,
    updatedAt:
      typeof item?.updatedAt === "string" && item.updatedAt
        ? item.updatedAt
        : new Date(0).toISOString(),
    irFingerprint:
      typeof item?.irFingerprint === "string" ? item.irFingerprint : undefined,
  };
}

async function loadSk(sk: string): Promise<VoiceFxSettingsRecord | null> {
  const TableName = tableName();
  if (!TableName) return null;
  const res = await ddb.send(
    new GetCommand({
      TableName,
      Key: { pk: VOICE_SETTINGS_PK, sk },
    }),
  );
  if (!res.Item) return null;
  return parseRecord(res.Item as Record<string, unknown>);
}

export async function loadVoiceFxDraft(): Promise<VoiceFxSettingsRecord> {
  const row = await loadSk(VOICE_FX_DRAFT_SK);
  if (row) return row;
  const committed = await loadSk(VOICE_FX_COMMITTED_SK);
  if (committed) return { ...committed, updatedAt: committed.updatedAt };
  const now = new Date().toISOString();
  return { ...defaultVoiceFxSettings(), updatedAt: now };
}

export async function loadVoiceFxCommitted(): Promise<VoiceFxSettingsRecord> {
  const row = await loadSk(VOICE_FX_COMMITTED_SK);
  if (row) return row;
  return {
    ...defaultVoiceFxSettings(),
    updatedAt: new Date(0).toISOString(),
  };
}

async function saveSk(
  sk: string,
  settings: VoiceFxSettings,
  irFingerprint?: string,
): Promise<VoiceFxSettingsRecord> {
  const normalized = normalizeVoiceFxSettings(settings);
  const updatedAt = new Date().toISOString();
  const record: VoiceFxSettingsRecord = {
    ...normalized,
    updatedAt,
    irFingerprint: irFingerprint ?? voiceFxIrFingerprint(normalized),
  };
  await ddb.send(
    new PutCommand({
      TableName: requireTable(),
      Item: {
        pk: VOICE_SETTINGS_PK,
        sk,
        ...record,
      },
    }),
  );
  return record;
}

export async function saveVoiceFxDraft(
  settings: VoiceFxSettings,
  irFingerprint?: string,
): Promise<VoiceFxSettingsRecord> {
  return saveSk(VOICE_FX_DRAFT_SK, settings, irFingerprint);
}

export async function saveVoiceFxCommitted(
  settings: VoiceFxSettings,
  irFingerprint?: string,
): Promise<VoiceFxSettingsRecord> {
  return saveSk(VOICE_FX_COMMITTED_SK, settings, irFingerprint);
}

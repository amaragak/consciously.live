import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  FISH_SPEAKERS,
  HIDDEN_FISH_SPEAKER_MODEL_IDS,
  type FishSpeaker,
  type VoiceGender,
} from "./fish-speakers";
import {
  SCRIPT_PAUSE_BANDS,
  SCRIPT_PAUSE_BAND_SECONDS,
  type ScriptPauseBand,
} from "./script-pause-bands";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const VOICE_SPEAKER_PK = "VOICE_SPEAKER";
export const VOICE_SETTINGS_PK = "VOICE_SETTINGS";
export const VOICE_PAUSES_SK = "pauses";

export type VoiceSpeakerBrand = "fish" | "speechify";

/** `gender` widens to null here: the row always states it, even when unset. */
export type VoiceSpeakerRow = Omit<FishSpeaker, "gender"> & {
  /** TTS vendor. Existing rows without this field are Fish. */
  brand: VoiceSpeakerBrand;
  hidden: boolean;
  sort: number;
  updatedAt: string;
  /** How the voice sounds, for admins (and later picker copy). */
  description: string;
  /** Meditation types this voice suits. Free text, no taxonomy enforced. */
  goodFor: string[];
  /** Null when the admin has not specified one. */
  gender: VoiceGender | null;
  /** Speechify SSML rate offset in percent (e.g. -7 → rate="-7%"). Unused for Fish. */
  speechifyRate: number | null;
};

export type PauseBandSeconds = Record<ScriptPauseBand, number>;

function tableName(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

function requireTable(): string {
  const n = tableName();
  if (!n) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  return n;
}

export function defaultPauseBandSeconds(): PauseBandSeconds {
  return { ...SCRIPT_PAUSE_BAND_SECONDS };
}

export function defaultVoiceSpeakers(): VoiceSpeakerRow[] {
  const now = new Date().toISOString();
  return FISH_SPEAKERS.map((s, i) => ({
    name: s.name,
    modelId: s.modelId,
    brand: "fish" as const,
    hidden: HIDDEN_FISH_SPEAKER_MODEL_IDS.has(s.modelId),
    sort: i,
    description: "",
    goodFor: [],
    gender: null,
    speechifyRate: null,
    updatedAt: now,
  }));
}

function coercePauseSeconds(raw: unknown): PauseBandSeconds {
  const base = defaultPauseBandSeconds();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const band of SCRIPT_PAUSE_BANDS) {
    const n = Number(o[band]);
    // `open` sits can be up to ~3 minutes; other bands stay under two minutes.
    const max = band === "open" ? 180 : 120;
    if (Number.isFinite(n) && n > 0 && n <= max) base[band] = n;
  }
  return base;
}

function coerceDescription(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 800);
}

function coerceGender(raw: unknown): VoiceGender | null {
  return raw === "male" || raw === "female" ? raw : null;
}

export function coerceVoiceSpeakerBrand(raw: unknown): VoiceSpeakerBrand {
  return raw === "speechify" ? "speechify" : "fish";
}

function brandWasStored(raw: unknown): boolean {
  return raw === "fish" || raw === "speechify";
}

export function coerceSpeechifyRate(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n =
    typeof raw === "string"
      ? Number(raw.trim().replace(/%/g, ""))
      : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(-50, Math.min(50, Math.round(n)));
}

/** Accepts an array or a comma-separated string; entries stay free text. */
function coerceGoodFor(raw: unknown): string[] {
  const parts =
    typeof raw === "string"
      ? raw.split(",")
      : Array.isArray(raw)
        ? raw.map((x) => (typeof x === "string" ? x : ""))
        : [];
  const out: string[] = [];
  for (const part of parts) {
    const tag = part.trim().slice(0, 60);
    if (!tag) continue;
    if (out.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Descriptions written before this field existed end with their own "Good for
 * …" sentence. Lift it into the tags on read so the split shows up without a
 * backfill; the next admin save persists it.
 */
const TRAILING_GOOD_FOR = /\s*Good for:?\s+([^.]+)\.?\s*$/i;

function splitLegacyDescription(description: string): {
  description: string;
  goodFor: string[];
} {
  const match = TRAILING_GOOD_FOR.exec(description);
  if (!match) return { description, goodFor: [] };
  return {
    description: description.slice(0, match.index).trim(),
    goodFor: coerceGoodFor(match[1].replace(/\band\b/gi, ",")),
  };
}

export async function listVoiceSpeakers(): Promise<VoiceSpeakerRow[]> {
  const table = tableName();
  if (!table) return defaultVoiceSpeakers();
  const items: VoiceSpeakerRow[] = [];
  const missingBrand: VoiceSpeakerRow[] = [];
  let startKey: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": VOICE_SPEAKER_PK },
        ExclusiveStartKey: startKey,
      }),
    );
    for (const it of out.Items ?? []) {
      if (typeof it.sk !== "string" || !it.sk) continue;
      const stored = coerceGoodFor(it.goodFor);
      const legacy = splitLegacyDescription(coerceDescription(it.description));
      const row: VoiceSpeakerRow = {
        modelId: it.sk,
        name: typeof it.name === "string" && it.name.trim() ? it.name.trim() : it.sk,
        brand: coerceVoiceSpeakerBrand(it.brand),
        hidden: it.hidden === true,
        sort: typeof it.sort === "number" && Number.isFinite(it.sort) ? it.sort : 0,
        description: stored.length > 0 ? coerceDescription(it.description) : legacy.description,
        goodFor: stored.length > 0 ? stored : legacy.goodFor,
        gender: coerceGender(it.gender),
        speechifyRate: coerceSpeechifyRate(it.speechifyRate),
        updatedAt: typeof it.updatedAt === "string" ? it.updatedAt : "",
      };
      items.push(row);
      if (!brandWasStored(it.brand)) missingBrand.push(row);
    }
    startKey = out.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (startKey);
  if (items.length === 0) return defaultVoiceSpeakers();
  if (missingBrand.length > 0) {
    await Promise.all(missingBrand.map((row) => persistVoiceSpeaker(table, row)));
  }
  items.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  return items;
}

export async function seedVoiceSpeakersIfEmpty(): Promise<VoiceSpeakerRow[]> {
  const table = tableName();
  if (!table) return defaultVoiceSpeakers();
  const out = await ddb.send(
    new QueryCommand({
      TableName: table,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": VOICE_SPEAKER_PK },
      Limit: 1,
    }),
  );
  if ((out.Items ?? []).length > 0) return listVoiceSpeakers();
  const seeded = defaultVoiceSpeakers();
  for (const row of seeded) {
    await putVoiceSpeaker(row);
  }
  return seeded;
}

async function persistVoiceSpeaker(
  table: string,
  row: VoiceSpeakerRow,
): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: VOICE_SPEAKER_PK,
        sk: row.modelId,
        name: row.name,
        brand: row.brand,
        hidden: row.hidden,
        sort: row.sort,
        description: row.description,
        goodFor: row.goodFor,
        gender: row.gender,
        speechifyRate: row.speechifyRate,
        updatedAt: row.updatedAt,
      },
    }),
  );
}

export async function putVoiceSpeaker(row: {
  modelId: string;
  name: string;
  brand?: VoiceSpeakerBrand;
  hidden?: boolean;
  sort?: number;
  description?: string;
  goodFor?: string[] | string;
  gender?: VoiceGender | null;
  speechifyRate?: number | null;
}): Promise<VoiceSpeakerRow> {
  const table = requireTable();
  const modelId = row.modelId.trim();
  if (!modelId) throw new Error("modelId is required");
  const existing = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_SPEAKER_PK, sk: modelId },
    }),
  );
  const prev = existing.Item;
  const next: VoiceSpeakerRow = {
    modelId,
    name: row.name.trim() || modelId,
    brand:
      row.brand !== undefined
        ? coerceVoiceSpeakerBrand(row.brand)
        : coerceVoiceSpeakerBrand(prev?.brand),
    hidden: row.hidden === true,
    sort: typeof row.sort === "number" && Number.isFinite(row.sort) ? row.sort : 0,
    description:
      row.description !== undefined
        ? coerceDescription(row.description)
        : coerceDescription(prev?.description),
    goodFor:
      row.goodFor !== undefined ? coerceGoodFor(row.goodFor) : coerceGoodFor(prev?.goodFor),
    gender:
      row.gender !== undefined ? coerceGender(row.gender) : coerceGender(prev?.gender),
    speechifyRate:
      row.speechifyRate !== undefined
        ? coerceSpeechifyRate(row.speechifyRate)
        : coerceSpeechifyRate(prev?.speechifyRate),
    updatedAt: new Date().toISOString(),
  };
  await persistVoiceSpeaker(table, next);
  return next;
}

export async function renameVoiceSpeaker(
  fromModelId: string,
  row: Parameters<typeof putVoiceSpeaker>[0],
): Promise<VoiceSpeakerRow> {
  const from = fromModelId.trim();
  const to = row.modelId.trim();
  if (!from || !to) throw new Error("modelId is required");
  if (from === to) return putVoiceSpeaker(row);
  const table = requireTable();
  const [fromItem, clash] = await Promise.all([
    ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: VOICE_SPEAKER_PK, sk: from },
      }),
    ),
    ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: VOICE_SPEAKER_PK, sk: to },
      }),
    ),
  ]);
  if (!fromItem.Item) throw new Error(`Speaker ${from} not found`);
  if (clash.Item) throw new Error(`Speaker ${to} already exists`);
  const prev = fromItem.Item;
  const next: VoiceSpeakerRow = {
    modelId: to,
    name: row.name.trim() || to,
    brand:
      row.brand !== undefined
        ? coerceVoiceSpeakerBrand(row.brand)
        : coerceVoiceSpeakerBrand(prev.brand),
    hidden: row.hidden === true,
    sort: typeof row.sort === "number" && Number.isFinite(row.sort) ? row.sort : 0,
    description:
      row.description !== undefined
        ? coerceDescription(row.description)
        : coerceDescription(prev.description),
    goodFor:
      row.goodFor !== undefined ? coerceGoodFor(row.goodFor) : coerceGoodFor(prev.goodFor),
    gender:
      row.gender !== undefined ? coerceGender(row.gender) : coerceGender(prev.gender),
    speechifyRate:
      row.speechifyRate !== undefined
        ? coerceSpeechifyRate(row.speechifyRate)
        : coerceSpeechifyRate(prev.speechifyRate),
    updatedAt: new Date().toISOString(),
  };
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: table,
            Item: {
              pk: VOICE_SPEAKER_PK,
              sk: next.modelId,
              name: next.name,
              brand: next.brand,
              hidden: next.hidden,
              sort: next.sort,
              description: next.description,
              goodFor: next.goodFor,
              gender: next.gender,
              speechifyRate: next.speechifyRate,
              updatedAt: next.updatedAt,
            },
            ConditionExpression: "attribute_not_exists(sk)",
          },
        },
        {
          Delete: {
            TableName: table,
            Key: { pk: VOICE_SPEAKER_PK, sk: from },
            ConditionExpression: "attribute_exists(sk)",
          },
        },
      ],
    }),
  );
  return next;
}

export async function deleteVoiceSpeaker(modelId: string): Promise<void> {
  const table = requireTable();
  await ddb.send(
    new DeleteCommand({
      TableName: table,
      Key: { pk: VOICE_SPEAKER_PK, sk: modelId.trim() },
    }),
  );
}

export async function loadPauseBandSeconds(): Promise<PauseBandSeconds> {
  const table = tableName();
  if (!table) return defaultPauseBandSeconds();
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: VOICE_SETTINGS_PK, sk: VOICE_PAUSES_SK },
    }),
  );
  return coercePauseSeconds(out.Item?.bands);
}

export async function savePauseBandSeconds(
  bands: Partial<Record<ScriptPauseBand, number>>,
): Promise<PauseBandSeconds> {
  const table = requireTable();
  const next = coercePauseSeconds({ ...SCRIPT_PAUSE_BAND_SECONDS, ...bands });
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: VOICE_SETTINGS_PK,
        sk: VOICE_PAUSES_SK,
        bands: next,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return next;
}

export async function getVoiceSpeaker(
  modelId: string | null | undefined,
): Promise<VoiceSpeakerRow | null> {
  if (!modelId) return null;
  const rows = await listVoiceSpeakers();
  return rows.find((s) => s.modelId === modelId) ?? null;
}

export async function listPickerFishSpeakers(): Promise<FishSpeaker[]> {
  const rows = await listVoiceSpeakers();
  return rows
    .filter((s) => !s.hidden)
    .map((s) => ({
      name: s.name,
      modelId: s.modelId,
      brand: s.brand,
      ...(s.updatedAt ? { updatedAt: s.updatedAt } : {}),
      ...(s.description ? { description: s.description } : {}),
      ...(s.goodFor.length > 0 ? { goodFor: s.goodFor } : {}),
      ...(s.gender ? { gender: s.gender } : {}),
    }));
}

export async function resolveSpeakerName(
  modelId: string | null | undefined,
): Promise<string | null> {
  if (!modelId) return null;
  const rows = await listVoiceSpeakers();
  return rows.find((s) => s.modelId === modelId)?.name ?? null;
}

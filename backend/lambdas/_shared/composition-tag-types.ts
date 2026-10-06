import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { normalizeTags } from "./sound-catalog";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const SOUND_SETTINGS_PK = "SOUND_SETTINGS";
export const COMPOSITION_TAG_TYPES_SK = "composition-tag-types";

export type CompositionTagType = {
  id: string;
  label: string;
  tags: string[];
  sort: number;
};

/** Seeded when nothing is stored yet — matches admin taxonomy intent. */
export const DEFAULT_COMPOSITION_TAG_TYPES: CompositionTagType[] = [
  {
    id: "brainwave",
    label: "Brainwave",
    tags: ["alpha", "beta", "theta", "delta", "gamma", "binaural"],
    sort: 0,
  },
  {
    id: "instruments",
    label: "Instruments",
    tags: [
      "bowl",
      "chime",
      "gong",
      "pan flute",
      "synth pads",
      "bass",
      "arpeggios",
      "drone",
      "pulse",
      "white noise",
      "voice",
    ],
    sort: 1,
  },
  {
    id: "nature",
    label: "Nature",
    tags: ["birds", "water", "waves", "fire", "animals", "nature", "nature-led"],
    sort: 2,
  },
  {
    id: "mood",
    label: "Mood",
    tags: [
      "dreamy",
      "eerie",
      "majestic",
      "melodic",
      "simple",
      "distant",
      "retro",
      "world",
    ],
    sort: 3,
  },
];

function tableName(): string | null {
  const n = process.env.SOUND_CATALOG_TABLE_NAME?.trim();
  return n || null;
}

function slugifyTypeId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function coerceCompositionTagTypes(raw: unknown): CompositionTagType[] {
  if (!Array.isArray(raw)) return [];
  const out: CompositionTagType[] = [];
  const seenIds = new Set<string>();
  const claimedTags = new Set<string>();
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const label =
      typeof o.label === "string" && o.label.trim()
        ? o.label.trim().slice(0, 48)
        : "";
    if (!label) continue;
    let id =
      typeof o.id === "string" && o.id.trim()
        ? slugifyTypeId(o.id)
        : slugifyTypeId(label);
    if (!id) id = `type-${i + 1}`;
    if (seenIds.has(id)) id = `${id}-${i + 1}`;
    seenIds.add(id);
    const tags: string[] = [];
    for (const t of normalizeTags(o.tags)) {
      if (claimedTags.has(t)) continue;
      claimedTags.add(t);
      tags.push(t);
    }
    const sort =
      typeof o.sort === "number" && Number.isFinite(o.sort)
        ? Math.floor(o.sort)
        : i;
    out.push({ id, label, tags, sort });
  }
  out.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  return out.map((t, i) => ({ ...t, sort: i }));
}

export async function loadCompositionTagTypes(): Promise<CompositionTagType[]> {
  const table = tableName();
  if (!table) return DEFAULT_COMPOSITION_TAG_TYPES.map((t, i) => ({ ...t, sort: i }));
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: SOUND_SETTINGS_PK, sk: COMPOSITION_TAG_TYPES_SK },
    }),
  );
  if (!out.Item) {
    return DEFAULT_COMPOSITION_TAG_TYPES.map((t, i) => ({ ...t, sort: i }));
  }
  const coerced = coerceCompositionTagTypes(out.Item.types);
  return coerced.length > 0
    ? coerced
    : DEFAULT_COMPOSITION_TAG_TYPES.map((t, i) => ({ ...t, sort: i }));
}

export async function saveCompositionTagTypes(
  raw: unknown,
): Promise<CompositionTagType[]> {
  const table = tableName();
  if (!table) throw new Error("SOUND_CATALOG_TABLE_NAME is not set");
  const types = coerceCompositionTagTypes(raw);
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: SOUND_SETTINGS_PK,
        sk: COMPOSITION_TAG_TYPES_SK,
        types,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return types;
}

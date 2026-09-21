import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { KNOWN_MEDITATION_TYPES } from "./meditation-types";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** Reuses the voice-admin table (pk/sk). */
export const LIBRARY_CATEGORY_IMAGES_PK = "LIBRARY";
export const LIBRARY_CATEGORY_IMAGES_SK = "CATEGORY_IMAGES";

/** Prior versions kept per category (oldest → newest). */
export const LIBRARY_CATEGORY_IMAGE_VERSION_CAP = 12;

/** Community grid slots that can have a cover — "All" plus library types. */
export const LIBRARY_CATEGORY_IMAGE_SLOTS = [
  "All",
  ...KNOWN_MEDITATION_TYPES,
] as const;

export type LibraryCategoryImageSlot =
  (typeof LIBRARY_CATEGORY_IMAGE_SLOTS)[number];

export type LibraryCategoryImageVersion = {
  id: string;
  imageUrl: string;
  imageKey: string;
  lastPrompt: string | null;
  createdAt: string;
};

export type LibraryCategoryImage = {
  category: string;
  imageUrl: string;
  imageKey: string;
  /** Last prompt used for AI generate (upload leaves null). */
  lastPrompt: string | null;
  updatedAt: string;
  /** Prior versions, oldest → newest. Active image is on the entry itself. */
  versions: LibraryCategoryImageVersion[];
};

export type LibraryCategoryImagesDoc = {
  byCategory: Record<string, LibraryCategoryImage>;
};

function tableName(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

export function isKnownLibraryCategory(raw: string): boolean {
  return (LIBRARY_CATEGORY_IMAGE_SLOTS as readonly string[]).includes(raw);
}

export function emptyCategoryImagesDoc(): LibraryCategoryImagesDoc {
  return { byCategory: {} };
}

export function newCategoryImageVersionId(): string {
  return `cv_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function coerceVersion(raw: unknown): LibraryCategoryImageVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const id = typeof v.id === "string" ? v.id.trim() : "";
  const imageUrl = typeof v.imageUrl === "string" ? v.imageUrl.trim() : "";
  const imageKey = typeof v.imageKey === "string" ? v.imageKey.trim() : "";
  if (!id || !imageUrl || !imageKey) return null;
  return {
    id,
    imageUrl,
    imageKey,
    lastPrompt:
      typeof v.lastPrompt === "string" && v.lastPrompt.trim()
        ? v.lastPrompt.trim()
        : null,
    createdAt:
      typeof v.createdAt === "string" && v.createdAt.trim()
        ? v.createdAt.trim()
        : new Date().toISOString(),
  };
}

function coerceVersions(raw: unknown): LibraryCategoryImageVersion[] {
  if (!Array.isArray(raw)) return [];
  const out: LibraryCategoryImageVersion[] = [];
  for (const item of raw) {
    const v = coerceVersion(item);
    if (v) out.push(v);
  }
  return out.slice(-LIBRARY_CATEGORY_IMAGE_VERSION_CAP);
}

function coerceEntry(
  category: string,
  value: Record<string, unknown>,
): LibraryCategoryImage | null {
  const imageUrl = typeof value.imageUrl === "string" ? value.imageUrl.trim() : "";
  const imageKey = typeof value.imageKey === "string" ? value.imageKey.trim() : "";
  if (!imageUrl || !imageKey) return null;
  return {
    category,
    imageUrl,
    imageKey,
    lastPrompt:
      typeof value.lastPrompt === "string" && value.lastPrompt.trim()
        ? value.lastPrompt.trim()
        : null,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.trim()
        ? value.updatedAt.trim()
        : new Date().toISOString(),
    versions: coerceVersions(value.versions),
  };
}

function coerceDoc(raw: unknown): LibraryCategoryImagesDoc {
  const base = emptyCategoryImagesDoc();
  if (!raw || typeof raw !== "object") return base;
  const by = (raw as { byCategory?: unknown }).byCategory;
  if (!by || typeof by !== "object") return base;
  for (const [key, value] of Object.entries(by as Record<string, unknown>)) {
    if (!isKnownLibraryCategory(key)) continue;
    if (!value || typeof value !== "object") continue;
    const entry = coerceEntry(key, value as Record<string, unknown>);
    if (entry) base.byCategory[key] = entry;
  }
  return base;
}

function snapshotActive(
  entry: LibraryCategoryImage,
): LibraryCategoryImageVersion {
  return {
    id: newCategoryImageVersionId(),
    imageUrl: entry.imageUrl,
    imageKey: entry.imageKey,
    lastPrompt: entry.lastPrompt,
    createdAt: entry.updatedAt,
  };
}

/**
 * Push current active onto history (if any), apply next active, trim to cap.
 * Returns S3 keys that fell off the history cap (safe to delete).
 */
export function applyCategoryImageNext(
  previous: LibraryCategoryImage | null,
  next: {
    category: string;
    imageUrl: string;
    imageKey: string;
    lastPrompt: string | null;
  },
): { entry: LibraryCategoryImage; droppedKeys: string[] } {
  const prior = previous ? [...previous.versions] : [];
  if (previous?.imageUrl && previous.imageKey) {
    prior.push(snapshotActive(previous));
  }
  const dropped = prior.slice(0, Math.max(0, prior.length - LIBRARY_CATEGORY_IMAGE_VERSION_CAP));
  const kept = prior.slice(-LIBRARY_CATEGORY_IMAGE_VERSION_CAP);
  return {
    entry: {
      category: next.category,
      imageUrl: next.imageUrl,
      imageKey: next.imageKey,
      lastPrompt: next.lastPrompt,
      updatedAt: new Date().toISOString(),
      versions: kept,
    },
    droppedKeys: dropped.map((v) => v.imageKey),
  };
}

/**
 * Make a prior version active; snapshot current onto history.
 */
export function restoreCategoryImageVersion(
  entry: LibraryCategoryImage,
  versionId: string,
): { entry: LibraryCategoryImage; droppedKeys: string[] } | null {
  const idx = entry.versions.findIndex((v) => v.id === versionId);
  if (idx < 0) return null;
  const chosen = entry.versions[idx]!;
  const rest = entry.versions.filter((v) => v.id !== versionId);
  if (entry.imageUrl && entry.imageKey) {
    rest.push(snapshotActive(entry));
  }
  const dropped = rest.slice(0, Math.max(0, rest.length - LIBRARY_CATEGORY_IMAGE_VERSION_CAP));
  const kept = rest.slice(-LIBRARY_CATEGORY_IMAGE_VERSION_CAP);
  return {
    entry: {
      category: entry.category,
      imageUrl: chosen.imageUrl,
      imageKey: chosen.imageKey,
      lastPrompt: chosen.lastPrompt,
      updatedAt: new Date().toISOString(),
      versions: kept,
    },
    droppedKeys: dropped.map((v) => v.imageKey),
  };
}

/** All S3 keys for an entry (active + versions) — for full clear. */
export function allCategoryImageKeys(entry: LibraryCategoryImage): string[] {
  const keys = [entry.imageKey, ...entry.versions.map((v) => v.imageKey)];
  return [...new Set(keys.filter(Boolean))];
}

export async function loadLibraryCategoryImages(): Promise<LibraryCategoryImagesDoc> {
  const table = tableName();
  if (!table) return emptyCategoryImagesDoc();
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: {
        pk: LIBRARY_CATEGORY_IMAGES_PK,
        sk: LIBRARY_CATEGORY_IMAGES_SK,
      },
    }),
  );
  return coerceDoc(out.Item);
}

export async function putLibraryCategoryImage(
  entry: LibraryCategoryImage,
): Promise<LibraryCategoryImagesDoc> {
  const table = tableName();
  if (!table) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  if (!isKnownLibraryCategory(entry.category)) {
    throw new Error(`Unknown category: ${entry.category}`);
  }
  const current = await loadLibraryCategoryImages();
  current.byCategory[entry.category] = {
    ...entry,
    versions: entry.versions.slice(-LIBRARY_CATEGORY_IMAGE_VERSION_CAP),
  };
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: LIBRARY_CATEGORY_IMAGES_PK,
        sk: LIBRARY_CATEGORY_IMAGES_SK,
        byCategory: current.byCategory,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return current;
}

export async function clearLibraryCategoryImage(
  category: string,
): Promise<{ doc: LibraryCategoryImagesDoc; removed: LibraryCategoryImage | null }> {
  const table = tableName();
  if (!table) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  if (!isKnownLibraryCategory(category)) {
    throw new Error(`Unknown category: ${category}`);
  }
  const current = await loadLibraryCategoryImages();
  const removed = current.byCategory[category] ?? null;
  if (removed) {
    delete current.byCategory[category];
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: LIBRARY_CATEGORY_IMAGES_PK,
          sk: LIBRARY_CATEGORY_IMAGES_SK,
          byCategory: current.byCategory,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
  }
  return { doc: current, removed };
}

export function categoryImagesList(
  doc: LibraryCategoryImagesDoc,
): LibraryCategoryImage[] {
  return LIBRARY_CATEGORY_IMAGE_SLOTS.map((cat) => doc.byCategory[cat]).filter(
    (x): x is LibraryCategoryImage => Boolean(x),
  );
}

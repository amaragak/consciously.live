/**
 * Cached JSON for GET /media/background-audio.
 * Invalidated whenever the sound catalog (or related overlays) change.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const META_PK = "SOUND_META";
const VERSION_SK = "BG_AUDIO_LIST_VERSION";
const CACHE_SK = "BG_AUDIO_LIST_CACHE";

function tableName(): string | null {
  return process.env.SOUND_CATALOG_TABLE_NAME?.trim() || null;
}

export type BgAudioListCacheHit = {
  version: string;
  payload: Record<string, unknown>;
  updatedAt: string;
};

/** Current list cache version (ISO or counter string). */
export async function getBgAudioListCacheVersion(): Promise<string | null> {
  const table = tableName();
  if (!table) return null;
  try {
    const res = await ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: META_PK, sk: VERSION_SK },
        ConsistentRead: true,
      }),
    );
    const v = res.Item?.version;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  } catch (e) {
    console.warn("getBgAudioListCacheVersion failed", e);
    return null;
  }
}

export async function getBgAudioListCache(): Promise<BgAudioListCacheHit | null> {
  const table = tableName();
  if (!table) return null;
  try {
    const res = await ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: META_PK, sk: CACHE_SK },
        ConsistentRead: true,
      }),
    );
    const item = res.Item;
    if (!item) return null;
    const version =
      typeof item.version === "string" && item.version.trim()
        ? item.version.trim()
        : null;
    const payload = item.payload;
    const updatedAt =
      typeof item.updatedAt === "string" ? item.updatedAt : "";
    if (!version || !payload || typeof payload !== "object") return null;
    return {
      version,
      payload: payload as Record<string, unknown>,
      updatedAt,
    };
  } catch (e) {
    console.warn("getBgAudioListCache failed", e);
    return null;
  }
}

export async function putBgAudioListCache(
  version: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const table = tableName();
  if (!table) return;
  const now = new Date().toISOString();
  try {
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: META_PK,
          sk: CACHE_SK,
          version,
          payload,
          updatedAt: now,
        },
      }),
    );
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: META_PK,
          sk: VERSION_SK,
          version,
          updatedAt: now,
        },
      }),
    );
  } catch (e) {
    console.warn("putBgAudioListCache failed", e);
  }
}

/**
 * Bump version and drop cached payload so the next list rebuilds.
 * Soft-fails — catalog writes must not break if cache meta is unavailable.
 */
export async function invalidateBgAudioListCache(): Promise<void> {
  const table = tableName();
  if (!table) return;
  const version = new Date().toISOString();
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: table,
        Key: { pk: META_PK, sk: VERSION_SK },
        UpdateExpression: "SET #v = :v, updatedAt = :now",
        ExpressionAttributeNames: { "#v": "version" },
        ExpressionAttributeValues: { ":v": version, ":now": version },
      }),
    );
  } catch (e) {
    console.warn("invalidateBgAudioListCache version bump failed", e);
  }
  try {
    await ddb.send(
      new DeleteCommand({
        TableName: table,
        Key: { pk: META_PK, sk: CACHE_SK },
      }),
    );
  } catch (e) {
    console.warn("invalidateBgAudioListCache delete failed", e);
  }
}

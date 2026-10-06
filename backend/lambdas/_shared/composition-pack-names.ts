import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const SOUND_SETTINGS_PK = "SOUND_SETTINGS";
export const COMPOSITION_PACK_NAMES_SK = "composition-pack-names";

function tableName(): string | null {
  const n = process.env.SOUND_CATALOG_TABLE_NAME?.trim();
  return n || null;
}

/** Display label for a custom pack (consumer-facing). */
export function normalizeCompositionPackName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, 48);
}

export function coerceCompositionPackNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const name = normalizeCompositionPackName(row);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= 48) break;
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export async function loadCompositionPackNames(): Promise<string[]> {
  const table = tableName();
  if (!table) return [];
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: SOUND_SETTINGS_PK, sk: COMPOSITION_PACK_NAMES_SK },
    }),
  );
  if (!out.Item) return [];
  return coerceCompositionPackNames(out.Item.names);
}

export async function saveCompositionPackNames(
  raw: unknown,
): Promise<string[]> {
  const table = tableName();
  if (!table) throw new Error("SOUND_CATALOG_TABLE_NAME is not set");
  const names = coerceCompositionPackNames(raw);
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: SOUND_SETTINGS_PK,
        sk: COMPOSITION_PACK_NAMES_SK,
        names,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return names;
}

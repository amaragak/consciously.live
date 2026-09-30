/**
 * Manual AI credit / prepaid balance snapshots (admin-entered).
 * Stored on the voice-admin table alongside Dev UI settings.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { AiProviderId } from "./ai-provider-pricing";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const AI_CREDITS_PK = "APP_SETTINGS";
export const AI_CREDITS_SK = "AI_CREDITS";

export type AiCreditSnapshot = {
  /** Remaining prepaid / wallet USD (or vendor credit units normalized to USD when known). */
  remainingUsd: number | null;
  /** Free-form note (plan name, top-up date, etc.). */
  note: string;
  updatedAt: string | null;
};

export type AiCreditBalances = Record<AiProviderId, AiCreditSnapshot>;

function tableName(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

function blank(): AiCreditSnapshot {
  return { remainingUsd: null, note: "", updatedAt: null };
}

export function defaultAiCreditBalances(): AiCreditBalances {
  return {
    anthropic: blank(),
    fish: blank(),
    openai: blank(),
    google: blank(),
    speechify: blank(),
  };
}

function coerce(raw: unknown): AiCreditBalances {
  const base = defaultAiCreditBalances();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  for (const id of Object.keys(base) as AiProviderId[]) {
    const row = o[id];
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const usd =
      typeof r.remainingUsd === "number" && Number.isFinite(r.remainingUsd)
        ? r.remainingUsd
        : null;
    base[id] = {
      remainingUsd: usd,
      note: typeof r.note === "string" ? r.note.slice(0, 400) : "",
      updatedAt:
        typeof r.updatedAt === "string" && r.updatedAt.trim()
          ? r.updatedAt.trim()
          : null,
    };
  }
  return base;
}

export async function loadAiCreditBalances(): Promise<AiCreditBalances> {
  const table = tableName();
  if (!table) return defaultAiCreditBalances();
  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: AI_CREDITS_PK, sk: AI_CREDITS_SK },
      }),
    );
    return coerce(out.Item?.balances);
  } catch (e) {
    console.error("loadAiCreditBalances", e);
    return defaultAiCreditBalances();
  }
}

export async function saveAiCreditBalances(
  patch: Partial<
    Record<AiProviderId, { remainingUsd?: number | null; note?: string }>
  >,
): Promise<AiCreditBalances> {
  const table = tableName();
  if (!table) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  const current = await loadAiCreditBalances();
  const now = new Date().toISOString();
  const next = { ...current };
  for (const id of Object.keys(patch) as AiProviderId[]) {
    const p = patch[id];
    if (!p) continue;
    const prev = current[id] ?? blank();
    next[id] = {
      remainingUsd:
        p.remainingUsd === undefined
          ? prev.remainingUsd
          : p.remainingUsd === null ||
              (typeof p.remainingUsd === "number" &&
                Number.isFinite(p.remainingUsd))
            ? p.remainingUsd
            : prev.remainingUsd,
      note:
        typeof p.note === "string" ? p.note.trim().slice(0, 400) : prev.note,
      updatedAt: now,
    };
  }
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: AI_CREDITS_PK,
        sk: AI_CREDITS_SK,
        balances: next,
        updatedAt: now,
      },
    }),
  );
  return next;
}

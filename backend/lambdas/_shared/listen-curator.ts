/**
 * Admin-curated Listen index (examples on /listen).
 * Stored on the voice-admin table; public Listen reads published slots.
 */

import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import type { ListenShareKind } from "./listen-share";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const LISTEN_CURATOR_PK = "LISTEN_CURATOR";
export const LISTEN_CURATOR_SK = "SETTINGS";

export type ListenCuratorSlot = {
  id: string;
  ownerPk: string;
  ownerSk: string;
  kind: ListenShareKind;
  sort: number;
  published: boolean;
  /** Optional display overrides (empty = use meditation share / title). */
  title: string | null;
  description: string | null;
};

export type ListenCuratorSettings = {
  /** When false (default), /listen index shows only curated slots. */
  includeCommunity: boolean;
  slots: ListenCuratorSlot[];
};

function settingsTable(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

export function defaultListenCuratorSettings(): ListenCuratorSettings {
  return { includeCommunity: false, slots: [] };
}

function coerceSlot(raw: unknown, index: number): ListenCuratorSlot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ownerPk = typeof o.ownerPk === "string" ? o.ownerPk.trim() : "";
  const ownerSk = typeof o.ownerSk === "string" ? o.ownerSk.trim() : "";
  if (!ownerPk || !ownerSk) return null;
  const id =
    typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID();
  const kind: ListenShareKind = o.kind === "story" ? "story" : "meditation";
  const sort =
    typeof o.sort === "number" && Number.isFinite(o.sort) ? o.sort : index;
  return {
    id,
    ownerPk,
    ownerSk,
    kind,
    sort,
    published: o.published !== false,
    title:
      typeof o.title === "string" && o.title.trim() ? o.title.trim() : null,
    description:
      typeof o.description === "string" && o.description.trim()
        ? o.description.trim()
        : null,
  };
}

export function coerceListenCuratorSettings(
  raw: unknown,
): ListenCuratorSettings {
  const base = defaultListenCuratorSettings();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (typeof o.includeCommunity === "boolean") {
    base.includeCommunity = o.includeCommunity;
  }
  if (Array.isArray(o.slots)) {
    base.slots = o.slots
      .map((row, i) => coerceSlot(row, i))
      .filter((s): s is ListenCuratorSlot => Boolean(s))
      .sort((a, b) => a.sort - b.sort)
      .map((s, i) => ({ ...s, sort: i }));
  }
  return base;
}

export async function getListenCuratorSettings(): Promise<ListenCuratorSettings> {
  const table = settingsTable();
  if (!table) return defaultListenCuratorSettings();
  try {
    const out = await ddb.send(
      new GetCommand({
        TableName: table,
        Key: { pk: LISTEN_CURATOR_PK, sk: LISTEN_CURATOR_SK },
      }),
    );
    return coerceListenCuratorSettings(out.Item);
  } catch (e) {
    console.warn(
      "getListenCuratorSettings",
      e instanceof Error ? e.message : e,
    );
    return defaultListenCuratorSettings();
  }
}

export async function putListenCuratorSettings(input: {
  includeCommunity?: boolean;
  slots?: unknown;
}): Promise<ListenCuratorSettings> {
  const table = settingsTable();
  if (!table) throw new Error("VOICE_ADMIN_TABLE_NAME is not set");
  const existing = await getListenCuratorSettings();
  const next = coerceListenCuratorSettings({
    includeCommunity:
      typeof input.includeCommunity === "boolean"
        ? input.includeCommunity
        : existing.includeCommunity,
    slots: input.slots !== undefined ? input.slots : existing.slots,
  });
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: LISTEN_CURATOR_PK,
        sk: LISTEN_CURATOR_SK,
        includeCommunity: next.includeCommunity,
        slots: next.slots,
        updatedAt: new Date().toISOString(),
      },
    }),
  );
  return next;
}

export function newListenCuratorSlot(params: {
  ownerPk: string;
  ownerSk: string;
  kind: ListenShareKind;
  sort: number;
  title?: string | null;
  description?: string | null;
  published?: boolean;
}): ListenCuratorSlot {
  return {
    id: randomUUID(),
    ownerPk: params.ownerPk.trim(),
    ownerSk: params.ownerSk.trim(),
    kind: params.kind,
    sort: params.sort,
    published: params.published !== false,
    title: params.title?.trim() || null,
    description: params.description?.trim() || null,
  };
}

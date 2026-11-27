/**
 * Versioned script-generation pre-prompts + style guides (VoiceAdmin Dynamo).
 *
 *   pk SCRIPT_PREPROMPT
 *   sk ENTRY#{id}            → entry summary (latest version, preferred bookmarks, repo hash)
 *   sk VER#{id}#{000001}     → one immutable version (append-only; never edited/deleted
 *                              except the preferred bookmark fields)
 *   sk _META                 → last deploy sync
 *
 * Repo files are the defaults. Deploy (syncPrepromptsFromRepo) only appends a version
 * when the repo file's text changed since the last REPO version, so manual edits stay
 * live until the file is deliberately changed.
 *
 * Replaces the old CLAUDE_PREPROMPT catalog for the Admin Pre-prompts UI
 * (claude-preprompts-store.ts is kept but no longer read by that screen).
 */
import { createHash } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { normalizeMeditationType } from "../meditation-types";
import { PREPROMPT_DEFAULTS } from "./preprompt-defaults-data";
import {
  getRegistryEntry,
  missingRequiredPlaceholders,
  normalizePrepromptText,
  PREPROMPT_REGISTRY,
  styleGuideEntryIdForType,
  type PrepromptGroup,
  type PrepromptRegistryEntry,
} from "./preprompt-registry";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const SCRIPT_PREPROMPT_PK = "SCRIPT_PREPROMPT";
export const SCRIPT_PREPROMPT_META_SK = "_META";

export type PrepromptSource = "deploy" | "manual" | "harvester";

/** Small per-style summary stored on each dataset version (list + detail views). */
export type DatasetStyleSummary = {
  style: string;
  meditationType: string;
  skeletons?: number;
  primary?: number;
  medianRuntimeS?: number | null;
  videos?: number;
  speechShareMedian?: number | null;
  /** Delivery fingerprints: median ratings (1–5) and family counts. */
  directivenessMedian?: number | null;
  certaintyMedian?: number | null;
  families?: { marker: number; generic: number; foreign: number };
};

export type PrepromptEntryRecord = {
  id: string;
  name: string;
  description: string;
  group: PrepromptGroup;
  repoPath: string;
  requiredPlaceholders: string[];
  sortOrder: number;
  latestVersion: number;
  lastRepoContentHash: string;
  /** Version number of the last version that came from the repo file. */
  lastRepoVersion: number;
  preferredVersionNumbers: number[];
  /** Set when the latest version is a deploy that replaced a manual edit. */
  replacedManualAt?: string;
  replacedManualNote?: string;
  /** Denormalised from the latest version (list screen). */
  latestSource: PrepromptSource;
  latestCreatedAt: string;
  latestAuthorEmail?: string;
  latestDeployId?: string;
  updatedAt: string;
  /** Hash of the content from the last harvester import (style guides + datasets). */
  lastHarvesterContentHash?: string;
  lastHarvesterBundleId?: string;
  latestBundleId?: string;
};

export type PrepromptVersionRecord = {
  id: string;
  version: number;
  text: string;
  createdAt: string;
  source: PrepromptSource;
  deployId?: string;
  authorEmail?: string;
  note?: string;
  preferred?: boolean;
  preferredLabel?: string;
  /** Deploy version that superseded a manual edit. */
  replacedManualEdit?: boolean;
  replacedManualFrom?: string;
  /** Restore copies: the version this text was copied from. */
  restoredFromVersion?: number;
  /** Harvester bundle version stamp (e.g. 20261127-153252-c5ba8f212fc7). */
  bundleId?: string;
  bundleHash?: string;
  /** "deploy" (deploy-back auto import) or "admin" (upload). */
  importedVia?: string;
  /** Datasets: sha256 of the canonical JSON. */
  contentHash?: string;
  /** Datasets: which version's chunk items hold the JSON (restores reuse chunks). */
  chunkVersion?: number;
  chunkCount?: number;
  byteLength?: number;
  summary?: DatasetStyleSummary[];
};

export type PrepromptEntrySummary = Omit<
  PrepromptEntryRecord,
  "lastRepoContentHash" | "lastHarvesterContentHash"
> & {
  /** false = registry entry not synced to Dynamo yet (before first deploy). */
  seeded: boolean;
  latestPreferred: boolean;
  /** Edits past the most recent preferred version (null if none preferred). */
  editsPastPreferred: number | null;
  latestPreferredVersion: number | null;
};

export class PrepromptError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "PrepromptError";
  }
}

export function envTable(): string | null {
  const n = process.env.VOICE_ADMIN_TABLE_NAME?.trim();
  return n || null;
}

export function requireTable(tableName?: string): string {
  const t = tableName?.trim() || envTable();
  if (!t) throw new PrepromptError(500, "VOICE_ADMIN_TABLE_NAME is not set");
  return t;
}

export function prepromptEntrySk(id: string): string {
  return `ENTRY#${id}`;
}

export function prepromptVersionSk(id: string, version: number): string {
  return `VER#${id}#${String(version).padStart(6, "0")}`;
}

export function hashPrepromptText(text: string): string {
  return createHash("sha256").update(normalizePrepromptText(text)).digest("hex");
}

function asSource(v: unknown): PrepromptSource {
  return v === "manual" ? "manual" : v === "harvester" ? "harvester" : "deploy";
}

function asEntry(raw: Record<string, unknown>): PrepromptEntryRecord {
  const str = (k: string, d = "") =>
    typeof raw[k] === "string" ? (raw[k] as string) : d;
  const num = (k: string, d = 0) =>
    typeof raw[k] === "number" ? (raw[k] as number) : d;
  const group = str("group");
  return {
    id: str("id"),
    name: str("name"),
    description: str("description"),
    group:
      group === "style_guide" || group === "dataset" ? group : "preprompt",
    repoPath: str("repoPath"),
    requiredPlaceholders: Array.isArray(raw.requiredPlaceholders)
      ? (raw.requiredPlaceholders as unknown[]).filter(
          (x): x is string => typeof x === "string",
        )
      : [],
    sortOrder: num("sortOrder"),
    latestVersion: num("latestVersion"),
    lastRepoContentHash: str("lastRepoContentHash"),
    lastRepoVersion: num("lastRepoVersion"),
    preferredVersionNumbers: Array.isArray(raw.preferredVersionNumbers)
      ? (raw.preferredVersionNumbers as unknown[])
          .filter((x): x is number => typeof x === "number")
          .sort((a, b) => a - b)
      : [],
    ...(raw.replacedManualAt
      ? { replacedManualAt: str("replacedManualAt") }
      : {}),
    ...(raw.replacedManualNote
      ? { replacedManualNote: str("replacedManualNote") }
      : {}),
    latestSource: asSource(raw.latestSource),
    latestCreatedAt: str("latestCreatedAt"),
    ...(raw.latestAuthorEmail
      ? { latestAuthorEmail: str("latestAuthorEmail") }
      : {}),
    ...(raw.latestDeployId ? { latestDeployId: str("latestDeployId") } : {}),
    updatedAt: str("updatedAt"),
    ...(raw.lastHarvesterContentHash
      ? { lastHarvesterContentHash: str("lastHarvesterContentHash") }
      : {}),
    ...(raw.lastHarvesterBundleId
      ? { lastHarvesterBundleId: str("lastHarvesterBundleId") }
      : {}),
    ...(raw.latestBundleId ? { latestBundleId: str("latestBundleId") } : {}),
  };
}

export function asVersion(raw: Record<string, unknown>): PrepromptVersionRecord {
  const str = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string) : undefined;
  const num = (k: string) =>
    typeof raw[k] === "number" ? (raw[k] as number) : undefined;
  return {
    id: str("id") ?? "",
    version: typeof raw.version === "number" ? raw.version : 0,
    text: str("text") ?? "",
    createdAt: str("createdAt") ?? "",
    source: asSource(raw.source),
    ...(str("bundleId") ? { bundleId: str("bundleId") } : {}),
    ...(str("bundleHash") ? { bundleHash: str("bundleHash") } : {}),
    ...(str("importedVia") ? { importedVia: str("importedVia") } : {}),
    ...(str("contentHash") ? { contentHash: str("contentHash") } : {}),
    ...(num("chunkVersion") != null ? { chunkVersion: num("chunkVersion") } : {}),
    ...(num("chunkCount") != null ? { chunkCount: num("chunkCount") } : {}),
    ...(num("byteLength") != null ? { byteLength: num("byteLength") } : {}),
    ...(Array.isArray(raw.summary)
      ? { summary: raw.summary as DatasetStyleSummary[] }
      : {}),
    ...(str("deployId") ? { deployId: str("deployId") } : {}),
    ...(str("authorEmail") ? { authorEmail: str("authorEmail") } : {}),
    ...(str("note") ? { note: str("note") } : {}),
    ...(raw.preferred === true ? { preferred: true } : {}),
    ...(str("preferredLabel") ? { preferredLabel: str("preferredLabel") } : {}),
    ...(raw.replacedManualEdit === true ? { replacedManualEdit: true } : {}),
    ...(str("replacedManualFrom")
      ? { replacedManualFrom: str("replacedManualFrom") }
      : {}),
    ...(typeof raw.restoredFromVersion === "number"
      ? { restoredFromVersion: raw.restoredFromVersion }
      : {}),
  };
}

export async function getEntryRaw(
  table: string,
  id: string,
): Promise<PrepromptEntryRecord | null> {
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: SCRIPT_PREPROMPT_PK, sk: prepromptEntrySk(id) },
    }),
  );
  return out.Item ? asEntry(out.Item) : null;
}

export async function getVersionRaw(
  table: string,
  id: string,
  version: number,
): Promise<PrepromptVersionRecord | null> {
  const out = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: SCRIPT_PREPROMPT_PK, sk: prepromptVersionSk(id, version) },
    }),
  );
  return out.Item ? asVersion(out.Item) : null;
}

export function registryMetaFields(e: PrepromptRegistryEntry) {
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    group: e.group,
    repoPath: e.repoRelativePath,
    requiredPlaceholders: e.requiredPlaceholders,
    sortOrder: e.sortOrder,
  };
}

/**
 * Append a version and move the entry's latest pointer (atomic; fails if another
 * writer appended first).
 */
export async function appendVersion(params: {
  table: string;
  entry: PrepromptEntryRecord;
  version: Omit<PrepromptVersionRecord, "id" | "version" | "createdAt">;
  /** Extra entry fields to set / remove alongside the append. */
  entrySet?: Record<string, unknown>;
  entryRemove?: string[];
  now?: string;
}): Promise<PrepromptVersionRecord> {
  const { table, entry } = params;
  const now = params.now ?? new Date().toISOString();
  const next = entry.latestVersion + 1;
  const ver: PrepromptVersionRecord = {
    ...params.version,
    id: entry.id,
    version: next,
    createdAt: now,
  };

  const set: Record<string, unknown> = {
    latestVersion: next,
    updatedAt: now,
    latestSource: ver.source,
    latestCreatedAt: now,
    latestAuthorEmail: ver.authorEmail ?? null,
    latestDeployId: ver.deployId ?? null,
    latestBundleId: ver.bundleId ?? null,
    ...(params.entrySet ?? {}),
  };
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ":prev": entry.latestVersion };
  const setParts: string[] = [];
  for (const [k, v] of Object.entries(set)) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    setParts.push(`#${k} = :${k}`);
  }
  const removeParts: string[] = [];
  for (const k of params.entryRemove ?? []) {
    names[`#${k}`] = k;
    removeParts.push(`#${k}`);
  }
  names["#latestVersion"] = "latestVersion";

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: table,
              Item: {
                pk: SCRIPT_PREPROMPT_PK,
                sk: prepromptVersionSk(entry.id, next),
                ...ver,
              },
              ConditionExpression: "attribute_not_exists(pk)",
            },
          },
          {
            Update: {
              TableName: table,
              Key: { pk: SCRIPT_PREPROMPT_PK, sk: prepromptEntrySk(entry.id) },
              UpdateExpression:
                `SET ${setParts.join(", ")}` +
                (removeParts.length ? ` REMOVE ${removeParts.join(", ")}` : ""),
              ConditionExpression: "#latestVersion = :prev",
              ExpressionAttributeNames: names,
              ExpressionAttributeValues: values,
            },
          },
        ],
      }),
    );
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "TransactionCanceledException") {
      throw new PrepromptError(
        409,
        "This entry changed while you were saving. Reload and try again.",
      );
    }
    throw e;
  }
  return ver;
}

// ─── Deploy sync ───────────────────────────────────────────────────────────

export type PrepromptSyncAction =
  | "created"
  | "appended"
  | "unchanged"
  | "skipped";

export type PrepromptSyncResult = {
  syncedAt: string;
  deployId: string | null;
  results: Array<{
    id: string;
    action: PrepromptSyncAction;
    version: number;
    replacedManual?: boolean;
    error?: string;
  }>;
};

/**
 * For each registry entry: create v1 from the repo file, or append a deploy
 * version ONLY when the file text differs from the last repo version.
 */
export async function syncPrepromptsFromRepo(params?: {
  tableName?: string;
  deployId?: string;
}): Promise<PrepromptSyncResult> {
  const table = requireTable(params?.tableName);
  const deployId = params?.deployId?.trim() || null;
  const syncedAt = new Date().toISOString();
  // Lazy: fs is only needed for deploy sync, never in Lambda request paths.
  const { readRepoPrepromptText } = await import("./preprompt-repo-files");
  const results: PrepromptSyncResult["results"] = [];

  for (const reg of PREPROMPT_REGISTRY) {
    // Datasets come from the harvester bundle import, not a repo text file.
    if (reg.group === "dataset") continue;
    let text: string;
    try {
      text = readRepoPrepromptText(reg);
    } catch (e) {
      results.push({
        id: reg.id,
        action: "skipped",
        version: 0,
        error: `cannot read ${reg.repoRelativePath}: ${e instanceof Error ? e.message : e}`,
      });
      continue;
    }
    const missing = missingRequiredPlaceholders(reg, text);
    if (!text || missing.length > 0) {
      results.push({
        id: reg.id,
        action: "skipped",
        version: 0,
        error: !text
          ? "repo file is empty"
          : `repo file is missing required placeholder(s): ${missing.join(", ")}`,
      });
      continue;
    }
    const hash = hashPrepromptText(text);
    const existing = await getEntryRaw(table, reg.id);

    if (!existing || existing.latestVersion < 1) {
      const entry: PrepromptEntryRecord = {
        ...registryMetaFields(reg),
        latestVersion: 1,
        lastRepoContentHash: hash,
        lastRepoVersion: 1,
        preferredVersionNumbers: [],
        latestSource: "deploy",
        latestCreatedAt: syncedAt,
        ...(deployId ? { latestDeployId: deployId } : {}),
        updatedAt: syncedAt,
      };
      const ver: PrepromptVersionRecord = {
        id: reg.id,
        version: 1,
        text,
        createdAt: syncedAt,
        source: "deploy",
        ...(deployId ? { deployId } : {}),
      };
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: table,
                Item: {
                  pk: SCRIPT_PREPROMPT_PK,
                  sk: prepromptEntrySk(reg.id),
                  ...entry,
                },
              },
            },
            {
              Put: {
                TableName: table,
                Item: {
                  pk: SCRIPT_PREPROMPT_PK,
                  sk: prepromptVersionSk(reg.id, 1),
                  ...ver,
                },
                ConditionExpression: "attribute_not_exists(pk)",
              },
            },
          ],
        }),
      );
      results.push({ id: reg.id, action: "created", version: 1 });
      continue;
    }

    // Keep display metadata fresh without touching versions.
    const meta = registryMetaFields(reg);
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: SCRIPT_PREPROMPT_PK,
          sk: prepromptEntrySk(reg.id),
          ...existing,
          ...meta,
        },
      }),
    );

    if (hash === existing.lastRepoContentHash) {
      // Repo file unchanged: manual edits stay live; do nothing.
      results.push({
        id: reg.id,
        action: "unchanged",
        version: existing.latestVersion,
      });
      continue;
    }

    const latest = await getVersionRaw(table, reg.id, existing.latestVersion);
    const replacedManual = latest?.source === "manual";
    const ver = await appendVersion({
      table,
      entry: { ...existing, ...meta },
      version: {
        text,
        source: "deploy",
        ...(deployId ? { deployId } : {}),
        ...(replacedManual
          ? {
              replacedManualEdit: true,
              replacedManualFrom: latest!.createdAt,
            }
          : {}),
      },
      entrySet: {
        lastRepoContentHash: hash,
        lastRepoVersion: existing.latestVersion + 1,
        ...(replacedManual
          ? {
              replacedManualAt: latest!.createdAt,
              replacedManualNote: latest!.note ?? null,
            }
          : {}),
      },
      // Marker only describes the CURRENT latest; clear when this deploy replaced nothing.
      entryRemove: replacedManual
        ? []
        : ["replacedManualAt", "replacedManualNote"],
      now: syncedAt,
    });
    results.push({
      id: reg.id,
      action: "appended",
      version: ver.version,
      replacedManual,
    });
  }

  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        pk: SCRIPT_PREPROMPT_PK,
        sk: SCRIPT_PREPROMPT_META_SK,
        syncedAt,
        deployId,
        count: results.length,
        ids: results.map((r) => r.id),
      },
    }),
  );

  return { syncedAt, deployId, results };
}

// ─── Admin reads ───────────────────────────────────────────────────────────

function toSummary(
  e: PrepromptEntryRecord,
  seeded: boolean,
): PrepromptEntrySummary {
  const {
    lastRepoContentHash: _hash,
    lastHarvesterContentHash: _hHash,
    ...rest
  } = e;
  void _hash;
  void _hHash;
  const maxPref = e.preferredVersionNumbers.length
    ? Math.max(...e.preferredVersionNumbers)
    : null;
  return {
    ...rest,
    seeded,
    latestPreferred: e.preferredVersionNumbers.includes(e.latestVersion),
    latestPreferredVersion: maxPref,
    editsPastPreferred: maxPref == null ? null : e.latestVersion - maxPref,
  };
}

async function queryEntries(table: string): Promise<PrepromptEntryRecord[]> {
  const out: PrepromptEntryRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)",
        ExpressionAttributeValues: { ":pk": SCRIPT_PREPROMPT_PK, ":p": "ENTRY#" },
        ExclusiveStartKey,
      }),
    );
    for (const raw of res.Items ?? []) out.push(asEntry(raw));
    ExclusiveStartKey = res.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (ExclusiveStartKey);
  return out;
}

/** Summaries for the admin list (registry entries only, in registry order). */
export async function listPrepromptEntries(params?: {
  tableName?: string;
}): Promise<{
  entries: PrepromptEntrySummary[];
  meta: { syncedAt: string; deployId: string | null } | null;
}> {
  const table = requireTable(params?.tableName);
  const stored = new Map((await queryEntries(table)).map((e) => [e.id, e]));
  const entries = PREPROMPT_REGISTRY.map((reg) => {
    const s = stored.get(reg.id);
    if (s) return toSummary({ ...s, ...registryMetaFields(reg) }, true);
    return toSummary(
      {
        ...registryMetaFields(reg),
        latestVersion: 0,
        lastRepoContentHash: "",
        lastRepoVersion: 0,
        preferredVersionNumbers: [],
        latestSource: "deploy",
        latestCreatedAt: "",
        updatedAt: "",
      },
      false,
    );
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  const metaOut = await ddb.send(
    new GetCommand({
      TableName: table,
      Key: { pk: SCRIPT_PREPROMPT_PK, sk: SCRIPT_PREPROMPT_META_SK },
    }),
  );
  const meta =
    metaOut.Item && typeof metaOut.Item.syncedAt === "string"
      ? {
          syncedAt: metaOut.Item.syncedAt as string,
          deployId:
            typeof metaOut.Item.deployId === "string"
              ? (metaOut.Item.deployId as string)
              : null,
        }
      : null;
  return { entries, meta };
}

export async function getPrepromptEntry(
  id: string,
  params?: { tableName?: string },
): Promise<{
  entry: PrepromptEntrySummary;
  latest: PrepromptVersionRecord | null;
} | null> {
  const reg = getRegistryEntry(id);
  if (!reg) return null;
  const table = requireTable(params?.tableName);
  const stored = await getEntryRaw(table, id);
  if (!stored || stored.latestVersion < 1) {
    return {
      entry: toSummary(
        {
          ...registryMetaFields(reg),
          latestVersion: 0,
          lastRepoContentHash: "",
          lastRepoVersion: 0,
          preferredVersionNumbers: [],
          latestSource: "deploy",
          latestCreatedAt: "",
          updatedAt: "",
        },
        false,
      ),
      latest: null,
    };
  }
  const latest = await getVersionRaw(table, id, stored.latestVersion);
  return {
    entry: toSummary({ ...stored, ...registryMetaFields(reg) }, true),
    latest,
  };
}

/** All versions, newest first. */
export async function listPrepromptVersions(
  id: string,
  params?: { tableName?: string },
): Promise<PrepromptVersionRecord[]> {
  const table = requireTable(params?.tableName);
  const out: PrepromptVersionRecord[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :p)",
        ExpressionAttributeValues: {
          ":pk": SCRIPT_PREPROMPT_PK,
          ":p": `VER#${id}#`,
        },
        ScanIndexForward: false,
        ExclusiveStartKey,
      }),
    );
    for (const raw of res.Items ?? []) out.push(asVersion(raw));
    ExclusiveStartKey = res.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (ExclusiveStartKey);
  return out;
}

export async function getPrepromptVersion(
  id: string,
  version: number,
  params?: { tableName?: string },
): Promise<PrepromptVersionRecord | null> {
  return getVersionRaw(requireTable(params?.tableName), id, version);
}

// ─── Admin writes ──────────────────────────────────────────────────────────

async function requireStoredEntry(
  table: string,
  id: string,
): Promise<{ reg: PrepromptRegistryEntry; entry: PrepromptEntryRecord }> {
  const reg = getRegistryEntry(id);
  if (!reg) throw new PrepromptError(404, `Unknown pre-prompt: ${id}`);
  const entry = await getEntryRaw(table, id);
  if (!entry || entry.latestVersion < 1) {
    throw new PrepromptError(
      409,
      reg.group === "dataset"
        ? "This dataset has no versions yet. Import a harvester bundle first."
        : "This entry has not been seeded yet. Deploy the backend first.",
    );
  }
  return { reg, entry };
}

function assertValidText(reg: PrepromptRegistryEntry, text: string): string {
  const clean = normalizePrepromptText(text);
  if (!clean) throw new PrepromptError(400, "Text cannot be empty.");
  const missing = missingRequiredPlaceholders(reg, clean);
  if (missing.length > 0) {
    throw new PrepromptError(
      400,
      `Required placeholder${missing.length > 1 ? "s" : ""} missing: ${missing.join(", ")}`,
    );
  }
  return clean;
}

export async function saveManualPrepromptVersion(params: {
  id: string;
  text: string;
  note?: string;
  authorEmail: string;
  tableName?: string;
}): Promise<PrepromptVersionRecord> {
  const table = requireTable(params.tableName);
  const { reg, entry } = await requireStoredEntry(table, params.id);
  if (reg.group === "dataset") {
    throw new PrepromptError(
      400,
      "Datasets are read-only. Import a harvester bundle or restore a version.",
    );
  }
  const text = assertValidText(reg, params.text);
  const note = params.note?.trim().slice(0, 500) || undefined;
  return appendVersion({
    table,
    entry,
    version: {
      text,
      source: "manual",
      authorEmail: params.authorEmail,
      ...(note ? { note } : {}),
    },
    // A manual version is no longer "replacing" anything.
    entryRemove: ["replacedManualAt", "replacedManualNote"],
  });
}

export async function restorePrepromptVersion(params: {
  id: string;
  version: number;
  authorEmail: string;
  note?: string;
  tableName?: string;
}): Promise<PrepromptVersionRecord> {
  const table = requireTable(params.tableName);
  const { reg, entry } = await requireStoredEntry(table, params.id);
  const src = await getVersionRaw(table, params.id, params.version);
  if (!src) throw new PrepromptError(404, "Version not found");
  const note =
    params.note?.trim().slice(0, 500) || `Restored from v${src.version}`;
  if (reg.group === "dataset") {
    // Same JSON as the source: point at its chunk items instead of copying them.
    return appendVersion({
      table,
      entry,
      version: {
        // Dataset "text" is the readable per-style summary (View / Diff in admin).
        text: src.text,
        source: "manual",
        authorEmail: params.authorEmail,
        note,
        restoredFromVersion: src.version,
        ...(src.bundleId ? { bundleId: src.bundleId } : {}),
        ...(src.bundleHash ? { bundleHash: src.bundleHash } : {}),
        ...(src.contentHash ? { contentHash: src.contentHash } : {}),
        chunkVersion: src.chunkVersion ?? src.version,
        ...(src.chunkCount != null ? { chunkCount: src.chunkCount } : {}),
        ...(src.byteLength != null ? { byteLength: src.byteLength } : {}),
        ...(src.summary ? { summary: src.summary } : {}),
      },
    });
  }
  const text = assertValidText(reg, src.text);
  // Not auto-preferred; the original keeps its mark.
  return appendVersion({
    table,
    entry,
    version: {
      text,
      source: "manual",
      authorEmail: params.authorEmail,
      note,
      restoredFromVersion: src.version,
    },
    entryRemove: ["replacedManualAt", "replacedManualNote"],
  });
}

export async function setPreferred(params: {
  id: string;
  version: number;
  preferred: boolean;
  label?: string;
  tableName?: string;
}): Promise<{ version: PrepromptVersionRecord; preferredVersionNumbers: number[] }> {
  const table = requireTable(params.tableName);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { entry } = await requireStoredEntry(table, params.id);
    const ver = await getVersionRaw(table, params.id, params.version);
    if (!ver) throw new PrepromptError(404, "Version not found");
    const old = entry.preferredVersionNumbers;
    const set = new Set(old);
    if (params.preferred) set.add(params.version);
    else set.delete(params.version);
    const next = [...set].sort((a, b) => a - b);
    const label = params.preferred
      ? params.label?.trim().slice(0, 120) || undefined
      : undefined;

    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: table,
                Key: {
                  pk: SCRIPT_PREPROMPT_PK,
                  sk: prepromptVersionSk(params.id, params.version),
                },
                UpdateExpression: params.preferred
                  ? label
                    ? "SET preferred = :t, preferredLabel = :l"
                    : "SET preferred = :t REMOVE preferredLabel"
                  : "REMOVE preferred, preferredLabel",
                ExpressionAttributeValues: params.preferred
                  ? label
                    ? { ":t": true, ":l": label }
                    : { ":t": true }
                  : undefined,
                ConditionExpression: "attribute_exists(pk)",
              },
            },
            {
              Update: {
                TableName: table,
                Key: {
                  pk: SCRIPT_PREPROMPT_PK,
                  sk: prepromptEntrySk(params.id),
                },
                UpdateExpression: "SET preferredVersionNumbers = :next",
                // Compare against the list we read (retry on concurrent change).
                ConditionExpression: "preferredVersionNumbers = :old",
                ExpressionAttributeValues: { ":next": next, ":old": old },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if ((e as { name?: string }).name === "TransactionCanceledException") {
        continue;
      }
      throw e;
    }
    const updated = await getVersionRaw(table, params.id, params.version);
    return { version: updated ?? ver, preferredVersionNumbers: next };
  }
  throw new PrepromptError(409, "Could not update preferred mark. Try again.");
}

// ─── Live loading (Create) ─────────────────────────────────────────────────

export type LivePrepromptSource = "db" | "default";

export type LivePreprompt = {
  text: string;
  /** 0 = embedded repo default (DB unavailable / empty). */
  version: number;
  source: LivePrepromptSource;
};

function defaultLive(id: string): LivePreprompt {
  return {
    text: normalizePrepromptText(PREPROMPT_DEFAULTS[id] ?? ""),
    version: 0,
    source: "default",
  };
}

/**
 * Latest version of each entry. Any failure / empty / missing required placeholder
 * falls back to the embedded repo default as version 0 so generation never breaks.
 */
export async function loadLivePrepromptTexts(
  ids: string[],
  params?: { tableName?: string },
): Promise<Record<string, LivePreprompt>> {
  const uniq = [...new Set(ids)];
  const out: Record<string, LivePreprompt> = {};
  for (const id of uniq) out[id] = defaultLive(id);
  const table = params?.tableName?.trim() || envTable();
  if (!table || uniq.length === 0) return out;

  try {
    const entryRes = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [table]: {
            Keys: uniq.map((id) => ({
              pk: SCRIPT_PREPROMPT_PK,
              sk: prepromptEntrySk(id),
            })),
          },
        },
      }),
    );
    const latestById = new Map<string, number>();
    for (const raw of entryRes.Responses?.[table] ?? []) {
      const e = asEntry(raw);
      if (e.id && e.latestVersion >= 1) latestById.set(e.id, e.latestVersion);
    }
    if (latestById.size === 0) return out;

    const verRes = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [table]: {
            Keys: [...latestById].map(([id, v]) => ({
              pk: SCRIPT_PREPROMPT_PK,
              sk: prepromptVersionSk(id, v),
            })),
          },
        },
      }),
    );
    for (const raw of verRes.Responses?.[table] ?? []) {
      const v = asVersion(raw);
      const text = normalizePrepromptText(v.text);
      const reg = getRegistryEntry(v.id);
      if (!text || !reg) continue;
      const missing = missingRequiredPlaceholders(reg, text);
      if (missing.length > 0) {
        console.warn(
          `preprompt ${v.id} v${v.version} missing ${missing.join(", ")}; using repo default`,
        );
        continue;
      }
      out[v.id] = { text, version: v.version, source: "db" };
    }
  } catch (e) {
    console.warn("loadLivePrepromptTexts failed; using repo defaults", e);
    for (const id of uniq) out[id] = defaultLive(id);
  }
  return out;
}

export async function loadLivePrepromptText(
  id: string,
  params?: { tableName?: string },
): Promise<LivePreprompt> {
  return (await loadLivePrepromptTexts([id], params))[id] ?? defaultLive(id);
}

/** Live style guide for a meditation type; null when the type has no guide. */
export async function loadLiveStyleGuide(
  meditationType: string | null | undefined,
  params?: { tableName?: string },
): Promise<{ text: string; version: number; entryId: string } | null> {
  const norm = normalizeMeditationType((meditationType ?? "").trim());
  const entryId = styleGuideEntryIdForType(norm);
  if (!entryId) return null;
  const live = await loadLivePrepromptText(entryId, params);
  if (!live.text) return null;
  return { text: live.text, version: live.version, entryId };
}

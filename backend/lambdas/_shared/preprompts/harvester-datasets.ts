/**
 * Harvester datasets (pacing profiles, skeleton library, delivery fingerprints)
 * and the bundle import.
 *
 * Stored under the same SCRIPT_PREPROMPT partition as the text entries, so the
 * admin list, history, preferred marks and restore work the same way:
 *   sk ENTRY#{datasetId}                       → entry summary
 *   sk VER#{datasetId}#{000001}                → version (summary text + chunk pointer)
 *   sk DSCHUNK#{datasetId}#{000001}#{0000}     → gzip(JSON) slices (≤ 300 KB each)
 * Versions are append-only. A restore points at the source version's chunks.
 *
 * Import (admin upload or deploy-back): style guides get a harvester version only
 * when their text changed; datasets get a new version only when their content
 * changed since the last harvester import. Nothing is overwritten or deleted.
 */
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DATASET_ID,
  getRegistryEntry,
  harvesterSlugForMeditationType,
  meditationTypeForHarvesterKey,
  normalizePrepromptText,
  styleGuideEntryId,
  type DatasetId,
} from "./preprompt-registry";
import {
  appendVersion,
  envTable,
  getEntryRaw,
  getVersionRaw,
  hashPrepromptText,
  PrepromptError,
  prepromptEntrySk,
  registryMetaFields,
  requireTable,
  SCRIPT_PREPROMPT_PK,
  type DatasetStyleSummary,
  type PrepromptEntryRecord,
  type PrepromptVersionRecord,
} from "./preprompt-store";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const CHUNK_BYTES = 300_000;

// ─── Bundle types ──────────────────────────────────────────────────────────

export type SkeletonRole =
  | "settle"
  | "breath"
  | "body"
  | "imagery"
  | "affirmation"
  | "reflection prompt"
  | "instruction"
  | "story"
  | "self-practice handover"
  | "return"
  | "close"
  | "other";

export type SkeletonPhase = "opening" | "main" | "closing";

export type SkeletonPauseSegment = {
  type: "pause";
  start: number;
  length: number;
};

export type SkeletonPassageSegment = {
  type: "passage";
  start: number;
  length: number;
  words: number;
  position?: number;
  role: SkeletonRole | string;
  phase: SkeletonPhase | string;
  short_pauses?: { count: number; lengths_s?: number[] };
};

export type SkeletonSegment = SkeletonPauseSegment | SkeletonPassageSegment;

export type HarvesterSkeleton = {
  id: string;
  title?: string;
  channel?: string;
  views?: number | null;
  likes?: number | null;
  runtime_s: number;
  style: string;
  fit: "primary" | "secondary" | string;
  lead_in_s?: number;
  tail_s?: number;
  counts?: { passages?: number; pauses?: number; words?: number };
  segments: SkeletonSegment[];
};

/** slug → skeletons */
export type SkeletonLibrary = Record<string, HarvesterSkeleton[]>;

type Spread = {
  median?: number;
  p25?: number;
  p75?: number;
  min?: number;
  max?: number;
};

export type PacingProfile = {
  label?: string;
  videos?: { total?: number; primary?: number; secondary?: number };
  runtime_s?: Spread;
  speech_share?: { overall?: Spread; by_tenth?: number[] };
  passages_per_minute?: Spread;
  pause_length_s_by_tenth?: Array<Spread & { pauses_per_session?: number }>;
  passage_words?: {
    by_tenth?: Spread[];
    by_role?: Record<string, Spread & { count?: number }>;
  };
  role_share?: {
    by_passages?: Record<string, number>;
    by_speech_time?: Record<string, number>;
  };
  phases?: {
    opening_fraction_of_runtime?: Spread;
    closing_fraction_of_runtime?: Spread;
  };
  self_practice_silences?: {
    per_session?: Spread;
    share_of_sessions_with_any?: number;
    length_s?: Spread;
  };
  [k: string]: unknown;
};

/** slug → profile */
export type PacingProfiles = Record<string, PacingProfile>;

export type FingerprintMoveShare = { move: string; share: number };

export type FingerprintPhraseFamily = {
  id: string;
  name: string;
  meaning?: string;
  examples?: string[];
  /** Lower-case phrasings the harvester counted for this family (conformance matching). */
  match_phrases?: string[];
  class: "marker" | "generic" | "foreign" | "neutral" | string;
  rate_per_1k?: number;
  prevalence?: number;
  other_rate_per_1k?: number;
  other_prevalence?: number;
  /** Foreign families: the style(s) the family belongs to. */
  belongs_to?: string[];
};

type RatingSpread = Spread & { mean?: number };

export type StyleFingerprint = {
  label?: string;
  videos?: { annotated?: number; primary?: number; secondary?: number };
  weighting?: string;
  opening?: {
    moves?: FingerprintMoveShare[];
    usual_order?: string[];
    first_move?: FingerprintMoveShare[];
  };
  closing?: {
    moves?: FingerprintMoveShare[];
    usual_order?: string[];
    first_move?: FingerprintMoveShare[];
  };
  techniques?: Array<{ technique: string; share: number }>;
  imagery_themes?: Array<{ theme: string; share: number }>;
  delivery?: Partial<
    Record<
      "directiveness" | "energy" | "certainty" | "warmth" | "formality",
      RatingSpread
    >
  >;
  voice?: {
    person?: Record<string, number>;
    listener_i_statements?: number;
    tense?: Record<string, number>;
    question_rate?: Record<string, number>;
    questions_per_1k_words?: Spread;
  };
  repetition?: { level?: Record<string, number>; listener_repeats?: number };
  families?: {
    marker?: FingerprintPhraseFamily[];
    generic?: FingerprintPhraseFamily[];
    foreign?: FingerprintPhraseFamily[];
  };
  differences?: Array<{ text: string; kind?: string; size?: number }>;
  [k: string]: unknown;
};

/** slug → fingerprint */
export type DeliveryFingerprints = Record<string, StyleFingerprint>;

export type HarvesterBundle = {
  schema?: string;
  version?: { id?: string; generated_at?: string; hash?: string };
  style_guides?: Record<string, { label?: string; instructions?: string }>;
  pacing?: Record<string, unknown>;
  skeletons?: Record<string, unknown>;
  /** consciously-delivery-fingerprints/1: { schema, styles: { slug: fingerprint } }. */
  fingerprints?: { schema?: string; styles?: Record<string, unknown> };
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(",")}}`;
}

export function datasetContentHash(data: unknown): string {
  return createHash("sha256").update(stableStringify(data)).digest("hex");
}

function median(nums: number[]): number | null {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

function fmtClock(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function datasetChunkSk(
  id: string,
  version: number,
  index: number,
): string {
  return `DSCHUNK#${id}#${String(version).padStart(6, "0")}#${String(index).padStart(4, "0")}`;
}

export function skeletonLibrarySummary(
  lib: SkeletonLibrary,
): DatasetStyleSummary[] {
  return Object.entries(lib).map(([slug, list]) => ({
    style: slug,
    meditationType: meditationTypeForHarvesterKey(slug) ?? slug,
    skeletons: list.length,
    primary: list.filter((s) => s.fit === "primary").length,
    medianRuntimeS: median(list.map((s) => Number(s.runtime_s))),
  }));
}

export function pacingProfilesSummary(
  profiles: PacingProfiles,
): DatasetStyleSummary[] {
  return Object.entries(profiles).map(([slug, p]) => ({
    style: slug,
    meditationType: meditationTypeForHarvesterKey(slug) ?? slug,
    videos: p.videos?.total ?? 0,
    medianRuntimeS: p.runtime_s?.median ?? null,
    speechShareMedian: p.speech_share?.overall?.median ?? null,
  }));
}

export function deliveryFingerprintsSummary(
  fps: DeliveryFingerprints,
): DatasetStyleSummary[] {
  return Object.entries(fps).map(([slug, f]) => ({
    style: slug,
    meditationType: meditationTypeForHarvesterKey(slug) ?? slug,
    videos: f.videos?.annotated ?? 0,
    directivenessMedian: f.delivery?.directiveness?.median ?? null,
    certaintyMedian: f.delivery?.certainty?.median ?? null,
    families: {
      marker: f.families?.marker?.length ?? 0,
      generic: f.families?.generic?.length ?? 0,
      foreign: f.families?.foreign?.length ?? 0,
    },
  }));
}

/** Readable text stored on a dataset version (admin View / Diff between versions). */
export function datasetSummaryText(
  id: DatasetId,
  summary: DatasetStyleSummary[],
): string {
  const lines = summary.map((s) => {
    if (id === DATASET_ID.skeletonLibrary) {
      return `${s.meditationType}: ${s.skeletons ?? 0} skeletons (${s.primary ?? 0} primary) · median runtime ${fmtClock(s.medianRuntimeS)}`;
    }
    if (id === DATASET_ID.deliveryFingerprints) {
      const fam = s.families;
      return `${s.meditationType}: ${s.videos ?? 0} sessions · directiveness ${s.directivenessMedian ?? "—"}/5 · certainty ${s.certaintyMedian ?? "—"}/5 · families ${fam?.marker ?? 0} marker / ${fam?.generic ?? 0} generic / ${fam?.foreign ?? 0} foreign`;
    }
    const share =
      s.speechShareMedian != null
        ? `${Math.round(s.speechShareMedian * 100)}% speech`
        : "speech —";
    return `${s.meditationType}: ${s.videos ?? 0} videos · median runtime ${fmtClock(s.medianRuntimeS)} · ${share}`;
  });
  return lines.join("\n");
}

function isSegment(x: unknown): x is SkeletonSegment {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  if (typeof s.length !== "number" || !Number.isFinite(s.length)) return false;
  if (s.type === "pause") return true;
  return s.type === "passage" && typeof s.words === "number";
}

function validSkeleton(x: unknown): x is HarvesterSkeleton {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.id === "string" &&
    typeof s.runtime_s === "number" &&
    s.runtime_s > 0 &&
    Array.isArray(s.segments) &&
    s.segments.length > 0 &&
    s.segments.every(isSegment) &&
    s.segments.some((g) => (g as SkeletonSegment).type === "passage")
  );
}

function validFingerprint(x: unknown): x is StyleFingerprint {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const f = x as Record<string, unknown>;
  const fam = f.families as Record<string, unknown> | undefined;
  return (
    !!fam &&
    typeof fam === "object" &&
    ["marker", "generic", "foreign"].every(
      (k) => fam[k] == null || Array.isArray(fam[k]),
    ) &&
    (f.opening == null || typeof f.opening === "object") &&
    (f.closing == null || typeof f.closing === "object")
  );
}

// ─── Chunked storage ───────────────────────────────────────────────────────

async function writeChunks(
  table: string,
  id: string,
  version: number,
  data: unknown,
): Promise<{ chunkCount: number; byteLength: number }> {
  const raw = Buffer.from(JSON.stringify(data), "utf8");
  const gz = gzipSync(raw);
  const count = Math.max(1, Math.ceil(gz.byteLength / CHUNK_BYTES));
  for (let i = 0; i < count; i++) {
    // Unconditional: chunks only become reachable once the VER item exists, so a
    // retry after a failed append may rewrite orphan chunks for that number.
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: {
          pk: SCRIPT_PREPROMPT_PK,
          sk: datasetChunkSk(id, version, i),
          id,
          version,
          index: i,
          data: gz.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES),
        },
      }),
    );
  }
  return { chunkCount: count, byteLength: raw.byteLength };
}

const jsonCache = new Map<string, unknown>();

export async function loadDatasetJson<T>(
  table: string,
  ver: PrepromptVersionRecord,
): Promise<T> {
  const chunkVersion = ver.chunkVersion ?? ver.version;
  const count = ver.chunkCount ?? 0;
  const key = `${table}|${ver.id}|${chunkVersion}`;
  if (jsonCache.has(key)) return jsonCache.get(key) as T;
  if (count < 1) throw new Error(`dataset ${ver.id} v${ver.version} has no chunks`);
  const keys = Array.from({ length: count }, (_, i) => ({
    pk: SCRIPT_PREPROMPT_PK,
    sk: datasetChunkSk(ver.id, chunkVersion, i),
  }));
  const parts = new Map<number, Buffer>();
  for (let i = 0; i < keys.length; i += 50) {
    let pending: Record<string, unknown>[] = keys.slice(i, i + 50);
    for (let attempt = 0; attempt < 5 && pending.length; attempt++) {
      const res = await ddb.send(
        new BatchGetCommand({
          RequestItems: { [table]: { Keys: pending } },
        }),
      );
      for (const item of res.Responses?.[table] ?? []) {
        const d = item.data as Uint8Array | undefined;
        if (d && typeof item.index === "number") {
          parts.set(item.index, Buffer.from(d));
        }
      }
      pending =
        (res.UnprocessedKeys?.[table]?.Keys as Record<string, unknown>[]) ?? [];
    }
  }
  const ordered: Buffer[] = [];
  for (let i = 0; i < count; i++) {
    const p = parts.get(i);
    if (!p) throw new Error(`dataset ${ver.id} chunk ${i} missing`);
    ordered.push(p);
  }
  const parsed = JSON.parse(
    gunzipSync(Buffer.concat(ordered)).toString("utf8"),
  ) as T;
  jsonCache.set(key, parsed);
  return parsed;
}

async function ensureDatasetEntry(
  table: string,
  id: DatasetId,
): Promise<PrepromptEntryRecord> {
  const existing = await getEntryRaw(table, id);
  if (existing) return existing;
  const reg = getRegistryEntry(id)!;
  const now = new Date().toISOString();
  const entry: PrepromptEntryRecord = {
    ...registryMetaFields(reg),
    latestVersion: 0,
    lastRepoContentHash: "",
    lastRepoVersion: 0,
    preferredVersionNumbers: [],
    latestSource: "harvester",
    latestCreatedAt: now,
    updatedAt: now,
  };
  try {
    await ddb.send(
      new PutCommand({
        TableName: table,
        Item: { pk: SCRIPT_PREPROMPT_PK, sk: prepromptEntrySk(id), ...entry },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  } catch (e) {
    if ((e as { name?: string }).name !== "ConditionalCheckFailedException") {
      throw e;
    }
  }
  return (await getEntryRaw(table, id)) ?? entry;
}

async function markHarvesterSeen(
  table: string,
  id: string,
  hash: string,
  bundleId: string,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: { pk: SCRIPT_PREPROMPT_PK, sk: prepromptEntrySk(id) },
      UpdateExpression:
        "SET lastHarvesterContentHash = :h, lastHarvesterBundleId = :b",
      ExpressionAttributeValues: { ":h": hash, ":b": bundleId },
      ConditionExpression: "attribute_exists(pk)",
    }),
  );
}

// ─── Import ────────────────────────────────────────────────────────────────

export type ImportAction = "created" | "appended" | "unchanged" | "skipped";

export type HarvesterImportSummary = {
  bundle: {
    id: string;
    hash: string;
    generatedAt: string | null;
    schema: string;
  };
  importedVia: "deploy" | "admin";
  styleGuides: Array<{
    style: string;
    meditationType: string | null;
    entryId: string | null;
    action: ImportAction;
    version: number;
    error?: string;
  }>;
  datasets: Array<{
    id: DatasetId;
    action: ImportAction;
    version: number;
    styles: number;
  }>;
  skeletonsPerStyle: DatasetStyleSummary[];
  rejected: Array<{ section: string; key: string; reason: string }>;
};

async function importDataset(params: {
  table: string;
  id: DatasetId;
  data: unknown;
  summary: DatasetStyleSummary[];
  bundleId: string;
  bundleHash: string;
  importedVia: "deploy" | "admin";
  authorEmail?: string;
  deployId?: string;
}): Promise<{ action: ImportAction; version: number }> {
  const { table, id } = params;
  const hash = datasetContentHash(params.data);
  const entry = await ensureDatasetEntry(table, id);
  if (entry.lastHarvesterContentHash === hash) {
    return { action: "unchanged", version: entry.latestVersion };
  }
  if (entry.latestVersion >= 1) {
    const latest = await getVersionRaw(table, id, entry.latestVersion);
    if (latest?.contentHash === hash) {
      await markHarvesterSeen(table, id, hash, params.bundleId);
      return { action: "unchanged", version: entry.latestVersion };
    }
  }
  const next = entry.latestVersion + 1;
  const { chunkCount, byteLength } = await writeChunks(
    table,
    id,
    next,
    params.data,
  );
  const ver = await appendVersion({
    table,
    entry,
    version: {
      text: datasetSummaryText(id, params.summary),
      source: "harvester",
      bundleId: params.bundleId,
      bundleHash: params.bundleHash,
      importedVia: params.importedVia,
      note: `Harvester bundle ${params.bundleId}`,
      ...(params.authorEmail ? { authorEmail: params.authorEmail } : {}),
      ...(params.deployId ? { deployId: params.deployId } : {}),
      contentHash: hash,
      chunkVersion: next,
      chunkCount,
      byteLength,
      summary: params.summary,
    },
    entrySet: {
      lastHarvesterContentHash: hash,
      lastHarvesterBundleId: params.bundleId,
    },
  });
  return {
    action: entry.latestVersion < 1 ? "created" : "appended",
    version: ver.version,
  };
}

/**
 * Import a parsed consciously-import.json. Throws PrepromptError(400) when the
 * bundle itself is unusable; per-item problems land in `rejected`.
 */
export async function importHarvesterBundle(params: {
  bundle: HarvesterBundle;
  importedVia: "deploy" | "admin";
  authorEmail?: string;
  deployId?: string;
  tableName?: string;
}): Promise<HarvesterImportSummary> {
  const table = requireTable(params.tableName);
  const b = params.bundle;
  const schema = typeof b?.schema === "string" ? b.schema : "";
  if (!schema.startsWith("consciously-harvester-import/")) {
    throw new PrepromptError(
      400,
      `Not a harvester bundle (schema "${schema || "missing"}"). Upload output/consciously-import.json.`,
    );
  }
  const bundleId = b.version?.id?.trim() || "";
  const bundleHash = b.version?.hash?.trim() || "";
  if (!bundleId) {
    throw new PrepromptError(400, "Bundle has no version stamp (version.id).");
  }

  const rejected: HarvesterImportSummary["rejected"] = [];
  const styleGuides: HarvesterImportSummary["styleGuides"] = [];

  // Style guides: a harvester version only when the text changed.
  for (const [key, g] of Object.entries(b.style_guides ?? {})) {
    const type = meditationTypeForHarvesterKey(key);
    const slug = harvesterSlugForMeditationType(type);
    if (!type || !slug) {
      rejected.push({ section: "style_guides", key, reason: "unknown style key" });
      continue;
    }
    const entryId = styleGuideEntryId(slug);
    const text = normalizePrepromptText(g?.instructions ?? "");
    if (!text) {
      rejected.push({ section: "style_guides", key, reason: "empty instructions" });
      continue;
    }
    const hash = hashPrepromptText(text);
    const entry = await getEntryRaw(table, entryId);
    if (!entry || entry.latestVersion < 1) {
      styleGuides.push({
        style: key,
        meditationType: type,
        entryId,
        action: "skipped",
        version: 0,
        error: "entry not synced yet (deploy the backend first)",
      });
      continue;
    }
    if (entry.lastHarvesterContentHash === hash) {
      styleGuides.push({
        style: key,
        meditationType: type,
        entryId,
        action: "unchanged",
        version: entry.latestVersion,
      });
      continue;
    }
    const latest = await getVersionRaw(table, entryId, entry.latestVersion);
    if (latest && hashPrepromptText(latest.text) === hash) {
      await markHarvesterSeen(table, entryId, hash, bundleId);
      styleGuides.push({
        style: key,
        meditationType: type,
        entryId,
        action: "unchanged",
        version: entry.latestVersion,
      });
      continue;
    }
    const ver = await appendVersion({
      table,
      entry,
      version: {
        text,
        source: "harvester",
        bundleId,
        ...(bundleHash ? { bundleHash } : {}),
        importedVia: params.importedVia,
        note: `Harvester bundle ${bundleId}`,
        ...(params.authorEmail ? { authorEmail: params.authorEmail } : {}),
        ...(params.deployId ? { deployId: params.deployId } : {}),
      },
      entrySet: {
        lastHarvesterContentHash: hash,
        lastHarvesterBundleId: bundleId,
      },
      entryRemove: ["replacedManualAt", "replacedManualNote"],
    });
    styleGuides.push({
      style: key,
      meditationType: type,
      entryId,
      action: "appended",
      version: ver.version,
    });
  }

  // Pacing profiles, keyed by canonical slug.
  const pacing: PacingProfiles = {};
  for (const [key, p] of Object.entries(b.pacing ?? {})) {
    const slug = harvesterSlugForMeditationType(meditationTypeForHarvesterKey(key));
    if (!slug) {
      rejected.push({ section: "pacing", key, reason: "unknown style key" });
      continue;
    }
    if (!p || typeof p !== "object") {
      rejected.push({ section: "pacing", key, reason: "not an object" });
      continue;
    }
    pacing[slug] = p as PacingProfile;
  }

  // Skeleton library, keyed by canonical slug; drop malformed skeletons.
  const skeletons: SkeletonLibrary = {};
  for (const [key, list] of Object.entries(b.skeletons ?? {})) {
    const slug = harvesterSlugForMeditationType(meditationTypeForHarvesterKey(key));
    if (!slug) {
      rejected.push({ section: "skeletons", key, reason: "unknown style key" });
      continue;
    }
    if (!Array.isArray(list)) {
      rejected.push({ section: "skeletons", key, reason: "not a list" });
      continue;
    }
    const ok = list.filter(validSkeleton);
    const bad = list.length - ok.length;
    if (bad > 0) {
      rejected.push({
        section: "skeletons",
        key,
        reason: `${bad} skeleton${bad === 1 ? "" : "s"} without usable segments`,
      });
    }
    skeletons[slug] = [...(skeletons[slug] ?? []), ...ok];
  }

  // Delivery fingerprints, keyed by canonical slug.
  const fingerprints: DeliveryFingerprints = {};
  for (const [key, f] of Object.entries(b.fingerprints?.styles ?? {})) {
    const slug = harvesterSlugForMeditationType(meditationTypeForHarvesterKey(key));
    if (!slug) {
      rejected.push({ section: "fingerprints", key, reason: "unknown style key" });
      continue;
    }
    if (!validFingerprint(f)) {
      rejected.push({ section: "fingerprints", key, reason: "no phrase families" });
      continue;
    }
    fingerprints[slug] = f;
  }

  const datasets: HarvesterImportSummary["datasets"] = [];
  const common = {
    table,
    bundleId,
    bundleHash,
    importedVia: params.importedVia,
    authorEmail: params.authorEmail,
    deployId: params.deployId,
  };
  if (Object.keys(pacing).length) {
    const r = await importDataset({
      ...common,
      id: DATASET_ID.pacingProfiles,
      data: pacing,
      summary: pacingProfilesSummary(pacing),
    });
    datasets.push({
      id: DATASET_ID.pacingProfiles,
      ...r,
      styles: Object.keys(pacing).length,
    });
  }
  const skeletonSummary = skeletonLibrarySummary(skeletons);
  if (Object.keys(skeletons).length) {
    const r = await importDataset({
      ...common,
      id: DATASET_ID.skeletonLibrary,
      data: skeletons,
      summary: skeletonSummary,
    });
    datasets.push({
      id: DATASET_ID.skeletonLibrary,
      ...r,
      styles: Object.keys(skeletons).length,
    });
  }
  if (Object.keys(fingerprints).length) {
    const r = await importDataset({
      ...common,
      id: DATASET_ID.deliveryFingerprints,
      data: fingerprints,
      summary: deliveryFingerprintsSummary(fingerprints),
    });
    datasets.push({
      id: DATASET_ID.deliveryFingerprints,
      ...r,
      styles: Object.keys(fingerprints).length,
    });
  }

  return {
    bundle: {
      id: bundleId,
      hash: bundleHash,
      generatedAt: b.version?.generated_at ?? null,
      schema,
    },
    importedVia: params.importedVia,
    styleGuides,
    datasets,
    skeletonsPerStyle: skeletonSummary,
    rejected,
  };
}

// ─── Admin read views ──────────────────────────────────────────────────────

export type DatasetView = {
  version: PrepromptVersionRecord;
  summary: DatasetStyleSummary[];
  style?: string;
  /** Skeleton library + style: compact list (no segments). */
  skeletons?: Array<Omit<HarvesterSkeleton, "segments">>;
  /** Skeleton library + skeletonId: the full timeline. */
  skeleton?: HarvesterSkeleton;
  /** Pacing profiles + style: that style's profile. */
  profile?: PacingProfile;
  /** Delivery fingerprints + style: that style's fingerprint. */
  fingerprint?: StyleFingerprint;
};

export async function getDatasetView(params: {
  id: DatasetId;
  version?: number;
  style?: string;
  skeletonId?: string;
  tableName?: string;
}): Promise<DatasetView> {
  const table = requireTable(params.tableName);
  const entry = await getEntryRaw(table, params.id);
  if (!entry || entry.latestVersion < 1) {
    throw new PrepromptError(
      404,
      "This dataset has no versions yet. Import a harvester bundle first.",
    );
  }
  const n = params.version ?? entry.latestVersion;
  const ver = await getVersionRaw(table, params.id, n);
  if (!ver) throw new PrepromptError(404, "Version not found");
  const out: DatasetView = { version: ver, summary: ver.summary ?? [] };
  const style = params.style
    ? harvesterSlugForMeditationType(meditationTypeForHarvesterKey(params.style))
    : null;
  if (!style) return out;
  out.style = style;
  if (params.id === DATASET_ID.skeletonLibrary) {
    const lib = await loadDatasetJson<SkeletonLibrary>(table, ver);
    const list = lib[style] ?? [];
    out.skeletons = list.map(({ segments: _s, ...rest }) => {
      void _s;
      return rest;
    });
    if (params.skeletonId) {
      out.skeleton = list.find((s) => s.id === params.skeletonId);
    }
  } else if (params.id === DATASET_ID.deliveryFingerprints) {
    const fps = await loadDatasetJson<DeliveryFingerprints>(table, ver);
    out.fingerprint = fps[style];
  } else {
    const profiles = await loadDatasetJson<PacingProfiles>(table, ver);
    out.profile = profiles[style];
  }
  return out;
}

// ─── Live loading (Create) ─────────────────────────────────────────────────

export type LiveDatasets = {
  skeletons: { data: SkeletonLibrary; version: number } | null;
  pacing: { data: PacingProfiles; version: number } | null;
  fingerprints: { data: DeliveryFingerprints; version: number } | null;
};

/** Latest version of each dataset; null on any failure (Create then falls back). */
export async function loadLiveHarvesterDatasets(params?: {
  tableName?: string;
}): Promise<LiveDatasets> {
  const out: LiveDatasets = { skeletons: null, pacing: null, fingerprints: null };
  const table = params?.tableName?.trim() || envTable();
  if (!table) return out;
  const load = async <T>(id: DatasetId) => {
    try {
      const entry = await getEntryRaw(table, id);
      if (!entry || entry.latestVersion < 1) return null;
      const ver = await getVersionRaw(table, id, entry.latestVersion);
      if (!ver) return null;
      return { data: await loadDatasetJson<T>(table, ver), version: ver.version };
    } catch (e) {
      console.warn(`harvester dataset ${id} unavailable`, e);
      return null;
    }
  };
  const [skeletons, pacing, fingerprints] = await Promise.all([
    load<SkeletonLibrary>(DATASET_ID.skeletonLibrary),
    load<PacingProfiles>(DATASET_ID.pacingProfiles),
    load<DeliveryFingerprints>(DATASET_ID.deliveryFingerprints),
  ]);
  out.skeletons = skeletons;
  out.pacing = pacing;
  out.fingerprints = fingerprints;
  return out;
}
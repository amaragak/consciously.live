/**
 * Manifesto Story — first-person draft + third-person versions.
 * Signed-in: memory + ideate cloud bundle. Guests: account-scoped localStorage.
 */

import {
  readAccountLocalStorage,
  removeAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { isMedimadeSessionActive } from "@/lib/auth-session";

const LS_KEY = "mm_manifesto_story_v1";
const SECTION_BREAK = "§BREAK§";
const WORDS_PER_MINUTE = 140;
const LISTEN_GOAL_MIN = 10;

export type StoryVersion = {
  id: string;
  number: number;
  thirdPersonText: string;
  wordCount: number;
  createdAt: string;
  /** Library meditation s3Key once narrated. */
  audioId?: string;
  /** In-flight audio job id. */
  pendingJobId?: string;
  /** Text fingerprint at last successful narration (detect “changed since”). */
  narratedTextHash?: string;
  narratedAt?: string;
};

export type ManifestoStoryStoreV1 = {
  v: 1;
  draft: string;
  includeLifeAreas: boolean;
  includeValues: boolean;
  promptsDone: string[];
  versions: StoryVersion[];
  /** Latest composed version id shown in state B; null = writing. */
  activeVersionId: string | null;
  /** Prefs for state B Narrate card. */
  settleInFirst: boolean;
  fadeOutAtEnd: boolean;
  reminderEnabled: boolean;
  /** Local HH:mm, default 22:30. */
  reminderTime: string;
  /** YYYY-MM-DD last in-app reminder fired. */
  reminderLastFiredDate: string | null;
  listenCount: number;
  updatedAt: string;
};

let memoryStore: ManifestoStoryStoreV1 | null = null;

function isSignedIn(): boolean {
  return isMedimadeSessionActive();
}

function safeIso(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "1970-01-01T00:00:00.000Z";
  }
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

/** Opener label + empty paragraph — editor-only cue for a new draft. */
const SEEDED_OPENER_DRAFT =
  "§L§start-here§0§Everything%20worked%20out%2C%20and%20then%20some.%20What%20does%20your%20life%20look%20like%20now%3F§\n";

export function emptyManifestoStoryStore(): ManifestoStoryStoreV1 {
  return {
    v: 1,
    draft: SEEDED_OPENER_DRAFT,
    includeLifeAreas: true,
    includeValues: true,
    promptsDone: ["start-here"],
    versions: [],
    activeVersionId: null,
    settleInFirst: true,
    fadeOutAtEnd: true,
    reminderEnabled: false,
    reminderTime: "22:30",
    reminderLastFiredDate: null,
    listenCount: 0,
    updatedAt: safeIso(),
  };
}

function asTimeHHMM(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return fallback;
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalizeVersion(x: unknown): StoryVersion | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.thirdPersonText !== "string") {
    return null;
  }
  const number = typeof o.number === "number" ? o.number : 1;
  const text = o.thirdPersonText;
  return {
    id: o.id,
    number,
    thirdPersonText: text,
    wordCount:
      typeof o.wordCount === "number" ? o.wordCount : countWords(text),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : safeIso(),
    ...(typeof o.audioId === "string" ? { audioId: o.audioId } : {}),
    ...(typeof o.pendingJobId === "string"
      ? { pendingJobId: o.pendingJobId }
      : {}),
    ...(typeof o.narratedTextHash === "string"
      ? { narratedTextHash: o.narratedTextHash }
      : {}),
    ...(typeof o.narratedAt === "string" ? { narratedAt: o.narratedAt } : {}),
  };
}

export function normalizeManifestoStoryStore(
  x: unknown,
): ManifestoStoryStoreV1 | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (o.v !== 1) return null;
  const versions = Array.isArray(o.versions)
    ? o.versions
        .map(normalizeVersion)
        .filter((v): v is StoryVersion => Boolean(v))
        .slice(0, 40)
    : [];
  const draft = typeof o.draft === "string" ? o.draft : "";
  const fromLabels = draft
    .split("\n")
    .map((line) => {
      const m = /^§L§([^§]+)§/.exec(line.trim());
      return m?.[1] ?? null;
    })
    .filter((id): id is string => Boolean(id));
  const promptsDone = fromLabels.length
    ? [...new Set(fromLabels)].slice(0, 200)
    : Array.isArray(o.promptsDone)
      ? o.promptsDone
          .filter((id): id is string => typeof id === "string")
          .slice(0, 200)
      : [];
  return {
    v: 1,
    draft,
    includeLifeAreas: o.includeLifeAreas !== false,
    includeValues: o.includeValues !== false,
    promptsDone,
    versions,
    activeVersionId:
      typeof o.activeVersionId === "string" ? o.activeVersionId : null,
    settleInFirst: o.settleInFirst !== false,
    fadeOutAtEnd: o.fadeOutAtEnd !== false,
    reminderEnabled: o.reminderEnabled === true,
    reminderTime: asTimeHHMM(o.reminderTime, "22:30"),
    reminderLastFiredDate:
      typeof o.reminderLastFiredDate === "string"
        ? o.reminderLastFiredDate
        : null,
    listenCount:
      typeof o.listenCount === "number" && o.listenCount >= 0
        ? Math.floor(o.listenCount)
        : 0,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : safeIso(),
  };
}

export function clearManifestoStoryDeviceData(): void {
  memoryStore = null;
  if (typeof window === "undefined") return;
  try {
    removeAccountLocalStorage(LS_KEY);
  } catch {
    /* */
  }
}

export function clearManifestoStoryMemoryOnly(): void {
  memoryStore = null;
}

function readStoryFromLocalStorage(): ManifestoStoryStoreV1 | null {
  try {
    const raw = readAccountLocalStorage(LS_KEY);
    if (!raw) return null;
    return normalizeManifestoStoryStore(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/**
 * Prefer the store that actually has writing; tie-break by updatedAt.
 * Used when rehydrating after HMR / cloud pull so an empty remote seed
 * cannot wipe a draft that only exists in the device cache yet.
 */
export function preferManifestoStoryStore(
  local: ManifestoStoryStoreV1 | null | undefined,
  remote: ManifestoStoryStoreV1,
): ManifestoStoryStoreV1 {
  if (!local) return remote;
  const localWords = countWords(draftPlainText(local.draft));
  const remoteWords = countWords(draftPlainText(remote.draft));
  const localVers = local.versions.length;
  const remoteVers = remote.versions.length;
  if (localWords === 0 && localVers === 0 && (remoteWords > 0 || remoteVers > 0)) {
    return remote;
  }
  if (remoteWords === 0 && remoteVers === 0 && (localWords > 0 || localVers > 0)) {
    return local;
  }
  const localTime = Date.parse(local.updatedAt) || 0;
  const remoteTime = Date.parse(remote.updatedAt) || 0;
  if (localTime !== remoteTime) {
    return localTime >= remoteTime ? local : remote;
  }
  if (localWords !== remoteWords) {
    return localWords >= remoteWords ? local : remote;
  }
  return localVers >= remoteVers ? local : remote;
}

export function loadManifestoStoryStore(): ManifestoStoryStoreV1 {
  if (typeof window === "undefined") return emptyManifestoStoryStore();
  if (memoryStore) return structuredClone(memoryStore);
  const fromLs = readStoryFromLocalStorage();
  if (fromLs) {
    // Signed-in: warm memory from the durability cache until cloud applies.
    if (isSignedIn()) memoryStore = structuredClone(fromLs);
    return structuredClone(fromLs);
  }
  return emptyManifestoStoryStore();
}

export function saveManifestoStoryStoreLocal(store: ManifestoStoryStoreV1) {
  if (typeof window === "undefined") return;
  const normalized =
    normalizeManifestoStoryStore(store) ?? emptyManifestoStoryStore();
  if (isSignedIn()) {
    memoryStore = structuredClone(normalized);
  } else {
    memoryStore = null;
  }
  // Always write the account-scoped cache so HMR / reloads keep the draft
  // even if a cloud PUT has not finished yet.
  try {
    writeAccountLocalStorage(LS_KEY, JSON.stringify(normalized));
  } catch {
    /* */
  }
}

export function saveManifestoStoryStore(store: ManifestoStoryStoreV1) {
  const next = {
    ...store,
    updatedAt: safeIso(),
  };
  saveManifestoStoryStoreLocal(next);
  if (isSignedIn()) {
    void import("@/lib/ideate-cloud").then((m) => m.scheduleIdeateCloudPush());
  }
}

export function stripStoryForCloud(
  store: ManifestoStoryStoreV1,
): ManifestoStoryStoreV1 {
  return normalizeManifestoStoryStore(store) ?? emptyManifestoStoryStore();
}

/* ------------------------------------------------------------------ draft */

/** Plain text for word count / LLM (labels stripped; section breaks → blank line). */
export function draftPlainText(draft: string): string {
  return draft
    .split(SECTION_BREAK)
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !/^§L§/.test(line.trim()))
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function listeningMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(0, Math.round(wordCount / WORDS_PER_MINUTE));
}

export function listeningFillPercent(wordCount: number): number {
  const mins = wordCount / WORDS_PER_MINUTE;
  return Math.min(100, (mins / LISTEN_GOAL_MIN) * 100);
}

export const STORY_SECTION_BREAK = SECTION_BREAK;
export const STORY_LISTEN_GOAL_MIN = LISTEN_GOAL_MIN;

export function draftIsEmpty(draft: string): boolean {
  return countWords(draftPlainText(draft)) === 0;
}

export function insertSectionBreak(draft: string, cursor: number): string {
  const left = draft.slice(0, cursor);
  const right = draft.slice(cursor);
  const padL = left.endsWith("\n") || left.length === 0 ? "" : "\n\n";
  const padR = right.startsWith("\n") || right.length === 0 ? "" : "\n\n";
  return `${left}${padL}${SECTION_BREAK}${padR}${right}`;
}

export function appendSpokenToDraft(draft: string, spoken: string): string {
  const bit = spoken.trim();
  if (!bit) return draft;
  const base = draft.trimEnd();
  if (!base) return bit;
  const needsSpace = !/[\s\n]$/.test(base);
  return `${base}${needsSpace ? " " : ""}${bit}`;
}

export function addStoryVersion(
  store: ManifestoStoryStoreV1,
  thirdPersonText: string,
): ManifestoStoryStoreV1 {
  const text = thirdPersonText.trim();
  const number =
    store.versions.reduce((m, v) => Math.max(m, v.number), 0) + 1;
  const version: StoryVersion = {
    id: newId("storyv"),
    number,
    thirdPersonText: text,
    wordCount: countWords(text),
    createdAt: safeIso(),
  };
  return {
    ...store,
    versions: [version, ...store.versions].slice(0, 40),
    activeVersionId: version.id,
    updatedAt: safeIso(),
  };
}

export function patchActiveVersionText(
  store: ManifestoStoryStoreV1,
  text: string,
): ManifestoStoryStoreV1 {
  const id = store.activeVersionId;
  if (!id) return store;
  return {
    ...store,
    versions: store.versions.map((v) =>
      v.id === id
        ? {
            ...v,
            thirdPersonText: text,
            wordCount: countWords(text),
          }
        : v,
    ),
    updatedAt: safeIso(),
  };
}

export function togglePromptDone(
  store: ManifestoStoryStoreV1,
  promptId: string,
): ManifestoStoryStoreV1 {
  const has = store.promptsDone.includes(promptId);
  return {
    ...store,
    promptsDone: has
      ? store.promptsDone.filter((id) => id !== promptId)
      : [...store.promptsDone, promptId].slice(0, 200),
    updatedAt: safeIso(),
  };
}

export function storyTextHash(text: string): string {
  const t = text.trim();
  let h = 0;
  for (let i = 0; i < t.length; i++) {
    h = (Math.imul(31, h) + t.charCodeAt(i)) | 0;
  }
  return `h${(h >>> 0).toString(16)}_${t.length}`;
}

export function markVersionNarrationPending(
  store: ManifestoStoryStoreV1,
  versionId: string,
  jobId: string,
): ManifestoStoryStoreV1 {
  return {
    ...store,
    versions: store.versions.map((v) =>
      v.id === versionId
        ? { ...v, pendingJobId: jobId }
        : v,
    ),
    updatedAt: safeIso(),
  };
}

export function markVersionNarrated(
  store: ManifestoStoryStoreV1,
  versionId: string,
  opts: { audioId: string; text: string },
): ManifestoStoryStoreV1 {
  const at = safeIso();
  return {
    ...store,
    versions: store.versions.map((v) =>
      v.id === versionId
        ? {
            ...v,
            audioId: opts.audioId,
            pendingJobId: undefined,
            narratedTextHash: storyTextHash(opts.text),
            narratedAt: at,
          }
        : v,
    ),
    updatedAt: at,
  };
}

export function incrementStoryListenCount(
  store: ManifestoStoryStoreV1,
): ManifestoStoryStoreV1 {
  return {
    ...store,
    listenCount: store.listenCount + 1,
    updatedAt: safeIso(),
  };
}

export function restoreStoryVersion(
  store: ManifestoStoryStoreV1,
  versionId: string,
): ManifestoStoryStoreV1 {
  if (!store.versions.some((v) => v.id === versionId)) return store;
  return {
    ...store,
    activeVersionId: versionId,
    updatedAt: safeIso(),
  };
}

export function versionChangedSinceNarrated(v: StoryVersion): boolean {
  if (!v.narratedAt || !v.narratedTextHash) return false;
  return storyTextHash(v.thirdPersonText) !== v.narratedTextHash;
}

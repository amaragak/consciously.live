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
import {
  draftSectionsForCompose,
  type DraftComposeSection,
} from "@/lib/manifesto-story-draft";

const LS_KEY = "mm_manifesto_story_v1";
const SECTION_BREAK = "§BREAK§";
/**
 * Effective pace of a Manifesto Story narration, including the pauses TTS
 * inserts. Calibrated on Alex's narrated story (15 Oct 2026): 178 script
 * words spoken from 12.7s to 103.1s at the default 0.9 pace → 118 wpm.
 */
const WORDS_PER_MINUTE = 118;
/** Spoken title before the script. */
const LISTEN_TITLE_SECONDS = 10;
/**
 * Lead-in before the title and a short tail after the last word.
 * On that narration the non-script audio was ~15s, and ~10s of it is the title.
 */
const LISTEN_EDGE_SECONDS = 5;
/** Bed hold plus fade after the voice ends. */
const LISTEN_FADE_OUT_SECONDS = 20;
const LISTEN_GOAL_MIN = 10;

/** One chapter block on a prepared (third-person) version — mirrors draft prompts. */
export type StoryVersionSection = {
  /** null = text before the first prompt label. */
  promptId: string | null;
  /** Short print heading (1–4 words), never the prompt question. */
  heading: string;
  text: string;
  /** Hash of the draft section text when this narration was prepared. */
  sourceHash?: string;
  /** True once the user edits this section in the For narration view. */
  editedByUser?: boolean;
};

export type StoryVersion = {
  id: string;
  number: number;
  thirdPersonText: string;
  wordCount: number;
  createdAt: string;
  /** When this version was last prepared / updated from the draft. */
  preparedAt?: string;
  /** Structured rewrite; absent on older versions → treat as one Opening section. */
  sections?: StoryVersionSection[];
  /** Whole-story AI summary (~150 words), editable. */
  summary?: string;
  /** Per-section summaries keyed by {@link storySectionKey}. */
  sectionSummaries?: Record<string, string>;
  /** Library meditation s3Key once narrated. */
  audioId?: string;
  /** In-flight audio job id. */
  pendingJobId?: string;
  /** Text fingerprint at last successful narration (detect “changed since”). */
  narratedTextHash?: string;
  narratedAt?: string;
  /** Duration of the last recording (seconds), when known. */
  narrationDurationSec?: number;
  /** Voice / sound / pace / settle prefs used for the last recording. */
  narrationSettings?: StoryNarrationSettings;
};

/** Snapshot of Narrate-card settings baked into a recording. */
export type StoryNarrationSettings = {
  voiceId: string;
  voiceName: string;
  soundKey: string;
  soundName: string;
  pace: number;
  paceLabel: string;
  settleIn: boolean;
  fadeOut: boolean;
};

export type StoryOnPrintMode = "full" | "summary" | "choose" | "off";
export type StoryOnPrintChooseStyle = "written" | "summarised";

export type StoryOnPrintSettings = {
  mode: StoryOnPrintMode;
  /** Full mode only. */
  showHeadings: boolean;
  /** Section keys: promptId or `"opening"`. */
  chosen: string[];
  chooseStyle: StoryOnPrintChooseStyle;
};

/** One Raise the ceiling pass — what was suggested vs left alone. */
export type StoryRaiseRunV1 = {
  at: string;
  ambition: number;
  findings: Array<{
    quote: string;
    suggestion: string;
    type: string;
  }>;
  passed: string[];
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
  /** How the story chapter appears on the Manifesto print. */
  storyOnPrint: StoryOnPrintSettings;
  /**
   * Sentences resolved via Raise (used, or kept non-negative). Re-raise / prepare-check
   * skips optimise findings on them; type=negative always re-flags. Light edits keep
   * the lock; a rewrite can unlock. Kept negatives are not added here.
   */
  raiseLocks: string[];
  /**
   * Subset of raiseLocks from **used** suggestions — mist underline in the editor.
   * Locks not in raiseAccepted were **kept** non-negative lines (no underline).
   */
  raiseAccepted: string[];
  /** Recent Raise runs (findings + sentences left alone), newest last. */
  raiseHistory: StoryRaiseRunV1[];
  /** Prefs for state B Narrate card. */
  settleInFirst: boolean;
  fadeOutAtEnd: boolean;
  reminderEnabled: boolean;
  /** Local HH:mm, default 22:30. */
  reminderTime: string;
  /** YYYY-MM-DD last in-app reminder fired. */
  reminderLastFiredDate: string | null;
  listenCount: number;
  /**
   * Local noon-to-noon night keys (YYYY-MM-DD of the night’s start) when the
   * narrated story was played past 90%. Used for listening streak.
   */
  listenNights: string[];
  updatedAt: string;
};

export const DEFAULT_STORY_ON_PRINT: StoryOnPrintSettings = {
  mode: "off",
  showHeadings: true,
  chosen: [],
  chooseStyle: "written",
};

/** `promptId` or `"opening"` for null. */
export function storySectionKey(
  section: Pick<StoryVersionSection, "promptId">,
): string {
  return section.promptId ?? "opening";
}

/** Sections for print/narration; legacy versions become a single Opening. */
export function versionSections(v: StoryVersion): StoryVersionSection[] {
  if (v.sections && v.sections.length > 0) return v.sections;
  const text = v.thirdPersonText.trim();
  if (!text) return [];
  return [{ promptId: null, heading: "Opening", text }];
}

/** Effective print prefs — Off until a prepared version exists. */
export function resolveStoryOnPrint(
  store: ManifestoStoryStoreV1,
): StoryOnPrintSettings {
  const base = store.storyOnPrint ?? DEFAULT_STORY_ON_PRINT;
  if (store.versions.length === 0) return { ...base, mode: "off" };
  return base;
}

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

function normalizeRaiseLocks(raw: unknown, max = 120): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (typeof row !== "string") continue;
    const n = row.trim().toLowerCase().replace(/\s+/g, " ");
    if (n.length < 4 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeRaiseHistory(raw: unknown): StoryRaiseRunV1[] {
  if (!Array.isArray(raw)) return [];
  const out: StoryRaiseRunV1[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.at !== "string" || typeof o.ambition !== "number") continue;
    const findings = Array.isArray(o.findings)
      ? o.findings
          .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === "object"))
          .map((f) => ({
            quote: typeof f.quote === "string" ? f.quote : "",
            suggestion: typeof f.suggestion === "string" ? f.suggestion : "",
            type: typeof f.type === "string" ? f.type : "hedging",
          }))
          .filter((f) => f.quote.trim())
          .slice(0, 8)
      : [];
    out.push({
      at: o.at,
      ambition: Math.min(1, Math.max(0, o.ambition)),
      findings,
      passed: normalizeRaiseLocks(o.passed, 80),
    });
    if (out.length >= 12) break;
  }
  return out;
}

export function emptyManifestoStoryStore(): ManifestoStoryStoreV1 {
  return {
    v: 1,
    draft: SEEDED_OPENER_DRAFT,
    includeLifeAreas: true,
    includeValues: true,
    promptsDone: ["start-here"],
    versions: [],
    activeVersionId: null,
    storyOnPrint: { ...DEFAULT_STORY_ON_PRINT },
    raiseLocks: [],
    raiseAccepted: [],
    raiseHistory: [],
    settleInFirst: true,
    fadeOutAtEnd: true,
    reminderEnabled: false,
    reminderTime: "22:30",
    reminderLastFiredDate: null,
    listenCount: 0,
    listenNights: [],
    updatedAt: safeIso(),
  };
}

function normalizeListenNights(raw: unknown, max = 120): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (typeof row !== "string") continue;
    const k = row.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= max) break;
  }
  return out;
}

/** Local night key: noon-to-noon; before noon counts as the previous calendar day. */
export function storyListenNightKey(d = new Date()): string {
  const x = new Date(d.getTime());
  if (x.getHours() < 12) x.setDate(x.getDate() - 1);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prevCalendarDateKey(key: string): string {
  const [ys, ms, ds] = key.split("-").map(Number);
  const d = new Date(ys!, (ms ?? 1) - 1, ds ?? 1);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Consecutive nights ending at the current (or last completed) night. */
export function storyListeningStreak(
  nights: readonly string[],
  now = new Date(),
): number {
  if (nights.length === 0) return 0;
  const set = new Set(nights);
  let cursor = storyListenNightKey(now);
  // If tonight isn’t counted yet, start from last night.
  if (!set.has(cursor)) {
    cursor = prevCalendarDateKey(cursor);
    if (!set.has(cursor)) return 0;
  }
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = prevCalendarDateKey(cursor);
  }
  return streak;
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

function normalizeSection(x: unknown): StoryVersionSection | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.text !== "string" || !o.text.trim()) return null;
  if (typeof o.heading !== "string" || !o.heading.trim()) return null;
  const promptId =
    o.promptId === null || o.promptId === undefined
      ? null
      : typeof o.promptId === "string"
        ? o.promptId
        : null;
  return {
    promptId,
    heading: o.heading.trim().slice(0, 48),
    text: o.text.trim(),
    ...(typeof o.sourceHash === "string" && o.sourceHash.trim()
      ? { sourceHash: o.sourceHash.trim().slice(0, 64) }
      : {}),
    ...(o.editedByUser === true ? { editedByUser: true } : {}),
  };
}

/** Stable short hash of draft section plain text (labels ignored). */
export function hashStorySectionText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  let h = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function normalizeStoryOnPrint(x: unknown): StoryOnPrintSettings {
  if (!x || typeof x !== "object") return { ...DEFAULT_STORY_ON_PRINT };
  const o = x as Record<string, unknown>;
  const mode =
    o.mode === "full" ||
    o.mode === "summary" ||
    o.mode === "choose" ||
    o.mode === "off"
      ? o.mode
      : "off";
  const chosen = Array.isArray(o.chosen)
    ? o.chosen
        .filter((k): k is string => typeof k === "string")
        .slice(0, 80)
    : [];
  return {
    mode,
    showHeadings: o.showHeadings !== false,
    chosen,
    chooseStyle: o.chooseStyle === "summarised" ? "summarised" : "written",
  };
}

function normalizeVersion(x: unknown): StoryVersion | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.thirdPersonText !== "string") {
    return null;
  }
  const number = typeof o.number === "number" ? o.number : 1;
  const text = o.thirdPersonText;
  const sections = Array.isArray(o.sections)
    ? o.sections
        .map(normalizeSection)
        .filter((s): s is StoryVersionSection => Boolean(s))
        .slice(0, 40)
    : undefined;
  const sectionSummaries: Record<string, string> = {};
  if (o.sectionSummaries && typeof o.sectionSummaries === "object") {
    for (const [k, v] of Object.entries(
      o.sectionSummaries as Record<string, unknown>,
    )) {
      if (typeof v === "string" && v.trim()) {
        sectionSummaries[k] = v.trim().slice(0, 2000);
      }
    }
  }
  return {
    id: o.id,
    number,
    thirdPersonText: text,
    wordCount:
      typeof o.wordCount === "number" ? o.wordCount : countWords(text),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : safeIso(),
    ...(typeof o.preparedAt === "string" ? { preparedAt: o.preparedAt } : {}),
    ...(sections && sections.length ? { sections } : {}),
    ...(typeof o.summary === "string" && o.summary.trim()
      ? { summary: o.summary.trim().slice(0, 4000) }
      : {}),
    ...(Object.keys(sectionSummaries).length
      ? { sectionSummaries }
      : {}),
    ...(typeof o.audioId === "string" ? { audioId: o.audioId } : {}),
    ...(typeof o.pendingJobId === "string"
      ? { pendingJobId: o.pendingJobId }
      : {}),
    ...(typeof o.narratedTextHash === "string"
      ? { narratedTextHash: o.narratedTextHash }
      : {}),
    ...(typeof o.narratedAt === "string" ? { narratedAt: o.narratedAt } : {}),
    ...(typeof o.narrationDurationSec === "number" &&
    Number.isFinite(o.narrationDurationSec) &&
    o.narrationDurationSec > 0
      ? { narrationDurationSec: Math.round(o.narrationDurationSec) }
      : {}),
    ...(normalizeNarrationSettings(o.narrationSettings)
      ? { narrationSettings: normalizeNarrationSettings(o.narrationSettings)! }
      : {}),
  };
}

function normalizeNarrationSettings(
  raw: unknown,
): StoryNarrationSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const voiceId = typeof o.voiceId === "string" ? o.voiceId.trim() : "";
  const voiceName = typeof o.voiceName === "string" ? o.voiceName.trim() : "";
  const soundKey = typeof o.soundKey === "string" ? o.soundKey.trim() : "";
  const soundName = typeof o.soundName === "string" ? o.soundName.trim() : "";
  const pace =
    typeof o.pace === "number" && Number.isFinite(o.pace)
      ? Math.round(o.pace)
      : 0;
  const paceLabel =
    typeof o.paceLabel === "string" && o.paceLabel.trim()
      ? o.paceLabel.trim().slice(0, 32)
      : storyPaceLabel(pace);
  return {
    voiceId,
    voiceName: voiceName.slice(0, 80),
    soundKey,
    soundName: soundName.slice(0, 80),
    pace,
    paceLabel,
    settleIn: o.settleIn === true,
    fadeOut: o.fadeOut !== false,
  };
}

/** Display label for Speechify pacing offset (−5…5). */
export function storyPaceLabel(pace: number): string {
  if (pace <= -2) return "Slow";
  if (pace >= 2) return "Fast";
  return "Natural";
}

export type StoryNarrationSettingsDiff = {
  voice: boolean;
  sound: boolean;
  pace: boolean;
  settleIn: boolean;
  fadeOut: boolean;
};

export function diffStoryNarrationSettings(
  recorded: StoryNarrationSettings | null | undefined,
  current: StoryNarrationSettings,
): StoryNarrationSettingsDiff {
  if (!recorded) {
    return {
      voice: false,
      sound: false,
      pace: false,
      settleIn: false,
      fadeOut: false,
    };
  }
  return {
    voice:
      Boolean(recorded.voiceId || current.voiceId) &&
      recorded.voiceId !== current.voiceId,
    sound:
      Boolean(recorded.soundKey || current.soundKey) &&
      recorded.soundKey !== current.soundKey,
    pace: recorded.pace !== current.pace,
    settleIn: recorded.settleIn !== current.settleIn,
    fadeOut: recorded.fadeOut !== current.fadeOut,
  };
}

export function storyNarrationSettingsChanged(
  recorded: StoryNarrationSettings | null | undefined,
  current: StoryNarrationSettings,
): boolean {
  const d = diffStoryNarrationSettings(recorded, current);
  return d.voice || d.sound || d.pace || d.settleIn || d.fadeOut;
}

/** Human note for settings that differ from the last recording. */
export function storyNarrationSettingsChangeNote(
  recorded: StoryNarrationSettings | null | undefined,
  current: StoryNarrationSettings,
): string | null {
  const d = diffStoryNarrationSettings(recorded, current);
  const names: string[] = [];
  if (d.voice) names.push("Voice");
  if (d.sound) names.push("Sound");
  if (d.pace) names.push("Pace");
  if (d.settleIn || d.fadeOut) names.push("Settings");
  if (names.length === 0) return null;
  if (names.length === 1) {
    return `${names[0]} changed since this narration`;
  }
  return "Settings changed since this narration";
}

/** Draft section keys that no longer match the prepared version’s sourceHash. */
export function storyNarrationDrift(
  draft: string,
  version: StoryVersion | null | undefined,
): {
  draftSections: DraftComposeSection[];
  changedKeys: string[];
  changedCount: number;
} {
  const draftSections = draftSectionsForCompose(draft);
  if (!version) {
    return {
      draftSections,
      changedKeys: draftSections.map((s) => s.promptId ?? "opening"),
      changedCount: draftSections.length,
    };
  }
  const prepared = versionSections(version);
  const byKey = new Map(
    prepared.map((s) => [storySectionKey(s), s] as const),
  );
  const changedKeys: string[] = [];
  const draftKeys = new Set<string>();
  for (const d of draftSections) {
    const key = d.promptId ?? "opening";
    draftKeys.add(key);
    const hash = hashStorySectionText(d.text);
    const prev = byKey.get(key);
    if (!prev || !prev.sourceHash || prev.sourceHash !== hash) {
      changedKeys.push(key);
    }
  }
  for (const s of prepared) {
    const key = storySectionKey(s);
    if (!draftKeys.has(key)) changedKeys.push(key);
  }
  return {
    draftSections,
    changedKeys: [...new Set(changedKeys)],
    changedCount: new Set(changedKeys).size,
  };
}

/** Sections to send for a partial update: each changed + neighbours as context. */
export function composeSectionsForUpdate(
  draftSections: readonly DraftComposeSection[],
  changedKeys: readonly string[],
): Array<DraftComposeSection & { role: "rewrite" | "context" }> {
  const keys = new Set(changedKeys);
  const include = new Set<number>();
  draftSections.forEach((s, i) => {
    if (!keys.has(s.promptId ?? "opening")) return;
    include.add(i);
    if (i > 0) include.add(i - 1);
    if (i < draftSections.length - 1) include.add(i + 1);
  });
  const out: Array<DraftComposeSection & { role: "rewrite" | "context" }> = [];
  draftSections.forEach((s, i) => {
    if (!include.has(i)) return;
    out.push({
      ...s,
      role: keys.has(s.promptId ?? "opening") ? "rewrite" : "context",
    });
  });
  return out;
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
    storyOnPrint: normalizeStoryOnPrint(o.storyOnPrint),
    raiseLocks: normalizeRaiseLocks(o.raiseLocks),
    // Older stores only tracked accepts in raiseLocks — keep underlines there.
    raiseAccepted: normalizeRaiseLocks(
      o.raiseAccepted !== undefined ? o.raiseAccepted : o.raiseLocks,
    ),
    raiseHistory: normalizeRaiseHistory(o.raiseHistory),
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
    listenNights: normalizeListenNights(o.listenNights),
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

function listenFixedSeconds(fadeOut: boolean): number {
  return (
    LISTEN_TITLE_SECONDS +
    LISTEN_EDGE_SECONDS +
    (fadeOut ? LISTEN_FADE_OUT_SECONDS : 0)
  );
}

/** Voice plus title, and the closing fade unless `fadeOut` is false. */
export function listeningSeconds(
  wordCount: number,
  opts?: { fadeOut?: boolean },
): number {
  if (wordCount <= 0) return 0;
  const speech = (wordCount / WORDS_PER_MINUTE) * 60;
  return speech + listenFixedSeconds(opts?.fadeOut !== false);
}

export function listeningMinutes(
  wordCount: number,
  opts?: { fadeOut?: boolean },
): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.round(listeningSeconds(wordCount, opts) / 60));
}

export function listeningFillPercent(wordCount: number): number {
  if (wordCount <= 0) return 0;
  const goalSec = LISTEN_GOAL_MIN * 60;
  return Math.min(100, (listeningSeconds(wordCount) / goalSec) * 100);
}

export const STORY_SECTION_BREAK = SECTION_BREAK;
export const STORY_LISTEN_GOAL_MIN = LISTEN_GOAL_MIN;
export const STORY_LISTEN_FADE_OUT_SECONDS = LISTEN_FADE_OUT_SECONDS;
/** Story words that land on the ten-minute goal once title and fade are included. */
export const STORY_LISTEN_GOAL_WORDS =
  Math.round(
    (((LISTEN_GOAL_MIN * 60 -
      LISTEN_TITLE_SECONDS -
      LISTEN_EDGE_SECONDS -
      LISTEN_FADE_OUT_SECONDS) /
      60) *
      WORDS_PER_MINUTE) /
      100,
  ) * 100;

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
  sections?: StoryVersionSection[],
  opts?: { draft?: string },
): ManifestoStoryStoreV1 {
  const text = thirdPersonText.trim();
  const number =
    store.versions.reduce((m, v) => Math.max(m, v.number), 0) + 1;
  const draftHashes = new Map<string, string>();
  if (opts?.draft) {
    for (const d of draftSectionsForCompose(opts.draft)) {
      draftHashes.set(d.promptId ?? "opening", hashStorySectionText(d.text));
    }
  }
  const now = safeIso();
  const cleanSections = (sections ?? [])
    .map((s) => {
      const key = s.promptId ?? "opening";
      const sourceHash =
        s.sourceHash?.trim() || draftHashes.get(key) || undefined;
      return {
        promptId: s.promptId,
        heading: s.heading.trim().slice(0, 48) || "Opening",
        text: s.text.trim(),
        ...(sourceHash ? { sourceHash } : {}),
        ...(s.editedByUser === true ? { editedByUser: true } : {}),
      };
    })
    .filter((s) => s.text.length > 0)
    .slice(0, 40);
  const version: StoryVersion = {
    id: newId("storyv"),
    number,
    thirdPersonText: text,
    wordCount: countWords(text),
    createdAt: now,
    preparedAt: now,
    ...(cleanSections.length ? { sections: cleanSections } : {}),
  };
  const firstPrepare = store.versions.length === 0;
  const storyOnPrint =
    firstPrepare && store.storyOnPrint.mode === "off"
      ? {
          ...store.storyOnPrint,
          mode: "full" as const,
          chosen: cleanSections.map(storySectionKey),
        }
      : store.storyOnPrint;
  return {
    ...store,
    versions: [version, ...store.versions].slice(0, 40),
    activeVersionId: version.id,
    storyOnPrint,
    updatedAt: now,
  };
}

/**
 * Save a new version after updating out-of-date sections: copy unchanged
 * sections (keeping editedByUser), replace updated ones with fresh hashes.
 */
export function addUpdatedStoryVersion(
  store: ManifestoStoryStoreV1,
  opts: {
    draft: string;
    updatedSections: StoryVersionSection[];
    baseVersionId: string;
  },
): ManifestoStoryStoreV1 {
  const base =
    store.versions.find((v) => v.id === opts.baseVersionId) ??
    store.versions[0];
  if (!base) {
    const text = opts.updatedSections.map((s) => s.text).join("\n\n");
    return addStoryVersion(store, text, opts.updatedSections, {
      draft: opts.draft,
    });
  }
  const draftSecs = draftSectionsForCompose(opts.draft);
  const draftHashes = new Map(
    draftSecs.map((d) => [
      d.promptId ?? "opening",
      hashStorySectionText(d.text),
    ] as const),
  );
  const prevByKey = new Map(
    versionSections(base).map((s) => [storySectionKey(s), s] as const),
  );
  const updatedByKey = new Map(
    opts.updatedSections.map((s) => [storySectionKey(s), s] as const),
  );
  const merged: StoryVersionSection[] = [];
  for (const d of draftSecs) {
    const key = d.promptId ?? "opening";
    const upd = updatedByKey.get(key);
    if (upd) {
      merged.push({
        promptId: upd.promptId,
        heading: upd.heading.trim().slice(0, 48) || "Opening",
        text: upd.text.trim(),
        sourceHash: draftHashes.get(key),
        editedByUser: false,
      });
      continue;
    }
    const prev = prevByKey.get(key);
    if (prev) {
      merged.push({
        ...prev,
        sourceHash: prev.sourceHash ?? draftHashes.get(key),
      });
    }
  }
  const text = merged.map((s) => s.text).join("\n\n").trim();
  return addStoryVersion(store, text, merged, { draft: opts.draft });
}

/** Patch one narration section’s text; marks editedByUser. */
export function patchVersionSectionText(
  store: ManifestoStoryStoreV1,
  versionId: string,
  promptId: string | null,
  text: string,
): ManifestoStoryStoreV1 {
  return {
    ...store,
    versions: store.versions.map((v) => {
      if (v.id !== versionId) return v;
      const sections = versionSections(v).map((s) => {
        if ((s.promptId ?? null) !== (promptId ?? null)) return s;
        return { ...s, text: text.trim(), editedByUser: true };
      });
      const thirdPersonText = sections.map((s) => s.text).join("\n\n").trim();
      return {
        ...v,
        sections,
        thirdPersonText,
        wordCount: countWords(thirdPersonText),
      };
    }),
    updatedAt: safeIso(),
  };
}

export function patchStoryOnPrint(
  store: ManifestoStoryStoreV1,
  patch: Partial<StoryOnPrintSettings>,
): ManifestoStoryStoreV1 {
  return {
    ...store,
    storyOnPrint: { ...store.storyOnPrint, ...patch },
    updatedAt: safeIso(),
  };
}

export function patchVersionSummaries(
  store: ManifestoStoryStoreV1,
  versionId: string,
  patch: {
    summary?: string;
    sectionSummaries?: Record<string, string>;
  },
): ManifestoStoryStoreV1 {
  return {
    ...store,
    versions: store.versions.map((v) => {
      if (v.id !== versionId) return v;
      return {
        ...v,
        ...(typeof patch.summary === "string"
          ? { summary: patch.summary }
          : {}),
        ...(patch.sectionSummaries
          ? {
              sectionSummaries: {
                ...(v.sectionSummaries ?? {}),
                ...patch.sectionSummaries,
              },
            }
          : {}),
      };
    }),
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

/** Drop a stuck / failed pending job without marking the version narrated. */
export function clearVersionNarrationPending(
  store: ManifestoStoryStoreV1,
  versionId: string,
): ManifestoStoryStoreV1 {
  return {
    ...store,
    versions: store.versions.map((v) =>
      v.id === versionId ? { ...v, pendingJobId: undefined } : v,
    ),
    updatedAt: safeIso(),
  };
}

export function markVersionNarrated(
  store: ManifestoStoryStoreV1,
  versionId: string,
  opts: {
    audioId: string;
    text: string;
    settings?: StoryNarrationSettings;
    durationSec?: number;
  },
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
            ...(opts.settings ? { narrationSettings: opts.settings } : {}),
            ...(typeof opts.durationSec === "number" &&
            Number.isFinite(opts.durationSec) &&
            opts.durationSec > 0
              ? { narrationDurationSec: Math.round(opts.durationSec) }
              : {}),
          }
        : v,
    ),
    updatedAt: at,
  };
}

export function incrementStoryListenCount(
  store: ManifestoStoryStoreV1,
  opts?: { nightKey?: string },
): ManifestoStoryStoreV1 {
  const nightKey = opts?.nightKey ?? storyListenNightKey();
  const nights = store.listenNights.includes(nightKey)
    ? store.listenNights
    : [...store.listenNights, nightKey].slice(-120);
  return {
    ...store,
    listenCount: store.listenCount + 1,
    listenNights: nights,
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

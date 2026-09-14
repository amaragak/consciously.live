import { isMedimadeSessionActive } from "@/lib/auth-session";
import { isJournalMoodId } from "@/lib/journal-moods";

export type JournalEntryKind = "freeform" | "gratitude";

/** Daily gratitude lines — UI starts with 3 optional slots; chat may append more. */
export type JournalGratitudeLines = string[];

export type JournalEntry = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  contentHtml: string;
  /** Omitted on existing freeform entries. */
  kind?: JournalEntryKind;
  /** Daily gratitude lines when `kind` is `gratitude` (min 3 slots when normalized). */
  gratitude?: JournalGratitudeLines;
  /** Write-time mood chip (`calm` | `good` | `mixed` | `low` | `heavy`). */
  mood?: string;
  tags?: string[];
  /** Skip this entry on cloud PUT; kept on this device. */
  localOnly?: boolean;
  /** Set when this row came from the import pipeline. */
  importSource?:
    | "day_one"
    | "markdown"
    | "csv"
    | "plaintext"
    | "pdf_annotations"
    | "handwritten_photo";
  importBatchId?: string;
  sourceMetadata?: Record<string, unknown>;
  mediaRefs?: string[];
  /** Notebook this page lives in. Omitted = unfiled. */
  folderId?: string;
};

export type JournalFolder = {
  id: string;
  name: string;
};

export type JournalStoreV2 = {
  version: 2;
  activeEntryId: string | null;
  entries: JournalEntry[];
  folders?: JournalFolder[];
};

const LEGACY_PLAIN_KEY = "mm_journal_entries_v1";
const STORE_KEY = "mm_journal_store_v2";
/**
 * Marks that the one-off guest journal data import already ran.
 * Storage key string is historical — do not rename (would re-run the import).
 */
const GUEST_JOURNAL_IMPORT_DONE_KEY = "mm_journal_demo_seed_v3";
const LEGACY_GUEST_JOURNAL_IMPORT_DONE_KEYS = [
  "mm_journal_demo_seed_v1",
  "mm_journal_demo_seed_v2",
] as const;

/** Ids from the one-off guest starter import (never synced to cloud). */
const GUEST_STARTER_ENTRY_IDS = [
  "demo-journal-morning",
  "demo-journal-resistance",
  "demo-journal-gratitude",
] as const;
/** Older starter-import ids — still excluded from cloud, never re-imported. */
const LEGACY_GUEST_STARTER_ENTRY_IDS = ["demo-journal-blank"] as const;

/** Stable id for `GET/PUT /journal/store` and `POST /journal/voice` (treat as a device secret). */
export const JOURNAL_OWNER_ID_KEY = "mm_journal_owner_id";

export function getOrCreateJournalOwnerId(): string {
  if (typeof window === "undefined") {
    return "";
  }
  try {
    let id = window.localStorage.getItem(JOURNAL_OWNER_ID_KEY)?.trim();
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `o_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      window.localStorage.setItem(JOURNAL_OWNER_ID_KEY, id);
    }
    return id;
  } catch {
    return `ephemeral_${Date.now()}`;
  }
}

/** Fixed en-US medium date only (no time), for journal entry display. */
export function formatJournalEntryDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { dateStyle: "medium" });
  } catch {
    return "—";
  }
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<\/(p|div|h[1-6]|li|br)\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeVoiceClipTranscriptAttr(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** Appends plain-text markers for voice-clip transcripts stored in `data-transcript`. */
function expandVoiceClipTranscriptsForPlainText(html: string): string {
  if (typeof document === "undefined") {
    return html;
  }
  try {
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-journal-voice-clip="1"]').forEach((el) => {
      const raw = el.getAttribute("data-transcript");
      const dec = decodeVoiceClipTranscriptAttr(raw);
      if (!dec?.trim()) return;
      const spoken = stripHtmlToText(dec).trim();
      if (!spoken) return;
      const note = document.createElement("p");
      note.textContent = `Voice transcription: ${spoken}`;
      el.appendChild(note);
    });
    return wrap.innerHTML;
  } catch {
    return html;
  }
}

export function deriveEntryTitle(html: string): string {
  const t = stripHtmlToText(html);
  if (!t) return "Untitled entry";
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

/** sessionStorage key: handoff from Journal → Create (meditation from entries). */
export const JOURNAL_MEDITATION_PAYLOAD_KEY = "mm_journal_meditation_payload_v1";

/** Max plain-text length per entry in the Journal → Create payload (very large; avoids runaway storage). */
const JOURNAL_BODY_PLAIN_MAX = 500_000;

export type JournalMeditationPayloadV1 = {
  v: 1;
  at: string;
  segments: {
    entryId: string;
    title: string;
    bodyPlain: string;
    /** ISO date string for display on Create */
    createdAt?: string;
  }[];
};

export function parseJournalMeditationPayload(
  raw: string | null,
): JournalMeditationPayloadV1 | null {
  if (!raw || typeof raw !== "string") return null;
  try {
    const x = JSON.parse(raw) as unknown;
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    if (o.v !== 1) return null;
    if (typeof o.at !== "string") return null;
    if (!Array.isArray(o.segments)) return null;
    const segments: JournalMeditationPayloadV1["segments"] = [];
    for (const s of o.segments) {
      if (!s || typeof s !== "object") continue;
      const r = s as Record<string, unknown>;
      if (typeof r.entryId !== "string") continue;
      if (typeof r.title !== "string") continue;
      if (typeof r.bodyPlain !== "string") continue;
      const createdAt =
        typeof r.createdAt === "string" ? r.createdAt : undefined;
      segments.push({
        entryId: r.entryId,
        title: r.title,
        bodyPlain: r.bodyPlain,
        ...(createdAt ? { createdAt } : {}),
      });
    }
    if (!segments.length) return null;
    return { v: 1, at: o.at, segments };
  } catch {
    return null;
  }
}

/**
 * Full journal body as plain text for handoff to Create / the chat API
 * (HTML stripped; long entries truncated only at a very high cap).
 */
export function journalEntryPlainForHandoff(html: string): string {
  const t = stripHtmlToText(expandVoiceClipTranscriptsForPlainText(html));
  if (t.length <= JOURNAL_BODY_PLAIN_MAX) return t;
  return `${t.slice(0, JOURNAL_BODY_PLAIN_MAX)}…`;
}

/** First user line when starting Create from Journal (shown in chat + sent to API). */
export const JOURNAL_CREATE_FIRST_MESSAGE =
  "Please create a meditation that reflects on these journal entries";

/**
 * Full user message sent to the guide (not shown verbatim in the UI bubble).
 * Each entry includes an explicit journal title line and full contents line so
 * the model always receives both, even when titles repeat or bodies are long.
 */
export function buildJournalHandoffApiContent(
  segments: JournalMeditationPayloadV1["segments"],
  guidance?: string,
): string {
  const guidanceNote = guidance?.trim() ?? "";
  const blocks = segments.map((s, i) => {
    const journalTitle = s.title.trim() || "Untitled entry";
    const journalContents = s.bodyPlain.trim() || "(empty entry)";
    return [
      `--- Journal entry ${i + 1} ---`,
      `Journal title: ${journalTitle}`,
      "Journal contents:",
      journalContents,
      `--- End journal entry ${i + 1} ---`,
    ].join("\n");
  });
  return [
    JOURNAL_CREATE_FIRST_MESSAGE,
    "",
    "The following blocks are the user’s saved journal entries. Use every title and the full contents when reflecting and shaping the meditation.",
    "",
    blocks.join("\n\n"),
    ...(guidanceNote
      ? [
          "",
          "--- Guide note for this entry ---",
          "The creator added this note about how to use the entry (not a change to meditation style):",
          guidanceNote,
          "--- End guide note ---",
        ]
      : []),
  ].join("\n");
}

/**
 * JSON payload string for Journal → Create handoff (survives navigation / Strict remount).
 */
let journalMeditationHandoffJsonArm: string | null = null;

export function armJournalMeditationHandoffJson(json: string): void {
  journalMeditationHandoffJsonArm = json;
}

export function peekJournalMeditationHandoffJson(): string | null {
  return journalMeditationHandoffJsonArm;
}

export function clearJournalMeditationHandoffJson(): void {
  journalMeditationHandoffJsonArm = null;
}

function newEntry(overrides?: Partial<JournalEntry>): JournalEntry {
  const now = new Date().toISOString();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `e_${now}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    createdAt: now,
    updatedAt: now,
    title: "",
    contentHtml: "<p></p>",
    ...overrides,
  };
}

function daysAgoIso(days: number, hour = 9): string {
  const d = new Date();
  d.setHours(hour, 15, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Payload for the one-off guest journal data import (never synced to cloud). */
export function buildGuestJournalInitialImport(): JournalStoreV2 {
  const morning = newEntry({
    id: "demo-journal-morning",
    createdAt: daysAgoIso(1, 8),
    updatedAt: daysAgoIso(1, 8),
    title: "A quieter morning",
    mood: "calm",
    localOnly: true,
    sourceMetadata: { demo: true },
    contentHtml:
      "<p>Woke without reaching for my phone. Made tea and sat by the window for ten minutes.</p><p>Noticed how loud my usual rush feels once I stop it — and how little of it was actually urgent.</p>",
  });
  const resistance = newEntry({
    id: "demo-journal-resistance",
    createdAt: daysAgoIso(3, 21),
    updatedAt: daysAgoIso(3, 21),
    title: "What I keep putting off",
    mood: "mixed",
    localOnly: true,
    sourceMetadata: { demo: true },
    contentHtml:
      "<p>The project I care about keeps sliding to “tomorrow.” When I look closer, it isn’t laziness — it’s fear of doing it imperfectly.</p><p>Tomorrow I’ll open the doc for fifteen minutes only. No finishing required.</p>",
  });
  const gratitude = newEntry({
    id: "demo-journal-gratitude",
    createdAt: daysAgoIso(5, 7),
    updatedAt: daysAgoIso(5, 7),
    kind: "gratitude",
    title: "Three things",
    mood: "good",
    localOnly: true,
    sourceMetadata: { demo: true },
    gratitude: [
      "A walk without headphones",
      "A message from someone who remembered",
      "Hot water and a clean mug",
    ],
    contentHtml:
      "<p>A walk without headphones</p><p>A message from someone who remembered</p><p>Hot water and a clean mug</p>",
  });
  // Most recently updated freeform first; no empty stub (New entry creates those).
  return {
    version: 2,
    activeEntryId: morning.id,
    entries: [morning, resistance, gratitude],
  };
}

/**
 * Shared Continue-as-guest cloud journal (matches populate-guest-account.ts).
 * Normal account rows — syncable, not stripped as starter-import.
 */
export function buildGuestAccountJournalStore(): JournalStoreV2 {
  const morning = newEntry({
    id: "guest-journal-1",
    createdAt: daysAgoIso(1, 8),
    updatedAt: daysAgoIso(1, 8),
    title: "A quieter morning",
    mood: "calm",
    contentHtml:
      "<p>Woke without reaching for my phone. Made tea and sat by the window for ten minutes.</p><p>Noticed how loud my usual rush feels once I stop it — and how little of it was actually urgent.</p>",
  });
  const resistance = newEntry({
    id: "guest-journal-2",
    createdAt: daysAgoIso(3, 21),
    updatedAt: daysAgoIso(3, 21),
    title: "What I keep putting off",
    mood: "mixed",
    contentHtml:
      "<p>The project I care about keeps sliding to “tomorrow.” When I look closer, it isn’t laziness — it’s fear of doing it imperfectly.</p><p>Tomorrow I’ll open the doc for fifteen minutes only. No finishing required.</p>",
  });
  const gratitude = newEntry({
    id: "guest-journal-3",
    createdAt: daysAgoIso(5, 7),
    updatedAt: daysAgoIso(5, 7),
    kind: "gratitude",
    title: "Three things",
    mood: "good",
    gratitude: [
      "A walk without headphones",
      "A message from someone who remembered",
      "Hot water and a clean mug",
    ],
    contentHtml:
      "<p>A walk without headphones</p><p>A message from someone who remembered</p><p>Hot water and a clean mug</p>",
  });
  return {
    version: 2,
    activeEntryId: morning.id,
    entries: [morning, resistance, gratitude],
  };
}

/** True for rows that came from the one-off guest starter import (exclude from cloud). */
export function isDemoJournalEntry(e: JournalEntry): boolean {
  if (e.sourceMetadata?.demo === true) return true;
  const id = e.id;
  return (
    (GUEST_STARTER_ENTRY_IDS as readonly string[]).includes(id) ||
    (LEGACY_GUEST_STARTER_ENTRY_IDS as readonly string[]).includes(id)
  );
}

export function isDemoOnlyStore(store: JournalStoreV2): boolean {
  return (
    store.entries.length > 0 &&
    store.entries.every((e) => isDemoJournalEntry(e))
  );
}

/** Drop one-off guest starter-import rows — never treat them as cloud personal data. */
export function withoutDemoJournalEntries(store: JournalStoreV2): JournalStoreV2 {
  const entries = store.entries.filter((e) => !isDemoJournalEntry(e));
  const activeEntryId =
    store.activeEntryId && entries.some((e) => e.id === store.activeEntryId)
      ? store.activeEntryId
      : (entries[0]?.id ?? null);
  return {
    version: 2,
    activeEntryId,
    entries,
    ...(store.folders?.length ? { folders: store.folders } : {}),
  };
}

export function emptyJournalStore(): JournalStoreV2 {
  return { version: 2, activeEntryId: null, entries: [] };
}

function markGuestJournalImportDone(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GUEST_JOURNAL_IMPORT_DONE_KEY, "1");
    for (const k of LEGACY_GUEST_JOURNAL_IMPORT_DONE_KEYS) {
      window.localStorage.removeItem(k);
    }
  } catch {
    /* */
  }
}

function hasGuestJournalImportCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(GUEST_JOURNAL_IMPORT_DONE_KEY) === "1") {
      return true;
    }
    return LEGACY_GUEST_JOURNAL_IMPORT_DONE_KEYS.some(
      (k) => window.localStorage.getItem(k) != null,
    );
  } catch {
    return false;
  }
}

function wipeGuestJournalDeviceKeys(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_PLAIN_KEY);
    window.localStorage.removeItem(JOURNAL_OWNER_ID_KEY);
    for (const k of LEGACY_GUEST_JOURNAL_IMPORT_DONE_KEYS) {
      window.localStorage.removeItem(k);
    }
  } catch {
    /* */
  }
}

/**
 * Guest journal load:
 * - Session JWT (including Continue as guest): return personal local cache only —
 *   never run the one-off import; cloud GET/PUT is the durability path.
 * - Unsigned + import never run + empty store: one-off data import once.
 * - Unsigned after that: normal local journal — never rewrite.
 */
export function ensureGuestJournalInitialImport(
  existing?: JournalStoreV2 | null,
): JournalStoreV2 {
  const current =
    existing ??
    (typeof window !== "undefined" ? loadJournalStoreRaw() : emptyJournalStore());

  if (typeof window !== "undefined" && isMedimadeSessionActive()) {
    return withoutDemoJournalEntries(current);
  }

  if (typeof window === "undefined") {
    return buildGuestJournalInitialImport();
  }

  // Import already done (or any content exists) → normal journal. Do not touch storage.
  if (hasGuestJournalImportCompleted() || current.entries.length > 0) {
    if (!hasGuestJournalImportCompleted()) markGuestJournalImportDone();
    return current;
  }

  // Empty device, import never ran — one-off only.
  const imported = buildGuestJournalInitialImport();
  wipeGuestJournalDeviceKeys();
  saveJournalStore(imported);
  markGuestJournalImportDone();
  return imported;
}

/**
 * After sign-out from a real account: clear account cache and run a fresh
 * one-off guest data import once. Guest journal is normal thereafter.
 */
export function resetJournalLocalToGuestInitialImport(): void {
  if (typeof window === "undefined") return;
  if (isMedimadeSessionActive()) return;
  wipeGuestJournalDeviceKeys();
  const imported = buildGuestJournalInitialImport();
  saveJournalStore(imported);
  markGuestJournalImportDone();
}

/**
 * Read localStorage only — no import. Use for signed-in cloud cache
 * and guest reads that must not rewrite the store.
 */
export function loadJournalStoreRaw(): JournalStoreV2 {
  if (typeof window === "undefined") {
    return emptyJournalStore();
  }
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as unknown;
      if (isStoreV2(data) && data.entries.length > 0) {
        return {
          version: 2,
          activeEntryId:
            data.activeEntryId &&
            data.entries.some((e) => e.id === data.activeEntryId)
              ? data.activeEntryId
              : data.entries[0].id,
          entries: data.entries.map(normalizeEntry),
          ...(normalizeFolders(data.folders)
            ? { folders: normalizeFolders(data.folders) }
            : {}),
        };
      }
    }
    const legacy = window.localStorage.getItem(LEGACY_PLAIN_KEY);
    if (legacy && typeof legacy === "string" && legacy.trim()) {
      const e = newEntry({
        contentHtml: `<p>${escapeLegacyPlain(legacy)}</p>`,
        title: deriveEntryTitle(`<p>${escapeLegacyPlain(legacy)}</p>`),
      });
      return { version: 2, activeEntryId: e.id, entries: [e] };
    }
  } catch {
    /* */
  }
  return emptyJournalStore();
}

/**
 * Guest: one-off data import if never run, otherwise the local journal as-is.
 * Signed-in: personal local cache without starter-import rows (cloud GET is separate).
 */
export function loadJournalStore(): JournalStoreV2 {
  if (typeof window === "undefined") {
    return emptyJournalStore();
  }
  return ensureGuestJournalInitialImport();
}

function escapeLegacyPlain(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "</p><p>");
}

function isStoreV2(x: unknown): x is JournalStoreV2 {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.version !== 2) return false;
  if (!Array.isArray(o.entries)) return false;
  return o.entries.every(isEntry);
}

function isEntry(x: unknown): x is JournalEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.createdAt === "string" &&
    typeof o.updatedAt === "string" &&
    typeof o.title === "string" &&
    typeof o.contentHtml === "string"
  );
}

function normalizeFolders(raw: unknown): JournalFolder[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: JournalFolder[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id.trim()) continue;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 40) : "";
    if (!name || seen.has(o.id)) continue;
    seen.add(o.id);
    out.push({ id: o.id.trim().slice(0, 80), name });
    if (out.length >= 40) break;
  }
  return out.length ? out : undefined;
}

function normalizeTags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tags = raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().replace(/^#/, "").slice(0, 32))
    .filter(Boolean)
    .slice(0, 16);
  return tags.length ? [...new Set(tags)] : undefined;
}

function normalizeEntry(e: JournalEntry): JournalEntry {
  const kind = e.kind === "gratitude" ? "gratitude" : undefined;
  const gratitude = kind
    ? normalizeGratitudeLines(e.gratitude)
    : undefined;
  const mood = isJournalMoodId(e.mood) ? e.mood : undefined;
  const tags = normalizeTags(e.tags);
  const localOnly = e.localOnly === true ? true : undefined;
  const mediaRefs = Array.isArray(e.mediaRefs)
    ? e.mediaRefs.filter((x): x is string => typeof x === "string").slice(0, 64)
    : undefined;
  const folderId =
    typeof e.folderId === "string" && e.folderId.trim()
      ? e.folderId.trim().slice(0, 80)
      : undefined;
  const importSource =
    e.importSource === "day_one" ||
    e.importSource === "markdown" ||
    e.importSource === "csv" ||
    e.importSource === "plaintext" ||
    e.importSource === "pdf_annotations" ||
    e.importSource === "handwritten_photo"
      ? e.importSource
      : undefined;
  const importBatchId =
    typeof e.importBatchId === "string" && e.importBatchId.trim()
      ? e.importBatchId.trim()
      : undefined;
  const sourceMetadata =
    e.sourceMetadata && typeof e.sourceMetadata === "object" && !Array.isArray(e.sourceMetadata)
      ? (e.sourceMetadata as Record<string, unknown>)
      : undefined;
  return {
    ...e,
    title: typeof e.title === "string" ? e.title : deriveEntryTitle(e.contentHtml),
    contentHtml: e.contentHtml?.trim() ? e.contentHtml : "<p></p>",
    ...(kind ? { kind, gratitude } : { kind: undefined, gratitude: undefined }),
    ...(mood ? { mood } : { mood: undefined }),
    ...(tags ? { tags } : { tags: undefined }),
    ...(localOnly ? { localOnly: true } : { localOnly: undefined }),
    ...(importSource ? { importSource } : { importSource: undefined }),
    ...(importBatchId ? { importBatchId } : { importBatchId: undefined }),
    ...(sourceMetadata ? { sourceMetadata } : { sourceMetadata: undefined }),
    ...(mediaRefs?.length ? { mediaRefs } : { mediaRefs: undefined }),
    ...(folderId ? { folderId } : { folderId: undefined }),
  };
}

/**
 * Apply cloud store as source of truth. Does not re-attach guest demos or
 * other local-only rows (offline/local-first can return later).
 */
export function mergeRemoteJournalKeepingLocalOnly(
  remote: JournalStoreV2,
  _localEntries: JournalEntry[],
): JournalStoreV2 {
  return {
    version: 2,
    activeEntryId: remote.activeEntryId,
    entries: remote.entries.map(normalizeEntry),
    ...(remote.folders?.length ? { folders: remote.folders } : {}),
  };
}

export function entriesForCloudPut(entries: JournalEntry[]): JournalEntry[] {
  return entries.filter((e) => !e.localOnly && !isDemoJournalEntry(e));
}

/** Consecutive local calendar days with a meaningful entry, ending today or yesterday. */
export function journalWritingStreakDays(
  entries: JournalEntry[],
  now = new Date(),
): number {
  const days = new Set(
    entries
      .filter(journalEntryHasMeaningfulContent)
      .map((e) => localDateKeyFromIso(e.createdAt)),
  );
  if (!days.size) return 0;
  const start = localDateKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = localDateKey(y);
  let cursor = days.has(start) ? now : days.has(yesterday) ? y : null;
  if (!cursor) return 0;
  let n = 0;
  const d = new Date(cursor);
  while (days.has(localDateKey(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Fired after `saveJournalStore` so open journal UI can refresh without a network round-trip. */
export const JOURNAL_STORE_CHANGED = "mm-journal-store-changed";

export function saveJournalStore(
  store: JournalStoreV2,
  opts?: { source?: string },
) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* */
  }
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(JOURNAL_STORE_CHANGED, {
        detail: { source: opts?.source ?? "unknown" },
      }),
    );
  } catch {
    /* */
  }
}

/**
 * Read-only snapshot for UI sync (same tab / other tabs).
 * Never runs the one-off import, never writes, never touches cloud.
 */
export function readJournalStoreSnapshot(opts: {
  signedIn: boolean;
}): JournalStoreV2 {
  const raw = loadJournalStoreRaw();
  if (opts.signedIn) {
    return pruneEmptyJournalEntries(withoutDemoJournalEntries(raw));
  }
  return raw;
}

/**
 * Same-tab: `JOURNAL_STORE_CHANGED` after local saves.
 * Cross-tab: `storage` when another tab writes `mm_journal_store_v2`.
 * Does not fetch, import, or mutate storage — callers only re-read + paint.
 */
export function subscribeJournalStore(
  listener: (info: { source: string }) => void,
  opts?: { ignoreSources?: readonly string[] },
): () => void {
  if (typeof window === "undefined") return () => {};
  const ignore = new Set(opts?.ignoreSources ?? []);

  const onCustom = (ev: Event) => {
    const source =
      (ev as CustomEvent<{ source?: string }>).detail?.source ?? "unknown";
    if (ignore.has(source)) return;
    listener({ source });
  };

  const onStorage = (ev: StorageEvent) => {
    if (ev.storageArea && ev.storageArea !== window.localStorage) return;
    if (ev.key !== STORE_KEY && ev.key !== null) return;
    listener({ source: ev.key === null ? "storage-clear" : "storage" });
  };

  window.addEventListener(JOURNAL_STORE_CHANGED, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(JOURNAL_STORE_CHANGED, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function newJournalEntry(overrides?: Partial<JournalEntry>): JournalEntry {
  return newEntry(overrides);
}

export function newJournalFolder(name: string): JournalFolder | null {
  const n = name.trim().slice(0, 40);
  if (!n) return null;
  const now = new Date().toISOString();
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `f_${crypto.randomUUID()}`
      : `f_${now}_${Math.random().toString(36).slice(2, 9)}`;
  return { id, name: n };
}

/** Calendar month key for grouping (YYYY-MM). */
export function monthKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "1970-01";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMonthHeading(yyyyMm: string): string {
  const [ys, ms] = yyyyMm.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return yyyyMm;
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export type JournalSidebarGroup = {
  id: string;
  label: string;
  entries: JournalEntry[];
};

const MS_DAY = 86_400_000;

/** True if the entry has a non-empty title or body (after stripping HTML). */
export function isGratitudeEntry(e: JournalEntry): boolean {
  return e.kind === "gratitude";
}

export function emptyGratitudeLines(): JournalGratitudeLines {
  return ["", "", ""];
}

/** Minimum empty slots shown in the gratitude editor. */
export const GRATITUDE_MIN_SLOTS = 3;

export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function localDateKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return localDateKey();
  return localDateKey(d);
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function gratitudeLinesToHtml(lines: JournalGratitudeLines): string {
  const paras = lines
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `<p>${escapeHtmlText(s)}</p>`);
  return paras.length ? paras.join("") : "<p></p>";
}

export function normalizeGratitudeLines(raw: unknown): JournalGratitudeLines {
  const a = Array.isArray(raw) ? raw : [];
  const lines = a
    .map((x) => (typeof x === "string" ? x : ""))
    .slice(0, 24);
  while (lines.length > GRATITUDE_MIN_SLOTS && !lines[lines.length - 1]!.trim()) {
    lines.pop();
  }
  while (lines.length < GRATITUDE_MIN_SLOTS) lines.push("");
  return lines;
}

export function gratitudeTitleForDate(d: Date): string {
  return `Gratitude · ${d.toLocaleDateString("en-US", { dateStyle: "medium" })}`;
}

export function newGratitudeJournalEntry(now = new Date()): JournalEntry {
  const lines = emptyGratitudeLines();
  return newEntry({
    kind: "gratitude",
    gratitude: lines,
    title: gratitudeTitleForDate(now),
    contentHtml: gratitudeLinesToHtml(lines),
  });
}

export function findGratitudeEntryForLocalDate(
  entries: JournalEntry[],
  dateKey: string,
): JournalEntry | undefined {
  return entries.find(
    (e) => isGratitudeEntry(e) && localDateKeyFromIso(e.createdAt) === dateKey,
  );
}

export function journalEntryHasMeaningfulContent(e: JournalEntry): boolean {
  if (isGratitudeEntry(e)) {
    return (e.gratitude ?? []).some((s) => s.trim().length > 0)
      || stripHtmlToText(e.contentHtml).trim().length > 0;
  }
  if (e.title.trim().length > 0) return true;
  if (/<img\b/i.test(e.contentHtml)) return true;
  return stripHtmlToText(e.contentHtml).trim().length > 0;
}

/**
 * Drop empty stubs from the store. Pass `keepEmptyId` for the entry the user
 * just created via New entry (allowed to stay blank while open).
 */
export function pruneEmptyJournalEntries(
  store: JournalStoreV2,
  keepEmptyId?: string | null,
): JournalStoreV2 {
  const entries = store.entries.filter(
    (e) =>
      journalEntryHasMeaningfulContent(e) ||
      (keepEmptyId != null && e.id === keepEmptyId),
  );
  if (entries.length === store.entries.length) {
    const activeOk =
      store.activeEntryId &&
      entries.some((e) => e.id === store.activeEntryId);
    if (activeOk) return store;
  }
  const activeEntryId =
    store.activeEntryId && entries.some((e) => e.id === store.activeEntryId)
      ? store.activeEntryId
      : mostRecentlyUpdatedId(entries.filter((e) => !isGratitudeEntry(e))) ??
        entries[0]?.id ??
        null;
  return {
    version: 2,
    activeEntryId,
    entries,
    ...(store.folders?.length ? { folders: store.folders } : {}),
  };
}

/** Most recently updated entry id (by `updatedAt`), or null. */
export function mostRecentlyUpdatedId(
  entries: JournalEntry[],
): string | null {
  if (!entries.length) return null;
  let best = entries[0];
  let bestT = new Date(best.updatedAt).getTime();
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i];
    const t = new Date(e.updatedAt).getTime();
    if (t > bestT) {
      best = e;
      bestT = t;
    }
  }
  return best.id;
}

/** True when draft fields differ from the persisted entry (real edit). */
export function journalEntryDraftChanged(
  entry: JournalEntry,
  draft: {
    contentHtml: string;
    title: string;
    gratitude?: JournalGratitudeLines;
  },
): boolean {
  if (entry.title !== draft.title) return true;
  if (entry.contentHtml !== draft.contentHtml) return true;
  if (isGratitudeEntry(entry)) {
    const a = normalizeGratitudeLines(entry.gratitude);
    const b = normalizeGratitudeLines(draft.gratitude);
    if (a.length !== b.length) return true;
    return a.some((line, i) => line !== b[i]);
  }
  return false;
}

function maxJournalEntryUpdatedAt(entries: JournalEntry[]): number {
  if (!entries.length) return 0;
  return Math.max(...entries.map((entry) => new Date(entry.updatedAt).getTime()), 0);
}

/**
 * Prefer cloud when it has entries. Guest demos / empty stubs never beat remote.
 * Signed-in JournalView always applies remote; this remains for other callers.
 */
export function shouldPreferRemoteJournalStore(
  remote: JournalStoreV2,
  localEntries: JournalEntry[],
): boolean {
  if (!remote.entries?.length) return false;
  const localPersonal = localEntries.filter((e) => !isDemoJournalEntry(e));
  if (localPersonal.length === 0) return true;
  if (isDemoOnlyStore({ version: 2, activeEntryId: null, entries: localEntries })) {
    return true;
  }
  const remoteMax = maxJournalEntryUpdatedAt(remote.entries);
  const localMax = maxJournalEntryUpdatedAt(localPersonal);
  if (remoteMax >= localMax) return true;
  const localMeaningful = localPersonal.filter(journalEntryHasMeaningfulContent);
  if (
    localMeaningful.length === 0 &&
    remote.entries.some(journalEntryHasMeaningfulContent)
  ) {
    return true;
  }
  return false;
}

export function groupJournalEntriesForSidebar(
  entries: JournalEntry[],
  now = new Date(),
): JournalSidebarGroup[] {
  const t = now.getTime();
  const sorted = [...entries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  const lastWeek: JournalEntry[] = [];
  const lastMonth: JournalEntry[] = [];
  const olderByMonth = new Map<string, JournalEntry[]>();

  for (const e of sorted) {
    const age = t - new Date(e.updatedAt).getTime();
    if (age <= 7 * MS_DAY) {
      lastWeek.push(e);
    } else if (age <= 30 * MS_DAY) {
      lastMonth.push(e);
    } else {
      const mk = monthKeyFromIso(e.updatedAt);
      const arr = olderByMonth.get(mk) ?? [];
      arr.push(e);
      olderByMonth.set(mk, arr);
    }
  }

  const groups: JournalSidebarGroup[] = [];
  if (lastWeek.length) {
    groups.push({ id: "last-week", label: "Last week", entries: lastWeek });
  }
  if (lastMonth.length) {
    groups.push({ id: "last-month", label: "Last month", entries: lastMonth });
  }

  const monthKeys = Array.from(olderByMonth.keys()).sort((a, b) =>
    b.localeCompare(a),
  );
  for (const mk of monthKeys) {
    const list = olderByMonth.get(mk) ?? [];
    if (!list.length) continue;
    list.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    groups.push({
      id: `month-${mk}`,
      label: formatMonthHeading(mk),
      entries: list,
    });
  }

  return groups;
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function weekGroupLabel(weekStart: Date, now: Date): string {
  const thisWeek = startOfWeekMonday(now).getTime();
  const start = weekStart.getTime();
  const weeksAgo = Math.round((thisWeek - start) / (7 * MS_DAY));
  if (weeksAgo <= 0) return "This week";
  if (weeksAgo === 1) return "Last week";
  if (weeksAgo < 12) return `${weeksAgo} weeks ago`;
  return formatMonthHeading(
    `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, "0")}`,
  );
}

/** Group freeform journal entries by calendar week (Mon–Sun) for the entries sidebar. */
export function groupJournalEntriesByWeek(
  entries: JournalEntry[],
  now = new Date(),
): JournalSidebarGroup[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  const byWeek = new Map<number, JournalEntry[]>();
  for (const e of sorted) {
    const weekStart = startOfWeekMonday(new Date(e.updatedAt));
    const key = weekStart.getTime();
    const arr = byWeek.get(key) ?? [];
    arr.push(e);
    byWeek.set(key, arr);
  }
  const keys = Array.from(byWeek.keys()).sort((a, b) => b - a);
  return keys.map((key) => {
    const weekStart = new Date(key);
    const list = byWeek.get(key) ?? [];
    return {
      id: `week-${key}`,
      label: weekGroupLabel(weekStart, now),
      entries: list,
    };
  });
}

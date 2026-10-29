import {
  readAccountLocalStorage,
  removeAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import { isJournalMoodId } from "@/lib/journal-moods";
import {
  gratitudeEntryPathSlug,
  journalEntryPathSlug,
  looksLikeUuid,
  uniquifySlug,
} from "@/lib/readable-url";

export type JournalEntryKind = "freeform" | "gratitude";

/** Daily gratitude lines — UI starts with 3 optional slots; chat may append more. */
export type JournalGratitudeLines = string[];

/** Where a Reflect-linked meditation came from. */
export type JournalMeditationSource = "own" | "community" | "program";

/** Denormalized meditation fields for Reflect cards when the library row isn’t loaded. */
export type JournalMeditationSnapshot = {
  title: string;
  coverImageUrl?: string | null;
  speakerName?: string | null;
  styleLabel?: string | null;
  durationSeconds?: number | null;
  /** Library deep-link (creations / community / programs). */
  openHref?: string | null;
};

export type JournalLinkTargetType = "meditation" | "life_area" | "heal_item";

/** One row in the journal link table. An entry can link to several things. */
export type JournalLink = {
  id: string;
  entryId: string;
  targetType: JournalLinkTargetType;
  targetId: string;
  createdAt: string;
  /** Display name captured when the link was added. */
  label?: string;
  /** True when Reflect opened the entry for this meditation. */
  reflecting?: boolean;
  meditationSource?: JournalMeditationSource;
  meditationSnapshot?: JournalMeditationSnapshot;
};

export type JournalEntry = {
  id: string;
  /**
   * Day the entry is about (list sort/group + editor date). Distinct from
   * `createdAt` / `updatedAt`, which are system timestamps only.
   */
  entryDate: string;
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
  /**
   * Optional link to a library meditation (usually `s3Key`).
   * Kept in sync with the primary meditation row in `links`.
   */
  meditationId?: string;
  meditationSource?: JournalMeditationSource;
  meditationSnapshot?: JournalMeditationSnapshot;
  /** Links to meditations, life areas, and Heal items. */
  links?: JournalLink[];
  /**
   * Readable URL segment (e.g. `2026-10-29-morning-pages`). Stable until
   * title/date change; previous values live in `urlSlugHistory` for redirects.
   */
  urlSlug?: string;
  urlSlugHistory?: string[];
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
    let id = readAccountLocalStorage(JOURNAL_OWNER_ID_KEY)?.trim();
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `o_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      writeAccountLocalStorage(JOURNAL_OWNER_ID_KEY, id);
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

/** ISO used for list order, grouping, and the editor date. */
export function journalEntryDateIso(
  entry: Pick<JournalEntry, "entryDate" | "createdAt">,
): string {
  return entry.entryDate || entry.createdAt;
}

/** First line of body text for display titles (no “Untitled entry”). */
export function journalEntryFirstLine(
  html: string,
  maxLen = 80,
): string | null {
  const t = stripHtmlToText(html);
  if (!t) return null;
  const line = t.split(/\n/)[0]?.trim() || t;
  if (!line) return null;
  return line.length > maxLen ? `${line.slice(0, maxLen - 3)}…` : line;
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

export type JournalPromptMark = {
  id: string;
  template: string;
  name: string;
};

function decodeHtmlAttr(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function htmlAttr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return m ? decodeHtmlAttr(m[1]) : "";
}

/** Prompt blocks saved on an entry. The question lives in attributes, not body text. */
export function journalPromptMarksFromHtml(html: string): JournalPromptMark[] {
  const out: JournalPromptMark[] = [];
  const re = /<div\b[^>]*\bdata-journal-prompt="1"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const template = htmlAttr(tag, "data-template");
    if (!template.trim()) continue;
    out.push({
      id: htmlAttr(tag, "data-prompt-id"),
      template,
      name: htmlAttr(tag, "data-name"),
    });
  }
  return out;
}

export function journalPromptPlainText(template: string, name?: string): string {
  const t = template.trim();
  const n = name?.trim() ?? "";
  if (n && t.includes("{name}")) return t.replaceAll("{name}", n).trim();
  return t;
}

/** Card title: typed title, prompt, first body line, or entry date. Display only. */
export function journalEntryListTitle(
  entry: {
    title: string;
    contentHtml: string;
    entryDate?: string;
    createdAt?: string;
  },
  fallback = "Untitled entry",
): string {
  const typed = entry.title.trim();
  if (typed) return typed;
  const first = journalPromptMarksFromHtml(entry.contentHtml)[0];
  if (first) {
    return journalPromptPlainText(first.template, first.name) || fallback;
  }
  const line = journalEntryFirstLine(entry.contentHtml);
  if (line) return line;
  if (entry.entryDate || entry.createdAt) {
    return formatJournalEntryDate(entry.entryDate || entry.createdAt!);
  }
  return fallback;
}

/**
 * Full journal body as plain text for handoff to Create / the chat API.
 * Prompt questions are labelled and kept out of the body text.
 */
export function journalEntryPlainForHandoff(html: string): string {
  const prompts = journalPromptMarksFromHtml(html)
    .map((mark) => journalPromptPlainText(mark.template, mark.name))
    .filter(Boolean)
    .map((q) => `Prompt the user answered: ${q}`);
  const t = stripHtmlToText(expandVoiceClipTranscriptsForPlainText(html));
  const combined = [...prompts, t].filter(Boolean).join("\n\n");
  if (combined.length <= JOURNAL_BODY_PLAIN_MAX) return combined;
  return `${combined.slice(0, JOURNAL_BODY_PLAIN_MAX)}…`;
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
  const createdAt = overrides?.createdAt ?? now;
  const updatedAt = overrides?.updatedAt ?? now;
  const entryDate = overrides?.entryDate ?? createdAt;
  const draft: JournalEntry = {
    id,
    title: "",
    contentHtml: "<p></p>",
    ...overrides,
    createdAt,
    updatedAt,
    entryDate,
  };
  // Readable URL from day one — never put the UUID in the address bar for new rows.
  if (!draft.urlSlug?.trim()) {
    const base =
      draft.kind === "gratitude"
        ? gratitudeEntryPathSlug(draft)
        : journalEntryPathSlug(draft);
    try {
      const peers = loadJournalStoreRaw().entries;
      draft.urlSlug = uniquifySlug(
        base,
        takenJournalSlugs(
          peers,
          draft.kind === "gratitude" ? "gratitude" : "freeform",
        ),
      );
    } catch {
      draft.urlSlug = base;
    }
  }
  return draft;
}

function daysAgoIso(days: number, hour = 9): string {
  const d = new Date();
  d.setHours(hour, 15, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/**
 * Legacy starter journal payload — NOT used by the UI anymore.
 * Kept only so old demo ids can still be detected/stripped.
 */
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
 * Legacy cloud-journal mirror for ops scripts targeting guest@consciously.live.
 * Never called from the UI.
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
    writeAccountLocalStorage(GUEST_JOURNAL_IMPORT_DONE_KEY, "1");
    for (const k of LEGACY_GUEST_JOURNAL_IMPORT_DONE_KEYS) {
      removeAccountLocalStorage(k);
    }
  } catch {
    /* */
  }
}

function hasGuestJournalImportCompleted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (readAccountLocalStorage(GUEST_JOURNAL_IMPORT_DONE_KEY) === "1") {
      return true;
    }
    return LEGACY_GUEST_JOURNAL_IMPORT_DONE_KEYS.some(
      (k) => readAccountLocalStorage(k) != null,
    );
  } catch {
    return false;
  }
}

function wipeGuestJournalDeviceKeys(): void {
  if (typeof window === "undefined") return;
  try {
    removeAccountLocalStorage(LEGACY_PLAIN_KEY);
    removeAccountLocalStorage(JOURNAL_OWNER_ID_KEY);
    for (const k of LEGACY_GUEST_JOURNAL_IMPORT_DONE_KEYS) {
      removeAccountLocalStorage(k);
    }
  } catch {
    /* */
  }
}

/**
 * Load journal for the UI. Never auto-seeds starter entries.
 * Signed-in: strip leftover demo ids from the local cache.
 * Unsigned: return whatever is on device (possibly empty).
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
  return current;
}

/**
 * After sign-out: clear the account journal cache on this device.
 * Does NOT reseed starter journals (those one-offs were ops-only).
 */
export function resetJournalLocalToGuestInitialImport(): void {
  if (typeof window === "undefined") return;
  if (isMedimadeSessionActive()) return;
  wipeGuestJournalDeviceKeys();
  try {
    removeAccountLocalStorage(GUEST_JOURNAL_IMPORT_DONE_KEY);
  } catch {
    /* */
  }
  saveJournalStore(emptyJournalStore());
}

/**
 * Read localStorage only — no import. Use for signed-in cloud cache
 * and reads that must not rewrite the store.
 */
export function loadJournalStoreRaw(): JournalStoreV2 {
  if (typeof window === "undefined") {
    return emptyJournalStore();
  }
  try {
    const raw = readAccountLocalStorage(STORE_KEY);
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
    const legacy = readAccountLocalStorage(LEGACY_PLAIN_KEY);
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
 * Load journal. Never auto-seeds starters — cloud/ops scripts only.
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

function normalizeSnapshot(
  snapRaw: JournalMeditationSnapshot | null | undefined,
): JournalMeditationSnapshot | undefined {
  if (!snapRaw || typeof snapRaw !== "object" || typeof snapRaw.title !== "string") {
    return undefined;
  }
  return {
    title: snapRaw.title.trim().slice(0, 200) || "Meditation",
    ...(typeof snapRaw.coverImageUrl === "string"
      ? { coverImageUrl: snapRaw.coverImageUrl }
      : snapRaw.coverImageUrl === null
        ? { coverImageUrl: null }
        : {}),
    ...(typeof snapRaw.speakerName === "string"
      ? { speakerName: snapRaw.speakerName }
      : snapRaw.speakerName === null
        ? { speakerName: null }
        : {}),
    ...(typeof snapRaw.styleLabel === "string"
      ? { styleLabel: snapRaw.styleLabel }
      : snapRaw.styleLabel === null
        ? { styleLabel: null }
        : {}),
    ...(typeof snapRaw.durationSeconds === "number"
      ? { durationSeconds: snapRaw.durationSeconds }
      : snapRaw.durationSeconds === null
        ? { durationSeconds: null }
        : {}),
    ...(typeof snapRaw.openHref === "string"
      ? { openHref: snapRaw.openHref }
      : snapRaw.openHref === null
        ? { openHref: null }
        : {}),
  };
}

function normalizeJournalLinks(
  entryId: string,
  raw: unknown,
  legacy: {
    meditationId?: string;
    meditationSource?: JournalMeditationSource;
    meditationSnapshot?: JournalMeditationSnapshot;
    createdAt: string;
  },
): JournalLink[] | undefined {
  const out: JournalLink[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const o = row as JournalLink;
      const targetType = o.targetType;
      if (
        targetType !== "meditation" &&
        targetType !== "life_area" &&
        targetType !== "heal_item"
      ) {
        continue;
      }
      const targetId = typeof o.targetId === "string" ? o.targetId.trim().slice(0, 400) : "";
      if (!targetId) continue;
      const key = `${targetType}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const source =
        o.meditationSource === "own" ||
        o.meditationSource === "community" ||
        o.meditationSource === "program"
          ? o.meditationSource
          : undefined;
      out.push({
        id: typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 80) : `jl_${targetType}_${targetId.slice(0, 24)}`,
        entryId,
        targetType,
        targetId,
        createdAt:
          typeof o.createdAt === "string" && o.createdAt.trim()
            ? o.createdAt
            : legacy.createdAt,
        ...(typeof o.label === "string" && o.label.trim()
          ? { label: o.label.trim().slice(0, 200) }
          : {}),
        ...(o.reflecting === true ? { reflecting: true } : {}),
        ...(source ? { meditationSource: source } : {}),
        ...(normalizeSnapshot(o.meditationSnapshot)
          ? { meditationSnapshot: normalizeSnapshot(o.meditationSnapshot) }
          : {}),
      });
      if (out.length >= 24) break;
    }
  }
  if (legacy.meditationId && !seen.has(`meditation:${legacy.meditationId}`)) {
    out.unshift({
      id: `jl_reflect_${legacy.meditationId.slice(0, 24)}`,
      entryId,
      targetType: "meditation",
      targetId: legacy.meditationId,
      createdAt: legacy.createdAt,
      reflecting: true,
      ...(legacy.meditationSource ? { meditationSource: legacy.meditationSource } : {}),
      ...(legacy.meditationSnapshot
        ? {
            label: legacy.meditationSnapshot.title,
            meditationSnapshot: legacy.meditationSnapshot,
          }
        : {}),
    });
  }
  return out.length ? out.slice(0, 24) : undefined;
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
  const meditationId =
    typeof e.meditationId === "string" && e.meditationId.trim()
      ? e.meditationId.trim().slice(0, 400)
      : undefined;
  const meditationSource =
    e.meditationSource === "own" ||
    e.meditationSource === "community" ||
    e.meditationSource === "program"
      ? e.meditationSource
      : undefined;
  const snapRaw = e.meditationSnapshot;
  const meditationSnapshot =
    snapRaw && typeof snapRaw === "object" && typeof snapRaw.title === "string"
      ? {
          title: snapRaw.title.trim().slice(0, 200) || "Meditation",
          ...(typeof snapRaw.coverImageUrl === "string"
            ? { coverImageUrl: snapRaw.coverImageUrl }
            : snapRaw.coverImageUrl === null
              ? { coverImageUrl: null }
              : {}),
          ...(typeof snapRaw.speakerName === "string"
            ? { speakerName: snapRaw.speakerName }
            : snapRaw.speakerName === null
              ? { speakerName: null }
              : {}),
          ...(typeof snapRaw.styleLabel === "string"
            ? { styleLabel: snapRaw.styleLabel }
            : snapRaw.styleLabel === null
              ? { styleLabel: null }
              : {}),
          ...(typeof snapRaw.durationSeconds === "number"
            ? { durationSeconds: snapRaw.durationSeconds }
            : snapRaw.durationSeconds === null
              ? { durationSeconds: null }
              : {}),
          ...(typeof snapRaw.openHref === "string"
            ? { openHref: snapRaw.openHref }
            : snapRaw.openHref === null
              ? { openHref: null }
              : {}),
        }
      : undefined;
  const links = normalizeJournalLinks(e.id, e.links, {
    meditationId,
    meditationSource,
    meditationSnapshot,
    createdAt: e.createdAt,
  });
  const primary = links?.find(
    (link) => link.targetType === "meditation" && link.reflecting,
  ) ?? links?.find((link) => link.targetType === "meditation");
  const nextMeditationId = primary?.targetId ?? meditationId;
  const nextSource = primary?.meditationSource ?? meditationSource;
  const nextSnapshot = primary?.meditationSnapshot ?? meditationSnapshot;
  const createdAt =
    typeof e.createdAt === "string" && e.createdAt.trim()
      ? e.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof e.updatedAt === "string" && e.updatedAt.trim()
      ? e.updatedAt
      : createdAt;
  const entryDate =
    typeof e.entryDate === "string" && e.entryDate.trim()
      ? e.entryDate
      : createdAt;
  const urlSlug =
    typeof e.urlSlug === "string" && e.urlSlug.trim()
      ? e.urlSlug.trim().slice(0, 80)
      : undefined;
  const urlSlugHistory = Array.isArray(e.urlSlugHistory)
    ? e.urlSlugHistory
        .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
        .map((x) => x.trim().slice(0, 80))
        .slice(0, 24)
    : undefined;
  return {
    ...e,
    createdAt,
    updatedAt,
    entryDate,
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
    ...(nextMeditationId ? { meditationId: nextMeditationId } : { meditationId: undefined }),
    ...(nextSource ? { meditationSource: nextSource } : { meditationSource: undefined }),
    ...(nextSnapshot ? { meditationSnapshot: nextSnapshot } : { meditationSnapshot: undefined }),
    ...(links ? { links } : { links: undefined }),
    ...(urlSlug ? { urlSlug } : { urlSlug: undefined }),
    ...(urlSlugHistory?.length ? { urlSlugHistory } : { urlSlugHistory: undefined }),
  };
}

/**
 * Apply cloud store as source of truth for shared rows, but keep local entries
 * that are not on the remote yet (e.g. a Reflect / New entry created while the
 * GET was in flight). Drops leftover demos. Local-only rows stay local-only.
 *
 * `preferActiveId` keeps the entry the user just opened (local) selected when
 * the remote snapshot still points at an older active row.
 */
export function mergeRemoteJournalKeepingLocalOnly(
  remote: JournalStoreV2,
  localEntries: JournalEntry[],
  opts?: { preferActiveId?: string | null },
): JournalStoreV2 {
  const localById = new Map(
    localEntries.filter((e) => !isDemoJournalEntry(e)).map((e) => [e.id, e]),
  );
  const remoteNormalized = remote.entries.map((remoteEntry) => {
    const normalized = normalizeEntry(remoteEntry);
    const local = localById.get(normalized.id);
    // Cloud used to drop meditation fields on PUT — keep a local link until
    // the remote entry carries one.
    if (
      (local?.meditationId?.trim() && !normalized.meditationId?.trim()) ||
      (local?.links?.length && !normalized.links?.length)
    ) {
      return normalizeEntry({
        ...normalized,
        meditationId: normalized.meditationId || local?.meditationId,
        meditationSource: normalized.meditationSource || local?.meditationSource,
        meditationSnapshot: normalized.meditationSnapshot || local?.meditationSnapshot,
        links: normalized.links?.length ? normalized.links : local?.links,
      });
    }
    return normalized;
  });
  const remoteIds = new Set(remoteNormalized.map((e) => e.id));
  const localExtras = localEntries
    .filter(
      (e) =>
        !remoteIds.has(e.id) &&
        !isDemoJournalEntry(e) &&
        (e.localOnly === true ||
          journalEntryHasMeaningfulContent(e) ||
          Boolean(e.meditationId?.trim())),
    )
    .map(normalizeEntry);
  const entries = [...localExtras, ...remoteNormalized];
  const prefer = opts?.preferActiveId?.trim() || null;
  const activeEntryId =
    prefer && entries.some((e) => e.id === prefer)
      ? prefer
      : remote.activeEntryId &&
          entries.some((e) => e.id === remote.activeEntryId)
        ? remote.activeEntryId
        : (localExtras[0]?.id ?? entries[0]?.id ?? null);
  return {
    version: 2,
    activeEntryId,
    entries,
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
    writeAccountLocalStorage(STORE_KEY, JSON.stringify(store));
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

/** `YYYY-MM-DD` for `<input type="date">` from an entry-date ISO. */
export function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return localDateKeyFromIso(iso);
}

/** Local noon ISO from a date input value. */
export function dateInputToIso(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
    (e) =>
      isGratitudeEntry(e) &&
      localDateKeyFromIso(journalEntryDateIso(e)) === dateKey,
  );
}

/** Most recently touched gratitude whose updatedAt (else createdAt) is within `hours`. */
export function findRecentGratitudeWithinHours(
  entries: JournalEntry[],
  hours: number,
  nowMs = Date.now(),
): JournalEntry | undefined {
  const cutoff = nowMs - hours * 3_600_000;
  let best: JournalEntry | undefined;
  let bestTs = Number.NEGATIVE_INFINITY;
  for (const e of entries) {
    if (!isGratitudeEntry(e)) continue;
    const t = Date.parse(e.updatedAt || e.createdAt);
    if (!Number.isFinite(t) || t < cutoff) continue;
    if (t >= bestTs) {
      bestTs = t;
      best = e;
    }
  }
  return best;
}

export function journalEntryHasMeaningfulContent(e: JournalEntry): boolean {
  if (isGratitudeEntry(e)) {
    return (e.gratitude ?? []).some((s) => s.trim().length > 0)
      || stripHtmlToText(e.contentHtml).trim().length > 0;
  }
  if (e.title.trim().length > 0) return true;
  // Reflect stubs are kept even before the first keystroke.
  if (e.meditationId?.trim()) return true;
  if (/<img\b/i.test(e.contentHtml)) return true;
  if (/data-journal-prompt="1"/i.test(e.contentHtml)) return true;
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

function sortByEntryDateDesc(a: JournalEntry, b: JournalEntry): number {
  return (
    new Date(journalEntryDateIso(b)).getTime() -
    new Date(journalEntryDateIso(a)).getTime()
  );
}

export function groupJournalEntriesForSidebar(
  entries: JournalEntry[],
  now = new Date(),
): JournalSidebarGroup[] {
  const t = now.getTime();
  const sorted = [...entries].sort(sortByEntryDateDesc);

  const lastWeek: JournalEntry[] = [];
  const lastMonth: JournalEntry[] = [];
  const olderByMonth = new Map<string, JournalEntry[]>();

  for (const e of sorted) {
    const age = t - new Date(journalEntryDateIso(e)).getTime();
    if (age <= 7 * MS_DAY) {
      lastWeek.push(e);
    } else if (age <= 30 * MS_DAY) {
      lastMonth.push(e);
    } else {
      const mk = monthKeyFromIso(journalEntryDateIso(e));
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
    list.sort(sortByEntryDateDesc);
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

/** Group freeform entries by entry date: This / Last / 2 weeks ago, then month+year. */
export function groupJournalEntriesByWeek(
  entries: JournalEntry[],
  now = new Date(),
): JournalSidebarGroup[] {
  const sorted = [...entries].sort(sortByEntryDateDesc);
  const thisWeekStart = startOfWeekMonday(now).getTime();
  const lastWeekStart = thisWeekStart - 7 * MS_DAY;
  const twoWeeksStart = thisWeekStart - 14 * MS_DAY;

  const thisWeek: JournalEntry[] = [];
  const lastWeek: JournalEntry[] = [];
  const twoWeeksAgo: JournalEntry[] = [];
  const olderByMonth = new Map<string, JournalEntry[]>();

  for (const e of sorted) {
    const weekStart = startOfWeekMonday(
      new Date(journalEntryDateIso(e)),
    ).getTime();
    if (weekStart >= thisWeekStart) {
      thisWeek.push(e);
    } else if (weekStart >= lastWeekStart) {
      lastWeek.push(e);
    } else if (weekStart >= twoWeeksStart) {
      twoWeeksAgo.push(e);
    } else {
      const mk = monthKeyFromIso(journalEntryDateIso(e));
      const arr = olderByMonth.get(mk) ?? [];
      arr.push(e);
      olderByMonth.set(mk, arr);
    }
  }

  const groups: JournalSidebarGroup[] = [];
  if (thisWeek.length) {
    groups.push({ id: "this-week", label: "This week", entries: thisWeek });
  }
  if (lastWeek.length) {
    groups.push({ id: "last-week", label: "Last week", entries: lastWeek });
  }
  if (twoWeeksAgo.length) {
    groups.push({
      id: "two-weeks-ago",
      label: "2 weeks ago",
      entries: twoWeeksAgo,
    });
  }
  const monthKeys = Array.from(olderByMonth.keys()).sort((a, b) =>
    b.localeCompare(a),
  );
  for (const mk of monthKeys) {
    const list = olderByMonth.get(mk) ?? [];
    if (!list.length) continue;
    list.sort(sortByEntryDateDesc);
    groups.push({
      id: `month-${mk}`,
      label: formatMonthHeading(mk),
      entries: list,
    });
  }
  return groups;
}

function takenJournalSlugs(
  entries: JournalEntry[],
  kind: JournalEntryKind | "freeform",
  exceptId?: string,
): Set<string> {
  const taken = new Set<string>();
  for (const e of entries) {
    if (exceptId && e.id === exceptId) continue;
    const isGrat = e.kind === "gratitude";
    if (kind === "gratitude" ? !isGrat : isGrat) continue;
    if (e.urlSlug) taken.add(e.urlSlug);
    for (const h of e.urlSlugHistory ?? []) taken.add(h);
  }
  return taken;
}

/** Assign or refresh a readable urlSlug; records prior slug in history. */
export function ensureJournalEntryUrlSlug(
  entries: JournalEntry[],
  entryId: string,
): { entries: JournalEntry[]; entry: JournalEntry | null } {
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx < 0) return { entries, entry: null };
  const entry = entries[idx]!;
  const isGrat = entry.kind === "gratitude";
  const desiredBase = isGrat
    ? gratitudeEntryPathSlug(entry)
    : journalEntryPathSlug({ ...entry, urlSlug: undefined });
  const taken = takenJournalSlugs(
    entries,
    isGrat ? "gratitude" : "freeform",
    entry.id,
  );
  const nextSlug = uniquifySlug(desiredBase, taken, entry.urlSlug);
  if (entry.urlSlug === nextSlug) {
    return { entries, entry };
  }
  const history = [...(entry.urlSlugHistory ?? [])];
  if (entry.urlSlug && !history.includes(entry.urlSlug)) {
    history.unshift(entry.urlSlug);
  }
  const updated: JournalEntry = {
    ...entry,
    urlSlug: nextSlug,
    urlSlugHistory: history.slice(0, 24),
  };
  const next = entries.slice();
  next[idx] = updated;
  return { entries: next, entry: updated };
}

export function findJournalEntryByPathSlug(
  entries: JournalEntry[],
  raw: string,
  kind: "journal" | "gratitude",
): JournalEntry | null {
  const key = decodeURIComponent(raw).trim().toLowerCase();
  if (!key) return null;
  const list = entries.filter((e) =>
    kind === "gratitude" ? e.kind === "gratitude" : e.kind !== "gratitude",
  );
  if (looksLikeUuid(key)) {
    return list.find((e) => e.id === key) ?? null;
  }
  return (
    list.find((e) => e.urlSlug?.toLowerCase() === key) ??
    list.find((e) =>
      (e.urlSlugHistory ?? []).some((h) => h.toLowerCase() === key),
    ) ??
    null
  );
}

export function journalEntryHref(entry: JournalEntry): string {
  if (entry.kind === "gratitude") {
    const slug = entry.urlSlug || gratitudeEntryPathSlug(entry);
    return `/journal/gratitude/${encodeURIComponent(slug)}`;
  }
  const slug = entry.urlSlug || journalEntryPathSlug(entry);
  return `/journal/${encodeURIComponent(slug)}`;
}

export function journalEntryHrefById(entryId: string): string {
  const entry = loadJournalStore().entries.find((e) => e.id === entryId);
  if (entry) return journalEntryHref(entry);
  return `/journal/entries/${encodeURIComponent(entryId)}`;
}

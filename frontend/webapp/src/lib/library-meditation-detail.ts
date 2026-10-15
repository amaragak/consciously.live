/**
 * Meditation detail page helpers — URL building / resolving, script chunks
 * (timed when the API returns `scriptChunks`, else plain-text split) and
 * "Made from" derivation.
 *
 * Route: `/meditate/library/:id` where `:id` is any single segment that is not
 * one of the Library tab segments (`creations`, `community`, `programs`).
 */
import {
  backgroundAudioStreamingKey,
  type BackgroundAudioItem,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import { parseMeditationCreationProvenance } from "@/lib/meditation-creation-provenance";

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

export type LibraryDetailFrom = "creations" | "community" | "programs";

export const LIBRARY_TAB_SEGMENTS: readonly LibraryDetailFrom[] = [
  "creations",
  "community",
  "programs",
];

export const LIBRARY_DETAIL_FROM_LABEL: Record<LibraryDetailFrom, string> = {
  creations: "My Creations",
  community: "Community",
  programs: "Programs",
};

export function isLibraryDetailFrom(
  raw: string | null | undefined,
): raw is LibraryDetailFrom {
  return raw === "creations" || raw === "community" || raw === "programs";
}

/** Same id the Reflect handoff uses (`s3Key` first). */
function detailIdFromItem(
  item: Pick<LibraryMeditationItem, "s3Key" | "id" | "sk">,
): string {
  return (item.s3Key || item.sk || item.id || "").trim();
}

export type LibraryDetailHrefOpts = {
  /** Tab the user came from; default creations. */
  from?: LibraryDetailFrom;
  /** Program URL slug — lets Back return to the open program. */
  program?: string | null;
};

export function libraryMeditationDetailHrefById(
  id: string,
  opts?: LibraryDetailHrefOpts,
): string {
  const params = new URLSearchParams();
  const from = opts?.from ?? "creations";
  if (from !== "creations") params.set("from", from);
  if (from === "programs" && opts?.program) params.set("program", opts.program);
  const qs = params.toString();
  return `/meditate/library/${encodeURIComponent(id.trim())}${qs ? `?${qs}` : ""}`;
}

export function libraryMeditationDetailHref(
  item: Pick<LibraryMeditationItem, "s3Key" | "id" | "sk">,
  opts?: LibraryDetailHrefOpts,
): string {
  return libraryMeditationDetailHrefById(detailIdFromItem(item), opts);
}

/** Decoded `:id` when the path is a detail URL, else null. */
export function libraryDetailIdFromPathname(
  pathname: string | null | undefined,
): string | null {
  const parts = (pathname ?? "").split("/").filter(Boolean);
  const i = parts.indexOf("library");
  if (i < 0) return null;
  const seg = parts[i + 1];
  if (!seg) return null;
  if ((LIBRARY_TAB_SEGMENTS as readonly string[]).includes(seg)) return null;
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

/** Match `id`, `sk` or `s3Key` (raw segment first, then decoded). */
export function findLibraryItemByDetailId<T extends LibraryMeditationItem>(
  list: readonly T[],
  rawId: string,
): T | null {
  const candidates = new Set<string>();
  const t = rawId.trim();
  if (t) candidates.add(t);
  try {
    const d = decodeURIComponent(t);
    if (d) candidates.add(d);
  } catch {
    /* keep raw */
  }
  if (candidates.size === 0) return null;
  for (const x of list) {
    if (x.isDraft === true) continue;
    if (
      (x.id && candidates.has(x.id)) ||
      (x.sk && candidates.has(x.sk)) ||
      (x.s3Key && candidates.has(x.s3Key))
    ) {
      return x;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Breadcrumb context (set by the detail page, read by the top bar)    */
/* ------------------------------------------------------------------ */

/** Tab the user opened detail from — drives Meditate › {leaf} crumb. */
let detailFromCrumb: { label: string; href: string } | null = null;
const detailCrumbListeners = new Set<() => void>();

function notifyDetailCrumbListeners() {
  for (const fn of detailCrumbListeners) fn();
}

/** Leaf crumb for detail (e.g. My Creations → /meditate/library/creations). */
export function setLibraryDetailFromCrumb(
  crumb: { label: string; href: string } | null,
): void {
  const next = crumb
    ? { label: crumb.label.trim(), href: crumb.href.trim() }
    : null;
  if (!next?.label || !next.href) {
    if (detailFromCrumb == null) return;
    detailFromCrumb = null;
    notifyDetailCrumbListeners();
    return;
  }
  if (
    detailFromCrumb?.label === next.label &&
    detailFromCrumb?.href === next.href
  ) {
    return;
  }
  detailFromCrumb = next;
  notifyDetailCrumbListeners();
}

export function peekLibraryDetailFromCrumb(): {
  label: string;
  href: string;
} | null {
  return detailFromCrumb;
}

/** Subscribe to detail-from-crumb changes (top-bar breadcrumb rebuild). */
export function subscribeLibraryDetailTitle(fn: () => void): () => void {
  detailCrumbListeners.add(fn);
  return () => {
    detailCrumbListeners.delete(fn);
  };
}

/* ------------------------------------------------------------------ */
/* Script chunks                                                       */
/* ------------------------------------------------------------------ */

export type ScriptChunk = {
  index: number;
  section?: string;
  text: string;
  /** Present when the library row stores timed chunks. */
  startMs?: number;
  endMs?: number;
  pauseAfterMs?: number;
};

/** Prefer API `scriptChunks` when every entry is timed; else plain split. */
export function scriptChunksFromLibraryItem(
  item: Pick<LibraryMeditationItem, "scriptText" | "scriptChunks">,
): ScriptChunk[] {
  const raw = item.scriptChunks;
  if (Array.isArray(raw) && raw.length > 0) {
    const timed: ScriptChunk[] = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (!c || typeof c !== "object") break;
      const text = typeof c.text === "string" ? c.text.trim() : "";
      const startMs =
        typeof c.startMs === "number" && Number.isFinite(c.startMs)
          ? Math.max(0, Math.round(c.startMs))
          : NaN;
      const endMs =
        typeof c.endMs === "number" && Number.isFinite(c.endMs)
          ? Math.max(0, Math.round(c.endMs))
          : NaN;
      if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) break;
      timed.push({
        index: typeof c.index === "number" ? c.index : i,
        text,
        startMs,
        endMs: Math.max(endMs, startMs),
        ...(typeof c.pauseAfterMs === "number" && c.pauseAfterMs > 0
          ? { pauseAfterMs: Math.round(c.pauseAfterMs) }
          : {}),
      });
    }
    if (timed.length === raw.length && scriptChunksHaveTimings(timed)) {
      return timed;
    }
  }
  return scriptChunksFromPlainText(item.scriptText);
}

const PAUSE_MARKER_RE = /\[\[PAUSE\s+[^\]]+\]\]/gi;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/;

function cleanChunkText(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/**
 * Split a plain script into paragraph chunks. Blank lines and `[[PAUSE …]]`
 * markers end a chunk; markdown `#` headings become the `section` of the
 * chunks that follow. No timings are invented — pause lengths and start/end
 * times come from the backend later (Phase B).
 */
export function scriptChunksFromPlainText(
  scriptText: string | null | undefined,
): ScriptChunk[] {
  const src = (scriptText ?? "").replace(/\r\n?/g, "\n");
  if (!src.trim()) return [];

  const chunks: ScriptChunk[] = [];
  let section: string | undefined;

  for (const block of src.split(/\n\s*\n/)) {
    for (const piece of block.replace(PAUSE_MARKER_RE, "\u0000").split("\u0000")) {
      const lines = piece.split("\n");
      const body: string[] = [];
      for (const line of lines) {
        const h = HEADING_RE.exec(line);
        if (h?.[1]) {
          const text = cleanChunkText(body.join("\n"));
          if (text) {
            chunks.push({ index: chunks.length, section, text });
            body.length = 0;
          }
          section = cleanChunkText(h[1]) || section;
        } else {
          body.push(line);
        }
      }
      const text = cleanChunkText(body.join("\n"));
      if (text) chunks.push({ index: chunks.length, section, text });
    }
  }
  return chunks;
}

export function scriptWordCount(chunks: readonly ScriptChunk[]): number {
  let n = 0;
  for (const c of chunks) {
    const t = c.text.trim();
    if (t) n += t.split(/\s+/).filter(Boolean).length;
  }
  return n;
}

/** Timestamps / Follow along / active line / seek only when every chunk is timed. */
export function scriptChunksHaveTimings(
  chunks: readonly ScriptChunk[],
): boolean {
  return (
    chunks.length > 0 &&
    chunks.every((c) => typeof c.startMs === "number" && c.startMs >= 0)
  );
}

export function scriptChunksPlainText(chunks: readonly ScriptChunk[]): string {
  return chunks.map((c) => c.text).join("\n\n");
}

export function formatChunkClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Made from / Sound & voice                                           */
/* ------------------------------------------------------------------ */

export type MeditationMadeFrom = {
  brief: string | null;
  tags: string[];
};

function shortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Original brief + context tags from the stored creation provenance.
 * Returns null when nothing real is stored (older meditations).
 */
export function meditationMadeFrom(
  item: LibraryMeditationItem,
): MeditationMadeFrom | null {
  const p =
    parseMeditationCreationProvenance(item.creationProvenance) ??
    item.creationProvenance ??
    null;
  if (!p) return null;

  const firstUser = p.messages?.find(
    (m) => m.role === "user" && m.variant !== "script" && m.text.trim(),
  )?.text;
  const briefRaw =
    p.directPrompt?.trim() ||
    p.journalGuidance?.trim() ||
    p.manifest?.guidance?.trim() ||
    p.manifest?.dreamText?.trim() ||
    firstUser?.trim() ||
    "";
  const brief = briefRaw ? briefRaw.replace(/\s+/g, " ").slice(0, 400) : null;

  const tags: string[] = [];
  const style = (p.meditationStyle ?? item.meditationStyle)?.trim();
  if (p.creationPath === "fromProgram") {
    const program = item.meditationType?.trim();
    if (program) tags.push(`Program · ${program}`);
  } else if (style && style.toLowerCase() !== "general") {
    tags.push(`Style · ${style}`);
  }
  const entry = p.journalEntries?.[0];
  if (entry) {
    const d = shortDate(entry.createdAt);
    tags.push(d ? `Journal · ${d}` : "Journal entry");
  }
  const goal = p.manifest?.focusGoalTitle?.trim() || p.manifest?.lifeAreaTitle?.trim();
  if (goal) tags.push(`Manifest · ${goal}`);

  if (!brief && tags.length === 0) return null;
  return { brief, tags };
}

type BackgroundLists = {
  nature: readonly BackgroundAudioItem[];
  music: readonly BackgroundAudioItem[];
  drums: readonly BackgroundAudioItem[];
  noise: readonly BackgroundAudioItem[];
  compositions: readonly BackgroundAudioItem[];
};

/** Human names for the beds this meditation plays over (null when unknown). */
export function meditationSoundscapeName(
  item: LibraryMeditationItem,
  lists: BackgroundLists,
): string | null {
  const all = [
    ...lists.compositions,
    ...lists.music,
    ...lists.nature,
    ...lists.drums,
    ...lists.noise,
  ];
  const keys = [
    item.backgroundMusicKey,
    item.backgroundNatureKey,
    item.backgroundDrumsKey,
    item.backgroundNoiseKey,
  ];
  const names: string[] = [];
  for (const raw of keys) {
    const k = raw?.trim();
    if (!k) continue;
    const stream = backgroundAudioStreamingKey(k);
    const hit = all.find(
      (x) => x.key === k || backgroundAudioStreamingKey(x.key) === stream,
    );
    const name = hit?.name?.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  if (names.length === 0) return null;
  return names.slice(0, 3).join(" + ");
}

export function plainFromHtml(html: string, max = 80): string {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function formatRelativeDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round(
    (startToday.getTime() - startThat.getTime()) / 86_400_000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) {
    return d.toLocaleDateString(undefined, { weekday: "short" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Journal link table: an entry can point at meditations, life areas, and Heal items.
 * Reflections on a meditation made from a Heal item or life area are found through
 * that meditation's stored context (heal job link or lifeAreaId).
 */
import { readAccountLocalStorage } from "@/lib/account-scoped-storage";
import { healRelative } from "@/lib/heal-store";
import {
  loadJournalStoreRaw,
  stripHtmlToText,
  subscribeJournalStore,
  type JournalEntry,
  type JournalLink,
  type JournalMeditationSnapshot,
  type JournalMeditationSource,
} from "@/lib/journal-storage";
import { journalEntriesLinkedToMeditation } from "@/lib/journal-meditation-reflect";
import { listLibraryMeditations, type LibraryMeditationItem } from "@/lib/medimade-api";

const HEAL_MEDITATION_LINKS_KEY = "mm_heal_meditation_links_v1";

export type MeditationOrigin = {
  meditationId: string;
  jobId: string | null;
  title: string;
  healItemId: string | null;
  lifeAreaId: string | null;
};

type OriginMap = Map<string, MeditationOrigin>;

let originCache: OriginMap | null = null;
let originInflight: Promise<OriginMap> | null = null;
const originListeners = new Set<() => void>();

function healJobs(): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof window === "undefined") return out;
  try {
    const raw = readAccountLocalStorage(HEAL_MEDITATION_LINKS_KEY);
    if (!raw) return out;
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return out;
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const jobId = typeof (row as { jobId?: string }).jobId === "string"
        ? (row as { jobId: string }).jobId.trim()
        : "";
      const healItemId = typeof (row as { healItemId?: string }).healItemId === "string"
        ? (row as { healItemId: string }).healItemId.trim()
        : "";
      if (jobId && healItemId) out.set(jobId, healItemId);
    }
  } catch {
    /* */
  }
  return out;
}

function indexItem(map: OriginMap, item: LibraryMeditationItem, jobs: Map<string, string>) {
  const meditationId = (item.s3Key || item.sk || item.id || "").trim();
  if (!meditationId) return;
  const jobId = item.jobId?.trim() || null;
  const origin: MeditationOrigin = {
    meditationId,
    jobId,
    title: item.title?.trim() || "Meditation",
    healItemId: (jobId && jobs.get(jobId)) || null,
    lifeAreaId: item.lifeAreaId?.trim() || null,
  };
  for (const key of [meditationId, item.s3Key, item.sk, item.id, jobId]) {
    const id = key?.trim();
    if (id) map.set(id, origin);
  }
}

export function peekMeditationOrigins(): OriginMap | null {
  return originCache;
}

export function ensureMeditationOrigins(): Promise<OriginMap> {
  if (originCache) return Promise.resolve(originCache);
  if (originInflight) return originInflight;
  originInflight = listLibraryMeditations()
    .then((items) => {
      const map: OriginMap = new Map();
      const jobs = healJobs();
      for (const item of items) indexItem(map, item, jobs);
      originCache = map;
      originInflight = null;
      for (const fn of originListeners) fn();
      return map;
    })
    .catch(() => {
      originInflight = null;
      originCache = originCache ?? new Map();
      return originCache;
    });
  return originInflight;
}

export function subscribeMeditationOrigins(fn: () => void): () => void {
  originListeners.add(fn);
  void ensureMeditationOrigins();
  return () => originListeners.delete(fn);
}

export function entryLinks(entry: JournalEntry): JournalLink[] {
  return entry.links ?? [];
}

export function linksOfType(
  entry: JournalEntry,
  targetType: JournalLink["targetType"],
): JournalLink[] {
  return entryLinks(entry).filter((link) => link.targetType === targetType);
}

export function journalPlain(entry: JournalEntry): string {
  return stripHtmlToText(entry.contentHtml || "").replace(/\s+/g, " ").trim();
}

export function journalFirstLine(entry: JournalEntry): string {
  return journalPlain(entry);
}

export function journalHref(entry: JournalEntry): string {
  return entry.kind === "gratitude"
    ? `/journal/my/gratitudes/${encodeURIComponent(entry.id)}`
    : `/journal/my/${encodeURIComponent(entry.id)}`;
}

/** New Journal entry with a Heal item or life area already attached. */
export function journalNewEntryHref(input: {
  targetType: "heal_item" | "life_area";
  targetId: string;
  label: string;
}): string {
  const params = new URLSearchParams({ new: "1" });
  if (input.targetType === "heal_item") {
    params.set("heal", input.targetId);
    if (input.label.trim()) params.set("healTitle", input.label.trim());
  } else {
    params.set("area", input.targetId);
    if (input.label.trim()) params.set("areaTitle", input.label.trim());
  }
  return `/journal/my?${params.toString()}`;
}

function whenLabel(iso: string): string {
  const label = healRelative(iso);
  if (!label) return "";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function journalContextDate(iso: string): string {
  return whenLabel(iso);
}

export function newJournalLink(input: {
  entryId: string;
  targetType: JournalLink["targetType"];
  targetId: string;
  label?: string;
  reflecting?: boolean;
  meditationSource?: JournalMeditationSource;
  meditationSnapshot?: JournalMeditationSnapshot;
}): JournalLink {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `jl_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
      : `jl_${Date.now().toString(36)}`;
  return {
    id,
    entryId: input.entryId,
    targetType: input.targetType,
    targetId: input.targetId,
    createdAt: new Date().toISOString(),
    ...(input.label?.trim() ? { label: input.label.trim() } : {}),
    ...(input.reflecting ? { reflecting: true } : {}),
    ...(input.meditationSource ? { meditationSource: input.meditationSource } : {}),
    ...(input.meditationSnapshot ? { meditationSnapshot: input.meditationSnapshot } : {}),
  };
}

/** Replace the entry's links with a picker selection, keeping Reflect flags. */
export function entryWithLinks(
  entry: JournalEntry,
  next: JournalLink[],
): Pick<JournalEntry, "links" | "meditationId" | "meditationSource" | "meditationSnapshot"> {
  const links = next.length ? next : undefined;
  const primary =
    next.find((link) => link.targetType === "meditation" && link.reflecting) ??
    next.find((link) => link.targetType === "meditation");
  return {
    links,
    meditationId: primary?.targetId,
    meditationSource: primary?.meditationSource,
    meditationSnapshot: primary?.meditationSnapshot,
  };
}

export function entriesForTarget(
  targetType: JournalLink["targetType"],
  targetId: string,
  entries: JournalEntry[] = loadJournalStoreRaw().entries,
): JournalEntry[] {
  const id = targetId.trim();
  if (!id) return [];
  return entries
    .filter((entry) =>
      entryLinks(entry).some(
        (link) => link.targetType === targetType && link.targetId === id,
      ),
    )
    .sort(
      (a, b) =>
        Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt),
    );
}

export type HealJournalRow = {
  entry: JournalEntry;
  mode: "journal" | "reflection";
  at: string;
  meditationTitle: string | null;
};

export function journalRowsForHealItem(itemId: string): HealJournalRow[] {
  const id = itemId.trim();
  if (!id) return [];
  const origins = originCache;
  const rows: HealJournalRow[] = [];
  const seen = new Set<string>();
  for (const entry of loadJournalStoreRaw().entries) {
    const direct = entryLinks(entry).some(
      (link) => link.targetType === "heal_item" && link.targetId === id,
    );
    const reflection = entryLinks(entry).find((link) => {
      if (link.targetType !== "meditation") return false;
      return origins?.get(link.targetId)?.healItemId === id;
    });
    if (!direct && !reflection) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const mode = reflection ? "reflection" : "journal";
    rows.push({
      entry,
      mode,
      at: entry.updatedAt || entry.createdAt,
      meditationTitle: reflection
        ? origins?.get(reflection.targetId)?.title || reflection.label || reflection.meditationSnapshot?.title || null
        : null,
    });
  }
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export type LifeAreaJournalRow = {
  entry: JournalEntry;
  mode: "journal" | "reflection";
  at: string;
  line: string;
};

export function journalRowsForLifeArea(lifeAreaId: string): LifeAreaJournalRow[] {
  const id = lifeAreaId.trim();
  if (!id) return [];
  const origins = originCache;
  const rows: LifeAreaJournalRow[] = [];
  for (const entry of loadJournalStoreRaw().entries) {
    const reflection = entryLinks(entry).find((link) => {
      if (link.targetType !== "meditation" || !link.reflecting) return false;
      return origins?.get(link.targetId)?.lifeAreaId === id;
    });
    const direct =
      !reflection &&
      entryLinks(entry).some(
        (link) => link.targetType === "life_area" && link.targetId === id,
      );
    if (!reflection && !direct) continue;
    const plain = journalFirstLine(entry);
    const title = entry.title.trim();
    const untitled =
      !title || title === "Untitled entry" || title === "New entry" || plain.startsWith(title.replace(/…$/, ""));
    rows.push({
      entry,
      mode: reflection ? "reflection" : "journal",
      at: entry.updatedAt || entry.createdAt,
      line: reflection || untitled ? plain : `${title} · ${plain}`,
    });
  }
  return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function reflectionsForMeditation(meditationId: string): JournalEntry[] {
  return entriesForTarget("meditation", meditationId);
}

/** Every journal entry attached to this meditation, reflections included, newest first. */
export function journalRowsForMeditation(meditationId: string): HealJournalRow[] {
  const id = meditationId.trim();
  if (!id) return [];
  return journalEntriesLinkedToMeditation(id)
    .map((entry) => {
      const link = entryLinks(entry).find(
        (row) => row.targetType === "meditation" && row.targetId === id,
      );
      const reflection = Boolean(link?.reflecting) || (!link && entry.meditationId === id);
      return {
        entry,
        mode: reflection ? ("reflection" as const) : ("journal" as const),
        at: entry.updatedAt || entry.createdAt,
        meditationTitle:
          link?.label ||
          link?.meditationSnapshot?.title ||
          entry.meditationSnapshot?.title ||
          null,
      };
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Linked journal writing for Heal AI, newest first. Caller applies the word budget. */
export function journalContextForHealItem(itemId: string): string {
  void ensureMeditationOrigins();
  const rows = journalRowsForHealItem(itemId).slice(0, 8);
  if (!rows.length) return "";
  return rows
    .map((row) => {
      const title = row.entry.title.trim();
      const body = journalPlain(row.entry);
      const kind = row.mode === "reflection" ? "Reflection" : "Journal entry";
      return `${kind}${title ? `: ${title}` : ""}\n${body}`;
    })
    .filter((block) => block.trim())
    .join("\n\n");
}

export function capWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

export function subscribeJournalEntries(fn: () => void): () => void {
  return subscribeJournalStore(fn);
}

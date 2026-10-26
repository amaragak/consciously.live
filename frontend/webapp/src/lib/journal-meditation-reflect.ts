/**
 * Reflect-on-meditation: handoff + journal entry selectors.
 */
import {
  loadJournalStoreRaw,
  readJournalStoreSnapshot,
  type JournalEntry,
  type JournalMeditationSnapshot,
  type JournalMeditationSource,
} from "@/lib/journal-storage";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import type { LibraryActiveTrack } from "@/components/library-audio-strip";
import type { LibraryMeditationItem } from "@/lib/medimade-api";
import { libraryMeditationCategoryLabel } from "@/lib/medimade-api";
import {
  libraryMeditationDetailHref,
  libraryMeditationDetailHrefById,
} from "@/lib/library-meditation-detail";

const REFLECT_HANDOFF_KEY = "mm_journal_reflect_meditation_v1";

export type ReflectMeditationHandoff = {
  meditationId: string;
  meditationSource: JournalMeditationSource;
  snapshot: JournalMeditationSnapshot;
};

export function isLibraryMeditationTrack(
  track: LibraryActiveTrack | null | undefined,
): boolean {
  if (!track) return false;
  if (track.ambientOnly) return false;
  const k = track.s3Key ?? "";
  if (!k) return false;
  if (k.startsWith("create:sound:")) return false;
  if (k.startsWith("focus:ambient:")) return false;
  if (k.startsWith("sounds:")) return false;
  if (k.startsWith("blog:audio:")) return false;
  return true;
}

export function meditationIdFromLibraryItem(
  item: Pick<LibraryMeditationItem, "s3Key" | "id" | "sk">,
): string {
  return (item.s3Key || item.sk || item.id || "").trim();
}

export function reflectHandoffFromLibraryItem(
  item: LibraryMeditationItem,
  source: JournalMeditationSource,
): ReflectMeditationHandoff | null {
  const meditationId = meditationIdFromLibraryItem(item);
  if (!meditationId) return null;
  // Opens the meditation detail page, back-linked to the tab it came from.
  const openHref = libraryMeditationDetailHref(item, {
    from:
      source === "community"
        ? "community"
        : source === "program"
          ? "programs"
          : "creations",
  });
  return {
    meditationId,
    meditationSource: source,
    snapshot: {
      title: item.title?.trim() || "Meditation",
      coverImageUrl: item.coverImageUrl ?? null,
      speakerName: item.speakerName ?? null,
      styleLabel: libraryMeditationCategoryLabel(item) || null,
      durationSeconds: item.durationSeconds ?? null,
      openHref,
    },
  };
}

export function reflectHandoffFromTrack(
  track: LibraryActiveTrack,
  source: JournalMeditationSource = "own",
): ReflectMeditationHandoff | null {
  if (!isLibraryMeditationTrack(track)) return null;
  const meditationId = track.s3Key.trim();
  if (!meditationId) return null;
  return {
    meditationId,
    meditationSource: source,
    snapshot: {
      title: track.title?.trim() || "Meditation",
      coverImageUrl: track.coverImageUrl ?? null,
      speakerName: track.speakerName ?? null,
      styleLabel: null,
      durationSeconds: track.durationSeconds ?? null,
      openHref: libraryMeditationDetailHrefById(meditationId),
    },
  };
}

export function armReflectMeditationHandoff(
  handoff: ReflectMeditationHandoff,
): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(REFLECT_HANDOFF_KEY, JSON.stringify(handoff));
  } catch {
    /* */
  }
}

export function consumeReflectMeditationHandoff(): ReflectMeditationHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(REFLECT_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(REFLECT_HANDOFF_KEY);
    const parsed = JSON.parse(raw) as ReflectMeditationHandoff;
    if (
      !parsed ||
      typeof parsed.meditationId !== "string" ||
      !parsed.meditationId.trim() ||
      !parsed.snapshot ||
      typeof parsed.snapshot.title !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const REFLECTION_TITLE_PREFIX = "Reflection: ";

/** Drop a stored "Reflection: " prefix. Titles are the meditation name on their own. */
export function stripReflectionTitlePrefix(title: string): string {
  if (!title.startsWith(REFLECTION_TITLE_PREFIX)) return title;
  return title.slice(REFLECTION_TITLE_PREFIX.length).trim();
}

export function withoutReflectionTitlePrefix<T extends { title: string }>(
  entries: T[],
): { entries: T[]; changed: boolean } {
  let changed = false;
  const next = entries.map((entry) => {
    const title = stripReflectionTitlePrefix(entry.title);
    if (title === entry.title) return entry;
    changed = true;
    return { ...entry, title: title || "Untitled entry" };
  });
  return { entries: next, changed };
}

export function reflectionTitleForMeditation(title: string): string {
  return stripReflectionTitlePrefix(title.trim()) || "Meditation";
}

export function journalEntriesLinkedToMeditation(
  meditationId: string,
  entries?: JournalEntry[],
): JournalEntry[] {
  const id = meditationId.trim();
  if (!id) return [];
  const list =
    entries ??
    (typeof window !== "undefined"
      ? readJournalStoreSnapshot({
          signedIn: isMedimadeSessionActive(),
        }).entries
      : loadJournalStoreRaw().entries);
  return list.filter(
    (e) =>
      e.meditationId === id ||
      (e.links ?? []).some(
        (link) => link.targetType === "meditation" && link.targetId === id,
      ),
  );
}

/**
 * One reflection entry per meditation — reopen the most recently updated
 * linked entry when Reflect is pressed again.
 */
export function findReflectionEntryForMeditation(
  meditationId: string,
  entries?: JournalEntry[],
): JournalEntry | null {
  const linked = journalEntriesLinkedToMeditation(meditationId, entries);
  if (linked.length === 0) return null;
  let best = linked[0]!;
  let bestT = Date.parse(best.updatedAt || best.createdAt) || 0;
  for (let i = 1; i < linked.length; i++) {
    const e = linked[i]!;
    const t = Date.parse(e.updatedAt || e.createdAt) || 0;
    if (t >= bestT) {
      best = e;
      bestT = t;
    }
  }
  return best;
}

export function reflectionCountForMeditation(
  meditationId: string,
  entries?: JournalEntry[],
): number {
  return journalEntriesLinkedToMeditation(meditationId, entries).length;
}

/** Journal route that creates or reopens the reflection entry for a meditation. */
export function reflectMeditationJournalHref(): string {
  return "/journal/my?new=1&reflect=1";
}

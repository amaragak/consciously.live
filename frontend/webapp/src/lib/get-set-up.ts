/**
 * Dashboard “Get set up” checklist — auto-ticks from real app state; Skip is durable.
 */

import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import { loadAffirmations } from "@/lib/daily-affirmations";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import { loadIdeateManifestoStore } from "@/lib/ideate-manifesto";
import { loadIdeateVisionBoardStore } from "@/lib/ideate-vision-board";
import { draftIsEmpty, loadManifestoStoryStore } from "@/lib/manifesto-story";
import { isLibraryStoryItem } from "@/lib/manifesto-story-placement";
import { listLibraryMeditations } from "@/lib/medimade-api";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { ensureTracker } from "@/lib/tracker-items";
import {
  isDemoJournalEntry,
  loadJournalStoreRaw,
  withoutDemoJournalEntries,
} from "@/lib/journal-storage";

export const GET_SET_UP_CHANGED = "mm-get-set-up-changed";
const STORE_KEY = "mm_get_set_up_v1";
const HIDE_SESSION_KEY = "mm_get_set_up_hidden_visit";

export type GetSetUpItemId =
  | "manifesto"
  | "meditation"
  | "photo"
  | "story"
  | "first_step"
  | "affirmations"
  | "journal_import";

export const GET_SET_UP_ITEMS: GetSetUpItemId[] = [
  "manifesto",
  "meditation",
  "photo",
  "story",
  "first_step",
  "affirmations",
  "journal_import",
];

export type GetSetUpItemDef = {
  id: GetSetUpItemId;
  title: string;
  /** Short chip when done/skipped and space is tight. */
  chip: string;
  body: string;
  action: string;
  href: string;
};

type Store = {
  skipped: GetSetUpItemId[];
  /** Set when every item is done or skipped — panel never returns. */
  finishedAt: string | null;
};

function emptyStore(): Store {
  return { skipped: [], finishedAt: null };
}

function parseStore(raw: string | null): Store {
  if (!raw) return emptyStore();
  try {
    const o = JSON.parse(raw) as { skipped?: unknown; finishedAt?: unknown };
    const skipped = Array.isArray(o.skipped)
      ? o.skipped.filter((id): id is GetSetUpItemId =>
          GET_SET_UP_ITEMS.includes(id as GetSetUpItemId),
        )
      : [];
    return {
      skipped: [...new Set(skipped)],
      finishedAt: typeof o.finishedAt === "string" ? o.finishedAt : null,
    };
  } catch {
    return emptyStore();
  }
}

export function readGetSetUpStore(): Store {
  return parseStore(readAccountLocalStorage(STORE_KEY));
}

function writeGetSetUpStore(store: Store): void {
  writeAccountLocalStorage(STORE_KEY, JSON.stringify(store));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GET_SET_UP_CHANGED));
  }
}

export function skipGetSetUpItem(id: GetSetUpItemId): void {
  const store = readGetSetUpStore();
  if (store.skipped.includes(id)) return;
  const skipped = [...store.skipped, id];
  writeGetSetUpStore({ ...store, skipped });
}

export function isGetSetUpHiddenThisVisit(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(HIDE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function hideGetSetUpForVisit(): void {
  try {
    sessionStorage.setItem(HIDE_SESSION_KEY, "1");
    window.dispatchEvent(new Event(GET_SET_UP_CHANGED));
  } catch {
    /* */
  }
}

export function clearGetSetUpVisitHide(): void {
  try {
    sessionStorage.removeItem(HIDE_SESSION_KEY);
  } catch {
    /* */
  }
}

export function hasManifestoStatement(): boolean {
  return Boolean(loadIdeateManifestoStore().text.trim());
}

export function hasVisionReferencePhoto(): boolean {
  const ref = loadIdeateVisionBoardStore().selfReference;
  if (!ref) return false;
  return Boolean(ref.url || ref.key || ref.mediaId);
}

export function hasStoryStarted(): boolean {
  const store = loadManifestoStoryStore();
  if (store.versions.length > 0) return true;
  return !draftIsEmpty(store.draft);
}

export function hasAnyTrackerItem(): boolean {
  const store = ensureTracker(loadIdeateStore());
  return (store.trackerItems ?? []).length > 0;
}

export function hasAffirmationsEnabled(): boolean {
  return loadAffirmations().enabled === true;
}

export function hasJournalImportCompleted(): boolean {
  const entries = withoutDemoJournalEntries(loadJournalStoreRaw()).entries;
  return entries.some(
    (e) => !isDemoJournalEntry(e) && Boolean(e.importBatchId),
  );
}

export function firstLifeAreaTitle(): string | null {
  const dreams = loadIdeateStore()
    .dreams.filter((d) => !isDemoIdeateDream(d) && !d.completedAt)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  const title = dreams[0]?.title?.trim();
  return title || null;
}

export function firstLifeAreaId(): string | null {
  const dreams = loadIdeateStore()
    .dreams.filter((d) => !isDemoIdeateDream(d) && !d.completedAt)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  return dreams[0]?.id ?? null;
}

export function getSetUpItemDefs(lifeAreaTitle: string | null): GetSetUpItemDef[] {
  const area = lifeAreaTitle?.trim() || "your first life area";
  return [
    {
      id: "manifesto",
      title: "Your manifesto",
      chip: "Manifesto",
      body: "The one sentence you want to live by.",
      action: "Write manifesto",
      href: "/manifest?write=1",
    },
    {
      id: "meditation",
      title: "Your first meditation",
      chip: "First meditation",
      body: "A short practice from what matters to you.",
      action: "Create",
      href: "/meditate/create",
    },
    {
      id: "photo",
      title: "Add a photo of yourself",
      chip: "Photo",
      body: "Your vision board shows you, living the life you described.",
      action: "Add photo",
      href: "/manifest/vision-board?reference=1",
    },
    {
      id: "story",
      title: "Write your story",
      chip: "Story",
      body: "A story of your future self, narrated to you at night.",
      action: "Start story",
      href: "/manifest/story?setup=1",
    },
    {
      id: "first_step",
      title: "Set a first step",
      chip: "First step",
      body: `A next step for ${area}, ready to work on in Focus.`,
      action: "Add a step",
      href: "/manifest/tracker?add=1",
    },
    {
      id: "affirmations",
      title: "Daily affirmations",
      chip: "Affirmations",
      body: "Eleven lines a day from your manifesto. Off until you turn it on.",
      action: "Preview",
      href: "/manifest?affirmations=open",
    },
    {
      id: "journal_import",
      title: "Bring in your old journal",
      chip: "Journal",
      body: "From Day One, PDF, text files or photos of handwritten pages.",
      action: "Import",
      href: "/journal/import",
    },
  ];
}

export type GetSetUpDoneMap = Record<GetSetUpItemId, boolean>;

export type GetSetUpSnapshot = {
  done: GetSetUpDoneMap;
  skipped: Set<GetSetUpItemId>;
  finished: boolean;
  hiddenThisVisit: boolean;
  progress: number;
  remaining: GetSetUpItemDef[];
  chips: { id: GetSetUpItemId; label: string; kind: "done" | "skipped" }[];
  lifeAreaTitle: string | null;
};

export function emptyDoneMap(): GetSetUpDoneMap {
  return {
    manifesto: false,
    meditation: false,
    photo: false,
    story: false,
    first_step: false,
    affirmations: false,
    journal_import: false,
  };
}

/** Synchronous detections (meditation may still be loading from the library API). */
export function detectGetSetUpDoneSync(
  hasMeditation: boolean,
): GetSetUpDoneMap {
  return {
    manifesto: hasManifestoStatement(),
    meditation: hasMeditation,
    photo: hasVisionReferencePhoto(),
    story: hasStoryStarted(),
    first_step: hasAnyTrackerItem(),
    affirmations: hasAffirmationsEnabled(),
    journal_import: hasJournalImportCompleted(),
  };
}

export async function detectHasMeditation(): Promise<boolean> {
  if (!isMedimadeSessionActive()) return false;
  try {
    const items = await listLibraryMeditations();
    return items.some(
      (m) =>
        m.catalogued &&
        m.archived !== true &&
        m.isDraft !== true &&
        !isLibraryStoryItem(m),
    );
  } catch {
    return false;
  }
}

export function buildGetSetUpSnapshot(
  done: GetSetUpDoneMap,
): GetSetUpSnapshot | null {
  const store = readGetSetUpStore();
  if (store.finishedAt) return null;

  const skipped = new Set(store.skipped);
  const lifeAreaTitle = firstLifeAreaTitle();
  const defs = getSetUpItemDefs(lifeAreaTitle);

  let progress = 0;
  const chips: GetSetUpSnapshot["chips"] = [];
  const remaining: GetSetUpItemDef[] = [];

  for (const def of defs) {
    const isDone = done[def.id];
    const isSkipped = skipped.has(def.id);
    if (isDone || isSkipped) {
      progress += 1;
      chips.push({
        id: def.id,
        label: def.title,
        kind: isDone ? "done" : "skipped",
      });
    } else {
      remaining.push(def);
    }
  }

  if (progress >= GET_SET_UP_ITEMS.length) {
    writeGetSetUpStore({
      ...store,
      finishedAt: new Date().toISOString(),
    });
    return null;
  }

  if (isGetSetUpHiddenThisVisit()) {
    return {
      done,
      skipped,
      finished: false,
      hiddenThisVisit: true,
      progress,
      remaining,
      chips,
      lifeAreaTitle,
    };
  }

  return {
    done,
    skipped,
    finished: false,
    hiddenThisVisit: false,
    progress,
    remaining,
    chips,
    lifeAreaTitle,
  };
}

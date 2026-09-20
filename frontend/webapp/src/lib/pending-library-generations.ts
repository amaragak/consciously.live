import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

/** Client-side placeholders while a meditation audio job is running. */

export type PendingLibraryGeneration = {
  jobId: string;
  createdAt: string;
  title: string;
  description: string | null;
  meditationStyle: string | null;
  speakerName: string | null;
  speakerModelId: string | null;
  status?: "pending" | "running" | "failed";
  error?: string | null;
  /** Set once the job reports an audio key (used to swap pending → catalogued). */
  audioKey?: string | null;
  /** Ideate life-area this generation was started from. */
  lifeAreaId?: string | null;
  /** Ideate task (subtask) for Focus preflight tone-setting meditations. */
  focusSubtaskId?: string | null;
};

export const PENDING_LIBRARY_GENERATIONS_LS_KEY =
  "mm_pending_library_generations_v1";

export const PENDING_LIBRARY_GENERATIONS_CHANGED_EVENT =
  "mm-pending-library-generations-changed";

export function loadPendingGenerations(): PendingLibraryGeneration[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = readAccountLocalStorage(PENDING_LIBRARY_GENERATIONS_LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((x): x is PendingLibraryGeneration => {
      if (!x || typeof x !== "object") return false;
      const o = x as Record<string, unknown>;
      return (
        typeof o.jobId === "string" &&
        typeof o.createdAt === "string" &&
        typeof o.title === "string"
      );
    });
  } catch {
    return [];
  }
}

export function savePendingGenerations(next: PendingLibraryGeneration[]) {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(
      PENDING_LIBRARY_GENERATIONS_LS_KEY,
      JSON.stringify(next.slice(0, 20)),
    );
    window.dispatchEvent(new Event(PENDING_LIBRARY_GENERATIONS_CHANGED_EVENT));
  } catch {
    // ignore
  }
}

type CataloguedLibraryHit = {
  jobId?: string | null;
  s3Key?: string | null;
  catalogued?: boolean;
  isDraft?: boolean;
  archived?: boolean;
};

/** True when the library list already has the finished row for this job. */
export function libraryItemSatisfiesPending(
  item: CataloguedLibraryHit,
  pending: PendingLibraryGeneration,
): boolean {
  if (item.catalogued !== true || item.isDraft === true || item.archived === true) {
    return false;
  }
  const jobId = (item.jobId ?? "").trim();
  if (jobId && jobId === pending.jobId) return true;
  const audioKey = (pending.audioKey ?? "").trim();
  return Boolean(audioKey && (item.s3Key ?? "").trim() === audioKey);
}

export function pendingHasCataloguedItem(
  items: CataloguedLibraryHit[],
  pending: PendingLibraryGeneration,
): boolean {
  return items.some((x) => libraryItemSatisfiesPending(x, pending));
}

/** Keep generating cards on screen until the catalogued row is in `items`. */
export function retainUncataloguedPending(
  stored: PendingLibraryGeneration[],
  prev: PendingLibraryGeneration[],
  items: CataloguedLibraryHit[],
): PendingLibraryGeneration[] {
  const storedIds = new Set(stored.map((p) => p.jobId));
  const held = prev.filter(
    (p) =>
      !storedIds.has(p.jobId) &&
      p.status !== "failed" &&
      !pendingHasCataloguedItem(items, p),
  );
  return held.length === 0 ? stored : [...stored, ...held];
}

/** Prepend one pending job (deduped by jobId) — used by Create and homepage one-shot. */
export function appendPendingLibraryGeneration(
  entry: PendingLibraryGeneration,
): void {
  const next = [entry, ...loadPendingGenerations()].filter(
    (x, idx, arr) => arr.findIndex((y) => y.jobId === x.jobId) === idx,
  );
  savePendingGenerations(next);
  if (typeof window !== "undefined") {
    void import("@/lib/poll-pending-meditation-jobs").then((m) =>
      m.ensurePendingMeditationJobPoller(),
    );
  }
}

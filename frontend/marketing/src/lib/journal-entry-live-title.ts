/**
 * In-editor journal title draft for chrome that should update before save
 * (e.g. top-bar breadcrumbs).
 */

let live: { entryId: string; title: string } | null = null;
const listeners = new Set<() => void>();

export function setJournalEntryLiveTitle(
  entryId: string,
  title: string,
): void {
  const id = entryId.trim();
  if (!id) return;
  const next = { entryId: id, title };
  if (
    live &&
    live.entryId === next.entryId &&
    live.title === next.title
  ) {
    return;
  }
  live = next;
  listeners.forEach((l) => l());
}

export function clearJournalEntryLiveTitle(entryId?: string): void {
  if (!live) return;
  if (entryId && live.entryId !== entryId.trim()) return;
  live = null;
  listeners.forEach((l) => l());
}

export function getJournalEntryLiveTitle(entryId: string): string | null {
  if (!live || live.entryId !== entryId.trim()) return null;
  return live.title;
}

export function subscribeJournalEntryLiveTitle(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

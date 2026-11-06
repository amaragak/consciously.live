/**
 * Journal sync engine (web + native).
 *
 * - UI always renders from the local store.
 * - Writes go to an outbox and flush as PUT /journal/store.
 * - Pulls are deltas (changes + deletions since lastPulledAt) when possible.
 * - Merge by updatedAt; never overwrite unsent local edits.
 */

import {
  fetchJournalStoreDelta,
  getMedimadeApiBase,
  getMedimadeSessionJwt,
  putJournalStoreRemote,
} from "@/lib/medimade-api";
import {
  entriesForCloudPut,
  loadJournalStoreRaw,
  mergeRemoteJournalKeepingLocalOnly,
  pickNewerJournalEntry,
  promoteJournalEntryForCloud,
  saveJournalStore,
  withoutDemoJournalEntries,
  type JournalEntry,
  type JournalStoreV2,
} from "@/lib/journal-storage";

export type JournalCloudSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "offline"
  | "error";

export type JournalSyncReason =
  | "launch"
  | "foreground"
  | "reconnect"
  | "pull-to-refresh"
  | "journal-open"
  | "outbox-flush"
  | "manual";

export const JOURNAL_CLOUD_SAVE_EVENT = "mm-journal-cloud-save";
export const JOURNAL_SYNC_DIAGNOSTICS_EVENT = "mm-journal-sync-diagnostics";
export const JOURNAL_STORE_APPLIED_EVENT = "mm-journal-store-applied";
/** Native shell / tab visibility — JournalView flushes + re-pulls. */
export const JOURNAL_APP_FOREGROUND_EVENT = "consciously-app-foreground";
export const JOURNAL_APP_BACKGROUND_EVENT = "consciously-app-background";

const DIAG_KEY = "mm_journal_sync_diag_v1";
const OUTBOX_KEY = "mm_journal_outbox_v1";
/** Re-pull when opening Journal if the last successful pull is older than this. */
export const JOURNAL_PULL_STALE_MS = 60_000;

export type JournalSyncDiagnostics = {
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastPullAt: string | null;
};

type OutboxV1 = {
  v: 1;
  upsertIds: string[];
  deleteIds: string[];
};

let saveStatus: JournalCloudSaveStatus = "idle";
let syncInFlight: Promise<void> | null = null;
let bootHookInstalled = false;

function readDiag(): JournalSyncDiagnostics {
  if (typeof window === "undefined") {
    return { lastSyncAt: null, lastSyncError: null, lastPullAt: null };
  }
  try {
    const raw = window.localStorage.getItem(DIAG_KEY);
    if (!raw) return { lastSyncAt: null, lastSyncError: null, lastPullAt: null };
    const parsed = JSON.parse(raw) as Partial<JournalSyncDiagnostics>;
    return {
      lastSyncAt:
        typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : null,
      lastSyncError:
        typeof parsed.lastSyncError === "string" ? parsed.lastSyncError : null,
      lastPullAt:
        typeof parsed.lastPullAt === "string" ? parsed.lastPullAt : null,
    };
  } catch {
    return { lastSyncAt: null, lastSyncError: null, lastPullAt: null };
  }
}

function writeDiag(next: JournalSyncDiagnostics): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DIAG_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(JOURNAL_SYNC_DIAGNOSTICS_EVENT, { detail: next }),
    );
  } catch {
    /* */
  }
}

function readOutbox(): OutboxV1 {
  if (typeof window === "undefined") {
    return { v: 1, upsertIds: [], deleteIds: [] };
  }
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    if (!raw) return { v: 1, upsertIds: [], deleteIds: [] };
    const parsed = JSON.parse(raw) as Partial<OutboxV1>;
    const upsertIds = Array.isArray(parsed.upsertIds)
      ? parsed.upsertIds.filter((x): x is string => typeof x === "string")
      : [];
    const deleteIds = Array.isArray(parsed.deleteIds)
      ? parsed.deleteIds.filter((x): x is string => typeof x === "string")
      : [];
    return { v: 1, upsertIds: [...new Set(upsertIds)], deleteIds: [...new Set(deleteIds)] };
  } catch {
    return { v: 1, upsertIds: [], deleteIds: [] };
  }
}

function writeOutbox(next: OutboxV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
}

function outboxHas(id: string): boolean {
  const box = readOutbox();
  return box.upsertIds.includes(id) || box.deleteIds.includes(id);
}

export function getJournalCloudSaveStatus(): JournalCloudSaveStatus {
  return saveStatus;
}

export function journalCloudSaveLabel(
  status: JournalCloudSaveStatus,
): string | null {
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved";
  if (status === "offline") return "Offline · will sync";
  if (status === "error") return "Couldn't save · retrying";
  return null;
}

export function setJournalCloudSaveStatus(
  next: JournalCloudSaveStatus,
): void {
  if (saveStatus === next) return;
  saveStatus = next;
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(JOURNAL_CLOUD_SAVE_EVENT, { detail: { status: next } }),
    );
  } catch {
    /* */
  }
}

export function getJournalSyncDiagnostics(): JournalSyncDiagnostics {
  return readDiag();
}

export function recordJournalPullOk(at = new Date().toISOString()): void {
  writeDiag({
    ...readDiag(),
    lastPullAt: at,
    lastSyncError: null,
  });
}

export function recordJournalSyncOk(): void {
  writeDiag({
    ...readDiag(),
    lastSyncAt: new Date().toISOString(),
    lastSyncError: null,
  });
  setJournalCloudSaveStatus(
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "offline"
      : "saved",
  );
}

export function recordJournalSyncError(message: string): void {
  const msg = message.trim().slice(0, 240) || "Sync failed";
  writeDiag({
    ...readDiag(),
    lastSyncError: msg,
  });
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;
  setJournalCloudSaveStatus(offline ? "offline" : "error");
}

/** Enqueue a local edit for cloud flush (does not write the store). */
export function enqueueJournalUpsert(entryId: string): void {
  if (!entryId) return;
  const box = readOutbox();
  const deleteIds = box.deleteIds.filter((id) => id !== entryId);
  const upsertIds = box.upsertIds.includes(entryId)
    ? box.upsertIds
    : [...box.upsertIds, entryId];
  writeOutbox({ v: 1, upsertIds, deleteIds });
  markJournalEntriesPendingSync([entryId]);
}

/** Enqueue a local delete for cloud flush. */
export function enqueueJournalDelete(entryId: string): void {
  if (!entryId) return;
  const box = readOutbox();
  const upsertIds = box.upsertIds.filter((id) => id !== entryId);
  const deleteIds = box.deleteIds.includes(entryId)
    ? box.deleteIds
    : [...box.deleteIds, entryId];
  writeOutbox({ v: 1, upsertIds, deleteIds });
  markJournalEntriesPendingSync([entryId]);
}

export function journalOutboxIsEmpty(): boolean {
  const box = readOutbox();
  return box.upsertIds.length === 0 && box.deleteIds.length === 0;
}

/** @deprecated use outbox helpers — kept for list “Not synced yet”. */
const PENDING_KEY = "mm_journal_pending_sync_v1";
let pendingIds = new Set<string>();

function loadPending(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const ids = JSON.parse(raw) as unknown;
    if (!Array.isArray(ids)) return;
    pendingIds = new Set(
      ids.filter((x): x is string => typeof x === "string" && x.trim().length > 0),
    );
  } catch {
    /* */
  }
}

function persistPending(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify([...pendingIds]));
  } catch {
    /* */
  }
}

if (typeof window !== "undefined") {
  loadPending();
}

export function markJournalEntriesPendingSync(ids: readonly string[]): void {
  let changed = false;
  for (const id of ids) {
    if (!id || pendingIds.has(id)) continue;
    pendingIds.add(id);
    changed = true;
  }
  if (changed) persistPending();
}

export function clearJournalEntriesPendingSync(ids?: readonly string[]): void {
  if (!ids) {
    if (pendingIds.size === 0) return;
    pendingIds = new Set();
    persistPending();
    return;
  }
  let changed = false;
  for (const id of ids) {
    if (pendingIds.delete(id)) changed = true;
  }
  if (changed) persistPending();
}

export function journalEntryNeedsSyncNote(entryId: string): boolean {
  return pendingIds.has(entryId) || outboxHas(entryId);
}

export function listPendingJournalSyncIds(): string[] {
  return [...new Set([...pendingIds, ...readOutbox().upsertIds, ...readOutbox().deleteIds])];
}

export function lastJournalPullAgeMs(): number | null {
  const at = readDiag().lastPullAt;
  if (!at) return null;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Date.now() - ms);
}

export function journalPullIsStale(maxAgeMs = JOURNAL_PULL_STALE_MS): boolean {
  const age = lastJournalPullAgeMs();
  if (age == null) return true;
  return age > maxAgeMs;
}

function notifyStoreApplied(store: JournalStoreV2): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(JOURNAL_STORE_APPLIED_EVENT, { detail: { store } }),
    );
  } catch {
    /* */
  }
}

function readLocalStore(): JournalStoreV2 {
  return withoutDemoJournalEntries(loadJournalStoreRaw());
}

/**
 * Apply a remote delta onto the local store without clobbering outbox edits.
 */
export function applyJournalDeltaToLocal(
  local: JournalStoreV2,
  delta: {
    changes: JournalEntry[];
    deletedIds: string[];
    activeEntryId?: string | null;
    folders?: JournalStoreV2["folders"];
  },
): JournalStoreV2 {
  const box = readOutbox();
  const protectedIds = new Set([...box.upsertIds, ...box.deleteIds]);
  const byId = new Map(local.entries.map((e) => [e.id, e]));

  for (const id of delta.deletedIds) {
    if (protectedIds.has(id)) continue; // unsent local edit/delete wins
    byId.delete(id);
  }

  for (const remote of delta.changes) {
    if (!remote?.id) continue;
    if (box.upsertIds.includes(remote.id) || box.deleteIds.includes(remote.id)) {
      // Unsent local edit — keep local row as-is.
      continue;
    }
    const existing = byId.get(remote.id);
    if (!existing) {
      byId.set(remote.id, remote);
      continue;
    }
    byId.set(remote.id, pickNewerJournalEntry(existing, remote));
  }

  const entries = [...byId.values()];
  const activeEntryId =
    delta.activeEntryId !== undefined
      ? delta.activeEntryId && entries.some((e) => e.id === delta.activeEntryId)
        ? delta.activeEntryId
        : local.activeEntryId && entries.some((e) => e.id === local.activeEntryId)
          ? local.activeEntryId
          : (entries[0]?.id ?? null)
      : local.activeEntryId && entries.some((e) => e.id === local.activeEntryId)
        ? local.activeEntryId
        : (entries[0]?.id ?? null);

  return {
    version: 2,
    activeEntryId,
    entries,
    ...(delta.folders?.length
      ? { folders: delta.folders }
      : local.folders?.length
        ? { folders: local.folders }
        : {}),
  };
}

async function pullAndMerge(): Promise<JournalStoreV2> {
  const since = readDiag().lastPullAt;
  const result = await fetchJournalStoreDelta({ since });
  let next = readLocalStore();

  if (result.kind === "full") {
    const local = readLocalStore();
    const box = readOutbox();
    if (result.store?.entries?.length) {
      next = mergeRemoteJournalKeepingLocalOnly(result.store, local.entries, {
        preferActiveId: local.activeEntryId,
      });
      const localById = new Map(local.entries.map((e) => [e.id, e]));
      // Never overwrite unsent local edits; keep pending deletes deleted.
      let entries = next.entries
        .filter((e) => !box.deleteIds.includes(e.id))
        .map((e) =>
          box.upsertIds.includes(e.id) ? (localById.get(e.id) ?? e) : e,
        );
      for (const id of box.upsertIds) {
        if (entries.some((e) => e.id === id)) continue;
        const loc = localById.get(id);
        if (loc) entries = [loc, ...entries];
      }
      next = {
        ...next,
        entries,
        activeEntryId:
          next.activeEntryId && entries.some((e) => e.id === next.activeEntryId)
            ? next.activeEntryId
            : (entries[0]?.id ?? null),
      };
    } else if (box.upsertIds.length || local.entries.length) {
      // Empty remote — keep local (outbox will upload).
      next = local;
    }
    recordJournalPullOk(result.serverTime);
  } else {
    next = applyJournalDeltaToLocal(next, result.delta);
    recordJournalPullOk(result.delta.serverTime);
  }

  saveJournalStore(next, { source: "journal-sync-pull" });
  notifyStoreApplied(next);
  return next;
}

async function flushOutbox(store: JournalStoreV2): Promise<void> {
  const box = readOutbox();
  if (box.upsertIds.length === 0 && box.deleteIds.length === 0) {
    // Still push if we have never synced meaningful cloud content? Only when dirty.
    return;
  }
  const promoted = {
    ...store,
    entries: store.entries.map(promoteJournalEntryForCloud),
  };
  const cloudEntries = entriesForCloudPut(promoted.entries);
  if (cloudEntries.length === 0 && promoted.entries.length > 0) {
    // Only empty drafts left — nothing to upload; clear outbox for drafts.
    writeOutbox({ v: 1, upsertIds: [], deleteIds: [] });
    clearJournalEntriesPendingSync();
    return;
  }
  if (cloudEntries.length === 0) {
    // Account wipe not supported via empty PUT.
    writeOutbox({ v: 1, upsertIds: [], deleteIds: [] });
    clearJournalEntriesPendingSync();
    return;
  }
  setJournalCloudSaveStatus("saving");
  const payload: JournalStoreV2 = {
    version: 2,
    activeEntryId: cloudEntries.some((e) => e.id === promoted.activeEntryId)
      ? promoted.activeEntryId
      : (cloudEntries[0]?.id ?? null),
    entries: cloudEntries,
    ...(promoted.folders?.length ? { folders: promoted.folders } : {}),
  };
  await putJournalStoreRemote(payload);
  writeOutbox({ v: 1, upsertIds: [], deleteIds: [] });
  clearJournalEntriesPendingSync(cloudEntries.map((e) => e.id));
  clearJournalEntriesPendingSync(box.deleteIds);
  recordJournalSyncOk();
}

/**
 * Pull deltas (if due), merge without clobbering outbox, then flush writes.
 */
export async function syncJournal(opts?: {
  reason?: JournalSyncReason;
  /** Force a pull even when last pull is fresh. */
  forcePull?: boolean;
}): Promise<void> {
  if (typeof window === "undefined") return;
  if (!getMedimadeApiBase() || !getMedimadeSessionJwt()) return;

  if (syncInFlight) {
    await syncInFlight;
    return;
  }

  const reason = opts?.reason ?? "manual";
  const forcePull =
    opts?.forcePull === true ||
    reason === "pull-to-refresh" ||
    reason === "launch" ||
    reason === "foreground" ||
    reason === "reconnect" ||
    (reason === "journal-open" && journalPullIsStale());

  syncInFlight = (async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setJournalCloudSaveStatus("offline");
        return;
      }
      let store = readLocalStore();
      if (forcePull || journalPullIsStale() || !readDiag().lastPullAt) {
        try {
          store = await pullAndMerge();
        } catch (err) {
          recordJournalSyncError(
            err instanceof Error ? err.message : "Could not pull journal",
          );
          // Still try to flush outbox with what we have.
        }
      }
      if (!journalOutboxIsEmpty()) {
        try {
          await flushOutbox(store);
        } catch (err) {
          recordJournalSyncError(
            err instanceof Error ? err.message : "Could not save journal",
          );
        }
      } else if (saveStatus === "saving") {
        setJournalCloudSaveStatus("saved");
      }
    } finally {
      syncInFlight = null;
    }
  })();

  await syncInFlight;
}

/** Debounced outbox flush after typing (~1s). */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleJournalOutboxFlush(delayMs = 1000): void {
  if (flushTimer) clearTimeout(flushTimer);
  setJournalCloudSaveStatus(
    typeof navigator !== "undefined" && navigator.onLine === false
      ? "offline"
      : "saving",
  );
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void syncJournal({ reason: "outbox-flush", forcePull: false });
  }, delayMs);
}

export function flushJournalOutboxNow(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  void syncJournal({ reason: "outbox-flush", forcePull: false });
}

/**
 * Install once: launch / foreground / reconnect pulls.
 * Safe to call from AppChrome or JournalView.
 */
export function installJournalSyncBootHooks(): void {
  if (typeof window === "undefined" || bootHookInstalled) return;
  bootHookInstalled = true;

  const onFg = () => {
    void syncJournal({ reason: "foreground", forcePull: true });
  };
  const onOnline = () => {
    void syncJournal({ reason: "reconnect", forcePull: true });
  };
  const onVis = () => {
    if (document.visibilityState === "visible") onFg();
  };

  window.addEventListener(JOURNAL_APP_FOREGROUND_EVENT, onFg);
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("medimade-session-changed", () => {
    if (getMedimadeSessionJwt()) {
      void syncJournal({ reason: "launch", forcePull: true });
    }
  });

  // Launch pull once a session is already present.
  if (getMedimadeSessionJwt() && getMedimadeApiBase()) {
    void syncJournal({ reason: "launch", forcePull: true });
  }
}

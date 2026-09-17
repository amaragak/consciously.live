/**
 * Persisted Consciously Chat threads (localStorage + optional cloud sync).
 */

import { deriveAssistantChatTitleProvisional } from "@/lib/assistant-chat-title";

export type AssistantChatActionResult = {
  label: string;
  detail?: string;
  href?: string;
  linkLabel?: string;
  ok: boolean;
};

export type AssistantChatUiMessage = {
  role: "user" | "assistant";
  text: string;
  actionResults?: AssistantChatActionResult[];
};

export type AssistantChatApiTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantChatThreadMode =
  | { type: "default" }
  | { type: "life_area_ideate"; lifeAreaId: string };

export type AssistantChatThread = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  /** When true, auto-rename from first message is skipped. */
  titleManual?: boolean;
  /**
   * When true, the floating FAB will not resume this thread (e.g. after
   * create_meditation). Full Chat sidebar still lists it.
   */
  excludeFromFabResume?: boolean;
  messages: AssistantChatUiMessage[];
  apiThread: AssistantChatApiTurn[];
  mode?: AssistantChatThreadMode;
};

export type AssistantChatStoreV1 = {
  version: 1;
  activeThreadId: string | null;
  threads: AssistantChatThread[];
};

const STORE_KEY = "mm_assistant_chat_store_v1";
const SIDEBAR_COLLAPSED_KEY = "mm_assistant_chat_sidebar_collapsed";
const LEGACY_KEYS = ["mm_assistant_chat_v1", "mm_assistant_chat_v2"] as const;

export const ASSISTANT_CHAT_STORE_CHANGED = "mm-assistant-chat-store-changed";

export const MAX_ASSISTANT_CHAT_THREADS = 40;
export const MAX_ASSISTANT_CHAT_MESSAGES = 80;

export function emptyAssistantChatStore(): AssistantChatStoreV1 {
  return { version: 1, activeThreadId: null, threads: [] };
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function clearLegacyAssistantChatKeys(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of LEGACY_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* */
  }
}

/** @deprecated use clearLegacyAssistantChatKeys */
export function clearAssistantChatSession(): void {
  clearLegacyAssistantChatKeys();
}

function isUiMessage(x: unknown): x is AssistantChatUiMessage {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    (o.role === "user" || o.role === "assistant") &&
    typeof o.text === "string"
  );
}

function isApiTurn(x: unknown): x is AssistantChatApiTurn {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    (o.role === "user" || o.role === "assistant") &&
    typeof o.content === "string"
  );
}

function normalizeThread(raw: unknown): AssistantChatThread | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.createdAt !== "string" ||
    typeof o.updatedAt !== "string" ||
    typeof o.title !== "string"
  ) {
    return null;
  }
  const messages = Array.isArray(o.messages)
    ? o.messages.filter(isUiMessage).slice(-MAX_ASSISTANT_CHAT_MESSAGES)
    : [];
  const apiThread = Array.isArray(o.apiThread)
    ? o.apiThread.filter(isApiTurn).slice(-MAX_ASSISTANT_CHAT_MESSAGES * 2)
    : [];
  let mode: AssistantChatThreadMode | undefined;
  if (o.mode && typeof o.mode === "object") {
    const m = o.mode as Record<string, unknown>;
    if (
      m.type === "life_area_ideate" &&
      typeof m.lifeAreaId === "string" &&
      m.lifeAreaId.trim()
    ) {
      mode = { type: "life_area_ideate", lifeAreaId: m.lifeAreaId.trim() };
    }
  }
  return {
    id: o.id,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    title: o.title.trim().slice(0, 120) || "New chat",
    ...(o.titleManual === true ? { titleManual: true } : {}),
    ...(o.excludeFromFabResume === true ? { excludeFromFabResume: true } : {}),
    messages,
    apiThread,
    ...(mode ? { mode } : {}),
  };
}

export function normalizeAssistantChatStore(raw: unknown): AssistantChatStoreV1 {
  if (!raw || typeof raw !== "object") return emptyAssistantChatStore();
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !Array.isArray(o.threads)) {
    return emptyAssistantChatStore();
  }
  const threads = o.threads
    .map(normalizeThread)
    .filter((t): t is AssistantChatThread => Boolean(t))
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, MAX_ASSISTANT_CHAT_THREADS);
  let activeThreadId =
    o.activeThreadId == null || typeof o.activeThreadId === "string"
      ? (o.activeThreadId as string | null)
      : null;
  if (activeThreadId && !threads.some((t) => t.id === activeThreadId)) {
    activeThreadId = threads[0]?.id ?? null;
  }
  return { version: 1, activeThreadId, threads };
}

function emitStoreChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(ASSISTANT_CHAT_STORE_CHANGED));
  } catch {
    /* */
  }
}

export function loadAssistantChatStore(): AssistantChatStoreV1 {
  if (typeof window === "undefined") return emptyAssistantChatStore();
  clearLegacyAssistantChatKeys();
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return emptyAssistantChatStore();
    return normalizeAssistantChatStore(JSON.parse(raw) as unknown);
  } catch {
    return emptyAssistantChatStore();
  }
}

export function saveAssistantChatStore(store: AssistantChatStoreV1): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeAssistantChatStore(store);
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(normalized));
  } catch {
    /* */
  }
  emitStoreChanged();
}

export function newAssistantChatThread(
  now = new Date(),
  opts?: { title?: string; mode?: AssistantChatThreadMode },
): AssistantChatThread {
  const iso = now.toISOString();
  return {
    id: newId(),
    createdAt: iso,
    updatedAt: iso,
    title: opts?.title?.trim().slice(0, 120) || "New chat",
    messages: [],
    apiThread: [],
    ...(opts?.mode ? { mode: opts.mode } : {}),
  };
}

export function upsertAssistantChatThread(
  store: AssistantChatStoreV1,
  thread: AssistantChatThread,
): AssistantChatStoreV1 {
  const next = normalizeThread(thread);
  if (!next) return store;
  const others = store.threads.filter((t) => t.id !== next.id);
  const threads = [next, ...others]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, MAX_ASSISTANT_CHAT_THREADS);
  return {
    version: 1,
    activeThreadId: next.id,
    threads,
  };
}

/**
 * Cloud pull adoption: local threads are never replaced.
 * Remote may only contribute thread ids that are not already on this device.
 * No updatedAt / message-count races — pull does not overwrite local content.
 */
export function adoptMissingRemoteAssistantChatThreads(
  local: AssistantChatStoreV1,
  remote: AssistantChatStoreV1,
): AssistantChatStoreV1 {
  const localIds = new Set(local.threads.map((t) => t.id));
  const missing = remote.threads.filter((t) => !localIds.has(t.id));
  if (missing.length === 0) {
    return {
      version: 1,
      activeThreadId:
        local.activeThreadId &&
        local.threads.some((t) => t.id === local.activeThreadId)
          ? local.activeThreadId
          : (local.threads[0]?.id ?? null),
      threads: local.threads,
    };
  }

  const threads = [...local.threads, ...missing]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, MAX_ASSISTANT_CHAT_THREADS);

  const activeThreadId =
    (local.activeThreadId && threads.some((t) => t.id === local.activeThreadId)
      ? local.activeThreadId
      : null) ??
    (threads[0]?.id ?? null);

  return { version: 1, activeThreadId, threads };
}

/** @deprecated Use adoptMissingRemoteAssistantChatThreads — pull must not race-merge. */
export function mergeAssistantChatStores(
  local: AssistantChatStoreV1,
  remote: AssistantChatStoreV1,
): AssistantChatStoreV1 {
  return adoptMissingRemoteAssistantChatThreads(local, remote);
}

export function deleteAssistantChatThread(
  store: AssistantChatStoreV1,
  threadId: string,
): AssistantChatStoreV1 {
  const threads = store.threads.filter((t) => t.id !== threadId);
  const activeThreadId =
    store.activeThreadId === threadId
      ? (threads[0]?.id ?? null)
      : store.activeThreadId &&
          threads.some((t) => t.id === store.activeThreadId)
        ? store.activeThreadId
        : (threads[0]?.id ?? null);
  return { version: 1, activeThreadId, threads };
}

export function deriveAssistantChatTitle(
  messages: AssistantChatUiMessage[],
): string {
  const firstUser = messages.find((m) => m.role === "user" && m.text.trim());
  if (!firstUser) return "New chat";
  // Provisional only — smart titles come from /api/assistant-chat/title.
  return deriveAssistantChatTitleProvisional(firstUser.text);
}

/** Rename a thread; marks title as user-owned so auto-derive won't overwrite. */
export function renameAssistantChatThread(
  store: AssistantChatStoreV1,
  threadId: string,
  title: string,
): AssistantChatStoreV1 {
  const nextTitle = title.trim().slice(0, 120) || "New chat";
  const threads = store.threads.map((t) =>
    t.id === threadId
      ? {
          ...t,
          title: nextTitle,
          titleManual: true,
          updatedAt: new Date().toISOString(),
        }
      : t,
  );
  return { ...store, threads };
}

export function threadPreview(thread: AssistantChatThread): string {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const m = thread.messages[i]!;
    const t = m.text.trim().replace(/\s+/g, " ");
    if (t) return t.length > 80 ? `${t.slice(0, 79).trimEnd()}…` : t;
  }
  return "No messages yet";
}

export function formatAssistantChatThreadDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export type AssistantChatSidebarGroup = {
  label: string;
  threads: AssistantChatThread[];
};

export function groupAssistantChatThreadsForSidebar(
  threads: AssistantChatThread[],
): AssistantChatSidebarGroup[] {
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfWeek = startOfToday - 6 * 86400000;

  const buckets: Record<string, AssistantChatThread[]> = {
    Today: [],
    Yesterday: [],
    "This week": [],
    Earlier: [],
  };

  for (const t of threads) {
    const ts = new Date(t.updatedAt).getTime();
    if (ts >= startOfToday) buckets.Today!.push(t);
    else if (ts >= startOfYesterday) buckets.Yesterday!.push(t);
    else if (ts >= startOfWeek) buckets["This week"]!.push(t);
    else buckets.Earlier!.push(t);
  }

  return (["Today", "Yesterday", "This week", "Earlier"] as const)
    .map((label) => ({ label, threads: buckets[label]! }))
    .filter((g) => g.threads.length > 0);
}

export function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_KEY,
      collapsed ? "1" : "0",
    );
  } catch {
    /* */
  }
}

/** True when the thread has no real user turns (opening-only or empty). */
export function threadNeedsSessionOpen(thread: AssistantChatThread): boolean {
  const hasUser = thread.apiThread.some((t) => {
    if (t.role !== "user") return false;
    if (t.content === "[[SESSION_OPEN]]") return false;
    if (t.content === "[[LIFE_AREA_IDEATE_OPEN]]") return false;
    return true;
  });
  if (hasUser) return false;
  if (thread.messages.length === 0) return true;
  return false;
}

/** FAB resumes a thread only if last activity was within this window. */
export const ASSISTANT_CHAT_FAB_RESUME_MAX_AGE_MS = 60 * 60 * 1000;

export function assistantChatThreadActivityMs(
  thread: AssistantChatThread,
): number {
  const updated = Date.parse(thread.updatedAt);
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(thread.createdAt);
  return Number.isFinite(created) ? created : 0;
}

/** Whether the FAB may reopen this thread (fresh + not create-handoff excluded). */
export function isAssistantChatThreadFabResumable(
  thread: AssistantChatThread,
  nowMs = Date.now(),
): boolean {
  if (thread.excludeFromFabResume) return false;
  const activity = assistantChatThreadActivityMs(thread);
  if (!activity) return false;
  return nowMs - activity <= ASSISTANT_CHAT_FAB_RESUME_MAX_AGE_MS;
}

/**
 * Most recently updated thread the FAB should resume, or null → start new.
 * Full Chat sidebar still lists every persisted thread.
 */
export function pickAssistantChatFabResumeThread(
  store: AssistantChatStoreV1,
  nowMs = Date.now(),
): AssistantChatThread | null {
  for (const thread of store.threads) {
    if (isAssistantChatThreadFabResumable(thread, nowMs)) return thread;
  }
  return null;
}

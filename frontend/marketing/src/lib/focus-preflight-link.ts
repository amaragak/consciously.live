/**
 * Link Ideate-task → Focus preflight 2‑min meditation (pending or ready).
 */

export const FOCUS_PREFLIGHT_LINKS_KEY = "mm_focus_preflight_links_v1";
export const FOCUS_ACTIVE_IDEATE_SUBTASK_KEY =
  "mm_focus_active_ideate_subtask_v1";
export const FOCUS_PREFLIGHT_CHANGED_EVENT = "mm-focus-preflight-changed";

export type FocusPreflightStatus =
  | "starting"
  | "pending"
  | "running"
  | "ready"
  | "failed";

export type FocusPreflightLink = {
  v: 1;
  subtaskId: string;
  jobId: string | null;
  title: string;
  status: FocusPreflightStatus;
  error?: string | null;
  /** Library / job audio key when ready. */
  audioKey?: string | null;
  audioUrl?: string | null;
  createdAt: string;
};

type LinksMap = Record<string, FocusPreflightLink>;

function emitChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FOCUS_PREFLIGHT_CHANGED_EVENT));
}

function loadMap(): LinksMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(FOCUS_PREFLIGHT_LINKS_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== "object") return {};
    const out: LinksMap = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const link = parseLink(v);
      if (link) out[k] = link;
    }
    return out;
  } catch {
    return {};
  }
}

function saveMap(map: LinksMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FOCUS_PREFLIGHT_LINKS_KEY, JSON.stringify(map));
    emitChanged();
  } catch {
    /* ignore */
  }
}

function parseLink(raw: unknown): FocusPreflightLink | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || typeof o.subtaskId !== "string" || !o.subtaskId.trim()) {
    return null;
  }
  if (typeof o.title !== "string" || typeof o.createdAt !== "string") {
    return null;
  }
  const status = o.status;
  if (
    status !== "starting" &&
    status !== "pending" &&
    status !== "running" &&
    status !== "ready" &&
    status !== "failed"
  ) {
    return null;
  }
  return {
    v: 1,
    subtaskId: o.subtaskId.trim(),
    jobId: typeof o.jobId === "string" && o.jobId.trim() ? o.jobId.trim() : null,
    title: o.title,
    status,
    error: typeof o.error === "string" ? o.error : null,
    audioKey:
      typeof o.audioKey === "string" && o.audioKey.trim()
        ? o.audioKey.trim()
        : null,
    audioUrl:
      typeof o.audioUrl === "string" && o.audioUrl.trim()
        ? o.audioUrl.trim()
        : null,
    createdAt: o.createdAt,
  };
}

export function writeFocusActiveIdeateSubtask(subtaskId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FOCUS_ACTIVE_IDEATE_SUBTASK_KEY,
      subtaskId.trim(),
    );
    emitChanged();
  } catch {
    /* ignore */
  }
}

export function readFocusActiveIdeateSubtask(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(FOCUS_ACTIVE_IDEATE_SUBTASK_KEY);
    return id?.trim() || null;
  } catch {
    return null;
  }
}

export function readFocusPreflightLink(
  subtaskId: string,
): FocusPreflightLink | null {
  const id = subtaskId.trim();
  if (!id) return null;
  return loadMap()[id] ?? null;
}

export function readActiveFocusPreflightLink(): FocusPreflightLink | null {
  const id = readFocusActiveIdeateSubtask();
  if (!id) return null;
  return readFocusPreflightLink(id);
}

export function upsertFocusPreflightLink(
  partial: Omit<FocusPreflightLink, "v"> & { v?: 1 },
): FocusPreflightLink {
  const map = loadMap();
  const prev = map[partial.subtaskId.trim()];
  const next: FocusPreflightLink = {
    v: 1,
    subtaskId: partial.subtaskId.trim(),
    jobId: partial.jobId ?? prev?.jobId ?? null,
    title: partial.title.trim() || prev?.title || "Pre-focus meditation",
    status: partial.status,
    error: partial.error ?? null,
    audioKey: partial.audioKey ?? prev?.audioKey ?? null,
    audioUrl: partial.audioUrl ?? prev?.audioUrl ?? null,
    createdAt: partial.createdAt || prev?.createdAt || new Date().toISOString(),
  };
  map[next.subtaskId] = next;
  saveMap(map);
  return next;
}

export function patchFocusPreflightLinkByJobId(
  jobId: string,
  patch: Partial<
    Pick<
      FocusPreflightLink,
      "status" | "title" | "error" | "audioKey" | "audioUrl" | "jobId"
    >
  >,
): void {
  const id = jobId.trim();
  if (!id) return;
  const map = loadMap();
  let hit: FocusPreflightLink | null = null;
  for (const link of Object.values(map)) {
    if (link.jobId === id) {
      hit = link;
      break;
    }
  }
  if (!hit) return;
  map[hit.subtaskId] = {
    ...hit,
    ...patch,
    jobId: patch.jobId !== undefined ? patch.jobId : hit.jobId,
  };
  saveMap(map);
}

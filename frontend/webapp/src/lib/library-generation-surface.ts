/**
 * Library Creations surface presence + completion routing.
 * When Library is mounted, completed gens autoplay there; otherwise inbox notify.
 * Ready/failed events always fire so non-Library listeners (e.g. Story Narrate)
 * can clear pending UI even when the inbox path is used.
 */

export type MeditationGenerationReadyDetail = {
  jobId: string;
  audioKey: string;
  title: string;
};

export type MeditationGenerationFailedDetail = {
  jobId: string;
  title: string;
  error: string;
};

const READY_EVENT = "mm-meditation-generation-ready";
const FAILED_EVENT = "mm-meditation-generation-failed";
const HANDLED_KEY = "mm_meditation_ready_handled_v1";

let surfaceCount = 0;

export function registerLibraryGenerationSurface(): () => void {
  surfaceCount += 1;
  return () => {
    surfaceCount = Math.max(0, surfaceCount - 1);
  };
}

export function isLibraryGenerationSurfaceActive(): boolean {
  return surfaceCount > 0;
}

function alreadyHandled(jobId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(HANDLED_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) && arr.includes(jobId);
  } catch {
    return false;
  }
}

function rememberHandled(jobId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(HANDLED_KEY);
    const prev = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(prev)
      ? prev.filter((x): x is string => typeof x === "string")
      : [];
    sessionStorage.setItem(
      HANDLED_KEY,
      JSON.stringify([...list, jobId].slice(-40)),
    );
  } catch {
    /* ignore */
  }
}

export function dispatchMeditationGenerationReady(
  detail: MeditationGenerationReadyDetail,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(READY_EVENT, { detail }));
}

export function onMeditationGenerationReady(
  handler: (detail: MeditationGenerationReadyDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<MeditationGenerationReadyDetail>;
    if (ce.detail?.jobId && ce.detail?.audioKey) handler(ce.detail);
  };
  window.addEventListener(READY_EVENT, fn);
  return () => window.removeEventListener(READY_EVENT, fn);
}

export function dispatchMeditationGenerationFailed(
  detail: MeditationGenerationFailedDetail,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FAILED_EVENT, { detail }));
}

export function onMeditationGenerationFailed(
  handler: (detail: MeditationGenerationFailedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => {
    const ce = e as CustomEvent<MeditationGenerationFailedDetail>;
    if (ce.detail?.jobId) handler(ce.detail);
  };
  window.addEventListener(FAILED_EVENT, fn);
  return () => window.removeEventListener(FAILED_EVENT, fn);
}

/**
 * Single completion side-effect: autoplay on Library, inbox elsewhere.
 * Deduped so global + Library pollers can both call safely.
 * Always dispatches ready so Story / other listeners clear pending state.
 */
export function routeMeditationGenerationReady(params: {
  jobId: string;
  audioKey: string;
  title: string;
}): "autoplay" | "notify" | "skipped" {
  const jobId = params.jobId.trim();
  const audioKey = params.audioKey.trim();
  if (!jobId || !audioKey) return "skipped";
  if (alreadyHandled(jobId)) return "skipped";
  rememberHandled(jobId);
  const title = params.title.trim() || "Your meditation";
  dispatchMeditationGenerationReady({ jobId, audioKey, title });
  if (isLibraryGenerationSurfaceActive()) {
    return "autoplay";
  }
  return "notify";
}

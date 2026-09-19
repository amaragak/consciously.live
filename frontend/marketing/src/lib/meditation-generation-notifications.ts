/**
 * Push completed meditation jobs into the in-app notification inbox.
 */

import {
  readAccountSessionStorage,
  writeAccountSessionStorage,
} from "@/lib/account-scoped-storage";
import { upsertAppNotification } from "@/lib/app-notifications";

const DEDUPE_KEY = "mm_meditation_inbox_dedupe_v1";

function alreadyInboxed(jobId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = readAccountSessionStorage(DEDUPE_KEY);
    if (!raw) return false;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return false;
    return arr.includes(jobId);
  } catch {
    return false;
  }
}

function rememberInboxed(jobId: string): void {
  if (typeof window === "undefined") return;
  try {
    const raw = readAccountSessionStorage(DEDUPE_KEY);
    const prev = raw ? (JSON.parse(raw) as unknown) : [];
    const list = Array.isArray(prev)
      ? prev.filter((x): x is string => typeof x === "string")
      : [];
    writeAccountSessionStorage(
      DEDUPE_KEY,
      JSON.stringify([...list, jobId].slice(-40)),
    );
  } catch {
    /* ignore */
  }
}

export function notifyMeditationGenerationComplete(params: {
  jobId: string;
  title: string;
  href?: string;
}): void {
  const jobId = params.jobId.trim();
  if (!jobId || alreadyInboxed(jobId)) return;
  rememberInboxed(jobId);

  const title = (params.title.trim() || "Your meditation").slice(0, 80);
  const href =
    params.href?.trim() ||
    `/meditate/library/creations?focus=${encodeURIComponent(jobId)}&play=1`;

  upsertAppNotification({
    id: `meditation-ready:${jobId}`,
    kind: "meditation_ready",
    title: "Meditation ready",
    body: title,
    href,
  });
}

export function notifyMeditationGenerationFailed(params: {
  jobId: string;
  title?: string;
  error?: string;
}): void {
  const jobId = params.jobId.trim();
  if (!jobId || alreadyInboxed(`fail:${jobId}`)) return;
  rememberInboxed(`fail:${jobId}`);
  upsertAppNotification({
    id: `meditation-failed:${jobId}`,
    kind: "meditation_failed",
    title: "Meditation generation failed",
    body:
      (params.error ?? "").trim() ||
      (params.title ?? "").trim() ||
      "Something went wrong while generating.",
    href: "/meditate/library/creations",
  });
}

/** @deprecated No-op — in-app bell only; kept so stale imports don't break the build. */
export function requestMeditationNotificationPermission(): void {
  /* intentionally empty */
}

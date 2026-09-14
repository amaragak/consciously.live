/**
 * Poll pending meditation audio jobs app-wide (not only on Library).
 */

import {
  getMeditationAudioJobStatus,
  listLibraryMeditations,
} from "@/lib/medimade-api";
import { notifyMeditationGenerationComplete, notifyMeditationGenerationFailed } from "@/lib/meditation-generation-notifications";
import {
  loadPendingGenerations,
  savePendingGenerations,
  type PendingLibraryGeneration,
} from "@/lib/pending-library-generations";

const STALE_PENDING_MS = 1000 * 60 * 60 * 12; // 12h
const POLL_MS = 5000;

let pollTimer: number | null = null;
let pollInFlight = false;

async function tickPendingJobs(): Promise<void> {
  if (pollInFlight) return;
  const current = loadPendingGenerations();
  if (current.length === 0) {
    stopPendingMeditationJobPoller();
    return;
  }
  pollInFlight = true;
  try {
    let changed = false;
    const next: PendingLibraryGeneration[] = [];
    for (const p of current) {
      try {
        const st = await getMeditationAudioJobStatus(p.jobId);
        const nextTitle = (st.title ?? "").trim();
        const nextDesc = (st.description ?? "").trim();
        const nextP: PendingLibraryGeneration =
          nextTitle || nextDesc ? { ...p } : { ...p };
        if (nextTitle && nextTitle !== p.title) {
          changed = true;
          nextP.title = nextTitle;
        }
        if (nextDesc && nextDesc !== (p.description ?? "")) {
          changed = true;
          nextP.description = nextDesc;
        }

        if (st.status === "completed") {
          const audioKey = (st.audioKey ?? "").trim();
          if (!audioKey) {
            next.push({ ...nextP, status: "running" });
            changed = true;
            continue;
          }
          // Confirm catalog presence when possible; still notify either way.
          try {
            const list = await listLibraryMeditations();
            const found = list.some(
              (it) => (it.s3Key ?? "").trim() === audioKey,
            );
            if (!found) {
              next.push({ ...nextP, status: "running" });
              changed = true;
              continue;
            }
          } catch {
            /* notify anyway if status says completed + audioKey present */
          }
          changed = true;
          notifyMeditationGenerationComplete({
            jobId: p.jobId,
            title: nextP.title || "Your meditation",
            href: `/meditate/library/creations?focus=${encodeURIComponent(audioKey)}&play=1`,
          });
          continue;
        }

        if (st.status === "failed") {
          changed = true;
          notifyMeditationGenerationFailed({
            jobId: p.jobId,
            title: nextP.title,
            error: st.error ?? "Generation failed",
          });
          next.push({
            ...nextP,
            status: "failed",
            error: st.error ?? "Generation failed",
          });
          continue;
        }

        const createdMs = Date.parse(p.createdAt ?? "");
        const stale =
          Number.isFinite(createdMs) &&
          Date.now() - createdMs > STALE_PENDING_MS;
        if (stale) {
          changed = true;
          next.push({
            ...nextP,
            status: "failed",
            error:
              "This has been generating for a long time. Please try again from Create.",
          });
          continue;
        }

        next.push({
          ...nextP,
          status: st.status === "running" ? "running" : "pending",
        });
      } catch {
        next.push(p);
      }
    }
    if (changed) savePendingGenerations(next);
    else if (next.length !== current.length) savePendingGenerations(next);
  } finally {
    pollInFlight = false;
  }
}

export function startPendingMeditationJobPoller(): void {
  if (typeof window === "undefined") return;
  if (pollTimer != null) return;
  void tickPendingJobs();
  pollTimer = window.setInterval(() => {
    void tickPendingJobs();
  }, POLL_MS);
}

export function stopPendingMeditationJobPoller(): void {
  if (typeof window === "undefined") return;
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

/** Ensure the poller is running whenever there are pending jobs. */
export function ensurePendingMeditationJobPoller(): void {
  if (typeof window === "undefined") return;
  if (loadPendingGenerations().some((p) => p.status !== "failed")) {
    startPendingMeditationJobPoller();
  }
}

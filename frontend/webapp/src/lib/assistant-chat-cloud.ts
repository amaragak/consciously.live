/**
 * Signed-in pull/push for assistant chat store.
 *
 * Contract (no overwrite races):
 * - Pull never replaces a thread that already exists locally.
 * - Pull may only add remote threads whose ids are missing on this device.
 * - Empty/stale cloud never clears local FAB/device threads.
 * - Push uploads the current local store (source of truth on this device).
 */

import {
  fetchAssistantChatStoreRemote,
  putAssistantChatStoreRemote,
} from "@/lib/medimade-api";
import {
  adoptMissingRemoteAssistantChatThreads,
  loadAssistantChatStore,
  normalizeAssistantChatStore,
  saveAssistantChatStore,
  type AssistantChatStoreV1,
} from "@/lib/assistant-chat-storage";
import { getMedimadeSessionJwt } from "@/lib/auth-session";

let pulledThisSession = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pullInFlight: Promise<AssistantChatStoreV1 | null> | null = null;

export function wasAssistantChatStorePulledThisSession(): boolean {
  return pulledThisSession;
}

export function markAssistantChatStorePulledThisSession(): void {
  pulledThisSession = true;
}

export function clearAssistantChatRemoteSessionCache(): void {
  pulledThisSession = false;
  pullInFlight = null;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

function localHasThreadsMissingFromRemote(
  local: AssistantChatStoreV1,
  remote: AssistantChatStoreV1,
): boolean {
  const remoteIds = new Set(remote.threads.map((t) => t.id));
  return local.threads.some((t) => !remoteIds.has(t.id));
}

export async function pullAssistantChatStoreFromCloud(): Promise<AssistantChatStoreV1 | null> {
  if (!getMedimadeSessionJwt()) return null;
  if (pullInFlight) return pullInFlight;

  pullInFlight = (async () => {
    try {
      const remote = await fetchAssistantChatStoreRemote();
      const local = loadAssistantChatStore();

      // No remote row — local stays; push so cloud catches up.
      if (!remote) {
        markAssistantChatStorePulledThisSession();
        if (local.threads.length > 0) {
          scheduleAssistantChatCloudPush();
        }
        return local.threads.length ? local : null;
      }

      const remoteNorm = normalizeAssistantChatStore(remote);
      const next = adoptMissingRemoteAssistantChatThreads(local, remoteNorm);

      // Only write when we actually adopted missing remote threads.
      const adopted =
        next.threads.length !== local.threads.length ||
        next.threads.some((t) => !local.threads.some((l) => l.id === t.id));

      if (adopted) {
        saveAssistantChatStore(next);
      }

      markAssistantChatStorePulledThisSession();

      // Device is source of truth for threads it already has — push if cloud lacks them.
      if (
        local.threads.length > 0 &&
        (remoteNorm.threads.length === 0 ||
          localHasThreadsMissingFromRemote(local, remoteNorm))
      ) {
        scheduleAssistantChatCloudPush();
      }

      return adopted ? next : local;
    } finally {
      pullInFlight = null;
    }
  })();

  return pullInFlight;
}

export function scheduleAssistantChatCloudPush(
  _store?: AssistantChatStoreV1,
): void {
  if (!getMedimadeSessionJwt()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    // Flush latest local store only — never a stale schedule-time snapshot.
    const latest = loadAssistantChatStore();
    if (latest.threads.length === 0) return;
    void putAssistantChatStoreRemote(latest).catch(() => {
      /* cloud can catch up later */
    });
  }, 1200);
}

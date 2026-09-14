/**
 * Signed-in pull/push for assistant chat store (mirrors journal remote cache).
 */

import {
  fetchAssistantChatStoreRemote,
  putAssistantChatStoreRemote,
} from "@/lib/medimade-api";
import {
  loadAssistantChatStore,
  normalizeAssistantChatStore,
  saveAssistantChatStore,
  type AssistantChatStoreV1,
} from "@/lib/assistant-chat-storage";
import { getMedimadeSessionJwt } from "@/lib/auth-session";

let pulledThisSession = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

export function wasAssistantChatStorePulledThisSession(): boolean {
  return pulledThisSession;
}

export function markAssistantChatStorePulledThisSession(): void {
  pulledThisSession = true;
}

export function clearAssistantChatRemoteSessionCache(): void {
  pulledThisSession = false;
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
}

export async function pullAssistantChatStoreFromCloud(): Promise<AssistantChatStoreV1 | null> {
  if (!getMedimadeSessionJwt()) return null;
  const remote = await fetchAssistantChatStoreRemote();
  if (!remote) return null;
  const normalized = normalizeAssistantChatStore(remote);
  saveAssistantChatStore(normalized);
  markAssistantChatStorePulledThisSession();
  return normalized;
}

export function scheduleAssistantChatCloudPush(
  store?: AssistantChatStoreV1,
): void {
  if (!getMedimadeSessionJwt()) return;
  const next = store ?? loadAssistantChatStore();
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void putAssistantChatStoreRemote(next).catch(() => {
      /* cloud can catch up later */
    });
  }, 1200);
}

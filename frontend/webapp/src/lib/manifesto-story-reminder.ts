/**
 * Nightly Story reminder → in-app notification inbox (bell).
 * No email/push yet; fires once per local calendar day after the chosen time.
 */

import { upsertAppNotification } from "@/lib/app-notifications";
import {
  loadManifestoStoryStore,
  saveManifestoStoryStore,
  type ManifestoStoryStoreV1,
} from "@/lib/manifesto-story";

function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function minutesNow(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

function minutesFromHHMM(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return 22 * 60 + 30;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * If a reminder is due, post an in-app notification and stamp the store.
 * Returns whether a notification was fired.
 */
export function maybeFireManifestoStoryReminder(
  store: ManifestoStoryStoreV1 = loadManifestoStoryStore(),
): boolean {
  if (!store.reminderEnabled) return false;
  // Only remind when there’s something to listen to.
  const hasAudio = store.versions.some((v) => v.audioId);
  if (!hasAudio && !store.activeVersionId) return false;

  const today = localDateKey();
  if (store.reminderLastFiredDate === today) return false;
  if (minutesNow() < minutesFromHHMM(store.reminderTime)) return false;

  upsertAppNotification({
    id: `story-reminder-${today}`,
    kind: "story_reminder",
    title: "Time for your story",
    body: "Settle in and listen to your life vision.",
    href: "/manifest/story",
  });

  saveManifestoStoryStore({
    ...store,
    reminderLastFiredDate: today,
  });
  return true;
}

let started = false;

/** Poll once a minute while the SPA is open. Idempotent. */
export function ensureManifestoStoryReminderPoller(): void {
  if (typeof window === "undefined" || started) return;
  started = true;
  const tick = () => {
    try {
      maybeFireManifestoStoryReminder();
    } catch {
      /* ignore */
    }
  };
  tick();
  window.setInterval(tick, 60_000);
}

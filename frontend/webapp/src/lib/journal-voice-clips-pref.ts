/**
 * Account preference: show voice clip rows (and bronze transcript rules).
 * Synced via user settings `journal.showVoiceClips` (default on).
 */

import { patchUserSettings } from "@/lib/settings-api";
import {
  defaultUserSettings,
  type UserSettingsV1,
} from "@/lib/user-settings";

export const JOURNAL_VOICE_CLIPS_CHANGED = "mm-journal-voice-clips-changed";
const ATTR = "data-hide-voice-clips";

let memoryShow: boolean | null = null;

export function readShowVoiceClips(settings?: UserSettingsV1 | null): boolean {
  if (memoryShow != null) return memoryShow;
  const fromSettings = settings?.journal?.showVoiceClips;
  if (typeof fromSettings === "boolean") return fromSettings;
  return defaultUserSettings().journal.showVoiceClips;
}

export function applyShowVoiceClipsToDom(show: boolean): void {
  if (typeof document === "undefined") return;
  if (show) document.documentElement.removeAttribute(ATTR);
  else document.documentElement.setAttribute(ATTR, "1");
}

export function setShowVoiceClips(
  show: boolean,
  opts?: { persist?: boolean },
): void {
  memoryShow = show;
  applyShowVoiceClipsToDom(show);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(JOURNAL_VOICE_CLIPS_CHANGED, { detail: { show } }),
    );
  }
  if (opts?.persist === false) return;
  void patchUserSettings({ journal: { showVoiceClips: show } }).catch(() => {
    /* offline — local DOM + memory still apply */
  });
}

export function syncShowVoiceClipsFromSettings(settings: UserSettingsV1): void {
  const show = settings.journal?.showVoiceClips !== false;
  memoryShow = show;
  applyShowVoiceClipsToDom(show);
}

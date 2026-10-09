/**
 * Settings status map — single source of truth for wired vs marked rows.
 * Keep in sync with docs/settings-status.md.
 */

import { isSessionAdmin } from "@/lib/session-privileges";

export type SettingsStatus =
  | "wired"
  | "not_implemented"
  | "not_available";

/** Stable keys used by the UI and the checklist. */
export type SettingsKey =
  | "account.displayName"
  | "account.email"
  | "account.changeEmail"
  | "account.changePassword"
  | "account.sessions"
  | "account.signOutEverywhere"
  | "account.signInMethods"
  | "account.passkeys"
  | "account.export"
  | "account.delete"
  | "ai.providers"
  | "ai.trainingClaim"
  | "ai.personaliseWithJournal"
  | "ai.insightsFromJournal"
  | "ai.chatActionMode"
  | "ai.deleteAiData"
  | "ai.clearChat"
  | "ai.modelTier"
  | "privacy.journalLock"
  | "privacy.newMeditationVisibility"
  | "privacy.sharedLinks"
  | "privacy.communityName"
  | "privacy.postAnonymously"
  | "privacy.showActivityInConnect"
  | "privacy.blockedMuted"
  | "privacy.shareAnonymousUsage"
  | "notifications.grid"
  | "notifications.dailyReminder"
  | "notifications.focusAlerts"
  | "notifications.quietHours"
  | "notifications.nudgeStyle"
  | "email.transactional"
  | "email.productUpdates"
  | "email.weeklySummary"
  | "email.communityReplies"
  | "meditate.defaults"
  | "meditate.background"
  | "meditate.playbackSpeed"
  | "meditate.showCreateHint"
  | "meditate.downloads"
  | "focus.sessionDefaults"
  | "focus.distraction"
  | "focus.goalsPicker"
  | "general.theme"
  | "general.language"
  | "general.timeZone"
  | "general.textSize"
  | "general.reducedMotion"
  | "general.captions"
  | "general.billing"
  | "general.help"
  | "general.version";

export const SETTINGS_STATUS: Record<SettingsKey, SettingsStatus> = {
  "account.displayName": "wired",
  "account.email": "wired",
  "account.changeEmail": "not_available",
  "account.changePassword": "wired",
  "account.sessions": "not_available",
  "account.signOutEverywhere": "wired",
  "account.signInMethods": "wired",
  "account.passkeys": "wired",
  "account.export": "not_available",
  "account.delete": "not_available",
  "ai.providers": "wired",
  "ai.trainingClaim": "not_available",
  "ai.personaliseWithJournal": "not_implemented",
  "ai.insightsFromJournal": "not_implemented",
  "ai.chatActionMode": "not_implemented",
  "ai.deleteAiData": "not_implemented",
  "ai.clearChat": "wired",
  "ai.modelTier": "not_available",
  "privacy.journalLock": "wired",
  "privacy.newMeditationVisibility": "not_implemented",
  "privacy.sharedLinks": "wired",
  "privacy.communityName": "wired",
  "privacy.postAnonymously": "not_implemented",
  "privacy.showActivityInConnect": "not_implemented",
  "privacy.blockedMuted": "not_available",
  "privacy.shareAnonymousUsage": "not_implemented",
  "notifications.grid": "not_implemented",
  "notifications.dailyReminder": "not_available",
  "notifications.focusAlerts": "not_implemented",
  "notifications.quietHours": "not_implemented",
  "notifications.nudgeStyle": "not_implemented",
  "email.transactional": "wired",
  "email.productUpdates": "not_implemented",
  "email.weeklySummary": "not_available",
  "email.communityReplies": "not_implemented",
  "meditate.defaults": "wired",
  "meditate.background": "not_implemented",
  "meditate.playbackSpeed": "not_implemented",
  "meditate.showCreateHint": "wired",
  "meditate.downloads": "not_available",
  "focus.sessionDefaults": "wired",
  "focus.distraction": "not_available",
  "focus.goalsPicker": "not_available",
  "general.theme": "wired",
  "general.language": "not_available",
  "general.timeZone": "wired",
  "general.textSize": "not_implemented",
  "general.reducedMotion": "not_implemented",
  "general.captions": "not_available",
  "general.billing": "wired",
  "general.help": "wired",
  "general.version": "wired",
};

export function settingsStatusLabel(status: SettingsStatus): string {
  if (status === "not_implemented") return "NOT IMPLEMENTED";
  if (status === "not_available") return "NOT AVAILABLE YET";
  return "";
}

export function settingsStatusTitle(status: SettingsStatus): string {
  if (status === "not_implemented") {
    return "Stored, but the app does not enforce this yet.";
  }
  if (status === "not_available") {
    return "This feature is not in the product yet.";
  }
  return "";
}

/** Admins and Vite dev builds see markers; everyone else only sees wired rows. */
export function canSeeSettingsStatus(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    if (typeof window !== "undefined") {
      if (window.localStorage.getItem("mm_admin_unlocked") === "1") return true;
    }
  } catch {
    /* */
  }
  return isSessionAdmin();
}

export function shouldShowSettingsRow(key: SettingsKey): boolean {
  const status = SETTINGS_STATUS[key];
  if (status === "wired") return true;
  return canSeeSettingsStatus();
}

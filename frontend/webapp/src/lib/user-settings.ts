/**
 * Versioned user settings schema (private-by-default).
 * Mirrors backend/lambdas/_shared/user-settings.ts — keep in sync.
 */

export const USER_SETTINGS_VERSION = 1 as const;

export type ChatActionMode = "suggest" | "ask" | "act";
export type MeditationVisibility = "private" | "link" | "public";
export type NudgeStyle = "none" | "gentle" | "regular";
export type ThemePreference = "light" | "dark" | "hybrid" | "v2";
export type TextSize = "default" | "large";
export type ReducedMotionPref = "system" | "reduce" | "no-preference";
export type DailyReminderKind = "meditation" | "journal";
export type MeditateType = "guided" | "breathing" | "body-scan" | "sleep";

export type NotificationChannelPrefs = {
  push: boolean;
  email: boolean;
  inApp: boolean;
};

export type UserSettingsV1 = {
  version: typeof USER_SETTINGS_VERSION;
  ai: {
    personaliseWithJournal: boolean;
    insightsFromJournal: boolean;
    chatActionMode: ChatActionMode;
  };
  privacy: {
    journalLock: boolean;
    newMeditationVisibility: MeditationVisibility;
    postAnonymously: boolean;
    showActivityInConnect: boolean;
    shareAnonymousUsage: boolean;
  };
  notifications: {
    reminders: NotificationChannelPrefs;
    repliesInConnect: NotificationChannelPrefs;
    meditationReady: NotificationChannelPrefs;
    streaksNudges: NotificationChannelPrefs;
    dailyReminder: {
      enabled: boolean;
      kind: DailyReminderKind;
      time: string;
    };
    focusSessionAlerts: boolean;
    quietHours: {
      enabled: boolean;
      from: string;
      to: string;
      /** 0=Sun … 6=Sat */
      days: number[];
    };
    nudgeStyle: NudgeStyle;
  };
  email: {
    productUpdates: boolean;
    weeklySummary: boolean;
    communityReplies: boolean;
  };
  meditate: {
    defaultVoiceId: string | null;
    defaultLengthMinutes: number;
    defaultType: MeditateType;
    backgroundSound: boolean;
    backgroundVolume: number;
    playbackSpeed: number;
    /** Dismissible Create · Start tip; Settings › Meditate can turn it back on. */
    showCreateHint: boolean;
  };
  focus: {
    defaultSessionMinutes: number;
    breakMinutes: number;
    distractionBlocking: boolean;
  };
  general: {
    theme: ThemePreference;
    language: string;
    timeZone: string | null;
    textSize: TextSize;
    reducedMotion: ReducedMotionPref;
    captions: boolean;
  };
};

export function defaultUserSettings(): UserSettingsV1 {
  return {
    version: USER_SETTINGS_VERSION,
    ai: {
      personaliseWithJournal: false,
      insightsFromJournal: false,
      chatActionMode: "suggest",
    },
    privacy: {
      journalLock: false,
      newMeditationVisibility: "private",
      postAnonymously: true,
      showActivityInConnect: false,
      shareAnonymousUsage: false,
    },
    notifications: {
      reminders: { push: false, email: false, inApp: true },
      repliesInConnect: { push: false, email: false, inApp: true },
      meditationReady: { push: false, email: false, inApp: true },
      streaksNudges: { push: false, email: false, inApp: true },
      dailyReminder: { enabled: false, kind: "meditation", time: "08:00" },
      focusSessionAlerts: false,
      quietHours: {
        enabled: false,
        from: "22:00",
        to: "07:00",
        days: [0, 1, 2, 3, 4, 5, 6],
      },
      nudgeStyle: "gentle",
    },
    email: {
      productUpdates: false,
      weeklySummary: false,
      communityReplies: false,
    },
    meditate: {
      defaultVoiceId: null,
      defaultLengthMinutes: 5,
      defaultType: "guided",
      backgroundSound: true,
      backgroundVolume: 0.4,
      playbackSpeed: 1,
      showCreateHint: true,
    },
    focus: {
      defaultSessionMinutes: 25,
      breakMinutes: 5,
      distractionBlocking: false,
    },
    general: {
      theme: "light",
      language: "en",
      timeZone: null,
      textSize: "default",
      reducedMotion: "system",
      captions: false,
    },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function asNullableString(v: unknown): string | null {
  if (v === null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  return null;
}

function asNumber(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asChannel(
  v: unknown,
  fallback: NotificationChannelPrefs,
): NotificationChannelPrefs {
  if (!isObject(v)) return { ...fallback };
  return {
    push: asBool(v.push, fallback.push),
    email: asBool(v.email, fallback.email),
    inApp: asBool(v.inApp, fallback.inApp),
  };
}

const CHAT_MODES = new Set<ChatActionMode>(["suggest", "ask", "act"]);
const VIS = new Set<MeditationVisibility>(["private", "link", "public"]);
const NUDGE = new Set<NudgeStyle>(["none", "gentle", "regular"]);
const THEMES = new Set<ThemePreference>(["light", "dark", "hybrid", "v2"]);
const TEXT = new Set<TextSize>(["default", "large"]);
const MOTION = new Set<ReducedMotionPref>([
  "system",
  "reduce",
  "no-preference",
]);
const REMINDER = new Set<DailyReminderKind>(["meditation", "journal"]);
const MED_TYPES = new Set<MeditateType>([
  "guided",
  "breathing",
  "body-scan",
  "sleep",
]);

function asEnum<T extends string>(
  v: unknown,
  allowed: Set<T>,
  fallback: T,
): T {
  return typeof v === "string" && allowed.has(v as T) ? (v as T) : fallback;
}

function asTime(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  return /^\d{2}:\d{2}$/.test(v) ? v : fallback;
}

function asDays(v: unknown, fallback: number[]): number[] {
  if (!Array.isArray(v)) return [...fallback];
  const out = v
    .filter((x): x is number => typeof x === "number" && x >= 0 && x <= 6)
    .map((x) => Math.floor(x));
  return out.length ? [...new Set(out)].sort((a, b) => a - b) : [...fallback];
}

/** Merge unknown stored/partial payload onto defaults (never throws). */
export function normalizeUserSettings(raw: unknown): UserSettingsV1 {
  const d = defaultUserSettings();
  if (!isObject(raw)) return d;

  const ai = isObject(raw.ai) ? raw.ai : {};
  const privacy = isObject(raw.privacy) ? raw.privacy : {};
  const notifications = isObject(raw.notifications) ? raw.notifications : {};
  const email = isObject(raw.email) ? raw.email : {};
  const meditate = isObject(raw.meditate) ? raw.meditate : {};
  const focus = isObject(raw.focus) ? raw.focus : {};
  const general = isObject(raw.general) ? raw.general : {};
  const daily = isObject(notifications.dailyReminder)
    ? notifications.dailyReminder
    : {};
  const quiet = isObject(notifications.quietHours)
    ? notifications.quietHours
    : {};

  return {
    version: USER_SETTINGS_VERSION,
    ai: {
      personaliseWithJournal: asBool(
        ai.personaliseWithJournal,
        d.ai.personaliseWithJournal,
      ),
      insightsFromJournal: asBool(
        ai.insightsFromJournal,
        d.ai.insightsFromJournal,
      ),
      chatActionMode: asEnum(ai.chatActionMode, CHAT_MODES, d.ai.chatActionMode),
    },
    privacy: {
      journalLock: asBool(privacy.journalLock, d.privacy.journalLock),
      newMeditationVisibility: asEnum(
        privacy.newMeditationVisibility,
        VIS,
        d.privacy.newMeditationVisibility,
      ),
      postAnonymously: asBool(
        privacy.postAnonymously,
        d.privacy.postAnonymously,
      ),
      showActivityInConnect: asBool(
        privacy.showActivityInConnect,
        d.privacy.showActivityInConnect,
      ),
      shareAnonymousUsage: asBool(
        privacy.shareAnonymousUsage,
        d.privacy.shareAnonymousUsage,
      ),
    },
    notifications: {
      reminders: asChannel(notifications.reminders, d.notifications.reminders),
      repliesInConnect: asChannel(
        notifications.repliesInConnect,
        d.notifications.repliesInConnect,
      ),
      meditationReady: asChannel(
        notifications.meditationReady,
        d.notifications.meditationReady,
      ),
      streaksNudges: asChannel(
        notifications.streaksNudges,
        d.notifications.streaksNudges,
      ),
      dailyReminder: {
        enabled: asBool(daily.enabled, d.notifications.dailyReminder.enabled),
        kind: asEnum(daily.kind, REMINDER, d.notifications.dailyReminder.kind),
        time: asTime(daily.time, d.notifications.dailyReminder.time),
      },
      focusSessionAlerts: asBool(
        notifications.focusSessionAlerts,
        d.notifications.focusSessionAlerts,
      ),
      quietHours: {
        enabled: asBool(quiet.enabled, d.notifications.quietHours.enabled),
        from: asTime(quiet.from, d.notifications.quietHours.from),
        to: asTime(quiet.to, d.notifications.quietHours.to),
        days: asDays(quiet.days, d.notifications.quietHours.days),
      },
      nudgeStyle: asEnum(
        notifications.nudgeStyle,
        NUDGE,
        d.notifications.nudgeStyle,
      ),
    },
    email: {
      productUpdates: asBool(email.productUpdates, d.email.productUpdates),
      weeklySummary: asBool(email.weeklySummary, d.email.weeklySummary),
      communityReplies: asBool(
        email.communityReplies,
        d.email.communityReplies,
      ),
    },
    meditate: {
      defaultVoiceId: asNullableString(meditate.defaultVoiceId),
      defaultLengthMinutes: asNumber(
        meditate.defaultLengthMinutes,
        d.meditate.defaultLengthMinutes,
        1,
        60,
      ),
      defaultType: asEnum(
        meditate.defaultType,
        MED_TYPES,
        d.meditate.defaultType,
      ),
      backgroundSound: asBool(
        meditate.backgroundSound,
        d.meditate.backgroundSound,
      ),
      backgroundVolume: asNumber(
        meditate.backgroundVolume,
        d.meditate.backgroundVolume,
        0,
        1,
      ),
      playbackSpeed: asNumber(
        meditate.playbackSpeed,
        d.meditate.playbackSpeed,
        0.5,
        2,
      ),
      showCreateHint: asBool(
        meditate.showCreateHint,
        d.meditate.showCreateHint,
      ),
    },
    focus: {
      defaultSessionMinutes: asNumber(
        focus.defaultSessionMinutes,
        d.focus.defaultSessionMinutes,
        1,
        120,
      ),
      breakMinutes: asNumber(
        focus.breakMinutes,
        d.focus.breakMinutes,
        0,
        60,
      ),
      distractionBlocking: asBool(
        focus.distractionBlocking,
        d.focus.distractionBlocking,
      ),
    },
    general: {
      theme: asEnum(general.theme, THEMES, d.general.theme),
      language: asString(general.language, d.general.language).slice(0, 16),
      timeZone: asNullableString(general.timeZone),
      textSize: asEnum(general.textSize, TEXT, d.general.textSize),
      reducedMotion: asEnum(
        general.reducedMotion,
        MOTION,
        d.general.reducedMotion,
      ),
      captions: asBool(general.captions, d.general.captions),
    },
  };
}

/** Deep-merge a partial patch onto current, then normalize. */
export function applyUserSettingsPatch(
  current: UserSettingsV1,
  patch: unknown,
): UserSettingsV1 {
  if (!isObject(patch)) return current;
  const merged = deepMerge(current as unknown as Record<string, unknown>, patch);
  return normalizeUserSettings(merged);
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (isObject(v) && isObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

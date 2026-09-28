/**
 * Device + settings-backed defaults for Create and Focus.
 * Wired settings write here; Create/Focus read on init.
 */

import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import type { MeditateType, UserSettingsV1 } from "@/lib/user-settings";

const MEDITATE_KEY = "mm_meditate_defaults_v1";
const FOCUS_KEY = "mm_focus_defaults_v1";

export type MeditateDefaults = {
  defaultVoiceId: string | null;
  defaultLengthMinutes: number;
  defaultType: MeditateType;
};

export type FocusDefaults = {
  defaultSessionMinutes: number;
  breakMinutes: number;
};

export function readMeditateDefaults(): MeditateDefaults {
  try {
    const raw = readAccountLocalStorage(MEDITATE_KEY);
    if (!raw) {
      return {
        defaultVoiceId: null,
        defaultLengthMinutes: 5,
        defaultType: "guided",
      };
    }
    const o = JSON.parse(raw) as Partial<MeditateDefaults>;
    return {
      defaultVoiceId:
        typeof o.defaultVoiceId === "string" && o.defaultVoiceId.trim()
          ? o.defaultVoiceId.trim()
          : null,
      defaultLengthMinutes:
        typeof o.defaultLengthMinutes === "number" &&
        o.defaultLengthMinutes >= 1
          ? Math.min(60, Math.floor(o.defaultLengthMinutes))
          : 5,
      defaultType:
        o.defaultType === "breathing" ||
        o.defaultType === "body-scan" ||
        o.defaultType === "sleep" ||
        o.defaultType === "guided"
          ? o.defaultType
          : "guided",
    };
  } catch {
    return {
      defaultVoiceId: null,
      defaultLengthMinutes: 5,
      defaultType: "guided",
    };
  }
}

export function writeMeditateDefaults(d: MeditateDefaults): void {
  try {
    writeAccountLocalStorage(MEDITATE_KEY, JSON.stringify(d));
  } catch {
    /* */
  }
}

export function syncMeditateDefaultsFromSettings(s: UserSettingsV1): void {
  writeMeditateDefaults({
    defaultVoiceId: s.meditate.defaultVoiceId,
    defaultLengthMinutes: s.meditate.defaultLengthMinutes,
    defaultType: s.meditate.defaultType,
  });
}

export function readFocusDefaults(): FocusDefaults {
  try {
    const raw = readAccountLocalStorage(FOCUS_KEY);
    if (!raw) return { defaultSessionMinutes: 25, breakMinutes: 5 };
    const o = JSON.parse(raw) as Partial<FocusDefaults>;
    return {
      defaultSessionMinutes:
        typeof o.defaultSessionMinutes === "number" &&
        o.defaultSessionMinutes >= 1
          ? Math.min(120, Math.floor(o.defaultSessionMinutes))
          : 25,
      breakMinutes:
        typeof o.breakMinutes === "number" && o.breakMinutes >= 0
          ? Math.min(60, Math.floor(o.breakMinutes))
          : 5,
    };
  } catch {
    return { defaultSessionMinutes: 25, breakMinutes: 5 };
  }
}

export function writeFocusDefaults(d: FocusDefaults): void {
  try {
    writeAccountLocalStorage(FOCUS_KEY, JSON.stringify(d));
  } catch {
    /* */
  }
}

export function syncFocusDefaultsFromSettings(s: UserSettingsV1): void {
  writeFocusDefaults({
    defaultSessionMinutes: s.focus.defaultSessionMinutes,
    breakMinutes: s.focus.breakMinutes,
  });
}

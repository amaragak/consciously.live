import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

/**
 * Client-side profile prefs for Connect / account UI (scaffold until API owns these fields).
 */

const STORAGE_KEY = "mm_profile_prefs_v1";
export const PROFILE_PREFS_CHANGED_EVENT = "mm-profile-prefs-changed";

export type ProfilePrefs = {
  firstName: string;
  lastName: string;
  username: string;
  /** `-1` = app primary (`--accent-button`). */
  avatarHue: number;
};

const DEFAULTS: ProfilePrefs = {
  firstName: "",
  lastName: "",
  username: "",
  avatarHue: -1,
};

function readRaw(): ProfilePrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readAccountLocalStorage(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfilePrefs>;
    return {
      firstName:
        typeof parsed.firstName === "string" ? parsed.firstName.trim() : "",
      lastName:
        typeof parsed.lastName === "string" ? parsed.lastName.trim() : "",
      username:
        typeof parsed.username === "string"
          ? parsed.username
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "")
              .slice(0, 32)
          : "",
      avatarHue:
        typeof parsed.avatarHue === "number" && Number.isFinite(parsed.avatarHue)
          ? Math.round(parsed.avatarHue)
          : -1,
    };
  } catch {
    return null;
  }
}

export function loadProfilePrefs(): ProfilePrefs {
  return readRaw() ?? { ...DEFAULTS };
}

export function saveProfilePrefs(prefs: ProfilePrefs): ProfilePrefs {
  const next: ProfilePrefs = {
    firstName: prefs.firstName.trim().slice(0, 40),
    lastName: prefs.lastName.trim().slice(0, 40),
    username: prefs.username
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 32),
    avatarHue:
      typeof prefs.avatarHue === "number" && Number.isFinite(prefs.avatarHue)
        ? Math.round(prefs.avatarHue)
        : -1,
  };
  if (typeof window !== "undefined") {
    try {
      writeAccountLocalStorage(STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(PROFILE_PREFS_CHANGED_EVENT));
      window.dispatchEvent(new Event("medimade-session-changed"));
    } catch {
      /* */
    }
  }
  return next;
}

export function profileDisplayName(prefs: ProfilePrefs, fallback = ""): string {
  const full = `${prefs.firstName} ${prefs.lastName}`.trim();
  return full || fallback;
}

export function profileGreetingName(
  prefs: ProfilePrefs,
  sessionLabel: string | null,
): string {
  if (prefs.firstName.trim()) return prefs.firstName.trim();
  const session = sessionLabel?.trim() || "";
  if (session && session.includes("@")) return session.split("@")[0] || "there";
  if (session) return session.split(/\s+/)[0] || session;
  return "there";
}

/** Soft palette for avatar colour picker (plus primary via `-1`). */
export const AVATAR_HUE_PRESETS: { label: string; hue: number }[] = [
  { label: "Brand", hue: -1 },
  { label: "Coral", hue: 12 },
  { label: "Peach", hue: 28 },
  { label: "Gold", hue: 42 },
  { label: "Sage", hue: 145 },
  { label: "Teal", hue: 175 },
  { label: "Sky", hue: 205 },
  { label: "Violet", hue: 265 },
  { label: "Rose", hue: 340 },
];

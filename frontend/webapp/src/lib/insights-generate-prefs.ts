/**
 * "Remember my choices for next time" on the Insights generate dialog.
 * Client-only (no server preference yet) — scoped per signed-in account.
 */

import {
  readAccountLocalStorage,
  removeAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

export const INSIGHTS_GENERATE_PREFS_KEY = "mm_insights_generate_prefs_v2";

export type InsightsPeriodPreset = "last7" | "last30" | "custom";

export type InsightsGeneratePrefs = {
  remember: boolean;
  letter: boolean;
  patterns: boolean;
  felt: boolean;
  moved: boolean;
  wins: boolean;
  thought: boolean;
  /** Remembered Covering preset; custom falls back to last7. */
  periodPreset: InsightsPeriodPreset;
};

export const DEFAULT_INSIGHTS_GENERATE_PREFS: InsightsGeneratePrefs = {
  remember: false,
  letter: true,
  patterns: true,
  felt: true,
  moved: true,
  wins: true,
  thought: true,
  periodPreset: "last7",
};

function parsePrefs(raw: string | null): InsightsGeneratePrefs {
  if (!raw) return { ...DEFAULT_INSIGHTS_GENERATE_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<InsightsGeneratePrefs>;
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_INSIGHTS_GENERATE_PREFS };
    }
    if (parsed.remember !== true) return { ...DEFAULT_INSIGHTS_GENERATE_PREFS };
    const preset =
      parsed.periodPreset === "last30" || parsed.periodPreset === "last7"
        ? parsed.periodPreset
        : "last7";
    return {
      remember: true,
      letter: parsed.letter !== false,
      patterns: parsed.patterns !== false,
      felt: parsed.felt !== false,
      moved: parsed.moved !== false,
      wins: parsed.wins !== false,
      thought: parsed.thought !== false,
      periodPreset: preset,
    };
  } catch {
    return { ...DEFAULT_INSIGHTS_GENERATE_PREFS };
  }
}

/** Read remembered generate choices (or defaults when none / remember off). */
export function readInsightsGeneratePrefs(): InsightsGeneratePrefs {
  if (typeof window === "undefined") {
    return { ...DEFAULT_INSIGHTS_GENERATE_PREFS };
  }
  try {
    const scoped = readAccountLocalStorage(INSIGHTS_GENERATE_PREFS_KEY);
    if (scoped != null) return parsePrefs(scoped);
    // One-shot migrate pre-account-scoped key (same browser profile).
    const legacy = window.localStorage.getItem(INSIGHTS_GENERATE_PREFS_KEY);
    if (legacy != null) {
      const prefs = parsePrefs(legacy);
      if (prefs.remember) writeInsightsGeneratePrefs(prefs);
      else window.localStorage.removeItem(INSIGHTS_GENERATE_PREFS_KEY);
      return prefs;
    }
    return { ...DEFAULT_INSIGHTS_GENERATE_PREFS };
  } catch {
    return { ...DEFAULT_INSIGHTS_GENERATE_PREFS };
  }
}

/** Persist or clear generate choices. Only stores when `remember` is true. */
export function writeInsightsGeneratePrefs(prefs: InsightsGeneratePrefs): void {
  if (typeof window === "undefined") return;
  try {
    // Drop legacy unscoped key whenever we write.
    window.localStorage.removeItem(INSIGHTS_GENERATE_PREFS_KEY);
    if (!prefs.remember) {
      removeAccountLocalStorage(INSIGHTS_GENERATE_PREFS_KEY);
      return;
    }
    const payload: InsightsGeneratePrefs = {
      remember: true,
      letter: prefs.letter,
      patterns: prefs.patterns,
      felt: prefs.felt,
      moved: prefs.moved,
      wins: prefs.wins,
      thought: prefs.thought,
      periodPreset:
        prefs.periodPreset === "custom" ? "last7" : prefs.periodPreset,
    };
    writeAccountLocalStorage(
      INSIGHTS_GENERATE_PREFS_KEY,
      JSON.stringify(payload),
    );
  } catch {
    /* quota / private mode */
  }
}

/**
 * Per-user Insights section collapse prefs (presentation only).
 * Default: both sections open.
 */

import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

const KEY = "mm_insights_collapse_v1";

export type InsightsCollapsePrefs = {
  letterCollapsed: boolean;
  patternsCollapsed: boolean;
};

const DEFAULTS: InsightsCollapsePrefs = {
  letterCollapsed: false,
  patternsCollapsed: false,
};

export function readInsightsCollapsePrefs(): InsightsCollapsePrefs {
  try {
    const raw = readAccountLocalStorage(KEY);
    if (!raw) return { ...DEFAULTS };
    const o = JSON.parse(raw) as Partial<InsightsCollapsePrefs>;
    return {
      letterCollapsed: Boolean(o.letterCollapsed),
      patternsCollapsed: Boolean(o.patternsCollapsed),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeInsightsCollapsePrefs(
  prefs: InsightsCollapsePrefs,
): void {
  try {
    writeAccountLocalStorage(KEY, JSON.stringify(prefs));
  } catch {
    /* */
  }
}

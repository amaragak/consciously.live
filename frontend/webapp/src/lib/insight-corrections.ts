/**
 * Local + sync helpers for insight corrections and soft-banner dismiss (v7).
 * Hidden pattern items are remembered by normalised text so future gens skip them.
 */

export type InsightCorrectionKind =
  | "win"
  | "promise"
  | "thought"
  | "activity"
  | "emotion";

export type InsightHiddenItem = {
  kind: InsightCorrectionKind;
  /** Normalised key for matching. */
  textNorm: string;
  /** Display text when restoring. */
  text: string;
  /** incorrect = "That's not right"; hide = "Hide this". */
  reason: "incorrect" | "hide";
  at: string;
};

const HIDDEN_KEY = "mm_insight_hidden_v1";
const SOFT_DISMISS_KEY = "mm_insight_soft_banner_dismiss_v1";

export function normalizeInsightText(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function listHiddenInsightItems(): InsightHiddenItem[] {
  const raw = readJson<InsightHiddenItem[]>(HIDDEN_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

export function hideInsightItem(input: {
  kind: InsightCorrectionKind;
  text: string;
  reason: "incorrect" | "hide";
}): InsightHiddenItem {
  const item: InsightHiddenItem = {
    kind: input.kind,
    text: input.text.trim(),
    textNorm: normalizeInsightText(input.text),
    reason: input.reason,
    at: new Date().toISOString(),
  };
  const next = listHiddenInsightItems().filter(
    (h) => !(h.kind === item.kind && h.textNorm === item.textNorm),
  );
  next.unshift(item);
  writeJson(HIDDEN_KEY, next.slice(0, 200));
  return item;
}

export function restoreInsightItem(kind: InsightCorrectionKind, textNorm: string): void {
  writeJson(
    HIDDEN_KEY,
    listHiddenInsightItems().filter(
      (h) => !(h.kind === kind && h.textNorm === textNorm),
    ),
  );
}

export function isInsightItemHidden(
  kind: InsightCorrectionKind,
  text: string,
): boolean {
  const norm = normalizeInsightText(text);
  return listHiddenInsightItems().some(
    (h) => h.kind === kind && h.textNorm === norm,
  );
}

/** Recent corrections for the generation prompt (cap 10). */
export function recentCorrectionGuidance(limit = 10): string[] {
  return listHiddenInsightItems()
    .slice(0, limit)
    .map((h) => {
      if (h.reason === "incorrect") {
        return `The user said this ${h.kind} wasn't accurate: "${h.text}"`;
      }
      return `The user chose to hide this ${h.kind}: "${h.text}"`;
    });
}

export function isSoftBannerDismissed(rangeKey: string): boolean {
  const map = readJson<Record<string, boolean>>(SOFT_DISMISS_KEY, {});
  return Boolean(map[rangeKey]);
}

export function dismissSoftBanner(rangeKey: string): void {
  const map = readJson<Record<string, boolean>>(SOFT_DISMISS_KEY, {});
  map[rangeKey] = true;
  writeJson(SOFT_DISMISS_KEY, map);
}

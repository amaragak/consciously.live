/**
 * Manifest overview · Foundations accordion open/closed per row.
 * Device-local (localStorage; Capacitor WebView shares the same store).
 */

const KEY = "mm_manifest_foundations_expand_v1";

export type ManifestFoundationsExpandState = {
  values: boolean;
  quotes: boolean;
  questions: boolean;
};

const DEFAULTS: ManifestFoundationsExpandState = {
  values: false,
  quotes: false,
  questions: false,
};

export function loadManifestFoundationsExpand(): ManifestFoundationsExpandState {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<ManifestFoundationsExpandState>;
    return {
      values: Boolean(parsed.values),
      quotes: Boolean(parsed.quotes),
      questions: Boolean(parsed.questions),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveManifestFoundationsExpand(
  state: ManifestFoundationsExpandState,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* */
  }
}

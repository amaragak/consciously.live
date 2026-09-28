/**
 * Appearance. Default is hybrid; applied as `class="dark"` / `class="hybrid"` /
 * `class="v2"` on `<html>` (not `prefers-color-scheme`). Hybrid = light page
 * body + dark homepage hero. `v2` is the Consciously homepage-v2 palette.
 *
 * Preference persistence (localStorage) is on by default for the Vite SPA.
 * The Next marketing app turns it off so hybrid stays the default and choice
 * is session-only until hybrid becomes the sole scheme.
 */

export type ColorScheme = "light" | "dark" | "hybrid" | "v2";

export const COLOR_SCHEME_STORAGE_KEY = "mm_color_scheme";
export const COLOR_SCHEME_CHANGED_EVENT = "mm-color-scheme-changed";
/** Carries the live site mode onto `/login` when following Sign in / Sign up. */
export const COLOR_SCHEME_QUERY_PARAM = "scheme";

export const COLOR_SCHEME_OPTIONS: ReadonlyArray<{
  id: ColorScheme;
  label: string;
}> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "hybrid", label: "Hybrid" },
  { id: "v2", label: "V2" },
];

/** Homepage v2 header switcher — light / dark / hybrid (light body + dark hero) / v2. */
export const COLOR_SCHEME_OPTIONS_HOME_V2: ReadonlyArray<{
  id: ColorScheme;
  label: string;
}> = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "hybrid", label: "Hybrid" },
  { id: "v2", label: "V2" },
];

/** Hero paisley tiles — keep in sync with `--home-hero-pattern` in theme-colors. */
export const HOME_HERO_PATTERN_LIGHT =
  "/patterns/paisley-tile-800-offwhite.webp";
export const HOME_HERO_PATTERN_DARK =
  "/patterns/paisley-tile-800-tonal-navy.webp";
/** Auth screen tiles — amber duotone (light) / navy duotone (dark). */
export const AUTH_HERO_PATTERN_LIGHT = "/patterns/paisley-amber-duotone.webp";
export const AUTH_HERO_PATTERN_DARK = "/patterns/paisley-dark-duotone.webp";

/** When false, skip localStorage — always default hybrid; live choice is session-only. */
let persistColorSchemePreference = true;

export function setColorSchemePreferencePersistence(enabled: boolean): void {
  persistColorSchemePreference = enabled;
  if (!enabled && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }
}

export function colorSchemePreferencePersists(): boolean {
  return persistColorSchemePreference;
}

export function parseColorScheme(
  value: string | null | undefined,
): ColorScheme | null {
  return value === "dark" ||
    value === "light" ||
    value === "hybrid" ||
    value === "v2"
    ? value
    : null;
}

function liveSchemeFromDom(): ColorScheme | null {
  if (typeof document === "undefined") return null;
  return parseColorScheme(document.documentElement.dataset.colorScheme);
}

export function getStoredColorScheme(): ColorScheme {
  if (typeof window === "undefined") return "hybrid";
  if (!persistColorSchemePreference) {
    return liveSchemeFromDom() ?? "hybrid";
  }
  try {
    return (
      parseColorScheme(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)) ??
      "hybrid"
    );
  } catch {
    return "hybrid";
  }
}

/** Mode currently painted on the page, else the stored preference. */
export function getLiveColorScheme(): ColorScheme {
  const fromDom = liveSchemeFromDom();
  if (fromDom) return fromDom;
  if (typeof document !== "undefined") {
    const root = document.documentElement.classList;
    if (root.contains("dark")) return "dark";
    if (root.contains("hybrid")) return "hybrid";
    if (root.contains("v2")) return "v2";
  }
  return getStoredColorScheme();
}

export function isDarkColorScheme(scheme: ColorScheme): boolean {
  return scheme === "dark";
}

/**
 * Auth screens: query handoff from the page they left, else preference, else light.
 * Hybrid always paints as light on signup/login (dark hero is homepage-only).
 */
export function resolveAuthColorScheme(
  search?: string | { get(name: string): string | null } | null,
): ColorScheme {
  let raw: string | null = null;
  if (typeof search === "string") {
    const q = search.startsWith("?") ? search.slice(1) : search;
    raw = new URLSearchParams(q).get(COLOR_SCHEME_QUERY_PARAM);
  } else if (search) {
    raw = search.get(COLOR_SCHEME_QUERY_PARAM);
  } else if (typeof window !== "undefined") {
    raw = new URLSearchParams(window.location.search).get(
      COLOR_SCHEME_QUERY_PARAM,
    );
  }
  const scheme = parseColorScheme(raw) ?? getStoredColorScheme();
  return scheme === "hybrid" ? "light" : scheme;
}

/** Append or replace `scheme=` on a same-origin path (keeps existing query/hash). */
export function withAuthColorSchemeQuery(
  path: string,
  scheme: ColorScheme,
): string {
  const hashIndex = path.indexOf("#");
  const withoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const qIndex = withoutHash.indexOf("?");
  const pathname = qIndex >= 0 ? withoutHash.slice(0, qIndex) : withoutHash;
  const query = qIndex >= 0 ? withoutHash.slice(qIndex + 1) : "";
  const params = new URLSearchParams(query);
  params.set(COLOR_SCHEME_QUERY_PARAM, scheme);
  return `${pathname}?${params.toString()}${hash}`;
}

export function applyColorScheme(scheme: ColorScheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  /* Disable color transitions for one frame so the root token swap paints once. */
  root.classList.add("theme-switching");
  root.classList.toggle("dark", scheme === "dark");
  root.classList.toggle("hybrid", scheme === "hybrid");
  root.classList.toggle("v2", scheme === "v2");
  root.dataset.colorScheme = scheme;
  root.style.colorScheme = scheme === "dark" ? "dark" : "light";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export function setColorScheme(scheme: ColorScheme): void {
  if (persistColorSchemePreference) {
    try {
      localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
    } catch {
      /* private mode */
    }
  } else {
    try {
      localStorage.removeItem(COLOR_SCHEME_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }
  applyColorScheme(scheme);
  window.dispatchEvent(new Event(COLOR_SCHEME_CHANGED_EVENT));
}

export function toggleColorScheme(): ColorScheme {
  const cur = getStoredColorScheme();
  const next: ColorScheme =
    cur === "light"
      ? "dark"
      : cur === "dark"
        ? "hybrid"
        : cur === "hybrid"
          ? "v2"
          : "light";
  setColorScheme(next);
  return next;
}

function buildBootScript(opts: { readLocalStorage: boolean }): string {
  const readLs = opts.readLocalStorage
    ? `else{var s=localStorage.getItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)});if(s==="dark"||s==="light"||s==="hybrid"||s==="v2")scheme=s;else{try{localStorage.removeItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)})}catch(e2){}}}`
    : `else{try{localStorage.removeItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)})}catch(e2){}}`;
  return `(function(){var scheme="hybrid";try{var auth=location.pathname==="/login";var q=null;if(auth){q=new URLSearchParams(location.search).get(${JSON.stringify(COLOR_SCHEME_QUERY_PARAM)})}var parsed=q==="dark"||q==="light"||q==="hybrid"||q==="v2"?q:null;if(parsed)scheme=parsed;${readLs}if(auth&&scheme==="hybrid")scheme="light"}catch(e){}var root=document.documentElement;root.classList.toggle("dark",scheme==="dark");root.classList.toggle("hybrid",scheme==="hybrid");root.classList.toggle("v2",scheme==="v2");root.dataset.colorScheme=scheme;root.style.colorScheme=scheme==="dark"?"dark":"light";var auth=location.pathname==="/login";var active=auth?(scheme==="dark"?${JSON.stringify(AUTH_HERO_PATTERN_DARK)}:${JSON.stringify(AUTH_HERO_PATTERN_LIGHT)}):(scheme==="hybrid"?${JSON.stringify(AUTH_HERO_PATTERN_DARK)}:scheme==="dark"?${JSON.stringify(HOME_HERO_PATTERN_DARK)}:${JSON.stringify(HOME_HERO_PATTERN_LIGHT)});var img=new Image();img.fetchPriority="high";img.src=active})();`;
}

/**
 * Inline boot script — set class before first paint, and preload the active
 * hero paisley so `background-image` does not flash in after layout.
 * `/login` honors `?scheme=` from the page they clicked from; otherwise
 * localStorage; otherwise hybrid. Hybrid on auth always boots as light.
 */
export const colorSchemeBootScript = buildBootScript({
  readLocalStorage: true,
});

/** Next marketing: always hybrid (auth query only); clears any stored preference. */
export const colorSchemeBootScriptNoPersist = buildBootScript({
  readLocalStorage: false,
});

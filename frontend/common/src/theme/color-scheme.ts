/**
 * Light / dark appearance. Default is light; user choice is stored in localStorage
 * and applied as `class="dark"` on `<html>` (not `prefers-color-scheme`).
 */

export type ColorScheme = "light" | "dark";

export const COLOR_SCHEME_STORAGE_KEY = "mm_color_scheme";
export const COLOR_SCHEME_CHANGED_EVENT = "mm-color-scheme-changed";
/** Carries the live site mode onto `/login` when following Sign in / Sign up. */
export const COLOR_SCHEME_QUERY_PARAM = "scheme";

/** Hero paisley tiles — keep in sync with `--home-hero-pattern` in theme-colors. */
export const HOME_HERO_PATTERN_LIGHT =
  "/patterns/paisley-tile-800-offwhite.webp";
export const HOME_HERO_PATTERN_DARK =
  "/patterns/paisley-tile-800-tonal-navy.webp";
/** Auth screen tiles — amber duotone (light) / navy duotone (dark). */
export const AUTH_HERO_PATTERN_LIGHT = "/patterns/paisley-amber-duotone.webp";
export const AUTH_HERO_PATTERN_DARK = "/patterns/paisley-dark-duotone.webp";

export function getStoredColorScheme(): ColorScheme {
  if (typeof window === "undefined") return "light";
  try {
    return localStorage.getItem(COLOR_SCHEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function parseColorScheme(
  value: string | null | undefined,
): ColorScheme | null {
  return value === "dark" || value === "light" ? value : null;
}

/** Mode currently painted on the page (html.dark), else the stored preference. */
export function getLiveColorScheme(): ColorScheme {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) {
    return "dark";
  }
  return getStoredColorScheme();
}

/**
 * Auth screens: query handoff from the page they left, else localStorage, else light.
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
  return parseColorScheme(raw) ?? getStoredColorScheme();
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
  root.style.colorScheme = scheme;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-switching");
    });
  });
}

export function setColorScheme(scheme: ColorScheme): void {
  try {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
  } catch {
    /* private mode */
  }
  applyColorScheme(scheme);
  window.dispatchEvent(new Event(COLOR_SCHEME_CHANGED_EVENT));
}

export function toggleColorScheme(): ColorScheme {
  const next: ColorScheme =
    getStoredColorScheme() === "dark" ? "light" : "dark";
  setColorScheme(next);
  return next;
}

/**
 * Inline boot script — set class before first paint, and preload the active
 * hero paisley so `background-image` does not flash in after layout.
 * `/login` honors `?scheme=` from the page they clicked from; otherwise
 * localStorage; otherwise light.
 */
export const colorSchemeBootScript = `(function(){var dark=false;try{var q=null;if(location.pathname==="/login"){q=new URLSearchParams(location.search).get(${JSON.stringify(COLOR_SCHEME_QUERY_PARAM)})}if(q==="dark")dark=true;else if(q==="light")dark=false;else dark=localStorage.getItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)})==="dark"}catch(e){}var root=document.documentElement;if(dark){root.classList.add("dark");root.style.colorScheme="dark"}else{root.classList.remove("dark");root.style.colorScheme="light"}var auth=location.pathname==="/login";var active=auth?(dark?${JSON.stringify(AUTH_HERO_PATTERN_DARK)}:${JSON.stringify(AUTH_HERO_PATTERN_LIGHT)}):(dark?${JSON.stringify(HOME_HERO_PATTERN_DARK)}:${JSON.stringify(HOME_HERO_PATTERN_LIGHT)});var img=new Image();img.fetchPriority="high";img.src=active})();`;

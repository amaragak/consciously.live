/**
 * Appearance. Default is light; user choice is stored in localStorage
 * and applied as `class="dark"` / `class="hybrid"` on `<html>`
 * (not `prefers-color-scheme`). Hybrid starts as a copy of light.
 */

export type ColorScheme = "light" | "dark" | "hybrid";

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
];

/** Hero paisley tiles — keep in sync with `--home-hero-pattern` in theme-colors. */
export const HOME_HERO_PATTERN_LIGHT =
  "/patterns/paisley-tile-800-offwhite.webp";
export const HOME_HERO_PATTERN_DARK =
  "/patterns/paisley-tile-800-tonal-navy.webp";
/** Auth screen tiles — amber duotone (light) / navy duotone (dark). */
export const AUTH_HERO_PATTERN_LIGHT = "/patterns/paisley-amber-duotone.webp";
export const AUTH_HERO_PATTERN_DARK = "/patterns/paisley-dark-duotone.webp";

export function parseColorScheme(
  value: string | null | undefined,
): ColorScheme | null {
  return value === "dark" || value === "light" || value === "hybrid"
    ? value
    : null;
}

export function getStoredColorScheme(): ColorScheme {
  if (typeof window === "undefined") return "light";
  try {
    return parseColorScheme(localStorage.getItem(COLOR_SCHEME_STORAGE_KEY)) ?? "light";
  } catch {
    return "light";
  }
}

/** Mode currently painted on the page, else the stored preference. */
export function getLiveColorScheme(): ColorScheme {
  if (typeof document !== "undefined") {
    const root = document.documentElement.classList;
    if (root.contains("dark")) return "dark";
    if (root.contains("hybrid")) return "hybrid";
  }
  return getStoredColorScheme();
}

export function isDarkColorScheme(scheme: ColorScheme): boolean {
  return scheme === "dark";
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
  root.classList.toggle("hybrid", scheme === "hybrid");
  root.style.colorScheme = scheme === "dark" ? "dark" : "light";
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
  const cur = getStoredColorScheme();
  const next: ColorScheme =
    cur === "light" ? "dark" : cur === "dark" ? "hybrid" : "light";
  setColorScheme(next);
  return next;
}

/**
 * Inline boot script — set class before first paint, and preload the active
 * hero paisley so `background-image` does not flash in after layout.
 * `/login` honors `?scheme=` from the page they clicked from; otherwise
 * localStorage; otherwise light.
 */
export const colorSchemeBootScript = `(function(){var scheme="light";try{var q=null;if(location.pathname==="/login"){q=new URLSearchParams(location.search).get(${JSON.stringify(COLOR_SCHEME_QUERY_PARAM)})}var parsed=q==="dark"||q==="light"||q==="hybrid"?q:null;if(parsed)scheme=parsed;else{var s=localStorage.getItem(${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)});if(s==="dark"||s==="hybrid")scheme=s}}catch(e){}var root=document.documentElement;root.classList.toggle("dark",scheme==="dark");root.classList.toggle("hybrid",scheme==="hybrid");root.style.colorScheme=scheme==="dark"?"dark":"light";var auth=location.pathname==="/login";var dark=scheme==="dark";var active=auth?(dark?${JSON.stringify(AUTH_HERO_PATTERN_DARK)}:${JSON.stringify(AUTH_HERO_PATTERN_LIGHT)}):(dark?${JSON.stringify(HOME_HERO_PATTERN_DARK)}:${JSON.stringify(HOME_HERO_PATTERN_LIGHT)});var img=new Image();img.fetchPriority="high";img.src=active})();`;

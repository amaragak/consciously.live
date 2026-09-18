/**
 * App vs marketing route helpers — auth gating and post-login redirects.
 */

import {
  appHref,
  isSpaAppPath,
  spaPathForAppPath,
} from "@/lib/app-origins";

const AUTH_NEXT_STORAGE_KEY = "mm_auth_next_v1";

/** Same-origin path only (no protocol-relative URLs). */
export function safeAuthNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || typeof raw !== "string") return fallback;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return fallback;
  // Block auth loops.
  if (
    t === "/login" ||
    t.startsWith("/login?") ||
    t.startsWith("/auth/")
  ) {
    return fallback;
  }
  return t;
}

export function rememberAuthNext(path: string): void {
  if (typeof window === "undefined") return;
  const next = safeAuthNext(path, "");
  if (!next) return;
  try {
    window.sessionStorage.setItem(AUTH_NEXT_STORAGE_KEY, next);
  } catch {
    /* */
  }
}

export function consumeAuthNext(fallback = "/"): string {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(AUTH_NEXT_STORAGE_KEY);
    window.sessionStorage.removeItem(AUTH_NEXT_STORAGE_KEY);
    return safeAuthNext(raw, fallback);
  } catch {
    return fallback;
  }
}

export function peekAuthNext(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_NEXT_STORAGE_KEY);
    const next = safeAuthNext(raw, "");
    return next || null;
  } catch {
    return null;
  }
}

type PrefixRule = {
  /** Path prefix that requires a signed-in session. */
  prefix: string;
  /** Marketing page to land on when gated. */
  marketing: string;
};

const PROTECTED_PREFIXES: PrefixRule[] = [
  { prefix: "/chat/my", marketing: "/chat" },
  { prefix: "/meditate/create", marketing: "/meditate" },
  { prefix: "/meditate/library", marketing: "/meditate" },
  { prefix: "/meditate/sounds", marketing: "/meditate" },
  { prefix: "/create", marketing: "/meditate" },
  { prefix: "/journal/my", marketing: "/journal" },
  { prefix: "/manifest/my", marketing: "/manifest" },
  { prefix: "/manifest/goal", marketing: "/manifest" },
  { prefix: "/ideate/my", marketing: "/manifest" },
  { prefix: "/ideate/goal", marketing: "/manifest" },
  { prefix: "/dream/my", marketing: "/manifest" },
  { prefix: "/dream/goal", marketing: "/manifest" },
  { prefix: "/plan/goal", marketing: "/manifest" },
  { prefix: "/plan/my", marketing: "/manifest" },
  { prefix: "/focus/my", marketing: "/focus" },
  { prefix: "/admin", marketing: "/" },
  { prefix: "/schedule", marketing: "/" },
  { prefix: "/analytics", marketing: "/" },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedAppPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] || pathname;
  return PROTECTED_PREFIXES.some((r) => matchesPrefix(path, r.prefix));
}

/** Protected Manifest (and legacy ideate/dream/plan) routes — own their loading UI. */
const MANIFEST_APP_PREFIXES = [
  "/manifest/my",
  "/manifest/goal",
  "/ideate/my",
  "/ideate/goal",
  "/dream/my",
  "/dream/goal",
  "/plan/my",
  "/plan/goal",
] as const;

export function isManifestAppPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] || pathname;
  return MANIFEST_APP_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
}

export function marketingFallbackForPath(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] || pathname;
  for (const r of PROTECTED_PREFIXES) {
    if (matchesPrefix(path, r.prefix)) return r.marketing;
  }
  return "/";
}

/**
 * Build marketing URL with sign-in overlay + return path.
 * e.g. /manifest?signin=1&next=%2Fmanifest%2Fmy
 */
export function marketingSignInUrl(
  pathname: string,
  search = "",
): string {
  const full = `${pathname}${search || ""}`;
  const marketing = marketingFallbackForPath(pathname);
  const params = new URLSearchParams();
  params.set("signin", "1");
  params.set("next", safeAuthNext(full, marketing));
  return `${marketing}?${params.toString()}`;
}

export function isPublicAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/auth/")
  );
}

/**
 * Marketing section roots → app destinations for signed-in users.
 * Exact path only (not nested routes). `/` is not listed — signed-in home
 * redirects to the SPA in `app/page.tsx` so the marketing landing stays public.
 */
const MARKETING_ROOT_APP_DESTINATIONS: Record<string, string> = {
  "/meditate": "__SPA__/meditate/library/creations",
  "/journal": "__SPA__/journal/my",
  "/manifest": "__SPA__/manifest/my",
  "/ideate": "__SPA__/manifest/my",
  "/dream": "__SPA__/manifest/my",
  "/plan": "__SPA__/manifest/my",
  "/focus": "__SPA__/focus",
  "/chat": "__SPA__/chat/my",
};

/** Normalize pathname (no query/hash, no trailing slash except `/`). */
export function normalizeAppPathname(pathname: string): string {
  const path = pathname.split("?")[0]?.split("#")[0] || pathname;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

/**
 * If this marketing root should bounce signed-in users into the app, return
 * the destination. Otherwise null (`/` is handled in `app/page.tsx`).
 */
export function signedInDestinationForMarketingRoot(
  pathname: string,
): string | null {
  const path = normalizeAppPathname(pathname);
  const dest = MARKETING_ROOT_APP_DESTINATIONS[path];
  if (!dest) return null;
  if (dest.startsWith("__SPA__/")) {
    return appHref(`/${dest.slice("__SPA__/".length)}`);
  }
  return dest;
}

/**
 * After magic-link verify: SPA-moved paths (and signed-in home `/`) go to the
 * Vite app; everything else stays on marketing until that section is migrated.
 */
export function postAuthDestination(fallback = "/"): string {
  const next = consumeAuthNext(fallback);
  if (next === "/" || isSpaAppPath(next)) {
    return appHref(spaPathForAppPath(next));
  }
  return next;
}


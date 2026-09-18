/**
 * Cross-origin app (Vite SPA) vs marketing (Next) origins.
 * Local: scripts/dev-web writes NEXT_PUBLIC_APP_ORIGIN into .env.local.
 * Prod: consciously.live ↔ app.consciously.live
 */

export function getAppOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim().replace(/\/$/, "");
  // On localhost marketing, never bounce to a remote SPA (CloudFront / prod) —
  // that origin has no local session and shows a confusing "sign in" shell.
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      if (
        fromEnv &&
        (fromEnv.includes("localhost") || fromEnv.includes("127.0.0.1"))
      ) {
        return fromEnv;
      }
      return "http://localhost:5173";
    }
  }
  if (fromEnv) return fromEnv;
  return "https://app.consciously.live";
}

export function getMarketingOrigin(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "https://consciously.live";
}

/** Absolute URL on the SPA (path must start with `/`). */
export function appHref(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getAppOrigin()}${p}`;
}

/** True when marketing and SPA are on different origins (local split or prod split). */
export function isCrossOriginApp(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return new URL(getAppOrigin()).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function pathMatches(path: string, exactOrPrefix: string): boolean {
  return path === exactOrPrefix || path.startsWith(`${exactOrPrefix}/`);
}

/** Routes already moved to frontend/webapp — post-auth and nav should cross-origin. */
export function isSpaAppPath(pathname: string): boolean {
  const path = pathname.split("?")[0]?.split("#")[0] || pathname;
  if (pathMatches(path, "/focus") || path === "/focus/my") return true;
  if (pathMatches(path, "/journal/my")) return true;
  if (pathMatches(path, "/manifest/my") || pathMatches(path, "/manifest/goal")) {
    return true;
  }
  // Legacy Manifest aliases
  if (
    pathMatches(path, "/ideate/my") ||
    pathMatches(path, "/ideate/goal") ||
    pathMatches(path, "/dream/my") ||
    pathMatches(path, "/dream/goal") ||
    pathMatches(path, "/plan/my") ||
    pathMatches(path, "/plan/goal")
  ) {
    return true;
  }
  if (
    pathMatches(path, "/meditate/create") ||
    pathMatches(path, "/meditate/library") ||
    pathMatches(path, "/meditate/sounds")
  ) {
    return true;
  }
  if (path === "/create") return true;
  // Public marketing Community library: `/library`, `/library/[slug]` stay here.
  // Logged-in library is `/meditate/library/*` on the SPA.
  if (pathMatches(path, "/chat/my")) return true;
  if (pathMatches(path, "/admin")) return true;
  if (pathMatches(path, "/settings")) return true;
  if (pathMatches(path, "/schedule")) return true;
  if (pathMatches(path, "/analytics")) return true;
  // `/` stays on marketing for logged-out landing; signed-in home redirects in page.tsx.
  return false;
}

/**
 * Map a marketing path onto the SPA equivalent.
 * Focus: `/focus/my` → `/focus`. Journal/Manifest/Create keep shapes (or map legacy → manifest).
 */
export function spaPathForAppPath(pathname: string): string {
  const [path, qs] = pathname.split("?");
  let base = path || "/";
  if (base === "/focus/my" || base.startsWith("/focus/my/")) {
    base = base.replace(/^\/focus\/my/, "/focus");
  } else if (base.startsWith("/ideate/")) {
    base = base.replace(/^\/ideate/, "/manifest");
  } else if (base.startsWith("/dream/")) {
    base = base.replace(/^\/dream/, "/manifest");
  } else if (base.startsWith("/plan/")) {
    base = base.replace(/^\/plan/, "/manifest");
  } else if (base === "/create") {
    base = "/meditate/create";
  } else if (base === "/analytics" || base.startsWith("/analytics/")) {
    base = "/admin/analytics";
  }
  return qs ? `${base}?${qs}` : base;
}

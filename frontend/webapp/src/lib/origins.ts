/**
 * Cross-origin helpers for the Vite SPA.
 * Local: VITE_MARKETING_ORIGIN from scripts/dev-web (.env.local).
 * Prod: https://consciously.live
 */

import { brand } from "@consciously/common";

export function getMarketingOrigin(): string {
  const fromEnv = import.meta.env.VITE_MARKETING_ORIGIN?.trim().replace(
    /\/$/,
    "",
  );
  // On localhost SPA, never send "Sign in" links to prod marketing —
  // that origin has no shared session with local Vite.
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      if (
        fromEnv &&
        (fromEnv.includes("localhost") || fromEnv.includes("127.0.0.1"))
      ) {
        return fromEnv;
      }
      return "http://localhost:3000";
    }
  }
  if (fromEnv) return fromEnv;
  return brand.marketingOrigin;
}

/** Absolute URL on the marketing site (path must start with `/`). */
export function marketingHref(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getMarketingOrigin()}${p}`;
}

export function isLocalDevSplit(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

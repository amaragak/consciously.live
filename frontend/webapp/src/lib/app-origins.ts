/**
 * Cross-origin helpers for SPA chrome (ported from marketing app-origins).
 * On the SPA, "app" links are same-origin; marketing links use VITE_MARKETING_ORIGIN.
 */

import { marketingHref, getMarketingOrigin } from "@/lib/origins";

export function getAppOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://app.consciously.live";
}

export { getMarketingOrigin, marketingHref };

/** Absolute URL on this SPA (path must start with `/`). */
export function appHref(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") return `${window.location.origin}${p}`;
  return p;
}

/** SPA is already the app origin — never cross-origin from itself. */
export function isCrossOriginApp(): boolean {
  return false;
}

export function isSpaAppPath(_pathname: string): boolean {
  return true;
}

export function spaPathForAppPath(pathname: string): string {
  return pathname;
}

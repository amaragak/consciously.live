/**
 * Cross-origin navigation: marketing → SPA with a one-time session handoff.
 *
 * Never hard-nav to the SPA without a handoff code when origins differ —
 * that dumps people into a signed-out shell on the other port/domain.
 */

import { AUTH_HANDOFF_QUERY } from "@consciously/common";
import { appHref, isCrossOriginApp } from "@/lib/app-origins";
import { createAuthHandoff } from "@/lib/medimade-api";

/**
 * Absolute SPA URL with handoff when origins differ.
 * Returns null if a cross-origin handoff could not be minted (caller must stay put).
 */
export async function spaHrefWithHandoff(path: string): Promise<string | null> {
  const dest = appHref(path);
  if (!isCrossOriginApp()) return dest;
  try {
    const code = await createAuthHandoff();
    const url = new URL(dest);
    url.searchParams.set(AUTH_HANDOFF_QUERY, code);
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Hard-navigate to the SPA, minting a handoff when crossing origins.
 * @returns false when cross-origin handoff failed (no navigation).
 */
export async function navigateToSpa(path: string): Promise<boolean> {
  const href = await spaHrefWithHandoff(path);
  if (!href) return false;
  window.location.replace(href);
  return true;
}

/**
 * After login / verify / guest: if `dest` is an absolute SPA URL, attach handoff;
 * otherwise same-origin assign.
 * @returns false when a required cross-origin handoff could not be minted.
 */
export async function navigateAuthDestination(dest: string): Promise<boolean> {
  if (/^https?:\/\//i.test(dest)) {
    try {
      const u = new URL(dest);
      const withHandoff = await spaHrefWithHandoff(
        `${u.pathname}${u.search}${u.hash}`,
      );
      if (!withHandoff) return false;
      window.location.replace(withHandoff);
      return true;
    } catch {
      return false;
    }
  }
  window.location.assign(dest.startsWith("/") ? dest : `/${dest}`);
  return true;
}

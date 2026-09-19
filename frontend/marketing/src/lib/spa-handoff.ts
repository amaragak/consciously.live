/**
 * Cross-origin navigation: marketing → SPA with a one-time session handoff.
 *
 * Never hard-nav to the SPA without a handoff code when origins differ —
 * that dumps people into a signed-out shell on the other port/domain.
 */

import { AUTH_HANDOFF_QUERY } from "@consciously/common";
import { appHref, isCrossOriginApp } from "@/lib/app-origins";
import { createAuthHandoff } from "@/lib/medimade-api";

export class SpaHandoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpaHandoffError";
  }
}

/**
 * Absolute SPA URL with handoff when origins differ.
 * Throws SpaHandoffError if a cross-origin handoff could not be minted.
 */
export async function spaHrefWithHandoff(path: string): Promise<string> {
  const dest = appHref(path);
  if (!isCrossOriginApp()) return dest;
  try {
    const code = await createAuthHandoff();
    const url = new URL(dest);
    url.searchParams.set(AUTH_HANDOFF_QUERY, code);
    return url.toString();
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim()
        ? err.message.trim()
        : "Could not create handoff";
    // Stale JWT after API stack cutover is the usual cause.
    if (/invalid or expired session|authorization bearer|unauthorized|401/i.test(detail)) {
      throw new SpaHandoffError(
        "Your session is out of date after the backend switch. Sign in again, then open the app.",
      );
    }
    throw new SpaHandoffError(detail);
  }
}

/**
 * Hard-navigate to the SPA, minting a handoff when crossing origins.
 * @returns false when cross-origin handoff failed (no navigation).
 */
export async function navigateToSpa(path: string): Promise<boolean> {
  try {
    const href = await spaHrefWithHandoff(path);
    window.location.replace(href);
    return true;
  } catch {
    return false;
  }
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
      window.location.replace(withHandoff);
      return true;
    } catch {
      return false;
    }
  }
  window.location.assign(dest.startsWith("/") ? dest : `/${dest}`);
  return true;
}

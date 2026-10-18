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
    throw new SpaHandoffError(detail);
  }
}

/**
 * Hard-navigate to the SPA, minting a handoff when crossing origins.
 * If the handoff cannot be minted, open the app anyway. No error is shown.
 */
export async function navigateToSpa(path: string): Promise<boolean> {
  window.location.assign(await spaHrefOrDirect(path));
  return true;
}

/** Hard-navigate to the SPA. Never surfaces a handoff failure to the page. */
export async function navigateToSpaOrThrow(path: string): Promise<void> {
  window.location.assign(await spaHrefOrDirect(path));
}

/** Handoff when we can. Otherwise open the app directly, with no error copy. */
async function spaHrefOrDirect(path: string): Promise<string> {
  try {
    return await spaHrefAfterRefresh(path);
  } catch {
    return appHref(path);
  }
}

async function spaHrefAfterRefresh(path: string): Promise<string> {
  try {
    return await spaHrefWithHandoff(path);
  } catch (first) {
    let refreshed = false;
    try {
      const { ensureMedimadeSession } = await import("@/lib/auth-session");
      refreshed = await ensureMedimadeSession({ force: true });
    } catch {
      refreshed = false;
    }
    if (!refreshed) throw first;
    return await spaHrefWithHandoff(path);
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

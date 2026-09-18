/**
 * Cross-origin navigation: marketing → SPA with a one-time session handoff.
 */

import { AUTH_HANDOFF_QUERY } from "@consciously/common";
import { appHref, isCrossOriginApp } from "@/lib/app-origins";
import { createAuthHandoff } from "@/lib/medimade-api";

/** Absolute SPA URL, optionally with a fresh handoff code when origins differ. */
export async function spaHrefWithHandoff(path: string): Promise<string> {
  const dest = appHref(path);
  if (!isCrossOriginApp()) return dest;
  try {
    const code = await createAuthHandoff();
    const url = new URL(dest);
    url.searchParams.set(AUTH_HANDOFF_QUERY, code);
    return url.toString();
  } catch {
    return dest;
  }
}

/** Hard-navigate to the SPA, minting a handoff when crossing origins. */
export async function navigateToSpa(path: string): Promise<void> {
  const href = await spaHrefWithHandoff(path);
  window.location.replace(href);
}

/**
 * After login / verify / guest: if `dest` is an absolute SPA URL, attach handoff;
 * otherwise same-origin assign.
 */
export async function navigateAuthDestination(dest: string): Promise<void> {
  if (/^https?:\/\//i.test(dest)) {
    try {
      const u = new URL(dest);
      const withHandoff = await spaHrefWithHandoff(
        `${u.pathname}${u.search}${u.hash}`,
      );
      window.location.replace(withHandoff);
    } catch {
      window.location.replace(dest);
    }
    return;
  }
  window.location.assign(dest.startsWith("/") ? dest : `/${dest}`);
}

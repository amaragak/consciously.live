/**
 * SPA boot: redeem `?mm_handoff=` from marketing into this origin's localStorage.
 */

import { AUTH_HANDOFF_QUERY } from "@consciously/common";
import { setMedimadeSession } from "@/lib/auth-session";
import { redeemAuthHandoff } from "@/lib/medimade-api";

/**
 * If the URL has a handoff code, redeem it once and strip the query param.
 * Returns true when a session was established from handoff.
 */
export async function consumeAuthHandoffFromUrl(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get(AUTH_HANDOFF_QUERY)?.trim() ?? "";
  if (!code) return false;

  url.searchParams.delete(AUTH_HANDOFF_QUERY);
  const cleaned = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, "", cleaned);

  try {
    const session = await redeemAuthHandoff(code);
    setMedimadeSession(
      session.token,
      session.email || null,
      session.displayName,
      session.refreshToken ?? null,
    );
    return true;
  } catch {
    return false;
  }
}

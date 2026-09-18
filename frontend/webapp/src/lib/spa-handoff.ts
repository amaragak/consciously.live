/**
 * SPA boot: redeem `?mm_handoff=` from marketing into this origin's localStorage.
 *
 * Strict Mode remounts (and fast navigations) strip the query before redeem
 * finishes — stash the code in sessionStorage and single-flight the redeem so
 * we never flash the signed-out shell mid-handoff.
 */

import { AUTH_HANDOFF_QUERY } from "@consciously/common";
import { setMedimadeSession } from "@/lib/auth-session";
import { redeemAuthHandoff } from "@/lib/medimade-api";

const HANDOFF_STASH_KEY = "mm_handoff_pending_v1";

let handoffInflight: Promise<boolean> | null = null;

function readStashedHandoff(): string {
  try {
    return sessionStorage.getItem(HANDOFF_STASH_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function stashHandoff(code: string): void {
  try {
    sessionStorage.setItem(HANDOFF_STASH_KEY, code);
  } catch {
    /* */
  }
}

function clearStashedHandoff(): void {
  try {
    sessionStorage.removeItem(HANDOFF_STASH_KEY);
  } catch {
    /* */
  }
}

/** True when a handoff redeem is in flight or still pending in the URL/stash. */
export function hasPendingAuthHandoff(): boolean {
  if (typeof window === "undefined") return false;
  if (handoffInflight) return true;
  const url = new URL(window.location.href);
  if (url.searchParams.get(AUTH_HANDOFF_QUERY)?.trim()) return true;
  return Boolean(readStashedHandoff());
}

/**
 * If the URL (or stash) has a handoff code, redeem it once and strip the query.
 * Returns true when a session was established from handoff.
 */
export async function consumeAuthHandoffFromUrl(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (handoffInflight) return handoffInflight;

  handoffInflight = (async () => {
    const url = new URL(window.location.href);
    let code = url.searchParams.get(AUTH_HANDOFF_QUERY)?.trim() ?? "";
    if (code) {
      stashHandoff(code);
      url.searchParams.delete(AUTH_HANDOFF_QUERY);
      const cleaned = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(null, "", cleaned);
    } else {
      code = readStashedHandoff();
    }
    if (!code) return false;

    try {
      const session = await redeemAuthHandoff(code);
      setMedimadeSession(
        session.token,
        session.email || null,
        session.displayName,
        session.refreshToken ?? null,
      );
      clearStashedHandoff();
      return true;
    } catch {
      clearStashedHandoff();
      return false;
    }
  })();

  try {
    return await handoffInflight;
  } finally {
    handoffInflight = null;
  }
}

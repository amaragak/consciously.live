/**
 * Sign in with Apple on the web (Apple JS, popup) → POST /auth/social.
 * Uses the native app's Services ID, so one Apple ID is one account on both.
 * The Services ID's Return URLs must include this origin's /login.
 */
import { setMedimadeSession } from "@/lib/auth-session";
import {
  signInWithSocialIdToken,
  type MedimadeMagicLinkVerifyResult,
} from "@/lib/medimade-api";

const APPLE_JS =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

type AppleSignInResponse = {
  authorization: { id_token: string };
  user?: { name?: { firstName?: string; lastName?: string } };
};

type AppleIdGlobal = {
  auth: {
    init: (opts: Record<string, unknown>) => void;
    signIn: () => Promise<AppleSignInResponse>;
  };
};

let loading: Promise<AppleIdGlobal> | null = null;

function loadAppleJs(): Promise<AppleIdGlobal> {
  const w = window as unknown as { AppleID?: AppleIdGlobal };
  if (w.AppleID) return Promise.resolve(w.AppleID);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = APPLE_JS;
    script.async = true;
    script.onload = () =>
      w.AppleID ? resolve(w.AppleID) : reject(new Error("Apple sign-in didn’t load"));
    script.onerror = () => {
      loading = null;
      reject(new Error("Apple sign-in didn’t load"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The user closed the Apple popup (not an error to show). */
export function isAppleCancel(err: unknown): boolean {
  const code = (err as { error?: string } | null)?.error;
  return code === "popup_closed_by_user" || code === "user_cancelled_authorize";
}

export async function signInWithAppleWeb(
  servicesId: string,
): Promise<MedimadeMagicLinkVerifyResult> {
  const AppleID = await loadAppleJs();
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  AppleID.auth.init({
    clientId: servicesId,
    scope: "name email",
    redirectURI: `${window.location.origin}/login`,
    usePopup: true,
    nonce: await sha256Hex(nonce),
  });
  const res = await AppleID.auth.signIn();
  const first = res.user?.name?.firstName ?? "";
  const last = res.user?.name?.lastName ?? "";
  const session = await signInWithSocialIdToken({
    provider: "apple",
    idToken: res.authorization.id_token,
    nonce,
    name: `${first} ${last}`.trim() || null,
  });
  setMedimadeSession(
    session.token,
    session.email,
    session.displayName,
    session.refreshToken ?? null,
  );
  return session;
}

/**
 * Cognito Hosted UI / Managed Login (authorization code + PKCE).
 * After Cognito returns, we exchange the ID token for a Medimade session JWT.
 */

import {
  exchangeCognitoIdToken,
  fetchCognitoAuthConfig,
  type CognitoAuthConfig,
  type MedimadeMagicLinkVerifyResult,
} from "@/lib/medimade-api";

const PKCE_STORAGE_KEY = "consciously.cognito.pkce";

type PkceState = {
  verifier: string;
  state: string;
  next: string;
};

function randomUrlSafe(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64Url(buf);
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(plain: string): Promise<string> {
  const data = new TextEncoder().encode(plain);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64Url(digest);
}

function callbackUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/auth/cognito/callback`;
}

/**
 * CDK `UserPoolDomain.domainName` is only the prefix (e.g. `consciously-v2-…`).
 * Hosted UI lives at `{prefix}.auth.{region}.amazoncognito.com`.
 */
function cognitoHostedUiHost(config: CognitoAuthConfig): string {
  const host = (config.domain ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (!host) {
    throw new Error("Cognito sign-in is not configured yet");
  }
  if (host.includes(".")) return host;
  const region = config.region?.trim();
  if (!region) {
    throw new Error("Cognito sign-in is not configured yet");
  }
  return `${host}.auth.${region}.amazoncognito.com`;
}

function readPkce(): PkceState | null {
  try {
    const raw = sessionStorage.getItem(PKCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PkceState>;
    if (
      typeof parsed.verifier !== "string" ||
      typeof parsed.state !== "string" ||
      typeof parsed.next !== "string"
    ) {
      return null;
    }
    return {
      verifier: parsed.verifier,
      state: parsed.state,
      next: parsed.next,
    };
  } catch {
    return null;
  }
}

function clearPkce(): void {
  try {
    sessionStorage.removeItem(PKCE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Start Cognito Hosted UI (password / passkey / optional IdP like Google). */
export async function beginCognitoHostedLogin(
  nextPath = "/",
  opts?: { identityProvider?: string },
): Promise<void> {
  const config = await fetchCognitoAuthConfig();
  if (!config.enabled || !config.clientId || !config.domain) {
    throw new Error("Cognito sign-in is not configured yet");
  }
  const verifier = randomUrlSafe(32);
  const challenge = await sha256Base64Url(verifier);
  const state = randomUrlSafe(16);
  const next = nextPath.trim() || "/";
  sessionStorage.setItem(
    PKCE_STORAGE_KEY,
    JSON.stringify({ verifier, state, next } satisfies PkceState),
  );

  const url = new URL(`https://${cognitoHostedUiHost(config)}/oauth2/authorize`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  const idp = opts?.identityProvider?.trim();
  if (idp) {
    url.searchParams.set("identity_provider", idp);
  }
  window.location.assign(url.toString());
}

export type CognitoCallbackResult = {
  session: MedimadeMagicLinkVerifyResult;
  next: string;
  config: CognitoAuthConfig;
};

/** Finish Hosted UI: code → Cognito tokens → Medimade session. */
export async function completeCognitoHostedLogin(
  code: string,
  stateFromQuery: string | null,
): Promise<CognitoCallbackResult> {
  const pkce = readPkce();
  if (!pkce) {
    throw new Error("Sign-in session expired. Start again from the login page.");
  }
  if (stateFromQuery && stateFromQuery !== pkce.state) {
    clearPkce();
    throw new Error("Sign-in state mismatch. Start again from the login page.");
  }

  const config = await fetchCognitoAuthConfig();
  if (!config.enabled || !config.clientId || !config.domain) {
    clearPkce();
    throw new Error("Cognito sign-in is not configured yet");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code: code.trim(),
    redirect_uri: callbackUrl(),
    code_verifier: pkce.verifier,
  });
  const tokenRes = await fetch(`https://${cognitoHostedUiHost(config)}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenRes.ok || typeof tokenJson.id_token !== "string" || !tokenJson.id_token.trim()) {
    clearPkce();
    throw new Error(
      tokenJson.error_description ||
        tokenJson.error ||
        "Could not complete Cognito sign-in",
    );
  }

  const session = await exchangeCognitoIdToken(tokenJson.id_token.trim());
  const next = pkce.next;
  clearPkce();
  return { session, next, config };
}

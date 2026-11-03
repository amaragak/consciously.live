/**
 * Native Sign in with Apple (iOS) and Google (iOS + Android) via
 * @capgo/capacitor-social-login. The provider ID token goes to POST /auth/social.
 */
import { SocialLogin } from "@capgo/capacitor-social-login";
import {
  signInWithSocialIdToken,
  type CognitoAuthConfig,
  type MedimadeMagicLinkVerifyResult,
} from "@/lib/medimade-api";
import { nativePlatform } from "@/lib/native/native-bridge";

export type NativeSocialProvider = "apple" | "google";

let initialized: string | null = null;

async function ensureInitialized(config: CognitoAuthConfig): Promise<void> {
  const clients = config.socialClients;
  const key = JSON.stringify(clients ?? {});
  if (initialized === key) return;
  const ios = nativePlatform() === "ios";
  await SocialLogin.initialize({
    ...(ios ? { apple: {} } : {}),
    ...(clients?.googleWebClientId
      ? {
          google: {
            webClientId: clients.googleWebClientId,
            ...(ios && clients.googleIosClientId
              ? { iOSClientId: clients.googleIosClientId }
              : {}),
            mode: "online" as const,
          },
        }
      : {}),
  });
  initialized = key;
}

/** Which buttons the native auth screens should show. */
export function nativeSocialProviders(config: CognitoAuthConfig | null): {
  apple: boolean;
  google: boolean;
} {
  const ios = nativePlatform() === "ios";
  const clients = config?.socialClients;
  return {
    apple: ios && config?.methods.appleNative === true,
    google: Boolean(
      clients?.googleWebClientId && (!ios || clients.googleIosClientId),
    ),
  };
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the user closed the Apple / Google sheet (not an error to show). */
export function isSocialCancel(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /cancel|1001|12501|user closed|dismiss/i.test(msg);
}

export async function nativeSocialSignIn(
  provider: NativeSocialProvider,
  config: CognitoAuthConfig,
): Promise<MedimadeMagicLinkVerifyResult> {
  await ensureInitialized(config);

  if (provider === "apple") {
    const nonce = randomNonce();
    const res = await SocialLogin.login({
      provider: "apple",
      options: { scopes: ["name", "email"], nonce: await sha256Hex(nonce) },
    });
    const idToken = res.result.idToken;
    if (!idToken) throw new Error("Apple didn’t return a sign-in token");
    const { givenName, familyName } = res.result.profile;
    const name = [givenName, familyName].filter(Boolean).join(" ").trim();
    return signInWithSocialIdToken({ provider: "apple", idToken, nonce, name });
  }

  const res = await SocialLogin.login({
    provider: "google",
    options: { scopes: ["email", "profile"] },
  });
  const result = res.result;
  if (result.responseType !== "online" || !result.idToken) {
    throw new Error("Google didn’t return a sign-in token");
  }
  const { givenName, familyName } = result.profile;
  const name = [givenName, familyName].filter(Boolean).join(" ").trim();
  return signInWithSocialIdToken({ provider: "google", idToken: result.idToken, name });
}

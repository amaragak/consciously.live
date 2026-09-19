/**
 * Cognito passkeys (WebAuthn) on the custom login UI.
 * Register: StartWebAuthnRegistration → credentials.create → CompleteWebAuthnRegistration
 * Sign-in: USER_AUTH + WEB_AUTHN → credentials.get → RespondToAuthChallenge
 */

import type { CognitoAuthConfig } from "@/lib/medimade-api";
import {
  CognitoIdpError,
  type CognitoAuthTokens,
} from "@/lib/cognito-direct-auth";

type CognitoErrorBody = {
  __type?: string;
  message?: string;
};

type AuthResult = {
  AuthenticationResult?: {
    IdToken?: string;
    AccessToken?: string;
    RefreshToken?: string;
  };
  ChallengeName?: string;
  Session?: string;
  AvailableChallenges?: string[];
  ChallengeParameters?: Record<string, string>;
};

function errorType(raw: string | undefined): string {
  const t = (raw ?? "").trim();
  const hash = t.lastIndexOf("#");
  return hash >= 0 ? t.slice(hash + 1) : t;
}

function friendlyWebAuthnMessage(type: string, fallback: string): string {
  switch (type) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "No passkey is set up for this account, or the email isn’t right.";
    case "WebAuthnNotEnabledException":
    case "WebAuthnConfigurationMissingException":
    case "OperationNotEnabledException":
      return "Passkeys aren’t enabled for this sign-in yet.";
    case "WebAuthnChallengeNotFoundException":
      return "That passkey prompt expired. Try again.";
    case "WebAuthnCredentialNotSupportedException":
      return "This device can’t create that kind of passkey.";
    case "LimitExceededException":
    case "TooManyRequestsException":
      return "Too many attempts. Wait a moment.";
    default:
      return fallback || "Could not use a passkey. Try again.";
  }
}

async function cognitoCall<T>(
  region: string,
  target: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as CognitoErrorBody & T;
  if (!res.ok) {
    const type = errorType(json.__type);
    throw new CognitoIdpError(
      type,
      friendlyWebAuthnMessage(
        type,
        typeof json.message === "string" ? json.message : "",
      ),
    );
  }
  return json;
}

function requireClient(config: CognitoAuthConfig): {
  clientId: string;
  region: string;
} {
  const clientId = config.clientId?.trim() ?? "";
  const region = config.region?.trim() ?? "";
  if (!config.enabled || !clientId || !region) {
    throw new Error("Cognito sign-in is not configured yet");
  }
  return { clientId, region };
}

function b64urlToBytes(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const bin = atob(padded + pad);
  const buffer = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return buffer;
}

function bytesToB64url(bytes: ArrayBuffer | ArrayBufferView): string {
  const u8 =
    bytes instanceof Uint8Array
      ? bytes
      : new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function webauthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function" &&
    typeof navigator.credentials?.get === "function"
  );
}

export function isPasskeySupported(): boolean {
  return webauthnSupported();
}

const ACCESS_TOKEN_KEY = "mm_cognito_access_v1";
const OFFER_SKIP_KEY = "mm_passkey_offer_skip_v1";

type StoredAccess = { token: string; exp: number };

export function rememberCognitoAccessToken(accessToken: string): void {
  const token = accessToken.trim();
  if (!token || typeof sessionStorage === "undefined") return;
  try {
    const stored: StoredAccess = { token, exp: Date.now() + 50 * 60 * 1000 };
    sessionStorage.setItem(ACCESS_TOKEN_KEY, JSON.stringify(stored));
  } catch {
    /* private mode */
  }
}

export function peekCognitoAccessToken(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ACCESS_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAccess>;
    if (typeof parsed.token !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp <= Date.now()) {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function skipPasskeyOfferThisSession(): void {
  try {
    sessionStorage.setItem(OFFER_SKIP_KEY, "1");
  } catch {
    /* */
  }
}

export function passkeyOfferSkippedThisSession(): boolean {
  try {
    return sessionStorage.getItem(OFFER_SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export async function cognitoHasPasskey(
  config: CognitoAuthConfig,
  accessToken: string,
): Promise<boolean> {
  const token = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!token) return false;
  const { region } = requireClient(config);
  const listed = await cognitoCall<{
    Credentials?: { CredentialId?: string }[];
  }>(region, "ListWebAuthnCredentials", { AccessToken: token });
  return (listed.Credentials ?? []).some((c) => Boolean(c.CredentialId));
}

function webauthnBrowserError(err: unknown): Error {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError" || err.name === "AbortError") {
      return new Error("Passkey was cancelled. Try again when you’re ready.");
    }
    if (err.name === "InvalidStateError") {
      return new Error("This device already has a passkey for this account.");
    }
    if (
      err.name === "SecurityError" ||
      err.name === "NotSupportedError" ||
      err.name === "NotReadableError"
    ) {
      return new Error(
        "Passkeys work on consciously.live in a supported browser.",
      );
    }
  }
  if (err instanceof CognitoIdpError || err instanceof Error) return err;
  return new Error("Could not use a passkey. Try again.");
}

function parseCreationOptions(
  raw: Record<string, unknown>,
): PublicKeyCredentialCreationOptions {
  const parse = (
    PublicKeyCredential as typeof PublicKeyCredential & {
      parseCreationOptionsFromJSON?: (
        value: unknown,
      ) => PublicKeyCredentialCreationOptions;
    }
  ).parseCreationOptionsFromJSON;
  if (typeof parse === "function") return parse(raw);
  const user = raw.user as {
    id: string;
    name: string;
    displayName: string;
  };
  const exclude =
    (raw.excludeCredentials as { id: string; type?: string }[] | undefined) ??
    [];
  return {
    challenge: b64urlToBytes(String(raw.challenge)),
    rp: raw.rp as PublicKeyCredentialCreationOptions["rp"],
    user: {
      id: b64urlToBytes(user.id),
      name: user.name,
      displayName: user.displayName,
    },
    pubKeyCredParams: (raw.pubKeyCredParams ?? []) as PublicKeyCredentialCreationOptions["pubKeyCredParams"],
    timeout: typeof raw.timeout === "number" ? raw.timeout : undefined,
    authenticatorSelection:
      raw.authenticatorSelection as PublicKeyCredentialCreationOptions["authenticatorSelection"],
    attestation: raw.attestation as PublicKeyCredentialCreationOptions["attestation"],
    excludeCredentials: exclude.map((cred) => ({
      type: "public-key" as const,
      id: b64urlToBytes(cred.id),
    })),
  };
}

function parseRequestOptions(
  raw: Record<string, unknown>,
): PublicKeyCredentialRequestOptions {
  const parse = (
    PublicKeyCredential as typeof PublicKeyCredential & {
      parseRequestOptionsFromJSON?: (
        value: unknown,
      ) => PublicKeyCredentialRequestOptions;
    }
  ).parseRequestOptionsFromJSON;
  if (typeof parse === "function") return parse(raw);
  const allow =
    (raw.allowCredentials as { id: string; type?: string; transports?: string[] }[] | undefined) ??
    [];
  return {
    challenge: b64urlToBytes(String(raw.challenge)),
    timeout: typeof raw.timeout === "number" ? raw.timeout : undefined,
    rpId: typeof raw.rpId === "string" ? raw.rpId : undefined,
    userVerification: raw.userVerification as UserVerificationRequirement | undefined,
    allowCredentials: allow.map((cred) => ({
      type: "public-key" as const,
      id: b64urlToBytes(cred.id),
      transports: cred.transports as AuthenticatorTransport[] | undefined,
    })),
  };
}

function credentialToJson(cred: PublicKeyCredential): Record<string, unknown> {
  const withJson = cred as PublicKeyCredential & {
    toJSON?: () => Record<string, unknown>;
  };
  if (typeof withJson.toJSON === "function") return withJson.toJSON();
  const response = cred.response;
  const base: Record<string, unknown> = {
    id: cred.id,
    rawId: bytesToB64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
  };
  if (response instanceof AuthenticatorAttestationResponse) {
    base.response = {
      clientDataJSON: bytesToB64url(response.clientDataJSON),
      attestationObject: bytesToB64url(response.attestationObject),
      transports:
        typeof response.getTransports === "function"
          ? response.getTransports()
          : undefined,
    };
  } else if (response instanceof AuthenticatorAssertionResponse) {
    base.response = {
      clientDataJSON: bytesToB64url(response.clientDataJSON),
      authenticatorData: bytesToB64url(response.authenticatorData),
      signature: bytesToB64url(response.signature),
      userHandle: response.userHandle
        ? bytesToB64url(response.userHandle)
        : null,
    };
  }
  return base;
}

function tokensFromAuth(result: AuthResult): CognitoAuthTokens {
  const idToken = result.AuthenticationResult?.IdToken?.trim() ?? "";
  const accessToken = result.AuthenticationResult?.AccessToken?.trim() ?? "";
  if (!idToken || !accessToken) {
    throw new Error("Cognito did not return a session. Try again.");
  }
  const refreshToken = result.AuthenticationResult?.RefreshToken?.trim();
  return {
    idToken,
    accessToken,
    refreshToken: refreshToken || undefined,
  };
}

export async function cognitoRegisterPasskey(
  config: CognitoAuthConfig,
  accessToken: string,
): Promise<void> {
  if (!webauthnSupported()) {
    throw new Error("This browser doesn’t support passkeys.");
  }
  const token = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!token) throw new Error("Sign in again, then set up a passkey.");
  const { region } = requireClient(config);
  try {
    const started = await cognitoCall<{
      CredentialCreationOptions?: Record<string, unknown>;
    }>(region, "StartWebAuthnRegistration", { AccessToken: token });
    const rawOptions = started.CredentialCreationOptions;
    const options =
      typeof rawOptions === "string"
        ? (JSON.parse(rawOptions) as Record<string, unknown>)
        : rawOptions;
    if (!options || typeof options !== "object") {
      throw new Error("Could not start passkey setup. Try again.");
    }
    const cred = (await navigator.credentials.create({
      publicKey: parseCreationOptions(options),
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error("Passkey was cancelled. Try again when you’re ready.");
    await cognitoCall(region, "CompleteWebAuthnRegistration", {
      AccessToken: token,
      Credential: credentialToJson(cred),
    });
    rememberCognitoAccessToken(token);
  } catch (err) {
    throw webauthnBrowserError(err);
  }
}

export async function cognitoPasskeySignIn(
  config: CognitoAuthConfig,
  email: string,
): Promise<CognitoAuthTokens> {
  if (!webauthnSupported()) {
    throw new Error("This browser doesn’t support passkeys.");
  }
  const username = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!username || !username.includes("@")) {
    throw new Error("Enter your email, then sign in with a passkey.");
  }
  const { clientId, region } = requireClient(config);
  try {
    let result = await cognitoCall<AuthResult>(region, "InitiateAuth", {
      AuthFlow: "USER_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: username,
        PREFERRED_CHALLENGE: "WEB_AUTHN",
      },
    });

    if (result.ChallengeName === "SELECT_CHALLENGE") {
      const available = result.AvailableChallenges ?? [];
      if (!available.includes("WEB_AUTHN")) {
        throw new Error("No passkey is set up for this account yet.");
      }
      result = await cognitoCall<AuthResult>(region, "RespondToAuthChallenge", {
        ChallengeName: "SELECT_CHALLENGE",
        ClientId: clientId,
        Session: result.Session,
        ChallengeResponses: {
          USERNAME: username,
          ANSWER: "WEB_AUTHN",
        },
      });
    }

    if (result.AuthenticationResult?.IdToken) {
      return tokensFromAuth(result);
    }
    if (result.ChallengeName !== "WEB_AUTHN") {
      throw new Error("No passkey is set up for this account yet.");
    }

    const rawOptions = result.ChallengeParameters?.CREDENTIAL_REQUEST_OPTIONS;
    if (!rawOptions) {
      throw new Error("Could not start passkey sign-in. Try again.");
    }
    const options = JSON.parse(rawOptions) as Record<string, unknown>;
    const cred = (await navigator.credentials.get({
      publicKey: parseRequestOptions(options),
    })) as PublicKeyCredential | null;
    if (!cred) throw new Error("Passkey was cancelled. Try again when you’re ready.");

    const finished = await cognitoCall<AuthResult>(
      region,
      "RespondToAuthChallenge",
      {
        ChallengeName: "WEB_AUTHN",
        ClientId: clientId,
        Session: result.Session,
        ChallengeResponses: {
          USERNAME: username,
          CREDENTIAL: JSON.stringify(credentialToJson(cred)),
        },
      },
    );
    return tokensFromAuth(finished);
  } catch (err) {
    throw webauthnBrowserError(err);
  }
}

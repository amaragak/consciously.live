import type { AssistantChatStoreV1 } from "./assistant-chat-storage";
import type { JournalStoreV2 } from "./journal-storage";
import {
  ensureMedimadeSession,
  getMedimadeSessionJwt,
  reconcileMedimadeSessionWithApiBase,
  setMedimadeSession,
} from "./auth-session";
import type { GenerationTimings } from "./meditation-analytics";
import type { MeditationCreationProvenance } from "./meditation-creation-provenance";
import type { MixerFactoryPreset } from "./mixer-factory-presets";
import { normalizeFactoryPreset } from "./mixer-factory-presets";
import {
  normalizeBlogCategory,
  type BlogCategory,
} from "@/lib/blog-categories";

export {
  clearMedimadeSession,
  ensureMedimadeSession,
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
  reconcileMedimadeSessionWithApiBase,
  setMedimadeSession,
} from "./auth-session";

/** `Authorization: Bearer …` when a session JWT is in memory. */
export function medimadeApiAuthHeaders(): Record<string, string> {
  const t = getMedimadeSessionJwt();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function sessionTokenForBody(): string | undefined {
  return getMedimadeSessionJwt() ?? undefined;
}

function meditationAudioJobStatusUrl(base: string, jobId: string): string {
  const token = sessionTokenForBody();
  const qs = token ? `?sessionToken=${encodeURIComponent(token)}` : "";
  return `${base}/meditation/audio/jobs/${encodeURIComponent(jobId)}${qs}`;
}

function meditationAudioAuthFailureMessage(
  status: number,
  apiError?: string | null,
): string | null {
  if (status !== 401) return null;
  return apiError?.trim() || "Could not authorize this request. Try Generate again.";
}

function medimadeJsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...medimadeApiAuthHeaders() };
}

function isAuthSessionPath(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return (
      path.endsWith("/auth/refresh") ||
      path.endsWith("/auth/logout") ||
      path.endsWith("/auth/magic-link") ||
      path.endsWith("/auth/magic-link/verify") ||
      path.endsWith("/auth/guest") ||
      path.endsWith("/auth/cognito/config") ||
      path.endsWith("/auth/cognito/exchange")
    );
  } catch {
    return false;
  }
}

/**
 * Credentialed fetch so HttpOnly refresh/access cookies are sent to the API.
 * On 401 (except auth endpoints), rotates the refresh cookie once and retries.
 */
export async function medimadeFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, {
    ...init,
    credentials: "include",
  });
  if (res.status !== 401 || isAuthSessionPath(input)) return res;

  const refreshed = await ensureMedimadeSession({ force: true });
  if (!refreshed) return res;

  const headers = new Headers(init?.headers);
  const jwt = getMedimadeSessionJwt();
  if (jwt) headers.set("Authorization", `Bearer ${jwt}`);
  return fetch(input, {
    ...init,
    headers,
    credentials: "include",
  });
}

const MIX_LISTENER_STORAGE_KEY = "medimade.mix-listener-id";
const MIX_LISTENER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Stable anonymous id so guest mix overrides persist in the listener mix table. */
export function getOrCreateMixListenerId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(MIX_LISTENER_STORAGE_KEY)?.trim() ?? "";
    if (MIX_LISTENER_ID_RE.test(existing)) return existing.toLowerCase();
    const id = crypto.randomUUID();
    window.localStorage.setItem(MIX_LISTENER_STORAGE_KEY, id);
    return id;
  } catch {
    return "";
  }
}

export type MedimadeChatTurn = { role: "user" | "assistant"; content: string };

export function getMedimadeApiBase(): string | null {
  const u = import.meta.env.VITE_MEDIMADE_API_URL;
  if (!u || typeof u !== "string") return null;
  const t = u.trim();
  if (!t) return null;
  const base = t.endsWith("/") ? t.slice(0, -1) : t;
  reconcileMedimadeSessionWithApiBase(base);
  return base;
}

/** Lambda Function URL for Script Lab generate-script (avoids API Gateway 30s timeout). */
export function getMedimadeScriptLabUrl(): string | null {
  const u = import.meta.env.VITE_MEDIMADE_SCRIPT_LAB_URL;
  if (!u || typeof u !== "string") return null;
  const t = u.trim();
  if (!t) return null;
  return t.endsWith("/") ? t.slice(0, -1) : t;
}

/** Sends a one-time sign-in link to the given email (no auth required). */
export async function requestMedimadeMagicLink(email: string): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) throw new Error("Email is required");
  const origin =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const res = await medimadeFetch(`${base}/auth/magic-link`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: trimmed,
      ...(origin ? { origin } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
}

/** Mint a one-time code so another origin can establish its own localStorage session. */
export async function createAuthHandoff(): Promise<string> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/auth/handoff/create`, {
    method: "POST",
    credentials: "include",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      ...(sessionTokenForBody() ? { sessionToken: sessionTokenForBody() } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    handoffToken?: string;
    error?: string;
    detail?: string;
  };
  if (!res.ok || typeof data.handoffToken !== "string" || !data.handoffToken.trim()) {
    throw new Error(data.detail ?? data.error ?? "Could not create handoff");
  }
  return data.handoffToken.trim();
}

/** Exchange handoff code for access + refresh tokens (SPA boot). */
export async function redeemAuthHandoff(handoffToken: string): Promise<{
  token: string;
  refreshToken?: string;
  email: string;
  displayName: string | null;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await fetch(`${base}/auth/handoff/redeem`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handoffToken: handoffToken.trim() }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    refreshToken?: string;
    email?: string;
    displayName?: string | null;
    error?: string;
    detail?: string;
  };
  if (!res.ok || typeof data.token !== "string" || !data.token.trim()) {
    throw new Error(data.detail ?? data.error ?? "Invalid or expired handoff");
  }
  return {
    token: data.token.trim(),
    refreshToken:
      typeof data.refreshToken === "string" && data.refreshToken.trim()
        ? data.refreshToken.trim()
        : undefined,
    email: typeof data.email === "string" ? data.email : "",
    displayName:
      typeof data.displayName === "string" && data.displayName.trim()
        ? data.displayName.trim()
        : null,
  };
}

/**
 * Log in as the shared guest account (JWT session + that account's cloud data).
 * Writes the session immediately — same path as magic-link verify.
 */
export async function loginAsMedimadeGuest(): Promise<MedimadeMagicLinkVerifyResult> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/auth/guest`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    refreshToken?: string;
    userId?: string;
    email?: string;
    needsProfileName?: unknown;
    displayName?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok || typeof data.token !== "string" || !data.token.trim()) {
    throw new Error(data.detail ?? data.error ?? res.statusText ?? "Guest login failed");
  }
  const displayName =
    typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : "Guest";
  const result: MedimadeMagicLinkVerifyResult = {
    token: data.token.trim(),
    refreshToken:
      typeof data.refreshToken === "string" && data.refreshToken.trim()
        ? data.refreshToken.trim()
        : undefined,
    userId: typeof data.userId === "string" ? data.userId : "",
    email: typeof data.email === "string" ? data.email : "",
    needsProfileName: false,
    displayName,
    ...parseSessionPrivileges(data),
  };
  setMedimadeSession(
    result.token,
    result.email || null,
    result.displayName,
    result.refreshToken ?? null,
  );
  return result;
}

export type ConsciouslyRole = "user" | "admin";
export type ConsciouslyPlan = "free" | "create" | "pro";

export type MedimadeMagicLinkVerifyResult = {
  token: string;
  refreshToken?: string;
  userId: string;
  email: string;
  needsProfileName: boolean;
  displayName: string | null;
  role: ConsciouslyRole;
  plan: ConsciouslyPlan;
};

function parseSessionPrivileges(data: {
  role?: unknown;
  plan?: unknown;
}): { role: ConsciouslyRole; plan: ConsciouslyPlan } {
  const plan =
    data.plan === "pro" ? "pro" : data.plan === "create" ? "create" : "free";
  return {
    role: data.role === "admin" ? "admin" : "user",
    plan,
  };
}

/** One in-flight (or settled) verify per magic token so React Strict Mode does not burn the token twice. */
const magicVerifyByToken = new Map<string, Promise<MedimadeMagicLinkVerifyResult>>();

/**
 * Exchanges a magic-link token for a session JWT. Does not write localStorage;
 * callers should call `setMedimadeSession` after any required name step.
 */
export async function verifyMedimadeMagicLink(
  token: string,
): Promise<MedimadeMagicLinkVerifyResult> {
  const t = token.trim();
  if (!t) throw new Error("Token is required");
  const existing = magicVerifyByToken.get(t);
  if (existing) return existing;

  const p = verifyMedimadeMagicLinkUncached(t);
  magicVerifyByToken.set(t, p);
  void p.catch(() => {
    magicVerifyByToken.delete(t);
  });
  return p;
}

async function verifyMedimadeMagicLinkUncached(
  t: string,
): Promise<MedimadeMagicLinkVerifyResult> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/auth/magic-link/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: t }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    refreshToken?: string;
    userId?: string;
    email?: string;
    needsProfileName?: unknown;
    displayName?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok || typeof data.token !== "string" || !data.token.trim()) {
    throw new Error(data.detail ?? data.error ?? res.statusText ?? "Verification failed");
  }
  const displayName =
    typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : null;
  const needsProfileName =
    typeof data.needsProfileName === "boolean"
      ? data.needsProfileName
      : !displayName;
  return {
    token: data.token.trim(),
    refreshToken:
      typeof data.refreshToken === "string" && data.refreshToken.trim()
        ? data.refreshToken.trim()
        : undefined,
    userId: typeof data.userId === "string" ? data.userId : "",
    email: typeof data.email === "string" ? data.email : "",
    needsProfileName,
    displayName,
    ...parseSessionPrivileges(data),
  };
}

export type CognitoAuthConfig = {
  enabled: boolean;
  userPoolId: string | null;
  clientId: string | null;
  region: string | null;
  domain: string | null;
  issuer: string | null;
  methods: { password: boolean; passkey: boolean; social: boolean };
};

/** Public Cognito client config (pool / Hosted UI). Magic-link remains available. */
export async function fetchCognitoAuthConfig(): Promise<CognitoAuthConfig> {
  const base = getMedimadeApiBase();
  if (!base) {
    return {
      enabled: false,
      userPoolId: null,
      clientId: null,
      region: null,
      domain: null,
      issuer: null,
      methods: { password: false, passkey: false, social: false },
    };
  }
  const res = await medimadeFetch(`${base}/auth/cognito/config`, {
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Partial<CognitoAuthConfig> & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error ?? res.statusText);
  }
  return {
    enabled: data.enabled === true,
    userPoolId: typeof data.userPoolId === "string" ? data.userPoolId : null,
    clientId: typeof data.clientId === "string" ? data.clientId : null,
    region: typeof data.region === "string" ? data.region : null,
    domain: typeof data.domain === "string" ? data.domain : null,
    issuer: typeof data.issuer === "string" ? data.issuer : null,
    methods: {
      password: data.methods?.password !== false,
      passkey: data.methods?.passkey === true,
      social: data.methods?.social === true,
    },
  };
}

/**
 * After Cognito sign-in (password / passkey / Hosted UI), exchange the ID token
 * for a Medimade session JWT (same shape as magic-link verify).
 */
export async function exchangeCognitoIdToken(
  idToken: string,
): Promise<MedimadeMagicLinkVerifyResult> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const t = idToken.trim();
  if (!t) throw new Error("idToken is required");
  const res = await medimadeFetch(`${base}/auth/cognito/exchange`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: t }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    refreshToken?: string;
    userId?: string;
    email?: string;
    needsProfileName?: unknown;
    displayName?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok || typeof data.token !== "string" || !data.token.trim()) {
    throw new Error(data.detail ?? data.error ?? res.statusText ?? "Exchange failed");
  }
  const displayName =
    typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : null;
  const needsProfileName =
    typeof data.needsProfileName === "boolean"
      ? data.needsProfileName
      : !displayName;
  return {
    token: data.token.trim(),
    refreshToken:
      typeof data.refreshToken === "string" && data.refreshToken.trim()
        ? data.refreshToken.trim()
        : undefined,
    userId: typeof data.userId === "string" ? data.userId : "",
    email: typeof data.email === "string" ? data.email : "",
    needsProfileName,
    displayName,
    ...parseSessionPrivileges(data),
  };
}

/** Saves display name for the signed-in user and returns a fresh session JWT. */
export async function saveMedimadeProfileDisplayName(
  displayName: string,
): Promise<{ token: string; displayName: string }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/auth/profile/display-name`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ displayName: displayName.trim() }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    displayName?: string;
    error?: string;
    detail?: string;
  };
  if (
    !res.ok ||
    typeof data.token !== "string" ||
    !data.token.trim() ||
    typeof data.displayName !== "string" ||
    !data.displayName.trim()
  ) {
    throw new Error(data.detail ?? data.error ?? res.statusText ?? "Could not save name");
  }
  return { token: data.token.trim(), displayName: data.displayName.trim() };
}

export type MedimadeRefreshResult = {
  status: "ok" | "missing" | "invalid" | "expired" | "error";
  token?: string;
  refreshToken?: string;
  email?: string;
  displayName?: string | null;
  userId?: string;
};

/** Exchange refresh cookie or durable local refresh token for a new access JWT. */
export async function refreshMedimadeSessionRemote(): Promise<MedimadeRefreshResult> {
  const base = getMedimadeApiBase();
  if (!base) return { status: "error" };

  const { getMedimadeRefreshToken, setMedimadeRefreshToken } = await import(
    "@/lib/auth-session"
  );

  const attempt = async (refreshToken: string | null): Promise<Response> =>
    fetch(`${base}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
      credentials: "include",
    });

  let storedRefresh = getMedimadeRefreshToken();
  // Prefer body refresh when we have one — stale HttpOnly cookies must not win.
  // Fall back to cookie-only when localStorage has nothing.
  let res = storedRefresh ? await attempt(storedRefresh) : await attempt(null);
  if (res.status === 401 && storedRefresh) {
    // Cookie-only retry in case body token was the stale one and cookie is live.
    res = await attempt(null);
  }
  // Parallel refresh can 401 on a just-rotated token; retry so the newer
  // localStorage refresh (updated by another tab) can win.
  if (res.status === 401) {
    for (const waitMs of [250, 600]) {
      await new Promise((r) => setTimeout(r, waitMs));
      storedRefresh = getMedimadeRefreshToken();
      res = storedRefresh ? await attempt(storedRefresh) : await attempt(null);
      if (res.status === 401 && storedRefresh) {
        res = await attempt(null);
      }
      if (res.ok) break;
    }
  }

  let data: {
    token?: string;
    refreshToken?: string;
    email?: string;
    displayName?: unknown;
    userId?: string;
    code?: string;
    error?: string;
  } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* */
  }

  if (res.ok && typeof data.token === "string" && data.token.trim()) {
    const nextRefresh =
      typeof data.refreshToken === "string" && data.refreshToken.trim()
        ? data.refreshToken.trim()
        : undefined;
    if (nextRefresh) setMedimadeRefreshToken(nextRefresh);
    return {
      status: "ok",
      token: data.token.trim(),
      refreshToken: nextRefresh,
      email: typeof data.email === "string" ? data.email : "",
      displayName:
        typeof data.displayName === "string" && data.displayName.trim()
          ? data.displayName.trim()
          : null,
      userId: typeof data.userId === "string" ? data.userId : undefined,
    };
  }

  const code =
    typeof data.code === "string"
      ? data.code
      : res.status === 401
        ? "invalid"
        : "error";
  if (code === "expired") return { status: "expired" };
  if (code === "missing") return { status: "missing" };
  if (code === "invalid") return { status: "invalid" };
  return { status: "error" };
}

/** Clears server refresh session + cookies. Does not touch local UI state. */
export async function logoutMedimadeSessionRemote(
  refreshToken?: string | null,
): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) return;
  try {
    const token = refreshToken?.trim() || null;
    await medimadeFetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(token ? { refreshToken: token } : {}),
    });
  } catch {
    /* ignore */
  }
}

export type BillingPriceKey = "create" | "pro";

export type BillingPriceInfo = {
  key: BillingPriceKey;
  plan: ConsciouslyPlan;
  configured: boolean;
  label: string;
  blurb: string;
};

export async function fetchBillingPrices(): Promise<{
  prices: BillingPriceInfo[];
  checkoutReady: boolean;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/billing/prices`);
  const data = (await res.json().catch(() => ({}))) as {
    prices?: BillingPriceInfo[];
    checkoutReady?: boolean;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    prices: Array.isArray(data.prices) ? data.prices : [],
    checkoutReady: data.checkoutReady === true,
  };
}

/** Start Stripe Checkout for Create or Pro. Returns the hosted Checkout URL. */
export async function createBillingCheckoutSession(opts: {
  priceKey: BillingPriceKey;
  successUrl?: string;
  cancelUrl?: string;
}): Promise<{ url: string; sessionId: string; plan: ConsciouslyPlan }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/billing/checkout-session`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      priceKey: opts.priceKey,
      ...(opts.successUrl ? { successUrl: opts.successUrl } : {}),
      ...(opts.cancelUrl ? { cancelUrl: opts.cancelUrl } : {}),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    sessionId?: string;
    plan?: ConsciouslyPlan;
    error?: string;
    detail?: string;
  };
  if (!res.ok || typeof data.url !== "string" || !data.url.trim()) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    url: data.url.trim(),
    sessionId: typeof data.sessionId === "string" ? data.sessionId : "",
    plan: data.plan === "create" || data.plan === "pro" ? data.plan : "pro",
  };
}

/** Full URL of the streaming chat endpoint (Lambda function URL). */
export function getMedimadeChatUrl(): string | null {
  const u = import.meta.env.VITE_MEDIMADE_CHAT_URL;
  if (!u || typeof u !== "string") return null;
  const t = u.trim();
  return t || null;
}

/**
 * Public base URL for files in the media bucket (same host as library MP3s), no trailing slash.
 * Set from CDK output `MediaCloudFrontDomain` as `https://<domain>`.
 * Used for background preview when the list API does not include `baseUrl`.
 */
export function getMedimadeMediaBaseUrl(): string | null {
  const u = import.meta.env.VITE_MEDIMADE_MEDIA_BASE_URL;
  if (!u || typeof u !== "string") return null;
  const t = u.trim().replace(/\/$/, "");
  return t || null;
}

export type JournalTranscribeResult = {
  text: string;
  storage?: { audioKey: string; metaKey: string };
};

export type JournalVoiceUploadResult = {
  key: string;
  url: string;
};

export type JournalInsightsTopicId =
  | "overview"
  | "emotions"
  | "stress"
  | "health"
  | "relationships"
  | "identity"
  | "worldview"
  | "work"
  | "projects"
  | "ideas"
  | "values"
  | "habits"
  | "decisions"
  | "growth";

export type JournalInsights = {
  ownerId: string;
  topics: Array<{
    topicId: JournalInsightsTopicId;
    summaryMarkdown: string;
    updatedAt: string;
  }>;
  meta: {
    lastRunAt: string;
    lastProcessedMaxUpdatedAt: string | null;
    model: string;
    usage?: { input_tokens: number; output_tokens: number } | null;
  };
};

/**
 * Sends recorded audio (base64) to `POST /journal/transcribe` (OpenAI Whisper).
 * Requires `VITE_MEDIMADE_API_URL` and AWS secret `medimade/OPENAI_API_KEY`.
 */
export async function transcribeJournalAudio(params: {
  audioBase64: string;
  mimeType?: string;
}): Promise<JournalTranscribeResult> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const token = sessionTokenForBody();
  const qs = token ? `?sessionToken=${encodeURIComponent(token)}` : "";
  const res = await medimadeFetch(`${base}/journal/transcribe${qs}`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      audioBase64: params.audioBase64,
      mimeType: params.mimeType,
      ...(token ? { sessionToken: token } : {}),
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    let msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    // Older API responses nested OpenAI's JSON in `detail`.
    if (typeof msg === "string" && msg.trim().startsWith("{")) {
      try {
        const nested = JSON.parse(msg) as { error?: { message?: string } };
        if (typeof nested.error?.message === "string" && nested.error.message.trim()) {
          msg = nested.error.message.trim();
        }
      } catch {
        /* keep msg */
      }
    }
    throw new Error(msg);
  }
  const text = typeof data.text === "string" ? data.text : "";
  const storage = data.storage as JournalTranscribeResult["storage"] | undefined;
  return { text, storage };
}

export type VisionGenerateResult = {
  imageBase64: string;
  mimeType: string;
  /** Final prompt used (after optional Haiku refine). */
  prompt?: string;
  url?: string;
  key?: string;
  model?: string;
};

/**
 * Generates a vision-board scene with Gemini Nano Banana Pro, using a self-reference photo.
 * Optional `changeRequest` is merged with `prompt` via Haiku before generation.
 * `POST /ideate/vision/generate`
 */
export async function generateVisionBoardScene(params: {
  prompt: string;
  changeRequest?: string;
  /** Default true. Set false to regenerate from an already-polished stored prompt. */
  polishPrompt?: boolean;
  referenceBase64?: string;
  referenceKey?: string;
  mimeType?: string;
  /** Optional supporting refs (people/pets/places) with descriptions. */
  extraReferences?: Array<{
    description: string;
    referenceKey?: string;
    referenceBase64?: string;
    mimeType?: string;
  }>;
}): Promise<VisionGenerateResult> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  if (!params.referenceBase64 && !params.referenceKey) {
    throw new Error("Reference photo is required");
  }
  const token = sessionTokenForBody();
  const qs = token ? `?sessionToken=${encodeURIComponent(token)}` : "";
  const extras = (params.extraReferences ?? [])
    .filter((e) => e.description.trim() && (e.referenceKey || e.referenceBase64))
    .slice(0, 3)
    .map((e) => ({
      description: e.description.trim().slice(0, 280),
      ...(e.referenceKey ? { referenceKey: e.referenceKey } : {}),
      ...(e.referenceBase64 ? { referenceBase64: e.referenceBase64 } : {}),
      ...(e.mimeType ? { mimeType: e.mimeType } : {}),
    }));
  const res = await medimadeFetch(`${base}/ideate/vision/generate${qs}`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      prompt: params.prompt,
      ...(params.changeRequest?.trim()
        ? { changeRequest: params.changeRequest.trim() }
        : {}),
      ...(params.polishPrompt === false ? { polishPrompt: false } : {}),
      ...(params.referenceBase64
        ? { referenceBase64: params.referenceBase64 }
        : {}),
      ...(params.referenceKey ? { referenceKey: params.referenceKey } : {}),
      mimeType: params.mimeType,
      ...(extras.length ? { extraReferences: extras } : {}),
      ...(token ? { sessionToken: token } : {}),
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const errMsg =
      typeof data.error === "string" && data.error.trim()
        ? data.error.trim()
        : "";
    // Prefer the API's user-facing message; never dump raw provider JSON.
    throw new Error(
      errMsg || res.statusText || `Vision generate failed (${res.status})`,
    );
  }
  const imageBase64 =
    typeof data.imageBase64 === "string" ? data.imageBase64 : "";
  if (!imageBase64) {
    throw new Error("No image returned");
  }
  return {
    imageBase64,
    mimeType:
      typeof data.mimeType === "string" ? data.mimeType : "image/png",
    ...(typeof data.prompt === "string" ? { prompt: data.prompt } : {}),
    ...(typeof data.url === "string" ? { url: data.url } : {}),
    ...(typeof data.key === "string" ? { key: data.key } : {}),
    ...(typeof data.model === "string" ? { model: data.model } : {}),
  };
}

export type IdeateVisionMediaUploadResult = {
  key: string;
  url: string;
  mimeType?: string;
  byteLength?: number;
};

/**
 * Uploads a vision-board image to `POST /ideate/vision/media` (S3 + CloudFront).
 * Requires a signed-in session.
 */
export async function uploadIdeateVisionMedia(params: {
  imageBase64: string;
  mimeType?: string;
  kind?: "self" | "tile" | "extra";
}): Promise<IdeateVisionMediaUploadResult> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/ideate/vision/media`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
      kind: params.kind ?? "self",
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const key = typeof data.key === "string" ? data.key : "";
  const url = typeof data.url === "string" ? data.url : "";
  if (!key || !url) {
    throw new Error("Upload response missing key or url");
  }
  return {
    key,
    url,
    mimeType: typeof data.mimeType === "string" ? data.mimeType : undefined,
    byteLength:
      typeof data.byteLength === "number" ? data.byteLength : undefined,
  };
}

export type IdeateCloudBundle = {
  version: 1;
  updatedAt: string;
  ideate: unknown;
  visionBoard: unknown;
  reflectionQuestions: unknown;
  /** Optional for older cloud rows; client treats missing as empty. */
  values?: unknown;
  /** Optional — regret minimisation entries. */
  regrets?: unknown;
  /** Optional — meaningful quotes. */
  quotes?: unknown;
  /** Optional — persisted manifesto sentence. */
  manifesto?: unknown;
};

export type FamousQuotesKind = "author" | "work";

export type FamousQuotesResult = {
  kind: FamousQuotesKind;
  /** Ready-to-store attribution line. */
  attribution: string;
  quotes: string[];
  cached: boolean;
  author?: string;
  authorSlug?: string;
  workTitle?: string;
  workAuthor?: string | null;
  workSlug?: string;
};

/** @deprecated Prefer `fetchFamousQuotes({ kind: "author", query })`. */
export type FamousAuthorQuotesResult = FamousQuotesResult;

/**
 * Resolve a famous thinker or work (Haiku + Dynamo cache) and return up to 10 quotes.
 * Hits API Gateway directly (CORS allowlist includes SPA origins).
 * Read/cache path for the shared library only — do not send user-authored text here.
 */
export async function fetchFamousQuotes(params: {
  kind: FamousQuotesKind;
  query: string;
}): Promise<FamousQuotesResult> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  let res: Response;
  try {
    res = await fetch(`${base}/ideate/famous-quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: params.kind,
        query: params.query,
      }),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "network error";
    throw new Error(
      detail === "Failed to fetch"
        ? "Could not reach the quotes service. Check your connection and try again."
        : detail,
    );
  }
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.error === "string" && data.error) ||
      (typeof data.detail === "string" && data.detail) ||
      res.statusText;
    throw new Error(msg);
  }
  const kind: FamousQuotesKind =
    data.kind === "work" ? "work" : "author";
  const attribution =
    typeof data.attribution === "string" ? data.attribution.trim() : "";
  const author = typeof data.author === "string" ? data.author.trim() : "";
  const authorSlug =
    typeof data.authorSlug === "string" ? data.authorSlug.trim() : "";
  const workTitle =
    typeof data.workTitle === "string" ? data.workTitle.trim() : "";
  const workSlug =
    typeof data.workSlug === "string" ? data.workSlug.trim() : "";
  const workAuthor =
    typeof data.workAuthor === "string"
      ? data.workAuthor.trim()
      : data.workAuthor === null
        ? null
        : undefined;
  const quotes = Array.isArray(data.quotes)
    ? data.quotes
        .filter((q): q is string => typeof q === "string")
        .map((q) => q.trim())
        .filter(Boolean)
    : [];
  const resolvedAttribution =
    attribution ||
    (kind === "work"
      ? workAuthor
        ? `${workTitle} — ${workAuthor}`
        : workTitle
      : author);
  if (!resolvedAttribution || quotes.length === 0) {
    throw new Error(
      kind === "work"
        ? "No quotes returned for that work"
        : "No quotes returned for that author",
    );
  }
  return {
    kind,
    attribution: resolvedAttribution,
    quotes,
    cached: data.cached === true,
    ...(author ? { author } : {}),
    ...(authorSlug ? { authorSlug } : {}),
    ...(workTitle ? { workTitle } : {}),
    ...(workSlug ? { workSlug } : {}),
    ...(workAuthor !== undefined ? { workAuthor } : {}),
  };
}

/** Resolve a famous person and return up to 10 quotes. */
export async function fetchFamousAuthorQuotes(
  authorQuery: string,
): Promise<FamousQuotesResult> {
  return fetchFamousQuotes({ kind: "author", query: authorQuery });
}

/**
 * Loads Ideate from `GET /ideate/store`.
 * Returns `authenticated: false` when the session JWT was missing/invalid so
 * callers do not treat that as a truly empty account and wipe memory.
 */
export async function fetchIdeateStoreRemote(): Promise<{
  store: IdeateCloudBundle | null;
  authenticated: boolean;
}> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/ideate/store`, {
    headers: medimadeApiAuthHeaders(),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const authenticated =
    typeof data.authenticated === "boolean"
      ? data.authenticated
      : // Legacy APIs omit the flag — assume auth succeeded if we sent a JWT.
        Boolean(getMedimadeSessionJwt());
  const store = data.store;
  if (store == null || typeof store !== "object") {
    return { store: null, authenticated };
  }
  return { store: store as IdeateCloudBundle, authenticated };
}

/**
 * Saves Ideate bundle to `PUT /ideate/store` (requires session JWT).
 * Refuses empty bundles so a client bug cannot wipe Dynamo.
 */
export async function putIdeateStoreRemote(
  store: IdeateCloudBundle,
): Promise<void> {
  const ideate = store?.ideate as { dreams?: unknown[] } | null | undefined;
  const vision = store?.visionBoard as
    | { items?: unknown[]; selfReference?: { url?: string; key?: string } | null }
    | null
    | undefined;
  const qs = store?.reflectionQuestions as { questions?: unknown[] } | null;
  const values = store?.values as { values?: unknown[] } | null;
  const regrets = store?.regrets as { regrets?: unknown[] } | null;
  const quotes = store?.quotes as { quotes?: unknown[] } | null;
  const manifesto = store?.manifesto as { text?: string } | null;
  const hasContent =
    (ideate?.dreams?.length ?? 0) > 0 ||
    (vision?.items?.length ?? 0) > 0 ||
    Boolean(vision?.selfReference?.url || vision?.selfReference?.key) ||
    (qs?.questions?.length ?? 0) > 0 ||
    (values?.values?.length ?? 0) > 0 ||
    (regrets?.regrets?.length ?? 0) > 0 ||
    (quotes?.quotes?.length ?? 0) > 0 ||
    (manifesto?.text?.trim().length ?? 0) > 0;
  if (!hasContent) {
    throw new Error("Refusing to upload empty Ideate store");
  }
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/ideate/store`, {
    method: "PUT",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ store }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
}

export type UserContentSearchHit = {
  objectID: string;
  type: string;
  title: string;
  body: string;
  href: string;
  updatedAt?: number;
  /** Cover / vision still for search flyout thumbnails. */
  imageUrl?: string | null;
};

/**
 * Algolia-backed search across journal, gratitudes, Manifest, meditations.
 * Filtered server-side by JWT email (guest → alexmaragakis@hotmail.co.uk).
 */
export async function searchUserContentRemote(
  query: string,
  opts?: { type?: string },
): Promise<UserContentSearchHit[]> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({ q: q.slice(0, 200) });
  if (opts?.type?.trim()) params.set("type", opts.type.trim());
  const res = await medimadeFetch(`${base}/search?${params}`, {
    headers: medimadeApiAuthHeaders(),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const hits = Array.isArray(data.hits) ? data.hits : [];
  const out: UserContentSearchHit[] = [];
  for (const h of hits) {
    if (!h || typeof h !== "object") continue;
    const o = h as Record<string, unknown>;
    if (typeof o.objectID !== "string" || !o.objectID) continue;
    out.push({
      objectID: o.objectID,
      type: typeof o.type === "string" ? o.type : "",
      title: typeof o.title === "string" ? o.title : "",
      body: typeof o.body === "string" ? o.body : "",
      href: typeof o.href === "string" ? o.href : "/",
      ...(typeof o.updatedAt === "number" ? { updatedAt: o.updatedAt } : {}),
      ...(typeof o.imageUrl === "string" && o.imageUrl.trim()
        ? { imageUrl: o.imageUrl.trim() }
        : {}),
    });
  }
  return out;
}

/**
 * Loads journal from `GET /journal/store`.
 * Requires a session JWT (including Continue as guest — same cloud path as any account).
 * Unsigned browsers have no remote store.
 */
export async function fetchJournalStoreRemote(): Promise<JournalStoreV2 | null> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/journal/store`, { headers: medimadeApiAuthHeaders() });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const store = data.store;
  if (store == null) return null;
  if (typeof store !== "object") return null;
  return store as JournalStoreV2;
}

export type DashboardDailyStatus = {
  gratitude: boolean;
  meditation: boolean;
  lifeArea: boolean;
  streak: number;
  fullStreak: number;
  partialStreak: number;
  fullStreakRecord: number;
  partialStreakRecord: number;
};

function nonNegInt(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(0, Math.floor(raw))
    : 0;
}

/** Loads today’s habit tracker flags + streak from `GET /api/dashboard/daily-status`. */
export async function fetchDashboardDailyStatus(opts?: {
  dateKey?: string;
}): Promise<DashboardDailyStatus> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const dateKey = opts?.dateKey;
  const tzOffsetMinutes = new Date().getTimezoneOffset();
  const qs = new URLSearchParams({
    tzOffsetMinutes: String(tzOffsetMinutes),
    ...(dateKey ? { dateKey } : {}),
  });
  const res = await medimadeFetch(
    `${base}/api/dashboard/daily-status?${qs.toString()}`,
    { headers: medimadeApiAuthHeaders() },
  );
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const fullStreak = nonNegInt(data.fullStreak ?? data.streak);
  return {
    gratitude: data.gratitude === true,
    meditation: data.meditation === true,
    lifeArea: data.lifeArea === true,
    streak: fullStreak,
    fullStreak,
    partialStreak: nonNegInt(data.partialStreak),
    fullStreakRecord: nonNegInt(data.fullStreakRecord),
    partialStreakRecord: nonNegInt(data.partialStreakRecord),
  };
}

/** Persists a manual day check for one habit pillar. */
export async function putDashboardDailyManualCheck(params: {
  dateKey: string;
  pillar: "gratitude" | "meditation" | "lifeArea";
  checked: boolean;
}): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/api/dashboard/daily-status`, {
    method: "PUT",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
}

/** Logs meditation play_started / play_progress (≥60s) for daily habits. */
export async function postDashboardPlayEvent(params: {
  type: "play_started" | "play_progress";
  meditationId?: string;
  at?: string;
  seconds?: number;
  dateKey?: string;
}): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) return;
  const jwt = getMedimadeSessionJwt();
  if (!jwt) return;
  try {
    await medimadeFetch(`${base}/dashboard/play-events`, {
      method: "POST",
      headers: medimadeJsonHeaders(),
      body: JSON.stringify({
        ...params,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      }),
    });
  } catch {
    /* best-effort — local storage still tracks */
  }
}

/**
 * Saves full journal store to `PUT /journal/store` (DynamoDB per entry; use `uploadJournalVoice` for large audio).
 */
export async function putJournalStoreRemote(store: JournalStoreV2): Promise<void> {
  const entries = Array.isArray(store?.entries) ? store.entries : [];
  // Server deletes any ENTRY# not in the payload — never allow an empty PUT
  // to wipe a non-empty account (client bug / race).
  if (entries.length === 0) {
    throw new Error("Refusing to upload empty journal store");
  }
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/journal/store`, {
    method: "PUT",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ store }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
}

/** Loads Consciously Chat store from `GET /assistant-chat/store`. */
export async function fetchAssistantChatStoreRemote(): Promise<AssistantChatStoreV1 | null> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/assistant-chat/store`, {
    headers: medimadeApiAuthHeaders(),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const store = data.store;
  if (store == null) return null;
  if (typeof store !== "object") return null;
  return store as AssistantChatStoreV1;
}

/** Saves Consciously Chat store to `PUT /assistant-chat/store`. */
export async function putAssistantChatStoreRemote(
  store: AssistantChatStoreV1,
): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/assistant-chat/store`, {
    method: "PUT",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ store }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
}

/**
 * Uploads recorded audio to `POST /journal/voice` and returns a CloudFront URL for embedding in HTML.
 */
export async function uploadJournalVoice(params: {
  audioBase64: string;
  mimeType?: string;
}): Promise<JournalVoiceUploadResult> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/journal/voice`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      audioBase64: params.audioBase64,
      mimeType: params.mimeType,
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const key = typeof data.key === "string" ? data.key : "";
  const url = typeof data.url === "string" ? data.url : "";
  if (!key || !url) {
    throw new Error("Upload response missing key or url");
  }
  return { key, url };
}

/**
 * Loads saved rolling journal insights from `GET /journal/insights` (DynamoDB).
 */
export async function fetchJournalInsightsRemote(): Promise<JournalInsights | null> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/journal/insights`, {
    headers: medimadeApiAuthHeaders(),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const insights = data.insights;
  if (!insights || typeof insights !== "object") return null;
  return insights as JournalInsights;
}

/**
 * Runs Claude to refresh rolling journal insights from entry deltas (`POST /journal/insights`).
 */
export async function runJournalInsightsRemote(opts?: {
  mode?: "update" | "regenerate";
}): Promise<JournalInsights> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/journal/insights`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      ...(opts?.mode ? { mode: opts.mode } : {}),
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const insights = data.insights;
  if (!insights || typeof insights !== "object") {
    throw new Error("Insights response missing insights object");
  }
  return insights as JournalInsights;
}

export type PdfImportDatedEntry = {
  title: string;
  body: string;
  date: string | null;
};

export async function datePdfJournalImport(units: unknown[]): Promise<{
  dates_found: boolean;
  entries: PdfImportDatedEntry[];
  error?: string;
}> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/journal/import/pdf`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      units,
      ...(sessionTokenForBody() ? { sessionToken: sessionTokenForBody() } : {}),
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const raw = Array.isArray(data.entries) ? data.entries : [];
  const entries: PdfImportDatedEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.body !== "string" || !o.body.trim()) continue;
    entries.push({
      title: typeof o.title === "string" ? o.title : "",
      body: o.body,
      date: typeof o.date === "string" ? o.date : null,
    });
  }
  return {
    dates_found: data.dates_found === true,
    entries,
    error: typeof data.error === "string" ? data.error : undefined,
  };
}

export type JournalOcrWord = {
  text: string;
  confidence: number | null;
};

export async function ocrJournalPhoto(imageBase64: string): Promise<{
  text: string;
  words: JournalOcrWord[];
  engine: "textract";
}> {
  const base = getMedimadeApiBase();
  if (!base) {
    throw new Error("VITE_MEDIMADE_API_URL is not set");
  }
  const res = await medimadeFetch(`${base}/journal/import/ocr`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      imageBase64,
      ...(sessionTokenForBody() ? { sessionToken: sessionTokenForBody() } : {}),
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const raw = Array.isArray(data.words) ? data.words : [];
  const words: JournalOcrWord[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (typeof o.text !== "string" || !o.text.trim()) continue;
    words.push({
      text: o.text.trim(),
      confidence: typeof o.confidence === "number" ? o.confidence : null,
    });
  }
  return {
    engine: "textract",
    text: typeof data.text === "string" ? data.text : "",
    words,
  };
}

export type InsightSourceRef = {
  entryId: string;
  quote?: string;
};

export type JournalWeeklyEmotionScore = {
  name: string;
  score: number;
  /** @deprecated Prefer sources. */
  examples?: string[];
  /** @deprecated Prefer sources. */
  entryIds?: string[];
  sources?: InsightSourceRef[];
};

export type JournalWeeklyArcDay = {
  date: string;
  value: number;
};

export type JournalWeeklyArc = {
  start: string;
  end: string;
  summary: string;
  days: JournalWeeklyArcDay[];
};

export type JournalWeeklyCitedItem = {
  text: string;
  /** @deprecated Prefer sources. */
  entryIds?: string[];
  sources?: InsightSourceRef[];
};

export type JournalWeeklyRecurringThought = {
  text: string;
  count: number;
  alsoOn?: string[];
  /** @deprecated Prefer sources. */
  entryIds?: string[];
  sources?: InsightSourceRef[];
};

export type JournalWeeklyActivityByEntry = {
  entryId: string;
  items: string[];
};

/** LLM-inferred mood for an entry with no user mood — Insights only. */
export type JournalWeeklyEntryMood = {
  entryId: string;
  mood: string;
};

export type JournalWellbeingLevel = "none" | "struggling" | "at_risk";

export type JournalLetterFeedback = {
  rating: "up" | "down";
  note?: string;
  at: string;
};

export type JournalWeeklyGeneratedParts = {
  letter: boolean;
  felt: boolean;
  moved: boolean;
  wins: boolean;
  thought: boolean;
};

export type JournalWeeklyPatternsSelection = {
  felt: boolean;
  moved: boolean;
  wins: boolean;
  thought: boolean;
};

export type JournalInsightPeriodType =
  | "last7"
  | "last30"
  | "custom"
  | "week"
  | "sinceLast";

export type JournalWeeklyReflection = {
  ownerId: string;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  periodType?: JournalInsightPeriodType;
  startDate?: string;
  endDate?: string;
  rangeKey?: string;
  letterMarkdown: string;
  /** LLM-written Insights page headline (not a letter excerpt). */
  title?: string;
  preview?: string;
  emotions?: JournalWeeklyEmotionScore[];
  moodSummary?: string;
  arc?: JournalWeeklyArc;
  /** Cited wins; legacy string[] is normalised on parse. */
  wins?: JournalWeeklyCitedItem[];
  promises?: JournalWeeklyCitedItem[];
  recurringThought?: JournalWeeklyRecurringThought;
  activities?: JournalWeeklyActivityByEntry[];
  /** Inferred moods for untagged entries (never written to the journal). */
  entryMoods?: JournalWeeklyEntryMood[];
  /** Which AI parts were requested/generated for this week (opt-in generation). */
  generatedParts?: JournalWeeklyGeneratedParts;
  wellbeing?: { level: JournalWellbeingLevel };
  letterFeedback?: JournalLetterFeedback;
  /** Speechify letter narration (Beatrice). */
  letterAudioUrl?: string;
  letterAudioStatus?: "none" | "generating" | "ready" | "failed";
  letterAudioError?: string;
  letterAudioProgress?: string;
  letterAudioGeneratedAt?: string;
  letterAudioVoiceId?: string;
  meta: {
    generatedAt: string;
    model: string;
    journalEntryCount: number;
    meditationChatCount: number;
    usage?: { input_tokens: number; output_tokens: number } | null;
  };
};

export type JournalWeeklyLetterSummary = {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  periodType?: JournalInsightPeriodType;
  startDate?: string;
  endDate?: string;
  rangeKey?: string;
  generatedAt: string;
  preview?: string;
  emotions?: JournalWeeklyEmotionScore[];
  activities?: JournalWeeklyActivityByEntry[];
  promises?: JournalWeeklyCitedItem[];
  recurringThought?: JournalWeeklyRecurringThought;
  generatedParts?: JournalWeeklyGeneratedParts;
};

function parseEmotionExamples(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().replace(/\s+/g, " ");
    if (t.length < 8 || t.length > 220) continue;
    out.push(t);
    if (out.length >= 3) break;
  }
  return out.length > 0 ? out : undefined;
}

function parseWeeklyEmotions(
  raw: unknown,
): JournalWeeklyEmotionScore[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: JournalWeeklyEmotionScore[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name =
      typeof (row as { name?: unknown }).name === "string"
        ? (row as { name: string }).name.trim()
        : "";
    const scoreRaw = (row as { score?: unknown }).score;
    const score =
      typeof scoreRaw === "number"
        ? scoreRaw
        : typeof scoreRaw === "string"
          ? Number(scoreRaw)
          : NaN;
    if (!name || !Number.isFinite(score)) continue;
    const examples = parseEmotionExamples(
      (row as { examples?: unknown }).examples,
    );
    const cited = sourcesOrLegacy(
      (row as { sources?: unknown }).sources,
      (row as { entryIds?: unknown }).entryIds ??
        (row as { entry_ids?: unknown }).entry_ids,
      3,
    );
    out.push({
      name,
      score: Math.max(0, Math.min(10, Math.round(score))),
      ...(examples ? { examples } : {}),
      ...cited,
    });
  }
  if (out.length < 1) return undefined;
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, 5);
}

function parseEntryIdList(raw: unknown, max = 6): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id !== "string") continue;
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : undefined;
}

function parseInsightSourceRefs(
  raw: unknown,
  max = 6,
): InsightSourceRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: InsightSourceRef[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const entryId =
      typeof (row as { entryId?: unknown }).entryId === "string"
        ? (row as { entryId: string }).entryId.trim()
        : typeof (row as { entry_id?: unknown }).entry_id === "string"
          ? (row as { entry_id: string }).entry_id.trim()
          : "";
    if (!entryId) continue;
    const quote =
      typeof (row as { quote?: unknown }).quote === "string"
        ? (row as { quote: string }).quote.trim()
        : "";
    out.push(quote ? { entryId, quote } : { entryId });
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : undefined;
}

function sourcesOrLegacy(
  sourcesRaw: unknown,
  entryIdsRaw: unknown,
  max = 6,
): { sources?: InsightSourceRef[]; entryIds?: string[] } {
  const sources = parseInsightSourceRefs(sourcesRaw, max);
  if (sources) {
    return {
      sources,
      entryIds: sources.map((s) => s.entryId),
    };
  }
  const entryIds = parseEntryIdList(entryIdsRaw, max);
  return entryIds ? { entryIds } : {};
}

function parseWeeklyCitedItems(
  raw: unknown,
  maxItems: number,
): JournalWeeklyCitedItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: JournalWeeklyCitedItem[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const t = item.trim().replace(/\s+/g, " ");
      if (t.length < 4 || t.length > 160) continue;
      out.push({ text: t });
    } else if (item && typeof item === "object") {
      const textRaw = (item as { text?: unknown }).text;
      const t =
        typeof textRaw === "string" ? textRaw.trim().replace(/\s+/g, " ") : "";
      if (t.length < 4 || t.length > 160) continue;
      const entryIds = parseEntryIdList(
        (item as { entryIds?: unknown }).entryIds ??
          (item as { entry_ids?: unknown }).entry_ids,
      );
      const cited = sourcesOrLegacy(
        (item as { sources?: unknown }).sources,
        entryIds,
        3,
      );
      out.push({ text: t, ...cited });
    }
    if (out.length >= maxItems) break;
  }
  return out.length > 0 ? out : undefined;
}

function parseWeeklyStringList(
  raw: unknown,
  maxItems: number,
): string[] | undefined {
  return parseWeeklyCitedItems(raw, maxItems)?.map((c) => c.text);
}

function parseWeeklyArc(raw: unknown): JournalWeeklyArc | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const start = typeof o.start === "string" ? o.start.trim() : "";
  const end = typeof o.end === "string" ? o.end.trim() : "";
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  if (!start || !end || !summary || !Array.isArray(o.days)) return undefined;
  const days: JournalWeeklyArcDay[] = [];
  for (const row of o.days) {
    if (!row || typeof row !== "object") continue;
    const date =
      typeof (row as { date?: unknown }).date === "string"
        ? (row as { date: string }).date.trim()
        : "";
    const valueRaw = (row as { value?: unknown }).value;
    const value =
      typeof valueRaw === "number"
        ? valueRaw
        : typeof valueRaw === "string"
          ? Number(valueRaw)
          : NaN;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value)) continue;
    days.push({
      date,
      value: Math.max(-5, Math.min(5, Math.round(value))),
    });
  }
  if (days.length < 3) return undefined;
  return { start, end, summary, days };
}

function parseWeeklyRecurringThought(
  raw: unknown,
): JournalWeeklyRecurringThought | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  const countRaw = o.count;
  const count =
    typeof countRaw === "number"
      ? countRaw
      : typeof countRaw === "string"
        ? Number(countRaw)
        : NaN;
  if (!text || !Number.isFinite(count) || count < 2) return undefined;
  const alsoOn = Array.isArray(o.alsoOn)
    ? o.alsoOn
        .filter(
          (d): d is string =>
            typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.trim()),
        )
        .map((d) => d.trim())
        .slice(0, 8)
    : undefined;
  return {
    text,
    count: Math.round(count),
    ...(alsoOn && alsoOn.length ? { alsoOn } : {}),
    ...sourcesOrLegacy(o.sources, o.entryIds ?? o.entry_ids, 6),
  };
}

function parseWeeklyEntryMoods(
  raw: unknown,
): JournalWeeklyEntryMood[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: JournalWeeklyEntryMood[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const entryIdRaw =
      (row as { entryId?: unknown }).entryId ??
      (row as { entry_id?: unknown }).entry_id;
    const entryId = typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";
    const moodRaw = (row as { mood?: unknown }).mood;
    if (!entryId || seen.has(entryId)) continue;
    if (typeof moodRaw !== "string" || !moodRaw.trim()) continue;
    const mood = moodRaw.trim().toLowerCase();
    if (!["calm", "good", "mixed", "low", "heavy"].includes(mood)) continue;
    seen.add(entryId);
    out.push({ entryId, mood });
  }
  return out.length > 0 ? out : undefined;
}

function parseWeeklyActivities(
  raw: unknown,
): JournalWeeklyActivityByEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: JournalWeeklyActivityByEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const entryIdRaw =
      (row as { entryId?: unknown }).entryId ??
      (row as { entry_id?: unknown }).entry_id;
    const entryId = typeof entryIdRaw === "string" ? entryIdRaw.trim() : "";
    if (!entryId || !Array.isArray((row as { items?: unknown }).items)) continue;
    const items: string[] = [];
    for (const it of (row as { items: unknown[] }).items) {
      if (typeof it !== "string") continue;
      const t = it.trim().toLowerCase().replace(/\s+/g, " ");
      if (t.length < 2 || t.length > 40) continue;
      items.push(t);
      if (items.length >= 4) break;
    }
    if (!items.length) continue;
    out.push({ entryId, items });
  }
  return out.length > 0 ? out : undefined;
}

function parseGeneratedParts(
  raw: unknown,
): JournalWeeklyGeneratedParts | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    letter: o.letter === true,
    felt: o.felt === true,
    moved: o.moved === true,
    wins: o.wins === true,
    thought: o.thought === true,
  };
}

function parseJournalWeeklyReflection(
  raw: unknown,
): JournalWeeklyReflection | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const letterMarkdown =
    typeof o.letterMarkdown === "string" ? o.letterMarkdown : "";
  const generatedParts = parseGeneratedParts(
    o.generatedParts ?? o.generated_parts,
  );
  const metaRaw =
    o.meta && typeof o.meta === "object"
      ? (o.meta as Record<string, unknown>)
      : {};
  const emotions = parseWeeklyEmotions(o.emotions);
  const moodSummary =
    typeof o.moodSummary === "string" && o.moodSummary.trim()
      ? o.moodSummary.trim()
      : undefined;
  const preview =
    typeof o.preview === "string" && o.preview.trim()
      ? o.preview.trim()
      : undefined;
  const title =
    typeof o.title === "string" && o.title.trim() ? o.title.trim() : undefined;
  const arc = parseWeeklyArc(o.arc);
  const wins = parseWeeklyCitedItems(o.wins, 5);
  const promises = parseWeeklyCitedItems(o.promises, 3);
  const recurringThought = parseWeeklyRecurringThought(
    o.recurringThought ?? o.recurring_thought,
  );
  const activities = parseWeeklyActivities(o.activities);
  const entryMoods = parseWeeklyEntryMoods(
    o.entryMoods ?? o.entry_moods,
  );
  const wellbeingLevel =
    o.wellbeing === "none" ||
    o.wellbeing === "struggling" ||
    o.wellbeing === "at_risk"
      ? o.wellbeing
      : o.wellbeing && typeof o.wellbeing === "object"
        ? (o.wellbeing as { level?: unknown }).level === "struggling" ||
          (o.wellbeing as { level?: unknown }).level === "at_risk" ||
          (o.wellbeing as { level?: unknown }).level === "none"
          ? ((o.wellbeing as { level: JournalWellbeingLevel }).level)
          : undefined
        : undefined;
  const hasLetter = Boolean(letterMarkdown.trim());
  const hasGeneratedPart = Boolean(
    generatedParts &&
      (generatedParts.letter ||
        generatedParts.felt ||
        generatedParts.moved ||
        generatedParts.wins ||
        generatedParts.thought),
  );
  const hasPatternPayload = Boolean(
    emotions ||
      arc ||
      wins ||
      promises ||
      recurringThought ||
      activities ||
      entryMoods,
  );
  // Patterns-only weeks may have an empty letter; legacy weeks always had a letter.
  if (!hasLetter && !hasGeneratedPart && !hasPatternPayload) return null;
  const periodTypeRaw = o.periodType;
  const periodType =
    periodTypeRaw === "last7" ||
    periodTypeRaw === "last30" ||
    periodTypeRaw === "custom" ||
    periodTypeRaw === "week"
      ? periodTypeRaw
      : undefined;
  return {
    ownerId: typeof o.ownerId === "string" ? o.ownerId : "",
    weekKey: typeof o.weekKey === "string" ? o.weekKey : "",
    weekStart: typeof o.weekStart === "string" ? o.weekStart : "",
    weekEnd: typeof o.weekEnd === "string" ? o.weekEnd : "",
    ...(periodType ? { periodType } : {}),
    ...(typeof o.startDate === "string" ? { startDate: o.startDate } : {}),
    ...(typeof o.endDate === "string" ? { endDate: o.endDate } : {}),
    ...(typeof o.rangeKey === "string" ? { rangeKey: o.rangeKey } : {}),
    letterMarkdown,
    ...(title ? { title } : {}),
    ...(preview ? { preview } : {}),
    ...(emotions ? { emotions } : {}),
    ...(moodSummary ? { moodSummary } : {}),
    ...(arc ? { arc } : {}),
    ...(wins ? { wins } : {}),
    ...(promises ? { promises } : {}),
    ...(recurringThought ? { recurringThought } : {}),
    ...(activities ? { activities } : {}),
    ...(entryMoods ? { entryMoods } : {}),
    ...(generatedParts ? { generatedParts } : {}),
    ...(wellbeingLevel ? { wellbeing: { level: wellbeingLevel } } : {}),
    ...(typeof o.letterAudioUrl === "string" && o.letterAudioUrl.trim()
      ? { letterAudioUrl: o.letterAudioUrl.trim() }
      : {}),
    ...(o.letterAudioStatus === "none" ||
    o.letterAudioStatus === "generating" ||
    o.letterAudioStatus === "ready" ||
    o.letterAudioStatus === "failed"
      ? { letterAudioStatus: o.letterAudioStatus }
      : {}),
    ...(typeof o.letterAudioError === "string" && o.letterAudioError.trim()
      ? { letterAudioError: o.letterAudioError.trim() }
      : {}),
    ...(typeof o.letterAudioProgress === "string" &&
    o.letterAudioProgress.trim()
      ? { letterAudioProgress: o.letterAudioProgress.trim() }
      : {}),
    ...(typeof o.letterAudioGeneratedAt === "string" &&
    o.letterAudioGeneratedAt.trim()
      ? { letterAudioGeneratedAt: o.letterAudioGeneratedAt.trim() }
      : {}),
    ...(typeof o.letterAudioVoiceId === "string" && o.letterAudioVoiceId.trim()
      ? { letterAudioVoiceId: o.letterAudioVoiceId.trim() }
      : {}),
    meta: {
      generatedAt:
        typeof metaRaw.generatedAt === "string" ? metaRaw.generatedAt : "",
      model: typeof metaRaw.model === "string" ? metaRaw.model : "",
      journalEntryCount:
        typeof metaRaw.journalEntryCount === "number"
          ? metaRaw.journalEntryCount
          : 0,
      meditationChatCount:
        typeof metaRaw.meditationChatCount === "number"
          ? metaRaw.meditationChatCount
          : 0,
      usage:
        metaRaw.usage && typeof metaRaw.usage === "object"
          ? (metaRaw.usage as {
              input_tokens: number;
              output_tokens: number;
            })
          : null,
    },
  };
}

export async function fetchJournalWeeklyReflectionRemote(opts?: {
  week?: string;
  startDate?: string;
  endDate?: string;
  periodType?: JournalInsightPeriodType;
  timeZone?: string;
}): Promise<{
  reflection: JournalWeeklyReflection | null;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  startDate?: string;
  endDate?: string;
  periodType?: JournalInsightPeriodType;
  rangeKey?: string;
  empty?: boolean;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const params = new URLSearchParams();
  if (opts?.week?.trim()) params.set("week", opts.week.trim());
  if (opts?.startDate?.trim()) params.set("start", opts.startDate.trim());
  if (opts?.endDate?.trim()) params.set("end", opts.endDate.trim());
  if (opts?.periodType) params.set("periodType", opts.periodType);
  if (opts?.timeZone?.trim()) params.set("timeZone", opts.timeZone.trim());
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await medimadeFetch(`${base}/journal/weekly-reflection${qs}`, {
    headers: medimadeApiAuthHeaders(),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const reflection = parseJournalWeeklyReflection(data.reflection);
  const periodType =
    data.periodType === "last7" ||
    data.periodType === "last30" ||
    data.periodType === "custom" ||
    data.periodType === "week"
      ? data.periodType
      : undefined;
  return {
    reflection,
    weekKey: typeof data.weekKey === "string" ? data.weekKey : "",
    weekStart: typeof data.weekStart === "string" ? data.weekStart : "",
    weekEnd: typeof data.weekEnd === "string" ? data.weekEnd : "",
    ...(typeof data.startDate === "string" ? { startDate: data.startDate } : {}),
    ...(typeof data.endDate === "string" ? { endDate: data.endDate } : {}),
    ...(periodType ? { periodType } : {}),
    ...(typeof data.rangeKey === "string" ? { rangeKey: data.rangeKey } : {}),
    empty: data.empty === true,
  };
}

export async function fetchJournalInsightsPreviewRemote(opts: {
  startDate?: string;
  endDate?: string;
  periodType?: JournalInsightPeriodType;
  timeZone?: string;
}): Promise<{ entryCount: number; meditationCount: number }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const params = new URLSearchParams({
    preview: "1",
  });
  if (opts.startDate?.trim()) params.set("start", opts.startDate.trim());
  if (opts.endDate?.trim()) params.set("end", opts.endDate.trim());
  if (opts.periodType) params.set("periodType", opts.periodType);
  if (opts.timeZone?.trim()) params.set("timeZone", opts.timeZone.trim());
  const res = await medimadeFetch(
    `${base}/journal/weekly-reflection?${params.toString()}`,
    { headers: medimadeApiAuthHeaders() },
  );
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  return {
    entryCount:
      typeof data.entryCount === "number" ? data.entryCount : 0,
    meditationCount:
      typeof data.meditationCount === "number" ? data.meditationCount : 0,
  };
}

export async function listJournalWeeklyLettersRemote(): Promise<{
  letters: JournalWeeklyLetterSummary[];
  currentWeekKey: string;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/journal/weekly-reflection?list=1`, {
    headers: medimadeApiAuthHeaders(),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail) ||
      (typeof data.error === "string" && data.error) ||
      res.statusText;
    throw new Error(msg);
  }
  const raw = Array.isArray(data.letters) ? data.letters : [];
  const letters: JournalWeeklyLetterSummary[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const weekKey = typeof row.weekKey === "string" ? row.weekKey : "";
    const weekStart = typeof row.weekStart === "string" ? row.weekStart : "";
    const weekEnd = typeof row.weekEnd === "string" ? row.weekEnd : "";
    const generatedAt =
      typeof row.generatedAt === "string" ? row.generatedAt : "";
    if (!weekKey || !weekStart || !weekEnd || !generatedAt) continue;
    const preview =
      typeof row.preview === "string" && row.preview.trim()
        ? row.preview.trim()
        : undefined;
    const emotions = parseWeeklyEmotions(row.emotions);
    const activities = parseWeeklyActivities(row.activities);
    const promises = parseWeeklyCitedItems(row.promises, 3);
    const recurringThought = parseWeeklyRecurringThought(
      row.recurringThought ?? row.recurring_thought,
    );
    letters.push({
      weekKey,
      weekStart,
      weekEnd,
      generatedAt,
      ...(typeof row.periodType === "string" &&
      (row.periodType === "last7" ||
        row.periodType === "last30" ||
        row.periodType === "custom" ||
        row.periodType === "week")
        ? { periodType: row.periodType }
        : {}),
      ...(typeof row.startDate === "string" ? { startDate: row.startDate } : {}),
      ...(typeof row.endDate === "string" ? { endDate: row.endDate } : {}),
      ...(typeof row.rangeKey === "string" ? { rangeKey: row.rangeKey } : {}),
      ...(preview ? { preview } : {}),
      ...(emotions ? { emotions } : {}),
      ...(activities ? { activities } : {}),
      ...(promises ? { promises } : {}),
      ...(recurringThought ? { recurringThought } : {}),
    });
  }
  return {
    letters,
    currentWeekKey:
      typeof data.currentWeekKey === "string"
        ? data.currentWeekKey
        : typeof data.currentRangeKey === "string"
          ? data.currentRangeKey
          : "",
  };
}

export async function runJournalWeeklyReflectionRemote(opts?: {
  week?: string;
  startDate?: string;
  endDate?: string;
  periodType?: JournalInsightPeriodType;
  timeZone?: string;
  letter?: boolean;
  patterns?: JournalWeeklyPatternsSelection;
  /** Short correction guidance strings for the model (max 10). */
  corrections?: string[];
  /**
   * When rewriting after thumbs-down: user note + the previous letter
   * (passed as reference so the model can avoid the same mistakes).
   */
  letterRevision?: {
    feedback: string;
    priorLetterMarkdown: string;
  };
  /** @deprecated Prefer letter/patterns selection; kept for older callers. */
  regenerate?: boolean;
}): Promise<{
  reflection: JournalWeeklyReflection | null;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  startDate?: string;
  endDate?: string;
  periodType?: JournalInsightPeriodType;
  rangeKey?: string;
  empty?: boolean;
  generationsRemaining?: number;
  error?: string;
  code?: string;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const patterns =
    opts?.patterns ??
    ({
      felt: true,
      moved: true,
      wins: true,
      thought: true,
    } satisfies JournalWeeklyPatternsSelection);
  const letter = opts?.letter ?? true;
  const revisionFeedback = opts?.letterRevision?.feedback?.trim() ?? "";
  const revisionPrior = opts?.letterRevision?.priorLetterMarkdown?.trim() ?? "";
  const res = await medimadeFetch(`${base}/journal/weekly-reflection`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      ...(opts?.week?.trim() ? { week: opts.week.trim() } : {}),
      ...(opts?.startDate?.trim() ? { startDate: opts.startDate.trim() } : {}),
      ...(opts?.endDate?.trim() ? { endDate: opts.endDate.trim() } : {}),
      ...(opts?.periodType ? { periodType: opts.periodType } : {}),
      ...(opts?.timeZone?.trim() ? { timeZone: opts.timeZone.trim() } : {}),
      letter,
      patterns,
      ...(opts?.corrections?.length
        ? { corrections: opts.corrections.slice(0, 10) }
        : {}),
      ...(revisionFeedback && revisionPrior
        ? {
            letterRevision: {
              feedback: revisionFeedback.slice(0, 800),
              priorLetterMarkdown: revisionPrior.slice(0, 6000),
            },
          }
        : {}),
      ...(opts?.regenerate ? { regenerate: true } : {}),
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail.trim()) ||
      (typeof data.error === "string" && data.error.trim()) ||
      (typeof res.statusText === "string" && res.statusText.trim()) ||
      `Request failed (${res.status})`;
    const err = new Error(msg) as Error & {
      code?: string;
      status?: number;
      resetsAt?: string;
    };
    if (typeof data.code === "string") err.code = data.code;
    if (typeof data.resetsAt === "string" && data.resetsAt.trim()) {
      err.resetsAt = data.resetsAt.trim();
    }
    // Gateway/API timeouts often omit a body — treat as daily_limit only when coded.
    err.status = res.status;
    throw err;
  }
  const reflection = parseJournalWeeklyReflection(data.reflection);
  const periodType =
    data.periodType === "last7" ||
    data.periodType === "last30" ||
    data.periodType === "custom" ||
    data.periodType === "week"
      ? data.periodType
      : undefined;
  return {
    reflection,
    weekKey: typeof data.weekKey === "string" ? data.weekKey : "",
    weekStart: typeof data.weekStart === "string" ? data.weekStart : "",
    weekEnd: typeof data.weekEnd === "string" ? data.weekEnd : "",
    ...(typeof data.startDate === "string" ? { startDate: data.startDate } : {}),
    ...(typeof data.endDate === "string" ? { endDate: data.endDate } : {}),
    ...(periodType ? { periodType } : {}),
    ...(typeof data.rangeKey === "string" ? { rangeKey: data.rangeKey } : {}),
    empty: data.empty === true,
  };
}

/** Queue Speechify narration for an Insights letter (async worker). */
export async function generateJournalLetterAudioRemote(opts: {
  startDate: string;
  endDate: string;
  periodType?: JournalInsightPeriodType;
  timeZone?: string;
  /** Speechify voice model id (defaults to Beatrice on the worker). */
  voiceId?: string;
}): Promise<{
  reflection: JournalWeeklyReflection | null;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  startDate?: string;
  endDate?: string;
  periodType?: JournalInsightPeriodType;
  rangeKey?: string;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const startDate = opts.startDate.trim();
  const endDate = opts.endDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error("startDate and endDate are required");
  }
  const voiceId = opts.voiceId?.trim() || "";
  const res = await medimadeFetch(`${base}/journal/weekly-reflection`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      action: "generateLetterAudio",
      startDate,
      endDate,
      ...(opts.periodType ? { periodType: opts.periodType } : {}),
      ...(opts.timeZone?.trim() ? { timeZone: opts.timeZone.trim() } : {}),
      ...(voiceId ? { voiceId } : {}),
    }),
  });
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg =
      (typeof data.detail === "string" && data.detail.trim()) ||
      (typeof data.error === "string" && data.error.trim()) ||
      (typeof res.statusText === "string" && res.statusText.trim()) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  const reflection = parseJournalWeeklyReflection(data.reflection);
  const periodType =
    data.periodType === "last7" ||
    data.periodType === "last30" ||
    data.periodType === "custom" ||
    data.periodType === "week"
      ? data.periodType
      : undefined;
  return {
    reflection,
    weekKey: typeof data.weekKey === "string" ? data.weekKey : "",
    weekStart: typeof data.weekStart === "string" ? data.weekStart : "",
    weekEnd: typeof data.weekEnd === "string" ? data.weekEnd : "",
    ...(typeof data.startDate === "string" ? { startDate: data.startDate } : {}),
    ...(typeof data.endDate === "string" ? { endDate: data.endDate } : {}),
    ...(periodType ? { periodType } : {}),
    ...(typeof data.rangeKey === "string" ? { rangeKey: data.rangeKey } : {}),
  };
}

/**
 * Poll until letter audio leaves "generating" (or timeout).
 * Worker can take several minutes for long letters.
 */
export async function pollJournalLetterAudioUntilSettled(opts: {
  startDate: string;
  endDate: string;
  periodType?: JournalInsightPeriodType;
  timeZone?: string;
  /** Max wait; default ~12 minutes. */
  maxMs?: number;
  intervalMs?: number;
  onUpdate?: (reflection: JournalWeeklyReflection) => void;
}): Promise<JournalWeeklyReflection | null> {
  const maxMs = opts.maxMs ?? 12 * 60_000;
  const intervalMs = opts.intervalMs ?? 2500;
  const deadline = Date.now() + maxMs;
  let last: JournalWeeklyReflection | null = null;
  while (Date.now() < deadline) {
    const got = await fetchJournalWeeklyReflectionRemote({
      startDate: opts.startDate,
      endDate: opts.endDate,
      periodType: opts.periodType,
      timeZone: opts.timeZone,
    });
    last = got.reflection;
    if (last) opts.onUpdate?.(last);
    const st = last?.letterAudioStatus;
    if (st === "ready" || st === "failed" || st === "none" || !st) {
      return last;
    }
    await sleepMs(intervalMs);
  }
  return last;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** API Gateway HTTP APIs hard-cap at 30s; Lambda may still finish and save. */
export function isLikelyInsightsGatewayTimeout(e: unknown): boolean {
  const err = e as Error & { status?: number };
  if (!(e instanceof Error)) return false;
  if (err.status === 504 || err.status === 503) return true;
  return /timeout|timed out|gateway|request failed \(50[34]\)|failed to fetch|networkerror/i.test(
    err.message,
  );
}

/**
 * After a gateway timeout, poll GET until a freshly saved reflection appears
 * (Lambda timeout is 60s and often completes after API Gateway gives up).
 */
export async function pollJournalWeeklyReflectionAfterGenerate(opts: {
  startDate?: string;
  endDate?: string;
  periodType?: JournalInsightPeriodType;
  timeZone?: string;
  /** Ignore reflections older than this (ms since epoch). */
  notBeforeMs: number;
  attempts?: number;
  delayMs?: number;
}): Promise<{
  reflection: JournalWeeklyReflection | null;
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  startDate?: string;
  endDate?: string;
  periodType?: JournalInsightPeriodType;
  rangeKey?: string;
  empty?: boolean;
} | null> {
  const attempts = opts.attempts ?? 16;
  const delayMs = opts.delayMs ?? 2000;
  const floor = opts.notBeforeMs - 15_000;
  for (let i = 0; i < attempts; i++) {
    await sleepMs(delayMs);
    try {
      const got = await fetchJournalWeeklyReflectionRemote({
        ...(opts.startDate ? { startDate: opts.startDate } : {}),
        ...(opts.endDate ? { endDate: opts.endDate } : {}),
        ...(opts.periodType ? { periodType: opts.periodType } : {}),
        ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
      });
      const genAt = got.reflection?.meta?.generatedAt;
      if (!genAt) continue;
      const t = new Date(genAt).getTime();
      if (Number.isFinite(t) && t >= floor) return got;
    } catch {
      /* keep polling */
    }
  }
  return null;
}

async function streamChatRequest(
  body: Record<string, unknown>,
  onDelta: (chunk: string) => void,
  emptyMessage: string,
): Promise<string> {
  const url = getMedimadeChatUrl();
  if (!url) {
    throw new Error("VITE_MEDIMADE_CHAT_URL is not set");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const ct = res.headers.get("content-type") ?? "";

  if (!res.ok) {
    let msg = res.statusText;
    try {
      if (ct.includes("application/json")) {
        const j = (await res.json()) as { error?: string; detail?: string };
        msg = j.detail ?? j.error ?? msg;
      } else {
        msg = (await res.text()).slice(0, 500) || msg;
      }
    } catch {
      /* keep msg */
    }
    throw new Error(msg);
  }

  if (!ct.includes("text/event-stream")) {
    const t = await res.text();
    throw new Error(
      t.slice(0, 200) || "Expected text/event-stream from chat endpoint",
    );
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const dec = new TextDecoder();
  let carry = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = carry.indexOf("\n\n")) !== -1) {
      const block = carry.slice(0, sep);
      carry = carry.slice(sep + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.replace(/^data:\s*/, "").trim();
        if (!raw) continue;
        let data: { d?: string; done?: boolean; error?: string };
        try {
          data = JSON.parse(raw) as { d?: string; done?: boolean; error?: string };
        } catch {
          continue;
        }
        if (data.error) {
          throw new Error(data.error);
        }
        if (typeof data.d === "string" && data.d.length > 0) {
          full += data.d;
          onDelta(data.d);
        }
      }
    }
  }

  if (!full.trim()) {
    throw new Error(emptyMessage);
  }

  return full;
}

/**
 * Streams Claude tokens from Anthropic via our Lambda (SSE). Calls onDelta for each chunk.
 */
export async function streamMedimadeChat(
  params: {
    meditationStyle: string;
    messages: MedimadeChatTurn[];
    /** When true, style is a journal placeholder — do not lock coach/script to a preset technique. */
    journalMode?: boolean;
    /** Create › By Program — coach gathers per-session customization intake in order. */
    fromProgram?: boolean;
    meditationTargetMinutes?: MeditationTargetMinutes;
    /** How to interpret a reflected journal entry; omit when empty. */
    journalGuidance?: string;
    /** Dev-only Claude A/B; server falls back to Haiku for unknown ids. */
    claudeModel?: string;
  },
  onDelta: (chunk: string) => void,
): Promise<string> {
  const guidance = params.journalGuidance?.trim();
  return streamChatRequest(
    {
      mode: "chat",
      meditationStyle: params.meditationStyle,
      messages: params.messages,
      ...(params.journalMode === true ? { journalMode: true } : {}),
      ...(params.fromProgram === true ? { fromProgram: true } : {}),
      ...(guidance ? { journalGuidance: guidance } : {}),
      ...(params.claudeModel ? { claudeModel: params.claudeModel } : {}),
      ...(isMeditationTargetMinutes(params.meditationTargetMinutes)
        ? { meditationTargetMinutes: params.meditationTargetMinutes }
        : {}),
    },
    onDelta,
    "Empty reply from guide",
  );
}

/**
 * Streams a ~5-minute guided meditation script from Claude using full chat transcript + style hint.
 */
export async function streamMeditationScript(
  params: {
    meditationStyle: string | null;
    transcript: string;
    journalMode?: boolean;
    meditationTargetMinutes?: MeditationTargetMinutes;
    /** Fish playback speed (1 = default); should match create job `speed` for consistent word targets. */
    speechSpeed?: number;
    /** Dev-only Claude A/B; server falls back to Haiku for unknown ids. */
    claudeModel?: string;
  },
  onDelta: (chunk: string) => void,
): Promise<string> {
  return streamChatRequest(
    {
      mode: "generate_script",
      meditationStyle: params.meditationStyle ?? "",
      transcript: params.transcript,
      ...(params.journalMode === true ? { journalMode: true } : {}),
      ...(params.claudeModel ? { claudeModel: params.claudeModel } : {}),
      ...(isMeditationTargetMinutes(params.meditationTargetMinutes)
        ? { meditationTargetMinutes: params.meditationTargetMinutes }
        : {}),
      ...(typeof params.speechSpeed === "number" &&
      Number.isFinite(params.speechSpeed)
        ? { speechSpeed: params.speechSpeed }
        : {}),
    },
    onDelta,
    "Empty script from model",
  );
}

export type GenerateMeditationAudioResponse = {
  audioUrl: string;
  scriptTextUsed: string;
  audioKey: string;
};

export type MeditationAudioJobStatus = {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed" | string;
  audioUrl?: string;
  scriptTextUsed?: string;
  audioKey?: string;
  title?: string;
  description?: string;
  error?: string;
  /** Measured MP3 length when the job completed. */
  durationSeconds?: number | null;
};

export type BackgroundAudioItem = {
  key: string;
  name: string;
  size: number | null;
  /** Normalized WAV sibling for pro-tier / high-quality download when present. */
  wavKey?: string;
  subcategory?: string;
  /** Public CDN URL for composition / soundscape cover art when present. */
  coverImageUrl?: string | null;
  /** Smaller JPEG thumb for list / picker cards. */
  coverImageThumbUrl?: string | null;
};

/** Prefer CDN MP3 for previews and mixer jobs (`background-audio/…` beds). */
export {
  backgroundAudioPlaybackKey,
  backgroundAudioStreamingKey,
} from "@consciously/common";

export type BackgroundAudioByCategory = {
  baseUrl?: string;
  nature: BackgroundAudioItem[];
  music: BackgroundAudioItem[];
  /** Full-length pieces picked whole, rather than looped beds. */
  compositions: BackgroundAudioItem[];
  drums: BackgroundAudioItem[];
  noise: BackgroundAudioItem[];
  factoryMixes?: MixerFactoryPreset[];
};

export type FishSpeaker = {
  name: string;
  modelId: string;
  description?: string;
  /** Meditation types this voice suits, for tag pills. Free text. */
  goodFor?: string[];
  /** Omitted when not specified. */
  gender?: VoiceGender;
  /** TTS vendor. Live `/fish/speakers` includes this; hardcoded fallbacks are Fish. */
  brand?: "fish" | "speechify";
  /** Admin row timestamp — Create/mixer append this to bust cached samples. */
  updatedAt?: string;
};

export type VoiceGender = "male" | "female";

export type OrpheusSpeaker = {
  id: string;
  name: string;
  description?: string;
};

export type TtsProvider = "fish" | "orpheus" | "speechify";

export function ttsProviderForSpeaker(
  speaker: Pick<FishSpeaker, "brand"> | null | undefined,
): Exclude<TtsProvider, "orpheus"> {
  return speaker?.brand === "speechify" ? "speechify" : "fish";
}

/** Fish pause render path. Default `segmented` (ffmpeg silence). */
export type FishPauseMode = "native" | "segmented";

/** Pedalboard preset for light delay + reverb (sound mixer / speaker previews). */
export const VOICE_FX_PRESET_MEDITATION_MIXER = "mixer";

export type VoiceFxApiResponse = {
  format: string;
  sampleRate: number;
  channels: number;
  audioBase64: string;
  preset?: string;
  inputFormat?: string;
};

/**
 * POST /audio/voice-fx — MP3/WAV in (base64), WAV out. Used for custom flows; speaker previews use pre-built `-fx.wav` on the CDN when available.
 */
export async function applyVoiceFx(params: {
  audioBase64: string;
  preset?: string;
  inputFormat?: "mp3" | "wav" | "auto";
}): Promise<VoiceFxApiResponse> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/audio/voice-fx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audioBase64: params.audioBase64,
      preset: params.preset ?? VOICE_FX_PRESET_MEDITATION_MIXER,
      inputFormat: params.inputFormat ?? "auto",
    }),
  });
  const data = (await res.json()) as VoiceFxApiResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? res.statusText);
  }
  return data;
}

export async function listFishSpeakers(): Promise<FishSpeaker[]> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/fish/speakers`);
  const data = (await res.json()) as {
    speakers?: FishSpeaker[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
  return (data.speakers ?? []).filter(
    (s) => s.modelId !== "8d797adca9af48ca9e8a1c7284db1d6c",
  );
}

export async function listOrpheusSpeakers(): Promise<OrpheusSpeaker[]> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/orpheus/speakers`);
  const data = (await res.json()) as {
    voices?: OrpheusSpeaker[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
  return data.voices ?? [];
}

const ORPHEUS_PREVIEW_LINE =
  "Take a slow breath in, and let it go.";

/** Live Orpheus preview via `POST /orpheus/tts` (WAV blob). */
export async function fetchOrpheusSpeechPreview(params: {
  voice: string;
  speed?: number;
  input?: string;
}): Promise<Blob> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/orpheus/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: params.input ?? ORPHEUS_PREVIEW_LINE,
      voice: params.voice,
      response_format: "wav",
      ...(typeof params.speed === "number" && Number.isFinite(params.speed)
        ? { speed: params.speed }
        : {}),
    }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = (await res.json()) as { error?: string; detail?: string };
      msg = data.detail ?? data.error ?? msg;
    } catch {
      /* binary or empty */
    }
    throw new Error(msg);
  }
  return res.blob();
}

/** Calls backend Lambda to generate script (if needed), synthesize with Fish, store in S3, and return CloudFront URL. */
export async function generateMeditationAudio(params: {
  meditationStyle: string | null;
  transcript: string;
  scriptText?: string | null;
  reference_id: string;
  ttsProvider?: TtsProvider;
  speed?: number;
  /** If set, applies voice FX (Pedalboard) after loudness normalization. */
  voiceFxPreset?: string | null;
  voiceFxDial?: number;
  /** @deprecated use layered background keys + gains */
  backgroundSoundKey?: string | null;
  backgroundNatureKey?: string | null;
  backgroundMusicKey?: string | null;
  backgroundDrumsKey?: string | null;
  backgroundNoiseKey?: string | null;
  backgroundNatureGain?: number;
  backgroundMusicGain?: number;
  backgroundDrumsGain?: number;
  backgroundNoiseGain?: number;
}): Promise<GenerateMeditationAudioResponse> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");

  const speed =
    typeof params.speed === "number" && Number.isFinite(params.speed)
      ? params.speed
      : undefined;
  const backgroundSoundKey =
    typeof params.backgroundSoundKey === "string" &&
    params.backgroundSoundKey.trim().length > 0
      ? params.backgroundSoundKey.trim()
      : undefined;

  const trimBg = (v: string | null | undefined) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;

  const backgroundNatureKey = trimBg(params.backgroundNatureKey ?? null);
  const backgroundMusicKey = trimBg(params.backgroundMusicKey ?? null);
  const backgroundDrumsKey = trimBg(params.backgroundDrumsKey ?? null);
  const backgroundNoiseKey = trimBg(params.backgroundNoiseKey ?? null);

  const jobBody: Record<string, unknown> = {
    meditationStyle: params.meditationStyle ?? "",
    transcript: params.transcript,
    scriptText: params.scriptText ?? "",
    reference_id: params.reference_id,
    ...(params.ttsProvider ? { ttsProvider: params.ttsProvider } : {}),
    ...(params.voiceFxPreset ? { voiceFxPreset: params.voiceFxPreset } : {}),
    ...(typeof params.voiceFxDial === "number" ? { voiceFxDial: params.voiceFxDial } : {}),
    ...(speed === undefined ? {} : { speed }),
    ...(backgroundSoundKey === undefined ? {} : { backgroundSoundKey }),
    ...(backgroundNatureKey ? { backgroundNatureKey } : {}),
    ...(backgroundMusicKey ? { backgroundMusicKey } : {}),
    ...(backgroundDrumsKey ? { backgroundDrumsKey } : {}),
    ...(backgroundNoiseKey ? { backgroundNoiseKey } : {}),
    ...(sessionTokenForBody() ? { sessionToken: sessionTokenForBody() } : {}),
  };

  if (typeof params.backgroundNatureGain === "number") {
    jobBody.backgroundNatureGain = params.backgroundNatureGain;
  }
  if (typeof params.backgroundMusicGain === "number") {
    jobBody.backgroundMusicGain = params.backgroundMusicGain;
  }
  if (typeof params.backgroundDrumsGain === "number") {
    jobBody.backgroundDrumsGain = params.backgroundDrumsGain;
  }
  if (typeof params.backgroundNoiseGain === "number") {
    jobBody.backgroundNoiseGain = params.backgroundNoiseGain;
  }

  const createRes = await medimadeFetch(`${base}/meditation/audio/jobs`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(jobBody),
  });

  const createData = (await createRes.json()) as {
    jobId?: string;
    error?: string;
    detail?: string;
  };

  if (!createRes.ok || !createData.jobId) {
    const authMsg = meditationAudioAuthFailureMessage(
      createRes.status,
      createData.detail ?? createData.error,
    );
    throw new Error(
      authMsg ??
        (createData.detail ??
          createData.error ??
          createRes.statusText ??
          "Audio job creation failed"),
    );
  }

  const jobId = createData.jobId;

  // Poll job status until completion or failure.
  const start = Date.now();
  const timeoutMs = 10 * 60 * 1000; // 10 minutes
  let delayMs = 1500;

  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Audio generation timed out");
    }

    const statusRes = await medimadeFetch(meditationAudioJobStatusUrl(base, jobId), {
      headers: medimadeApiAuthHeaders(),
    });
    const statusData = (await statusRes.json()) as {
      status?: string;
      audioUrl?: string;
      scriptTextUsed?: string;
      audioKey?: string;
      error?: string;
    };

    if (!statusRes.ok) {
      const msg =
        statusData.error ?? statusRes.statusText ?? "Audio job status failed";
      throw new Error(msg);
    }

    if (statusData.status === "completed") {
      if (!statusData.audioUrl || !statusData.scriptTextUsed || !statusData.audioKey) {
        throw new Error("Audio job completed with incomplete data");
      }
      return {
        audioUrl: statusData.audioUrl,
        scriptTextUsed: statusData.scriptTextUsed,
        audioKey: statusData.audioKey,
      };
    }

    if (statusData.status === "failed") {
      throw new Error(statusData.error ?? "Audio generation failed");
    }

    await new Promise((r) => setTimeout(r, delayMs));
    delayMs = Math.min(5000, delayMs + 500);
  }
}

/** Creates an async meditation audio job and returns the job id (does not poll). */
export async function createMeditationAudioJob(params: {
  meditationStyle: string | null;
  /** When true, library metadata must infer preset `meditationType` from chat + script (journal flow). */
  journalMode?: boolean;
  /** Guided length for worker script generation when `scriptText` is empty. */
  meditationTargetMinutes?: MeditationTargetMinutes;
  transcript: string;
  scriptText?: string | null;
  reference_id: string;
  ttsProvider?: TtsProvider;
  /** Fish Audio model. New jobs send `s2.1-pro-free`; `s1` remains accepted. */
  fishTtsModel?: "s2.1-pro" | "s2.1-pro-free" | "s1" | string;
  /** Dev-only Claude A/B for worker script + metadata generation. */
  claudeModel?: string;
  /** Dev: Fish qualitative tags vs ffmpeg silence chunks. Default segmented. */
  fishPauseMode?: FishPauseMode;
  /** Experienced pacing — cued open sits (~1–2 min); same Length target. */
  longerBreaks?: boolean;
  /** Program shelf audio — keep off My Creations. */
  excludeFromLibrary?: boolean;
  /** Ideate life-area id when generated from that area / goal path. */
  lifeAreaId?: string | null;
  /** Create-path snapshot for Library “How this was made”. */
  creationProvenance?: MeditationCreationProvenance | null;
  speed?: number;
  /** If set, applies voice FX (Pedalboard) after loudness normalization. */
  voiceFxPreset?: string | null;
  voiceFxDial?: number;
  /** @deprecated use layered background keys + gains */
  backgroundSoundKey?: string | null;
  backgroundNatureKey?: string | null;
  backgroundMusicKey?: string | null;
  backgroundDrumsKey?: string | null;
  backgroundNoiseKey?: string | null;
  backgroundNatureGain?: number;
  backgroundMusicGain?: number;
  backgroundDrumsGain?: number;
  backgroundNoiseGain?: number;
}): Promise<{ jobId: string }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");

  const speed =
    typeof params.speed === "number" && Number.isFinite(params.speed)
      ? params.speed
      : undefined;
  const backgroundSoundKey =
    typeof params.backgroundSoundKey === "string" &&
    params.backgroundSoundKey.trim().length > 0
      ? params.backgroundSoundKey.trim()
      : undefined;

  const trimBg = (v: string | null | undefined) =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;

  const backgroundNatureKey = trimBg(params.backgroundNatureKey ?? null);
  const backgroundMusicKey = trimBg(params.backgroundMusicKey ?? null);
  const backgroundDrumsKey = trimBg(params.backgroundDrumsKey ?? null);
  const backgroundNoiseKey = trimBg(params.backgroundNoiseKey ?? null);

  const meditationTargetMinutes = coerceMeditationTargetMinutes(
    params.meditationTargetMinutes,
  );

  const jobBody: Record<string, unknown> = {
    meditationStyle: params.meditationStyle ?? "",
    transcript: params.transcript,
    scriptText: params.scriptText ?? "",
    reference_id: params.reference_id,
    ...(params.ttsProvider ? { ttsProvider: params.ttsProvider } : {}),
    ...(params.fishTtsModel ? { fishTtsModel: params.fishTtsModel } : {}),
    ...(params.claudeModel ? { claudeModel: params.claudeModel } : {}),
    ...(params.fishPauseMode === "native" || params.fishPauseMode === "segmented"
      ? { fishPauseMode: params.fishPauseMode }
      : {}),
    ...(params.longerBreaks === true ? { longerBreaks: true } : {}),
    meditationTargetMinutes,
    ...(params.journalMode === true ? { journalMode: true } : {}),
    ...(params.excludeFromLibrary === true ? { excludeFromLibrary: true } : {}),
    ...(typeof params.lifeAreaId === "string" && params.lifeAreaId.trim()
      ? { lifeAreaId: params.lifeAreaId.trim() }
      : {}),
    ...(params.creationProvenance
      ? { creationProvenance: params.creationProvenance }
      : {}),
    ...(params.voiceFxPreset ? { voiceFxPreset: params.voiceFxPreset } : {}),
    ...(typeof params.voiceFxDial === "number" ? { voiceFxDial: params.voiceFxDial } : {}),
    ...(sessionTokenForBody() ? { sessionToken: sessionTokenForBody() } : {}),
    ...(speed === undefined ? {} : { speed }),
    ...(backgroundSoundKey === undefined ? {} : { backgroundSoundKey }),
    ...(backgroundNatureKey ? { backgroundNatureKey } : {}),
    ...(backgroundMusicKey ? { backgroundMusicKey } : {}),
    ...(backgroundDrumsKey ? { backgroundDrumsKey } : {}),
    ...(backgroundNoiseKey ? { backgroundNoiseKey } : {}),
  };

  if (typeof params.backgroundNatureGain === "number") {
    jobBody.backgroundNatureGain = params.backgroundNatureGain;
  }
  if (typeof params.backgroundMusicGain === "number") {
    jobBody.backgroundMusicGain = params.backgroundMusicGain;
  }
  if (typeof params.backgroundDrumsGain === "number") {
    jobBody.backgroundDrumsGain = params.backgroundDrumsGain;
  }
  if (typeof params.backgroundNoiseGain === "number") {
    jobBody.backgroundNoiseGain = params.backgroundNoiseGain;
  }

  const createRes = await medimadeFetch(`${base}/meditation/audio/jobs`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(jobBody),
  });

  let createData: { jobId?: string; error?: string; detail?: string } = {};
  try {
    createData = (await createRes.json()) as typeof createData;
  } catch {
    throw new Error(
      meditationAudioAuthFailureMessage(createRes.status, null) ??
        `Audio job creation failed (${createRes.status || "network error"})`,
    );
  }

  if (!createRes.ok || !createData.jobId) {
    const authMsg = meditationAudioAuthFailureMessage(
      createRes.status,
      createData.detail ?? createData.error,
    );
    throw new Error(
      authMsg ??
        (createData.detail ??
          createData.error ??
          createRes.statusText ??
          "Audio job creation failed"),
    );
  }

  return { jobId: createData.jobId };
}

export async function getMeditationAudioJobStatus(
  jobId: string,
): Promise<MeditationAudioJobStatus> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const id = jobId.trim();
  if (!id) throw new Error("jobId is required");

  const res = await medimadeFetch(meditationAudioJobStatusUrl(base, id), {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as MeditationAudioJobStatus;
  if (!res.ok) {
    throw new Error(
      meditationAudioAuthFailureMessage(res.status, data.error) ??
        (data.error ?? res.statusText ?? "Audio job status failed"),
    );
  }
  return { ...data, jobId: data.jobId ?? id };
}

export type AdminSoundCategory = "music" | "compositions" | "ambience" | "drums" | "noise";

/** loop_verified is categorised with the loop seam checked — admin-only marker. */
export type AdminSoundStatus =
  | "in_use"
  | "pending"
  | "unused"
  | "categorised"
  | "loop_verified";

export type AdminSoundProcessingStage =
  | "uploading"
  | "downloading"
  | "normalizing"
  | "encoding"
  | "storing"
  | "done"
  | "failed";

export type AdminSoundProcessing = {
  stage: AdminSoundProcessingStage;
  error?: string;
  detail?: string;
  attempt?: number;
  updatedAt: string;
};

/** Multipart upload started in the browser but never completed. */
export type AdminSoundPendingUpload = {
  uploadId: string;
  initiatedAt: string | null;
  uploadedBytes: number;
  partCount: number;
};

export type AdminSoundItem = {
  key: string;
  wavKey?: string;
  name: string;
  size: number | null;
  packPath?: string | null;
  folderCategory: AdminSoundCategory | null;
  category: AdminSoundCategory;
  subcategory: string;
  suggestedCategory: AdminSoundCategory | null;
  suggestedSubcategory: string | null;
  suggestedName: string | null;
  tags: string[];
  enabled: boolean;
  status: AdminSoundStatus;
  notes: string;
  originalKey?: string;
  trimStartSec: number;
  trimEndSec: number | null;
  fadeInSec: number;
  fadeOutSec: number;
  inCatalog: boolean;
  ready: boolean;
  hasRaw?: boolean;
  rawKey?: string | null;
  processing?: AdminSoundProcessing | null;
  pendingUpload?: AdminSoundPendingUpload | null;
  importedAt: string | null;
  updatedAt: string | null;
  coverImageKey?: string | null;
  coverImageUrl?: string | null;
  lastCoverPrompt?: string | null;
};

export type AdminSoundsList = {
  baseUrl?: string;
  categories: AdminSoundCategory[];
  counts: {
    total: number;
    inUse: number;
    pending: number;
    unused: number;
    categorised: number;
    loopVerified: number;
    inCatalog: number;
  };
  items: AdminSoundItem[];
};

export async function listAdminSounds(): Promise<AdminSoundsList> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/sounds`, { headers: medimadeApiAuthHeaders() });
  const data = (await res.json()) as AdminSoundsList & { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    baseUrl: data.baseUrl,
    categories: data.categories ?? ["music", "compositions", "ambience", "drums", "noise"],
    counts: {
      total: data.counts?.total ?? 0,
      inUse: data.counts?.inUse ?? 0,
      pending: data.counts?.pending ?? 0,
      unused: data.counts?.unused ?? 0,
      categorised: data.counts?.categorised ?? 0,
      loopVerified: data.counts?.loopVerified ?? 0,
      inCatalog: data.counts?.inCatalog ?? 0,
    },
    items: (data.items ?? []).map((it) => {
      const rawCat = String(it.category ?? "");
      const rawFolder = it.folderCategory ? String(it.folderCategory) : null;
      const rawSuggested = it.suggestedCategory ? String(it.suggestedCategory) : null;
      return {
        ...it,
        category: (rawCat === "nature" ? "ambience" : it.category) as AdminSoundCategory,
        folderCategory: (rawFolder === "nature" ? "ambience" : it.folderCategory) as
          | AdminSoundCategory
          | null,
        suggestedCategory: (rawSuggested === "nature" ? "ambience" : it.suggestedCategory) as
          | AdminSoundCategory
          | null,
        status: it.status ?? (it.enabled ? "in_use" : "unused"),
        suggestedName: it.suggestedName ?? null,
        importedAt: it.importedAt ?? it.updatedAt ?? null,
      };
    }),
  };
}

export type AdminCompositionCoverItem = {
  key: string;
  name: string;
  category: "compositions";
  coverImageKey: string | null;
  coverImageUrl: string | null;
  coverImageThumbKey: string | null;
  coverImageThumbUrl: string | null;
  lastCoverPrompt: string | null;
  coverPromptHistory: string[];
  updatedAt: string | null;
};

function parseAdminCompositionCoverItem(
  raw: unknown,
): AdminCompositionCoverItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = typeof o.key === "string" ? o.key.trim() : "";
  const name = typeof o.name === "string" ? o.name.trim() : "";
  if (!key || !name) return null;
  return {
    key,
    name,
    category: "compositions",
    coverImageKey:
      typeof o.coverImageKey === "string" && o.coverImageKey.trim()
        ? o.coverImageKey.trim()
        : null,
    coverImageUrl:
      typeof o.coverImageUrl === "string" && o.coverImageUrl.trim()
        ? o.coverImageUrl.trim()
        : null,
    coverImageThumbKey:
      typeof o.coverImageThumbKey === "string" && o.coverImageThumbKey.trim()
        ? o.coverImageThumbKey.trim()
        : null,
    coverImageThumbUrl:
      typeof o.coverImageThumbUrl === "string" && o.coverImageThumbUrl.trim()
        ? o.coverImageThumbUrl.trim()
        : null,
    lastCoverPrompt:
      typeof o.lastCoverPrompt === "string" && o.lastCoverPrompt.trim()
        ? o.lastCoverPrompt.trim()
        : null,
    coverPromptHistory: Array.isArray(o.coverPromptHistory)
      ? o.coverPromptHistory
          .filter((p): p is string => typeof p === "string")
          .map((p) => p.trim())
          .filter(Boolean)
      : [],
    updatedAt:
      typeof o.updatedAt === "string" && o.updatedAt.trim()
        ? o.updatedAt.trim()
        : null,
  };
}

export async function listAdminCompositionCovers(): Promise<{
  baseUrl?: string;
  items: AdminCompositionCoverItem[];
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/composition-covers`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as {
    baseUrl?: string;
    items?: unknown[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const items: AdminCompositionCoverItem[] = [];
  for (const raw of data.items ?? []) {
    const item = parseAdminCompositionCoverItem(raw);
    if (item) items.push(item);
  }
  return { baseUrl: data.baseUrl, items };
}

async function postAdminCompositionCoverAction(
  body: Record<string, unknown>,
): Promise<AdminCompositionCoverItem> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/composition-covers`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    item?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const item = parseAdminCompositionCoverItem(data.item);
  if (!item) throw new Error("Invalid composition cover response");
  invalidateBackgroundAudioClientCache();
  return item;
}

export async function generateAdminCompositionCover(params: {
  key: string;
  title?: string;
  model?: AdminImageModel;
  /** Refinement note for regen — empty = fresh title-based generate. */
  changeRequest?: string;
}): Promise<AdminCompositionCoverItem> {
  return postAdminCompositionCoverAction({
    action: "generate-cover",
    key: params.key,
    title: params.title ?? "",
    model: params.model ?? "gpt-image-1-mini",
    changeRequest: params.changeRequest ?? "",
  });
}

export async function clearAdminCompositionCover(
  key: string,
): Promise<AdminCompositionCoverItem> {
  return postAdminCompositionCoverAction({
    action: "clear-cover",
    key,
  });
}

/** Resize existing full covers → thumbs. Does not call AI image gen. */
export async function ensureAdminCompositionCoverThumbs(params?: {
  keys?: string[];
}): Promise<{
  ok: number;
  fail: number;
  processed: number;
  errors: { key: string; error: string }[];
  items: AdminCompositionCoverItem[];
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/composition-covers`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      action: "ensure-thumbs",
      ...(params?.keys?.length ? { keys: params.keys } : {}),
    }),
  });
  const data = (await res.json()) as {
    ok?: number;
    fail?: number;
    processed?: number;
    errors?: { key?: string; error?: string }[];
    items?: unknown[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const items: AdminCompositionCoverItem[] = [];
  for (const raw of data.items ?? []) {
    const item = parseAdminCompositionCoverItem(raw);
    if (item) items.push(item);
  }
  return {
    ok: typeof data.ok === "number" ? data.ok : 0,
    fail: typeof data.fail === "number" ? data.fail : 0,
    processed: typeof data.processed === "number" ? data.processed : 0,
    errors: (data.errors ?? [])
      .map((e) => ({
        key: typeof e.key === "string" ? e.key : "",
        error: typeof e.error === "string" ? e.error : "failed",
      }))
      .filter((e) => e.key),
    items,
  };
}

export type AdminAiProviderId =
  | "anthropic"
  | "fish"
  | "openai"
  | "google"
  | "speechify";

export type AdminAiProviderCard = {
  id: AdminAiProviderId;
  label: string;
  uses: string;
  rateLines: string[];
  creditSource: "live" | "manual" | "none";
  creditNote: string;
  remainingUsd: number | null;
  remainingSource: "live" | "manual" | "unknown";
  manualNote: string;
  manualUpdatedAt: string | null;
  trackedSpendUsd: number;
  trackedDetail: string;
  fishLiveError: string | null;
};

export type AdminAiCostsSnapshot = {
  generatedAt: string;
  providers: AdminAiProviderCard[];
  trackedTotalUsd: number;
  notes: string[];
};

export async function getAdminAiCosts(): Promise<AdminAiCostsSnapshot> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/ai-costs`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as Partial<AdminAiCostsSnapshot> & {
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    generatedAt:
      typeof data.generatedAt === "string"
        ? data.generatedAt
        : new Date().toISOString(),
    providers: Array.isArray(data.providers)
      ? (data.providers as AdminAiProviderCard[])
      : [],
    trackedTotalUsd:
      typeof data.trackedTotalUsd === "number" ? data.trackedTotalUsd : 0,
    notes: Array.isArray(data.notes)
      ? data.notes.filter((n): n is string => typeof n === "string")
      : [],
  };
}

export async function setAdminAiCreditBalance(params: {
  provider: AdminAiProviderId;
  remainingUsd: number | null;
  note?: string;
}): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/ai-costs`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      action: "set-credits",
      provider: params.provider,
      remainingUsd: params.remainingUsd,
      note: params.note ?? "",
    }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
}

export async function patchAdminSound(body: {
  key: string;
  enabled?: boolean;
  status?: AdminSoundStatus;
  category?: AdminSoundCategory;
  subcategory?: string;
  tags?: string[];
  name?: string;
  notes?: string;
}): Promise<{ key: string }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/sounds`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { key?: string; error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  invalidateBackgroundAudioClientCache();
  return { key: data.key ?? body.key };
}

export async function createAdminSoundUploads(params: {
  files: Array<{ relativePath: string; contentType: string; size: number }>;
  /** Pins the imported files to a category instead of letting the classifier pick. */
  category?: AdminSoundCategory;
  subcategory?: string;
  signal?: AbortSignal;
}): Promise<{
  uploads: AdminSoundUpload[];
  skippedCount: number;
  skipped: string[];
  /** Already in S3 but unprocessed: normalization was re-triggered, no re-upload. */
  reprocessedCount: number;
  reprocessed: string[];
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/sounds`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      files: params.files,
      ...(params.category ? { category: params.category } : {}),
      ...(params.category && params.subcategory ? { subcategory: params.subcategory } : {}),
    }),
    signal: params.signal,
  });
  const data = (await res.json()) as {
    uploads?: AdminSoundUpload[];
    skippedCount?: number;
    skipped?: string[];
    reprocessedCount?: number;
    reprocessed?: string[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    uploads: data.uploads ?? [],
    skippedCount: data.skippedCount ?? data.skipped?.length ?? 0,
    skipped: data.skipped ?? [],
    reprocessedCount: data.reprocessedCount ?? data.reprocessed?.length ?? 0,
    reprocessed: data.reprocessed ?? [],
  };
}

export type AdminSoundUpload = {
  filename: string;
  relativePath: string;
  url?: string;
  multipart?: { uploadId: string; partSize: number; urls: string[] };
  rawKey: string;
  key: string;
  wavKey: string;
  contentType: string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** XHR rather than fetch: it is the only way to read upload progress. */
function putS3Once(
  url: string,
  body: Blob,
  signal?: AbortSignal,
  onProgress?: (loaded: number) => void,
): Promise<{ status: number; etag: string | null; detail: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.open("PUT", url, true);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => {
      cleanup();
      onProgress?.(body.size);
      resolve({
        status: xhr.status,
        etag: xhr.getResponseHeader("ETag"),
        detail: typeof xhr.responseText === "string" ? xhr.responseText : "",
      });
    };
    xhr.onerror = () => {
      cleanup();
      reject(new Error("network error"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    xhr.ontimeout = () => {
      cleanup();
      reject(new Error("timed out"));
    };
    xhr.send(body);
  });
}

async function putS3WithRetry(
  url: string,
  body: Blob,
  signal?: AbortSignal,
  onProgress?: (loaded: number) => void,
): Promise<{ etag: string | null }> {
  let lastStatus = 0;
  let lastDetail = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const res = await putS3Once(url, body, signal, onProgress);
      if (res.status >= 200 && res.status < 300) return { etag: res.etag };
      lastStatus = res.status;
      lastDetail = res.detail;
      const retryable = res.status === 403 || res.status === 408 || res.status === 429 || res.status >= 500;
      if (!retryable) break;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      lastStatus = 0;
      lastDetail = e instanceof Error ? e.message : "network error";
    }
    onProgress?.(0);
    await sleep(500 * 2 ** attempt);
  }
  throw new Error(
    lastStatus
      ? `${lastStatus}${lastDetail ? `: ${lastDetail.slice(0, 120)}` : ""}`
      : lastDetail || "upload failed",
  );
}

async function completeAdminSoundMultipart(body: {
  rawKey: string;
  uploadId: string;
  parts: Array<{ partNumber: number; etag: string }>;
}): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/sounds`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ completeMultipart: body }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) throw new Error(data.detail ?? data.error ?? res.statusText);
}

async function abortAdminSoundMultipart(rawKey: string, uploadId: string): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) return;
  await medimadeFetch(`${base}/admin/sounds`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ abortMultipart: { rawKey, uploadId } }),
  }).catch(() => undefined);
}

/** Re-runs normalization from the raw upload already in S3, without re-uploading. */
export async function reprocessAdminSound(key: string): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/sounds`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ reprocess: { key } }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
  if (!res.ok) throw new Error(data.detail ?? data.error ?? res.statusText);
}

export async function analyseAdminSoundTitles(keys: string[]): Promise<number> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  let updated = 0;
  for (let i = 0; i < keys.length; i += 40) {
    const slice = keys.slice(i, i + 40);
    const res = await medimadeFetch(`${base}/admin/sounds`, {
      method: "POST",
      headers: medimadeJsonHeaders(),
      body: JSON.stringify({ analyseTitles: { keys: slice } }),
    });
    const data = (await res.json()) as { updated?: number; error?: string; detail?: string };
    if (!res.ok) throw new Error(data.detail ?? data.error ?? res.statusText);
    updated += data.updated ?? 0;
  }
  return updated;
}

export async function suggestAdminSoundCategories(paths: string[]): Promise<number> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  let updated = 0;
  for (let i = 0; i < paths.length; i += 40) {
    const slice = paths.slice(i, i + 40);
    const res = await medimadeFetch(`${base}/admin/sounds`, {
      method: "POST",
      headers: medimadeJsonHeaders(),
      body: JSON.stringify({ suggest: { paths: slice } }),
    });
    const data = (await res.json()) as { updated?: number; error?: string; detail?: string };
    if (!res.ok) throw new Error(data.detail ?? data.error ?? res.statusText);
    updated += data.updated ?? 0;
  }
  return updated;
}

export async function uploadAdminSoundToS3(
  u: AdminSoundUpload,
  file: File,
  signal?: AbortSignal,
  /** Bytes of this file sent so far, for progress display. */
  onProgress?: (loaded: number) => void,
): Promise<void> {
  if (u.multipart?.urls?.length) {
    const etags: Array<{ partNumber: number; etag: string }> = [];
    try {
      const partSize = u.multipart.partSize;
      for (let i = 0; i < u.multipart.urls.length; i++) {
        const url = u.multipart.urls[i];
        if (!url) throw new Error("missing part URL");
        const blob = file.slice(i * partSize, Math.min((i + 1) * partSize, file.size));
        const done = i * partSize;
        const res = await putS3WithRetry(url, blob, signal, (loaded) => onProgress?.(done + loaded));
        const etag = res.etag;
        if (!etag) throw new Error("S3 part missing ETag");
        etags.push({ partNumber: i + 1, etag });
      }
      await completeAdminSoundMultipart({
        rawKey: u.rawKey,
        uploadId: u.multipart.uploadId,
        parts: etags,
      });
    } catch (e) {
      await abortAdminSoundMultipart(u.rawKey, u.multipart.uploadId);
      throw e;
    }
    return;
  }
  if (!u.url) throw new Error("missing upload url");
  await putS3WithRetry(u.url, file, signal, onProgress);
}

export async function trimAdminSound(body: {
  key: string;
  startSec: number;
  endSec: number | null;
  fadeInSec?: number;
  fadeOutSec?: number;
}): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/sounds/trim`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
}

export type VoiceSpeakerBrand = "fish" | "speechify";

export type AdminVoiceSpeaker = {
  name: string;
  modelId: string;
  brand: VoiceSpeakerBrand;
  hidden: boolean;
  sort: number;
  description?: string;
  goodFor?: string[];
  gender?: VoiceGender | null;
  /** Speechify rate offset in percent (e.g. -7). Unused for Fish. */
  speechifyRate?: number | null;
  hasSample?: boolean;
  sampleUrl?: string | null;
};

export type AdminPauseBands = {
  "extra-short": number;
  short: number;
  medium: number;
  long: number;
  "extra-long": number;
  open: number;
};

export type AdminVoiceState = {
  baseUrl?: string;
  speakers: AdminVoiceSpeaker[];
  pauses: AdminPauseBands;
};

export async function listAdminVoice(): Promise<AdminVoiceState> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/voice`, { headers: medimadeApiAuthHeaders() });
  const data = (await res.json()) as AdminVoiceState & { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    baseUrl: data.baseUrl,
    speakers: (data.speakers ?? []).map((s) => ({
      ...s,
      brand: s.brand === "speechify" ? "speechify" : "fish",
      speechifyRate:
        typeof s.speechifyRate === "number" && Number.isFinite(s.speechifyRate)
          ? Math.round(s.speechifyRate)
          : null,
    })),
    pauses: data.pauses,
  };
}

/** Admin-gated localhost-only UI switches (defaults off). */
export type DevUiSettings = {
  createAudioDevControls: boolean;
  libraryDevFlyout: boolean;
};

export function defaultDevUiSettings(): DevUiSettings {
  return {
    createAudioDevControls: false,
    libraryDevFlyout: false,
  };
}

export async function fetchDevUiSettings(): Promise<DevUiSettings> {
  const base = getMedimadeApiBase();
  if (!base) return defaultDevUiSettings();
  try {
    const res = await medimadeFetch(`${base}/dev-ui-settings`, {
      headers: { Accept: "application/json" },
    });
    const data = (await res.json()) as {
      settings?: Partial<DevUiSettings>;
      error?: string;
    };
    if (!res.ok) return defaultDevUiSettings();
    return {
      createAudioDevControls: data.settings?.createAudioDevControls === true,
      libraryDevFlyout: data.settings?.libraryDevFlyout === true,
    };
  } catch {
    return defaultDevUiSettings();
  }
}

export async function patchDevUiSettings(
  patch: Partial<DevUiSettings>,
): Promise<DevUiSettings> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/dev-ui-settings`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(patch),
  });
  const data = (await res.json()) as {
    settings?: Partial<DevUiSettings>;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    createAudioDevControls: data.settings?.createAudioDevControls === true,
    libraryDevFlyout: data.settings?.libraryDevFlyout === true,
  };
}

/** Library → Community category card images. */
export type LibraryCategoryImagePublic = {
  category: string;
  imageUrl: string;
  updatedAt: string;
};

export type AdminLibraryCategoryImageVersion = {
  id: string;
  imageUrl: string;
  imageKey: string;
  lastPrompt: string | null;
  createdAt: string;
};

/** Admin image gen model (category / program covers). Meditations always use mini. */
export type AdminImageModel = "gpt-image-1-mini" | "nano-banana-pro";

export const ADMIN_IMAGE_MODELS: ReadonlyArray<{
  id: AdminImageModel;
  label: string;
}> = [
  { id: "gpt-image-1-mini", label: "GPT Image 1 Mini" },
  { id: "nano-banana-pro", label: "Nano Banana Pro" },
];

export type AdminLibraryCategoryImage = LibraryCategoryImagePublic & {
  imageKey: string;
  lastPrompt: string | null;
  versions: AdminLibraryCategoryImageVersion[];
};

function normalizeLibraryCategoryImagePublic(
  raw: unknown,
): LibraryCategoryImagePublic | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const category = typeof o.category === "string" ? o.category.trim() : "";
  const imageUrl = typeof o.imageUrl === "string" ? o.imageUrl.trim() : "";
  if (!category || !imageUrl) return null;
  return {
    category,
    imageUrl,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

function normalizeAdminLibraryCategoryVersion(
  raw: unknown,
): AdminLibraryCategoryImageVersion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const imageUrl = typeof o.imageUrl === "string" ? o.imageUrl.trim() : "";
  const imageKey = typeof o.imageKey === "string" ? o.imageKey.trim() : "";
  if (!id || !imageUrl || !imageKey) return null;
  return {
    id,
    imageUrl,
    imageKey,
    lastPrompt:
      typeof o.lastPrompt === "string" && o.lastPrompt.trim()
        ? o.lastPrompt.trim()
        : null,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
  };
}

function normalizeAdminLibraryCategoryImage(
  raw: unknown,
): AdminLibraryCategoryImage | null {
  const base = normalizeLibraryCategoryImagePublic(raw);
  if (!base) return null;
  const o = raw as Record<string, unknown>;
  const versions = Array.isArray(o.versions)
    ? o.versions
        .map(normalizeAdminLibraryCategoryVersion)
        .filter((x): x is AdminLibraryCategoryImageVersion => Boolean(x))
    : [];
  return {
    ...base,
    imageKey: typeof o.imageKey === "string" ? o.imageKey : "",
    lastPrompt:
      typeof o.lastPrompt === "string" && o.lastPrompt.trim()
        ? o.lastPrompt.trim()
        : null,
    versions,
  };
}

/** Public map for Community category cards. */
export async function fetchLibraryCategoryImages(): Promise<
  LibraryCategoryImagePublic[]
> {
  const base = getMedimadeApiBase();
  if (!base) return [];
  try {
    const res = await medimadeFetch(
      `${base}/dev-ui-settings?categoryImages=1`,
      { headers: { Accept: "application/json" } },
    );
    const data = (await res.json()) as { images?: unknown; error?: string };
    if (!res.ok || !Array.isArray(data.images)) return [];
    return data.images
      .map(normalizeLibraryCategoryImagePublic)
      .filter((x): x is LibraryCategoryImagePublic => Boolean(x));
  } catch {
    return [];
  }
}

export async function fetchAdminLibraryCategories(): Promise<{
  categories: string[];
  images: AdminLibraryCategoryImage[];
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(
    `${base}/admin/dev-ui-settings?categoryImages=1`,
    { headers: medimadeApiAuthHeaders() },
  );
  const data = (await res.json()) as {
    categories?: unknown;
    images?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    categories: Array.isArray(data.categories)
      ? data.categories.filter((x): x is string => typeof x === "string")
      : [],
    images: Array.isArray(data.images)
      ? data.images
          .map(normalizeAdminLibraryCategoryImage)
          .filter((x): x is AdminLibraryCategoryImage => Boolean(x))
      : [],
  };
}

async function postAdminLibraryCategoryAction(
  body: Record<string, unknown>,
): Promise<{ images: AdminLibraryCategoryImage[] }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(
    `${base}/admin/dev-ui-settings?categoryImages=1`,
    {
      method: "PATCH",
      headers: medimadeJsonHeaders(),
      body: JSON.stringify(body),
    },
  );
  const data = (await res.json()) as {
    images?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    images: Array.isArray(data.images)
      ? data.images
          .map(normalizeAdminLibraryCategoryImage)
          .filter((x): x is AdminLibraryCategoryImage => Boolean(x))
      : [],
  };
}

export async function uploadAdminLibraryCategoryImage(params: {
  category: string;
  imageBase64: string;
  mimeType: string;
}): Promise<{ images: AdminLibraryCategoryImage[] }> {
  return postAdminLibraryCategoryAction({
    action: "upload",
    category: params.category,
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
  });
}

export async function generateAdminLibraryCategoryImage(params: {
  category: string;
  prompt: string;
  model?: AdminImageModel;
}): Promise<{ images: AdminLibraryCategoryImage[] }> {
  return postAdminLibraryCategoryAction({
    action: "generate",
    category: params.category,
    prompt: params.prompt,
    model: params.model ?? "gpt-image-1-mini",
  });
}

export async function clearAdminLibraryCategoryImage(
  category: string,
): Promise<{ images: AdminLibraryCategoryImage[] }> {
  return postAdminLibraryCategoryAction({
    action: "clear",
    category,
  });
}

export async function restoreAdminLibraryCategoryImage(params: {
  category: string;
  versionId: string;
}): Promise<{ images: AdminLibraryCategoryImage[] }> {
  return postAdminLibraryCategoryAction({
    action: "restore",
    category: params.category,
    versionId: params.versionId,
  });
}

export async function patchAdminVoice(body: {
  pauses?: Partial<AdminPauseBands>;
  speaker?: {
    name: string;
    modelId: string;
    previousModelId?: string;
    brand?: VoiceSpeakerBrand;
    hidden?: boolean;
    sort?: number;
    description?: string;
    goodFor?: string[];
    gender?: VoiceGender | null;
    speechifyRate?: number | null;
  };
}): Promise<{ pauses?: AdminPauseBands; speaker?: AdminVoiceSpeaker }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/voice`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    pauses?: AdminPauseBands;
    speaker?: AdminVoiceSpeaker;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return data;
}

export async function deleteAdminVoiceSpeaker(modelId: string): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/voice`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ action: "delete", modelId }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
}

export async function generateAdminVoiceSample(
  modelId: string,
  opts?: { force?: boolean },
): Promise<{ sampleUrl?: string | null }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/voice`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      action: "sample",
      modelId,
      force: opts?.force === true,
    }),
  });
  const data = (await res.json()) as {
    sampleUrl?: string | null;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return data;
}

export type ScriptLabScope = "general" | "types";

export type ScriptLabLengthTier = "short" | "medium" | "long";

export type ScriptLabRepeatability = "connective" | "singular";

export type ScriptLabTag = {
  name: string;
  scope: ScriptLabScope;
  types: string[];
  lengthTiered: boolean;
  repeatability: ScriptLabRepeatability;
  repeatabilityExplicit: boolean;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type ScriptLabEmbeddingStats = {
  total: number;
  embedded: number;
  queued: number;
  missing: number;
  updatedAt: string;
};

export type ScriptLabVariant = {
  tagName: string;
  variantId: string;
  text: string;
  lengthTier: ScriptLabLengthTier | null;
  direction?: string | null;
  requiredConstraints: string[];
  excludedConstraints: string[];
  source?: "authored" | "auto";
  approved?: boolean;
  promotionSimilarity?: number | null;
  promotionNearestTag?: string | null;
  promotionNearestText?: string | null;
  promotionContext?: string | null;
  promotionNeighbors?: Array<{
    tag: string;
    text: string;
    score: number;
  }> | null;
  sort: number;
  createdAt: string;
  updatedAt: string;
};

export type ScriptLabVariantAudio = {
  tagName: string;
  variantId: string;
  modelId: string;
  status: "not_generated" | "generating" | "generated" | "failed";
  s3Key: string;
  durationSeconds: number;
  updatedAt: string;
};

export type ScriptLabSpeaker = {
  modelId: string;
  name: string;
};

export type ScriptLabState = {
  baseUrl?: string;
  speakers: ScriptLabSpeaker[];
  constraintVocabulary: string[];
  tags: ScriptLabTag[];
  variantsByTag: Record<string, ScriptLabVariant[]>;
  audioByVariantKey: Record<string, ScriptLabVariantAudio[]>;
  pendingReview?: ScriptLabVariant[];
  embeddingStats?: ScriptLabEmbeddingStats;
};

export type ScriptLabFlow = "by-type" | "guide-chat" | "journal" | "single-prompt";

export async function listAdminScriptLab(): Promise<ScriptLabState> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/script-lab`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as ScriptLabState & { error?: string; detail?: string };
  if (!res.ok) throw new Error(data.detail ?? data.error ?? res.statusText);
  return {
    baseUrl: data.baseUrl,
    speakers: data.speakers ?? [],
    constraintVocabulary: data.constraintVocabulary ?? [],
    tags: (data.tags ?? []).map((t) => ({
      ...t,
      lengthTiered: t.lengthTiered === true,
      repeatability:
        t.repeatability === "connective" || t.repeatability === "singular"
          ? t.repeatability
          : "singular",
      repeatabilityExplicit: t.repeatabilityExplicit === true,
      description: typeof t.description === "string" ? t.description : "",
    })),
    variantsByTag: Object.fromEntries(
      Object.entries(data.variantsByTag ?? {}).map(([tag, variants]) => [
        tag,
        (variants ?? []).map((v) => ({
          ...v,
          lengthTier: v.lengthTier ?? null,
          direction: v.direction ?? null,
          requiredConstraints: v.requiredConstraints ?? [],
          excludedConstraints: v.excludedConstraints ?? [],
        })),
      ]),
    ),
    audioByVariantKey: data.audioByVariantKey ?? {},
    pendingReview: Array.isArray(data.pendingReview)
      ? (data.pendingReview as ScriptLabVariant[])
      : [],
    embeddingStats: data.embeddingStats,
  };
}

export async function fetchAdminScriptLabEmbeddingProgress(): Promise<ScriptLabEmbeddingStats> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/script-lab?embeddingProgress=1`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as {
    embeddingStats?: ScriptLabEmbeddingStats;
    error?: string;
    detail?: string;
  };
  if (!res.ok) throw new Error(data.detail ?? data.error ?? res.statusText);
  if (!data.embeddingStats) {
    throw new Error("Embedding progress response missing stats");
  }
  return data.embeddingStats;
}

export async function patchAdminScriptLab(body: {
  tag?: {
    name: string;
    scope?: ScriptLabScope;
    types?: string[];
    lengthTiered?: boolean;
    repeatability?: ScriptLabRepeatability;
    description?: string;
  };
  variant?: {
    tagName: string;
    variantId?: string;
    text: string;
    sort?: number;
    lengthTier?: ScriptLabLengthTier | null;
    requiredConstraints?: string[];
    excludedConstraints?: string[];
  };
  constraintTag?: { tag: string };
}): Promise<{
  tag?: ScriptLabTag;
  variant?: ScriptLabVariant;
  constraintTag?: string;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/script-lab`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    tag?: ScriptLabTag;
    variant?: ScriptLabVariant;
    error?: string;
    detail?: string;
  };
  if (!res.ok) throw new Error(data.detail ?? data.error ?? res.statusText);
  return data;
}

export async function exportAdminScriptLab(): Promise<{ segments: unknown[] }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/script-lab?export=segments`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as { segments?: unknown[]; error?: string; detail?: string };
  if (!res.ok) throw new Error(data.detail ?? data.error ?? res.statusText);
  return { segments: data.segments ?? [] };
}

export async function importAdminScriptLabTagMetadata(
  payload: unknown,
): Promise<{
  summary: { tagsCreated: number; tagsUpdated: number; tagNames: string[] };
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/script-lab`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ action: "import-tag-metadata", payload }),
  });
  const data = (await res.json()) as {
    summary?: { tagsCreated: number; tagsUpdated: number; tagNames: string[] };
    errors?: Array<{ path: string; message: string }>;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const err = new Error("Metadata import validation failed") as Error & {
        importErrors?: Array<{ path: string; message: string }>;
      };
      err.importErrors = data.errors;
      throw err;
    }
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  if (!data.summary) throw new Error("Metadata import returned no summary");
  return { summary: data.summary };
}

export async function postAdminScriptLab(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const usesScriptLabUrl =
    body.action === "generate-script" || body.action === "fill-placeholders";
  const scriptLabUrl = usesScriptLabUrl ? getMedimadeScriptLabUrl() : null;
  const base = scriptLabUrl ?? getMedimadeApiBase();
  if (!base) {
    throw new Error(
      usesScriptLabUrl
        ? "VITE_MEDIMADE_SCRIPT_LAB_URL or VITE_MEDIMADE_API_URL is not set"
        : "VITE_MEDIMADE_API_URL is not set",
    );
  }
  const path = scriptLabUrl ? "" : "/admin/script-lab";
  const res = await medimadeFetch(`${base}${path}`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown> & {
    error?: string;
    detail?: string;
  };
  if (!res.ok) throw new Error(String(data.detail ?? data.error ?? res.statusText));
  return data;
}

export async function listAdminFactoryMixes(): Promise<MixerFactoryPreset[]> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/factory-mixes`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as {
    mixes?: unknown[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return (data.mixes ?? [])
    .map(normalizeFactoryPreset)
    .filter((x): x is MixerFactoryPreset => Boolean(x));
}

export async function saveAdminFactoryMix(
  mix: MixerFactoryPreset,
): Promise<MixerFactoryPreset> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/factory-mixes`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(mix),
  });
  const data = (await res.json()) as {
    mix?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const saved = normalizeFactoryPreset(data.mix);
  if (!saved) throw new Error("Invalid factory mix response");
  return saved;
}

export async function deleteAdminFactoryMix(id: string): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/factory-mixes`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ action: "delete", id }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
}

export type AdminProgramDayStatus = "draft" | "generating" | "ready" | "failed";

export type AdminProgramDay = {
  id: string;
  dayNumber: number;
  title: string;
  prompt: string;
  description: string;
  /** Details By Program create chat should gather to customise this session. */
  customizationIntake: string;
  speakerModelId: string;
  compositionKey: string;
  targetMinutes: MeditationTargetMinutes;
  status: AdminProgramDayStatus;
  jobId: string | null;
  audioUrl: string | null;
  audioKey: string | null;
  /** Measured MP3 length from the last successful generate. */
  durationSeconds: number | null;
  errorMessage: string | null;
  generatedAt: string | null;
  /** Inputs used for last successful audio — for stale detection. */
  generatedPrompt: string | null;
  generatedSpeakerModelId: string | null;
  generatedTargetMinutes: MeditationTargetMinutes | null;
  coverImageKey: string | null;
  coverImageUrl: string | null;
};

export type AdminProgram = {
  id: string;
  title: string;
  description: string;
  published: boolean;
  /** Fish speaker shared by every lesson. */
  speakerModelId: string;
  sort: number;
  days: AdminProgramDay[];
  createdAt: string;
  updatedAt: string;
  coverImageKey: string | null;
  coverImageUrl: string | null;
};

function normalizeAdminProgramDay(raw: unknown): AdminProgramDay | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const status =
    o.status === "generating" || o.status === "ready" || o.status === "failed"
      ? o.status
      : "draft";
  return {
    id,
    dayNumber:
      typeof o.dayNumber === "number" && Number.isFinite(o.dayNumber)
        ? Math.max(1, Math.floor(o.dayNumber))
        : 1,
    title: typeof o.title === "string" ? o.title : "",
    prompt: typeof o.prompt === "string" ? o.prompt : "",
    description: typeof o.description === "string" ? o.description : "",
    customizationIntake:
      typeof o.customizationIntake === "string" ? o.customizationIntake : "",
    speakerModelId: typeof o.speakerModelId === "string" ? o.speakerModelId : "",
    compositionKey: typeof o.compositionKey === "string" ? o.compositionKey : "",
    targetMinutes: coerceMeditationTargetMinutes(o.targetMinutes),
    status,
    jobId: typeof o.jobId === "string" ? o.jobId : null,
    audioUrl: typeof o.audioUrl === "string" ? o.audioUrl : null,
    audioKey: typeof o.audioKey === "string" ? o.audioKey : null,
    durationSeconds:
      typeof o.durationSeconds === "number" &&
      Number.isFinite(o.durationSeconds) &&
      o.durationSeconds > 0
        ? o.durationSeconds
        : null,
    errorMessage: typeof o.errorMessage === "string" ? o.errorMessage : null,
    generatedAt: typeof o.generatedAt === "string" ? o.generatedAt : null,
    generatedPrompt:
      typeof o.generatedPrompt === "string" ? o.generatedPrompt : null,
    generatedSpeakerModelId:
      typeof o.generatedSpeakerModelId === "string"
        ? o.generatedSpeakerModelId.trim() || null
        : null,
    generatedTargetMinutes:
      typeof o.generatedTargetMinutes === "number" &&
      Number.isFinite(o.generatedTargetMinutes)
        ? coerceMeditationTargetMinutes(o.generatedTargetMinutes)
        : null,
    coverImageKey:
      typeof o.coverImageKey === "string" && o.coverImageKey.trim()
        ? o.coverImageKey.trim()
        : null,
    coverImageUrl:
      typeof o.coverImageUrl === "string" && o.coverImageUrl.trim()
        ? o.coverImageUrl.trim()
        : null,
  };
}

function normalizeAdminProgram(raw: unknown): AdminProgram | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const days = Array.isArray(o.days)
    ? o.days
        .map(normalizeAdminProgramDay)
        .filter((d): d is AdminProgramDay => Boolean(d))
    : [];
  let speakerModelId =
    typeof o.speakerModelId === "string" ? o.speakerModelId.trim() : "";
  if (!speakerModelId) {
    for (const d of days) {
      if (d.speakerModelId.trim()) {
        speakerModelId = d.speakerModelId.trim();
        break;
      }
    }
  }
  return {
    id,
    title: typeof o.title === "string" ? o.title : "Untitled program",
    description: typeof o.description === "string" ? o.description : "",
    published: o.published === true,
    speakerModelId,
    sort: typeof o.sort === "number" && Number.isFinite(o.sort) ? o.sort : 0,
    days: days.map((d) =>
      speakerModelId ? { ...d, speakerModelId } : d,
    ),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    coverImageKey:
      typeof o.coverImageKey === "string" && o.coverImageKey.trim()
        ? o.coverImageKey.trim()
        : null,
    coverImageUrl:
      typeof o.coverImageUrl === "string" && o.coverImageUrl.trim()
        ? o.coverImageUrl.trim()
        : null,
  };
}

export async function listAdminPrograms(): Promise<AdminProgram[]> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/programs`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as {
    programs?: unknown[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return (data.programs ?? [])
    .map(normalizeAdminProgram)
    .filter((p): p is AdminProgram => Boolean(p));
}

/** Published programs for the Library Programs shelf (ready days only). */
export type LibraryProgramDay = {
  id: string;
  dayNumber: number;
  title: string;
  description: string;
  /** Details By Program create chat should gather to customise this session. */
  customizationIntake: string;
  targetMinutes: MeditationTargetMinutes;
  /** Measured voice-stem length; prefer over targetMinutes for display. */
  durationSeconds: number | null;
  audioUrl: string;
  audioKey: string;
  /** Music / composition bed mixed live under the voice stem. */
  backgroundMusicKey: string;
  coverImageUrl: string | null;
};

export type LibraryProgram = {
  id: string;
  title: string;
  description: string;
  sort: number;
  days: LibraryProgramDay[];
  coverImageUrl: string | null;
};

function normalizeLibraryProgramDay(raw: unknown): LibraryProgramDay | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const audioUrl = typeof o.audioUrl === "string" ? o.audioUrl.trim() : "";
  const audioKey = typeof o.audioKey === "string" ? o.audioKey.trim() : "";
  if (!id || !audioUrl || !audioKey) return null;
  return {
    id,
    dayNumber:
      typeof o.dayNumber === "number" && Number.isFinite(o.dayNumber)
        ? Math.max(1, Math.floor(o.dayNumber))
        : 1,
    title: typeof o.title === "string" ? o.title : "",
    description: typeof o.description === "string" ? o.description : "",
    customizationIntake:
      typeof o.customizationIntake === "string" ? o.customizationIntake : "",
    targetMinutes: coerceMeditationTargetMinutes(o.targetMinutes),
    durationSeconds:
      typeof o.durationSeconds === "number" &&
      Number.isFinite(o.durationSeconds) &&
      o.durationSeconds > 0
        ? o.durationSeconds
        : null,
    audioUrl,
    audioKey,
    backgroundMusicKey:
      typeof o.backgroundMusicKey === "string"
        ? o.backgroundMusicKey.trim()
        : typeof o.compositionKey === "string"
          ? o.compositionKey.trim()
          : "",
    coverImageUrl:
      typeof o.coverImageUrl === "string" && o.coverImageUrl.trim()
        ? o.coverImageUrl.trim()
        : null,
  };
}

function normalizeLibraryProgram(raw: unknown): LibraryProgram | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;
  const days = Array.isArray(o.days)
    ? o.days
        .map(normalizeLibraryProgramDay)
        .filter((d): d is LibraryProgramDay => Boolean(d))
    : [];
  return {
    id,
    title: typeof o.title === "string" ? o.title : "Untitled program",
    description: typeof o.description === "string" ? o.description : "",
    sort: typeof o.sort === "number" && Number.isFinite(o.sort) ? o.sort : 0,
    days,
    coverImageUrl:
      typeof o.coverImageUrl === "string" && o.coverImageUrl.trim()
        ? o.coverImageUrl.trim()
        : null,
  };
}

export async function listLibraryPrograms(): Promise<LibraryProgram[]> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/library/programs`);
  const data = (await res.json()) as {
    programs?: unknown[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return (data.programs ?? [])
    .map(normalizeLibraryProgram)
    .filter((p): p is LibraryProgram => Boolean(p));
}

export async function saveAdminProgram(
  program: Partial<AdminProgram> & { id?: string },
): Promise<AdminProgram> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/programs`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(program),
  });
  const data = (await res.json()) as {
    program?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const saved = normalizeAdminProgram(data.program);
  if (!saved) throw new Error("Invalid program response");
  return saved;
}

export async function deleteAdminProgram(id: string): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/programs`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ action: "delete", id }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
}

async function postAdminProgramCoverAction(body: Record<string, unknown>): Promise<AdminProgram> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/programs`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    program?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const saved = normalizeAdminProgram(data.program);
  if (!saved) throw new Error("Invalid program response");
  return saved;
}

export async function generateAdminProgramCover(params: {
  programId: string;
  dayId?: string | null;
  prompt?: string;
  model?: AdminImageModel;
}): Promise<AdminProgram> {
  return postAdminProgramCoverAction({
    action: "generate-cover",
    programId: params.programId,
    dayId: params.dayId ?? null,
    prompt: params.prompt ?? "",
    model: params.model ?? "gpt-image-1-mini",
  });
}

export async function uploadAdminProgramCover(params: {
  programId: string;
  dayId?: string | null;
  imageBase64: string;
  mimeType: string;
}): Promise<AdminProgram> {
  return postAdminProgramCoverAction({
    action: "upload-cover",
    programId: params.programId,
    dayId: params.dayId ?? null,
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
  });
}

export async function clearAdminProgramCover(params: {
  programId: string;
  dayId?: string | null;
}): Promise<AdminProgram> {
  return postAdminProgramCoverAction({
    action: "clear-cover",
    programId: params.programId,
    dayId: params.dayId ?? null,
  });
}

export type AdminBlogAudioStatus = "none" | "generating" | "ready" | "failed";

export type AdminBlogPost = {
  id: string;
  slug: string;
  title: string;
  subheader: string;
  excerpt: string;
  tags: string[];
  category: BlogCategory;
  series: string;
  part: number | null;
  /** Admin-only working notes — not returned on public blog APIs. */
  notes: string;
  body: string;
  published: boolean;
  /** App-related highlight (admin-assigned). */
  pinned: boolean;
  /** Curated top picks / personal favourites (admin-assigned). */
  topPicks: boolean;
  publishedAt: string | null;
  audioUrl: string | null;
  audioStatus: AdminBlogAudioStatus;
  audioError: string | null;
  audioGeneratedAt: string | null;
  audioProgress: string | null;
  audioStartedAt: string | null;
  audioTtsProvider: "fish" | "speechify" | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminBlogSettings = {
  indexSummary: string;
  authorPhotoUrl: string | null;
  authorPhotoEnabled: boolean;
  updatedAt: string;
};

const DEFAULT_ADMIN_INDEX_SUMMARY = "Essays and updates from Consciously.";

function normalizeAdminBlogTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const tag = item.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeAdminBlogPost(raw: unknown): AdminBlogPost | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const slug = typeof o.slug === "string" ? o.slug.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!id || !slug || !title) return null;
  return {
    id,
    slug,
    title,
    subheader: typeof o.subheader === "string" ? o.subheader : "",
    excerpt: typeof o.excerpt === "string" ? o.excerpt : "",
    tags: normalizeAdminBlogTags(o.tags),
    category: normalizeBlogCategory(o.category),
    series: typeof o.series === "string" ? o.series : "",
    part: (() => {
      const n =
        typeof o.part === "number" ? o.part : Number(String(o.part ?? "").trim());
      return Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
    })(),
    notes: typeof o.notes === "string" ? o.notes : "",
    body: typeof o.body === "string" ? o.body : "",
    published: o.published === true,
    pinned: o.pinned === true,
    topPicks: o.topPicks === true,
    publishedAt:
      typeof o.publishedAt === "string" && o.publishedAt.trim()
        ? o.publishedAt.trim()
        : null,
    audioUrl:
      typeof o.audioUrl === "string" && o.audioUrl.trim()
        ? o.audioUrl.trim()
        : null,
    audioStatus:
      o.audioStatus === "generating" ||
      o.audioStatus === "ready" ||
      o.audioStatus === "failed"
        ? o.audioStatus
        : "none",
    audioError:
      typeof o.audioError === "string" && o.audioError.trim()
        ? o.audioError.trim()
        : null,
    audioGeneratedAt:
      typeof o.audioGeneratedAt === "string" && o.audioGeneratedAt.trim()
        ? o.audioGeneratedAt.trim()
        : null,
    audioProgress:
      typeof o.audioProgress === "string" && o.audioProgress.trim()
        ? o.audioProgress.trim()
        : null,
    audioStartedAt:
      typeof o.audioStartedAt === "string" && o.audioStartedAt.trim()
        ? o.audioStartedAt.trim()
        : null,
    audioTtsProvider:
      o.audioTtsProvider === "fish" || o.audioTtsProvider === "speechify"
        ? o.audioTtsProvider
        : null,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

function normalizeAdminBlogSettings(raw: unknown): AdminBlogSettings {
  if (!raw || typeof raw !== "object") {
    return {
      indexSummary: DEFAULT_ADMIN_INDEX_SUMMARY,
      authorPhotoUrl: null,
      authorPhotoEnabled: false,
      updatedAt: "",
    };
  }
  const o = raw as Record<string, unknown>;
  const photo =
    typeof o.authorPhotoUrl === "string" && o.authorPhotoUrl.trim()
      ? o.authorPhotoUrl.trim()
      : null;
  return {
    indexSummary:
      typeof o.indexSummary === "string" && o.indexSummary.trim()
        ? o.indexSummary.trim()
        : DEFAULT_ADMIN_INDEX_SUMMARY,
    authorPhotoUrl: photo,
    authorPhotoEnabled: o.authorPhotoEnabled === true,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

export async function listAdminBlogPosts(): Promise<AdminBlogPost[]> {
  const { posts } = await fetchAdminBlog();
  return posts;
}

export async function fetchAdminBlog(): Promise<{
  posts: AdminBlogPost[];
  settings: AdminBlogSettings;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/blog`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as {
    posts?: unknown[];
    settings?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  return {
    posts: (data.posts ?? [])
      .map(normalizeAdminBlogPost)
      .filter((p): p is AdminBlogPost => Boolean(p)),
    settings: normalizeAdminBlogSettings(data.settings),
  };
}

export async function saveAdminBlogSettings(
  settings: Pick<AdminBlogSettings, "indexSummary" | "authorPhotoEnabled">,
): Promise<AdminBlogSettings> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/blog`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      action: "saveSettings",
      indexSummary: settings.indexSummary,
      authorPhotoEnabled: settings.authorPhotoEnabled,
    }),
  });
  const data = (await res.json()) as {
    settings?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  if (!data.settings || typeof data.settings !== "object") {
    throw new Error(
      "Server did not save page intro — redeploy backend, then try again",
    );
  }
  return normalizeAdminBlogSettings(data.settings);
}

/** Upload an in-post image; returns a CDN URL for TipTap insertion. */
export async function uploadAdminBlogPostImage(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<{ url: string }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/blog`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      action: "uploadPostImage",
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
    }),
  });
  const data = (await res.json()) as {
    url?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const url = typeof data.url === "string" ? data.url.trim() : "";
  if (!url) {
    throw new Error(
      "Server did not return an image URL — redeploy backend, then try again",
    );
  }
  return { url };
}

/** Upload author photo for the Read index (JPEG/PNG/WebP, compressed client-side). */
export async function uploadAdminBlogAuthorPhoto(params: {
  imageBase64: string;
  mimeType: string;
}): Promise<AdminBlogSettings> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/blog`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      action: "uploadAuthorPhoto",
      imageBase64: params.imageBase64,
      mimeType: params.mimeType,
    }),
  });
  const data = (await res.json()) as {
    settings?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  if (!data.settings || typeof data.settings !== "object") {
    throw new Error(
      "Server did not save author photo — redeploy backend, then try again",
    );
  }
  return normalizeAdminBlogSettings(data.settings);
}

export async function clearAdminBlogAuthorPhoto(): Promise<AdminBlogSettings> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/blog`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ action: "clearAuthorPhoto" }),
  });
  const data = (await res.json()) as {
    settings?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  if (!data.settings || typeof data.settings !== "object") {
    throw new Error(
      "Server did not clear author photo — redeploy backend, then try again",
    );
  }
  return normalizeAdminBlogSettings(data.settings);
}

export async function saveAdminBlogPost(
  post: Partial<AdminBlogPost> & { id?: string },
): Promise<AdminBlogPost> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/blog`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify(post),
  });
  const data = (await res.json()) as {
    post?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const saved = normalizeAdminBlogPost(data.post);
  if (!saved) throw new Error("Invalid blog post response");
  return saved;
}

export async function generateAdminBlogAudio(
  id: string,
  ttsProvider: "fish" | "speechify" = "speechify",
): Promise<AdminBlogPost> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("NEXT_PUBLIC_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/blog`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ action: "generateAudio", id, ttsProvider }),
  });
  const data = (await res.json()) as {
    post?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const saved = normalizeAdminBlogPost(data.post);
  if (!saved) throw new Error("Invalid blog post response");
  return saved;
}

export async function deleteAdminBlogPost(id: string): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/blog`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ action: "delete", id }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
}

/** LLM ~50-word blurb from a program day one-shot prompt. */
export async function generateAdminProgramDayDescription(params: {
  prompt: string;
  title?: string;
  programTitle?: string;
}): Promise<string> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/admin/programs`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      action: "describe-day",
      prompt: params.prompt,
      title: params.title ?? "",
      programTitle: params.programTitle ?? "",
    }),
  });
  const data = (await res.json()) as {
    description?: string;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? res.statusText);
  }
  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (!description) throw new Error("No description returned");
  return description;
}

/** Treat day descriptions shorter than this as missing (auto-generate). */
export const PROGRAM_DAY_DESCRIPTION_MIN_CHARS = 100;

const BG_AUDIO_CACHE_KEY = "mm_bg_audio_list_v1";

type BgAudioClientCache = {
  version: string;
  data: BackgroundAudioByCategory;
};

let bgAudioMemory: BgAudioClientCache | null = null;
let bgAudioInflight: Promise<BackgroundAudioByCategory> | null = null;

function readBgAudioLocalCache(): BgAudioClientCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BG_AUDIO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BgAudioClientCache>;
    if (
      typeof parsed.version !== "string" ||
      !parsed.version.trim() ||
      !parsed.data ||
      typeof parsed.data !== "object"
    ) {
      return null;
    }
    return {
      version: parsed.version.trim(),
      data: parsed.data as BackgroundAudioByCategory,
    };
  } catch {
    return null;
  }
}

function writeBgAudioLocalCache(entry: BgAudioClientCache): void {
  bgAudioMemory = entry;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BG_AUDIO_CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

/** Drop client-side soundscape/mixer catalog cache (call after admin catalog edits). */
export function invalidateBackgroundAudioClientCache(): void {
  bgAudioMemory = null;
  bgAudioInflight = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BG_AUDIO_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

function parseBackgroundAudioPayload(
  data: {
    baseUrl?: string;
    nature?: BackgroundAudioItem[];
    ambience?: BackgroundAudioItem[];
    music?: BackgroundAudioItem[];
    compositions?: BackgroundAudioItem[];
    drums?: BackgroundAudioItem[];
    noise?: BackgroundAudioItem[];
    factoryMixes?: unknown[];
  },
): BackgroundAudioByCategory {
  return {
    baseUrl: data.baseUrl,
    nature: data.ambience ?? data.nature ?? [],
    music: data.music ?? [],
    compositions: data.compositions ?? [],
    drums: data.drums ?? [],
    noise: data.noise ?? [],
    factoryMixes: Array.isArray(data.factoryMixes)
      ? data.factoryMixes
          .map(normalizeFactoryPreset)
          .filter((x): x is MixerFactoryPreset => Boolean(x))
      : undefined,
  };
}

export async function listBackgroundAudio(opts?: {
  /** Bypass client + server caches. */
  refresh?: boolean;
}): Promise<BackgroundAudioByCategory> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const refresh = opts?.refresh === true;

  if (!refresh) {
    if (bgAudioMemory) return bgAudioMemory.data;
    const local = readBgAudioLocalCache();
    if (local) {
      bgAudioMemory = local;
      // Revalidate in background; return cached immediately.
      void fetchBackgroundAudioNetwork(base, local.version).catch(() => undefined);
      return local.data;
    }
    if (bgAudioInflight) return bgAudioInflight;
  }

  const run = fetchBackgroundAudioNetwork(
    base,
    refresh ? null : bgAudioMemory?.version ?? readBgAudioLocalCache()?.version ?? null,
    refresh,
  );
  if (!refresh) bgAudioInflight = run;
  try {
    return await run;
  } finally {
    if (bgAudioInflight === run) bgAudioInflight = null;
  }
}

async function fetchBackgroundAudioNetwork(
  base: string,
  ifNoneMatch: string | null,
  refresh = false,
): Promise<BackgroundAudioByCategory> {
  const url = refresh
    ? `${base}/media/background-audio?refresh=1`
    : `${base}/media/background-audio`;
  const headers: Record<string, string> = {};
  if (ifNoneMatch && !refresh) {
    headers["If-None-Match"] = `"${ifNoneMatch}"`;
  }
  const res = await medimadeFetch(url, {
    cache: "no-store",
    headers,
  });

  if (res.status === 304 && ifNoneMatch) {
    const hit =
      bgAudioMemory?.version === ifNoneMatch
        ? bgAudioMemory
        : readBgAudioLocalCache();
    if (hit && hit.version === ifNoneMatch) {
      bgAudioMemory = hit;
      return hit.data;
    }
    // Stale If-None-Match with no local body — force a full fetch.
    const retry = await medimadeFetch(`${base}/media/background-audio?refresh=1`, {
      cache: "no-store",
    });
    const retryData = (await retry.json()) as {
      baseUrl?: string;
      nature?: BackgroundAudioItem[];
      ambience?: BackgroundAudioItem[];
      music?: BackgroundAudioItem[];
      compositions?: BackgroundAudioItem[];
      drums?: BackgroundAudioItem[];
      noise?: BackgroundAudioItem[];
      factoryMixes?: unknown[];
      cacheVersion?: string;
      error?: string;
      detail?: string;
    };
    if (!retry.ok) {
      throw new Error(retryData.detail ?? retryData.error ?? retry.statusText);
    }
    const parsedRetry = parseBackgroundAudioPayload(retryData);
    const version =
      (typeof retryData.cacheVersion === "string" &&
        retryData.cacheVersion.trim()) ||
      new Date().toISOString();
    writeBgAudioLocalCache({ version, data: parsedRetry });
    return parsedRetry;
  }

  const data = (await res.json()) as {
    baseUrl?: string;
    nature?: BackgroundAudioItem[];
    ambience?: BackgroundAudioItem[];
    music?: BackgroundAudioItem[];
    compositions?: BackgroundAudioItem[];
    drums?: BackgroundAudioItem[];
    noise?: BackgroundAudioItem[];
    items?: BackgroundAudioItem[];
    factoryMixes?: unknown[];
    cacheVersion?: string;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
  const parsed = parseBackgroundAudioPayload(data);
  const etag = (res.headers.get("ETag") || "")
    .trim()
    .replace(/^W\//, "")
    .replace(/^"|"$/g, "");
  const version =
    (typeof data.cacheVersion === "string" && data.cacheVersion.trim()) ||
    etag ||
    new Date().toISOString();
  writeBgAudioLocalCache({ version, data: parsed });
  return parsed;
}

/**
 * Library badge line: preset `meditationType` first; omit placeholder style "General"
 * so journal-mode rows show the inferred category (e.g. Breath-led), not "General".
 */
export function libraryMeditationCategoryLabel(m: {
  meditationType: string | null;
  meditationStyle: string | null;
}): string {
  const type = m.meditationType?.trim() ?? "";
  const rawStyle = m.meditationStyle?.trim() ?? "";
  const styleOk =
    rawStyle && rawStyle.toLowerCase() !== "general" ? rawStyle : "";
  if (type && styleOk) {
    if (type.toLowerCase() === styleOk.toLowerCase()) return type;
    return `${type} · ${styleOk}`;
  }
  if (type) return type;
  if (styleOk) return styleOk;
  return "—";
}

export type LibraryMeditationItem = {
  id: string | null;
  sk: string | null;
  s3Key: string;
  audioUrl: string;
  title: string;
  meditationType: string | null;
  meditationStyle: string | null;
  speakerModelId: string | null;
  speakerName: string | null;
  description: string | null;
  createdAt: string | null;
  durationSeconds: number | null;
  scriptText: string | null;
  scriptTruncated: boolean;
  /** UTF-8 bytes actually sent to TTS (Fish billable input), when stored. */
  scriptUtf8Bytes?: number | null;
  /** Fish TTS model used at generate time (e.g. s2.1-pro-free, s1). */
  fishTtsModel?: string | null;
  rating: number | null;
  favourite: boolean;
  archived: boolean;
  isPublic?: boolean;
  /** Unlisted share link (owner library only). */
  shareToken?: string | null;
  catalogued: boolean;
  mp3Bytes: number | null;
  /** Saved create-flow draft (not shown in main library list). */
  isDraft: boolean;
  /** Ideate life-area this meditation was created for (when linked). */
  lifeAreaId?: string | null;
  /** Create-job id when this row came from Generate. */
  jobId?: string | null;
  /** Speech-only stem; backgrounds are mixed in the Library player. */
  liveMix?: boolean;
  dryAudioKey?: string | null;
  wetAudioKey?: string | null;
  dryAudioUrl?: string | null;
  wetAudioUrl?: string | null;
  coverImageKey?: string | null;
  coverImageUrl?: string | null;
  voiceFxDial?: number | null;
  createdVoiceFxDial?: number | null;
  backgroundNatureKey?: string | null;
  backgroundMusicKey?: string | null;
  backgroundDrumsKey?: string | null;
  backgroundNoiseKey?: string | null;
  backgroundNatureGain?: number | null;
  backgroundMusicGain?: number | null;
  backgroundDrumsGain?: number | null;
  backgroundNoiseGain?: number | null;
  createdBackgroundNatureKey?: string | null;
  createdBackgroundMusicKey?: string | null;
  createdBackgroundDrumsKey?: string | null;
  createdBackgroundNoiseKey?: string | null;
  createdBackgroundNatureGain?: number | null;
  createdBackgroundMusicGain?: number | null;
  createdBackgroundDrumsGain?: number | null;
  createdBackgroundNoiseGain?: number | null;
  publisherBackgroundNatureKey?: string | null;
  publisherBackgroundMusicKey?: string | null;
  publisherBackgroundDrumsKey?: string | null;
  publisherBackgroundNoiseKey?: string | null;
  publisherBackgroundNatureGain?: number | null;
  publisherBackgroundMusicGain?: number | null;
  publisherBackgroundDrumsGain?: number | null;
  publisherBackgroundNoiseGain?: number | null;
  /** ms from Generate click (job create) until library row write. */
  generationElapsedMs?: number | null;
  jobCreatedAt?: string | null;
  /** Claude usage behind the script + metadata calls (dev cost flyover). */
  claudeModel?: string | null;
  claudeHaiku45WorkerInputTokens?: number | null;
  claudeHaiku45WorkerOutputTokens?: number | null;
  claudeHaiku45ChatEstInputTokens?: number | null;
  claudeHaiku45ChatEstOutputTokens?: number | null;
  /** Per-phase + per speech-section worker timings (dev flyover). */
  generationTimings?: GenerationTimings | null;
  /** Create-path snapshot for “How this was made” (when saved at generate time). */
  creationProvenance?: MeditationCreationProvenance | null;
};

export const MEDITATION_DRAFT_STATE_VERSION = 1 as const;

/** Creator-selected guided length (coach + script targets). */
export type MeditationTargetMinutes = 2 | 5 | 10 | 20;

export const MEDITATION_TARGET_MINUTES: readonly MeditationTargetMinutes[] = [
  2, 5, 10, 20,
];

export function isMeditationTargetMinutes(
  raw: unknown,
): raw is MeditationTargetMinutes {
  return MEDITATION_TARGET_MINUTES.includes(raw as MeditationTargetMinutes);
}

export function coerceMeditationTargetMinutes(
  raw: unknown,
): MeditationTargetMinutes {
  return isMeditationTargetMinutes(raw) ? raw : 5;
}

export type MeditationDraftStateV1 = {
  v: typeof MEDITATION_DRAFT_STATE_VERSION;
  phase: "style" | "feeling" | "claude";
  journalMode?: boolean;
  meditationStyle: string | null;
  messages: Array<{
    role: "assistant" | "user";
    text: string;
    variant?: "chat" | "script";
    /** Journal → Create: expandable entry cards in the user bubble */
    journalSegments?: Array<{
      entryId: string;
      title: string;
      bodyPlain: string;
      createdAt?: string;
    }>;
  }>;
  claudeThread: MedimadeChatTurn[];
  input: string;
  speechSpeed: number;
  speakerModelId: string;
  ttsProvider?: TtsProvider;
  orpheusVoiceId?: string;
  speakerFxPreviewOn?: boolean;
  backgroundNatureKey: string;
  backgroundMusicKey: string;
  backgroundDrumsKey?: string;
  backgroundNoiseKey: string;
  backgroundNatureGain: number;
  backgroundMusicGain: number;
  backgroundDrumsGain?: number;
  backgroundNoiseGain: number;
  mobileCreateStep: "chat" | "audio";
  lastUsedScript: string | null;
  meditationTargetMinutes?: MeditationTargetMinutes;
  /** Style-path intake: 3 targeted answers + optional "anything else". */
  styleQuestionAnswers?: string[];
};

export async function saveMeditationDraft(params: {
  sk?: string | null;
  title?: string;
  meditationStyle: string | null;
  draftState: MeditationDraftStateV1;
}): Promise<{ sk: string; id: string; createdAt: string; title: string }> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/library/meditations/draft`, {
    method: "POST",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      sk: params.sk?.trim() || undefined,
      title: params.title,
      meditationStyle: params.meditationStyle,
      draftState: params.draftState,
    }),
  });
  const data = (await res.json()) as {
    sk?: string;
    id?: string;
    createdAt?: string;
    title?: string;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
  if (!data.sk || !data.id || !data.createdAt || !data.title) {
    throw new Error("Save draft returned incomplete data");
  }
  return {
    sk: data.sk,
    id: data.id,
    createdAt: data.createdAt,
    title: data.title,
  };
}

export async function getMeditationDraft(sk: string): Promise<{
  sk: string;
  id: string;
  createdAt: string | null;
  title: string | null;
  meditationStyle: string | null;
  draftState: unknown;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const q = new URLSearchParams({ sk });
  const res = await medimadeFetch(`${base}/library/meditations/draft?${q.toString()}`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as {
    sk?: string;
    id?: string;
    createdAt?: string | null;
    title?: string | null;
    meditationStyle?: string | null;
    draftState?: unknown;
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
  if (!data.sk || !data.id) {
    throw new Error("Load draft returned incomplete data");
  }
  return {
    sk: data.sk,
    id: data.id,
    createdAt: data.createdAt ?? null,
    title: data.title ?? null,
    meditationStyle: data.meditationStyle ?? null,
    draftState: data.draftState,
  };
}

/** Lists `meditations/*.mp3` in the media bucket merged with DynamoDB library metadata. */
export async function listLibraryMeditations(opts?: {
  community?: boolean;
}): Promise<LibraryMeditationItem[]> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const qs = opts?.community
    ? (() => {
        const p = new URLSearchParams({ community: "1" });
        if (!getMedimadeSessionJwt()) {
          const listenerId = getOrCreateMixListenerId();
          if (listenerId) p.set("listenerId", listenerId);
        }
        return `?${p.toString()}`;
      })()
    : "";
  const res = await medimadeFetch(`${base}/library/meditations${qs}`, {
    headers: medimadeApiAuthHeaders(),
  });
  const data = (await res.json()) as {
    items?: LibraryMeditationItem[];
    error?: string;
    detail?: string;
  };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
  return data.items ?? [];
}

export async function patchMeditationRating(
  sk: string,
  rating: number | null,
): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/library/meditations/rating`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ sk, rating }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
}

export async function patchMeditationFavourite(
  sk: string,
  favourite: boolean,
): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/library/meditations/favourite`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ sk, favourite }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
}

export async function patchMeditationBackgroundMix(
  sk: string,
  mix: {
    backgroundNatureKey: string;
    backgroundMusicKey: string;
    backgroundDrumsKey: string;
    backgroundNoiseKey: string;
    backgroundNatureGain: number;
    backgroundMusicGain: number;
    backgroundDrumsGain: number;
    backgroundNoiseGain: number;
    voiceFxDial?: number;
  },
  opts?: { community?: boolean; s3Key?: string },
): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const listenerId = getOrCreateMixListenerId();
  const res = await medimadeFetch(`${base}/library/meditations/mix`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      sk,
      ...mix,
      ...(opts?.community ? { community: true, s3Key: opts.s3Key ?? "" } : {}),
      ...(listenerId ? { listenerId } : {}),
      ...(sessionTokenForBody() ? { sessionToken: sessionTokenForBody() } : {}),
    }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
}

export async function patchMeditationPublic(
  sk: string,
  isPublic: boolean,
): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/library/meditations/public`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      sk,
      isPublic,
      ...(sessionTokenForBody() ? { sessionToken: sessionTokenForBody() } : {}),
    }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
}

/** Create or revoke an unlisted share_token (distinct from Community publish). */
export async function patchMeditationShare(
  sk: string,
  action: "create" | "revoke",
): Promise<string | null> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/library/meditations/share`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({
      sk,
      action,
      ...(sessionTokenForBody() ? { sessionToken: sessionTokenForBody() } : {}),
    }),
  });
  const data = (await res.json()) as {
    error?: string;
    detail?: string;
    shareToken?: string | null;
  };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
  const tok = data.shareToken;
  return typeof tok === "string" && tok.trim() ? tok.trim() : null;
}

export async function patchMeditationArchived(
  sk: string,
  archived: boolean,
): Promise<void> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/library/meditations/archive`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ sk, archived }),
  });
  const data = (await res.json()) as { error?: string; detail?: string };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
}

/** Localhost + libraryDevFlyout — regenerate cover or re-derive title/description. */
export async function patchMeditationDevRefresh(
  sk: string,
  action: "cover" | "metadata",
): Promise<{
  coverImageKey?: string | null;
  coverImageUrl?: string | null;
  title?: string;
  description?: string;
  meditationType?: string;
}> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("VITE_MEDIMADE_API_URL is not set");
  const res = await medimadeFetch(`${base}/library/meditations/dev-refresh`, {
    method: "PATCH",
    headers: medimadeJsonHeaders(),
    body: JSON.stringify({ sk, action }),
  });
  const data = (await res.json()) as {
    error?: string;
    detail?: string;
    coverImageKey?: string | null;
    coverImageUrl?: string | null;
    title?: string;
    description?: string;
    meditationType?: string;
  };
  if (!res.ok) {
    const msg = data.detail ?? data.error ?? res.statusText;
    throw new Error(msg);
  }
  return data;
}

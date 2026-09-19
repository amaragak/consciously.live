"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useLayoutEffect, useState } from "react";
import {
  CognitoAuthForm,
  type CognitoAuthMode,
} from "@/components/cognito-auth-form";
import { LogoMark } from "@/components/logo-mark";
import { Fingerprint } from "lucide-react";
import {
  fetchCognitoAuthConfig,
  getMedimadeApiBase,
  requestMedimadeMagicLink,
  type CognitoAuthConfig,
} from "@/lib/medimade-api";
import {
  beginCognitoHostedLogin,
  establishCognitoSession,
} from "@/lib/cognito-auth";
import { asCognitoAuthTokens } from "@/lib/cognito-direct-auth";
import { rememberAuthNext, safeAuthNext, postAuthDestination } from "@/lib/app-routes";
import { applyColorScheme, resolveAuthColorScheme } from "@/lib/color-scheme";
import { exitMarketingPreviewMode } from "@/lib/marketing-preview";
import { navigateAuthDestination } from "@/lib/spa-handoff";
import {
  cognitoHasPasskey,
  cognitoPasskeySignIn,
  cognitoRegisterPasskey,
  passkeyOfferSkippedThisSession,
  rememberCognitoAccessToken,
  skipPasskeyOfferThisSession,
} from "@/lib/cognito-passkey";

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4" xmlns="http://www.w3.org/2000/svg">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.55-5.17 3.55-8.65Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.47 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.25 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.27A12 12 0 0 0 0 12c0 1.94.46 3.78 1.27 5.37l4-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.14 15.23 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

function GoogleSignInButton({
  busy,
  disabled,
  onClick,
}: {
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-marketing-card-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
    >
      <GoogleMark />
      {busy ? "Opening…" : "Continue with Google"}
    </button>
  );
}

function PasskeySignInButton({
  disabled,
  onClick,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-marketing-card-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
    >
      <Fingerprint aria-hidden className="size-4" strokeWidth={2} />
      {label}
    </button>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeAuthNext(searchParams.get("next"), "/");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [cognitoBusy, setCognitoBusy] = useState(false);
  const [authMode, setAuthMode] = useState<CognitoAuthMode>("signin");
  const [passkeyOffer, setPasskeyOffer] = useState<{
    needsProfileName: boolean;
    accessToken: string;
  } | null>(null);
  const [cognitoConfig, setCognitoConfig] = useState<
    CognitoAuthConfig | null | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const base = getMedimadeApiBase();
  const cognitoEnabled = cognitoConfig?.enabled === true;
  const anyBusy = busy || cognitoBusy;

  useLayoutEffect(() => {
    applyColorScheme(resolveAuthColorScheme(searchParams));
  }, [searchParams]);

  useEffect(() => {
    rememberAuthNext(next);
  }, [next]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await fetchCognitoAuthConfig();
        if (!cancelled) setCognitoConfig(cfg);
      } catch {
        if (!cancelled) setCognitoConfig(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function goAfterAuth(sessionNeedsName: boolean) {
    exitMarketingPreviewMode();
    rememberAuthNext(next);
    if (sessionNeedsName) {
      router.replace(
        `/auth/complete-profile?next=${encodeURIComponent(next || "/")}`,
      );
      return;
    }
    const dest = postAuthDestination(next);
    if (/^https?:\/\//i.test(dest)) {
      const ok = await navigateAuthDestination(dest);
      if (!ok) router.replace("/");
      return;
    }
    router.replace(dest);
  }

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    setBusy(true);
    try {
      rememberAuthNext(next);
      await requestMedimadeMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link");
    } finally {
      setBusy(false);
    }
  }

  async function setupPasskey() {
    if (!cognitoConfig || !passkeyOffer) return;
    if (!passkeyOffer.accessToken) {
      setError("Sign in again, then set up a passkey.");
      return;
    }
    setError(null);
    setCognitoBusy(true);
    try {
      await cognitoRegisterPasskey(cognitoConfig, passkeyOffer.accessToken);
      await goAfterAuth(passkeyOffer.needsProfileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up a passkey");
      setCognitoBusy(false);
    }
  }

  async function continueWithPasskey() {
    if (!cognitoConfig) return;
    setError(null);
    setCognitoBusy(true);
    try {
      rememberAuthNext(next);
      const tokens = await cognitoPasskeySignIn(cognitoConfig, email);
      const session = await establishCognitoSession(tokens.idToken);
      await goAfterAuth(session.needsProfileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in with a passkey");
      setCognitoBusy(false);
    }
  }

  async function continueWithGoogle() {
    setError(null);
    setCognitoBusy(true);
    try {
      rememberAuthNext(next);
      await beginCognitoHostedLogin(next, { identityProvider: "Google" });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start Google sign-in",
      );
      setCognitoBusy(false);
    }
  }

  return (
    <div className="home-hero home-hero--full-pattern home-hero--auth relative flex h-full min-h-0 w-full items-center justify-center overflow-hidden px-5 py-6 sm:px-8">
      <div className="relative z-[1] w-full max-w-[28rem] rounded-2xl border border-marketing-card-border bg-background py-6 px-10 shadow-[var(--marketing-card-shadow)] sm:py-8 sm:px-12">
        {passkeyOffer ? (
          <div className="flex flex-col items-center py-4 text-center sm:py-6">
            <div className="flex size-14 items-center justify-center rounded-full bg-[var(--marketing-icon-bg)] text-[var(--marketing-icon-fg)]">
              <Fingerprint aria-hidden className="size-6" strokeWidth={1.75} />
            </div>
            <h1 className="mt-6 font-display text-[1.75rem] font-medium leading-tight tracking-tight text-marketing-ink sm:text-3xl">
              Skip the password next time
            </h1>
            <p className="mt-2 max-w-[20rem] text-sm leading-relaxed text-marketing-body">
              Set up a passkey and sign in with just your face, fingerprint, or
              device PIN.
            </p>
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => void setupPasskey()}
              className="mt-8 w-full cursor-pointer rounded-xl accent-fill-gradient px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {cognitoBusy ? "Setting up…" : "Set up a passkey"}
            </button>
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => {
                skipPasskeyOfferThisSession();
                void goAfterAuth(passkeyOffer.needsProfileName);
              }}
              className="mt-4 text-sm text-muted transition-colors hover:text-foreground"
            >
              Maybe later
            </button>
          </div>
        ) : (
          <>
        <Link href="/" className="inline-flex items-center">
          <LogoMark
            size={30}
            className="relative top-px mr-2.5 shrink-0 text-accent-button"
          />
          <span className="brand-wordmark relative -top-px font-display text-xl font-medium tracking-tight lowercase sm:text-2xl">
            consciously
          </span>
        </Link>
        {authMode === "signin" ? (
          <>
            <h1 className="mt-5 font-display text-[1.75rem] font-medium leading-tight tracking-tight text-marketing-ink sm:text-3xl">
              Come back to yourself.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-marketing-body">
              Meditation, journal, and the life you’re shaping — waiting where you
              left them.
            </p>
          </>
        ) : null}

        <div className={authMode === "signin" ? "mt-6" : "mt-5"}>
            {!base ? (
              <p className="text-sm text-muted">
                Set{" "}
                <code className="rounded bg-background px-1 py-0.5">
                  NEXT_PUBLIC_MEDIMADE_API_URL
                </code>{" "}
                to enable sign-in.
              </p>
            ) : sent ? (
              <div>
                <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink">
                  Check your email
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-marketing-body">
                  We sent a sign-in link. You can close this tab.
                </p>
              </div>
            ) : (
              <>
                {cognitoConfig === undefined ? (
                  <p className="text-sm text-muted">Loading sign-in…</p>
                ) : null}
                {cognitoEnabled && cognitoConfig ? (
                  <>
                  <CognitoAuthForm
                    config={cognitoConfig}
                    hideIntro
                    disabled={anyBusy}
                    onModeChange={setAuthMode}
                    onEmailChange={setEmail}
                    afterForm={
                      <div className="mt-5 space-y-3">
                        <div className="relative py-1">
                          <div
                            className="absolute inset-0 flex items-center"
                            aria-hidden
                          >
                            <div className="w-full border-t border-border" />
                          </div>
                          <div className="relative flex justify-center text-xs tracking-wide text-muted">
                            <span className="bg-background px-3">or</span>
                          </div>
                        </div>
                        {authMode === "signin" ? (
                          <PasskeySignInButton
                            disabled={anyBusy}
                            label="Sign in with a passkey"
                            onClick={() => void continueWithPasskey()}
                          />
                        ) : null}
                        <GoogleSignInButton
                          busy={cognitoBusy}
                          disabled={anyBusy}
                          onClick={() => {
                            if (!cognitoConfig.methods.social) {
                              setError("Google sign-in isn’t available yet.");
                              return;
                            }
                            void continueWithGoogle();
                          }}
                        />
                      </div>
                    }
                    onAuthenticated={async (rawTokens, meta) => {
                      setCognitoBusy(true);
                      setError(null);
                      try {
                        rememberAuthNext(next);
                        const tokens = asCognitoAuthTokens(rawTokens);
                        if (!tokens.idToken) {
                          throw new Error("Cognito did not return a session. Try again.");
                        }
                        const session = await establishCognitoSession(tokens.idToken);
                        if (tokens.accessToken) {
                          rememberCognitoAccessToken(tokens.accessToken);
                        }
                        const shouldOfferPasskey =
                          Boolean(tokens.accessToken) &&
                          (meta?.justCreated ||
                            (!passkeyOfferSkippedThisSession() &&
                              !(await cognitoHasPasskey(
                                cognitoConfig,
                                tokens.accessToken,
                              ).catch(() => false))));
                        if (shouldOfferPasskey) {
                          setPasskeyOffer({
                            needsProfileName: session.needsProfileName,
                            accessToken: tokens.accessToken,
                          });
                          setCognitoBusy(false);
                          return;
                        }
                        await goAfterAuth(session.needsProfileName);
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not finish sign-in",
                        );
                        setCognitoBusy(false);
                      }
                    }}
                  />
                  </>
                ) : cognitoConfig !== undefined ? (
                  <form onSubmit={(e) => void onMagicLink(e)} className="space-y-3.5">
                    <div>
                      <label
                        htmlFor="email"
                        className="block text-sm font-medium text-foreground"
                      >
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(ev) => setEmail(ev.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-marketing-card-border bg-background px-3 py-2.5 text-sm outline-none transition-[border-color,box-shadow] focus:border-gold/70 focus:ring-1 focus:ring-gold/40"
                        placeholder="you@example.com"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={anyBusy}
                      className="w-full rounded-xl accent-fill-gradient px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Sending…" : "Email me a link"}
                    </button>
                  </form>
                ) : null}

                {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
              </>
            )}
          </div>
          </>
        )}
        </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted">Loading…</p>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

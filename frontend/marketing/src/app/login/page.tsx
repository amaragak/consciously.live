"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import {
  CognitoAuthForm,
  type CognitoAuthMode,
} from "@/components/cognito-auth-form";
import { LogoMark } from "@/components/logo-mark";
import { Fingerprint } from "lucide-react";
import {
  ASSUMED_COGNITO_AUTH_CONFIG,
  fetchCognitoAuthConfig,
  getCachedCognitoAuthConfig,
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

type BrandKind = "signup" | "signin";

const WAITING_FOR_YOU: { title: string; blurb: string }[] = [
  { title: "Personalised meditations", blurb: "Written and voiced for you" },
  { title: "Your personal manifesto", blurb: "And a vision board to match" },
  { title: "Smart journal", blurb: "See the patterns in how you feel" },
  { title: "Goal planner", blurb: "Clear next steps towards your vision" },
  { title: "Focus sessions", blurb: "Time for your goals, distractions blocked" },
  { title: "A coach on call", blurb: "Talk it through, any time" },
];

const WAITING_CHIPS = [
  "Personalised meditations",
  "Personal manifesto",
  "Vision board",
  "Smart journal",
  "Goal planner",
  "Focus sessions",
  "A coach on call",
] as const;

const THOUGHT_FOR_TODAY =
  "Small steps, taken every day, become the life you imagined.";

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" xmlns="http://www.w3.org/2000/svg">
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

function AuthSecondaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-marketing-card-border bg-background px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50 sm:min-h-[52px]"
    >
      {children}
    </button>
  );
}

function AuthBrandLockup() {
  return (
    <Link href="/" className="auth-split__lockup relative z-[1] inline-flex items-center gap-2.5 sm:gap-3">
      <LogoMark size={28} className="shrink-0 text-accent-button lg:hidden" />
      <LogoMark size={34} className="hidden shrink-0 text-accent-button lg:block" />
      <span className="brand-wordmark font-display text-[21px] font-medium tracking-tight lowercase sm:text-[28px]">
        consciously
      </span>
    </Link>
  );
}

function WaitingForYouCard() {
  return (
    <div className="auth-split__waiting-card">
      <div className="auth-split__eyebrow">Waiting for you</div>
      <div className="auth-split__waiting-grid">
        {WAITING_FOR_YOU.map((item) => (
          <div key={item.title} className="auth-split__waiting-item">
            <span className="auth-split__dot" aria-hidden />
            <span className="min-w-0">
              <span className="block font-display text-[19px] leading-snug">
                {item.title}
              </span>
              <span className="mt-0.5 block text-sm opacity-65">
                {item.blurb}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThoughtForToday({ className = "" }: { className?: string }) {
  return (
    <div className={`auth-split__thought ${className}`.trim()}>
      <span className="auth-split__eyebrow">A thought for today</span>
      <p className="auth-split__quote">“{THOUGHT_FOR_TODAY}”</p>
    </div>
  );
}

function TermsLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs leading-relaxed text-muted ${className}`.trim()}>
      By continuing you agree to our Terms and Privacy Policy.
    </p>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeAuthNext(searchParams.get("next"), "/");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [cognitoBusy, setCognitoBusy] = useState(false);
  const urlMode: BrandKind =
    searchParams.get("mode") === "signup" ? "signup" : "signin";
  const [authMode, setAuthMode] = useState<CognitoAuthMode>(urlMode);
  const [brandKind, setBrandKind] = useState<BrandKind>(urlMode);
  const [passkeyOffer, setPasskeyOffer] = useState<{
    needsProfileName: boolean;
    accessToken: string;
  } | null>(null);
  const [cognitoConfig, setCognitoConfig] = useState<CognitoAuthConfig>(
    () => getCachedCognitoAuthConfig() ?? ASSUMED_COGNITO_AUTH_CONFIG,
  );
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const base = getMedimadeApiBase();
  /** Assume Cognito is on until the config fetch proves otherwise. */
  const cognitoEnabled = cognitoConfig.enabled !== false;
  const anyBusy = busy || cognitoBusy;
  const showPrimaryForms =
    authMode === "signin" || authMode === "signup" || Boolean(passkeyOffer);

  const onModeChange = useCallback(
    (mode: CognitoAuthMode) => {
      setAuthMode(mode);
      if (mode !== "signin" && mode !== "signup") return;
      setBrandKind(mode);
      const current = searchParams.get("mode") === "signup" ? "signup" : "signin";
      if (current === mode) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("mode", mode);
      const qs = params.toString();
      router.replace(qs ? `/login?${qs}` : "/login", { scroll: false });
    },
    [router, searchParams],
  );

  useLayoutEffect(() => {
    applyColorScheme(resolveAuthColorScheme(searchParams));
  }, [searchParams]);

  useEffect(() => {
    setBrandKind(urlMode);
    setAuthMode((current) => {
      if (current === "confirm" || current === "forgot" || current === "reset") {
        return current;
      }
      return urlMode;
    });
  }, [urlMode]);

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
        /* Keep assumed-on config; submit will surface a real error if the pool is unreachable. */
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

  const quickActions = (
    <>
      <div className="relative flex items-center gap-3.5 py-0.5 text-[13px] text-muted">
        <span className="h-px flex-1 bg-marketing-card-border" aria-hidden />
        or
        <span className="h-px flex-1 bg-marketing-card-border" aria-hidden />
      </div>
      <AuthSecondaryButton
        disabled={anyBusy}
        onClick={() => {
          if (!cognitoConfig?.methods.social) {
            setError("Google sign-in isn’t available yet.");
            return;
          }
          void continueWithGoogle();
        }}
      >
        <GoogleMark />
        {cognitoBusy ? "Opening…" : "Continue with Google"}
      </AuthSecondaryButton>
      {authMode === "signin" ? (
        <AuthSecondaryButton
          disabled={anyBusy}
          onClick={() => void continueWithPasskey()}
        >
          <Fingerprint aria-hidden className="size-[18px]" strokeWidth={1.8} />
          Sign in with a passkey
        </AuthSecondaryButton>
      ) : null}
    </>
  );

  const brandIsSignup = brandKind === "signup";

  return (
    <div className="auth-split">
      <aside className="auth-split__brand" data-mode={brandKind}>
        <AuthBrandLockup />
        <div className="auth-split__brand-copy relative z-[1]">
          {brandIsSignup ? (
            <>
              <h1 className="auth-split__headline">
                This is where you{" "}
                <em className="auth-split__accent-word">begin</em>.
              </h1>
              <p className="auth-split__support">
                The life you keep picturing starts with a single step. Take it
                today.
              </p>
              <div className="auth-split__brand-extra hidden lg:block">
                <WaitingForYouCard />
              </div>
            </>
          ) : (
            <>
              <h1 className="auth-split__headline">
                Welcome <em className="auth-split__accent-word">back</em>.
              </h1>
              <p className="auth-split__support">
                <span className="lg:hidden">
                  Your practice is right where you left it.
                </span>
                <span className="hidden lg:inline">
                  Your practice is right where you left it. Pick up where you
                  left off.
                </span>
              </p>
              <div className="auth-split__brand-extra hidden lg:block">
                <ThoughtForToday />
              </div>
            </>
          )}
        </div>
      </aside>

      <section className="auth-split__panel">
        <div className="auth-split__panel-inner">
          {passkeyOffer ? (
            <div className="flex flex-col py-2">
              <h2 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-marketing-ink sm:text-3xl">
                Add a passkey
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-marketing-body sm:text-base">
                Sign in faster next time with your face, fingerprint, or device
                PIN.
              </p>
              <button
                type="button"
                disabled={anyBusy}
                onClick={() => void setupPasskey()}
                className="mt-8 flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-full accent-fill-gradient px-4 text-base font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {cognitoBusy ? "Setting up…" : "Set up a passkey"}
              </button>
              {error ? (
                <p className="mt-3 text-sm text-danger" role="alert" aria-live="polite">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                disabled={anyBusy}
                onClick={() => {
                  skipPasskeyOfferThisSession();
                  void goAfterAuth(passkeyOffer.needsProfileName);
                }}
                className="mt-4 min-h-11 text-sm text-muted transition-colors hover:text-foreground"
              >
                Maybe later
              </button>
            </div>
          ) : (
            <>
              {showPrimaryForms && (authMode === "signin" || authMode === "signup") ? (
                <div className="mb-5 hidden lg:block">
                  {authMode === "signup" ? (
                    <>
                      <h2 className="font-display text-4xl font-normal tracking-tight text-marketing-ink">
                        Create your account
                      </h2>
                      <p className="mt-2 text-base text-marketing-body">
                        Free to start. It takes less than a minute.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="font-display text-4xl font-normal tracking-tight text-marketing-ink">
                        Sign in
                      </h2>
                      <p className="mt-2 text-base text-marketing-body">
                        Good to see you again.
                      </p>
                    </>
                  )}
                </div>
              ) : null}

              {!base ? (
                <p className="text-sm text-muted">
                  Set{" "}
                  <code className="rounded bg-surface-2 px-1 py-0.5">
                    NEXT_PUBLIC_MEDIMADE_API_URL
                  </code>{" "}
                  to enable sign-in.
                </p>
              ) : sent ? (
                <div>
                  <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink">
                    Check your inbox
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-marketing-body sm:text-base">
                    We’ve sent a sign-in link. You can close this tab.
                  </p>
                </div>
              ) : (
                <>
                  {cognitoEnabled ? (
                    <CognitoAuthForm
                      config={cognitoConfig}
                      hideIntro
                      initialMode={urlMode}
                      disabled={anyBusy}
                      onModeChange={onModeChange}
                      onEmailChange={setEmail}
                      afterForm={
                        authMode === "signin" || authMode === "signup"
                          ? quickActions
                          : undefined
                      }
                      onAuthenticated={async (rawTokens, meta) => {
                        setCognitoBusy(true);
                        setError(null);
                        try {
                          rememberAuthNext(next);
                          const tokens = asCognitoAuthTokens(rawTokens);
                          if (!tokens.idToken) {
                            throw new Error(
                              "Cognito did not return a session. Try again.",
                            );
                          }
                          const session = await establishCognitoSession(
                            tokens.idToken,
                          );
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
                  ) : (
                    <form
                      onSubmit={(e) => void onMagicLink(e)}
                      className="space-y-3.5"
                    >
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
                          className="mt-1.5 min-h-12 w-full rounded-xl border border-marketing-card-border bg-background px-4 py-3 text-base outline-none transition-[border-color,box-shadow] focus:border-accent/50 focus:ring-2 focus:ring-accent/30 sm:min-h-[52px]"
                          placeholder="you@example.com"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={anyBusy}
                        className="flex min-h-[52px] w-full items-center justify-center rounded-full accent-fill-gradient px-4 text-base font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {busy ? "Sending…" : "Email me a link"}
                      </button>
                    </form>
                  )}

                  {error ? (
                    <p
                      className="mt-3 text-sm text-danger"
                      role="alert"
                      aria-live="polite"
                    >
                      {error}
                    </p>
                  ) : null}
                </>
              )}

              {brandIsSignup &&
              (authMode === "signin" || authMode === "signup") &&
              !sent ? (
                <div className="mt-4 hidden lg:block">
                  <TermsLine />
                </div>
              ) : null}
            </>
          )}
        </div>

        {!passkeyOffer &&
        (authMode === "signin" || authMode === "signup") &&
        !sent ? (
          <div className="auth-split__mobile-footer lg:hidden">
            {brandIsSignup ? (
              <>
                <div className="auth-split__eyebrow text-accent-link">
                  Waiting for you
                </div>
                <div className="auth-split__chips">
                  {WAITING_CHIPS.map((chip) => (
                    <span key={chip} className="auth-split__chip">
                      {chip}
                    </span>
                  ))}
                </div>
                <TermsLine className="mt-1 text-left" />
              </>
            ) : (
              <ThoughtForToday className="auth-split__thought--mobile" />
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-split" aria-busy="true">
          <aside className="auth-split__brand" data-mode="signup">
            <div className="auth-split__lockup relative z-[1] inline-flex items-center gap-2.5 sm:gap-3">
              <LogoMark size={28} className="shrink-0 text-accent-button lg:hidden" />
              <LogoMark size={34} className="hidden shrink-0 text-accent-button lg:block" />
              <span className="brand-wordmark font-display text-[21px] font-medium tracking-tight lowercase sm:text-[28px]">
                consciously
              </span>
            </div>
          </aside>
          <section className="auth-split__panel">
            <div className="auth-split__panel-inner">
              <p className="text-sm text-muted">Loading…</p>
            </div>
          </section>
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}

/**
 * Capacitor-only sign-in. Signed-out users land on a welcome screen (meditation
 * brief + “I already have an account”); the auth screen matches the marketing
 * `/login` page on a phone (email + password, sign-up with email code, reset,
 * Apple / Google) but stays inside the app.
 *
 * Not offered here: passkeys. WebAuthn needs an https origin tied to the app
 * through associated domains, and the web view runs at `capacitor://localhost`.
 */
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  CognitoAuthForm,
  type CognitoAuthMode,
} from "@/components/cognito-auth-form";
import {
  beginCognitoHostedLogin,
  completeCognitoHostedLogin,
} from "@/lib/cognito-auth";
import { asCognitoAuthTokens } from "@/lib/cognito-direct-auth";
import { startHomepageOneShotGeneration } from "@/lib/homepage-one-shot-handoff";
import {
  exchangeCognitoIdToken,
  fetchCognitoAuthConfig,
  getMedimadeApiBase,
  getMedimadeSessionEmail,
  requestMedimadeMagicLink,
  saveMedimadeProfileDisplayName,
  setMedimadeSession,
  type CognitoAuthConfig,
  type MedimadeMagicLinkVerifyResult,
} from "@/lib/medimade-api";
import {
  holdNativeDarkSurface,
  markNativeAppReady,
  NATIVE_DEV_TOOLS_ENABLED,
} from "@/lib/native/native-bridge";
import "./native-login.css";

/** Registered as a Cognito callback and as the app's URL scheme (iOS + Android). */
const NATIVE_AUTH_CALLBACK = "live.consciously.app://auth/cognito/callback";

/** Social buttons stay hidden until the fetched config says a provider is live. */
const ASSUMED_COGNITO_AUTH_CONFIG: CognitoAuthConfig = {
  enabled: true,
  userPoolId: null,
  clientId: null,
  region: null,
  domain: null,
  issuer: null,
  methods: { password: true, passkey: false, social: false },
};

type BrandKind = "signup" | "signin";
type HostedProvider = "SignInWithApple" | "Google";

/** Router state on the auth screen; the welcome screen has none. */
type NativeAuthLocationState = { nativeAuth?: BrandKind } | null;

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

function AppleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[19px]" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.37 12.6c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.27-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.51 1.25-2.58-.03-.01-2.4-.92-2.42-3.66ZM14.1 5.84c.63-.77 1.06-1.83.94-2.89-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.79 1.02.08 2.05-.52 2.68-1.27Z" />
    </svg>
  );
}

function ProviderButton({
  disabled,
  onClick,
  variant,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  variant: "apple" | "outline";
  children: React.ReactNode;
}) {
  const look =
    variant === "apple"
      ? "border-black bg-black text-white hover:bg-black/85"
      : "border-marketing-card-border bg-background text-foreground hover:bg-surface-2";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border px-4 text-base font-semibold transition-colors disabled:opacity-50 ${look}`}
    >
      {children}
    </button>
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

function WelcomeScreen({
  onBrief,
  onExistingAccount,
}: {
  onBrief: (brief: string) => void;
  onExistingAccount: () => void;
}) {
  const [brief, setBrief] = useState("");
  const trimmed = brief.trim();

  return (
    <div className="native-welcome">
      <div className="native-welcome__inner">
        <div className="native-welcome__copy">
          <h1 className="native-welcome__headline">
            Become who you <em className="auth-split__accent-word">said</em>{" "}
            you’d be.
          </h1>
          <p className="native-welcome__support">
            <em className="font-display italic text-[var(--auth-brand-fg)]">
              Live consciously
            </em>{" "}
            with our <strong className="font-semibold">mind reprogramming</strong>{" "}
            suite.
          </p>
        </div>

        <form
          className="native-welcome__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed) onBrief(trimmed);
          }}
        >
          <label htmlFor="native-welcome-brief" className="native-welcome__label">
            What would you like a meditation for?
          </label>
          <input
            id="native-welcome-brief"
            type="text"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. calm before a pitch"
            enterKeyHint="go"
            autoComplete="off"
            className="native-welcome__input"
          />
          <button
            type="submit"
            disabled={!trimmed}
            className="flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-full accent-fill-gradient px-4 text-base font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Create my meditation
          </button>
        </form>

        <button
          type="button"
          onClick={onExistingAccount}
          className="native-welcome__existing"
        >
          I already have an account
        </button>
      </div>
    </div>
  );
}

function ProfileNameStep({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) {
      setMessage("Enter a name between 1 and 80 characters.");
      return;
    }
    setMessage(null);
    setSaving(true);
    try {
      const { token, displayName } = await saveMedimadeProfileDisplayName(trimmed);
      setMedimadeSession(token, getMedimadeSessionEmail(), displayName);
      onDone();
    } catch (err) {
      setSaving(false);
      setMessage(err instanceof Error ? err.message : "Could not save your name");
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col py-2">
      <h2 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-marketing-ink">
        Your name
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-marketing-body">
        Add how you would like to be addressed. This stays on your account.
      </p>
      <label
        htmlFor="native-profile-name"
        className="mt-6 block text-sm font-medium text-foreground"
      >
        Display name
      </label>
      <input
        id="native-profile-name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(ev) => setName(ev.target.value)}
        maxLength={80}
        disabled={saving}
        placeholder="e.g. Alex"
        className="mt-1.5 min-h-12 w-full rounded-xl border border-marketing-card-border bg-background px-4 py-3 text-base text-foreground outline-none transition-[border-color,box-shadow] focus:border-accent/50 focus:ring-2 focus:ring-accent/30"
      />
      {message ? (
        <p className="mt-3 text-sm text-danger" role="alert" aria-live="polite">
          {message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-full accent-fill-gradient px-4 text-base font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

export default function NativeLoginPage({
  onAuthHoldChange,
}: {
  /** Keep this screen up after the session exists (name step, first meditation). */
  onAuthHoldChange?: (hold: boolean) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const screen =
    (location.state as NativeAuthLocationState)?.nativeAuth ?? "welcome";
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [cognitoBusy, setCognitoBusy] = useState(false);
  const [authMode, setAuthMode] = useState<CognitoAuthMode>("signin");
  const [brandKind, setBrandKind] = useState<BrandKind>("signin");
  const [cognitoConfig, setCognitoConfig] = useState<CognitoAuthConfig>(
    ASSUMED_COGNITO_AUTH_CONFIG,
  );
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const [creating, setCreating] = useState(false);
  const hostedPending = useRef(false);
  /** Brief from the welcome screen; becomes the first meditation after sign-up. */
  const pendingBrief = useRef<string | null>(null);

  const base = getMedimadeApiBase();
  const cognitoEnabled = cognitoConfig.enabled !== false;
  const anyBusy = busy || cognitoBusy;
  const primaryMode = authMode === "signin" || authMode === "signup";
  const brandIsSignup = brandKind === "signup";
  const showApple = cognitoConfig.methods.apple === true;
  const showGoogle = cognitoConfig.methods.google === true;

  useEffect(() => {
    markNativeAppReady();
    return holdNativeDarkSurface();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCognitoAuthConfig()
      .then((cfg) => {
        if (!cancelled) setCognitoConfig(cfg);
      })
      .catch(() => {
        /* Keep assumed config; submit surfaces a real error if the pool is unreachable. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (screen === "welcome") return;
    setBrandKind(screen);
    setAuthMode(screen);
    setError(null);
  }, [screen]);

  const openAuth = useCallback(
    (mode: BrandKind) => {
      navigate(`${location.pathname}${location.search}`, {
        state: { nativeAuth: mode } satisfies NativeAuthLocationState,
      });
    },
    [location.pathname, location.search, navigate],
  );

  const leaveLogin = useCallback(
    (dest?: string) => {
      onAuthHoldChange?.(false);
      if (dest) navigate(dest, { replace: true });
      // The app gate re-renders the current route once the session exists; the
      // bare `/login` route needs somewhere to go.
      else if (location.pathname === "/login") navigate("/", { replace: true });
    },
    [location.pathname, navigate, onAuthHoldChange],
  );

  const afterSignedIn = useCallback(async () => {
    const prompt = pendingBrief.current;
    pendingBrief.current = null;
    if (!prompt) {
      leaveLogin();
      return;
    }
    setCreating(true);
    try {
      const { libraryHref } = await startHomepageOneShotGeneration({ prompt });
      leaveLogin(libraryHref);
    } catch {
      // Signed in either way; they can start again from Create.
      leaveLogin("/");
    }
  }, [leaveLogin]);

  const finishSession = useCallback(
    (session: MedimadeMagicLinkVerifyResult) => {
      if (session.needsProfileName || pendingBrief.current) {
        onAuthHoldChange?.(true);
      }
      setMedimadeSession(
        session.token,
        session.email,
        session.displayName,
        session.refreshToken ?? null,
      );
      setCognitoBusy(false);
      if (session.needsProfileName) {
        setNeedsName(true);
        return;
      }
      void afterSignedIn();
    },
    [afterSignedIn, onAuthHoldChange],
  );

  useEffect(() => {
    const appUrl = CapApp.addListener("appUrlOpen", ({ url }) => {
      if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return;
      hostedPending.current = false;
      void Browser.close().catch(() => {});
      const params = new URL(url).searchParams;
      const code = params.get("code");
      if (!code) {
        const denied = params.get("error_description") || params.get("error");
        setError(denied ? `Sign-in didn’t finish: ${denied}` : "Sign-in didn’t finish.");
        setCognitoBusy(false);
        return;
      }
      setCognitoBusy(true);
      setError(null);
      completeCognitoHostedLogin(code, params.get("state"))
        .then(({ session }) => finishSession(session))
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "Could not finish sign-in");
          setCognitoBusy(false);
        });
    });
    // Sheet dismissed without finishing.
    const closed = Browser.addListener("browserFinished", () => {
      if (!hostedPending.current) return;
      hostedPending.current = false;
      setCognitoBusy(false);
    });
    return () => {
      void appUrl.then((h) => h.remove());
      void closed.then((h) => h.remove());
    };
  }, [finishSession]);

  const onModeChange = useCallback((mode: CognitoAuthMode) => {
    setAuthMode(mode);
    if (mode === "signin" || mode === "signup") setBrandKind(mode);
  }, []);

  async function onMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    setBusy(true);
    try {
      await requestMedimadeMagicLink(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link");
    } finally {
      setBusy(false);
    }
  }

  async function continueWith(provider: HostedProvider) {
    setError(null);
    setCognitoBusy(true);
    try {
      hostedPending.current = true;
      await beginCognitoHostedLogin("/", {
        identityProvider: provider,
        redirectUri: NATIVE_AUTH_CALLBACK,
        open: (url) => Browser.open({ url, presentationStyle: "popover" }),
      });
    } catch (err) {
      hostedPending.current = false;
      setError(err instanceof Error ? err.message : "Could not start sign-in");
      setCognitoBusy(false);
    }
  }

  if (screen === "welcome" && !needsName && !creating) {
    return (
      <WelcomeScreen
        onBrief={(brief) => {
          pendingBrief.current = brief;
          openAuth("signup");
        }}
        onExistingAccount={() => {
          pendingBrief.current = null;
          openAuth("signin");
        }}
      />
    );
  }

  const providerButtons =
    showApple || showGoogle ? (
      <>
        <div className="relative flex items-center gap-3.5 py-0.5 text-[13px] text-muted">
          <span className="h-px flex-1 bg-marketing-card-border" aria-hidden />
          or
          <span className="h-px flex-1 bg-marketing-card-border" aria-hidden />
        </div>
        {showApple ? (
          <ProviderButton
            variant="apple"
            disabled={anyBusy}
            onClick={() => void continueWith("SignInWithApple")}
          >
            <AppleMark />
            Continue with Apple
          </ProviderButton>
        ) : null}
        {showGoogle ? (
          <ProviderButton
            variant="outline"
            disabled={anyBusy}
            onClick={() => void continueWith("Google")}
          >
            <GoogleMark />
            Continue with Google
          </ProviderButton>
        ) : null}
      </>
    ) : undefined;

  return (
    <div className="auth-split auth-split--native">
      <aside className="auth-split__brand" data-mode={brandKind}>
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
            </>
          ) : (
            <>
              <h1 className="auth-split__headline">
                Welcome <em className="auth-split__accent-word">back</em>.
              </h1>
              <p className="auth-split__support">
                Your practice is right where you left it.
              </p>
            </>
          )}
        </div>
      </aside>

      <section className="auth-split__panel">
        <div className="auth-split__panel-inner">
          {creating ? (
            <div className="py-6" role="status" aria-live="polite">
              <h2 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-marketing-ink">
                Creating your meditation…
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-marketing-body">
                It’ll be waiting in your library in a moment.
              </p>
            </div>
          ) : needsName ? (
            <ProfileNameStep onDone={() => void afterSignedIn()} />
          ) : !base ? (
            <p className="text-sm text-muted">
              Set{" "}
              <code className="rounded bg-surface-2 px-1 py-0.5">
                VITE_MEDIMADE_API_URL
              </code>{" "}
              to enable sign-in.
            </p>
          ) : sent ? (
            <div>
              <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink">
                Check your inbox
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-marketing-body">
                We’ve sent a sign-in link.
              </p>
            </div>
          ) : (
            <>
              {cognitoEnabled ? (
                <CognitoAuthForm
                  key={screen}
                  config={cognitoConfig}
                  hideIntro
                  initialMode={screen === "signup" ? "signup" : "signin"}
                  disabled={anyBusy}
                  onModeChange={onModeChange}
                  onEmailChange={setEmail}
                  onCreateAccount={() =>
                    navigate(`${location.pathname}${location.search}`, {
                      replace: true,
                      state: null,
                    })
                  }
                  afterForm={primaryMode ? providerButtons : undefined}
                  onAuthenticated={async (rawTokens) => {
                    setCognitoBusy(true);
                    setError(null);
                    try {
                      const tokens = asCognitoAuthTokens(rawTokens);
                      if (!tokens.idToken) {
                        throw new Error("Cognito did not return a session. Try again.");
                      }
                      finishSession(await exchangeCognitoIdToken(tokens.idToken));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not finish sign-in");
                      setCognitoBusy(false);
                    }
                  }}
                />
              ) : (
                <form onSubmit={(e) => void onMagicLink(e)} className="space-y-3.5">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-foreground">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      required
                      value={email}
                      onChange={(ev) => setEmail(ev.target.value)}
                      className="mt-1.5 min-h-12 w-full rounded-xl border border-marketing-card-border bg-background px-4 py-3 text-base outline-none transition-[border-color,box-shadow] focus:border-accent/50 focus:ring-2 focus:ring-accent/30"
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
                <p className="mt-3 text-sm text-danger" role="alert" aria-live="polite">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>

        {!needsName && !creating && primaryMode && !sent ? (
          <div className="auth-split__mobile-footer lg:hidden">
            {brandIsSignup ? (
              <>
                <div className="auth-split__eyebrow">Waiting for you</div>
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
            {NATIVE_DEV_TOOLS_ENABLED ? (
              <Link
                to="/dev/audio"
                className="text-sm text-muted underline-offset-2 hover:underline"
              >
                Audio test
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

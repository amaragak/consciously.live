/**
 * Capacitor-only sign-in. Signed-out users land on the welcome screen (one-line
 * meditation brief). "Create meditation" opens the sign-up sheet (Apple, Google,
 * email code / magic link); nothing is generated until the account exists, then
 * Create opens on Shape with the line. "Sign in" in the footer opens the
 * "Welcome back." screen (Apple, Google, email + password, email code).
 *
 * Not offered here: passkeys. WebAuthn needs an https origin tied to the app
 * through associated domains, and the web view runs at `capacitor://localhost`.
 */
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Keyboard } from "@capacitor/keyboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CognitoAuthForm } from "@/components/cognito-auth-form";
import { asCognitoAuthTokens } from "@/lib/cognito-direct-auth";
import { createFromBriefHref } from "@/lib/create-meditation-path";
import {
  exchangeCognitoIdToken,
  fetchCognitoAuthConfig,
  getMedimadeApiBase,
  getMedimadeSessionEmail,
  requestMedimadeMagicLink,
  saveMedimadeProfileDisplayName,
  setMedimadeSession,
  verifyMedimadeMagicCode,
  verifyMedimadeMagicLink,
  type CognitoAuthConfig,
  type MedimadeMagicLinkVerifyResult,
} from "@/lib/medimade-api";
import {
  holdNativeDarkSurface,
  markNativeAppReady,
  NATIVE_DEV_TOOLS_ENABLED,
} from "@/lib/native/native-bridge";
import {
  isSocialCancel,
  nativeSocialProviders,
  nativeSocialSignIn,
  type NativeSocialProvider,
} from "@/lib/native/native-social";
import { useNativeDictation } from "@/lib/native/use-native-dictation";
import "./native-login.css";

const ASSUMED_COGNITO_AUTH_CONFIG: CognitoAuthConfig = {
  enabled: true,
  userPoolId: null,
  clientId: null,
  region: null,
  domain: null,
  issuer: null,
  methods: { password: true, passkey: false, social: false },
};

/** The welcome line survives restarts and the trip out to the mail app. */
const BRIEF_KEY = "mm_native_welcome_brief_v1";
/** Set while sign-up is in progress, so a magic link opened later still lands on Create. */
const PENDING_BRIEF_KEY = "mm_native_pending_brief_v1";

const TERMS_URL = "https://consciously.live/terms";
const PRIVACY_URL = "https://consciously.live/privacy";

/** Magic-link hosts that open the app (universal / app links). */
const MAGIC_LINK_HOSTS = new Set(["consciously.live", "www.consciously.live"]);

type NativeAuthLocationState = { nativeAuth?: "signin" } | null;
type SheetStep = "choose" | "email";

const THOUGHT_FOR_TODAY =
  "Small steps, taken every day, become the life you imagined.";

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* */
  }
}

function magicTokenFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (!MAGIC_LINK_HOSTS.has(u.hostname) || !u.pathname.startsWith("/auth/verify")) return null;
    return u.searchParams.get("token")?.trim() || null;
  } catch {
    return null;
  }
}

function openInApp(url: string) {
  void Browser.open({ url, presentationStyle: "popover" });
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.55-5.17 3.55-8.65Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3c-1.08.72-2.47 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.25 21.3 7.31 24 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.63H1.27A12 12 0 0 0 0 12c0 1.94.46 3.78 1.27 5.37l4-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.14 15.23 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
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

function MailMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function SparklesMark() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

function MicMark() {
  return (
    <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function SunMark() {
  return (
    <svg aria-hidden width="26" height="26" viewBox="0 0 30 30">
      <circle cx="15" cy="15" r="6" fill="#D9B87C" />
      <g stroke="#D9B87C" strokeWidth="1.6" strokeLinecap="round">
        <path d="M15 2v4" /><path d="M15 24v4" /><path d="M2 15h4" /><path d="M24 15h4" />
        <path d="M5.8 5.8l2.8 2.8" /><path d="M21.4 21.4l2.8 2.8" />
        <path d="M5.8 24.2l2.8-2.8" /><path d="M21.4 8.6l2.8-2.8" />
      </g>
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
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`native-provider native-provider--${variant}`}
    >
      {children}
    </button>
  );
}

function TermsLine() {
  return (
    <p className="native-sheet__terms">
      By continuing you agree to the{" "}
      <button type="button" onClick={() => openInApp(TERMS_URL)}>Terms</button> and{" "}
      <button type="button" onClick={() => openInApp(PRIVACY_URL)}>Privacy Policy</button>.
    </p>
  );
}

/** Email → 6-digit code (the same email also carries a link that opens the app). */
function EmailCodeFlow({
  disabled,
  onSession,
  onBusy,
}: {
  disabled: boolean;
  onSession: (session: MedimadeMagicLinkVerifyResult) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [email, setEmail] = useState(() => getMedimadeSessionEmail() ?? "");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const setBusyBoth = (b: boolean) => {
    setBusy(b);
    onBusy?.(b);
  };

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const to = email.trim();
    if (!to) return;
    setError(null);
    setBusyBoth(true);
    try {
      await requestMedimadeMagicLink(to);
      setSentTo(to);
      setCode("");
      window.setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email");
    } finally {
      setBusyBoth(false);
    }
  }

  async function verify(value: string) {
    if (!sentTo || value.length !== 6) return;
    setError(null);
    setBusyBoth(true);
    try {
      onSession(await verifyMedimadeMagicCode(sentTo, value));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn’t work");
      setBusyBoth(false);
    }
  }

  if (!sentTo) {
    return (
      <form onSubmit={(e) => void send(e)} className="native-code-flow">
        <label htmlFor="native-code-email" className="native-code-flow__label">Email</label>
        <input
          id="native-code-email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          inputMode="email"
          enterKeyHint="send"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="native-code-flow__input"
        />
        <button type="submit" disabled={disabled || busy || !email.trim()} className="native-primary">
          {busy ? "Sending…" : "Email me a code"}
        </button>
        {error ? <p className="native-code-flow__error" role="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
      className="native-code-flow"
    >
      <p className="native-code-flow__sent">
        We’ve sent a 6-digit code and a sign-in link to <strong>{sentTo}</strong>. Enter the
        code, or tap the link on this phone.
      </p>
      <label htmlFor="native-code" className="native-code-flow__label">Code</label>
      <input
        ref={codeRef}
        id="native-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        enterKeyHint="go"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(next);
          if (next.length === 6) void verify(next);
        }}
        placeholder="000000"
        className="native-code-flow__input native-code-flow__input--code"
      />
      <button type="submit" disabled={disabled || busy || code.length !== 6} className="native-primary">
        {busy ? "Checking…" : "Continue"}
      </button>
      {error ? <p className="native-code-flow__error" role="alert">{error}</p> : null}
      <div className="native-code-flow__links">
        <button type="button" disabled={busy} onClick={() => void send()}>Send a new code</button>
        <button type="button" disabled={busy} onClick={() => setSentTo(null)}>Use another email</button>
      </div>
    </form>
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
    <form onSubmit={(e) => void submit(e)} className="native-code-flow">
      <h2 className="native-sheet__title">Your name</h2>
      <p className="native-sheet__body">
        Add how you would like to be addressed. This stays on your account.
      </p>
      <label htmlFor="native-profile-name" className="native-code-flow__label">Display name</label>
      <input
        id="native-profile-name"
        type="text"
        autoComplete="name"
        autoFocus
        value={name}
        onChange={(ev) => setName(ev.target.value)}
        maxLength={80}
        disabled={saving}
        placeholder="e.g. Alex"
        className="native-code-flow__input"
      />
      {message ? <p className="native-code-flow__error" role="alert">{message}</p> : null}
      <button type="submit" disabled={saving || !name.trim()} className="native-primary">
        {saving ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () => setOpen(true));
    const hide = Keyboard.addListener("keyboardWillHide", () => setOpen(false));
    return () => {
      void show.then((h) => h.remove());
      void hide.then((h) => h.remove());
    };
  }, []);
  return open;
}

function WelcomeScreen({
  brief,
  onBriefChange,
  onCreate,
  onSignIn,
}: {
  brief: string;
  onBriefChange: (brief: string) => void;
  onCreate: () => void;
  onSignIn: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const keyboardOpen = useKeyboardOpen();
  const dictation = useNativeDictation(onBriefChange);

  return (
    <div className={`native-welcome${keyboardOpen ? " native-welcome--keyboard" : ""}`}>
      <div className="native-welcome__main">
        <div className="native-welcome__brand">
          <div className="native-welcome__lockup">
            <SunMark />
            <span>consciously</span>
          </div>
          <h1 className="native-welcome__headline">
            Become who you
            <br />
            <em>said</em> you’d&nbsp;be.
          </h1>
          <p className="native-welcome__support">
            The app that catalyses personal transformation.
          </p>
        </div>

        <form
          className="native-welcome__form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!brief.trim()) {
              inputRef.current?.focus();
              return;
            }
            inputRef.current?.blur();
            onCreate();
          }}
        >
          <label htmlFor="native-welcome-brief" className="native-welcome__label">
            What would you like a meditation for?
          </label>
          <div className="native-welcome__field">
            <input
              ref={inputRef}
              id="native-welcome-brief"
              type="text"
              value={brief}
              onChange={(e) => onBriefChange(e.target.value)}
              placeholder="e.g. calm before a pitch"
              enterKeyHint="go"
              autoComplete="off"
              autoCapitalize="sentences"
              className="native-welcome__input"
            />
            <button
              type="button"
              aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
              aria-pressed={dictation.listening}
              onClick={() => void dictation.toggle()}
              className={`native-welcome__mic${dictation.listening ? " is-listening" : ""}`}
            >
              <MicMark />
            </button>
          </div>
          {dictation.error ? (
            <p className="native-welcome__hint" role="status">{dictation.error}</p>
          ) : null}
          <button type="submit" className="native-mist">
            <SparklesMark />
            Create meditation
          </button>
          <p className="native-welcome__free">Your first meditation is free.</p>
        </form>
      </div>

      <footer className="native-welcome__footer">
        <span>Already have an account?</span>
        <button type="button" onClick={onSignIn} className="native-welcome__signin">
          Sign in
        </button>
        {NATIVE_DEV_TOOLS_ENABLED ? (
          <Link to="/dev/audio" className="native-welcome__dev">Audio test</Link>
        ) : null}
      </footer>
    </div>
  );
}

export default function NativeLoginPage({
  onAuthHoldChange,
}: {
  /** Keep this screen up after the session exists (name step, Create handoff). */
  onAuthHoldChange?: (hold: boolean) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const screen =
    (location.state as NativeAuthLocationState)?.nativeAuth === "signin" ? "signin" : "welcome";
  const [brief, setBrief] = useState(() => readLocal(BRIEF_KEY));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetStep, setSheetStep] = useState<SheetStep>("choose");
  const [signinCode, setSigninCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cognitoConfig, setCognitoConfig] = useState<CognitoAuthConfig>(
    ASSUMED_COGNITO_AUTH_CONFIG,
  );
  const [error, setError] = useState<string | null>(null);
  const [needsName, setNeedsName] = useState(false);

  const base = getMedimadeApiBase();
  const providers = nativeSocialProviders(cognitoConfig);

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
        /* Keep assumed config; submit surfaces a real error if the API is unreachable. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setError(null);
    setSigninCode(false);
  }, [screen]);

  const updateBrief = useCallback((next: string) => {
    setBrief(next);
    writeLocal(BRIEF_KEY, next.trim() ? next : null);
  }, []);

  const leaveLogin = useCallback(
    (dest?: string) => {
      onAuthHoldChange?.(false);
      if (dest) navigate(dest, { replace: true });
      else if (location.pathname === "/login") navigate("/", { replace: true });
    },
    [location.pathname, navigate, onAuthHoldChange],
  );

  const afterSignedIn = useCallback(() => {
    const pending = readLocal(PENDING_BRIEF_KEY).trim();
    writeLocal(PENDING_BRIEF_KEY, null);
    if (pending) {
      writeLocal(BRIEF_KEY, null);
      leaveLogin(createFromBriefHref(pending));
    } else {
      leaveLogin();
    }
  }, [leaveLogin]);

  const finishSession = useCallback(
    (session: MedimadeMagicLinkVerifyResult) => {
      const pending = Boolean(readLocal(PENDING_BRIEF_KEY).trim());
      if (session.needsProfileName || pending) onAuthHoldChange?.(true);
      setMedimadeSession(
        session.token,
        session.email,
        session.displayName,
        session.refreshToken ?? null,
      );
      setBusy(false);
      if (session.needsProfileName) {
        setNeedsName(true);
        return;
      }
      afterSignedIn();
    },
    [afterSignedIn, onAuthHoldChange],
  );

  // Magic link tapped on this phone: universal link (warm) or launch URL (cold).
  const handleIncomingUrl = useCallback(
    (url: string | undefined) => {
      const token = url ? magicTokenFromUrl(url) : null;
      if (!token) return;
      setBusy(true);
      setError(null);
      verifyMedimadeMagicLink(token)
        .then(finishSession)
        .catch((err: unknown) => {
          setBusy(false);
          setError(err instanceof Error ? err.message : "That sign-in link has expired");
        });
    },
    [finishSession],
  );

  useEffect(() => {
    void CapApp.getLaunchUrl()
      .then((launch) => handleIncomingUrl(launch?.url))
      .catch(() => undefined);
    const sub = CapApp.addListener("appUrlOpen", ({ url }) => handleIncomingUrl(url));
    return () => {
      void sub.then((h) => h.remove());
    };
  }, [handleIncomingUrl]);

  async function continueWith(provider: NativeSocialProvider) {
    setError(null);
    setBusy(true);
    try {
      finishSession(await nativeSocialSignIn(provider, cognitoConfig));
    } catch (err) {
      setBusy(false);
      if (!isSocialCancel(err)) {
        setError(err instanceof Error ? err.message : "Could not sign in");
      }
    }
  }

  const openSheet = () => {
    writeLocal(PENDING_BRIEF_KEY, brief.trim());
    setSheetStep("choose");
    setError(null);
    setSheetOpen(true);
  };

  const closeSheet = () => {
    if (busy) return;
    setSheetOpen(false);
  };

  const openSignIn = () => {
    writeLocal(PENDING_BRIEF_KEY, null);
    navigate(`${location.pathname}${location.search}`, {
      state: { nativeAuth: "signin" } satisfies NativeAuthLocationState,
    });
  };

  const backToWelcome = () => {
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  };

  const providerButtons = (
    <>
      {providers.apple ? (
        <ProviderButton variant="apple" disabled={busy} onClick={() => void continueWith("apple")}>
          <AppleMark />
          Continue with Apple
        </ProviderButton>
      ) : null}
      {providers.google ? (
        <ProviderButton variant="outline" disabled={busy} onClick={() => void continueWith("google")}>
          <GoogleMark />
          Continue with Google
        </ProviderButton>
      ) : null}
    </>
  );

  const errorLine = error ? (
    <p className="native-code-flow__error" role="alert" aria-live="polite">{error}</p>
  ) : null;

  if (screen === "signin" && !needsName) {
    return (
      <div className="auth-split auth-split--native">
        <aside className="auth-split__brand" data-mode="signin">
          <button type="button" onClick={backToWelcome} className="native-back" aria-label="Back">
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="auth-split__brand-copy relative z-[1]">
            <h1 className="auth-split__headline">
              Welcome <em className="auth-split__accent-word">back</em>.
            </h1>
            <p className="auth-split__support">Your practice is right where you left it.</p>
          </div>
        </aside>

        <section className="auth-split__panel">
          <div className="auth-split__panel-inner">
            {!base ? (
              <p className="text-sm text-muted">
                Set <code className="rounded bg-surface-2 px-1 py-0.5">VITE_MEDIMADE_API_URL</code>{" "}
                to enable sign-in.
              </p>
            ) : (
              <div className="native-signin">
                {providers.apple || providers.google ? (
                  <>
                    <div className="native-signin__providers">{providerButtons}</div>
                    <div className="native-divider"><span />or<span /></div>
                  </>
                ) : null}
                {signinCode ? (
                  <>
                    <EmailCodeFlow disabled={busy} onSession={finishSession} onBusy={setBusy} />
                    <button type="button" className="native-text-link" onClick={() => setSigninCode(false)}>
                      Use a password instead
                    </button>
                  </>
                ) : (
                  <CognitoAuthForm
                    config={cognitoConfig}
                    hideIntro
                    initialMode="signin"
                    disabled={busy}
                    onCreateAccount={backToWelcome}
                    afterForm={
                      <button type="button" className="native-text-link" onClick={() => setSigninCode(true)}>
                        Email me a sign-in code instead
                      </button>
                    }
                    onAuthenticated={async (rawTokens) => {
                      setBusy(true);
                      setError(null);
                      try {
                        const tokens = asCognitoAuthTokens(rawTokens);
                        if (!tokens.idToken) {
                          throw new Error("Sign-in didn’t return a session. Try again.");
                        }
                        finishSession(await exchangeCognitoIdToken(tokens.idToken));
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Could not finish sign-in");
                        setBusy(false);
                      }
                    }}
                  />
                )}
                {errorLine}
              </div>
            )}
          </div>

          <div className="auth-split__mobile-footer lg:hidden">
            <div className="auth-split__thought auth-split__thought--mobile">
              <span className="auth-split__eyebrow">A thought for today</span>
              <p className="auth-split__quote">“{THOUGHT_FOR_TODAY}”</p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const quoted = readLocal(PENDING_BRIEF_KEY).trim() || brief.trim();

  return (
    <>
      <WelcomeScreen
        brief={brief}
        onBriefChange={updateBrief}
        onCreate={openSheet}
        onSignIn={openSignIn}
      />
      {sheetOpen || needsName ? (
        <div className="native-sheet" role="dialog" aria-modal="true" aria-labelledby="native-sheet-title">
          <button
            type="button"
            className="native-sheet__scrim"
            aria-label="Close"
            onClick={needsName ? undefined : closeSheet}
          />
          <div className="native-sheet__panel">
            <span className="native-sheet__grabber" aria-hidden />
            {needsName ? (
              <ProfileNameStep onDone={afterSignedIn} />
            ) : (
              <>
                <div className="native-sheet__intro">
                  <h2 id="native-sheet-title" className="native-sheet__title">
                    Create an account to make it
                  </h2>
                  <p className="native-sheet__body">
                    It takes a minute to write and narrate, and it’s saved to your account. Your
                    first one is free.
                  </p>
                </div>
                {quoted ? (
                  <div className="native-sheet__quote">
                    <span>Your meditation</span>
                    <p>“{quoted}”</p>
                  </div>
                ) : null}
                {sheetStep === "choose" ? (
                  <div className="native-sheet__actions">
                    {providerButtons}
                    <ProviderButton variant="outline" disabled={busy} onClick={() => setSheetStep("email")}>
                      <MailMark />
                      Continue with email
                    </ProviderButton>
                  </div>
                ) : (
                  <>
                    <EmailCodeFlow disabled={busy} onSession={finishSession} onBusy={setBusy} />
                    <button type="button" className="native-text-link" onClick={() => setSheetStep("choose")}>
                      Other ways to continue
                    </button>
                  </>
                )}
                {errorLine}
                <TermsLine />
              </>
            )}
          </div>
        </div>
      ) : null}
      {busy && !sheetOpen ? <div className="native-busy" role="status" aria-label="Signing in" /> : null}
    </>
  );
}

/**
 * Capacitor-only auth screens (consciously-native-auth-screens.zip,
 * consciously-native-email-first.zip).
 * Continue (Apple / Google / email) → email check → Welcome back (password) or
 * Create your account → email verify → (passkey skipped on native) → first meditation.
 * The separate Sign up / Sign in screens are commented out below. Web auth is unchanged.
 *
 * Passkeys are not offered here: WebAuthn needs an https origin; the web view
 * is `capacitor://localhost`. Re-enable when a native passkey path exists.
 *
 * Previous welcome / sheet / sign-in layouts are commented in native-login.css
 * and in the git history of this file (welcome with hero, magic-link sheet).
 */
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { BookMarked, Eye, EyeOff, LayoutGrid } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AppNavSectionIcon } from "@/components/app-nav-section-icon";
import { BrandLockup } from "@/components/brand-lockup";
import {
  AuthShell,
  AUTH_EXIT_MS,
  AUTH_REDUCED_MS,
  type AuthOpenPhase,
} from "@/pages/native-auth-shell";
import {
  cognitoConfirmForgotPassword,
  cognitoConfirmSignUp,
  cognitoForgotPassword,
  cognitoPasswordSignIn,
  cognitoResendSignUpCode,
  cognitoSignUp,
  isUnconfirmedUserError,
  isUsernameExistsError,
} from "@/lib/cognito-direct-auth";
import { createFromBriefHref } from "@/lib/create-meditation-path";
import {
  checkAuthEmail,
  exchangeCognitoIdToken,
  fetchCognitoAuthConfig,
  getMedimadeApiBase,
  getMedimadeSessionEmail,
  saveMedimadeProfileDisplayName,
  setMedimadeSession,
  verifyMedimadeMagicLink,
  type AuthEmailCheck,
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

/** Flip when native WebAuthn / associated-domains passkeys work. */
const NATIVE_PASSKEYS_ENABLED = false;

const ASSUMED_COGNITO_AUTH_CONFIG: CognitoAuthConfig = {
  enabled: true,
  userPoolId: null,
  clientId: null,
  region: null,
  domain: null,
  issuer: null,
  methods: { password: true, passkey: false, social: false },
};

const BRIEF_KEY = "mm_native_welcome_brief_v1";
const TERMS_URL = "https://consciously.live/terms";
const PRIVACY_URL = "https://consciously.live/privacy";
const MAGIC_LINK_HOSTS = new Set(["consciously.live", "www.consciously.live"]);

// Superseded by email-first: every entry lands on Continue.
// type NativeAuthLocationState = { nativeAuth?: "signin" } | null;
type Screen =
  | "continue"
  | "known"
  | "new"
  // | "signup"
  // | "signin"
  | "confirm"
  | "forgot"
  | "reset"
  | "name"
  | "first";

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocal(key: string, value: string | null) {
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function magicTokenFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (!MAGIC_LINK_HOSTS.has(url.hostname)) return null;
    if (!url.pathname.startsWith("/auth/verify")) return null;
    const token = url.searchParams.get("token")?.trim();
    return token || null;
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

function AuthBand({
  headline,
  subline,
  onBack,
}: {
  headline: React.ReactNode;
  subline: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <aside className="auth-split__brand">
      {onBack ? (
        <button type="button" onClick={onBack} className="native-back" aria-label="Back">
          <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      ) : null}
      {/* Invisible placeholder: same BrandLockup size; the visible one lives on AuthShell. */}
      <BrandLockup placeholder />
      <div className="auth-split__brand-copy relative z-[1]">
        <h1 className="auth-split__headline">{headline}</h1>
        <p className="auth-split__support">{subline}</p>
      </div>
    </aside>
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

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="native-auth__field">
      <label htmlFor={id}>{label}</label>
      <div className="native-auth__password-wrap">
        <input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          placeholder={placeholder}
          onChange={(ev) => onChange(ev.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="native-auth__eye"
        >
          {show ? <EyeOff aria-hidden className="size-4" strokeWidth={2} /> : <Eye aria-hidden className="size-4" strokeWidth={2} />}
        </button>
      </div>
      {hint ? <p className="native-auth__hint">{hint}</p> : null}
    </div>
  );
}

const WHATS_INSIDE: { label: string; icon: React.ReactNode }[] = [
  { label: "Personalised meditations", icon: <AppNavSectionIcon sectionId="meditate" size={16} /> },
  { label: "Vision board", icon: <LayoutGrid aria-hidden width={16} height={16} strokeWidth={1.75} /> },
  { label: "Stories of your future self", icon: <BookMarked aria-hidden width={16} height={16} strokeWidth={1.75} /> },
  { label: "Journal", icon: <AppNavSectionIcon sectionId="journal" size={16} /> },
  { label: "Heal", icon: <AppNavSectionIcon sectionId="heal" size={16} /> },
  { label: "Focus", icon: <AppNavSectionIcon sectionId="focus" size={16} /> },
];

/** Continue only: information, not tappable (consciously-native-whats-inside). */
function WhatsInside() {
  return (
    <section className="native-whats-inside" aria-label="What’s inside">
      <p className="native-whats-inside__label">What’s inside</p>
      <ul className="native-whats-inside__grid">
        {WHATS_INSIDE.map((item) => (
          <li key={item.label} className="native-whats-inside__item">
            <span className="native-whats-inside__icon">{item.icon}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Read-only email from the Continue step, with Change. */
function EmailRow({ email, onChange }: { email: string; onChange: () => void }) {
  return (
    <div className="native-auth__email-row">
      <span className="native-auth__email-value">{email}</span>
      <button type="button" onClick={onChange}>
        Change
      </button>
    </div>
  );
}

function TermsLine() {
  return (
    <p className="native-auth__terms">
      By continuing you agree to our{" "}
      <button type="button" onClick={() => openInApp(TERMS_URL)}>Terms</button> and{" "}
      <button type="button" onClick={() => openInApp(PRIVACY_URL)}>Privacy Policy</button>.
    </p>
  );
}

/** Six boxes; iOS can autofill via one-time-code on the first input. */
function CodeBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.replace(/\D/g, "").slice(0, 6).padEnd(6, " ").split("");

  function setAt(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (cleaned.length > 1) {
      onChange(cleaned.slice(0, 6));
      refs.current[Math.min(cleaned.length, 5)]?.focus();
      return;
    }
    const chars = value.replace(/\D/g, "").slice(0, 6).split("");
    while (chars.length < 6) chars.push("");
    chars[index] = cleaned.slice(-1);
    const next = chars.join("").replace(/\s/g, "");
    onChange(next);
    if (cleaned && index < 5) refs.current[index + 1]?.focus();
  }

  return (
    <div className="native-auth__otp" role="group" aria-label="Verification code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? 6 : 1}
          disabled={disabled}
          value={d.trim()}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !digits[i].trim() && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          className="native-auth__otp-box"
        />
      ))}
    </div>
  );
}

function ProfileNameStep({
  onDone,
  onBack,
}: {
  onDone: () => void;
  onBack?: () => void;
}) {
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
    <div className="auth-split auth-split--native">
      <AuthBand
        onBack={onBack}
        headline="Your name."
        subline="How should we address you?"
      />
      <section className="auth-split__panel">
        <form className="auth-split__panel-inner native-auth__form" onSubmit={(e) => void submit(e)}>
          <div className="native-auth__field">
            <label htmlFor="native-profile-name">Display name</label>
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
            />
          </div>
          {message ? <p className="native-code-flow__error" role="alert">{message}</p> : null}
          <button type="submit" disabled={saving || !name.trim()} className="native-mist">
            {saving ? "Saving…" : "Continue"}
          </button>
        </form>
      </section>
    </div>
  );
}

function FirstMeditationScreen({
  onCreate,
  onSkip,
  onBack,
}: {
  onCreate: (brief: string) => void;
  onSkip: () => void;
  onBack?: () => void;
}) {
  const [brief, setBrief] = useState(() => readLocal(BRIEF_KEY));
  const inputRef = useRef<HTMLInputElement>(null);
  const dictation = useNativeDictation((next) => {
    setBrief(next);
    writeLocal(BRIEF_KEY, next.trim() ? next : null);
  });

  return (
    <div className="auth-split auth-split--native">
      <AuthBand
        onBack={onBack}
        headline="Your first meditation."
        subline="One line is enough. It’s free, and you can shape it next."
      />
      <section className="auth-split__panel">
        <form
          className="auth-split__panel-inner native-auth__form"
          onSubmit={(e) => {
            e.preventDefault();
            const line = brief.trim();
            if (!line) {
              inputRef.current?.focus();
              return;
            }
            onCreate(line);
          }}
        >
          <div className="native-auth__field">
            <label htmlFor="native-first-brief">What is it for?</label>
            <div className="native-auth__brief-row">
              <input
                ref={inputRef}
                id="native-first-brief"
                type="text"
                value={brief}
                onChange={(e) => {
                  setBrief(e.target.value);
                  writeLocal(BRIEF_KEY, e.target.value.trim() ? e.target.value : null);
                }}
                placeholder="e.g. calm before a pitch"
                enterKeyHint="go"
                autoComplete="off"
                autoCapitalize="sentences"
              />
              <button
                type="button"
                aria-label={dictation.listening ? "Stop dictation" : "Dictate"}
                aria-pressed={dictation.listening}
                onClick={() => void dictation.toggle()}
                className={`native-auth__mic${dictation.listening ? " is-listening" : ""}`}
              >
                <MicMark />
              </button>
            </div>
          </div>
          {dictation.error ? <p className="native-auth__hint" role="status">{dictation.error}</p> : null}
          <button type="submit" className="native-mist">
            <SparklesMark />
            Create meditation
          </button>
          <button type="button" className="native-text-link" onClick={onSkip}>
            Skip for now
          </button>
          {NATIVE_DEV_TOOLS_ENABLED ? (
            <Link to="/dev/audio" className="native-welcome__dev">Audio test</Link>
          ) : null}
        </form>
      </section>
    </div>
  );
}

export default function NativeLoginPage({
  onAuthHoldChange,
}: {
  onAuthHoldChange?: (hold: boolean) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const [screen, setScreen] = useState<Screen>("continue");
  const [account, setAccount] = useState<AuthEmailCheck | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cognitoConfig, setCognitoConfig] = useState<CognitoAuthConfig>(
    ASSUMED_COGNITO_AUTH_CONFIG,
  );
  /** After auth: show first-meditation for new accounts. */
  const [isNewAccount, setIsNewAccount] = useState(false);
  const pendingAfterName = useRef<"first" | "done">("done");
  const [openPhase, setOpenPhase] = useState<AuthOpenPhase>("loading");
  const [exiting, setExiting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const base = getMedimadeApiBase();
  const providers = nativeSocialProviders(cognitoConfig);
  const opening = openPhase !== "ready";

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Cap/launch cover drops once login is mounted. AuthShell runs the whole morph.
  useLayoutEffect(() => {
    markNativeAppReady({ signedIn: false });
  }, []);

  useEffect(() => holdNativeDarkSurface(), []);

  useEffect(() => {
    let cancelled = false;
    fetchCognitoAuthConfig()
      .then((cfg) => {
        if (!cancelled) setCognitoConfig(cfg);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const leaveLogin = useCallback(
    (dest?: string) => {
      setExiting(true);
      const ms = reduceMotion ? AUTH_REDUCED_MS : AUTH_EXIT_MS;
      window.setTimeout(() => {
        onAuthHoldChange?.(false);
        if (dest) navigate(dest, { replace: true });
        else if (location.pathname === "/login") navigate("/", { replace: true });
      }, ms);
    },
    [location.pathname, navigate, onAuthHoldChange, reduceMotion],
  );

  const goPostAuth = useCallback(
    (session: MedimadeMagicLinkVerifyResult, opts: { isNew: boolean }) => {
      setMedimadeSession(
        session.token,
        session.email,
        session.displayName,
        session.refreshToken ?? null,
      );
      setBusy(false);
      setIsNewAccount(opts.isNew);
      if (session.needsProfileName) {
        onAuthHoldChange?.(true);
        pendingAfterName.current = opts.isNew ? "first" : "done";
        setScreen("name");
        return;
      }
      if (opts.isNew) {
        onAuthHoldChange?.(true);
        setScreen("first");
        return;
      }
      leaveLogin();
    },
    [leaveLogin, onAuthHoldChange],
  );

  const finishSession = useCallback(
    (session: MedimadeMagicLinkVerifyResult, opts: { isNew: boolean }) => {
      // Passkey step skipped while NATIVE_PASSKEYS_ENABLED is false.
      void NATIVE_PASSKEYS_ENABLED;
      goPostAuth(session, opts);
    },
    [goPostAuth],
  );

  const handleIncomingUrl = useCallback(
    (url: string | undefined) => {
      const token = url ? magicTokenFromUrl(url) : null;
      if (!token) return;
      setBusy(true);
      setError(null);
      verifyMedimadeMagicLink(token)
        .then((session) => finishSession(session, { isNew: false }))
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
      const session = await nativeSocialSignIn(provider, cognitoConfig);
      // New social accounts typically still need a display name.
      finishSession(session, { isNew: session.needsProfileName });
    } catch (err) {
      setBusy(false);
      if (!isSocialCancel(err)) {
        setError(err instanceof Error ? err.message : "Could not sign in");
      }
    }
  }

  async function onContinue(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    setError(null);
    setBusy(true);
    try {
      const result = await checkAuthEmail(address);
      setAccount(result);
      setPassword("");
      setScreen(result.next === "signin" ? "known" : "new");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t check that email. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Back to Continue with the email still filled in. */
  const changeEmail = () => {
    setError(null);
    setCode("");
    setPassword("");
    setScreen("continue");
  };

  async function onSignUp(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address || !password) return;
    setError(null);
    setBusy(true);
    try {
      const { confirmed } = await cognitoSignUp(cognitoConfig, address, password);
      if (confirmed) {
        const tokens = await cognitoPasswordSignIn(cognitoConfig, address, password);
        const session = await exchangeCognitoIdToken(tokens.idToken!);
        finishSession(session, { isNew: true });
        return;
      }
      setCode("");
      setScreen("confirm");
      setBusy(false);
    } catch (err) {
      if (isUsernameExistsError(err)) {
        try {
          const tokens = await cognitoPasswordSignIn(cognitoConfig, address, password);
          const session = await exchangeCognitoIdToken(tokens.idToken!);
          finishSession(session, { isNew: false });
          return;
        } catch (signInErr) {
          if (isUnconfirmedUserError(signInErr)) {
            try {
              await cognitoResendSignUpCode(cognitoConfig, address);
            } catch {
              /* still show confirm */
            }
            setScreen("confirm");
            setBusy(false);
            return;
          }
          setError(
            signInErr instanceof Error
              ? signInErr.message
              : "An account with this email already exists. Sign in instead.",
          );
          setBusy(false);
          return;
        }
      }
      setError(err instanceof Error ? err.message : "Could not create the account");
      setBusy(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (code.replace(/\D/g, "").length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      await cognitoConfirmSignUp(cognitoConfig, address, code.replace(/\D/g, ""));
      const tokens = await cognitoPasswordSignIn(cognitoConfig, address, password);
      const session = await exchangeCognitoIdToken(tokens.idToken!);
      finishSession(session, { isNew: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code");
      setBusy(false);
    }
  }

  async function onResend() {
    setError(null);
    setBusy(true);
    try {
      await cognitoResendSignUpCode(cognitoConfig, email.trim().toLowerCase());
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code");
      setBusy(false);
    }
  }

  async function onSignIn(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address || !password) return;
    setError(null);
    setBusy(true);
    try {
      const tokens = await cognitoPasswordSignIn(cognitoConfig, address, password);
      const session = await exchangeCognitoIdToken(tokens.idToken!);
      finishSession(session, { isNew: false });
    } catch (err) {
      if (isUnconfirmedUserError(err)) {
        try {
          await cognitoResendSignUpCode(cognitoConfig, address);
        } catch {
          /* ignore */
        }
        setScreen("confirm");
        setBusy(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    setError(null);
    setBusy(true);
    try {
      await cognitoForgotPassword(cognitoConfig, address);
      setCode("");
      setPassword("");
      setScreen("reset");
      setBusy(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send a reset code");
      setBusy(false);
    }
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (code.replace(/\D/g, "").length !== 6 || !password) return;
    setError(null);
    setBusy(true);
    try {
      await cognitoConfirmForgotPassword(
        cognitoConfig,
        address,
        code.replace(/\D/g, ""),
        password,
      );
      const tokens = await cognitoPasswordSignIn(cognitoConfig, address, password);
      const session = await exchangeCognitoIdToken(tokens.idToken!);
      finishSession(session, { isNew: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password");
      setBusy(false);
    }
  }

  // Superseded by email-first (Continue → Welcome back / Create your account).
  // const openSignIn = () => {
  //   setError(null);
  //   navigate(`${location.pathname}${location.search}`, {
  //     state: { nativeAuth: "signin" } satisfies NativeAuthLocationState,
  //   });
  // };
  //
  // const openSignUp = () => {
  //   setError(null);
  //   navigate(`${location.pathname}${location.search}`, {
  //     replace: true,
  //     state: null,
  //   });
  // };

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

  let body: React.ReactNode;

  if (screen === "name") {
    body = (
      <ProfileNameStep
        onBack={undefined}
        onDone={() => {
          if (pendingAfterName.current === "first" || isNewAccount) {
            setScreen("first");
          } else {
            leaveLogin();
          }
        }}
      />
    );
  } else if (screen === "first") {
    body = (
      <FirstMeditationScreen
        onCreate={(line) => {
          writeLocal(BRIEF_KEY, null);
          leaveLogin(createFromBriefHref(line));
        }}
        onSkip={() => {
          writeLocal(BRIEF_KEY, null);
          leaveLogin();
        }}
      />
    );
  } else if (screen === "confirm") {
    body = (
      <div className="auth-split auth-split--native">
        <AuthBand
          onBack={() => {
            setCode("");
            setError(null);
            setScreen(account?.next === "signin" ? "known" : "new");
          }}
          headline="Check your email."
          subline={
            <>
              We sent a 6-digit code to <strong>{email.trim().toLowerCase()}</strong>.
            </>
          }
        />
        <section className="auth-split__panel">
          <form className="auth-split__panel-inner native-auth__form" onSubmit={(e) => void onConfirm(e)}>
            <CodeBoxes value={code} onChange={setCode} disabled={busy} />
            {errorLine}
            <button
              type="submit"
              disabled={busy || code.replace(/\D/g, "").length !== 6}
              className="native-mist"
            >
              {busy ? "Verifying…" : "Verify"}
            </button>
            <p className="native-auth__centre-link">
              Didn’t get it?{" "}
              <button type="button" disabled={busy} onClick={() => void onResend()}>
                Resend
              </button>
            </p>
            <p className="native-auth__centre-link">
              Wrong address?{" "}
              <button
                type="button"
                disabled={busy}
                onClick={changeEmail}
              >
                Change email
              </button>
            </p>
          </form>
        </section>
        {busy ? <div className="native-busy" role="status" aria-label="Working" /> : null}
      </div>
    );
  } else if (screen === "forgot") {
    body = (
      <div className="auth-split auth-split--native">
        <AuthBand
          onBack={() => {
            setError(null);
            setScreen("known");
          }}
          headline="Forgot password."
          subline="We’ll email you a reset code."
        />
        <section className="auth-split__panel">
          <form className="auth-split__panel-inner native-auth__form" onSubmit={(e) => void onForgot(e)}>
            <div className="native-auth__field">
              <label htmlFor="native-forgot-email">Email</label>
              <input
                id="native-forgot-email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                placeholder="you@example.com"
              />
            </div>
            {errorLine}
            <button type="submit" disabled={busy || !email.trim()} className="native-mist">
              {busy ? "Sending…" : "Send reset code"}
            </button>
          </form>
        </section>
      </div>
    );
  } else if (screen === "reset") {
    body = (
      <div className="auth-split auth-split--native">
        <AuthBand
          onBack={() => {
            setError(null);
            setScreen("forgot");
          }}
          headline="Choose a new password."
          subline={
            <>
              Enter the code we sent to <strong>{email.trim().toLowerCase()}</strong>.
            </>
          }
        />
        <section className="auth-split__panel">
          <form className="auth-split__panel-inner native-auth__form" onSubmit={(e) => void onReset(e)}>
            <CodeBoxes value={code} onChange={setCode} disabled={busy} />
            <PasswordField
              id="native-reset-password"
              label="New password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              hint="8+ characters, with upper and lower case and a number."
            />
            {errorLine}
            <button
              type="submit"
              disabled={busy || code.replace(/\D/g, "").length !== 6 || !password}
              className="native-mist"
            >
              {busy ? "Saving…" : "Reset password"}
            </button>
          </form>
        </section>
      </div>
    );
  } else if (screen === "known") {
    const address = email.trim().toLowerCase();
    const socialOnly = account != null && !account.hasPassword && account.providers.length > 0;
    const socialProvider: NativeSocialProvider = account?.providers.includes("apple") ? "apple" : "google";
    body = (
      <div className="auth-split auth-split--native">
        <AuthBand
          onBack={changeEmail}
          headline={
            <>
              Welcome <em className="auth-split__accent-word">back</em>.
            </>
          }
          subline="Enter your password to sign in."
        />
        <section className="auth-split__panel">
          <div className="auth-split__panel-inner native-auth__form">
            <EmailRow email={address} onChange={changeEmail} />
            {socialOnly ? (
              <>
                <p className="native-auth__hint native-auth__provider-note">
                  This account uses Sign in with {socialProvider === "apple" ? "Apple" : "Google"}.
                </p>
                {errorLine}
                {socialProvider === "apple" ? (
                  <ProviderButton variant="apple" disabled={busy} onClick={() => void continueWith("apple")}>
                    <AppleMark />
                    Sign in with Apple
                  </ProviderButton>
                ) : (
                  <ProviderButton variant="outline" disabled={busy} onClick={() => void continueWith("google")}>
                    <GoogleMark />
                    Sign in with Google
                  </ProviderButton>
                )}
              </>
            ) : (
              <form className="native-auth__form" onSubmit={(e) => void onSignIn(e)}>
                <input type="email" name="email" autoComplete="username" value={address} readOnly hidden />
                <PasswordField
                  id="native-known-password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
                <div className="native-auth__forgot-row">
                  <button type="button" disabled={busy} onClick={() => setScreen("forgot")}>
                    Forgot password?
                  </button>
                </div>
                {errorLine}
                <button type="submit" disabled={busy || !password} className="native-mist">
                  {busy ? "Signing in…" : "Sign in"}
                </button>
                {/* Passkey sign-in needs a native WebAuthn path; hidden until NATIVE_PASSKEYS_ENABLED. */}
                {NATIVE_PASSKEYS_ENABLED && account?.hasPasskey ? (
                  <div className="native-divider">
                    <span />
                    or
                    <span />
                  </div>
                ) : null}
              </form>
            )}
          </div>
        </section>
        {busy ? <div className="native-busy" role="status" aria-label="Signing in" /> : null}
      </div>
    );
  } else if (screen === "new") {
    const address = email.trim().toLowerCase();
    body = (
      <div className="auth-split auth-split--native">
        <AuthBand
          onBack={changeEmail}
          headline="Create your account."
          subline="No account with this email yet. Choose a password and we’ll send you a code."
        />
        <section className="auth-split__panel">
          <form className="auth-split__panel-inner native-auth__form" onSubmit={(e) => void onSignUp(e)}>
            <EmailRow email={address} onChange={changeEmail} />
            <input type="email" name="email" autoComplete="username" value={address} readOnly hidden />
            <PasswordField
              id="native-new-password"
              label="Password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              hint="8+ characters, with upper and lower case and a number."
            />
            {errorLine}
            <button type="submit" disabled={busy || !password} className="native-mist">
              {busy ? "Creating…" : "Create my account"}
            </button>
          </form>
        </section>
        {busy ? <div className="native-busy" role="status" aria-label="Working" /> : null}
      </div>
    );
  } else {
    body = (
      <div
        className={[
          "auth-split",
          "auth-split--native",
          opening ? "auth-split--opening" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <AuthBand
          headline={
            <>
              <span className="native-auth__headline-line">Become who you</span>
              <span className="native-auth__headline-line">
                <em className="auth-split__accent-word">said</em> you’d be.
              </span>
            </>
          }
          subline="The app that catalyses personal transformation."
        />
        <section className="auth-split__panel">
          <div className="auth-split__panel-inner native-auth__form">
            {!base ? (
              <p className="text-sm text-muted">
                Set <code className="rounded bg-surface-2 px-1 py-0.5">VITE_MEDIMADE_API_URL</code> to
                enable sign-in.
              </p>
            ) : (
              <>
                <div className="native-signin__providers">{providerButtons}</div>
                <div className="native-divider">
                  <span />
                  or with email
                  <span />
                </div>
                <form className="native-auth__form" onSubmit={(e) => void onContinue(e)}>
                  <div className="native-auth__field">
                    <label htmlFor="native-continue-email">Email</label>
                    <input
                      id="native-continue-email"
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      inputMode="email"
                      enterKeyHint="go"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value.toLowerCase())}
                      placeholder="you@example.com"
                    />
                  </div>
                  {errorLine}
                  <button type="submit" disabled={busy || !email.trim()} className="native-mist">
                    {busy ? "Checking…" : "Continue"}
                  </button>
                </form>
                <TermsLine />
                <WhatsInside />
              </>
            )}
          </div>
        </section>
        {busy ? <div className="native-busy" role="status" aria-label="Working" /> : null}
      </div>
    );
  }

  // Superseded by email-first: the separate Sign in / Sign up screens.
  //   body = (
  //     <div className="auth-split auth-split--native">
  //       <AuthBand
  //         onBack={openSignUp}
  //         headline={
  //           <>
  //             Welcome <em className="auth-split__accent-word">back</em>.
  //           </>
  //         }
  //         subline="Your practice is right where you left it."
  //       />
  //       <section className="auth-split__panel">
  //         <div className="auth-split__panel-inner native-auth__form">
  //           {!base ? (
  //             <p className="text-sm text-muted">
  //               Set <code className="rounded bg-surface-2 px-1 py-0.5">VITE_MEDIMADE_API_URL</code> to
  //               enable sign-in.
  //             </p>
  //           ) : (
  //             <>
  //               <div className="native-signin__providers">{providerButtons}</div>
  //               {/* Passkey button omitted while NATIVE_PASSKEYS_ENABLED is false. */}
  //               <div className="native-divider">
  //                 <span />
  //                 or with email
  //                 <span />
  //               </div>
  //               <form className="native-auth__form" onSubmit={(e) => void onSignIn(e)}>
  //                 <div className="native-auth__field">
  //                   <label htmlFor="native-signin-email">Email</label>
  //                   <input
  //                     id="native-signin-email"
  //                     type="email"
  //                     autoComplete="email"
  //                     autoCapitalize="none"
  //                     required
  //                     value={email}
  //                     onChange={(e) => setEmail(e.target.value.toLowerCase())}
  //                     placeholder="you@example.com"
  //                   />
  //                 </div>
  //                 <PasswordField
  //                   id="native-signin-password"
  //                   label="Password"
  //                   value={password}
  //                   onChange={setPassword}
  //                   autoComplete="current-password"
  //                 />
  //                 <div className="native-auth__forgot-row">
  //                   <button type="button" disabled={busy} onClick={() => setScreen("forgot")}>
  //                     Forgot password?
  //                   </button>
  //                 </div>
  //                 {errorLine}
  //                 <button type="submit" disabled={busy || !email.trim() || !password} className="native-mist">
  //                   {busy ? "Signing in…" : "Sign in"}
  //                 </button>
  //               </form>
  //               <p className="native-auth__centre-link">
  //                 New here?{" "}
  //                 <button type="button" onClick={openSignUp}>
  //                   Create an account
  //                 </button>
  //               </p>
  //             </>
  //           )}
  //         </div>
  //       </section>
  //       {busy ? <div className="native-busy" role="status" aria-label="Signing in" /> : null}
  //     </div>
  //   );
  // } else   {
  //   body = (
  //   <div
  //     className={[
  //       "auth-split",
  //       "auth-split--native",
  //       opening ? "auth-split--opening" : "",
  //     ]
  //       .filter(Boolean)
  //       .join(" ")}
  //   >
  //     <AuthBand
  //       headline={
  //         <>
  //           <span className="native-auth__headline-line">Become who you</span>
  //           <span className="native-auth__headline-line">
  //             <em className="auth-split__accent-word">said</em> you’d be.
  //           </span>
  //         </>
  //       }
  //       subline="The app that catalyses personal transformation."
  //     />
  //     <section className="auth-split__panel">
  //       <div className="auth-split__panel-inner native-auth__form">
  //         {!base ? (
  //           <p className="text-sm text-muted">
  //             Set <code className="rounded bg-surface-2 px-1 py-0.5">VITE_MEDIMADE_API_URL</code> to
  //             enable sign-up.
  //           </p>
  //         ) : (
  //           <>
  //             <div className="native-signin__providers">{providerButtons}</div>
  //             <div className="native-divider">
  //               <span />
  //               or with email
  //               <span />
  //             </div>
  //             <form className="native-auth__form" onSubmit={(e) => void onSignUp(e)}>
  //               <div className="native-auth__field">
  //                 <label htmlFor="native-signup-email">Email</label>
  //                 <input
  //                   id="native-signup-email"
  //                   type="email"
  //                   autoComplete="email"
  //                   autoCapitalize="none"
  //                   required
  //                   value={email}
  //                   onChange={(e) => setEmail(e.target.value.toLowerCase())}
  //                   placeholder="you@example.com"
  //                 />
  //               </div>
  //               <PasswordField
  //                 id="native-signup-password"
  //                 label="Password"
  //                 value={password}
  //                 onChange={setPassword}
  //                 autoComplete="new-password"
  //                 placeholder="At least 8 characters"
  //                 hint="8+ characters, with upper and lower case and a number."
  //               />
  //               {errorLine}
  //               <button type="submit" disabled={busy || !email.trim() || !password} className="native-mist">
  //                 {busy ? "Creating…" : "Create my account"}
  //               </button>
  //             </form>
  //             <p className="native-auth__centre-link">
  //               Already have an account?{" "}
  //               <button type="button" onClick={openSignIn}>
  //                 Sign in
  //               </button>
  //             </p>
  //             <TermsLine />
  //           </>
  //         )}
  //       </div>
  //     </section>
  //     {busy ? <div className="native-busy" role="status" aria-label="Working" /> : null}
  //   </div>
  //   );
  // }

  return (
    <AuthShell
      phase={openPhase}
      onPhase={setOpenPhase}
      exiting={exiting}
      reduceMotion={reduceMotion}
      step={screen}
    >
      {body}
    </AuthShell>
  );
}

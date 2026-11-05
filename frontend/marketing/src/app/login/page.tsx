"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CognitoAuthForm,
  type CognitoAuthMode,
} from "@/components/cognito-auth-form";
import { LogoMark } from "@/components/logo-mark";
import {
  BookMarked,
  BookOpen,
  Fingerprint,
  Focus,
  Heart,
  LayoutGrid,
  UserRoundKey,
} from "lucide-react";
import { BRAND_LOCKUP_INNER } from "@/lib/brand-lockup-markup";
import {
  ASSUMED_COGNITO_AUTH_CONFIG,
  fetchCognitoAuthConfig,
  getCachedCognitoAuthConfig,
  getMedimadeApiBase,
  requestMedimadeMagicLink,
  type AuthEmailCheck,
  type CognitoAuthConfig,
} from "@/lib/medimade-api";
import { establishCognitoSession } from "@/lib/cognito-auth";
import { isAppleCancel, signInWithAppleWeb } from "@/lib/apple-web-sign-in";
import { mountGoogleWebButton } from "@/lib/google-web-sign-in";
import { asCognitoAuthTokens } from "@/lib/cognito-direct-auth";
import {
  rememberAuthAppReturn,
  rememberAuthNext,
  safeAppReturn,
  safeAuthNext,
  postAuthDestination,
} from "@/lib/app-routes";
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

// Mobile footer chips (commented out with the footer below).
// const WAITING_CHIPS = [
//   "Personalised meditations",
//   "Personal manifesto",
//   "Vision board",
//   "Smart journal",
//   "Goal planner",
//   "Focus sessions",
//   "A coach on call",
// ] as const;

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

/** Below the desktop split (1024px), /login is laid out like the native app. */
const NATIVE_LAYOUT_QUERY = "(max-width: 1023.98px)";

function subscribeNativeLayout(onChange: () => void) {
  const mq = window.matchMedia(NATIVE_LAYOUT_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useNativeLayout(): boolean {
  return useSyncExternalStore(
    subscribeNativeLayout,
    () => window.matchMedia(NATIVE_LAYOUT_QUERY).matches,
    () => false,
  );
}

const noopSubscribe = () => () => {};

/** False in the server HTML, where the layout isn't known yet. */
function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Band height change between steps (consciously-native-band-consistent-v3). */
const BAND_EASE = "cubic-bezier(.2, .8, .2, 1)";
const BAND_MS = 250;
const COPY_FADE_MS = 150;

type BandSnapshot = { step: string; height: number; copy: HTMLElement | null };

/** Same as the native app's What's inside: information, not tappable. */
const WHATS_INSIDE: { label: string; icon: React.ReactNode }[] = [
  {
    label: "Personalised meditations",
    icon: (
      <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
        <circle cx="12" cy="6" r="2" />
        <path d="M21 16v-2c-2.24 0-4.16-.96-5.6-2.68l-1.34-1.6A1.98 1.98 0 0 0 12.53 9h-1.05c-.59 0-1.15.26-1.53.72l-1.34 1.6C7.16 13.04 5.24 14 3 14v2c2.77 0 5.19-1.17 7-3.25V15l-3.88 1.55c-.67.27-1.12.93-1.12 1.66C5 19.2 5.8 20 6.79 20H9v-.5a2.5 2.5 0 0 1 2.5-2.5h3c.28 0 .5.22.5.5s-.22.5-.5.5h-3c-.83 0-1.5.67-1.5 1.5v.5h7.21c.99 0 1.79-.8 1.79-1.79 0-.73-.45-1.39-1.12-1.66L14 15v-2.25c1.81 2.08 4.23 3.25 7 3.25z" />
      </svg>
    ),
  },
  { label: "Vision board", icon: <LayoutGrid aria-hidden width={16} height={16} strokeWidth={1.75} /> },
  { label: "Stories of your future self", icon: <BookMarked aria-hidden width={16} height={16} strokeWidth={1.75} /> },
  { label: "Journal", icon: <BookOpen aria-hidden width={16} height={16} strokeWidth={1.75} /> },
  { label: "Heal", icon: <Heart aria-hidden width={16} height={16} strokeWidth={1.75} /> },
  { label: "Focus", icon: <Focus aria-hidden width={16} height={16} strokeWidth={1.75} /> },
];

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

function AuthSecondaryButton({
  disabled,
  onClick,
  apple = false,
  native = false,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  /** Apple's black Sign in with Apple button. */
  apple?: boolean;
  /** Native app's pill (mobile layout). */
  native?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        native
          ? `native-provider native-provider--${apple ? "apple" : "outline"}`
          : apple
          ? "flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-black bg-black px-4 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:min-h-[52px]"
          : "flex min-h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-marketing-card-border bg-background px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50 sm:min-h-[52px]"
      }
    >
      {children}
    </button>
  );
}

/** Mobile: the native app's outlined lockup + sun glow. Desktop: the header lockup. */
function AuthBrandLockupMarks() {
  return (
    <>
      <span className="auth-split__lockup-mobile auth-native-lockup" aria-label="consciously">
        <span className="auth-native-lockup__glow" aria-hidden />
        <span aria-hidden dangerouslySetInnerHTML={{ __html: BRAND_LOCKUP_INNER }} />
      </span>
      {/* Previous mobile lockup:
      <LogoMark size={28} className="shrink-0 text-[color:var(--header-gold,#d9b87c)] lg:hidden" /> */}
      <span className="auth-split__lockup-desktop inline-flex items-center gap-3">
        <LogoMark size={34} className="shrink-0 text-[color:var(--header-gold,#d9b87c)]" />
        <span className="brand-wordmark font-display text-[28px] font-medium tracking-tight lowercase">
          consciously
        </span>
      </span>
    </>
  );
}

function AuthBrandLockup() {
  return (
    <Link href="/" className="auth-split__lockup relative z-[1] inline-flex items-center">
      <AuthBrandLockupMarks />
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

function NativeTermsLine() {
  return (
    <p className="native-auth__terms">
      By continuing you agree to our{" "}
      <Link href="/terms" target="_blank">Terms</Link> and{" "}
      <Link href="/privacy" target="_blank">Privacy Policy</Link>.
    </p>
  );
}

function TermsLine({ className = "" }: { className?: string }) {
  return (
    <p className={`text-center text-xs leading-relaxed text-muted ${className}`.trim()}>
      By continuing you agree to our{" "}
      <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-foreground">
        Terms
      </Link>{" "}
      and{" "}
      <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeAuthNext(searchParams.get("next"), "/");
  const appReturn = safeAppReturn(searchParams.get("appReturn"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [cognitoBusy, setCognitoBusy] = useState(false);
  // Email-first: /login and /login?mode=signup both start at Continue.
  const [authMode, setAuthMode] = useState<CognitoAuthMode>("continue");
  const [brandKind, setBrandKind] = useState<BrandKind>("signup");
  const [account, setAccount] = useState<AuthEmailCheck | null>(null);
  const formControl = useRef<((mode: CognitoAuthMode) => void) | null>(null);
  const googleHost = useRef<HTMLDivElement | null>(null);
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
  const primaryStep =
    authMode === "continue" || authMode === "signin" || authMode === "signup";
  const showPrimaryForms = primaryStep || Boolean(passkeyOffer);
  const nativeLayout = useNativeLayout();
  const hydrated = useHydrated();
  const rootRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<BandSnapshot | null>(null);
  const bandStep = passkeyOffer ? "passkey" : sent ? "sent" : authMode;

  // Mobile, after every render: if the step changed, ease the form from the old band
  // height to the new one and cross-fade the headline; then snapshot this band.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const band = root?.querySelector<HTMLElement>(".auth-split__brand");
    if (!root || !band || !nativeLayout) {
      bandRef.current = null;
      return;
    }
    const panel = root.querySelector<HTMLElement>(".auth-split__panel");
    const copy = band.querySelector<HTMLElement>(".auth-split__brand-copy--mobile");
    const height = band.getBoundingClientRect().height;
    const prev = bandRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prev && prev.step !== bandStep && !reduce) {
      const delta = prev.height - height;
      if (panel && Math.abs(delta) > 0.5) {
        panel.animate(
          [{ transform: `translateY(${delta}px)` }, { transform: "translateY(0px)" }],
          { duration: BAND_MS, easing: BAND_EASE },
        );
      }
      if (prev.copy && copy) {
        const ghost = prev.copy;
        band.appendChild(ghost);
        ghost
          .animate([{ opacity: 1 }, { opacity: 0 }], { duration: COPY_FADE_MS, fill: "forwards" })
          .finished.catch(() => undefined)
          .finally(() => ghost.remove());
        copy.animate(
          [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }],
          { duration: COPY_FADE_MS * 2, easing: "ease-out" },
        );
      }
    }

    let ghost: HTMLElement | null = null;
    if (copy) {
      ghost = copy.cloneNode(true) as HTMLElement;
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        position: "absolute",
        top: `${copy.offsetTop}px`,
        left: `${copy.offsetLeft}px`,
        width: `${copy.offsetWidth}px`,
        margin: "0",
        pointerEvents: "none",
      });
    }
    bandRef.current = { step: bandStep, height, copy: ghost };
  });

  /** Band chevron: one step back, as in the native app. */
  const showBandBack = !passkeyOffer && !sent && authMode !== "continue";
  function bandBack() {
    const go = formControl.current;
    if (!go) return;
    if (authMode === "confirm") go(account?.next === "signin" ? "signin" : "signup");
    else if (authMode === "forgot") go("signin");
    else if (authMode === "reset") go("forgot");
    else go("continue");
  }

  /** Known email → sign-in layout; Continue / new email / code → sign-up layout. */
  const onModeChange = useCallback((mode: CognitoAuthMode) => {
    setAuthMode(mode);
    if (mode === "signin") setBrandKind("signin");
    else if (mode === "continue" || mode === "signup" || mode === "confirm") {
      setBrandKind("signup");
    }
  }, []);

  useLayoutEffect(() => {
    applyColorScheme(resolveAuthColorScheme(searchParams));
  }, [searchParams]);

  useEffect(() => {
    rememberAuthNext(next);
    rememberAuthAppReturn(appReturn);
  }, [next, appReturn]);

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

  async function continueWithApple() {
    const servicesId = cognitoConfig.socialClients?.appleServicesId;
    if (!servicesId) {
      setError("Apple sign-in isn’t set up yet.");
      return;
    }
    setError(null);
    setCognitoBusy(true);
    try {
      rememberAuthNext(next);
      const session = await signInWithAppleWeb(servicesId);
      await goAfterAuth(session.needsProfileName);
    } catch (err) {
      setCognitoBusy(false);
      if (!isAppleCancel(err)) {
        setError(err instanceof Error ? err.message : "Could not sign in with Apple");
      }
    }
  }

  const googleClientId = cognitoConfig.socialClients?.googleWebClientId ?? null;
  const showGoogleButton =
    authMode === "continue" ||
    (authMode === "signin" &&
      account != null &&
      !account.hasPassword &&
      !account.providers.includes("apple") &&
      account.providers.includes("google"));

  // GIS renders its own button; it sits invisibly over ours (see google-web-sign-in.ts).
  useEffect(() => {
    const host = googleHost.current;
    if (!host || !googleClientId || !showGoogleButton || passkeyOffer) return;
    let cancelled = false;
    void mountGoogleWebButton(host, googleClientId, {
      onStart: () => {
        if (cancelled) return;
        setError(null);
        setCognitoBusy(true);
        rememberAuthNext(next);
      },
      onSession: (session) => {
        if (!cancelled) void goAfterAuth(session.needsProfileName);
      },
      onError: (err) => {
        if (cancelled) return;
        setCognitoBusy(false);
        setError(err instanceof Error ? err.message : "Could not sign in with Google");
      },
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      host.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount only when the button appears
  }, [googleClientId, showGoogleButton, passkeyOffer, authMode]);

  const appleButton = (
    <AuthSecondaryButton
      apple
      native={nativeLayout}
      disabled={anyBusy}
      onClick={() => void continueWithApple()}
    >
      <AppleMark />
      Continue with Apple
    </AuthSecondaryButton>
  );

  const googleButton = (
    <div className="relative">
      <AuthSecondaryButton
        native={nativeLayout}
        disabled={anyBusy}
        onClick={() => {
          if (!googleClientId) setError("Google sign-in isn’t set up yet.");
        }}
      >
        <GoogleMark />
        Continue with Google
      </AuthSecondaryButton>
      {googleClientId ? (
        <div
          ref={googleHost}
          aria-hidden
          className={`absolute inset-0 flex scale-y-[1.35] items-center justify-center overflow-hidden opacity-[0.01] ${anyBusy ? "pointer-events-none" : ""}`}
        />
      ) : null}
    </div>
  );

  /** Continue step: Apple above Google, then "or with email". */
  const continueActions = nativeLayout ? (
    <>
      <div className="native-signin__providers">
        {appleButton}
        {googleButton}
      </div>
      <div className="native-divider">
        <span />
        or with email
        <span />
      </div>
    </>
  ) : (
    <>
      {appleButton}
      {googleButton}
      <div className="relative flex items-center gap-3.5 py-0.5 text-[13px] text-muted">
        <span className="h-px flex-1 bg-marketing-card-border" aria-hidden />
        or with email
        <span className="h-px flex-1 bg-marketing-card-border" aria-hidden />
      </div>
    </>
  );

  /** Known email with a passkey. */
  const passkeyActions = nativeLayout ? (
    <>
      <div className="native-divider">
        <span />
        or
        <span />
      </div>
      <AuthSecondaryButton
        native
        disabled={anyBusy}
        onClick={() => void continueWithPasskey()}
      >
        <UserRoundKey aria-hidden className="size-[18px]" strokeWidth={1.8} />
        Sign in with a passkey
      </AuthSecondaryButton>
    </>
  ) : (
    <>
      <div className="relative flex items-center gap-3.5 py-0.5 text-[13px] text-muted">
        <span className="h-px flex-1 bg-marketing-card-border" aria-hidden />
        or
        <span className="h-px flex-1 bg-marketing-card-border" aria-hidden />
      </div>
      <AuthSecondaryButton
        disabled={anyBusy}
        onClick={() => void continueWithPasskey()}
      >
        <Fingerprint aria-hidden className="size-[18px]" strokeWidth={1.8} />
        Sign in with a passkey
      </AuthSecondaryButton>
    </>
  );

  // Superseded by email-first: Google moved to Continue; passkey shows only for known accounts that have one.
  // const quickActions = (
  //   <>
  //     <div …>or</div>
  //     <AuthSecondaryButton onClick={continueWithGoogle /* Cognito Hosted UI */}>Continue with Google</AuthSecondaryButton>
  //     {authMode === "signin" ? <AuthSecondaryButton onClick={continueWithPasskey}>Sign in with a passkey</AuthSecondaryButton> : null}
  //   </>
  // );

  const brandIsSignup = brandKind === "signup";

  const address = email.trim().toLowerCase();
  /** Mobile band copy, word for word from the native app's steps. */
  const [mobileHeadline, mobileSubline]: [React.ReactNode, React.ReactNode] =
    passkeyOffer
      ? ["One more thing.", "Optional. You can also do this later in Settings."]
      : sent
        ? ["Check your inbox.", "We’ve sent a sign-in link. You can close this tab."]
        : authMode === "signin"
          ? [
              <>
                Welcome <em className="auth-split__accent-word">back</em>.
              </>,
              "Enter your password to sign in.",
            ]
          : authMode === "signup"
            ? [
                "Create your account.",
                "No account with this email yet. Choose a password and we’ll send you a code.",
              ]
            : authMode === "confirm"
              ? [
                  "Check your email.",
                  <>
                    We sent a 6-digit code to <strong>{address}</strong>.
                  </>,
                ]
              : authMode === "forgot"
                ? ["Forgot password.", "We’ll email you a reset code."]
                : authMode === "reset"
                  ? [
                      "Choose a new password.",
                      <>
                        Enter the code we sent to <strong>{address}</strong>.
                      </>,
                    ]
                  : [
                      <>
                        <span className="native-auth__headline-line">Become who you</span>
                        <span className="native-auth__headline-line">
                          <em className="auth-split__accent-word">said</em> you’d be.
                        </span>
                      </>,
                      "The app that catalyses personal transformation.",
                    ];

  return (
    <div ref={rootRef} className={hydrated ? "auth-split" : "auth-split auth-split--pending"}>
      <aside className="auth-split__brand" data-mode={brandKind}>
        {showBandBack ? (
          <button
            type="button"
            onClick={bandBack}
            disabled={anyBusy}
            className="native-back"
            aria-label="Back"
          >
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        ) : null}
        <AuthBrandLockup />
        <div className="auth-split__brand-copy auth-split__brand-copy--mobile relative z-[1]">
          <h1 className="auth-split__headline">{mobileHeadline}</h1>
          <p className="auth-split__support">{mobileSubline}</p>
        </div>
        {/* Previous mobile band copy ("This is where you begin." / "Welcome back." with
            the short subline) now shows on desktop only, below. */}
        <div className="auth-split__brand-copy auth-split__brand-copy--desktop relative z-[1]">
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
          {passkeyOffer && nativeLayout ? (
            <div className="native-auth__form">
              <div className="native-auth__card">
                <p className="native-auth__card-title">A passkey instead of a password</p>
                <p className="native-auth__card-body">
                  A passkey lets you sign in with your fingerprint, face or device
                  PIN. It’s saved by your browser or password manager and works in
                  the app too.
                </p>
              </div>
              {error ? (
                <p className="native-auth__error" role="alert" aria-live="polite">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                disabled={anyBusy}
                onClick={() => void setupPasskey()}
                className="native-mist"
              >
                <UserRoundKey aria-hidden className="size-[18px]" strokeWidth={1.8} />
                {cognitoBusy ? "Setting up…" : "Set up a passkey"}
              </button>
              <button
                type="button"
                disabled={anyBusy}
                onClick={() => {
                  skipPasskeyOfferThisSession();
                  void goAfterAuth(passkeyOffer.needsProfileName);
                }}
                className="native-text-link"
              >
                Maybe later
              </button>
            </div>
          ) : passkeyOffer ? (
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
              {authMode === "signin" || authMode === "signup" ? (
                <button
                  type="button"
                  disabled={anyBusy}
                  onClick={() => formControl.current?.("continue")}
                  className="mb-3 hidden min-h-11 lg:inline-flex items-center gap-1.5 text-sm font-medium text-marketing-body transition-colors hover:text-foreground"
                >
                  <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 5l-7 7 7 7" />
                  </svg>
                  Back
                </button>
              ) : null}
              {showPrimaryForms && primaryStep ? (
                <div className="mb-5 hidden lg:block">
                  {authMode === "continue" ? (
                    <>
                      <h2 className="font-display text-4xl font-normal tracking-tight text-marketing-ink">
                        Sign in or create an account
                      </h2>
                      <p className="mt-2 text-base text-marketing-body">
                        Free to start. It takes less than a minute.
                      </p>
                    </>
                  ) : authMode === "signup" ? (
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
                      initialMode="continue"
                      disabled={anyBusy}
                      onModeChange={onModeChange}
                      onEmailChange={setEmail}
                      onAccountCheck={setAccount}
                      controlRef={formControl}
                      layout={nativeLayout ? "native" : "default"}
                      beforeForm={authMode === "continue" ? continueActions : undefined}
                      afterForm={
                        authMode === "signin" && account?.hasPasskey ? (
                          passkeyActions
                        ) : nativeLayout && authMode === "continue" ? (
                          <>
                            <NativeTermsLine />
                            <WhatsInside />
                          </>
                        ) : undefined
                      }
                      providerButton={(provider) =>
                        provider === "apple" ? appleButton : googleButton
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

              {(authMode === "continue" || authMode === "signup") && !sent ? (
                <div className="mt-4 hidden lg:block">
                  <TermsLine />
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Mobile footer replaced by the native layout's Terms line + What's inside.
        {!passkeyOffer && primaryStep && !sent ? (
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
        */}
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
            <div className="auth-split__lockup relative z-[1] inline-flex items-center">
              <AuthBrandLockupMarks />
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

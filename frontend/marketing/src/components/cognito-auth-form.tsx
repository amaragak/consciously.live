"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { CognitoAuthConfig } from "@/lib/medimade-api";
import { fetchCognitoAuthConfig } from "@/lib/medimade-api";
import {
  CognitoIdpError,
  cognitoConfirmForgotPassword,
  cognitoConfirmSignUp,
  cognitoForgotPassword,
  cognitoPasswordSignIn,
  cognitoResendSignUpCode,
  cognitoSignUp,
  isMaskedUnconfirmedSignInError,
  isUnconfirmedUserError,
  isUsernameExistsError,
  type CognitoAuthTokens,
} from "@/lib/cognito-direct-auth";

export type CognitoAuthMode = "signin" | "signup" | "confirm" | "forgot" | "reset";

const RESEND_COOLDOWN_MS = 8000;

const fieldClass =
  "mt-1.5 w-full min-h-12 rounded-xl border border-marketing-card-border bg-background px-4 py-3 text-base text-foreground outline-none transition-[border-color,box-shadow] focus:border-accent/50 focus:ring-2 focus:ring-accent/30 sm:min-h-[52px]";

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
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          required
          value={value}
          placeholder={placeholder}
          onChange={(ev) => onChange(ev.target.value)}
          className={`${fieldClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:text-foreground"
        >
          {show ? (
            <EyeOff aria-hidden className="size-4" strokeWidth={2} />
          ) : (
            <Eye aria-hidden className="size-4" strokeWidth={2} />
          )}
        </button>
      </div>
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function CognitoAuthForm({
  config,
  disabled,
  onAuthenticated,
  hideIntro = false,
  beforeForm,
  afterForm,
  submitVariant = "primary",
  initialMode = "signin",
  onModeChange,
  onEmailChange,
}: {
  config: CognitoAuthConfig;
  disabled?: boolean;
  onAuthenticated: (
    tokens: CognitoAuthTokens,
    meta?: { justCreated?: boolean },
  ) => Promise<void>;
  /** Parent already shows brand / welcome copy for sign-in and sign-up. */
  hideIntro?: boolean;
  /** Google / passkey — rendered below the email form after an “or” divider. */
  beforeForm?: ReactNode;
  /** Google / passkey / divider — rendered after the primary submit button. */
  afterForm?: ReactNode;
  submitVariant?: "primary" | "secondary";
  initialMode?: CognitoAuthMode;
  onModeChange?: (mode: CognitoAuthMode) => void;
  onEmailChange?: (email: string) => void;
}) {
  const [mode, setMode] = useState<CognitoAuthMode>(
    initialMode === "signup" ? "signup" : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [unverifiedExisting, setUnverifiedExisting] = useState(false);
  const [lastSentAt, setLastSentAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const locked = disabled || busy;
  const resendWaitSec = Math.max(
    0,
    Math.ceil((lastSentAt + RESEND_COOLDOWN_MS - now) / 1000),
  );

  function go(next: CognitoAuthMode) {
    setMode(next);
    onModeChange?.(next);
    setError(null);
    setNotice(null);
    setCode("");
    if (next !== "confirm") setUnverifiedExisting(false);
    if (next === "confirm" || next === "reset") {
      setEmail((value) => value.trim().toLowerCase());
    }
  }

  useEffect(() => {
    if (initialMode !== "signin" && initialMode !== "signup") return;
    setMode((current) => {
      if (current === "confirm" || current === "forgot" || current === "reset") {
        return current;
      }
      return initialMode;
    });
  }, [initialMode]);

  useEffect(() => {
    onEmailChange?.(email);
  }, [email, onEmailChange]);

  useEffect(() => {
    if ((mode !== "confirm" && mode !== "reset") || resendWaitSec <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [mode, resendWaitSec]);

  async function resolveConfig(): Promise<CognitoAuthConfig> {
    if (config.clientId?.trim() && config.region?.trim()) return config;
    return fetchCognitoAuthConfig();
  }

  async function sendVerifyEmail(
    kind: "confirm" | "reset",
    address = email,
    cfg?: CognitoAuthConfig,
  ) {
    if (Date.now() - lastSentAt < RESEND_COOLDOWN_MS) return;
    const username = address.trim().toLowerCase();
    setLastSentAt(Date.now());
    setNow(Date.now());
    const active = cfg ?? (await resolveConfig());
    if (kind === "reset") {
      await cognitoForgotPassword(active, username);
      return;
    }
    const result = await cognitoResendSignUpCode(active, username);
    if (!result.pendingVerification) {
      throw new Error("Could not send a verification email for this account.");
    }
  }

  async function finishSignIn(
    pwd: string,
    justCreated = false,
    cfg?: CognitoAuthConfig,
  ) {
    const active = cfg ?? (await resolveConfig());
    const tokens = await cognitoPasswordSignIn(
      active,
      (email ?? "").trim().toLowerCase(),
      pwd,
    );
    await onAuthenticated(tokens, { justCreated });
  }

  /** Same verify + later account-setup path as first-time signup. */
  async function enterVerifyFlow(address: string, cfg?: CognitoAuthConfig) {
    go("confirm");
    setUnverifiedExisting(true);
    try {
      await sendVerifyEmail("confirm", address, cfg);
    } catch (sendErr) {
      setError(
        sendErr instanceof Error
          ? sendErr.message
          : "Could not send the verification email.",
      );
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const username = email.trim().toLowerCase();
    if (username !== email) setEmail(username);
    setBusy(true);
    try {
      const cfg = await resolveConfig();
      if (mode === "signin") {
        try {
          await finishSignIn(password, false, cfg);
          return;
        } catch (signInErr) {
          if (isUnconfirmedUserError(signInErr)) {
            await enterVerifyFlow(username, cfg);
            return;
          }
          if (isMaskedUnconfirmedSignInError(signInErr)) {
            const result = await cognitoResendSignUpCode(cfg, username).catch(
              () => null,
            );
            if (result?.pendingVerification) {
              setLastSentAt(Date.now());
              setNow(Date.now());
              go("confirm");
              setUnverifiedExisting(true);
              return;
            }
          }
          throw signInErr;
        }
      }
      if (mode === "signup") {
        const { confirmed } = await cognitoSignUp(cfg, username, password);
        if (confirmed) {
          await finishSignIn(password, true, cfg);
          return;
        }
        go("confirm");
        setUnverifiedExisting(false);
        try {
          await sendVerifyEmail("confirm", username, cfg);
        } catch (sendErr) {
          setError(
            sendErr instanceof Error
              ? sendErr.message
              : "Could not send the verification email.",
          );
        }
        return;
      }
      if (mode === "confirm") {
        await cognitoConfirmSignUp(cfg, username, code);
        await finishSignIn(password, true, cfg);
        return;
      }
      if (mode === "forgot") {
        await cognitoForgotPassword(cfg, username);
        go("reset");
        return;
      }
      await cognitoConfirmForgotPassword(cfg, username, code, password);
      await finishSignIn(password, false, cfg);
    } catch (err) {
      if (mode === "signup" && isUsernameExistsError(err)) {
        try {
          const cfg = await resolveConfig();
          await finishSignIn(password, true, cfg);
          return;
        } catch (signInErr) {
          if (isUnconfirmedUserError(signInErr)) {
            await enterVerifyFlow(username);
            return;
          }
          if (isMaskedUnconfirmedSignInError(signInErr)) {
            const cfg = await resolveConfig();
            const result = await cognitoResendSignUpCode(cfg, username).catch(
              () => null,
            );
            if (result?.pendingVerification) {
              setLastSentAt(Date.now());
              setNow(Date.now());
              go("confirm");
              setUnverifiedExisting(true);
              return;
            }
          }
        }
        setError("An account with this email already exists. Sign in instead.");
        return;
      }
      setError(
        err instanceof CognitoIdpError || err instanceof Error
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    if (resendWaitSec > 0) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await sendVerifyEmail(mode === "reset" ? "reset" : "confirm");
      setNotice("New code sent.");
    } catch (err) {
      setLastSentAt(0);
      setError(err instanceof Error ? err.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  }

  const submitLabel =
    mode === "signup"
      ? "Create my account"
      : mode === "confirm"
        ? "Confirm and continue"
        : mode === "forgot"
          ? "Send reset code"
          : mode === "reset"
            ? "Save new password"
            : "Sign in";

  const heading =
    mode === "signup"
      ? "Create your account"
      : mode === "confirm"
        ? unverifiedExisting
          ? "Verify your email"
          : "Check your inbox"
        : mode === "forgot"
          ? "Forgot password?"
          : mode === "reset"
            ? "Choose a new password"
            : "Sign in";

  const emailLabel = email.trim().toLowerCase();
  const sub =
    mode === "signup"
      ? "Free to start. It takes less than a minute."
      : mode === "confirm"
        ? unverifiedExisting
          ? `This email is already registered, but it isn’t verified yet. Enter the code we sent to ${emailLabel || "you"} to finish creating your account.`
          : emailLabel
            ? `We’ve sent a code to ${emailLabel}. It is valid for 24 hours.`
            : "Enter the code we sent you."
        : mode === "forgot"
          ? "We’ll email a code so you can reset it."
          : mode === "reset"
            ? emailLabel
              ? `We sent a reset code to ${emailLabel}. Choose a new password.`
              : "Choose a new password, then you’re in."
            : "Good to see you again.";

  const showIntro =
    !hideIntro || (mode !== "signin" && mode !== "signup");
  const showQuickActions =
    Boolean(beforeForm || afterForm) && (mode === "signin" || mode === "signup");
  const errorId = "auth-form-error";

  return (
    <div className="w-full">
      {showIntro ? (
        <div className="mb-5">
          <h2 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-marketing-ink sm:text-3xl">
            {heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-marketing-body sm:text-base">
            {sub}
          </p>
        </div>
      ) : null}

      {showQuickActions && beforeForm ? (
        <div className="mb-4 space-y-3">{beforeForm}</div>
      ) : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-3.5"
        noValidate={false}
      >
        {mode !== "confirm" && mode !== "reset" ? (
          <div>
            <label
              htmlFor="auth-email"
              className="block text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value.toLowerCase())}
              onBlur={() => setEmail((value) => value.trim().toLowerCase())}
              className={fieldClass}
              placeholder="you@example.com"
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        ) : null}

        {mode === "confirm" || mode === "reset" ? (
          <div>
            <label
              htmlFor="auth-code"
              className="block text-sm font-medium text-foreground"
            >
              Code
            </label>
            <input
              id="auth-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(ev) => setCode(ev.target.value)}
              className={fieldClass}
              placeholder="6-digit code"
              aria-describedby={error ? errorId : undefined}
            />
          </div>
        ) : null}

        {mode === "signin" || mode === "signup" || mode === "reset" ? (
          <PasswordField
            id="auth-password"
            label={mode === "reset" ? "New password" : "Password"}
            value={password}
            onChange={setPassword}
            autoComplete={
              mode === "signup" || mode === "reset"
                ? "new-password"
                : "current-password"
            }
            placeholder={
              mode === "signup" || mode === "reset"
                ? "At least 8 characters"
                : undefined
            }
            hint={
              mode === "signup" || mode === "reset"
                ? "8+ characters, with upper and lower case and a number."
                : undefined
            }
          />
        ) : null}

        {mode === "signin" ? (
          <div className="flex justify-end">
            <button
              type="button"
              disabled={locked}
              onClick={() => go("forgot")}
              className="min-h-11 text-sm font-medium text-accent-link underline-offset-2 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        ) : null}

        {notice && !/^we sent a (reset )?code to /i.test(notice) ? (
          <p className="text-sm text-foreground" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} className="text-sm text-danger" role="alert" aria-live="polite">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={locked}
          className={
            submitVariant === "secondary"
              ? "mt-1 flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-full border border-marketing-card-border bg-background px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
              : "mt-1 flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-full accent-fill-gradient px-4 text-base font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          }
        >
          {busy ? "Working…" : submitLabel}
        </button>
      </form>

      {showQuickActions && afterForm && !beforeForm ? (
        <div className="mt-5 space-y-3">{afterForm}</div>
      ) : null}

      {mode === "confirm" || mode === "reset" ? (
        <button
          type="button"
          disabled={locked || resendWaitSec > 0}
          onClick={() => void resendCode()}
          className="mt-4 min-h-11 w-full text-center text-sm font-medium text-accent-link underline-offset-2 hover:underline disabled:no-underline disabled:opacity-50"
        >
          {resendWaitSec > 0 ? `Resend code in ${resendWaitSec}s` : "Resend code"}
        </button>
      ) : null}

      <p className="mt-5 text-center text-[15px] text-marketing-body">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button
              type="button"
              disabled={locked}
              onClick={() => go("signup")}
              className="font-semibold text-accent-link underline-offset-2 hover:underline"
            >
              Create an account
            </button>
          </>
        ) : mode === "signup" ? (
          <>
            Already have an account?{" "}
            <button
              type="button"
              disabled={locked}
              onClick={() => go("signin")}
              className="font-semibold text-accent-link underline-offset-2 hover:underline"
            >
              Sign in
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={locked}
            onClick={() => go("signin")}
            className="font-semibold text-accent-link underline-offset-2 hover:underline"
          >
            Back to sign in
          </button>
        )}
      </p>
    </div>
  );
}

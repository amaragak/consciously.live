"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { CognitoAuthConfig } from "@/lib/medimade-api";
import {
  CognitoIdpError,
  cognitoConfirmForgotPassword,
  cognitoConfirmSignUp,
  cognitoForgotPassword,
  cognitoPasswordSignIn,
  cognitoResendSignUpCode,
  cognitoSignUp,
  isUnconfirmedUserError,
  isUsernameExistsError,
} from "@/lib/cognito-direct-auth";

export type CognitoAuthMode = "signin" | "signup" | "confirm" | "forgot" | "reset";

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-marketing-card-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-[border-color,box-shadow] focus:border-gold/70 focus:ring-1 focus:ring-gold/40";

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
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
          onChange={(ev) => onChange(ev.target.value)}
          className={`${fieldClass} pr-11`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-foreground"
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
  afterForm,
  submitVariant = "primary",
  onModeChange,
}: {
  config: CognitoAuthConfig;
  disabled?: boolean;
  onAuthenticated: (
    idToken: string,
    meta?: { justCreated?: boolean },
  ) => Promise<void>;
  /** Parent already shows brand / welcome copy. */
  hideIntro?: boolean;
  afterForm?: ReactNode;
  submitVariant?: "primary" | "secondary";
  onModeChange?: (mode: CognitoAuthMode) => void;
}) {
  const [mode, setMode] = useState<CognitoAuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const locked = disabled || busy;

  function go(next: CognitoAuthMode) {
    setMode(next);
    onModeChange?.(next);
    setError(null);
    setNotice(null);
    setCode("");
    if (next === "confirm" || next === "reset") {
      setEmail((value) => value.trim().toLowerCase());
    }
  }

  async function finishSignIn(pwd: string, justCreated = false) {
    const tokens = await cognitoPasswordSignIn(config, email.trim().toLowerCase(), pwd);
    await onAuthenticated(tokens.idToken, { justCreated });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const username = email.trim().toLowerCase();
    if (username !== email) setEmail(username);
    setBusy(true);
    try {
      if (mode === "signin") {
        await finishSignIn(password);
        return;
      }
      if (mode === "signup") {
        const { confirmed } = await cognitoSignUp(config, username, password);
        if (confirmed) {
          await finishSignIn(password, true);
          return;
        }
        go("confirm");
        return;
      }
      if (mode === "confirm") {
        await cognitoConfirmSignUp(config, username, code);
        await finishSignIn(password, true);
        return;
      }
      if (mode === "forgot") {
        await cognitoForgotPassword(config, username);
        go("reset");
        return;
      }
      await cognitoConfirmForgotPassword(config, username, code, password);
      await finishSignIn(password);
    } catch (err) {
      if (mode === "signin" && isUnconfirmedUserError(err)) {
        go("confirm");
        setNotice("Confirm your email to finish creating this account.");
        try {
          await cognitoResendSignUpCode(config, username);
        } catch {
          /* code may already be valid */
        }
        return;
      }
      if (mode === "signup" && isUsernameExistsError(err)) {
        setError(err instanceof Error ? err.message : "Account already exists.");
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
    setError(null);
    setBusy(true);
    try {
      if (mode === "reset") {
        await cognitoForgotPassword(config, email.trim().toLowerCase());
      } else {
        await cognitoResendSignUpCode(config, email.trim().toLowerCase());
      }
      setNotice("New code sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code.");
    } finally {
      setBusy(false);
    }
  }

  const submitLabel =
    mode === "signup"
      ? "Create account"
      : mode === "confirm"
        ? "Confirm and continue"
        : mode === "forgot"
          ? "Send reset code"
          : mode === "reset"
            ? "Save new password"
            : "Sign in";

  const heading =
    mode === "signup"
      ? "Create an account"
      : mode === "confirm"
        ? "Check your email"
        : mode === "forgot" || mode === "reset"
          ? "Reset your password"
          : "Welcome in.";

  const emailLabel = email.trim().toLowerCase();
  const sub =
    mode === "signup"
      ? "Your library and journal stay with this email."
      : mode === "confirm"
        ? emailLabel
          ? `We sent a code to ${emailLabel}. It is valid for 24 hours.`
          : "Enter the code we sent you."
        : mode === "forgot"
          ? "We’ll email a code to reset it."
          : mode === "reset"
            ? emailLabel
              ? `We sent a reset code to ${emailLabel}. Choose a new password.`
              : "Choose a new password, then you’re in."
            : "Sign in to your library and journal.";

  const showIntro = !hideIntro || mode !== "signin";
  const showQuickActions = Boolean(afterForm) && (mode === "signin" || mode === "signup");

  return (
    <div>
      {showIntro ? (
        <>
          <h2 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-marketing-ink sm:text-3xl">
            {heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-marketing-body">{sub}</p>
        </>
      ) : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="mt-6 space-y-3.5"
      >
        {mode !== "confirm" && mode !== "reset" ? (
          <div>
            <label htmlFor="auth-email" className="block text-sm font-medium text-foreground">
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
            />
          </div>
        ) : null}

        {mode === "confirm" || mode === "reset" ? (
          <div>
            <label htmlFor="auth-code" className="block text-sm font-medium text-foreground">
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
              className="text-xs font-medium text-accent-link underline-offset-2 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        ) : null}

        {notice && !/^we sent a (reset )?code to /i.test(notice) ? (
          <p className="text-sm text-foreground">{notice}</p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={locked}
          className={
            submitVariant === "secondary"
              ? "mt-1 w-full cursor-pointer rounded-xl border border-marketing-card-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
              : "mt-1 w-full cursor-pointer rounded-xl accent-fill-gradient px-4 py-2.5 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          }
        >
          {busy ? "Working…" : submitLabel}
        </button>
      </form>

      {showQuickActions ? afterForm : null}

      {mode === "confirm" || mode === "reset" ? (
        <button
          type="button"
          disabled={locked}
          onClick={() => void resendCode()}
          className="mt-4 w-full text-center text-xs font-medium text-accent-link underline-offset-2 hover:underline"
        >
          Resend code
        </button>
      ) : null}

      <p className="mt-6 text-center text-sm text-muted">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button
              type="button"
              disabled={locked}
              onClick={() => go("signup")}
              className="font-medium text-accent-link underline-offset-2 hover:underline"
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
              className="font-medium text-accent-link underline-offset-2 hover:underline"
            >
              Sign in
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={locked}
            onClick={() => go("signin")}
            className="font-medium text-accent-link underline-offset-2 hover:underline"
          >
            Back to sign in
          </button>
        )}
      </p>
    </div>
  );
}

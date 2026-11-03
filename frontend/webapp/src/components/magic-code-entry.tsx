import { useState } from "react";
import { setMedimadeSession } from "@/lib/auth-session";
import { verifyMedimadeMagicCode } from "@/lib/medimade-api";

/** "Or enter the 6-digit code" under a sent magic link. Sets the session on success. */
export function MagicCodeEntry({
  email,
  onSignedIn,
}: {
  email: string;
  onSignedIn: (needsProfileName: boolean) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await verifyMedimadeMagicCode(email, value);
      setMedimadeSession(
        session.token,
        session.email,
        session.displayName,
        session.refreshToken ?? null,
      );
      onSignedIn(session.needsProfileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn’t work");
      setBusy(false);
    }
  }

  return (
    <form
      className="mt-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
    >
      <label htmlFor="magic-code" className="block text-sm font-medium text-foreground">
        Or enter the 6-digit code from the email
      </label>
      <input
        id="magic-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        disabled={busy}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, 6);
          setCode(next);
          if (next.length === 6) void verify(next);
        }}
        placeholder="000000"
        className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-xl tracking-[0.4em] tabular-nums outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="submit"
        disabled={busy || code.length !== 6}
        className="flex min-h-[48px] w-full items-center justify-center rounded-full accent-fill-gradient px-4 text-base font-semibold text-on-accent disabled:opacity-50"
      >
        {busy ? "Checking…" : "Sign in with code"}
      </button>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

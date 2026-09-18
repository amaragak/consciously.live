import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { completeCognitoHostedLogin } from "@/lib/cognito-auth";
import { setMedimadeSession } from "@/lib/medimade-api";

/**
 * Cognito Hosted UI return URL for app.consciously.live / localhost:5173.
 * Marketing login is the primary entry; this keeps the registered callback alive.
 */
export function CognitoCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err =
      searchParams.get("error_description") || searchParams.get("error");
    if (err) {
      setError(err);
      return;
    }
    const code = searchParams.get("code")?.trim() ?? "";
    if (!code) {
      setError("Missing authorization code. Start again from sign-in.");
      return;
    }
    const state = searchParams.get("state");
    let cancelled = false;
    void (async () => {
      try {
        const { session, next } = await completeCognitoHostedLogin(code, state);
        if (cancelled) return;
        setMedimadeSession(
          session.token,
          session.email,
          session.displayName,
          session.refreshToken ?? null,
        );
        navigate(next && next.startsWith("/") ? next : "/", { replace: true });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-16">
        <h1 className="text-xl font-semibold">Sign-in failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link to="/login" className="mt-6 text-sm underline underline-offset-2">
          Back to sign-in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-16">
      <p className="text-sm text-muted-foreground">Finishing sign-in…</p>
    </main>
  );
}

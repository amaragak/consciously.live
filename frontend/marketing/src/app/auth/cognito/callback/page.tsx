"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { completeCognitoHostedLogin } from "@/lib/cognito-auth";
import { setMedimadeSession } from "@/lib/medimade-api";
import { postAuthDestination, safeAuthNext } from "@/lib/app-routes";
import { navigateAuthDestination } from "@/lib/spa-handoff";

type Phase = "working" | "err";

async function goPostAuth(
  router: ReturnType<typeof useRouter>,
  next: string,
): Promise<void> {
  const dest = postAuthDestination(safeAuthNext(next, "/"));
  if (/^https?:\/\//i.test(dest)) {
    const ok = await navigateAuthDestination(dest);
    if (!ok) router.replace("/");
    return;
  }
  router.replace(dest);
}

function CognitoCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phase, setPhase] = useState<Phase>("working");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const err =
      searchParams.get("error_description") || searchParams.get("error");
    if (err) {
      setPhase("err");
      setMessage(err);
      return;
    }
    const code = searchParams.get("code")?.trim() ?? "";
    if (!code) {
      setPhase("err");
      setMessage("Missing authorization code. Start again from sign-in.");
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
        if (session.needsProfileName) {
          router.replace(
            `/auth/complete-profile?next=${encodeURIComponent(next || "/")}`,
          );
          return;
        }
        await goPostAuth(router, next || "/");
      } catch (e) {
        if (cancelled) return;
        setPhase("err");
        setMessage(e instanceof Error ? e.message : "Sign-in failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-16">
      {phase === "working" ? (
        <p className="text-sm text-muted">Finishing sign-in…</p>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-foreground">Sign-in failed</h1>
          <p className="mt-2 text-sm text-muted">{message}</p>
          <Link
            href="/login"
            className="mt-6 text-sm text-accent-link underline-offset-2 hover:underline"
          >
            Back to sign-in
          </Link>
        </>
      )}
    </main>
  );
}

export default function CognitoCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center px-4 py-16">
          <p className="text-sm text-muted">Finishing sign-in…</p>
        </main>
      }
    >
      <CognitoCallbackInner />
    </Suspense>
  );
}

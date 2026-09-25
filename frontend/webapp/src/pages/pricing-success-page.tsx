import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ensureMedimadeSession,
  refreshMedimadeSessionRemote,
  setMedimadeSession,
} from "@/lib/medimade-api";
import { getSessionPrivileges } from "@/lib/session-privileges";

/**
 * Stripe returns here after Checkout. Refresh JWT so plan=create|pro sticks.
 */
export function PricingSuccessPage() {
  const [plan, setPlan] = useState(getSessionPrivileges().plan);
  const [status, setStatus] = useState<"working" | "ok" | "error">("working");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureMedimadeSession({ force: true });
        const refreshed = await refreshMedimadeSessionRemote();
        if (refreshed.status === "ok" && refreshed.token) {
          setMedimadeSession(
            refreshed.token,
            refreshed.email ?? null,
            refreshed.displayName ?? null,
            refreshed.refreshToken ?? null,
          );
        }
        // Webhook may lag a second behind redirect — brief retry.
        for (let i = 0; i < 4; i++) {
          await ensureMedimadeSession({ force: true });
          const p = getSessionPrivileges().plan;
          if (!cancelled) setPlan(p);
          if (p === "create" || p === "pro") break;
          await new Promise((r) => setTimeout(r, 800));
        }
        if (!cancelled) setStatus("ok");
      } catch (e) {
        if (!cancelled) {
          setStatus("error");
          setDetail(e instanceof Error ? e.message : "Could not refresh session");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const label =
    plan === "pro" ? "Pro" : plan === "create" ? "Create" : "your account";

  return (
    <div className="mx-auto flex min-h-[50vh] w-full max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="font-display text-3xl font-medium tracking-tight text-foreground">
        {status === "working" ? "Confirming your upgrade…" : "You're in."}
      </h1>
      <p className="mt-3 text-base text-muted">
        {status === "working"
          ? "Finishing Stripe checkout and updating your plan."
          : status === "ok"
            ? `Welcome to ${label}. Your session is ready.`
            : detail || "Payment may have succeeded — try refreshing in a moment."}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/meditate/create"
          className="inline-flex rounded-full accent-fill-gradient px-6 py-2.5 text-sm font-semibold text-on-accent"
        >
          Start creating
        </Link>
        <Link
          to="/pricing"
          className="text-sm font-medium text-muted underline-offset-2 hover:underline"
        >
          Back to plans
        </Link>
      </div>
    </div>
  );
}

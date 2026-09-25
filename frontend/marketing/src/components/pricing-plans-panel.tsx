"use client";

import { useEffect, useState } from "react";
import {
  createBillingCheckoutSession,
  ensureMedimadeSession,
  getMedimadeSessionJwt,
  type BillingPriceKey,
} from "@/lib/medimade-api";
import {
  getSessionPrivileges,
  type ConsciouslyPlan,
} from "@/lib/session-privileges";

type TierId = "essentials" | BillingPriceKey;

type Tier = {
  id: TierId;
  name: string;
  blurb: string;
  price: string;
  priceNote: string;
  cta: string;
  popular?: boolean;
  features: string[];
  excluded?: string[];
};

const TIERS: Tier[] = [
  {
    id: "essentials",
    name: "Essentials",
    blurb: "Reflect, plan, and focus — plus listen to community and program sessions.",
    price: "Free",
    priceNote: "No personal meditation generation",
    cta: "Continue free",
    features: [
      "Journal — entries, gratitudes, insights",
      "Manifest — life areas, vision, goals",
      "Focus — stay with one thing",
      "Community & program meditations",
      "Library listening for shared sessions",
    ],
    excluded: ["Personal meditation generation", "Chat"],
  },
  {
    id: "create",
    name: "Create",
    blurb: "Everything in Essentials, plus make your own guided meditations.",
    price: "Create",
    priceNote: "Most popular · billed via Stripe",
    cta: "Upgrade to Create",
    popular: true,
    features: [
      "Everything in Essentials",
      "Generate personal meditations",
      "Create from type, chat, journal, ideate, or prompt",
      "Your private library of creations",
      "Voices & sound mixes for your sessions",
    ],
    excluded: ["Chat companion"],
  },
  {
    id: "pro",
    name: "Pro",
    blurb: "Chat across the suite, plus room for more personal generations.",
    price: "Pro",
    priceNote: "Chat + higher generation limits",
    cta: "Go Pro",
    features: [
      "Everything in Create",
      "Chat — reflect and act in one thread",
      "Extra personal meditation generations",
      "Priority when the queue is busy",
    ],
  },
];

function planRank(plan: ConsciouslyPlan): number {
  if (plan === "pro") return 3;
  if (plan === "create") return 2;
  return 1;
}

function loginHrefForCheckout(priceKey: BillingPriceKey): string {
  const next = `/pricing?checkout=${priceKey}`;
  return `/login?next=${encodeURIComponent(next)}`;
}

/**
 * In-app / marketing pricing cards with Stripe Checkout for Create + Pro.
 */
export function PricingPlansPanel({
  variant = "app",
  autoCheckout,
  onEssentials,
  loginHrefBuilder = loginHrefForCheckout,
}: {
  variant?: "app" | "marketing";
  /** Start checkout for this key once session is ready (post-signup). */
  autoCheckout?: BillingPriceKey | null;
  onEssentials?: () => void;
  loginHrefBuilder?: (priceKey: BillingPriceKey) => string;
}) {
  const [plan, setPlan] = useState<ConsciouslyPlan>("free");
  const [busyKey, setBusyKey] = useState<BillingPriceKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const sync = () => {
      setPlan(getSessionPrivileges().plan);
      setSignedIn(Boolean(getMedimadeSessionJwt()));
    };
    sync();
    void ensureMedimadeSession().then(() => sync());
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  const startCheckout = async (priceKey: BillingPriceKey) => {
    setError(null);
    setBusyKey(priceKey);
    try {
      const session = await ensureMedimadeSession();
      if (!session?.token) {
        window.location.href = loginHrefBuilder(priceKey);
        return;
      }
      const origin = window.location.origin;
      const { url } = await createBillingCheckoutSession({
        priceKey,
        successUrl: `${origin}/pricing/success?plan=${priceKey}`,
        cancelUrl: `${origin}/pricing?cancelled=1&plan=${priceKey}`,
      });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start checkout");
      setBusyKey(null);
    }
  };

  useEffect(() => {
    if (!autoCheckout) return;
    void startCheckout(autoCheckout);
    // intentionally once when autoCheckout is set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckout]);

  const shell =
    variant === "marketing"
      ? "home-hero home-hero--product w-full px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16"
      : "w-full px-4 py-10 sm:px-6 sm:py-12";

  return (
    <div className={shell}>
      <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
        {variant === "marketing" ? (
          <p className="font-display text-2xl font-medium tracking-tight text-marketing-ink sm:text-3xl">
            Consciously
          </p>
        ) : null}
        <h1
          className={`max-w-3xl font-display font-medium leading-tight tracking-tight ${
            variant === "marketing"
              ? "mt-3 text-3xl text-marketing-ink sm:text-4xl md:text-[2.75rem]"
              : "text-3xl text-foreground sm:text-4xl"
          }`}
        >
          Simple plans for how you show up.
        </h1>
        <p
          className={`mt-4 max-w-xl text-base leading-relaxed sm:text-lg ${
            variant === "marketing" ? "text-marketing-body" : "text-muted"
          }`}
        >
          Everyone starts free. Upgrade when you want personal generations or
          Chat — checkout is handled securely by Stripe.
        </p>

        {error ? (
          <p className="mt-4 max-w-lg rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <ul className="mt-12 grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch lg:gap-5">
          {TIERS.map((tier) => {
            const isPaidTier = tier.id === "create" || tier.id === "pro";
            const current =
              (tier.id === "essentials" && plan === "free") ||
              (tier.id === "create" && plan === "create") ||
              (tier.id === "pro" && plan === "pro");
            const alreadyCovered =
              isPaidTier && planRank(plan) >= planRank(tier.id as ConsciouslyPlan);
            const busy = isPaidTier && busyKey === tier.id;

            return (
              <li key={tier.id} className="min-h-0">
                <div
                  className={`relative flex h-full flex-col rounded-2xl border p-6 text-left shadow-sm sm:p-7 ${
                    tier.popular
                      ? "border-accent/70 bg-card ring-1 ring-accent/40"
                      : "border-border bg-card"
                  }`}
                >
                  {tier.popular ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-selected px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-on-selected">
                      Most popular
                    </span>
                  ) : null}
                  <p className="font-display text-xl font-semibold tracking-tight text-foreground">
                    {tier.name}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {tier.blurb}
                  </p>
                  <p className="mt-6 font-display text-3xl font-medium tracking-tight text-foreground">
                    {tier.id === "essentials" ? "Free" : tier.name}
                  </p>
                  <p className="mt-1 text-xs text-muted">{tier.priceNote}</p>

                  <ul className="mt-6 flex-1 space-y-2.5">
                    {tier.features.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2 text-sm leading-snug text-foreground/90"
                      >
                        <span className="mt-0.5 shrink-0 text-accent-link" aria-hidden>
                          ✓
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                    {tier.excluded?.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2 text-sm leading-snug text-muted/80"
                      >
                        <span className="mt-0.5 shrink-0" aria-hidden>
                          –
                        </span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    {tier.id === "essentials" ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (onEssentials) onEssentials();
                          else if (!signedIn) {
                            window.location.href = "/login";
                          }
                        }}
                        className="inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-opacity hover:opacity-90"
                      >
                        {current ? "Your plan" : tier.cta}
                      </button>
                    ) : alreadyCovered ? (
                      <div className="inline-flex w-full items-center justify-center rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold text-muted">
                        {current ? "Current plan" : "Included in your plan"}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void startCheckout(tier.id)}
                        className={
                          tier.popular
                            ? "inline-flex w-full cursor-pointer items-center justify-center rounded-full accent-fill-gradient px-5 py-3 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
                            : "inline-flex w-full cursor-pointer items-center justify-center rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                        }
                      >
                        {busy
                          ? "Redirecting…"
                          : signedIn
                            ? tier.cta
                            : `Sign up for ${tier.name}`}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

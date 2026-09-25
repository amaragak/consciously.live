"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PricingPlansPanel } from "@/components/pricing-plans-panel";
import type { BillingPriceKey } from "@/lib/medimade-api";

function coerceCheckout(raw: string | null): BillingPriceKey | null {
  return raw === "create" || raw === "pro" ? raw : null;
}

/**
 * Marketing `/pricing` — Essentials free; Create/Pro → Stripe Checkout.
 */
export function EnhancedPricingPage() {
  const params = useSearchParams();
  const autoCheckout = coerceCheckout(params.get("checkout"));
  const cancelled = params.get("cancelled") === "1";

  return (
    <div className="w-full">
      {cancelled ? (
        <p className="mx-auto max-w-xl px-4 pt-8 text-center text-sm text-marketing-muted sm:px-6">
          Checkout cancelled — pick a plan whenever you are ready.
        </p>
      ) : null}
      <PricingPlansPanel
        variant="marketing"
        autoCheckout={autoCheckout}
        onEssentials={() => {
          window.location.href = "/journal/my";
        }}
        loginHrefBuilder={(priceKey) =>
          `/login?next=${encodeURIComponent(`/pricing?checkout=${priceKey}`)}`
        }
      />

      <section className="w-full bg-marketing-band-a px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink sm:text-4xl">
            What stays free to listen.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-marketing-muted sm:text-lg">
            Essentials includes community and program meditations so you can
            practice without generating. Personal creations unlock on Create;
            Chat and higher generation limits arrive with Pro.
          </p>
        </div>
      </section>

      <section className="w-full bg-marketing-band-b px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink sm:text-4xl">
            Questions about plans?
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-marketing-muted">
            New accounts start on Essentials (free). Upgrade anytime from pricing
            or the Pro button in the app sidebar — Stripe handles checkout.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/meditate"
              className="inline-flex items-center justify-center rounded-full accent-fill-gradient px-7 py-3 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              Explore Meditate
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-marketing-muted underline-offset-2 hover:underline"
            >
              Back to Consciously
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

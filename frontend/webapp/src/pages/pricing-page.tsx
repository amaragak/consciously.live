import { useNavigate, useSearchParams } from "react-router-dom";
import { PricingPlansPanel } from "@/components/pricing-plans-panel";
import { marketingHref } from "@/lib/origins";
import type { BillingPriceKey } from "@/lib/medimade-api";

function coerceCheckout(raw: string | null): BillingPriceKey | null {
  return raw === "create" || raw === "pro" ? raw : null;
}

export function PricingPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const autoCheckout = coerceCheckout(params.get("checkout"));
  const cancelled = params.get("cancelled") === "1";

  return (
    <div className="mx-auto w-full max-w-6xl">
      {cancelled ? (
        <p className="mx-auto mt-6 max-w-xl px-4 text-center text-sm text-muted sm:px-6">
          Checkout cancelled — pick a plan whenever you are ready.
        </p>
      ) : null}
      <PricingPlansPanel
        variant="app"
        autoCheckout={autoCheckout}
        onEssentials={() => navigate("/meditate/library/creations")}
        loginHrefBuilder={(priceKey) => {
          const appReturn = `${window.location.origin}/pricing?checkout=${priceKey}`;
          return marketingHref(
            `/login?next=${encodeURIComponent(`/pricing?checkout=${priceKey}`)}&appReturn=${encodeURIComponent(appReturn)}`,
          );
        }}
      />
    </div>
  );
}

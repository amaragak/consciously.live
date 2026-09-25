import { Suspense } from "react";
import { EnhancedPricingPage } from "@/components/enhanced-pricing-page";

export const metadata = {
  title: "Pricing",
  description:
    "Consciously plans: Essentials for journal, ideate, focus, and listening; Create for personal meditations; Pro for Chat and more generations.",
};

export default function PricingPage() {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-20 text-center text-marketing-muted">
          Loading plans…
        </div>
      }
    >
      <EnhancedPricingPage />
    </Suspense>
  );
}

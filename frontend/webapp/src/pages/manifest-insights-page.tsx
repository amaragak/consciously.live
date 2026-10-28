import { Navigate } from "react-router-dom";
import { Link } from "@/lib/spa-nav";
import { useMvpFlags } from "@/lib/mvp-flags";

/**
 * Stub for Manifest insights — aggregate progress across life areas.
 * Linked from the Manifesto "This month" strip.
 */
export function ManifestInsightsPage() {
  const flags = useMvpFlags();
  if (!flags.manifestInsights) return <Navigate to="/manifest" replace />;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
      <p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link">
        Manifest
      </p>
      <h1 className="mt-2 font-display text-[28px] leading-tight text-foreground sm:text-[34px]">
        Insights
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-foreground/80">
        A month-level view of pace, steps completed and sentiment across your
        life areas. Coming soon — for now the Manifesto strip shows the same
        aggregates.
      </p>
      <Link
        href="/manifest"
        className="mt-8 inline-flex text-sm font-semibold text-accent-link underline-offset-2 hover:underline"
      >
        Back to Manifesto
      </Link>
    </div>
  );
}

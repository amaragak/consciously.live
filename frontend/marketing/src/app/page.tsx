import type { Metadata } from "next";
import { HomeV2Page } from "@/components/home-v2/home-v2-page";
import { LegacyHome } from "@/components/legacy/LegacyHome";
import { isHomeV2Enabled } from "@/lib/home-v2-flag";

export const metadata: Metadata = isHomeV2Enabled()
  ? {
      title: {
        absolute: "Consciously — become who you said you'd be",
      },
      description:
        "Get clear on the life you want, quiet the doubt in the way, and spend your days building it.",
    }
  : {
      title: {
        absolute: "Consciously — live consciously with meditation & journal",
      },
      description:
        "Consciously at consciously.live: generate guided meditations, keep a personal library, and journal with smart insights—all in one place.",
    };

/**
 * Public marketing home.
 * `NEXT_PUBLIC_HOME_V2=false` rolls back to the legacy suite landing.
 */
export default function HomePage() {
  if (isHomeV2Enabled()) return <HomeV2Page />;
  return <LegacyHome />;
}

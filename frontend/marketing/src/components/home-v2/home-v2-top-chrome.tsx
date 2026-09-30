"use client";

import { HomeV2NavHeader } from "@/components/home-v2/home-v2-nav-header";

/**
 * Shared top chrome: transparent nav + sun radial + content-width hairline.
 * Parent supplies horizontal padding (hero `px-5` / field wrapper).
 */
export function HomeV2TopChrome({ home = false }: { home?: boolean } = {}) {
  return (
    <>
      <div aria-hidden className="home-v2-hero-sun-glow px-5 md:px-6">
        <div className="relative mx-auto h-full max-w-[1200px]">
          <span className="home-v2-hero-chrome-glow-sun absolute left-[20px] top-[28px] size-[160px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl md:top-[36px] md:size-[200px]" />
        </div>
      </div>
      <div className="home-v2-hero-chrome relative z-[5] mx-auto w-full max-w-[1200px] border-b border-[var(--hv2-hero-hairline)]">
        <HomeV2NavHeader tone="transparent" position="static" home={home} />
      </div>
    </>
  );
}

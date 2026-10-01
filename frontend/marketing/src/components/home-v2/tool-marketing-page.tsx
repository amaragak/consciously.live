"use client";

import Link from "next/link";
import {
  HOME_V2_TOOLS,
  type HomeV2ToolId,
} from "@/components/home-v2/constants";
import { FinalCta } from "@/components/home-v2/final-cta";
import {
  HomeV2Chrome,
  HomeV2ScrollChrome,
} from "@/components/home-v2/home-v2-scroll-chrome";
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";
import { TOOL_MARKETING } from "@/components/home-v2/tool-marketing-copy";
import { TOOL_MARKETING_VIGNETTES } from "@/components/home-v2/tool-vignettes";

const BANDS = [
  "home-v2-band--a",
  "home-v2-band--b",
  "home-v2-band--c",
  "home-v2-band--d",
] as const;

export function ToolMarketingPage({ tool }: { tool: HomeV2ToolId }) {
  const meta = HOME_V2_TOOLS.find((t) => t.id === tool)!;
  const copy = TOOL_MARKETING[tool];
  const signupHref = `/login?mode=signup&next=${encodeURIComponent(meta.href)}`;

  return (
    <HomeV2ScrollChrome>
      <div className="relative">
        <HomeV2Chrome />

        <section className="home-v2-hero home-v2-hero--under-chrome flex w-full flex-col px-5 pb-16 text-[var(--hv2-hero-fg)] md:px-6 md:pb-24">
          <div className="relative z-[1] mx-auto flex w-full max-w-[1200px] flex-col items-center gap-5 pt-10 text-center md:gap-6 md:pt-14">
            <h1 className="home-v2-display m-0 max-w-3xl text-[28px] font-[350] leading-tight tracking-[-0.6px] text-[var(--hv2-hero-fg)] sm:text-[36px] md:text-[clamp(36px,3.4vw,44px)] md:tracking-[-0.8px]">
              {copy.headline}
            </h1>
            {copy.support ? (
              <p className="m-0 max-w-2xl text-base leading-relaxed text-[var(--hv2-hero-muted)] sm:text-lg md:text-[19px] md:leading-[1.6]">
                {copy.support}
              </p>
            ) : null}
            <div>
              <Link
                href={signupHref}
                className="accent-fill-gradient inline-flex items-center justify-center gap-2 rounded-full px-7 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              >
                <HomeV2ToolIcon tool={tool} />
                {meta.ctaLabel}
              </Link>
            </div>
          </div>
        </section>

        {copy.strips.map((strip, i) => {
          const band = BANDS[i % BANDS.length];
          const visualLeft = i % 2 === 1;
          const text = (
            <div
              className="flex min-w-0 flex-1 basis-0 flex-col gap-[22px]"
              data-hv2-reveal
            >
              <h2 className="home-v2-display m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.6px] text-[var(--hv2-ink)] md:text-[44px] md:tracking-[-1px]">
                {strip.headline}
              </h2>
              <p className="m-0 text-base leading-relaxed text-[var(--hv2-body)] md:text-[19px] md:leading-[1.6]">
                {strip.support}
              </p>
              {strip.examples?.length ? (
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0 md:gap-2.5">
                  {strip.examples.map((ex) => (
                    <li
                      key={ex}
                      className="rounded-full border border-[var(--hv2-line)] bg-[var(--hv2-card)] px-3.5 py-2 text-sm text-[var(--hv2-ink)] md:text-[15px]"
                    >
                      {ex}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-5 p-0">
                  {strip.points.map((p) => (
                    <li key={p.title} className="min-w-0">
                      <h3 className="home-v2-display m-0 text-lg font-medium tracking-tight text-[var(--hv2-ink)] md:text-xl">
                        {p.title}
                      </h3>
                      <p className="mt-1.5 m-0 text-[15px] leading-relaxed text-[var(--hv2-body)] md:text-base md:leading-[1.55]">
                        {p.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
          const visual = (
            <div className="w-full md:w-[540px] md:shrink-0" data-hv2-reveal>
              {TOOL_MARKETING_VIGNETTES[strip.vignette]}
            </div>
          );

          return (
            <section
              key={strip.headline}
              className={`home-v2-band ${band} w-full px-5 py-16 md:px-6 md:py-24`}
            >
              <div
                className={`mx-auto flex w-full max-w-[1200px] flex-col items-center gap-10 md:gap-[80px] ${
                  visualLeft ? "md:flex-row-reverse" : "md:flex-row"
                }`}
              >
                {text}
                {visual}
              </div>
            </section>
          );
        })}

        <section
          className={`home-v2-band ${BANDS[copy.strips.length % BANDS.length]} w-full px-5 py-14 md:px-6 md:py-20`}
        >
          <div
            className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 md:flex-row md:items-center md:justify-between"
            data-hv2-reveal
          >
            <p className="home-v2-display m-0 max-w-xl text-2xl font-normal tracking-tight text-[var(--hv2-ink)] md:text-3xl">
              Ready to try {copy.eyebrow.toLowerCase()}?
            </p>
            <Link
              href={signupHref}
              className="accent-fill-gradient inline-flex items-center gap-2 rounded-full px-6 py-3 text-[17px] font-semibold transition-opacity hover:opacity-90"
            >
              <HomeV2ToolIcon tool={tool} />
              {meta.ctaLabel}
            </Link>
          </div>
        </section>

        <FinalCta />
      </div>
    </HomeV2ScrollChrome>
  );
}

"use client";

import { HeroPrompt } from "@/components/home-v2/hero-prompt";
import { TypesSection } from "@/components/home-v2/types-section";

export function HeroSection({ motionReady }: { motionReady: boolean }) {
  const anim = (delayMs: number) =>
    motionReady
      ? {
          className: "home-v2-hero-anim is-ready",
          style: { animationDelay: `${delayMs}ms` } as const,
        }
      : { className: "home-v2-hero-anim", style: undefined };

  const h1 = anim(0);
  const sub = anim(150);
  const form = anim(300);

  return (
    <section
      id="tool-home"
      className="home-v2-hero home-v2-hero--under-chrome flex flex-col px-5 pb-10 text-[var(--hv2-hero-fg)] md:px-6 md:pb-[140px]"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 md:gap-6 md:pt-[72px]">
        <h1
          className={`home-v2-display m-0 text-[40px] font-normal leading-[1.06] tracking-[-0.6px] md:text-[clamp(52px,6vw,88px)] md:font-[350] md:leading-none md:tracking-[-2px] ${h1.className}`}
          style={h1.style}
        >
          Become who you{" "}
          <em className="italic text-[var(--hv2-gold)]">said</em>
          {" "}
          you&apos;d be.
        </h1>
        <div className={sub.className} style={sub.style}>
          <p className="m-0 max-w-none text-[16px] leading-[1.5] text-[var(--hv2-hero-muted)] md:hidden">
            <em className="home-v2-display text-[16px] font-normal italic text-[var(--hv2-ivory)]">
              Live consciously
            </em>{" "}
            with our{" "}
            <strong className="font-bold text-[var(--hv2-hero-fg)]">
              mind reprogramming
            </strong>{" "}
            suite.
          </p>
          <div className="hidden md:block">
            <p className="m-0 max-w-none text-center text-[22px] leading-[1.5] text-[var(--hv2-hero-muted)]">
              <em className="home-v2-display text-[26px] font-normal italic text-[var(--hv2-ivory)]">
                Live consciously
              </em>{" "}
              with our all-inclusive{" "}
              <strong className="font-bold text-[var(--hv2-hero-fg)]">
                mind reprogramming
              </strong>{" "}
              suite:
            </p>
            <p className="m-0 mt-2.5 max-w-none text-center text-[22px] leading-[1.5] text-[var(--hv2-hero-muted)]">
              Personalised AI-guided meditations · Vision board · Goal planner ·
              Personal Manifesto · Focus sessions
            </p>
          </div>
        </div>
        <div className={`pt-1.5 md:pt-0 ${form.className}`} style={form.style}>
          <HeroPrompt />
        </div>
        {/* Desktop only — mobile “start elsewhere” is its own band section */}
        <div className="hidden md:block">
          <TypesSection motionReady={motionReady} />
        </div>
      </div>
    </section>
  );
}

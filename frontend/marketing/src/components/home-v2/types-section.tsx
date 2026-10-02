import Link from "next/link";
import { HOME_V2_START_ELSEWHERE } from "@/components/home-v2/constants";

/** “Or start somewhere else” — desktop cards; mobile hairline rows (no card). */
export function TypesSection({ motionReady }: { motionReady: boolean }) {
  return (
    <div
      className={`${
        motionReady ? "home-v2-hero-anim is-ready" : "home-v2-hero-anim"
      }`}
      style={motionReady ? { animationDelay: "450ms" } : undefined}
    >
      {/* Mobile: rows sit directly in the section — no outer card */}
      <div className="md:hidden">
        <p className="m-0 pb-2 text-[11px] uppercase tracking-[1.6px] text-[var(--hv2-muted)]">
          Or start somewhere else
        </p>
        {HOME_V2_START_ELSEWHERE.map((card, i) => (
          <Link
            key={card.href}
            href={card.href}
            className={`flex min-h-16 items-center gap-3 border-t border-[var(--hv2-hero-hairline)] py-2.5 ${
              i === HOME_V2_START_ELSEWHERE.length - 1
                ? "border-b border-[var(--hv2-hero-hairline)]"
                : ""
            }`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="home-v2-display text-[18px] leading-snug text-[var(--hv2-ink)]">
                {card.title}
              </span>
              <span className="text-[13px] leading-snug text-[var(--hv2-muted)]">
                {card.bodyMobile}
              </span>
            </span>
            <span className="home-v2-display shrink-0 whitespace-nowrap text-[15px] italic text-[var(--hv2-tan-text)]">
              {card.tool} →
            </span>
          </Link>
        ))}
      </div>

      {/* Desktop: 4-up cards */}
      <div className="hidden flex-col gap-4 md:flex">
        <p className="text-left text-[13px] uppercase tracking-[2px] text-[var(--hv2-hero-fg)]">
          Or start somewhere else
        </p>
        <div className="grid grid-cols-4 gap-4">
          {HOME_V2_START_ELSEWHERE.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group home-v2-hero-glass flex flex-col gap-2.5 rounded-[20px] border border-[var(--hv2-hero-card-border)] bg-[var(--hv2-hero-card-bg)] p-6 text-[var(--hv2-hero-card-fg)] shadow-[var(--hv2-hero-elev)] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-1 hover:border-[rgb(var(--hv2-gold-rgb)/0.55)] hover:bg-[rgba(246,241,231,0.09)] hover:shadow-[0_14px_36px_rgb(0_0_0_/_0.35),0_2px_8px_rgb(0_0_0_/_0.18)]"
            >
              <span className="home-v2-display text-[22px] transition-colors duration-200 group-hover:text-[var(--hv2-gold)]">
                {card.title}
              </span>
              <span className="text-[15px] leading-relaxed text-[var(--hv2-hero-card-muted)]">
                {card.body}
              </span>
              <span className="mt-auto inline-flex items-center gap-1 pt-1.5 text-[14px] font-medium text-[var(--hv2-gold)]">
                {card.tool}
                <span
                  aria-hidden
                  className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

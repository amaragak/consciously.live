import Link from "next/link";
import { HOME_V2_START_ELSEWHERE } from "@/components/home-v2/constants";

/** “Or start somewhere else” cards (hero). */
export function TypesSection({ motionReady }: { motionReady: boolean }) {
  return (
    <div
      className={`mt-8 flex flex-col gap-4 md:mt-10 ${
        motionReady ? "home-v2-hero-anim is-ready" : "home-v2-hero-anim"
      }`}
      style={motionReady ? { animationDelay: "450ms" } : undefined}
    >
      <p className="home-v2-display text-center text-[19px] font-bold text-[var(--hv2-hero-fg)] md:text-[26px]">
        Or start somewhere else
      </p>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        {HOME_V2_START_ELSEWHERE.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group home-v2-hero-glass flex flex-col gap-1.5 rounded-[16px] border border-[var(--hv2-hero-card-border)] bg-[var(--hv2-hero-card-bg)] p-4 text-[var(--hv2-hero-card-fg)] shadow-[var(--hv2-hero-elev)] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-1 hover:border-[rgb(var(--hv2-gold-rgb)/0.55)] hover:bg-[rgba(246,241,231,0.09)] hover:shadow-[0_14px_36px_rgb(0_0_0_/_0.35),0_2px_8px_rgb(0_0_0_/_0.18)] md:gap-2.5 md:rounded-[20px] md:p-6"
          >
            <span className="home-v2-display text-[17px] transition-colors duration-200 group-hover:text-[var(--hv2-gold)] md:text-[22px]">
              {card.title}
            </span>
            <span className="text-[13px] leading-snug text-[var(--hv2-hero-card-muted)] md:hidden">
              {card.bodyMobile}
            </span>
            <span className="hidden text-[15px] leading-relaxed text-[var(--hv2-hero-card-muted)] md:block">
              {card.body}
            </span>
            <span className="mt-auto inline-flex items-center gap-1 pt-1.5 text-[13px] font-medium text-[var(--hv2-gold)] md:text-[14px]">
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
  );
}

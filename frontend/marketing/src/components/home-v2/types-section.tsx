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
      <p className="text-[11px] uppercase tracking-[1.6px] text-[var(--hv2-hero-card-label)] md:text-[13px] md:tracking-[2px]">
        Or start somewhere else
      </p>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        {HOME_V2_START_ELSEWHERE.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="home-v2-hero-glass flex flex-col gap-1.5 rounded-[16px] border border-[var(--hv2-hero-card-border)] bg-[var(--hv2-hero-card-bg)] p-4 text-[var(--hv2-hero-card-fg)] shadow-[var(--hv2-hero-elev)] transition-[border-color,box-shadow] hover:border-[rgb(var(--hv2-gold-rgb)/0.5)] md:gap-2.5 md:rounded-[20px] md:p-6"
          >
            <span className="home-v2-display text-[17px] md:text-[22px]">
              {card.title}
            </span>
            <span className="text-[13px] leading-snug text-[var(--hv2-hero-card-muted)] md:hidden">
              {card.bodyMobile}
            </span>
            <span className="hidden text-[15px] leading-relaxed text-[var(--hv2-hero-card-muted)] md:block">
              {card.body}
            </span>
            <span className="mt-auto hidden pt-1.5 text-[14px] text-[var(--hv2-gold)] md:block">
              {card.tool} →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

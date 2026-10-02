import Link from "next/link";
import { HOME_V2_START_FREE_HREF } from "@/components/home-v2/constants";

export function FinalCta() {
  return (
    <section
      id="tool-home-cta"
      className="flex w-full flex-col items-center gap-3.5 border-t border-[var(--hv2-hero-hairline)] bg-[var(--hv2-navy)] px-5 py-11 text-[var(--hv2-ivory)] md:gap-9 md:border-t-0 md:px-6 md:py-24"
      data-hv2-reveal
    >
      <h2 className="home-v2-display m-0 max-w-[1200px] text-center text-[32px] font-normal leading-[1.1] tracking-[-0.8px] md:text-[72px] md:font-[350] md:leading-[1.05] md:tracking-[-1.6px]">
        Who are you becoming?
      </h2>
      <p className="m-0 text-[15px] text-[rgba(246,241,231,0.7)] md:text-[19px]">
        Start today. It&apos;s free.
      </p>
      <Link
        href={HOME_V2_START_FREE_HREF}
        className="accent-fill-gradient mt-1.5 inline-flex h-[52px] w-full max-w-md items-center justify-center rounded-full text-base font-semibold transition-opacity hover:opacity-90 md:mt-0 md:h-auto md:w-auto md:px-9 md:py-5 md:text-lg"
      >
        <span className="md:hidden">Start free</span>
        <span className="hidden md:inline">Start free →</span>
      </Link>
    </section>
  );
}

import Link from "next/link";
import { HOME_V2_START_FREE_HREF } from "@/components/home-v2/constants";

export function FinalCta() {
  return (
    <section
      id="tool-home-cta"
      className="flex w-full flex-col items-center gap-6 bg-[var(--hv2-navy)] px-5 py-16 text-[var(--hv2-ivory)] md:gap-9 md:px-6 md:py-24"
      data-hv2-reveal
    >
      <h2 className="home-v2-display m-0 max-w-[1200px] text-center text-[38px] font-[350] leading-[1.05] tracking-[-0.8px] md:text-[72px] md:tracking-[-1.6px]">
        Who are you becoming?
      </h2>
      <p className="-mt-2 m-0 text-base text-[rgba(246,241,231,0.7)] md:text-[19px]">
        Start today. It&apos;s free.
      </p>
      <Link
        href={HOME_V2_START_FREE_HREF}
        className="rounded-full bg-[var(--hv2-gold)] px-8 py-4 text-base font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 md:px-9 md:py-5 md:text-lg"
      >
        Start free
      </Link>
    </section>
  );
}

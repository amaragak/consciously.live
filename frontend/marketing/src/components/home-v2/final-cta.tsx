import Link from "next/link";
import { HOME_V2_START_FREE_HREF } from "@/components/home-v2/constants";

export function FinalCta() {
  return (
    <section
      id="tool-home-cta"
      className="mx-5 flex flex-col items-center gap-6 rounded-3xl bg-[var(--hv2-navy)] px-6 py-12 text-[var(--hv2-ivory)] md:mx-[min(120px,8vw)] md:gap-9 md:rounded-[32px] md:px-24 md:py-24"
      data-hv2-reveal
    >
      <h2 className="home-v2-display m-0 text-center text-[38px] font-[350] leading-[1.05] tracking-[-0.8px] md:text-[72px] md:tracking-[-1.6px]">
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

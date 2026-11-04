import Link from "next/link";
import type { ReactNode } from "react";
import {
  LEGAL_LAST_UPDATED,
  LEGAL_PLACEHOLDERS,
  SHOW_LEGAL_DRAFT_BANNER,
} from "@/lib/legal";

/** Filled legal values plain; still-bracketed placeholders highlighted. */
export function Ph({ k }: { k: keyof typeof LEGAL_PLACEHOLDERS }) {
  const value = LEGAL_PLACEHOLDERS[k];
  if (value.startsWith("[")) {
    return (
      <mark className="rounded bg-[#FBE7A1] px-1 py-px font-medium text-[#5A4300]">
        {value}
      </mark>
    );
  }
  return <>{value}</>;
}

/** A provider claim not yet confirmed against its terms (listed in the inventory). */
export function Unconfirmed({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-[#FBE7A1] px-1 py-px text-[#5A4300]">
      [Unconfirmed: {children}]
    </mark>
  );
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="home-v2-display m-0 text-[1.375rem] font-normal leading-snug tracking-[-0.3px] text-[var(--hv2-ink)] md:text-[1.5rem]">
        {title}
      </h2>
      <div className="legal-prose mt-3">{children}</div>
    </section>
  );
}

/** Plain reading layout shared with Read essays: off-white page, 680px column. */
export function LegalPage({
  title,
  intro,
  other,
  children,
}: {
  title: string;
  intro: ReactNode;
  other: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="home-v2 min-h-full bg-[var(--hv2-page)] text-[var(--hv2-ink)]">
      <article className="px-5 pb-20 pt-10 md:px-6 md:pt-14">
        <div className="mx-auto w-full max-w-[680px]">
          {SHOW_LEGAL_DRAFT_BANNER ? (
            <p
              role="note"
              className="m-0 mb-6 rounded-xl border border-[#E6C766] bg-[#FFF6D6] px-4 py-3 text-[14.5px] font-medium text-[#5A4300]"
            >
              Draft, pending legal review.
            </p>
          ) : null}
          <h1 className="home-v2-display m-0 text-[2rem] font-normal leading-[1.15] tracking-[-0.6px] text-[var(--hv2-ink)] md:text-[2.75rem]">
            {title}
          </h1>
          <p className="m-0 mt-3 text-[14.5px] text-[var(--hv2-body)]/80">
            Last updated {LEGAL_LAST_UPDATED}
          </p>
          <div className="legal-prose mt-6">{intro}</div>
          {children}
          <p className="m-0 mt-12 border-t border-[var(--hv2-ink)]/10 pt-6 text-[14.5px] text-[var(--hv2-body)]">
            See also our{" "}
            <Link href={other.href} className="underline underline-offset-2">
              {other.label}
            </Link>
            .
          </p>
        </div>
      </article>
    </div>
  );
}

import Link from "next/link";
import { Lockup } from "@/components/home-v2/lockup";

function WaveBars({ count = 24 }: { count?: number }) {
  const heights = [
    10, 18, 24, 14, 28, 20, 26, 16, 22, 12, 26, 18, 28, 14, 22, 10, 20, 26, 16,
    24, 12, 18, 22, 14, 20, 26, 12, 18, 24, 16, 22, 10, 20, 14, 24, 18,
  ];
  return (
    <div className="home-v2-wave" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          className={i < 7 ? "on" : undefined}
          style={{ height: `${heights[i % heights.length]}px` }}
        />
      ))}
    </div>
  );
}

function ArrowRight() {
  return (
    <svg width="30" height="18" viewBox="0 0 30 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 9h24" />
      <path d="M20 3l6 6-6 6" />
    </svg>
  );
}

export function ToolLoopSection() {
  return (
    <section
      id="tool-home-loop"
      className="home-v2-band home-v2-band--a mb-0 flex flex-col gap-3.5 border-t border-[var(--hv2-hero-hairline)] px-5 py-10 md:gap-14 md:border-t-0 md:px-[min(120px,8vw)] md:py-32"
    >
      <div
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-20"
        data-hv2-reveal
      >
        <h2 className="home-v2-display m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.6px] md:text-[60px] md:leading-[1.05] md:tracking-[-1.2px]">
          Five tools. One direction.
        </h2>
        <p className="m-0 mb-1.5 max-w-[460px] text-[15px] leading-[1.55] text-[var(--hv2-body)] md:mb-0 md:text-[19px] md:leading-[1.6]">
          Every entry, session and conversation moves you towards the same place:
          the life you&apos;ve chosen.
        </p>
      </div>

      {/* Mobile diagram: compact vertical timeline */}
      <div
        className="mx-auto flex w-full max-w-[1200px] flex-col md:hidden"
        data-hv2-reveal
      >
        <div className="relative rounded-[14px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-4 pb-3 pt-2.5">
          <span
            className="absolute bottom-[82px] left-5 top-[30px] w-px bg-[rgb(var(--hv2-gold-rgb)/0.45)]"
            aria-hidden
          />
          <ol className="relative m-0 flex list-none flex-col p-0">
            {(
              [
                {
                  verb: "Journal",
                  href: "/journal",
                  line: (
                    <em className="home-v2-display italic">
                      “Why do I keep waiting?”
                    </em>
                  ),
                },
                {
                  verb: "Manifest",
                  href: "/manifest",
                  line: <span>Open my own studio</span>,
                },
                {
                  verb: "Meditate",
                  href: "/meditate",
                  line: (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="accent-fill-gradient flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
                        aria-hidden
                      >
                        <svg
                          width="8"
                          height="8"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </span>
                      <span className="home-v2-display text-[15px]">
                        Opening night
                      </span>
                    </span>
                  ),
                },
                {
                  verb: "Focus",
                  href: "/focus",
                  line: <span>25:00 · Pricing</span>,
                },
              ] as const
            ).map((row) => (
              <li key={row.verb} className="relative min-h-10 pl-[22px]">
                <span
                  className="absolute left-0 top-1/2 size-[9px] -translate-y-1/2 rounded-full bg-[var(--hv2-gold)]"
                  aria-hidden
                />
                <Link
                  href={row.href}
                  className="flex min-h-10 items-center gap-2.5 py-0 text-[14px] leading-snug text-[var(--hv2-ink)]"
                >
                  <em className="home-v2-display w-[70px] shrink-0 italic text-[var(--hv2-tan-text)]">
                    {row.verb}
                  </em>
                  <span className="min-w-0 truncate">{row.line}</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="mt-2 border-t border-[var(--hv2-card-border)] pt-2.5 text-[13px] leading-[1.45] text-[var(--hv2-body)]">
            <span className="home-v2-display text-[var(--hv2-muted)]">
              consciously{" "}
              <em className="italic text-[var(--hv2-tan-text)]">Chat</em>
            </span>{" "}
            runs through all of it: ask, reflect, and it moves the app for you.
          </div>
        </div>
      </div>

      {/* Desktop diagram */}
      <div className="mx-auto hidden w-full max-w-[1200px] flex-col gap-4 md:flex">
        <div className="flex items-stretch gap-3.5">
          <div
            className="flex flex-1 basis-0 flex-col gap-3 rounded-[22px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] p-6"
            data-hv2-reveal
          >
            <Lockup tool="Journal" size="card" onNavy />
            <p className="home-v2-display m-0 text-lg italic leading-snug">
              “I can see the business so clearly. Why do I keep waiting to begin?”
            </p>
            <p className="mt-auto m-0 text-[13px] text-[var(--hv2-muted)]">
              Tonight&apos;s entry
            </p>
          </div>
          <div className="flex items-center home-v2-display text-[26px] text-[var(--hv2-tan-text)]" data-hv2-reveal aria-hidden>
            +
          </div>
          <div
            className="flex flex-1 basis-0 flex-col gap-3 rounded-[22px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] p-6"
            data-hv2-reveal
          >
            <Lockup tool="Manifest" size="card" onNavy />
            <p className="home-v2-display m-0 text-lg leading-snug">
              Someone living the life they designed.
            </p>
            <p className="mt-auto m-0 text-[13px] text-[var(--hv2-muted)]">
              Goal · Open my own studio
            </p>
          </div>
          <div className="flex items-center text-[var(--hv2-tan-text)]" data-hv2-reveal aria-hidden>
            <ArrowRight />
          </div>
          <div
            className="flex flex-[1.25] basis-0 flex-col gap-3.5 rounded-[22px] bg-[var(--hv2-navy)] p-6 text-[var(--hv2-ivory)]"
            data-hv2-reveal
          >
            <Lockup tool="Meditate" size="card" onNavy />
            <div className="flex items-center gap-3.5">
              <span
                aria-hidden
                className="accent-fill-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
              <p className="home-v2-display m-0 text-lg font-medium leading-snug">
                Manifesting your business: living as its successful owner, today
              </p>
            </div>
            <WaveBars />
            <p className="m-0 text-[13px] text-[rgba(246,241,231,0.55)]">
              Written from both · Warm voice · Soft rain
            </p>
          </div>
          <div className="flex items-center text-[var(--hv2-tan-text)]" data-hv2-reveal aria-hidden>
            <ArrowRight />
          </div>
          <div
            className="flex flex-1 basis-0 flex-col gap-3.5 rounded-[22px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] p-6"
            data-hv2-reveal
          >
            <Lockup tool="Focus" size="card" onNavy />
            <div className="flex items-center gap-3.5">
              <span
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[5px] border-[var(--hv2-line-soft)] border-r-[var(--hv2-gold)] border-t-[var(--hv2-gold)] text-sm"
                aria-hidden
              >
                25:00
              </span>
              <p className="home-v2-display m-0 text-lg leading-snug">
                Price the first collection
              </p>
            </div>
            <p className="mt-auto m-0 text-[13px] text-[var(--hv2-muted)]">
              Focus timer · from your Manifest goal
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-7 rounded-[22px] bg-[var(--hv2-navy)] px-7 py-5 text-[var(--hv2-ivory)]"
          data-hv2-reveal
        >
          <Lockup tool="Chat" size="card" onNavy className="shrink-0 [font-size:20px]" />
          <p className="m-0 flex-1 text-base text-[var(--hv2-on-navy)]">
            Runs through all of it: ask, reflect, and it moves the app for you.
          </p>
          <div className="flex shrink-0 gap-2" aria-hidden>
            <span className="rounded-[16px_16px_4px_16px] bg-[var(--hv2-gold)] px-3.5 py-2.5 text-sm text-[var(--hv2-navy)]">
              I keep doubting myself.
            </span>
            <span className="rounded-[16px_16px_16px_4px] bg-[rgba(246,241,231,0.1)] px-3.5 py-2.5 text-sm">
              Want a meditation for that?
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

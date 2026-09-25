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

function ArrowDown() {
  return (
    <svg width="20" height="22" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 2v16" />
      <path d="M4 12l6 6 6-6" />
    </svg>
  );
}

export function ToolLoopSection() {
  return (
    <section
      id="tool-home-loop"
      className="home-v2-band home-v2-band--a mb-0 flex flex-col gap-6 px-5 py-12 md:gap-14 md:px-[min(120px,8vw)] md:py-32"
    >
      <div
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-20"
        data-hv2-reveal
      >
        <h2 className="home-v2-display m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.6px] md:text-[60px] md:tracking-[-1.2px]">
          Five tools. One direction.
        </h2>
        <p className="m-0 max-w-[460px] text-base leading-relaxed text-[var(--hv2-body)] md:text-[19px] md:leading-[1.6]">
          Every entry, session and conversation moves you towards the same place:
          the life you&apos;ve chosen.
        </p>
      </div>

      {/* Mobile diagram */}
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2.5 md:hidden">
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            href="/journal"
            className="flex flex-col gap-1.5 rounded-2xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] p-4"
            data-hv2-reveal
          >
            <Lockup tool="Journal" size="card" />
            <span className="home-v2-display text-sm italic leading-snug">
              “I can see the business so clearly. Why do I keep waiting?”
            </span>
          </Link>
          <Link
            href="/manifest"
            className="flex flex-col gap-1.5 rounded-2xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] p-4"
            data-hv2-reveal
          >
            <Lockup tool="Manifest" size="card" />
            <span className="home-v2-display text-sm leading-snug">
              Someone living the life they designed.
            </span>
          </Link>
        </div>
        <div className="flex justify-center text-[var(--hv2-tan-text)]" aria-hidden>
          <ArrowDown />
        </div>
        <Link
          href="/meditate"
          className="flex items-center gap-3.5 rounded-[18px] bg-[var(--hv2-navy)] p-[18px] text-[var(--hv2-ivory)]"
          data-hv2-reveal
        >
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--hv2-gold)] text-[var(--hv2-navy)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <span className="flex flex-col gap-1">
            <Lockup tool="Meditate" size="card" onNavy />
            <span className="home-v2-display text-base leading-snug">
              Manifesting your business: living as its successful owner, today
            </span>
          </span>
        </Link>
        <div className="flex justify-center text-[var(--hv2-tan-text)]" aria-hidden>
          <ArrowDown />
        </div>
        <Link
          href="/focus"
          className="flex items-center gap-3.5 rounded-[18px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] p-[18px]"
          data-hv2-reveal
        >
          <span
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-[4px] border-[var(--hv2-line-soft)] border-r-[var(--hv2-gold)] border-t-[var(--hv2-gold)] text-xs"
            aria-hidden
          >
            25:00
          </span>
          <span className="flex flex-col gap-1">
            <Lockup tool="Focus" size="card" />
            <span className="home-v2-display text-base">Price the first collection</span>
            <span className="text-xs text-[var(--hv2-muted)]">
              Focus timer · from your Manifest goal
            </span>
          </span>
        </Link>
        <Link
          href="/chat"
          className="mt-1.5 flex flex-col gap-1.5 rounded-[18px] bg-[var(--hv2-navy)] p-[18px] text-[var(--hv2-ivory)]"
          data-hv2-reveal
        >
          <Lockup tool="Chat" size="card" onNavy />
          <span className="text-sm leading-snug text-[rgba(246,241,231,0.8)]">
            Runs through all of it: ask, reflect, and it moves the app for you.
          </span>
        </Link>
      </div>

      {/* Desktop diagram */}
      <div className="mx-auto hidden w-full max-w-[1200px] flex-col gap-4 md:flex">
        <div className="flex items-stretch gap-3.5">
          <div
            className="flex flex-1 basis-0 flex-col gap-3 rounded-[22px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] p-6"
            data-hv2-reveal
          >
            <Lockup tool="Journal" size="card" />
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
            <Lockup tool="Manifest" size="card" />
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
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--hv2-gold)] text-[var(--hv2-navy)]"
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
            <Lockup tool="Focus" size="card" />
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

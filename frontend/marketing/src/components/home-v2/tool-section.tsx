import Link from "next/link";
import type { ReactNode } from "react";
import type { HomeV2ToolId } from "@/components/home-v2/constants";
import { HOME_V2_TOOLS } from "@/components/home-v2/constants";
import { Lockup } from "@/components/home-v2/lockup";

function WaveBars({ count = 36 }: { count?: number }) {
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

function ArrowDown() {
  return (
    <div className="flex justify-center text-[var(--hv2-tan-text)]" aria-hidden>
      <svg width="20" height="24" viewBox="0 0 20 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2v18" />
        <path d="M3 14l7 7 7-7" />
      </svg>
    </div>
  );
}

function MeditateVignette() {
  return (
    <div className="flex w-full max-w-[540px] flex-col gap-3" aria-hidden>
      <div className="flex flex-col gap-4 rounded-3xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-7 py-7">
        <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-tan-text)]">
          You ask
        </p>
        <p className="home-v2-display m-0 text-xl italic leading-snug">
          “I want to manifest opening my new studio.”
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--hv2-navy)] px-3.5 py-2 text-sm font-semibold text-[var(--hv2-ivory)]">
            Manifestation
          </span>
          <span className="rounded-full border border-[#D9CCB2] px-3.5 py-2 text-sm">
            Visualization
          </span>
          <span className="rounded-full border border-[#D9CCB2] px-3.5 py-2 text-sm">
            Sleep
          </span>
        </div>
      </div>
      <ArrowDown />
      <div className="flex flex-col gap-[18px] rounded-3xl bg-[var(--hv2-navy)] px-7 py-7 text-[var(--hv2-ivory)]">
        <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
          You get
        </p>
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--hv2-gold)] text-[var(--hv2-navy)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
          <div>
            <p className="home-v2-display m-0 text-[22px] font-medium">
              Opening day at your new studio
            </p>
            <p className="m-0 text-[13px] text-[rgba(246,241,231,0.6)]">
              Manifestation · Warm voice · Soft rain
            </p>
          </div>
        </div>
        <WaveBars />
      </div>
    </div>
  );
}

function JournalVignette() {
  return (
    <div className="flex w-full max-w-[540px] flex-col gap-3" aria-hidden>
      <div className="flex flex-col gap-3 rounded-3xl bg-[var(--hv2-navy)] px-7 py-7 text-[var(--hv2-ivory)]">
        <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
          Today&apos;s entry
        </p>
        <p className="home-v2-display m-0 text-[19px] italic leading-relaxed">
          “
          <span className="border-b-2 border-[var(--hv2-gold)]">
            I can picture the studio so clearly
          </span>
          . But{" "}
          <span className="border-b-2 border-[var(--hv2-gold)]">
            who am I to charge for this?
          </span>{" "}
          <span className="border-b-2 border-[var(--hv2-gold)]">
            Grateful for a quiet morning
          </span>{" "}
          to dream.”
        </p>
      </div>
      <ArrowDown />
      <div className="flex flex-col gap-4 rounded-3xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-7 py-7">
        <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-tan-text)]">
          Patterns this month
        </p>
        {(
          [
            ["Vision", "78%"],
            ["Self-doubt", "52%"],
            ["Gratitude", "36%"],
          ] as const
        ).map(([label, width]) => (
          <div key={label} className="flex flex-col gap-2">
            <span className="text-[15px]">{label}</span>
            <div className="h-2 rounded-full bg-[var(--hv2-card-track)]">
              <div
                className="h-2 rounded-full bg-[var(--hv2-navy)]"
                style={{ width }}
              />
            </div>
          </div>
        ))}
        <span className="pt-1 text-[15px] font-semibold text-[var(--hv2-tan-text)]">
          Turn into a meditation →
        </span>
      </div>
    </div>
  );
}

function ManifestVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-6 rounded-3xl bg-[var(--hv2-navy)] p-10 text-[var(--hv2-ivory)]"
      aria-hidden
    >
      <div className="flex flex-col gap-2.5">
        <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
          Vision board
        </p>
        <div className="grid grid-cols-4 gap-2">
          {["var(--hv2-gold)", "#3A4E6E", "#EFE6D3", "#8A6A34"].map((c) => (
            <div
              key={c}
              className="h-[72px] rounded-[10px]"
              style={{ background: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
          Manifesto
        </p>
        <p className="home-v2-display m-0 text-xl italic leading-snug">
          “I trust my vision and act on it every day.”
        </p>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-[rgba(246,241,231,0.14)] pt-5">
        <p className="home-v2-display m-0 text-[22px]">Open my own studio</p>
        <div className="flex flex-col gap-2 text-[15px]">
          <span>● Price the first collection</span>
          <span className="text-[rgba(246,241,231,0.7)]">○ Find a studio space</span>
          <span className="text-[rgba(246,241,231,0.7)]">○ Open the online shop</span>
        </div>
      </div>
    </div>
  );
}

function FocusVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] items-center gap-8 rounded-3xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-10 py-12"
      aria-hidden
    >
      <span className="home-v2-display flex h-[140px] w-[140px] shrink-0 items-center justify-center rounded-full border-[7px] border-[var(--hv2-line-soft)] border-r-[var(--hv2-gold)] border-t-[var(--hv2-gold)] text-[34px]">
        18:24
      </span>
      <div className="flex flex-col gap-2">
        <p className="home-v2-display m-0 text-2xl leading-snug">
          Price the first collection
        </p>
        <p className="m-0 text-sm text-[var(--hv2-muted)]">
          From Manifest · Open my own studio · step 1 of 3
        </p>
        <p className="m-0 pt-1 text-[13px] text-[var(--hv2-tan-text)]">
          Distracting sites blocked
        </p>
      </div>
    </div>
  );
}

function ChatVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-3.5 rounded-3xl bg-[var(--hv2-navy)] p-10"
      aria-hidden
    >
      <div className="self-end rounded-[18px_18px_4px_18px] bg-[var(--hv2-gold)] px-[18px] py-3.5 text-base text-[var(--hv2-navy)]">
        I keep doubting myself.
      </div>
      <div className="self-start rounded-[18px_18px_18px_4px] bg-[rgba(246,241,231,0.08)] px-[18px] py-3.5 text-base text-[var(--hv2-ivory)]">
        Want a meditation for that?
      </div>
      <span className="self-start rounded-full border border-[rgba(246,241,231,0.3)] px-3.5 py-2 text-sm text-[var(--hv2-ivory)]">
        ▸ Start meditation
      </span>
    </div>
  );
}

const COPY: Record<
  HomeV2ToolId,
  { h2: string; body: string; vignette: ReactNode }
> = {
  meditate: {
    h2: "Feel it before it’s real.",
    body: "Guided meditations written from your own words — your goals, your journal, today’s worries — so every session speaks to exactly where you are.",
    vignette: <MeditateVignette />,
  },
  journal: {
    h2: "Hear what you’ve been telling yourself.",
    body: "Write or speak freely. Consciously surfaces the patterns: the doubts that keep returning, and the dreams that won’t go away.",
    vignette: <JournalVignette />,
  },
  manifest: {
    h2: "Know exactly who you’re becoming.",
    body: "Build your vision board, write your personal manifesto, and turn each goal into next steps you can actually take.",
    vignette: <ManifestVignette />,
  },
  focus: {
    h2: "Give your hours to your dream.",
    body: "A focus timer built around the goals you set in Manifest. Pick a step, start the timer, and distracting sites stay blocked until the session ends.",
    vignette: <FocusVignette />,
  },
  chat: {
    h2: "Never stuck in your own head.",
    body: "A coach that listens, reflects and acts: logging a win, adding a step, or starting a meditation the moment you need one.",
    vignette: <ChatVignette />,
  },
};

type Props = {
  tool: HomeV2ToolId;
  /** Visual on the left (even tools in the alternate pattern). */
  visualLeft?: boolean;
};

export function ToolSection({ tool, visualLeft = false }: Props) {
  const meta = HOME_V2_TOOLS.find((t) => t.id === tool)!;
  const copy = COPY[tool];

  const text = (
    <div className="flex flex-1 basis-0 flex-col gap-[22px]" data-hv2-reveal>
      <Lockup tool={meta.label} size="eyebrow" />
      <h2 className="home-v2-display m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.6px] md:text-[56px] md:leading-[1.05] md:tracking-[-1px]">
        {copy.h2}
      </h2>
      <p className="m-0 text-base leading-relaxed text-[var(--hv2-body)] md:text-[19px] md:leading-[1.6]">
        {copy.body}
      </p>
      <Link
        href={meta.href}
        className="self-start border-b-2 border-[var(--hv2-gold)] pb-1 text-[17px] font-semibold text-[var(--hv2-ink)] hover:text-[var(--hv2-tan-text)]"
      >
        {meta.ctaLabel}
      </Link>
    </div>
  );

  const visual = (
    <div className="w-full md:w-[540px] md:shrink-0" data-hv2-reveal>
      {copy.vignette}
    </div>
  );

  return (
    <section
      id={`tool-${tool}`}
      data-tool={tool}
      className="w-full px-5 py-14 md:px-[min(120px,8vw)] md:py-24"
    >
      <div
        className={`mx-auto flex w-full max-w-[1200px] flex-col items-center gap-10 md:gap-[80px] ${
          visualLeft ? "md:flex-row-reverse" : "md:flex-row"
        }`}
      >
        {text}
        {visual}
      </div>
    </section>
  );
}

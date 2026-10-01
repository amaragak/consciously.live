"use client";

import Link from "next/link";
import { useLayoutEffect, useState, type ReactNode } from "react";
import "@/components/home-v2/home-v2.css";
import {
  HomeV2Chrome,
  HomeV2ScrollChrome,
} from "@/components/home-v2/home-v2-scroll-chrome";
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";
import { JournalVignette } from "@/components/home-v2/tool-vignettes";

/** Same subtle sticky-navy steps as Meditate marketing. */
const BANDS = [
  "home-v2-band home-v2-band--a",
  "home-v2-band home-v2-band--b",
  "home-v2-band home-v2-band--c",
  "home-v2-band home-v2-band--d",
] as const;
const IVORY = "text-[var(--hv2-ink)]";
const MUTED = "text-[var(--hv2-body)]";
const FAINT = "text-[var(--hv2-muted)]";
const GOLD = "text-[var(--hv2-gold)]";
const CARD = "bg-[var(--hv2-navy)] border border-[var(--hv2-card-border)]";
const INSET =
  "bg-[var(--hv2-sticky-bg)] border border-[var(--hv2-card-border)]";

const WRITE_HREF = `/login?mode=signup&next=${encodeURIComponent("/journal")}`;

function WaveBars({ compact = false }: { compact?: boolean }) {
  const heights = compact
    ? [8, 14, 10, 18, 12, 20, 11, 16, 19, 9, 14, 17, 8, 14, 10, 18, 12, 20]
    : [
        10, 18, 12, 24, 16, 28, 14, 20, 26, 12, 18, 22, 10, 18, 12, 24, 16, 28,
        14, 20, 26, 12,
      ];
  return (
    <div className="home-v2-wave flex items-end gap-1" aria-hidden>
      {heights.map((h, i) => (
        <i
          key={i}
          className={i < 5 ? "on" : undefined}
          style={{
            display: "block",
            width: compact ? 3 : 4,
            height: h,
            borderRadius: 2,
            background: i < 5 ? "var(--hv2-gold)" : "rgba(246,241,231,0.25)",
          }}
        />
      ))}
    </div>
  );
}

function SectionCopy({
  eyebrow,
  title,
  lead,
  points,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  points: { title: string; body: string }[];
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[18px]" data-hv2-reveal>
      <span className={`text-xs font-semibold uppercase tracking-[1.6px] ${GOLD}`}>
        {eyebrow}
      </span>
      <h2
        className={`home-v2-display m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY} md:text-[46px]`}
      >
        {title}
      </h2>
      <p
        className={`m-0 max-w-[520px] text-base leading-relaxed ${MUTED} md:text-[19px] md:leading-[1.6]`}
      >
        {lead}
      </p>
      <ul className="m-0 flex list-none flex-col gap-5 p-0">
        {points.map((p) => (
          <li key={p.title} className="min-w-0">
            <h3
              className={`home-v2-display m-0 text-lg font-medium tracking-tight ${IVORY} md:text-xl`}
            >
              {p.title}
            </h3>
            <p className={`mt-1.5 m-0 text-[15px] leading-relaxed ${MUTED} md:text-base`}>
              {p.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Strip({
  band,
  visualLeft,
  text,
  graphic,
  graphicClassName,
}: {
  band: string;
  visualLeft?: boolean;
  text: ReactNode;
  graphic: ReactNode;
  graphicClassName?: string;
}) {
  return (
    <section className={`${band} w-full px-5 py-16 md:px-6 md:py-24`}>
      <div
        className={`mx-auto flex w-full max-w-[1200px] flex-col items-stretch gap-10 md:items-center md:gap-16 ${
          visualLeft ? "md:flex-row-reverse" : "md:flex-row"
        }`}
      >
        {text}
        <div
          className={`w-full shrink-0 md:w-[min(100%,520px)] ${graphicClassName ?? ""}`}
          data-hv2-reveal
        >
          {graphic}
        </div>
      </div>
    </section>
  );
}

function WriteSpeakGraphic() {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:h-[300px]">
      <div className={`flex flex-col gap-2.5 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Typed · 22:41
        </p>
        <p className={`home-v2-display m-0 text-xl ${IVORY}`}>The studio</p>
        <p className={`m-0 text-[13px] leading-relaxed ${MUTED}`}>
          I can picture it so clearly. Clay on the shelves, light through the big
          window.
        </p>
        <p className={`m-0 text-[13px] leading-relaxed ${MUTED}`}>
          But every time I price a piece, the same voice: who am I to charge for
          this?
        </p>
        <p className={`mt-auto m-0 pt-2 text-[12px] ${FAINT}`}>
          Saved to your journal
        </p>
      </div>
      <div className={`flex flex-col gap-2.5 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Spoken · 08:12
        </p>
        <div className="flex items-center gap-3">
          <span
            className="accent-fill-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--hv2-navy)]"
            aria-hidden
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <WaveBars compact />
            <p className={`m-0 mt-1 text-[12px] ${FAINT}`}>1:42</p>
          </div>
        </div>
        <p className={`m-0 text-[13px] leading-relaxed ${MUTED}`}>
          Walked the long way round this morning. Grateful for a quiet hour to
          dream.
        </p>
        <p className={`m-0 text-[13px] leading-relaxed ${MUTED}`}>
          I need more mornings like that.
        </p>
        <p className={`mt-auto m-0 pt-2 text-[12px] ${FAINT}`}>
          Your voice, kept with the words.
        </p>
      </div>
    </div>
  );
}

function InsightsGraphic() {
  return <JournalVignette />;
}

function MeditateHandoffGraphic() {
  return (
    <div className="flex w-full max-w-[540px] flex-col gap-4" aria-hidden>
      <div className={`flex flex-col gap-5 rounded-3xl ${CARD} px-7 py-7`}>
        <p className={`m-0 text-xs font-semibold uppercase tracking-[1.3px] ${GOLD}`}>
          Tonight’s entry
        </p>
        <p className={`home-v2-display m-0 text-[20px] italic leading-relaxed ${IVORY} md:text-[22px]`}>
          “Who am I to charge for this? Every time I name a price I hear it
          again.”
        </p>
        <span className="accent-fill-gradient inline-flex w-fit items-center rounded-full px-5 py-2.5 text-[14px] font-semibold text-[var(--hv2-navy)]">
          Make a meditation
        </span>
      </div>
      <div
        className="flex items-center justify-center text-[22px] text-[var(--hv2-gold)]"
        aria-hidden
      >
        ↓
      </div>
      <div className={`flex flex-col gap-5 rounded-3xl ${CARD} px-7 py-7`}>
        <p className={`m-0 text-xs font-semibold uppercase tracking-[1.3px] ${GOLD}`}>
          You get
        </p>
        <div className="flex items-center gap-4">
          <span className="accent-fill-gradient flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[var(--hv2-navy)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className={`home-v2-display m-0 text-[22px] font-medium leading-snug ${IVORY}`}>
              Worth what you make
            </p>
            <p className={`m-0 text-[13px] ${FAINT}`}>
              From your entry · Beatrice
            </p>
          </div>
        </div>
        <WaveBars />
      </div>
    </div>
  );
}

function GratitudesGraphic() {
  const items = [
    "A quiet morning to dream",
    "The sketch that finally worked",
    "A friend who asked how it’s going",
    "Finished before the light went",
  ];
  return (
    <div className={`rounded-[18px] ${CARD} p-6`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Today
        </p>
        <p className={`m-0 text-[12px] ${FAINT}`}>Sat 27 Sept</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
        {items.map((line) => (
          <li key={line} className="flex items-start gap-3">
            <span className={`mt-0.5 ${GOLD}`} aria-hidden>
              ✦
            </span>
            <span className={`home-v2-display text-[17px] italic leading-snug ${IVORY}`}>
              {line}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportGraphic() {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:h-[240px]">
      <div className={`flex flex-col gap-3 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Paper pages
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(["#E8DFC8", "#D9CCB2", "#C4B49A"] as const).map((c, i) => (
            <div
              key={c}
              className="flex h-[72px] items-end rounded-[10px] px-2 pb-2"
              style={{ background: c }}
            >
              <span className="home-v2-display text-[11px] italic leading-tight text-[var(--hv2-navy)]/70">
                page {i + 1}
              </span>
            </div>
          ))}
        </div>
        <p className={`mt-auto m-0 text-[12px] leading-snug ${FAINT}`}>
          We read the handwriting. You check it.
        </p>
      </div>
      <div className={`flex flex-col gap-2.5 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Or import
        </p>
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {(["Day One", "Markdown", "CSV", "PDF notes"] as const).map((fmt) => (
            <li
              key={fmt}
              className={`rounded-lg ${INSET} px-3 py-2 text-sm ${IVORY}`}
            >
              {fmt}
            </li>
          ))}
        </ul>
        <p className={`mt-auto m-0 text-[12px] ${FAINT}`}>
          Your past writing, ready in one place
        </p>
      </div>
    </div>
  );
}

export function JournalMarketingPage() {
  const [motionReady, setMotionReady] = useState(false);

  useLayoutEffect(() => {
    setMotionReady(true);
  }, []);

  const heroAnim = (delayMs: number) =>
    motionReady
      ? {
          className: "home-v2-hero-anim is-ready",
          style: { animationDelay: `${delayMs}ms` } as const,
        }
      : { className: "home-v2-hero-anim", style: undefined };

  const h1 = heroAnim(0);
  const sub = heroAnim(150);
  const cta = heroAnim(300);

  return (
    <HomeV2ScrollChrome>
      <div className="relative">
        <HomeV2Chrome />

        <section className="home-v2-hero home-v2-hero--under-chrome flex w-full flex-col px-5 pb-16 text-[var(--hv2-hero-fg)] md:px-6 md:pb-24">
          <div className="relative z-[1] mx-auto flex w-full max-w-[1200px] flex-col items-center gap-5 pt-10 text-center md:gap-[22px] md:pt-14">
            <h1
              className={`home-v2-display m-0 w-full max-w-[18ch] text-[34px] font-[350] leading-[1.08] tracking-[-0.8px] text-[var(--hv2-hero-fg)] sm:text-[44px] md:max-w-none md:text-[clamp(44px,5vw,64px)] md:tracking-[-1px] ${h1.className}`}
              style={h1.style}
            >
              Hear what you’ve been telling yourself.
            </h1>
            <p
              className={`m-0 max-w-[36rem] text-base text-[var(--hv2-hero-muted)] sm:text-lg md:text-[21px] md:leading-[1.5] ${sub.className}`}
              style={sub.style}
            >
              Write it, say it, or bring your old notebooks. Consciously notices
              what keeps coming back.
            </p>
            <div className={cta.className} style={cta.style}>
              <Link
                href={WRITE_HREF}
                className="accent-fill-gradient inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-[17px] font-semibold text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
              >
                <HomeV2ToolIcon tool="journal" />
                Write your first entry
              </Link>
            </div>
          </div>
        </section>

        <Strip
          band={BANDS[0]}
          text={
            <SectionCopy
              eyebrow="Write or speak"
              title="Say it however it comes out."
              lead="A careful paragraph or a voice note on the walk home. Same private page."
              points={[
                {
                  title: "Type",
                  body: "A quiet page, no one to perform for.",
                },
                {
                  title: "Speak",
                  body: "Talk it out. Your recording stays with the words.",
                },
              ]}
            />
          }
          graphic={<WriteSpeakGraphic />}
        />

        <Strip
          band={BANDS[1]}
          visualLeft
          text={
            <SectionCopy
              eyebrow="Insights"
              title="See what keeps coming back."
              lead="The doubt you keep writing. The dream that won’t let go. See the patterns, and exactly where they came from."
              points={[
                {
                  title: "A letter when you ask",
                  body: "A reflection on any stretch of time. Nothing is written until you ask.",
                },
                {
                  // Settings private-default AI opt-in not shipped yet — keep honest.
                  title: "Only for you",
                  body: "Built from your writing. Only you can see it.",
                },
              ]}
            />
          }
          graphic={<InsightsGraphic />}
        />

        <Strip
          band={BANDS[2]}
          text={
            <SectionCopy
              eyebrow="Journal → Meditate"
              title="Turn a heavy page into something you can sit with."
              lead="Then do something with it. One tap makes a meditation from that exact entry."
              points={[
                {
                  title: "No explaining twice",
                  body: "The session already knows what’s going on.",
                },
                {
                  title: "Linked to your goals",
                  body: "Connect an entry to a life area in Manifest.",
                },
              ]}
            />
          }
          graphic={<MeditateHandoffGraphic />}
        />

        <Strip
          band={BANDS[3]}
          visualLeft
          text={
            <SectionCopy
              eyebrow="Gratitudes"
              title="Keep the good bits too."
              lead="Log the small wins as they happen, so the hard days aren’t the only ones on record."
              points={[
                {
                  title: "In the moment",
                  body: "One line, before it fades.",
                },
                {
                  title: "One thread",
                  body: "The thanks sit beside the struggles.",
                },
              ]}
            />
          }
          graphic={<GratitudesGraphic />}
        />

        <Strip
          band={BANDS[0]}
          text={
            <SectionCopy
              eyebrow="Bring your past"
              title="Your old notebooks belong here too."
              lead="Photograph handwritten pages, or import from Day One, Markdown, CSV or PDF notes."
              points={[
                {
                  title: "Paper pages",
                  body: "We read the handwriting; you check it before saving.",
                },
                {
                  title: "Other apps",
                  body: "Bring your archive and keep writing in one place.",
                },
              ]}
            />
          }
          graphic={<ImportGraphic />}
        />

        <section className={`${BANDS[1]} w-full px-5 py-14 md:px-6 md:py-20`}>
          <div
            className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 md:flex-row md:items-center md:justify-between"
            data-hv2-reveal
          >
            <div className="flex flex-col gap-2.5">
              <h2
                className={`home-v2-display m-0 text-[30px] font-normal tracking-tight ${IVORY} md:text-[46px]`}
              >
                Start with one line tonight.
              </h2>
              <p className={`m-0 text-base ${MUTED} md:text-lg`}>
                Whenever you’re ready.
              </p>
            </div>
            <Link
              href={WRITE_HREF}
              className="accent-fill-gradient inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[17px] font-semibold text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
            >
              <HomeV2ToolIcon tool="journal" />
              Write your first entry
            </Link>
          </div>
        </section>
      </div>
    </HomeV2ScrollChrome>
  );
}

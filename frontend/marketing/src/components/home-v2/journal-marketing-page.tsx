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
const MOBILE_CARD =
  `flex flex-col gap-2.5 overflow-hidden rounded-[14px] ${CARD} px-4 py-3.5`;
const CARD_LABEL = `m-0 text-[10px] font-normal uppercase tracking-[1.4px] ${GOLD}`;
const HAIRLINE = "h-px bg-[var(--hv2-card-border)]";

const WRITE_HREF = `/login?mode=signup&next=${encodeURIComponent("/journal")}`;

const PAPER_PAGES = [
  { bg: "#E8DFC8", label: "page 1" },
  { bg: "#D9CCB2", label: "page 2" },
  { bg: "#C4B49A", label: "page 3" },
] as const;

const IMPORT_FORMATS = ["Day One", "Markdown", "CSV", "PDF notes"] as const;

const GRATITUDE_ITEMS = [
  "A quiet morning to dream",
  "The sketch that finally worked",
  "A friend who asked how it’s going",
  "Finished before the light went",
] as const;

const PATTERN_BARS = [
  { label: "Vision", width: "78%", accent: true },
  { label: "Self-doubt", width: "52%", accent: false },
  { label: "Gratitude", width: "36%", accent: false },
  { label: "Calm", width: "28%", accent: false },
] as const;

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

function MobileWaveBars() {
  const heights = [
    8, 14, 10, 18, 12, 20, 9, 8, 14, 10, 18, 12, 20, 9, 8, 14, 10, 18, 12, 20, 9,
    8,
  ];
  return (
    <span
      className="flex h-5 flex-1 items-center gap-[3px]"
      aria-hidden
    >
      {heights.map((h, i) => (
        <i
          key={i}
          style={{
            display: "block",
            width: 3,
            height: h,
            borderRadius: 2,
            background:
              i < 5 ? "var(--hv2-gold)" : "rgba(246,241,231,0.25)",
          }}
        />
      ))}
    </span>
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
    <div
      className="flex min-w-0 flex-1 flex-col gap-3 md:gap-[18px]"
      data-hv2-reveal
    >
      <span
        className={`text-[11px] font-semibold uppercase tracking-[1.6px] ${GOLD} md:text-xs`}
      >
        {eyebrow}
      </span>
      <h2
        className={`home-v2-display m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY} md:text-[46px]`}
      >
        {title}
      </h2>
      <p
        className={`m-0 mb-1 max-w-[520px] text-[15px] leading-[1.55] ${MUTED} md:mb-0 md:text-[19px] md:leading-[1.6]`}
      >
        {lead}
      </p>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 pb-1 md:gap-5 md:pb-0">
        {points.map((p) => (
          <li key={p.title} className="flex min-w-0 flex-col gap-0.5 md:block">
            <h3
              className={`home-v2-display m-0 text-[17px] font-normal ${IVORY} md:text-xl md:font-medium md:tracking-tight`}
            >
              {p.title}
            </h3>
            <p
              className={`m-0 text-[14px] leading-[1.5] text-[var(--hv2-muted)] md:mt-1.5 md:text-base md:leading-relaxed md:text-[var(--hv2-body)]`}
            >
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
    <section
      className={`${band} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-10 md:border-t-0 md:px-6 md:py-24`}
    >
      <div
        className={`mx-auto flex w-full max-w-[1200px] flex-col items-stretch gap-3 md:items-center md:gap-16 ${
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
    <>
      {/* Mobile: one card, typed + spoken */}
      <div className={`${MOBILE_CARD} md:hidden`} aria-hidden>
        <p className={CARD_LABEL}>Typed, 22:41</p>
        <p className={`home-v2-display m-0 text-[17px] ${IVORY}`}>The studio</p>
        <p className={`m-0 text-[14px] leading-[1.5] ${MUTED}`}>
          I can picture it so clearly. Clay on the shelves, light through the big
          window. But every time I price a piece, the same voice: who am I to
          charge for this?
        </p>
        <div className={HAIRLINE} />
        <p className={CARD_LABEL}>Spoken, 08:12 · transcribed</p>
        <div className="flex items-center gap-2.5">
          <span
            className="accent-fill-gradient flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--hv2-on-gold)]"
            aria-hidden
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <MobileWaveBars />
          <span className={`shrink-0 text-[12px] ${FAINT}`}>1:12</span>
        </div>
        <p className={`m-0 text-[14px] leading-[1.5] ${MUTED}`}>
          <span
            className={`mr-2 inline-flex translate-y-[-1px] items-center rounded-full border border-[color-mix(in_srgb,var(--hv2-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--hv2-gold)_16%,transparent)] px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] ${GOLD}`}
          >
            Transcribed
          </span>
          Walked the long way round this morning. Grateful for a quiet hour to
          dream.
        </p>
        <p className={`m-0 text-[12px] ${FAINT}`}>
          Transcribed for you. Your voice stays with the words.
        </p>
      </div>

      {/* Desktop */}
      <div className="hidden grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid md:h-[300px]">
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
            Spoken, 08:12 · transcribed
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
            <span
              className={`mr-2 inline-flex translate-y-[-1px] items-center rounded-full border border-[color-mix(in_srgb,var(--hv2-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--hv2-gold)_16%,transparent)] px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-[0.08em] ${GOLD}`}
            >
              Transcribed
            </span>
            Walked the long way round this morning. Grateful for a quiet hour to
            dream.
          </p>
          <p className={`m-0 text-[13px] leading-relaxed ${MUTED}`}>
            I need more mornings like that.
          </p>
          <p className={`mt-auto m-0 pt-2 text-[12px] ${FAINT}`}>
            Transcribed for you. Your voice stays with the words.
          </p>
        </div>
      </div>
    </>
  );
}

function InsightsGraphic() {
  return (
    <>
      {/* Mobile: one card, entries + 2×2 patterns */}
      <div className={`${MOBILE_CARD} md:hidden`} aria-hidden>
        <p className={CARD_LABEL}>Your entries</p>
        <p
          className={`home-v2-display m-0 text-[15px] italic leading-[1.45] ${IVORY}`}
        >
          “I can picture{" "}
          <span className="underline decoration-dotted decoration-[var(--hv2-gold)] underline-offset-[3px]">
            the studio
          </span>{" "}
          so clearly. But{" "}
          <span className="underline decoration-dotted decoration-[var(--hv2-gold)] underline-offset-[3px]">
            who am I to charge
          </span>{" "}
          for this?”
        </p>
        <p
          className={`home-v2-display m-0 text-[15px] italic leading-[1.45] ${IVORY}`}
        >
          “Priced the first piece today. Still felt like{" "}
          <span className="underline decoration-dotted decoration-[var(--hv2-gold)] underline-offset-[3px]">
            I was asking too much
          </span>
          .”
        </p>
        <p className={`m-0 text-[12px] ${FAINT}`}>Mon 22 & Thu 25 Sept</p>
        <div className={HAIRLINE} />
        <p className={CARD_LABEL}>Patterns this month</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
          {PATTERN_BARS.map((bar) => (
            <div key={bar.label} className="flex flex-col gap-1">
              <span className={`text-[12px] ${MUTED}`}>{bar.label}</span>
              <div className="h-1.5 rounded-full bg-[var(--hv2-card-track)]">
                <div
                  className={`h-1.5 rounded-full ${
                    bar.accent ? "bg-[var(--hv2-gold)]" : "bg-[var(--hv2-muted)]"
                  }`}
                  style={{ width: bar.width }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className={`m-0 text-[12px] ${FAINT}`}>From 9 entries</p>
        <span className={`text-[13px] font-semibold ${GOLD}`}>
          Turn this into a meditation →
        </span>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <JournalVignette />
      </div>
    </>
  );
}

function MeditateHandoffGraphic() {
  return (
    <>
      {/* Mobile: one card */}
      <div className={`${MOBILE_CARD} md:hidden`} aria-hidden>
        <p className={CARD_LABEL}>Tonight’s entry</p>
        <p
          className={`home-v2-display m-0 text-[15px] italic leading-[1.45] ${IVORY}`}
        >
          “Who am I to charge for this? Every time I name a price I hear it
          again.”
        </p>
        <span className="accent-fill-gradient inline-flex w-fit items-center rounded-full px-3.5 py-[7px] text-[13px] font-semibold text-[var(--hv2-on-gold)]">
          Make a meditation
        </span>
        <div className={HAIRLINE} />
        <p className={CARD_LABEL}>You get</p>
        <div className="flex items-center gap-3">
          <span
            className="accent-fill-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--hv2-on-gold)]"
            aria-hidden
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className={`home-v2-display m-0 text-[16px] ${IVORY}`}>
              Worth what you make
            </p>
            <p className={`m-0 text-[12px] ${FAINT}`}>
              From your entry · Soft voice
            </p>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden w-full max-w-[540px] flex-col gap-4 md:flex" aria-hidden>
        <div className={`flex flex-col gap-5 rounded-3xl ${CARD} px-7 py-7`}>
          <p className={`m-0 text-xs font-semibold uppercase tracking-[1.3px] ${GOLD}`}>
            Tonight’s entry
          </p>
          <p
            className={`home-v2-display m-0 text-[20px] italic leading-relaxed ${IVORY} md:text-[22px]`}
          >
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
              <p
                className={`home-v2-display m-0 text-[22px] font-medium leading-snug ${IVORY}`}
              >
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
    </>
  );
}

function GratitudesGraphic() {
  return (
    <>
      {/* Mobile */}
      <div className={`${MOBILE_CARD} md:hidden`} aria-hidden>
        <p className={CARD_LABEL}>Today</p>
        <div>
          {GRATITUDE_ITEMS.map((line) => (
            <div
              key={line}
              className="flex items-baseline gap-2.5 border-t border-[var(--hv2-card-border)] py-[9px]"
            >
              <span className={`text-[12px] ${GOLD}`} aria-hidden>
                ✦
              </span>
              <span
                className={`home-v2-display text-[15px] italic leading-[1.45] ${IVORY}`}
              >
                {line}
              </span>
            </div>
          ))}
        </div>
        <p className={`m-0 text-[12px] ${FAINT}`}>Sat 27 Sept</p>
      </div>

      {/* Desktop */}
      <div className={`hidden rounded-[18px] ${CARD} p-6 md:block`}>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
            Today
          </p>
          <p className={`m-0 text-[12px] ${FAINT}`}>Sat 27 Sept</p>
        </div>
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {GRATITUDE_ITEMS.map((line) => (
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
    </>
  );
}

function ImportGraphic() {
  return (
    <>
      {/* Mobile: one card, paper + chips */}
      <div className={`${MOBILE_CARD} md:hidden`} aria-hidden>
        <p className={CARD_LABEL}>Paper pages</p>
        <div className="flex gap-1.5">
          {PAPER_PAGES.map((page) => (
            <div
              key={page.label}
              className="box-border flex h-[72px] min-w-0 flex-1 items-end rounded-lg px-2 pb-1.5"
              style={{ background: page.bg }}
            >
              <span className="home-v2-display text-[12px] italic leading-tight text-[var(--hv2-navy)]/70">
                {page.label}
              </span>
            </div>
          ))}
        </div>
        <p className={`m-0 text-[12px] ${FAINT}`}>
          We read the handwriting. You check it.
        </p>
        <div className={HAIRLINE} />
        <p className={CARD_LABEL}>Or import</p>
        <div className="flex flex-wrap gap-1.5">
          {IMPORT_FORMATS.map((fmt, i) => (
            <span
              key={fmt}
              className={`whitespace-nowrap rounded-full px-[13px] py-[7px] text-[13px] ${
                i === 0
                  ? "bg-[var(--hv2-gold)] font-semibold text-[var(--hv2-on-gold)]"
                  : `border border-[var(--hv2-card-border)] ${MUTED}`
              }`}
            >
              {fmt}
            </span>
          ))}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid md:h-[240px]">
        <div className={`flex flex-col gap-3 rounded-[18px] ${CARD} p-5`}>
          <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
            Paper pages
          </p>
          <div className="grid grid-cols-3 gap-2">
            {PAPER_PAGES.map((page) => (
              <div
                key={page.label}
                className="flex h-[72px] items-end rounded-[10px] px-2 pb-2"
                style={{ background: page.bg }}
              >
                <span className="home-v2-display text-[11px] italic leading-tight text-[var(--hv2-navy)]/70">
                  {page.label}
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
            {IMPORT_FORMATS.map((fmt) => (
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
    </>
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

        <section className="home-v2-hero home-v2-hero--under-chrome flex w-full flex-col px-5 pb-10 text-[var(--hv2-hero-fg)] md:px-6 md:pb-24">
          <div className="relative z-[1] mx-auto flex w-full max-w-[1200px] flex-col items-center gap-4 pt-9 text-center md:gap-[22px] md:pt-14">
            <h1
              className={`home-v2-display m-0 w-full max-w-[18ch] text-[40px] font-normal leading-[1.06] tracking-[-0.6px] text-[var(--hv2-hero-fg)] md:max-w-none md:text-[clamp(44px,5vw,64px)] md:font-[350] md:tracking-[-1px] ${h1.className}`}
              style={h1.style}
            >
              Hear what you’ve been telling yourself.
            </h1>
            <p
              className={`m-0 max-w-[36rem] text-[16px] leading-[1.5] text-[var(--hv2-hero-muted)] md:text-[21px] ${sub.className}`}
              style={sub.style}
            >
              Write it, say it, or bring your old notebooks. Consciously notices
              what keeps coming back.
            </p>
            <div className={`w-full md:w-auto ${cta.className}`} style={cta.style}>
              <Link
                href={WRITE_HREF}
                className="accent-fill-gradient mt-1.5 inline-flex h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-7 text-[16px] font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 md:mt-0 md:h-auto md:w-auto md:py-3.5 md:text-[17px] md:text-[var(--hv2-navy)]"
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
              lead="A careful paragraph, or a voice note on the walk home that’s transcribed for you. Same private page."
              points={[
                {
                  title: "Type",
                  body: "A quiet page, no one to perform for.",
                },
                {
                  title: "Speak",
                  body: "Talk it out. It’s transcribed as you go, and the recording stays with the words.",
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
                  title: "A letter from your entries",
                  body: "When you ask, Consciously reads the pages you choose and writes you a private letter about what keeps showing up — so you can see yourself more clearly.",
                },
                {
                  title: "Patterns you can see",
                  body: "Themes from your writing — vision, doubt, gratitude, calm — shown as simple bars, with the exact lines they came from underlined in your entries.",
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

        <section
          className={`${BANDS[1]} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-11 md:border-t-0 md:px-6 md:py-20`}
        >
          <div
            className="mx-auto flex max-w-[1200px] flex-col items-stretch gap-3.5 text-center md:flex-row md:items-center md:justify-between md:gap-6 md:text-left"
            data-hv2-reveal
          >
            <div className="flex flex-col gap-3.5 md:gap-2.5">
              <h2
                className={`home-v2-display m-0 text-[32px] font-normal leading-[1.1] tracking-tight ${IVORY} md:text-[46px]`}
              >
                Start with one line tonight.
              </h2>
              <p className={`m-0 text-[15px] ${MUTED} md:text-lg`}>
                Whenever you’re ready.
              </p>
            </div>
            <Link
              href={WRITE_HREF}
              className="accent-fill-gradient mt-1.5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-7 text-[16px] font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 md:mt-0 md:h-auto md:w-auto md:py-3.5 md:text-[17px] md:text-[var(--hv2-navy)]"
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

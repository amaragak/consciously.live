"use client";

import Link from "next/link";
import { useLayoutEffect, useState, type ReactNode } from "react";
import "@/components/home-v2/home-v2.css";
import {
  HomeV2Chrome,
  HomeV2ScrollChrome,
} from "@/components/home-v2/home-v2-scroll-chrome";
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";

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

const CTA_HREF = `/login?mode=signup&next=${encodeURIComponent("/focus")}`;

function WaveBars() {
  const heights = [
    10, 18, 12, 24, 16, 28, 14, 20, 26, 12, 18, 22, 10, 18, 12, 24, 16, 28, 14,
    20, 26, 12,
  ];
  return (
    <div className="home-v2-wave flex w-full items-end justify-between gap-1" aria-hidden>
      {heights.map((h, i) => (
        <i
          key={i}
          style={{
            display: "block",
            width: 4,
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
  comingSoon,
}: {
  eyebrow?: string;
  title: string;
  lead: ReactNode;
  points: { title: string; body: ReactNode }[];
  comingSoon?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[18px]" data-hv2-reveal>
      {comingSoon ? (
        <span className="inline-flex w-fit rounded-full border border-[rgb(var(--hv2-gold-rgb)/0.45)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[1.4px] text-[var(--hv2-gold)]">
          Coming soon · Chrome
        </span>
      ) : eyebrow ? (
        <span className={`text-xs font-semibold uppercase tracking-[1.6px] ${GOLD}`}>
          {eyebrow}
        </span>
      ) : null}
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
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {points.map((p) => (
          <li key={p.title} className="flex flex-col gap-1">
            <p className={`home-v2-display m-0 text-lg ${IVORY}`}>{p.title}</p>
            <p className={`m-0 text-[15px] leading-relaxed ${MUTED}`}>{p.body}</p>
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
          className={`w-full shrink-0 ${graphicClassName ?? "md:w-[min(100%,520px)]"}`}
          data-hv2-reveal
        >
          {graphic}
        </div>
      </div>
    </section>
  );
}

function TimerRing({
  time,
  sizeClass = "h-[120px] w-[120px]",
  borderClass = "border-[6px]",
  timeClass = "text-[26px]",
}: {
  time: string;
  sizeClass?: string;
  borderClass?: string;
  timeClass?: string;
}) {
  return (
    <span
      className={`home-v2-display flex shrink-0 items-center justify-center rounded-full border-[var(--hv2-line-soft)] border-r-[var(--hv2-gold)] border-t-[var(--hv2-gold)] ${sizeClass} ${borderClass} ${IVORY} ${timeClass}`}
      aria-hidden
    >
      {time}
    </span>
  );
}

function TimerGraphic() {
  const upNext = [
    { text: "Photograph every piece", source: "Studio" },
    { text: "Reply to the gallery", source: "Your To Do" },
    { text: "Book the kiln", source: "Your To Do" },
  ] as const;

  return (
    <div
      className={`flex flex-col gap-5 rounded-[18px] ${CARD} p-5 sm:flex-row sm:items-center md:h-[290px]`}
      aria-hidden
    >
      <div className="flex flex-col items-center gap-2 sm:shrink-0">
        <TimerRing
          time="18:24"
          sizeClass="h-[128px] w-[128px]"
          borderClass="border-[7px]"
          timeClass="text-[28px]"
        />
        <p className={`m-0 text-[12px] ${FAINT}`}>Focus · 25 min</p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div>
          <p className={`m-0 text-[10px] font-semibold uppercase tracking-[1.3px] ${GOLD}`}>
            Now
          </p>
          <p className={`home-v2-display m-0 mt-1 text-[18px] leading-snug ${IVORY}`}>
            Price the collection
          </p>
          <p className={`m-0 mt-0.5 text-[12px] ${FAINT}`}>
            From Manifest · Studio
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className={`m-0 text-[10px] font-semibold uppercase tracking-[1.3px] ${GOLD}`}>
            Up next
          </p>
          {upNext.map((t) => (
            <div
              key={t.text}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${INSET}`}
            >
              <span
                className="flex h-4 w-4 shrink-0 rounded border border-[var(--hv2-line)]"
                aria-hidden
              />
              <span className={`min-w-0 flex-1 truncate text-[13px] ${IVORY}`}>
                {t.text}
              </span>
              <span className={`shrink-0 text-[11px] ${FAINT}`}>{t.source}</span>
            </div>
          ))}
          <p className={`m-0 pl-1 pt-0.5 text-[12px] ${FAINT}`}>+ Add a To Do</p>
        </div>
      </div>
    </div>
  );
}

function BeforeStartGraphic() {
  const tasks = [
    "Price the collection",
    "Photograph every piece",
    "Reply to the gallery",
  ] as const;

  return (
    <div className="flex flex-col items-stretch gap-3.5 md:h-[200px] md:flex-row md:items-center">
      <div className={`flex min-w-0 flex-1 flex-col gap-2.5 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          This session
        </p>
        {tasks.map((t) => (
          <div key={t} className="flex items-center gap-2.5">
            <span
              className="flex h-4 w-4 shrink-0 rounded border border-[var(--hv2-line)]"
              aria-hidden
            />
            <span className={`text-[14px] leading-snug ${IVORY}`}>{t}</span>
          </div>
        ))}
      </div>
      <span
        className="hidden shrink-0 text-[22px] text-[var(--hv2-gold)] md:inline"
        aria-hidden
      >
        →
      </span>
      <span
        className="flex justify-center text-[22px] text-[var(--hv2-gold)] md:hidden"
        aria-hidden
      >
        ↓
      </span>
      <div className={`flex min-w-0 flex-1 flex-col gap-3 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Before you start
        </p>
        <div className="flex items-center gap-3.5">
          <span className="accent-fill-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--hv2-navy)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className={`home-v2-display m-0 text-[18px] leading-snug ${IVORY}`}>
              Steady hands
            </p>
            <p className={`m-0 text-[12px] ${FAINT}`}>
              2 min · made from this session
            </p>
          </div>
        </div>
        <WaveBars />
      </div>
    </div>
  );
}

function SoundGraphic() {
  const chips = [
    { label: "Music", on: true },
    { label: "Ambience", on: true },
    { label: "Drums", on: false },
    { label: "Noise", on: false },
    { label: "Soundscape", on: false },
  ] as const;
  const levels = [
    { label: "Music", pct: 55 },
    { label: "Ambience", pct: 40 },
  ] as const;

  return (
    <div className={`flex flex-col gap-4 rounded-[18px] ${CARD} p-5 md:h-[190px]`} aria-hidden>
      <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
        Playing while you work
      </p>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span
            key={c.label}
            className={`rounded-full px-3.5 py-1.5 text-[13px] ${
              c.on
                ? "bg-[var(--hv2-gold)] font-semibold text-[var(--hv2-on-gold)]"
                : `border border-[var(--hv2-line)] ${FAINT}`
            }`}
          >
            {c.label}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2.5">
        {levels.map((l) => (
          <div key={l.label} className="flex items-center gap-3">
            <span className={`w-16 shrink-0 text-[12px] ${FAINT}`}>{l.label}</span>
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[rgba(246,241,231,0.12)]">
              <span
                className="block h-full rounded-full bg-[var(--hv2-gold)]"
                style={{ width: `${l.pct}%` }}
              />
            </span>
          </div>
        ))}
      </div>
      <p className={`m-0 text-[12px] ${FAINT}`}>
        Mix the room while the clock runs
      </p>
    </div>
  );
}

function ExpectStrip() {
  const tiles = [
    { title: "15", body: "Minutes" },
    { title: "25", body: "Default" },
    { title: "50", body: "Longer block" },
    { title: "Short break", body: "5 minutes" },
    { title: "Long break", body: "15 minutes" },
  ] as const;

  return (
    <section className={`${BANDS[3]} w-full px-5 py-14 md:px-6 md:py-[72px]`}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8" data-hv2-reveal>
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-10">
          <h2
            className={`home-v2-display m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY} md:text-[46px]`}
          >
            The timer you’d expect.
          </h2>
          <p className={`m-0 max-w-[420px] text-base leading-relaxed ${MUTED} md:text-right md:text-[17px]`}>
            Focus lengths and breaks, without leaving your goals.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.title} className={`rounded-[18px] ${CARD} px-4 py-5`}>
              <p className={`home-v2-display m-0 text-xl ${IVORY}`}>{t.title}</p>
              <p className={`m-0 mt-1 text-[13px] ${FAINT}`}>{t.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChromeGraphic() {
  const blocked = ["Social feeds", "News", "Shopping"] as const;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[18px] ${CARD} md:h-[280px]`}
      aria-hidden
    >
      <div className="flex items-center gap-2 border-b border-[var(--hv2-card-border)] px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <i className="block h-2.5 w-2.5 rounded-full bg-[rgba(246,241,231,0.25)]" />
          <i className="block h-2.5 w-2.5 rounded-full bg-[rgba(246,241,231,0.25)]" />
          <i className="block h-2.5 w-2.5 rounded-full bg-[rgba(246,241,231,0.25)]" />
        </span>
        <span
          className={`rounded-t-md border border-b-0 border-[var(--hv2-card-border)] bg-[var(--hv2-sticky-bg)] px-3 py-1 text-[11px] ${FAINT}`}
        >
          New tab
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <div className="flex flex-col items-center gap-2 sm:shrink-0">
          <TimerRing
            time="18:24"
            sizeClass="h-24 w-24"
            borderClass="border-[5px]"
            timeClass="text-[20px]"
          />
          <p className={`home-v2-display m-0 max-w-[9rem] text-center text-[15px] leading-snug ${IVORY}`}>
            Price the collection
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <p className={`m-0 text-[10px] font-semibold uppercase tracking-[1.3px] ${GOLD}`}>
            Blocked until the bell
          </p>
          {blocked.map((b) => (
            <div
              key={b}
              className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 ${INSET}`}
            >
              <span className={`text-[14px] ${IVORY}`}>{b}</span>
              <span className={`text-[11px] font-semibold uppercase tracking-[1px] ${GOLD}`}>
                Blocked
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FocusMarketingPage() {
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
              className={`home-v2-display m-0 w-full max-w-[16ch] text-[34px] font-[350] leading-[1.08] tracking-[-0.8px] text-[var(--hv2-hero-fg)] sm:text-[44px] md:max-w-none md:text-[clamp(44px,5vw,64px)] md:tracking-[-1px] ${h1.className}`}
              style={h1.style}
            >
              Give your hours to your dream.
            </h1>
            <p
              className={`m-0 max-w-[34rem] text-base text-[var(--hv2-hero-muted)] sm:text-lg md:text-[21px] md:leading-[1.5] ${sub.className}`}
              style={sub.style}
            >
              Pick the step. Start the timer. Stay with it.
            </p>
            <div className={cta.className} style={cta.style}>
              <Link
                href={CTA_HREF}
                className="accent-fill-gradient inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[17px] font-semibold text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
              >
                <HomeV2ToolIcon tool="focus" />
                Start a focus session
              </Link>
            </div>
          </div>
        </section>

        <Strip
          band={BANDS[0]}
          text={
            <SectionCopy
              eyebrow="The timer"
              title="Start from what matters."
              lead="Your own To Dos, or the next steps from a goal. One task on the clock at a time."
              points={[
                {
                  title: "Type your own",
                  body: "Add To Dos straight on the timer.",
                },
                {
                  title: "Or pull from Manifest",
                  body: "A goal’s next steps line up, and ticking one off counts as progress on the goal.",
                },
              ]}
            />
          }
          graphic={<TimerGraphic />}
        />

        <Strip
          band={BANDS[1]}
          visualLeft
          graphicClassName="md:w-[min(100%,560px)]"
          text={
            <SectionCopy
              eyebrow="Before you start"
              title="Set your head first."
              lead="An optional two-minute meditation made from the tasks in front of you."
              points={[
                {
                  title: "Made from your list",
                  body: "It knows what you’re about to do, and why it matters.",
                },
                {
                  title: "Then start when you’re ready",
                  body: "Play the visualisation, then hit start on the timer.",
                },
              ]}
            />
          }
          graphic={<BeforeStartGraphic />}
        />

        <Strip
          band={BANDS[2]}
          text={
            <SectionCopy
              eyebrow="Sound"
              title="Work to the right sound."
              lead="Focus sounds while the clock runs — mix the room to suit the work."
              points={[
                {
                  title: "Mix the room",
                  body: "Music, ambience, drums, noise. Set each level.",
                },
                {
                  title: "Or a soundscape",
                  body: "Drop in a ready-made mix and keep going.",
                },
              ]}
            />
          }
          graphic={<SoundGraphic />}
        />

        <ExpectStrip />

        <Strip
          band={BANDS[0]}
          visualLeft
          text={
            <SectionCopy
              comingSoon
              title="Distraction blocking for the session."
              lead="Sites that pull you away stay blocked until the timer ends."
              points={[
                {
                  title: "Focus on every new tab",
                  body: "Your timer and next step, wherever you open a tab.",
                },
                {
                  title: "Until the bell",
                  body: "The block lasts as long as the session. Then it lifts.",
                },
              ]}
            />
          }
          graphic={<ChromeGraphic />}
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
                What’s the next step?
              </h2>
              <p className={`m-0 text-base ${MUTED} md:text-lg`}>
                Give it twenty-five minutes.
              </p>
            </div>
            <Link
              href={CTA_HREF}
              className="accent-fill-gradient inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[17px] font-semibold text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
            >
              <HomeV2ToolIcon tool="focus" />
              Start a focus session
            </Link>
          </div>
        </section>
      </div>
    </HomeV2ScrollChrome>
  );
}

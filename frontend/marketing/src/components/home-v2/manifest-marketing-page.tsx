"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useState, type ReactNode } from "react";
import "@/components/home-v2/home-v2.css";
import {
  HomeV2Chrome,
  HomeV2ScrollChrome,
} from "@/components/home-v2/home-v2-scroll-chrome";
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";
import { WaveBars } from "@/components/home-v2/tool-vignettes";

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

const CTA_HREF = `/login?mode=signup&next=${encodeURIComponent("/manifest")}`;

const VISION_IMAGES = [
  "/demo/vision-board/demo-vision-work.png",
  "/demo/vision-board/demo-vision-mountain.png",
  "/demo/vision-board/demo-vision-music.png",
  "/demo/vision-board/demo-vision-city.png",
  "/demo/vision-board/demo-vision-gym.png",
  "/demo/vision-board/demo-vision-wealth.png",
] as const;

function SectionCopy({
  eyebrow,
  title,
  lead,
  points,
}: {
  eyebrow: string;
  title: string;
  lead: ReactNode;
  points: { title: string; body: ReactNode }[];
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
          className={`w-full shrink-0 ${graphicClassName ?? "md:w-[min(100%,520px)]"}`}
          data-hv2-reveal
        >
          {graphic}
        </div>
      </div>
    </section>
  );
}

function VisionBoardGraphic() {
  return (
    <div
      className={`relative overflow-hidden rounded-[18px] ${CARD} p-3 md:h-[340px]`}
      aria-hidden
    >
      <div className="grid h-full grid-cols-2 gap-1.5 sm:grid-cols-3">
        {VISION_IMAGES.map((src) => (
          <div key={src} className="relative min-h-[100px] overflow-hidden rounded-[10px] md:min-h-0">
            <Image
              src={src}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 170px"
            />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
        <div className="max-w-[90%] rounded-2xl border border-[rgba(246,241,231,0.16)] bg-[rgba(15,27,45,0.78)] px-5 py-4 text-center backdrop-blur-[6px] md:px-7 md:py-5">
          <p className={`home-v2-display m-0 text-[17px] italic leading-snug ${IVORY} md:text-[20px]`}>
            “I make things with my hands, and I charge what they’re worth.”
          </p>
          <p className={`m-0 mt-2 text-[12px] ${FAINT}`}>
            Your manifesto line, over your board
          </p>
        </div>
      </div>
    </div>
  );
}

function ManifestoGraphic() {
  const values = ["Craft", "Courage", "Family", "Freedom"] as const;
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:h-[260px]">
      <div className={`flex flex-col rounded-[18px] ${CARD} px-5 py-5`}>
        <p className={`m-0 mb-3 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Values
        </p>
        <ul className="m-0 flex list-none flex-col p-0">
          {values.map((v, i) => (
            <li
              key={v}
              className={`flex items-baseline gap-3 py-2.5 ${
                i > 0 ? "border-t border-[var(--hv2-card-border)]" : ""
              }`}
            >
              <span className={`text-[12px] tabular-nums ${FAINT}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={`home-v2-display text-lg ${IVORY}`}>{v}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={`flex flex-col gap-3 rounded-[18px] ${CARD} px-5 py-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          A question to yourself
        </p>
        <p className={`home-v2-display m-0 text-[18px] italic leading-snug ${IVORY}`}>
          What would you regret not trying?
        </p>
        <div className="mt-auto border-l-2 border-[var(--hv2-gold)] pl-3.5">
          <p className={`home-v2-display m-0 text-[15px] italic leading-snug ${MUTED}`}>
            Never opening the studio. Never finding out.
          </p>
        </div>
      </div>
    </div>
  );
}

const LIFE_AREA_EXAMPLES = {
  studio: {
    label: "Studio",
    bands: [
      {
        label: "The dream",
        body: "My own studio. Clay on the shelves, light through the big window.",
      },
      {
        label: "The moment it’s happened",
        body: "Opening night. Forty people in, and the first piece sells.",
      },
      {
        label: "What’s in the way",
        body: "“Who am I to charge for this?”",
      },
    ],
  },
  health: {
    label: "Health",
    bands: [
      {
        label: "The dream",
        body: "Strong again. Early walks, sleep that holds, energy that lasts the day.",
      },
      {
        label: "The moment it’s happened",
        body: "Waking without the ache. Choosing the long route home because I want to.",
      },
      {
        label: "What’s in the way",
        body: "“I’ll start when work calms down.”",
      },
    ],
  },
  family: {
    label: "Family",
    bands: [
      {
        label: "The dream",
        body: "Sunday mornings together. Phones away, real conversation, no rush.",
      },
      {
        label: "The moment it’s happened",
        body: "The kids ask to stay at the table. Nobody’s checking the time.",
      },
      {
        label: "What’s in the way",
        body: "“There’s always one more email first.”",
      },
    ],
  },
  travel: {
    label: "Travel",
    bands: [
      {
        label: "The dream",
        body: "Two weeks somewhere slow. A bag that fits, a train ticket, nowhere to be.",
      },
      {
        label: "The moment it’s happened",
        body: "First morning abroad. Coffee outside, map folded, the day still open.",
      },
      {
        label: "What’s in the way",
        body: "“We can’t afford the time right now.”",
      },
    ],
  },
} as const;

type LifeAreaId = keyof typeof LIFE_AREA_EXAMPLES;

function LifeAreasGraphic() {
  const [area, setArea] = useState<LifeAreaId>("studio");
  const chips = (Object.keys(LIFE_AREA_EXAMPLES) as LifeAreaId[]).map((id) => ({
    id,
    label: LIFE_AREA_EXAMPLES[id].label,
  }));
  const bands = LIFE_AREA_EXAMPLES[area].bands;

  return (
    <div className={`flex flex-col gap-3.5 rounded-[18px] ${CARD} p-5 md:h-[330px]`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Life areas">
        {chips.map((c) => {
          const on = c.id === area;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setArea(c.id)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                on
                  ? "bg-[var(--hv2-gold)] font-semibold text-[var(--hv2-on-gold)]"
                  : `home-v2-life-chip-pulse border border-[var(--hv2-line)] ${FAINT}`
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
        {bands.map((b, i) => {
          const highlight = i === bands.length - 1;
          return (
            <div
              key={`${area}-${b.label}`}
              className={`rounded-xl px-3.5 py-3 ${
                highlight
                  ? "border border-[rgb(var(--hv2-gold-rgb)/0.45)] bg-[rgb(var(--hv2-gold-rgb)/0.08)]"
                  : INSET
              }`}
            >
              <p className={`m-0 text-[10px] font-semibold uppercase tracking-[1.3px] ${GOLD}`}>
                {b.label}
              </p>
              <p className={`home-v2-display m-0 mt-1 text-[15px] italic leading-snug ${IVORY}`}>
                {b.body}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GoalsGraphic() {
  const todos = [
    { text: "Finish twelve pieces", done: true, next: false },
    { text: "Price the collection", done: false, next: true },
    { text: "Photograph every piece", done: false, next: false },
    { text: "Open the online shop", done: false, next: false },
  ] as const;

  return (
    <div className={`flex flex-col gap-3.5 rounded-[18px] ${CARD} p-5`}>
      <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
        Studio · Goal
      </p>
      <p className={`home-v2-display m-0 text-[22px] ${IVORY}`}>
        Sell the first collection
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {todos.map((t) => (
          <li
            key={t.text}
            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
              t.next
                ? "border border-[rgb(var(--hv2-gold-rgb)/0.5)] bg-[rgb(var(--hv2-gold-rgb)/0.08)]"
                : INSET
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${
                t.done
                  ? "border-[var(--hv2-gold)] bg-[var(--hv2-gold)] text-[var(--hv2-navy)]"
                  : "border-[var(--hv2-line)] text-transparent"
              }`}
              aria-hidden
            >
              ✓
            </span>
            <span
              className={`min-w-0 flex-1 text-[14px] ${
                t.done ? `line-through ${FAINT}` : IVORY
              }`}
            >
              {t.text}
            </span>
            {t.next ? (
              <span className={`text-[11px] font-semibold uppercase tracking-[1px] ${GOLD}`}>
                Next
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className={`rounded-xl ${INSET} px-3.5 py-3`}>
        <p className={`m-0 text-[12px] ${FAINT}`}>
          What’s getting in the way of the next step?
        </p>
        <p className={`home-v2-display m-0 mt-1 text-[15px] italic ${IVORY}`}>
          Naming a number out loud.
        </p>
      </div>
    </div>
  );
}

function MeditateFocusGraphic() {
  return (
    <div className="flex flex-col gap-3.5">
      <div className={`flex flex-col gap-3.5 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          consciously <span className="italic">Meditate</span>
        </p>
        <div className="flex items-center gap-3.5">
          <span className="accent-fill-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[var(--hv2-navy)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className={`home-v2-display m-0 text-[20px] leading-snug ${IVORY}`}>
              Opening night
            </p>
            <p className={`m-0 text-[12px] ${FAINT}`}>
              From your Studio dream · 8 min
            </p>
          </div>
        </div>
        <div className="w-full [&_.home-v2-wave]:w-full [&_.home-v2-wave]:justify-between">
          <WaveBars count={48} />
        </div>
      </div>
      <div className={`flex items-center gap-5 rounded-[18px] ${CARD} p-5`}>
        <span
          className={`home-v2-display flex h-[108px] w-[108px] shrink-0 items-center justify-center rounded-full border-[6px] border-[var(--hv2-line-soft)] border-r-[var(--hv2-gold)] border-t-[var(--hv2-gold)] text-[26px] ${IVORY}`}
          aria-hidden
        >
          25:00
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
            consciously <span className="italic">Focus</span>
          </p>
          <p className={`home-v2-display m-0 text-[20px] leading-snug ${IVORY}`}>
            Price the collection
          </p>
          <p className={`m-0 text-[12px] ${FAINT}`}>
            Next To Do · Studio
          </p>
          <p className={`m-0 pt-0.5 text-[12px] text-[var(--hv2-tan-text)]`}>
            Distracting sites blocked
          </p>
        </div>
      </div>
    </div>
  );
}

function ThoughtsInsightsGraphic() {
  const thoughts = [
    { date: "22 Sept", text: "Priced the first piece.", tag: "Win" },
    { date: "24 Sept", text: "Put off the photos again.", tag: "Resistance" },
    { date: "26 Sept", text: "Kiln booked till Friday.", tag: "Hard blocker" },
  ] as const;

  return (
    <div className="flex flex-col items-stretch gap-3.5 md:h-[250px] md:flex-row md:items-stretch">
      <div className={`flex min-w-0 flex-1 flex-col gap-2.5 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Thoughts
        </p>
        {thoughts.map((t) => (
          <div key={t.date} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`m-0 text-[11px] ${FAINT}`}>{t.date}</p>
              <p className={`m-0 text-[14px] leading-snug ${IVORY}`}>{t.text}</p>
            </div>
            <span className={`shrink-0 rounded-full border border-[var(--hv2-line)] px-2.5 py-1 text-[11px] ${FAINT}`}>
              {t.tag}
            </span>
          </div>
        ))}
      </div>
      <span
        className="hidden shrink-0 self-center text-[22px] text-[var(--hv2-gold)] md:inline"
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
        <div>
          <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
            What’s not
          </p>
          <p className={`m-0 mt-1 text-[13px] leading-snug ${MUTED}`}>
            You’ve stalled on the step after pricing three times. The doubt
            shows up before anyone has seen the work.
          </p>
        </div>
        <div className="mt-auto">
          <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
            What’s working
          </p>
          <p className={`m-0 mt-1 text-[13px] leading-snug ${MUTED}`}>
            Twelve pieces finished. The making was never the problem.
          </p>
        </div>
      </div>
    </div>
  );
}

export function ManifestMarketingPage() {
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
              Know exactly who you’re becoming.
            </h1>
            <p
              className={`m-0 max-w-[34rem] text-base text-[var(--hv2-hero-muted)] sm:text-lg md:text-[21px] md:leading-[1.5] ${sub.className}`}
              style={sub.style}
            >
              Picture it. Name what’s in the way. Take the next step.
            </p>
            <div className={cta.className} style={cta.style}>
              <Link
                href={CTA_HREF}
                className="accent-fill-gradient inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-[17px] font-semibold text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
              >
                <HomeV2ToolIcon tool="manifest" />
                Build your vision board
              </Link>
            </div>
          </div>
        </section>

        <Strip
          band={BANDS[0]}
          text={
            <SectionCopy
              eyebrow="Vision board"
              title="See it first."
              lead="Scenes of the life you’re building — concrete enough to feel, and recognisably you."
              points={[
                {
                  title: "You, in the life you’re building",
                  body: "Describe the scene. Add a photo of yourself. We generate the image with you in it — living the moment you’re aiming for.",
                },
                {
                  title: "Or pin your own photos",
                  body: "Upload images you already have — the studio, the trip, the morning you want back.",
                },
              ]}
            />
          }
          graphic={<VisionBoardGraphic />}
        />

        <Strip
          band={BANDS[1]}
          visualLeft
          text={
            <SectionCopy
              eyebrow="Manifesto"
              title="Say what you stand for."
              lead="Your values, the quotes that keep you honest, and the questions worth asking yourself."
              points={[
                {
                  title: "Values, ranked",
                  body: "Know what wins when two things matter.",
                },
                {
                  title: "Questions to yourself",
                  body: "Answer them when you’re ready, and come back as the answer changes.",
                },
              ]}
            />
          }
          graphic={<ManifestoGraphic />}
        />

        <Strip
          band={BANDS[2]}
          text={
            <SectionCopy
              eyebrow="Life areas"
              title="Every part of your life gets its own dream."
              lead="Picture where it’s going, the moment it happens, and what’s in the way."
              points={[
                {
                  title: "Name what’s in the way",
                  body: "Dreaming alone tends to drain effort. Research on mental contrasting finds that pairing the dream with the obstacle is what gets people moving.",
                },
                {
                  title: "As many areas as you need",
                  body: "Work, health, home, a side project. Each keeps its own dream.",
                },
              ]}
            />
          }
          graphic={<LifeAreasGraphic />}
        />

        <Strip
          band={BANDS[3]}
          visualLeft
          text={
            <SectionCopy
              eyebrow="Goals and To Dos"
              title="Make it plannable."
              lead="Each area holds goals. Each goal breaks into To Dos you can start today."
              points={[
                {
                  title: "To Dos in one tap",
                  body: "Describe the goal and Consciously drafts the steps. Keep, edit or delete them.",
                },
                {
                  title: "Stuck on a step?",
                  body: "Say what’s in the way, or plan the next steps in Chat.",
                },
              ]}
            />
          }
          graphic={<GoalsGraphic />}
        />

        <Strip
          band={BANDS[0]}
          graphicClassName="md:w-[min(100%,580px)]"
          text={
            <SectionCopy
              eyebrow="Meditate and Focus"
              title="Feel it. Then do it."
              lead="Every area can make its own visualisation, and every goal can open a Focus session."
              points={[
                {
                  title: "Generate a meditation",
                  body: "A visualisation built from your dream and what’s in the way.",
                },
                {
                  title: "Start a Focus session",
                  body: "Work the next To Do with the timer running. Set the tone first with a short visualisation if you like.",
                },
              ]}
            />
          }
          graphic={<MeditateFocusGraphic />}
        />

        <Strip
          band={BANDS[1]}
          visualLeft
          text={
            <SectionCopy
              eyebrow="Thoughts and insights"
              title="It notices what you don’t."
              lead="Jot thoughts as they come: wins, blockers, resistance. Insights reads them back."
              points={[
                {
                  title: "What’s working, what’s not",
                  body: "A plain read on each area, from your goals, thoughts and progress.",
                },
                {
                  title: "Patterns",
                  body: "Where you keep stalling, named before it costs another month.",
                },
              ]}
            />
          }
          graphic={<ThoughtsInsightsGraphic />}
        />

        <section className={`${BANDS[2]} w-full px-5 py-14 md:px-6 md:py-20`}>
          <div
            className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 md:flex-row md:items-center md:justify-between"
            data-hv2-reveal
          >
            <div className="flex flex-col gap-2.5">
              <h2
                className={`home-v2-display m-0 text-[30px] font-normal tracking-tight ${IVORY} md:text-[46px]`}
              >
                Who are you becoming?
              </h2>
              <p className={`m-0 text-base ${MUTED} md:text-lg`}>
                Put it on the board.
              </p>
            </div>
            <Link
              href={CTA_HREF}
              className="accent-fill-gradient inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[17px] font-semibold text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
            >
              <HomeV2ToolIcon tool="manifest" />
              Build your vision board
            </Link>
          </div>
        </section>
      </div>
    </HomeV2ScrollChrome>
  );
}

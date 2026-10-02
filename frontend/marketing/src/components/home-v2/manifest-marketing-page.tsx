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
const MOBILE_CARD =
  `flex flex-col gap-2.5 overflow-hidden rounded-[14px] ${CARD} px-4 py-3.5`;
const CARD_LABEL = `m-0 text-[10px] font-normal uppercase tracking-[1.4px] ${GOLD}`;
const HAIRLINE = "h-px bg-[var(--hv2-card-border)]";

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
    <>
      {/* Mobile: compact collage, not a card */}
      <div
        className="relative h-[200px] overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] md:hidden"
        aria-hidden
      >
        <div className="box-border grid h-full grid-cols-3 grid-rows-2 gap-1 bg-[var(--hv2-navy)] p-1">
          {VISION_IMAGES.map((src) => (
            <div key={src} className="relative min-h-0 overflow-hidden rounded-lg">
              <Image
                src={src}
                alt=""
                fill
                className="object-cover"
                sizes="110px"
              />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-[82%] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-xl bg-[rgba(15,27,45,0.8)] px-3.5 py-3 text-center">
          <p className={`home-v2-display m-0 text-[15px] italic leading-[1.4] ${IVORY}`}>
            “I make things with my hands, and I charge what they’re worth.”
          </p>
          <p className={`m-0 text-[11px] ${FAINT}`}>
            Your manifesto line, over your board
          </p>
        </div>
      </div>

      {/* Desktop */}
      <div
        className={`relative hidden overflow-hidden rounded-[18px] ${CARD} p-3 md:block md:h-[340px]`}
        aria-hidden
      >
        <div className="grid h-full grid-cols-3 gap-1.5">
          {VISION_IMAGES.map((src) => (
            <div key={src} className="relative min-h-0 overflow-hidden rounded-[10px]">
              <Image
                src={src}
                alt=""
                fill
                className="object-cover"
                sizes="170px"
              />
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-[90%] rounded-2xl border border-[rgba(246,241,231,0.16)] bg-[rgba(15,27,45,0.78)] px-7 py-5 text-center backdrop-blur-[6px]">
            <p className={`home-v2-display m-0 text-[20px] italic leading-snug ${IVORY}`}>
              “I make things with my hands, and I charge what they’re worth.”
            </p>
            <p className={`m-0 mt-2 text-[12px] ${FAINT}`}>
              Your manifesto line, over your board
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function ManifestoGraphic() {
  const values = ["Craft", "Courage", "Family", "Freedom"] as const;

  return (
    <>
      {/* Mobile: one card */}
      <div className={`${MOBILE_CARD} md:hidden`} aria-hidden>
        <p className={CARD_LABEL}>Values</p>
        <div>
          {values.map((v, i) => (
            <div
              key={v}
              className="flex items-baseline gap-3 border-t border-[var(--hv2-card-border)] py-1.5"
            >
              <span className={`text-[11px] tabular-nums ${FAINT}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className={`home-v2-display text-[18px] ${IVORY}`}>{v}</span>
            </div>
          ))}
        </div>
        <div className={HAIRLINE} />
        <p className={CARD_LABEL}>A question to yourself</p>
        <p
          className={`home-v2-display m-0 text-[15px] italic leading-[1.45] ${IVORY}`}
        >
          What would you regret not trying?
        </p>
        <div className="border-l-2 border-[var(--hv2-gold)] pl-3">
          <p className={`m-0 text-[14px] leading-[1.5] ${MUTED}`}>
            Never opening the studio. Never finding out.
          </p>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid md:h-[260px]">
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
    </>
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

  const chipRow = (compact: boolean) => (
    <div
      className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}
      role="group"
      aria-label="Life areas"
    >
      {chips.map((c) => {
        const on = c.id === area;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => setArea(c.id)}
            className={`whitespace-nowrap rounded-full text-[13px] transition-colors ${
              compact ? "px-[13px] py-[7px]" : "px-3.5 py-1.5"
            } ${
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
  );

  return (
    <>
      {/* Mobile: one card, transparent bands */}
      <div className={`${MOBILE_CARD} md:hidden`}>
        {chipRow(true)}
        {bands.map((b, i) => {
          const highlight = i === bands.length - 1;
          return (
            <div
              key={`${area}-${b.label}`}
              className={`flex flex-col gap-1 rounded-[10px] px-3 py-2.5 ${
                highlight
                  ? "border border-[rgb(var(--hv2-gold-rgb)/0.45)] bg-[rgb(var(--hv2-gold-rgb)/0.08)]"
                  : "border border-[var(--hv2-card-border)] bg-transparent"
              }`}
            >
              <p className={CARD_LABEL}>{b.label}</p>
              <p
                className={`home-v2-display m-0 text-[15px] italic leading-[1.45] ${IVORY}`}
              >
                {b.body}
              </p>
            </div>
          );
        })}
      </div>

      {/* Desktop */}
      <div className={`hidden flex-col gap-3.5 rounded-[18px] ${CARD} p-5 md:flex md:h-[330px]`}>
        {chipRow(false)}
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
    </>
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
    <>
      {/* Mobile: one card, compact checklist */}
      <div className={`${MOBILE_CARD} md:hidden`} aria-hidden>
        <p className={CARD_LABEL}>Studio · Goal</p>
        <p className={`home-v2-display m-0 text-[17px] ${IVORY}`}>
          Sell the first collection
        </p>
        <div className="flex flex-col gap-[9px]">
          {todos.map((t) => (
            <div
              key={t.text}
              className={`flex items-center gap-2.5 text-[14px] ${
                t.done ? `line-through ${FAINT}` : IVORY
              }`}
            >
              <span
                className={`box-border h-3.5 w-3.5 shrink-0 rounded ${
                  t.done
                    ? "bg-[var(--hv2-gold)]"
                    : t.next
                      ? "border-[1.5px] border-[var(--hv2-gold)]"
                      : "border-[1.5px] border-[var(--hv2-line)]"
                }`}
                aria-hidden
              />
              <span className="min-w-0">{t.text}</span>
              {t.next ? (
                <span className={`ml-auto text-[11px] ${GOLD}`}>Next</span>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-[3px] rounded-[10px] border border-[var(--hv2-card-border)] px-3 py-2.5">
          <p className={`m-0 text-[12px] ${FAINT}`}>
            What’s getting in the way of the next step?
          </p>
          <p
            className={`home-v2-display m-0 text-[15px] italic leading-[1.45] ${IVORY}`}
          >
            Naming a number out loud.
          </p>
        </div>
      </div>

      {/* Desktop */}
      <div className={`hidden flex-col gap-3.5 rounded-[18px] ${CARD} p-5 md:flex`}>
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
    </>
  );
}

function FocusRing({ size = 64 }: { size?: number }) {
  const r = (size / 2) - 5;
  const c = 2 * Math.PI * r;
  const progress = 0.736; // ~18:24 remaining of a 25:00 session
  return (
    <span
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--hv2-line-soft)"
          strokeWidth="4"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--hv2-gold)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${c * progress} ${c}`}
        />
      </svg>
      <span className={`home-v2-display relative text-[17px] ${IVORY}`}>
        18:24
      </span>
    </span>
  );
}

function MeditateFocusGraphic() {
  return (
    <>
      {/* Mobile: one card */}
      <div className={`${MOBILE_CARD} md:hidden`} aria-hidden>
        <p className={CARD_LABEL}>consciously Meditate</p>
        <div className="flex items-center gap-3">
          <span className="accent-fill-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--hv2-on-gold)]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className={`home-v2-display m-0 text-[16px] ${IVORY}`}>
              Opening night
            </p>
            <p className={`m-0 text-[12px] ${FAINT}`}>
              From your Studio dream · 8 min
            </p>
          </div>
        </div>
        <div className={HAIRLINE} />
        <p className={CARD_LABEL}>consciously Focus</p>
        <div className="flex items-center gap-3.5">
          <FocusRing />
          <div className="flex min-w-0 flex-col gap-[3px]">
            <p className={`home-v2-display m-0 text-[16px] ${IVORY}`}>
              Price the collection
            </p>
            <p className={`m-0 text-[12px] ${FAINT}`}>
              Next To Do · Studio
            </p>
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden flex-col gap-3.5 md:flex">
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
            18:24
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
    </>
  );
}

const SPARK_POINTS =
  "0.0,30 22.2,26 44.4,32 66.7,24 88.9,22 111.1,18 133.3,20 155.6,14 177.8,12 200.0,8";

function FeelingSparkline({
  className,
  showMidline,
  showDot,
}: {
  className: string;
  showMidline?: boolean;
  showDot?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 40"
      preserveAspectRatio="none"
      className={className}
    >
      {showMidline ? (
        <line
          x1="0"
          x2="200"
          y1="20"
          y2="20"
          stroke="var(--hv2-line-soft)"
          strokeDasharray="3 3"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      <polyline
        fill="none"
        points={SPARK_POINTS}
        stroke="var(--hv2-gold)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {showDot ? (
        <circle cx="200" cy="8" r="3" fill="var(--hv2-gold)" />
      ) : null}
    </svg>
  );
}

function TopicChip({
  topic,
  mood,
  accent,
}: {
  topic: string;
  mood: string;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex gap-[5px] whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[12px] ${IVORY} ${
        accent
          ? "border-[rgba(var(--hv2-gold-rgb),0.5)]"
          : "border-[rgba(243,237,226,0.2)]"
      }`}
    >
      {topic}
      <span className={accent ? GOLD : FAINT}>{mood}</span>
    </span>
  );
}

function ThoughtsInsightsGraphic() {
  const doneRows = [
    { text: "Finished twelve pieces", date: "18 Sept" },
    { text: "Confirmed the date", date: "24 Sept" },
    { text: "Photographed the first six", date: "29 Sept" },
  ] as const;

  return (
    <>
      {/* Mobile */}
      <div
        className={`flex flex-col gap-3.5 overflow-hidden rounded-[14px] ${CARD} px-4 py-3.5 md:hidden`}
      >
        <p className={`home-v2-display m-0 text-[16px] ${IVORY}`}>
          Studio{" "}
          <span className={`text-[13px] ${FAINT}`}>· last 30 days</span>
        </p>
        <div className="flex flex-col gap-1.5">
          <div
            className={`flex items-baseline justify-between text-[13px] ${IVORY}`}
          >
            <span>5 of 9 steps</span>
            <span>
              1.5 a week <span className={GOLD}>↑</span>
            </span>
          </div>
          <div
            className="h-1.5 rounded-full bg-[var(--hv2-line-soft)]"
            role="img"
            aria-label="5 of 9 steps done"
          >
            <div
              className="h-1.5 rounded-full bg-[var(--hv2-gold)]"
              style={{ width: "55.6%" }}
            />
          </div>
          <p className={`m-0 text-[12px] ${FAINT}`}>
            3 done · 11h Focus · 4 visualisations
          </p>
        </div>
        <div className={HAIRLINE} />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className={CARD_LABEL}>Feeling</span>
            <span className={`flex items-center gap-1.5 text-[11px] ${FAINT}`}>
              <FeelingSparkline className="block h-[18px] w-16 shrink-0" />
              more hopeful
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <TopicChip topic="Making" mood="hopeful" accent />
            <TopicChip topic="Pricing" mood="steadier" />
            <TopicChip topic="Showing work" mood="anxious" />
          </div>
        </div>
        <p
          className={`home-v2-display m-0 text-[14px] italic leading-[1.4] ${IVORY}`}
        >
          Moving faster since the visualisations; pricing feels steadier.
        </p>
      </div>

      {/* Desktop */}
      <div
        className={`hidden flex-col gap-[18px] rounded-2xl ${CARD} px-[26px] py-6 md:flex`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2.5">
          <p className={`home-v2-display m-0 text-[18px] ${IVORY}`}>
            Studio{" "}
            <span className={`text-[14px] ${FAINT}`}>· last 30 days</span>
          </p>
          <p className={`m-0 text-[12px] ${FAINT}`}>
            From 14 To Dos, 9 thoughts, 3 entries
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p
            className={`m-0 text-[11px] font-normal uppercase tracking-[1.4px] ${GOLD}`}
          >
            Pace
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-[15px] ${IVORY}`}>5 of 9 steps</span>
            <span className={`text-[13px] ${IVORY}`}>
              1.5 a week <span className={GOLD}>↑</span>{" "}
              <span className={FAINT}>from 0.8</span>
            </span>
          </div>
          <div
            className="h-2 rounded-full bg-[var(--hv2-line-soft)]"
            role="img"
            aria-label="5 of 9 steps done"
          >
            <div
              className="h-2 rounded-full bg-[var(--hv2-gold)]"
              style={{ width: "55.6%" }}
            />
          </div>
          <p className={`m-0 text-[13px] ${FAINT}`}>
            At this pace, about 3 months to opening night
          </p>
        </div>

        <div className={HAIRLINE} />

        <div className="grid grid-cols-2 gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p
              className={`m-0 text-[11px] font-normal uppercase tracking-[1.4px] ${GOLD}`}
            >
              Done
            </p>
            <div>
              {doneRows.map((row) => (
                <div
                  key={row.text}
                  className={`flex items-baseline gap-2.5 border-t border-[var(--hv2-card-border)] py-1.5 text-[14px] ${IVORY}`}
                >
                  <span className={`text-[12px] ${GOLD}`}>✓</span>
                  <span className="min-w-0 flex-1">{row.text}</span>
                  <span className={`shrink-0 whitespace-nowrap text-[12px] ${FAINT}`}>
                    {row.date}
                  </span>
                </div>
              ))}
            </div>
            <p className={`m-0 text-[12px] ${FAINT}`}>
              11h Focus · 4 visualisations · 2 wins
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <p
              className={`m-0 text-[11px] font-normal uppercase tracking-[1.4px] ${GOLD}`}
            >
              How you feel about it
            </p>
            <FeelingSparkline
              className="block h-11 w-full"
              showMidline
              showDot
            />
            <div
              className={`flex justify-between text-[11px] ${FAINT}`}
            >
              <span>2 Sept</span>
              <span>Today · more hopeful</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <TopicChip topic="Making" mood="hopeful" accent />
              <TopicChip topic="Pricing" mood="tense → steadier" />
              <TopicChip topic="Showing work" mood="anxious" />
            </div>
          </div>
        </div>

        <div className={HAIRLINE} />

        <p
          className={`home-v2-display m-0 text-[17px] italic leading-[1.45] ${IVORY}`}
        >
          You’re moving faster since you started the visualisations, and
          pricing feels less tense than in August.
        </p>
      </div>
    </>
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

        <section className="home-v2-hero home-v2-hero--under-chrome flex w-full flex-col px-5 pb-11 text-[var(--hv2-hero-fg)] md:px-6 md:pb-24">
          <div className="relative z-[1] mx-auto flex w-full max-w-[1200px] flex-col items-center gap-4 pt-10 text-center md:gap-[22px] md:pt-14">
            <h1
              className={`home-v2-display m-0 w-full max-w-[16ch] text-[40px] font-normal leading-[1.06] tracking-[-0.6px] text-[var(--hv2-hero-fg)] md:max-w-none md:text-[clamp(44px,5vw,64px)] md:font-[350] md:tracking-[-1px] ${h1.className}`}
              style={h1.style}
            >
              Know exactly who you’re becoming.
            </h1>
            <p
              className={`m-0 max-w-[34rem] text-center text-[16px] leading-[1.5] text-[var(--hv2-hero-muted)] md:text-[21px] ${sub.className}`}
              style={sub.style}
            >
              Picture it. Name what’s in the way. Take the next step.
            </p>
            <div className={`w-full md:w-auto ${cta.className}`} style={cta.style}>
              <Link
                href={CTA_HREF}
                className="accent-fill-gradient mt-1.5 inline-flex h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-7 text-[16px] font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 md:mt-0 md:h-auto md:w-auto md:py-3.5 md:text-[17px] md:text-[var(--hv2-navy)]"
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
          graphicClassName="md:w-[min(100%,560px)]"
          text={
            <SectionCopy
              eyebrow="Thoughts and insights"
              title="It notices what you don’t."
              lead="Jot thoughts as they come: wins, blockers, resistance. Insights shows how fast you’re moving, what you’ve done, and how you feel about it."
              points={[
                {
                  title: "Pace and progress",
                  body: "How quickly you’re moving, and what you’ve finished this month.",
                },
                {
                  title: "How you feel about it",
                  body: "The mood of your thoughts on each topic, and how it’s shifting.",
                },
              ]}
            />
          }
          graphic={<ThoughtsInsightsGraphic />}
        />

        <section
          className={`${BANDS[2]} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-11 md:border-t-0 md:px-6 md:py-20`}
        >
          <div
            className="mx-auto flex max-w-[1200px] flex-col items-stretch gap-3.5 text-center md:flex-row md:items-center md:justify-between md:gap-6 md:text-left"
            data-hv2-reveal
          >
            <div className="flex flex-col gap-3.5 md:gap-2.5">
              <h2
                className={`home-v2-display m-0 text-[32px] font-normal leading-[1.1] tracking-tight ${IVORY} md:text-[46px]`}
              >
                Who are you becoming?
              </h2>
              <p className={`m-0 text-[15px] ${MUTED} md:text-lg`}>
                Put it on the board.
              </p>
            </div>
            <Link
              href={CTA_HREF}
              className="accent-fill-gradient mt-1.5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-7 text-[16px] font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 md:mt-0 md:h-auto md:w-auto md:py-3.5 md:text-[17px] md:text-[var(--hv2-navy)]"
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

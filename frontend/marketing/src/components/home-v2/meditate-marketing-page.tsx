"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useState, type ReactNode } from "react";
import "@/components/home-v2/home-v2.css";
import { HeroPrompt } from "@/components/home-v2/hero-prompt";
import {
  HomeV2Chrome,
  HomeV2ScrollChrome,
} from "@/components/home-v2/home-v2-scroll-chrome";
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { createMeditationHref } from "@/lib/create-meditation-path";
import type { LibraryMeditationItem } from "@/lib/medimade-api";
import { MEDITATION_STYLE_LABELS } from "@/lib/meditation-style-intake";

export type MeditateFeaturedProgram = {
  id: string;
  title: string;
  lessonCount: number;
  coverImageUrl: string | null;
  href: string;
};

/** Same subtle sticky-navy steps as other tool marketing pages. */
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
const CARD =
  "bg-[var(--hv2-navy)] border border-[var(--hv2-card-border)]";
/** Inset panels inside navy graphic cards — sticky charcoal for a second step. */
const INSET =
  "bg-[var(--hv2-sticky-bg)] border border-[var(--hv2-card-border)]";

const STYLE_BLURBS: Record<(typeof MEDITATION_STYLE_LABELS)[number], string> = {
  "Body scan": "Release what your body is holding.",
  Visualization: "See it clearly enough to move towards it.",
  "Breath-led": "Come back to the breath, again and again.",
  Manifestation: "Rehearse the life you’re building.",
  "Affirmation loop": "Words you need, until they feel true.",
  Story: "Be carried somewhere else for a while.",
  Reflection: "Make sense of what happened today.",
  Sleep: "Let the day go and drift off.",
  "Loving-kindness": "Soften towards yourself and others.",
  "Anxiety relief": "Steady the racing, one breath at a time.",
  "Movement meditation": "Stretch, walk or sway with guidance.",
  "Open awareness": "Notice everything, hold onto nothing.",
};

/** Community samples keyed by style — only these show a play control. */
const STYLE_SAMPLES: Partial<
  Record<(typeof MEDITATION_STYLE_LABELS)[number], LibraryMeditationItem>
> = {
  "Breath-led": {
    id: "b3f239a6-5528-448e-bb70-409637c4b6c3",
    sk: "2026-08-15T11:34:06.023Z#b3f239a6-5528-448e-bb70-409637c4b6c3",
    s3Key: "meditations/_/0e3a06f4-cbd8-4c33-a067-f1e30c41db72.mp3",
    audioUrl:
      "https://d3k8rq6eqba40d.cloudfront.net/meditations/_/0e3a06f4-cbd8-4c33-a067-f1e30c41db72.mp3",
    title: "Following Your Breath Through the Scatter",
    meditationType: "Breath-led",
    meditationStyle: "Breath-led",
    speakerModelId: "21bcb45116b44157820dbffb1927e185",
    speakerName: "Alan Watts",
    description: null,
    createdAt: "2026-08-15T11:34:06.023Z",
    durationSeconds: 128.064,
    liveMix: true,
    backgroundMusicKey: "background-audio/music/432Hz/Antarctica Pad.mp3",
    backgroundNatureKey: "background-audio/nature/Children Playing.mp3",
    backgroundNoiseKey: "background-audio/noise/Vinyl Crackle.mp3",
    backgroundMusicGain: 50,
    backgroundNatureGain: 25,
    backgroundNoiseGain: 12,
    coverImageUrl:
      "https://d3k8rq6eqba40d.cloudfront.net/meditation-covers/_/b3f239a6-5528-448e-bb70-409637c4b6c3.jpg",
    isPublic: true,
    favourite: false,
    archived: false,
    catalogued: true,
    isDraft: false,
    scriptText: null,
    scriptTruncated: false,
    mp3Bytes: 1051917,
    rating: null,
  },
  "Loving-kindness": {
    id: "04fa5b91-fa0c-4351-b68d-00ee172e70b0",
    sk: "2026-08-13T19:39:28.824Z#04fa5b91-fa0c-4351-b68d-00ee172e70b0",
    s3Key: "meditations/_/4ad91230-4ad0-4f34-9521-01bb2c32860a.mp3",
    audioUrl:
      "https://d3k8rq6eqba40d.cloudfront.net/meditations/_/4ad91230-4ad0-4f34-9521-01bb2c32860a.mp3",
    title: "Softening the Grip: A Practice in Self-Compassion",
    meditationType: "Loving-kindness",
    meditationStyle: "Loving-kindness",
    speakerModelId: "daffce3e2eb74bb59c0701f469d83177",
    speakerName: "Deep Soothing",
    description: null,
    createdAt: "2026-08-13T19:39:28.824Z",
    durationSeconds: 95.088,
    liveMix: true,
    backgroundMusicKey:
      "background-audio/music/432Hz/Pads/Fmaj/Crystal Bowl.mp3",
    backgroundNatureKey: "background-audio/nature/fire/Campfire.mp3",
    backgroundMusicGain: 24,
    backgroundNatureGain: 17,
    coverImageUrl:
      "https://d3k8rq6eqba40d.cloudfront.net/meditation-covers/_/04fa5b91-fa0c-4351-b68d-00ee172e70b0.jpg",
    isPublic: true,
    favourite: false,
    archived: false,
    catalogued: true,
    isDraft: false,
    scriptText: null,
    scriptTruncated: false,
    mp3Bytes: 783885,
    rating: null,
  },
  "Body scan": {
    id: "d709dad9-c7d2-40ab-86d3-60e1b38c9d00",
    sk: "2026-08-15T00:46:24.869Z#d709dad9-c7d2-40ab-86d3-60e1b38c9d00",
    s3Key: "meditations/_/62af7ea0-33ea-43f4-ad46-4aabc748bbe0.mp3",
    audioUrl:
      "https://d3k8rq6eqba40d.cloudfront.net/meditations/_/62af7ea0-33ea-43f4-ad46-4aabc748bbe0.mp3",
    title: "Full Body Scan: Release Tension and Find Inner Peace",
    meditationType: "Body scan",
    meditationStyle: "Body scan",
    speakerModelId: "9f2792501813486399fbc827c733d3f0",
    speakerName: "Brit Monk",
    description: null,
    createdAt: "2026-08-15T00:46:24.869Z",
    durationSeconds: 242.76,
    liveMix: true,
    backgroundMusicKey: "background-audio/music/Samsara Bowl.mp3",
    backgroundNatureKey: "background-audio/nature/birds/Morning Birds.mp3",
    backgroundMusicGain: 23,
    backgroundNatureGain: 11,
    coverImageUrl:
      "https://d3k8rq6eqba40d.cloudfront.net/meditation-covers/_/d709dad9-c7d2-40ab-86d3-60e1b38c9d00.jpg",
    isPublic: true,
    favourite: false,
    archived: false,
    catalogued: true,
    isDraft: false,
    scriptText: null,
    scriptTruncated: false,
    mp3Bytes: 1796349,
    rating: null,
  },
};

type LifeChip = "sentence" | "conversation" | "journal" | "goal";

const LIFE_CHIPS: { id: LifeChip; label: string }[] = [
  { id: "sentence", label: "A sentence" },
  { id: "conversation", label: "A conversation" },
  { id: "journal", label: "A journal entry" },
  { id: "goal", label: "A goal you’re chasing" },
];

const LIFE_EXAMPLES: Record<
  LifeChip,
  { input: ReactNode; title: string; meta: string }
> = {
  sentence: {
    input: (
      <div className="flex h-full flex-col justify-center gap-3">
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.5px] ${GOLD}`}>
          One-shot prompt
        </p>
        <p className="home-v2-display m-0 text-[18px] italic leading-snug text-[var(--hv2-ink)] md:text-[20px]">
          “Calm before tomorrow’s pitch.”
        </p>
      </div>
    ),
    title: "Steady before you speak",
    meta: "One-shot · Soft voice · Quiet room",
  },
  conversation: {
    input: (
      <div className="flex flex-col gap-2.5">
        <div className="ml-auto max-w-[82%] rounded-[12px_12px_4px_12px] bg-[var(--hv2-gold)] px-[13px] py-[9px] text-[14px] leading-[1.4] text-[var(--hv2-navy)]">
          I keep circling the same doubt before I price anything.
        </div>
        <div className="mr-auto max-w-[88%] rounded-[12px_12px_12px_4px] border border-[var(--hv2-card-border)] bg-[var(--hv2-sticky-bg)] px-[13px] py-[9px] text-[14px] leading-[1.4] text-[var(--hv2-ink)]">
          What’s under it: charging too much, or being seen?
        </div>
        <div className="ml-auto max-w-[82%] rounded-[12px_12px_4px_12px] bg-[var(--hv2-gold)] px-[13px] py-[9px] text-[14px] leading-[1.4] text-[var(--hv2-navy)]">
          Both. I want to feel already worth it.
        </div>
      </div>
    ),
    title: "Already worth it",
    meta: "From your chat · Warm voice · Soft rain",
  },
  journal: {
    input: (
      <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.5px] ${GOLD}`}>
            Tonight’s entry
          </p>
          <span className={`text-[12px] ${FAINT}`}>Wed 12 Mar · 10:41 pm</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px]"
            style={{
              background: "rgba(196,184,122,0.18)",
              borderColor: "rgba(196,184,122,0.45)",
              color: "#C4B87A",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "#C4B87A" }}
              aria-hidden
            />
            Mixed
          </span>
          <span className={`rounded-full border border-[var(--hv2-line)] px-2.5 py-1 text-[12px] ${FAINT}`}>
            studio
          </span>
          <span className={`rounded-full border border-[var(--hv2-line)] px-2.5 py-1 text-[12px] ${FAINT}`}>
            beginning
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <p className="home-v2-display m-0 text-[15px] italic leading-relaxed text-[var(--hv2-ink)] md:text-[16px]">
            I can see the business so clearly — the light in the room, the first
            pieces on the wall. Why do I keep waiting to begin?
          </p>
          <p className={`m-0 mt-2 text-[13px] leading-relaxed ${MUTED}`}>
            Grateful for a quiet morning to dream. Still afraid of being seen
            charging for the work.
          </p>
        </div>
      </div>
    ),
    title: "Begin from what you already wrote",
    meta: "From journal · Warm voice · Soft rain",
  },
  goal: {
    input: (
      <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.5px] ${GOLD}`}>
            Manifest
          </p>
          <span className={`rounded-full border border-[var(--hv2-line)] px-2.5 py-0.5 text-[11px] ${FAINT}`}>
            Life area · Creative work
          </span>
        </div>
        <p className="home-v2-display m-0 text-[18px] leading-snug text-[var(--hv2-ink)] md:text-[20px]">
          Open my own studio
        </p>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-hidden sm:grid-cols-2">
          <div className={`rounded-xl ${INSET} px-3 py-2.5`}>
            <p className={`m-0 text-[10px] font-semibold uppercase tracking-[1.2px] ${GOLD}`}>
              Dream
            </p>
            <p className={`m-0 mt-1 text-[12px] leading-snug ${MUTED}`}>
              A light-filled room. First collection on the walls. Clients who
              already trust the work.
            </p>
          </div>
          <div className={`rounded-xl ${INSET} px-3 py-2.5`}>
            <p className={`m-0 text-[10px] font-semibold uppercase tracking-[1.2px] ${GOLD}`}>
              Blocker
            </p>
            <p className="home-v2-display m-0 mt-1 text-[13px] italic leading-snug text-[var(--hv2-ink)]">
              “Who am I to charge for this?”
            </p>
          </div>
        </div>
        <p className={`m-0 text-[12px] ${FAINT}`}>
          Next step · Price the first collection
        </p>
      </div>
    ),
    title: "Living as its successful owner, today",
    meta: "From goal · Visualization · Warm voice",
  },
};

/** Shared graphic height so chip toggles don’t shift the strip. */
const LIFE_GRAPHIC_H = "h-[260px] md:h-[280px]";

function WaveBars() {
  const heights = [
    10, 18, 12, 24, 16, 28, 14, 20, 26, 12, 18, 22, 10, 18, 12, 24, 16, 28, 14,
    20, 26, 12, 18, 22, 10, 18, 12, 24, 16, 28, 14, 20, 26, 12,
  ];
  return (
    <div className="home-v2-wave flex items-end gap-1" aria-hidden>
      {heights.map((h, i) => (
        <i
          key={i}
          className={i < 6 ? "on" : undefined}
          style={{
            display: "block",
            width: 4,
            height: h,
            borderRadius: 2,
            background: i < 6 ? "var(--hv2-gold)" : "rgba(246,241,231,0.25)",
          }}
        />
      ))}
    </div>
  );
}

function CompactPlayerRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="accent-fill-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--hv2-on-gold)]"
        aria-hidden
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`home-v2-display text-[16px] leading-snug ${IVORY}`}>
          {title}
        </span>
        <span className={`truncate text-[12px] ${FAINT}`}>{meta}</span>
      </span>
    </div>
  );
}

function PlayerCard({ title, meta }: { title: string; meta: string }) {
  return (
    <div
      className={`flex ${LIFE_GRAPHIC_H} min-h-0 flex-1 flex-col rounded-2xl ${CARD} px-6 py-5`}
    >
      <p className={`m-0 shrink-0 text-[11px] font-semibold uppercase tracking-[1.5px] ${GOLD}`}>
        You get
      </p>
      <div className="mt-3.5 flex min-h-0 flex-1 items-start gap-3.5">
        <span className="accent-fill-gradient flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[var(--hv2-on-gold)]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <div className="min-w-0 pt-0.5">
          <p className={`home-v2-display m-0 text-[22px] leading-snug ${IVORY}`}>
            {title}
          </p>
          <p className={`m-0 mt-1 text-[13px] ${FAINT}`}>{meta}</p>
        </div>
      </div>
      <div className="mt-auto shrink-0 pt-3">
        <WaveBars />
      </div>
    </div>
  );
}

function PersonalByDesign() {
  const [chip, setChip] = useState<LifeChip>("sentence");
  const ex = LIFE_EXAMPLES[chip];

  const chips = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="How you arrive">
      {LIFE_CHIPS.map((c) => {
        const on = c.id === chip;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={on}
            onClick={() => setChip(c.id)}
            className={`whitespace-nowrap rounded-full px-[13px] py-[7px] text-[13px] transition-colors md:px-4 md:py-2 md:text-sm ${
              on
                ? "bg-[var(--hv2-gold)] font-semibold text-[var(--hv2-on-gold)]"
                : "home-v2-life-chip-pulse border border-[rgba(246,241,231,0.22)] text-[var(--hv2-body)] md:border-[var(--hv2-line)]"
            }`}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <section
      className={`${BANDS[0]} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-10 md:border-t-0 md:px-6 md:py-24`}
    >
      {/* Mobile: stacked copy + chips + one compact card */}
      <div
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 md:hidden"
        data-hv2-reveal
      >
        <span
          className={`text-[11px] font-semibold uppercase tracking-[1.6px] ${GOLD}`}
        >
          Personal by design
        </span>
        <h2
          className={`home-v2-display m-0 text-[26px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY}`}
        >
          Made from your life, not a library.
        </h2>
        <p className={`m-0 mb-1 text-[15px] leading-[1.55] ${MUTED}`}>
          Type a thought, talk it through, start from last night’s entry or a
          Manifest goal. Every session is written for you, for today.
        </p>
        {chips}
        <div
          className={`flex flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] ${CARD} px-4 py-3.5`}
        >
          {ex.input}
          <div className="h-px bg-[var(--hv2-card-border)]" />
          <span
            className={`text-[10px] font-normal uppercase tracking-[1.4px] ${GOLD}`}
          >
            You get
          </span>
          <CompactPlayerRow title={ex.title} meta={ex.meta} />
        </div>
      </div>

      {/* Desktop */}
      <div className="mx-auto hidden w-full max-w-[1200px] gap-10 md:grid md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:items-center md:gap-16">
        <div className="flex flex-col gap-[18px]" data-hv2-reveal>
          <span
            className={`text-xs font-semibold uppercase tracking-[1.6px] ${GOLD}`}
          >
            Personal by design
          </span>
          <h2
            className={`home-v2-display m-0 text-[46px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY}`}
          >
            Made from your life, not a library.
          </h2>
          <p
            className={`m-0 max-w-[420px] text-[19px] leading-[1.6] ${MUTED}`}
          >
            Type a thought, talk it through, start from last night’s entry or a
            Manifest goal. Every session is written for you, for today.
          </p>
        </div>
        <div className="flex min-w-0 flex-col gap-[18px]" data-hv2-reveal>
          {chips}
          <div className="flex flex-row items-center gap-[18px]">
            <div
              className={`flex ${LIFE_GRAPHIC_H} min-h-0 flex-1 flex-col gap-2.5 self-stretch overflow-hidden rounded-2xl ${CARD} px-5 py-[18px]`}
            >
              {ex.input}
            </div>
            <span
              className="shrink-0 text-[22px] text-[var(--hv2-gold)]"
              aria-hidden
            >
              →
            </span>
            <PlayerCard title={ex.title} meta={ex.meta} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** Stable navy-derived shade per style — quiet variation only. */
function styleCardBackground(style: string): string {
  let h = 2166136261;
  for (let i = 0; i < style.length; i++) {
    h ^= style.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const amt = 2 + ((h >>> 0) % 6); // 2–7% white into navy
  return `color-mix(in srgb, white ${amt}%, var(--hv2-navy))`;
}

function StylesGrid() {
  const { playItem, toggleCurrent, nowPlaying, playingS3Key } =
    useLibraryPlayer();
  const createHref = createMeditationHref({ path: "style" });

  return (
    <section
      className={`${BANDS[1]} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-10 md:border-t-0 md:px-6 md:py-24`}
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <div
          className="mb-3 flex flex-col gap-3 md:mb-9 md:flex-row md:items-end md:justify-between md:gap-12"
          data-hv2-reveal
        >
          <div className="flex flex-col gap-3 md:gap-[18px]">
            <span
              className={`text-[11px] font-semibold uppercase tracking-[1.6px] md:text-xs ${GOLD}`}
            >
              Styles
            </span>
            <h2
              className={`home-v2-display m-0 text-[26px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY} md:text-[46px]`}
            >
              Twelve ways to sit.
            </h2>
          </div>
          <p
            className={`m-0 mb-1 max-w-[440px] text-[15px] leading-[1.55] ${MUTED} md:mb-0 md:text-[19px] md:leading-[1.6]`}
          >
            Pick a style for the kind of practice you want.
          </p>
        </div>
        <ul
          className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:gap-3.5 md:grid-cols-4"
          data-hv2-reveal
        >
          {MEDITATION_STYLE_LABELS.map((style) => {
            const sample = STYLE_SAMPLES[style];
            const blurb = STYLE_BLURBS[style];
            const displayName =
              style === "Movement meditation" ? "Movement" : style;
            const isActive = Boolean(
              sample?.s3Key && nowPlaying?.s3Key === sample.s3Key,
            );
            const isPlaying = Boolean(
              sample?.s3Key && playingS3Key === sample.s3Key,
            );

            return (
              <li key={style} className="min-w-0">
                {!sample ? (
                  <Link
                    href={createHref}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--hv2-card-border)] px-3 py-3 text-left md:hidden"
                    style={{ background: styleCardBackground(style) }}
                  >
                    <span className={`home-v2-display text-[15px] leading-snug ${IVORY}`}>
                      {displayName}
                    </span>
                    <span
                      className="accent-fill-gradient flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--hv2-navy)]"
                      aria-hidden
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-label={
                      isPlaying
                        ? `Pause sample of ${displayName}`
                        : `Play a sample of ${displayName}`
                    }
                    onClick={() => {
                      if (isActive) toggleCurrent();
                      else playItem(sample);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--hv2-card-border)] px-3 py-3 text-left md:hidden"
                    style={{ background: styleCardBackground(style) }}
                  >
                    <span className={`home-v2-display text-[15px] leading-snug ${IVORY}`}>
                      {displayName}
                    </span>
                    <span
                      className="accent-fill-gradient flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--hv2-navy)]"
                      aria-hidden
                    >
                      {isPlaying ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                        </svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </span>
                  </button>
                )}

                {/* Desktop */}
                <div
                  className="hidden h-full items-start gap-3.5 rounded-[14px] border border-[var(--hv2-card-border)] px-5 py-[18px] md:flex"
                  style={{ background: styleCardBackground(style) }}
                >
                  <Link
                    href={createHref}
                    className="flex min-w-0 flex-1 flex-col gap-1.5"
                  >
                    <span
                      className={`home-v2-display text-[21px] leading-snug ${IVORY}`}
                    >
                      {displayName}
                    </span>
                    <span className={`text-sm leading-[1.45] ${FAINT}`}>
                      {blurb}
                    </span>
                  </Link>
                  <button
                    type="button"
                    disabled={!sample}
                    aria-label={
                      !sample
                        ? `Sample for ${displayName} coming soon`
                        : isPlaying
                          ? `Pause sample of ${displayName}`
                          : `Play a sample of ${displayName}`
                    }
                    onClick={() => {
                      if (!sample) return;
                      if (isActive) toggleCurrent();
                      else playItem(sample);
                    }}
                    className="accent-fill-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--hv2-navy)] transition-opacity hover:opacity-90 disabled:cursor-default"
                  >
                    {isPlaying ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function ProgramsSection({
  programs,
}: {
  programs: MeditateFeaturedProgram[];
}) {
  const libraryHref = "/meditate/library/programs";

  const makeOwnPoint = (
    <div className="flex flex-col gap-0.5 pb-1 md:gap-1 md:pb-0 md:pt-1.5">
      <span className={`home-v2-display text-[17px] ${IVORY} md:text-[21px]`}>
        Make it your own
      </span>
      <span className={`max-w-[520px] text-[14px] leading-[1.5] ${FAINT} md:text-[16px] md:leading-[1.55]`}>
        Pick a program, say what’s going on in a quick chat, and every session
        after that is shaped around it.
      </span>
    </div>
  );

  const desktopCards =
    programs.length === 0 ? (
      <p className={`m-0 text-sm ${MUTED}`}>Programs loading soon.</p>
    ) : (
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-3.5">
          {programs.map((p) => (
            <Link
              key={p.id}
              href={p.href}
              className={`flex min-w-0 items-stretch overflow-hidden rounded-[17px] border border-[var(--hv2-card-border)] ${CARD} transition-opacity hover:opacity-95`}
            >
              <span className="relative h-[115px] w-[115px] shrink-0 bg-[var(--hv2-sticky-bg)]">
                {p.coverImageUrl ? (
                  <Image
                    src={p.coverImageUrl}
                    alt=""
                    fill
                    sizes="115px"
                    className="object-cover"
                  />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-6 py-4">
                <span
                  className={`home-v2-display text-[24px] leading-[1.2] tracking-[-0.25px] ${IVORY}`}
                >
                  {p.title}
                </span>
                <span className={`text-[16px] ${FAINT}`}>
                  {p.lessonCount} lesson{p.lessonCount === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          ))}
        </div>
        <Link
          href={libraryHref}
          className={`self-end text-[14px] font-semibold ${GOLD} transition-opacity hover:opacity-90`}
        >
          And more in the library →
        </Link>
      </div>
    );

  const mobileCard =
    programs.length === 0 ? (
      <p className={`m-0 text-sm ${MUTED}`}>Programs loading soon.</p>
    ) : (
      <div
        className={`flex flex-col overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] ${CARD} px-4 py-1`}
      >
        {programs.map((p, i) => (
          <Link
            key={p.id}
            href={p.href}
            className={`flex items-center gap-3.5 py-3 ${
              i > 0 ? "border-t border-[var(--hv2-card-border)]" : ""
            }`}
          >
            <span className="relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-[11px] bg-[var(--hv2-sticky-bg)]">
              {p.coverImageUrl ? (
                <Image
                  src={p.coverImageUrl}
                  alt=""
                  fill
                  sizes="58px"
                  className="object-cover"
                />
              ) : null}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={`home-v2-display text-[18px] leading-[1.25] ${IVORY}`}
              >
                {p.title}
              </span>
              <span className={`text-[14px] ${FAINT}`}>
                {p.lessonCount} lesson{p.lessonCount === 1 ? "" : "s"}
              </span>
            </span>
          </Link>
        ))}
        <Link
          href={libraryHref}
          className={`border-t border-[var(--hv2-card-border)] py-3 pb-2.5 text-[13px] font-semibold ${GOLD}`}
        >
          And more in the library →
        </Link>
      </div>
    );

  return (
    <section
      className={`${BANDS[2]} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-10 md:border-t-0 md:px-6 md:py-24`}
    >
      {/* Mobile */}
      <div
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 md:hidden"
        data-hv2-reveal
      >
        <span
          className={`text-[11px] font-semibold uppercase tracking-[1.6px] ${GOLD}`}
        >
          Programs
        </span>
        <h2
          className={`home-v2-display m-0 text-[30px] font-normal leading-[1.1] ${IVORY}`}
        >
          Guided journeys, made personal.
        </h2>
        <p className={`m-0 mb-1 text-[15px] leading-[1.55] ${MUTED}`}>
          Follow a course session by session, as it’s written. Or make it your
          own, and each session is rewritten around what’s going on for you that
          day.
        </p>
        {makeOwnPoint}
        {mobileCard}
      </div>

      {/* Desktop */}
      <div className="mx-auto hidden w-full max-w-[1200px] gap-10 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-14">
        <div className="flex flex-col gap-[18px]" data-hv2-reveal>
          <span
            className={`text-xs font-semibold uppercase tracking-[1.6px] ${GOLD}`}
          >
            Programs
          </span>
          <h2
            className={`home-v2-display m-0 text-[46px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY}`}
          >
            Guided journeys, made personal.
          </h2>
          <p
            className={`m-0 max-w-[520px] text-[19px] leading-[1.6] ${MUTED}`}
          >
            Follow a course session by session, as it’s written. Or make it your
            own, and each session is rewritten around what’s going on for you
            that day.
          </p>
          {makeOwnPoint}
        </div>
        <div data-hv2-reveal>{desktopCards}</div>
      </div>
    </section>
  );
}

function SoundSection() {
  /** Create UI uses Speechify voices only (from Voice Admin). */
  const voices = ["Beatrice", "Imogen", "Phil"] as const;
  /** Compositions category — full pieces, not looped beds. */
  const beds = ["Pure Serenity", "Quietly Floating", "Astral Secrets"] as const;
  const [voiceGain, setVoiceGain] = useState(72);
  const [bedGain, setBedGain] = useState(38);
  const [voice, setVoice] = useState<(typeof voices)[number]>(voices[0]);
  const [bed, setBed] = useState<(typeof beds)[number]>(beds[0]);

  const chipClass = (selected: boolean) =>
    `flex shrink-0 cursor-pointer items-center gap-2 rounded-full border-2 px-3 py-2 text-left transition-colors ${
      selected
        ? "border-[var(--accent-button)] bg-[var(--hv2-sticky-bg)]"
        : "border-[color-mix(in_srgb,var(--hv2-ivory)_16%,transparent)] bg-[var(--hv2-sticky-bg)]"
    }`;
  const chipIconClass = (selected: boolean) =>
    `flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
      selected
        ? "bg-[var(--accent-button)] text-[var(--hv2-navy)]"
        : "bg-[color-mix(in_srgb,var(--accent-button)_20%,transparent)] text-[var(--accent-link)]"
    }`;
  const chipLabelClass = (selected: boolean) =>
    `whitespace-nowrap text-[13px] leading-none md:text-sm ${
      selected
        ? `font-semibold ${IVORY}`
        : `font-normal ${IVORY}`
    }`;
  const moreClass = `self-center whitespace-nowrap px-1.5 text-[13px] ${FAINT} md:text-sm`;

  const playGlyph = (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );

  const mixer = (
    <div
      className={`flex flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] ${CARD} px-4 py-3.5 md:gap-[18px] md:rounded-[18px] md:p-6`}
    >
      <div className="flex flex-col gap-2.5">
        <span
          className={`text-[10px] font-normal uppercase tracking-[1.4px] md:text-[11px] md:font-semibold md:tracking-[1.5px] ${GOLD}`}
        >
          Voice
        </span>
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {voices.map((name) => {
            const selected = voice === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={selected}
                onClick={() => setVoice(name)}
                className={chipClass(selected)}
              >
                <span className={chipIconClass(selected)} aria-hidden>
                  {playGlyph}
                </span>
                <span className={chipLabelClass(selected)}>{name}</span>
              </button>
            );
          })}
          <span className={moreClass}>+ more</span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <span
          className={`text-[10px] font-normal uppercase tracking-[1.4px] md:text-[11px] md:font-semibold md:tracking-[1.5px] ${GOLD}`}
        >
          <span className="md:hidden">Background</span>
          <span className="hidden md:inline">Soundscape</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {beds.map((name) => {
            const selected = bed === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={selected}
                onClick={() => setBed(name)}
                className={chipClass(selected)}
              >
                <span className={chipIconClass(selected)} aria-hidden>
                  {playGlyph}
                </span>
                <span className={chipLabelClass(selected)}>{name}</span>
              </button>
            );
          })}
          <span className={moreClass}>+ more</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 pt-1 md:gap-3">
        <label className={`flex items-center gap-3 text-[12px] ${FAINT} md:gap-3.5 md:text-[13px]`}>
          <span className="w-[74px] shrink-0 md:w-[90px]">Voice</span>
          <input
            type="range"
            min={0}
            max={100}
            value={voiceGain}
            onChange={(e) => setVoiceGain(Number(e.target.value))}
            aria-label="Voice mix level"
            className="h-1 w-full accent-[var(--hv2-body)]"
          />
        </label>
        <label className={`flex items-center gap-3 text-[12px] ${FAINT} md:gap-3.5 md:text-[13px]`}>
          <span className="w-[74px] shrink-0 md:w-[90px]">
            <span className="md:hidden">Background</span>
            <span className="hidden md:inline">Soundscape</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={bedGain}
            onChange={(e) => setBedGain(Number(e.target.value))}
            aria-label="Soundscape mix level"
            className="h-1 w-full accent-[var(--hv2-body)]"
          />
        </label>
      </div>
    </div>
  );

  return (
    <section
      className={`${BANDS[3]} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-10 md:border-t-0 md:px-6 md:py-24`}
    >
      {/* Mobile: copy then card */}
      <div
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 md:hidden"
        data-hv2-reveal
      >
        <span
          className={`text-[11px] font-semibold uppercase tracking-[1.6px] ${GOLD}`}
        >
          Sound
        </span>
        <h2
          className={`home-v2-display m-0 text-[26px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY}`}
        >
          Voices and soundscapes worth closing your eyes for.
        </h2>
        <p className={`m-0 mb-1 text-[15px] leading-[1.55] ${MUTED}`}>
          Natural voices, rich background sound, mixed the way you like it.
        </p>
        {mixer}
      </div>

      {/* Desktop */}
      <div className="mx-auto hidden w-full max-w-[1200px] gap-10 md:grid md:grid-cols-[minmax(0,520px)_1fr] md:items-center md:gap-16">
        <div data-hv2-reveal>{mixer}</div>
        <div className="flex flex-col gap-[18px]" data-hv2-reveal>
          <span
            className={`text-xs font-semibold uppercase tracking-[1.6px] ${GOLD}`}
          >
            Sound
          </span>
          <h2
            className={`home-v2-display m-0 text-[46px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY}`}
          >
            Voices and soundscapes worth closing your eyes for.
          </h2>
          <p className={`m-0 max-w-[500px] text-[19px] leading-[1.6] ${MUTED}`}>
            Natural voices, rich background sound, mixed the way you like it.
          </p>
        </div>
      </div>
    </section>
  );
}

function ShareSection() {
  const [copied, setCopied] = useState(false);
  const exampleLink = "consciously.live/listen/…";

  const copyBtn = (
    <button
      type="button"
      className="accent-fill-gradient shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--hv2-on-gold)] md:px-3.5 md:text-[13px]"
      onClick={() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );

  return (
    <section
      className={`${BANDS[0]} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-10 md:border-t-0 md:px-6 md:py-24`}
    >
      {/* Mobile: one card, no lead */}
      <div
        className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 md:hidden"
        data-hv2-reveal
      >
        <span
          className={`text-[11px] font-semibold uppercase tracking-[1.6px] ${GOLD}`}
        >
          Share
        </span>
        <h2
          className={`home-v2-display m-0 text-[26px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY}`}
        >
          Made for someone you love.
        </h2>
        <div
          className={`flex flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] ${CARD} px-4 py-3.5`}
        >
          <span
            className={`text-[10px] uppercase tracking-[1.4px] ${GOLD}`}
          >
            Pass it on
          </span>
          <span className={`text-[14px] ${MUTED}`}>
            Found one that landed? Send a listen link — no account needed to
            hear it.
          </span>
          <div
            className={`flex items-center gap-2 rounded-full ${INSET} py-1.5 pl-3 pr-1.5`}
          >
            <span className={`min-w-0 flex-1 truncate text-[12px] ${FAINT}`}>
              {exampleLink}
            </span>
            {copyBtn}
          </div>
          <div className="h-px bg-[var(--hv2-card-border)]" />
          <span
            className={`text-[10px] uppercase tracking-[1.4px] ${GOLD}`}
          >
            Make one for them
          </span>
          <span className={`text-[14px] ${MUTED}`}>
            Write it for someone you love, then share the listen link.
          </span>
          <span className={`home-v2-display text-[15px] italic ${IVORY}`}>
            “For Sam, the night before his first marathon.”
          </span>
          <CompactPlayerRow
            title="Sam, you’re ready"
            meta="For Sam · Warm voice"
          />
        </div>
      </div>

      {/* Desktop */}
      <div className="mx-auto hidden w-full max-w-[1200px] md:block">
        <div
          className="mb-10 flex max-w-[760px] flex-col gap-[18px]"
          data-hv2-reveal
        >
          <span
            className={`text-xs font-semibold uppercase tracking-[1.6px] ${GOLD}`}
          >
            Share
          </span>
          <h2
            className={`home-v2-display m-0 text-[46px] font-normal leading-[1.1] tracking-[-0.6px] ${IVORY}`}
          >
            Made for someone you love.
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-6" data-hv2-reveal>
          <div className={`${CARD} flex flex-col gap-4 rounded-[18px] p-[26px]`}>
            <p className={`home-v2-display m-0 text-[26px] ${IVORY}`}>
              Pass it on
            </p>
            <p className={`m-0 text-base ${MUTED}`}>
              Found one that landed? Send a listen link — no account needed to
              hear it.
            </p>
            <div
              className={`flex items-center gap-2.5 rounded-full ${INSET} py-2.5 pl-4 pr-2.5`}
            >
              <span className={`min-w-0 flex-1 truncate text-sm ${FAINT}`}>
                {exampleLink}
              </span>
              {copyBtn}
            </div>
          </div>
          <div className={`${CARD} flex flex-col gap-4 rounded-[18px] p-[26px]`}>
            <p className={`home-v2-display m-0 text-[26px] ${IVORY}`}>
              Make one for them
            </p>
            <p className={`m-0 text-base ${MUTED}`}>
              Write it for someone you love, then share the listen link.
            </p>
            <div className="flex flex-row items-center gap-3.5">
              <div
                className={`home-v2-display flex-1 rounded-xl ${INSET} px-4 py-3.5 text-base italic text-[var(--hv2-ink)]`}
              >
                “For Sam, the night before his first marathon.”
              </div>
              <span className="text-[22px] text-[var(--hv2-gold)]" aria-hidden>
                →
              </span>
              <div
                className={`flex flex-1 items-center gap-2.5 rounded-xl ${INSET} px-3.5 py-3`}
              >
                <span className="accent-fill-gradient flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[var(--hv2-on-gold)]">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
                <span className={`home-v2-display text-lg ${IVORY}`}>
                  Sam, you’re ready
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MeditateMarketingPage({
  featuredPrograms,
}: {
  featuredPrograms: MeditateFeaturedProgram[];
}) {
  const createHref = createMeditationHref({ path: "oneShot" });
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
  const form = heroAnim(300);

  return (
    <HomeV2ScrollChrome>
      <div className="relative">
        <HomeV2Chrome />

        <section className="home-v2-hero home-v2-hero--under-chrome flex w-full flex-col px-5 pb-10 text-[var(--hv2-hero-fg)] md:px-6 md:pb-24">
          <div className="relative z-[1] mx-auto flex w-full max-w-[1200px] flex-col items-center gap-4 text-center md:gap-[22px] md:pt-14">
            <h1
              className={`home-v2-display m-0 w-full text-[40px] font-normal leading-[1.06] tracking-[-0.6px] text-[var(--hv2-hero-fg)] md:text-[clamp(44px,5vw,68px)] md:font-[350] md:tracking-[-1px] ${h1.className}`}
              style={h1.style}
            >
              Personalised guided meditations
              <br className="hidden md:block" />
              {" "}
              that sound{" "}
              <em className="italic text-[var(--hv2-gold)]">great</em>.
            </h1>
            <p
              className={`m-0 text-[16px] leading-[1.5] text-[var(--hv2-hero-muted)] md:text-[21px] ${sub.className}`}
              style={sub.style}
            >
              Say what’s on your mind. Press play.
            </p>
            <div
              className={`w-full max-w-[1000px] pt-1.5 text-left md:mt-[18px] md:pt-0 ${form.className}`}
              style={form.style}
            >
              <HeroPrompt />
            </div>
          </div>
        </section>

        <PersonalByDesign />
        <StylesGrid />
        <ProgramsSection programs={featuredPrograms} />
        <SoundSection />
        <ShareSection />

        <section
          className={`${BANDS[1]} w-full border-t border-[var(--hv2-hero-hairline)] px-5 py-11 md:border-t-0 md:px-6 md:py-20`}
        >
          <div
            className="mx-auto flex max-w-[1200px] flex-col items-stretch gap-3.5 text-center md:flex-row md:items-center md:justify-between md:gap-6 md:text-left"
            data-hv2-reveal
          >
            <div className="flex flex-col gap-3.5 md:gap-2.5">
              <h2
                className={`home-v2-display m-0 text-[28px] font-normal leading-[1.1] tracking-tight ${IVORY} md:text-[46px]`}
              >
                Ready when you are.
              </h2>
              <p className={`m-0 text-[15px] ${MUTED} md:text-lg`}>
                Your first meditation takes one sentence.
              </p>
            </div>
            <Link
              href={createHref}
              className="accent-fill-gradient mt-1.5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full px-7 text-[16px] font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 md:mt-0 md:h-auto md:w-auto md:py-3.5 md:text-[17px]"
            >
              <HomeV2ToolIcon tool="meditate" />
              Create a meditation
            </Link>
          </div>
        </section>
      </div>
    </HomeV2ScrollChrome>
  );
}

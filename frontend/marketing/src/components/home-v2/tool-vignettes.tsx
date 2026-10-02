import type { ReactNode } from "react";
import type { HomeV2ToolId } from "@/components/home-v2/constants";
import { Lockup } from "@/components/home-v2/lockup";

export function WaveBars({ count = 36 }: { count?: number }) {
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
      <svg
        width="20"
        height="24"
        viewBox="0 0 20 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 2v18" />
        <path d="M3 14l7 7 7-7" />
      </svg>
    </div>
  );
}

function AskCard({
  label = "You ask",
  children,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-4 py-4 md:gap-4 md:rounded-3xl md:px-7 md:py-7 ${className}`}
    >
      <p className="m-0 text-[11px] uppercase tracking-[1.3px] text-[var(--hv2-tan-text)] md:text-xs">
        {label}
      </p>
      {children}
    </div>
  );
}

function GetCard({
  label = "You get",
  children,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl bg-[var(--hv2-navy)] px-4 py-4 text-[var(--hv2-ivory)] md:gap-[18px] md:rounded-3xl md:px-7 md:py-7 ${className}`}
    >
      <p className="m-0 text-[11px] uppercase tracking-[1.3px] text-[var(--hv2-gold)] md:text-xs">
        {label}
      </p>
      {children}
    </div>
  );
}

function PlayRow({
  title,
  meta,
  compact = false,
}: {
  title: string;
  meta: string;
  compact?: boolean;
}) {
  return (
    <>
      <div className={`flex items-center ${compact ? "gap-3" : "gap-4"}`}>
        <span
          className={`accent-fill-gradient flex shrink-0 items-center justify-center rounded-full ${
            compact ? "h-10 w-10" : "h-14 w-14"
          }`}
        >
          <svg
            width={compact ? 14 : 18}
            height={compact ? 14 : 18}
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <div className="min-w-0">
          <p
            className={`home-v2-display m-0 font-medium leading-snug ${
              compact ? "text-[16px]" : "text-[22px]"
            }`}
          >
            {title}
          </p>
          <p className="m-0 truncate text-[12px] text-[rgba(246,241,231,0.6)] md:text-[13px]">
            {meta}
          </p>
        </div>
      </div>
      {compact ? null : <WaveBars />}
    </>
  );
}

function Chip({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  if (active) {
    return (
      <span className="rounded-full bg-[var(--hv2-gold)] px-3.5 py-2 text-sm font-semibold text-[var(--hv2-navy)]">
        {children}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-[#D9CCB2] px-3.5 py-2 text-sm">
      {children}
    </span>
  );
}

function Stack({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full max-w-[540px] flex-col gap-3" aria-hidden>
      {children}
    </div>
  );
}

/* ─── Home page vignettes ─────────────────────────────────────────────── */

export function MeditateVignette() {
  return (
    <Stack>
      {/* Mobile: single compact card matching design HTML */}
      <div className="flex flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-4 py-3.5 text-[var(--hv2-ink)] md:hidden">
        <p className="m-0 text-[10px] font-normal uppercase tracking-[1.4px] text-[var(--hv2-gold)]">
          You ask
        </p>
        <p className="home-v2-display m-0 text-[15px] italic leading-snug">
          “I want to manifest opening my new studio.”
        </p>
        <div className="h-px bg-[var(--hv2-card-border)]" />
        <p className="m-0 text-[10px] font-normal uppercase tracking-[1.4px] text-[var(--hv2-gold)]">
          You get
        </p>
        <div className="flex items-center gap-3">
          <span
            className="accent-fill-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            aria-hidden
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="home-v2-display text-[16px] leading-snug">
              Opening day at your new studio
            </span>
            <span className="truncate text-[12px] text-[var(--hv2-muted)]">
              Manifestation · Warm voice · Soft rain
            </span>
          </span>
        </div>
      </div>
      {/* Desktop */}
      <div className="hidden flex-col gap-3 md:flex">
        <AskCard>
          <p className="home-v2-display m-0 text-xl italic leading-snug">
            “I want to manifest opening my new studio.”
          </p>
          <div className="flex flex-wrap gap-2">
            <Chip active>Manifestation</Chip>
            <Chip>Visualization</Chip>
            <Chip>Sleep</Chip>
          </div>
        </AskCard>
        <ArrowDown />
        <GetCard>
          <PlayRow
            title="Opening day at your new studio"
            meta="Manifestation · Warm voice · Soft rain"
          />
        </GetCard>
      </div>
    </Stack>
  );
}

export function JournalVignette() {
  return (
    <Stack>
      <div className="flex flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-4 py-3.5 text-[var(--hv2-ink)] md:hidden">
        <p className="m-0 text-[10px] uppercase tracking-[1.4px] text-[var(--hv2-gold)]">
          Today&apos;s entry
        </p>
        <p className="home-v2-display m-0 text-[15px] italic leading-[1.45]">
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
        <div className="flex gap-3 pt-0.5">
          {(
            [
              ["Vision", "78%", "bg-[var(--hv2-gold)]"],
              ["Self-doubt", "52%", "bg-[var(--hv2-muted)]"],
              ["Gratitude", "36%", "bg-[var(--hv2-muted)]"],
            ] as const
          ).map(([label, width, bar]) => (
            <div key={label} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[12px] text-[var(--hv2-body)]">{label}</span>
              <div className="h-1.5 rounded-full bg-[var(--hv2-card-track)]">
                <div className={`h-1.5 rounded-full ${bar}`} style={{ width }} />
              </div>
            </div>
          ))}
        </div>
        <span className="text-[13px] font-semibold text-[var(--hv2-gold)]">
          Turn into a meditation →
        </span>
      </div>
      <div className="hidden flex-col gap-3 md:flex">
        <GetCard label="Today's entry">
          <p className="home-v2-display m-0 text-[19px] italic leading-relaxed">
            “
            <span className="border-b-2 border-[var(--hv2-gold)]">
              I can picture the studio so clearly
            </span>
            . But{" "}
            <span className="border-b-2 border-[#C4878F]">
              who am I to charge for this?
            </span>{" "}
            <span className="border-b-2 border-[#c3d2e8]">
              Grateful for a quiet morning
            </span>{" "}
            to dream.”
          </p>
        </GetCard>
        <ArrowDown />
        <AskCard label="Patterns this month">
          {(
            [
              ["Vision", "78%", "bg-[var(--hv2-gold)]"],
              ["Self-doubt", "52%", "bg-[#C4878F]"],
              ["Gratitude", "36%", "bg-[#c3d2e8]"],
            ] as const
          ).map(([label, width, bar]) => (
            <div key={label} className="flex flex-col gap-2">
              <span className="text-[15px]">{label}</span>
              <div className="h-2 rounded-full bg-[var(--hv2-card-track)]">
                <div className={`h-2 rounded-full ${bar}`} style={{ width }} />
              </div>
            </div>
          ))}
          <span className="pt-1 text-[15px] font-semibold text-[var(--hv2-tan-text)]">
            Turn into a meditation →
          </span>
        </AskCard>
      </div>
    </Stack>
  );
}

export function ManifestVignette() {
  return (
    <>
      <div
        className="flex w-full max-w-[540px] flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-4 py-3.5 text-[var(--hv2-ink)] md:hidden"
        aria-hidden
      >
        <p className="m-0 text-[10px] uppercase tracking-[1.4px] text-[var(--hv2-gold)]">
          Vision board
        </p>
        <div className="flex gap-1.5">
          {["var(--hv2-gold)", "#3A4E6E", "#EFE6D3", "#8A6A34"].map((c) => (
            <div
              key={c}
              className="h-11 min-w-0 flex-1 rounded-lg"
              style={{ background: c }}
            />
          ))}
        </div>
        <p className="home-v2-display m-0 text-[15px] italic leading-snug">
          “I trust my vision and act on it every day.”
        </p>
        <div className="h-px bg-[var(--hv2-card-border)]" />
        <p className="home-v2-display m-0 text-[15px]">Open my own studio</p>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px]">
          <span>● Price the first collection</span>
          <span className="text-[var(--hv2-body)]">○ Find a studio space</span>
          <span className="text-[var(--hv2-body)]">○ Open the online shop</span>
        </div>
      </div>
      <div
        className="hidden w-full max-w-[540px] flex-col gap-6 rounded-3xl bg-[var(--hv2-navy)] p-10 text-[var(--hv2-ivory)] md:flex"
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
            <span className="text-[rgba(246,241,231,0.7)]">
              ○ Find a studio space
            </span>
            <span className="text-[rgba(246,241,231,0.7)]">
              ○ Open the online shop
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export function FocusVignette() {
  return (
    <>
      <div
        className="flex w-full max-w-[540px] flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-4 py-3.5 md:hidden"
        aria-hidden
      >
        <div className="flex items-center gap-3.5">
          <span className="relative flex h-16 w-16 shrink-0 items-center justify-center">
            <svg
              width="64"
              height="64"
              className="absolute inset-0 -rotate-90"
              aria-hidden
            >
              <circle
                cx="32"
                cy="32"
                r="27"
                fill="none"
                stroke="var(--hv2-card-track)"
                strokeWidth="4"
              />
              <circle
                cx="32"
                cy="32"
                r="27"
                fill="none"
                stroke="var(--hv2-gold)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="125.5 169.6"
              />
            </svg>
            <span className="home-v2-display relative text-[17px]">18:24</span>
          </span>
          <span className="flex min-w-0 flex-col gap-[3px]">
            <span className="home-v2-display text-[16px] leading-snug">
              Price the first collection
            </span>
            <span className="text-[12px] text-[var(--hv2-muted)]">
              From Manifest · step 1 of 3
            </span>
            <span className="text-[12px] text-[var(--hv2-gold)]">
              Distracting sites blocked
            </span>
          </span>
        </div>
      </div>
      <div
        className="hidden w-full max-w-[540px] items-center gap-8 rounded-3xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-10 py-12 md:flex"
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
    </>
  );
}

export function ChatVignette() {
  return (
    <>
      <div
        className="flex w-full max-w-[540px] flex-col gap-2.5 overflow-hidden rounded-[14px] border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-4 py-3.5 md:hidden"
        aria-hidden
      >
        <div className="ml-auto max-w-[82%] rounded-[12px_12px_4px_12px] bg-[var(--hv2-gold)] px-[13px] py-[9px] text-[14px] leading-[1.4] text-[var(--hv2-navy)]">
          I keep doubting myself.
        </div>
        <div className="mr-auto max-w-[88%] rounded-[12px_12px_12px_4px] border border-[var(--hv2-card-border)] bg-[var(--hv2-sticky-bg)] px-[13px] py-[9px] text-[14px] leading-[1.4] text-[var(--hv2-ink)]">
          Want a meditation for that?
        </div>
        <span className="self-start rounded-full border border-[rgba(246,241,231,0.22)] px-3 py-1.5 text-[13px] text-[var(--hv2-ink)]">
          ▸ Start meditation
        </span>
      </div>
      <div
        className="hidden w-full max-w-[540px] flex-col gap-3.5 rounded-3xl bg-[var(--hv2-navy)] p-10 md:flex"
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
    </>
  );
}

export const HOME_TOOL_VIGNETTES: Record<HomeV2ToolId, ReactNode> = {
  meditate: <MeditateVignette />,
  journal: <JournalVignette />,
  manifest: <ManifestVignette />,
  focus: <FocusVignette />,
  chat: <ChatVignette />,
};

/* ─── Feature marketing strip vignettes ───────────────────────────────── */

function MeditateOneShotVignette() {
  return (
    <Stack>
      <AskCard label="One-shot prompt">
        <p className="home-v2-display m-0 text-xl italic leading-snug">
          “Calm before tomorrow’s pitch.”
        </p>
        <p className="m-0 text-sm text-[var(--hv2-muted)]">
          Straight to the script generator — no coaching chat
        </p>
      </AskCard>
      <ArrowDown />
      <GetCard>
        <PlayRow
          title="Steady before you speak"
          meta="One-shot · Soft voice · Quiet room"
        />
      </GetCard>
    </Stack>
  );
}

function MeditateByTypeVignette() {
  return (
    <Stack>
      <AskCard label="By type">
        <div className="flex flex-wrap gap-2">
          <Chip active>Manifestation</Chip>
          <Chip>Visualization</Chip>
          <Chip>Sleep</Chip>
          <Chip>Breath-led</Chip>
        </div>
        <p className="home-v2-display m-0 text-lg italic leading-snug">
          “Opening night at the studio — I want to feel already there.”
        </p>
      </AskCard>
      <ArrowDown />
      <GetCard>
        <PlayRow
          title="Already at the opening"
          meta="Manifestation · Warm voice · Soft rain"
        />
      </GetCard>
    </Stack>
  );
}

function MeditateFromChatVignette() {
  return (
    <Stack>
      <div className="flex flex-col gap-3 rounded-3xl bg-[var(--hv2-navy)] p-7">
        <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
          Free flow chat
        </p>
        <div className="self-end rounded-[18px_18px_4px_18px] bg-[var(--hv2-gold)] px-[18px] py-3.5 text-base text-[var(--hv2-navy)]">
          I keep circling the same doubt before I price anything.
        </div>
        <div className="self-start rounded-[18px_18px_18px_4px] bg-[rgba(246,241,231,0.08)] px-[18px] py-3.5 text-base text-[var(--hv2-ivory)]">
          What’s under that — fear of charging too much, or of being seen?
        </div>
        <div className="self-end rounded-[18px_18px_4px_18px] bg-[var(--hv2-gold)] px-[18px] py-3.5 text-base text-[var(--hv2-navy)]">
          Both. I want to feel already worth it — studio open, first sale done.
        </div>
        <div className="self-start rounded-[18px_18px_18px_4px] bg-[rgba(246,241,231,0.08)] px-[18px] py-3.5 text-base text-[var(--hv2-ivory)]">
          Got it. I’ll write a session from this exact thread.
        </div>
      </div>
      <ArrowDown />
      <GetCard>
        <PlayRow
          title="Already worth it"
          meta="From chat · Warm voice · Soft rain"
        />
      </GetCard>
    </Stack>
  );
}

function MeditateFromJournalVignette() {
  return (
    <Stack>
      <AskCard label="Reflect on a journal entry">
        <p className="home-v2-display m-0 text-xl italic leading-snug">
          “I can see the business so clearly. Why do I keep waiting to begin?”
        </p>
      </AskCard>
      <ArrowDown />
      <GetCard>
        <PlayRow
          title="Begin from what you already wrote"
          meta="From journal · Warm voice · Soft rain"
        />
      </GetCard>
    </Stack>
  );
}

function MeditateFromGoalVignette() {
  return (
    <Stack>
      <AskCard label="Move towards a goal">
        <p className="home-v2-display m-0 text-xl leading-snug">
          Open my own studio
        </p>
        <p className="m-0 text-sm text-[var(--hv2-muted)]">
          Life area · optionally one goal · dream and blockers
        </p>
      </AskCard>
      <ArrowDown />
      <GetCard>
        <PlayRow
          title="Living as its successful owner, today"
          meta="From goal · Visualization · Warm voice"
        />
      </GetCard>
    </Stack>
  );
}

function MeditateProgramsVignette() {
  return (
    <Stack>
      <div
        className="flex w-full flex-col gap-4 rounded-3xl bg-[var(--hv2-navy)] p-7 text-[var(--hv2-ivory)]"
        aria-hidden
      >
        <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
          Library · Programs
        </p>
        <p className="home-v2-display m-0 text-[22px] font-medium">
          Chakra Cleanse
        </p>
        <p className="m-0 text-sm leading-snug text-[rgba(246,241,231,0.65)]">
          Seven energy centers — root to crown — color, location, and theme,
          session by session.
        </p>
        <div className="flex flex-col gap-2">
          {(
            [
              ["Intro", "Introduction", "5 min", true],
              ["Day 2", "Root Chakra", "10 min", false],
              ["Day 5", "Heart Chakra", "10 min", false],
            ] as const
          ).map(([day, title, mins, on]) => (
            <div
              key={title}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                on
                  ? "bg-[rgba(246,241,231,0.1)]"
                  : "border border-[rgba(246,241,231,0.12)]"
              }`}
            >
              <span
                className={`accent-fill-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  on ? "" : "opacity-40"
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="m-0 text-xs uppercase tracking-[1px] text-[var(--hv2-gold)]">
                  {day} · ready audio · {mins}
                </p>
                <p className="home-v2-display m-0 text-base">{title}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="m-0 text-[15px] font-semibold text-[var(--hv2-gold)]">
          Explore course →
        </p>
      </div>
      <ArrowDown />
      <AskCard label="Make it your own">
        <p className="home-v2-display m-0 text-lg leading-snug">
          By Program · Chakra Cleanse
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip active>Root Chakra</Chip>
          <Chip active>Heart Chakra</Chip>
          <Chip>One meditation</Chip>
        </div>
        <p className="home-v2-display m-0 text-base italic leading-snug text-[var(--hv2-muted)]">
          “What’s been making you feel unsteady lately?”
        </p>
        <p className="m-0 text-sm text-[var(--hv2-muted)]">
          Customization intake → generate fresh audio for you
        </p>
      </AskCard>
    </Stack>
  );
}

function JournalWriteSpeakVignette() {
  return (
    <Stack>
      <GetCard label="Tonight’s entry">
        <p className="home-v2-display m-0 text-[19px] italic leading-relaxed">
          “I can picture the studio so clearly. But who am I to charge for this?
          Grateful for a quiet morning to dream.”
        </p>
        <p className="m-0 text-[13px] text-[rgba(246,241,231,0.6)]">
          Typed · or spoken and transcribed
        </p>
      </GetCard>
      <AskCard label="Same page">
        <div className="flex flex-wrap gap-2">
          <Chip active>Text</Chip>
          <Chip>Voice → text</Chip>
        </div>
        <p className="m-0 text-sm text-[var(--hv2-muted)]">
          Clip kept with the entry when you speak it in
        </p>
      </AskCard>
    </Stack>
  );
}

function JournalImportVignette() {
  return (
    <Stack>
      <AskCard label="Handwritten photos">
        <div className="grid grid-cols-3 gap-2">
          {(["#E8DFC8", "#D9CCB2", "#C4B49A"] as const).map((c, i) => (
            <div
              key={c}
              className="flex h-[72px] items-end rounded-[10px] px-2 pb-2"
              style={{ background: c }}
            >
              <span className="font-display text-[11px] italic leading-tight text-[var(--hv2-navy)]/70">
                {i === 0 ? "page 1" : i === 1 ? "page 2" : "page 3"}
              </span>
            </div>
          ))}
        </div>
        <p className="m-0 text-sm text-[var(--hv2-muted)]">
          AI reads the handwriting · you review before save
        </p>
      </AskCard>
      <ArrowDown />
      <GetCard label="Or import">
        <div className="flex flex-wrap gap-2">
          <Chip active>Day One</Chip>
          <span className="rounded-full border border-[rgba(246,241,231,0.3)] px-3.5 py-2 text-sm text-[var(--hv2-ivory)]">
            Markdown
          </span>
          <span className="rounded-full border border-[rgba(246,241,231,0.3)] px-3.5 py-2 text-sm text-[var(--hv2-ivory)]">
            CSV
          </span>
          <span className="rounded-full border border-[rgba(246,241,231,0.3)] px-3.5 py-2 text-sm text-[var(--hv2-ivory)]">
            PDF notes
          </span>
        </div>
        <p className="home-v2-display m-0 text-lg leading-snug">
          Your past writing, ready in Consciously
        </p>
      </GetCard>
    </Stack>
  );
}

function JournalPatternsVignette() {
  return <JournalVignette />;
}

function JournalGratitudesVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-4 rounded-3xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-7 py-7"
      aria-hidden
    >
      <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-tan-text)]">
        Gratitudes today
      </p>
      {(
        [
          "A quiet morning to dream",
          "The sketch that finally worked",
          "A friend who asked how it’s going",
        ] as const
      ).map((line) => (
        <div
          key={line}
          className="flex items-start gap-3 border-t border-[var(--hv2-card-border)] pt-3 first:border-t-0 first:pt-0"
        >
          <span className="mt-1 text-[var(--hv2-gold)]">✦</span>
          <p className="home-v2-display m-0 text-lg italic leading-snug">{line}</p>
        </div>
      ))}
      <p className="m-0 pt-1 text-sm text-[var(--hv2-muted)]">
        Same timeline as the hard days
      </p>
    </div>
  );
}

function JournalToMeditateVignette() {
  return (
    <Stack>
      <AskCard label="Journal entry">
        <p className="home-v2-display m-0 text-xl italic leading-snug">
          “Who am I to charge for this?”
        </p>
      </AskCard>
      <ArrowDown />
      <GetCard>
        <p className="m-0 text-[15px] font-semibold text-[var(--hv2-gold)]">
          Generate meditation
        </p>
        <PlayRow
          title="Worth what you make"
          meta="Reflect on a journal entry · Soft voice"
        />
      </GetCard>
    </Stack>
  );
}

function ManifestBoardVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-4 rounded-3xl bg-[var(--hv2-navy)] p-8 text-[var(--hv2-ivory)]"
      aria-hidden
    >
      <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
        Vision board
      </p>
      <div className="grid grid-cols-3 gap-2.5">
        {(
          [
            ["var(--hv2-gold)", "Studio light"],
            ["#3A4E6E", "First collection"],
            ["#EFE6D3", "Quiet mornings"],
            ["#8A6A34", "Open shop"],
            ["#5C6B7A", "Craft table"],
            ["#C4A574", "Opening night"],
          ] as const
        ).map(([c, label]) => (
          <div key={label} className="flex flex-col gap-1.5">
            <div className="h-[88px] rounded-[10px]" style={{ background: c }} />
            <span className="text-[12px] text-[rgba(246,241,231,0.65)]">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManifestManifestoVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-5 rounded-3xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-8 py-9"
      aria-hidden
    >
      <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-tan-text)]">
        Personal manifesto
      </p>
      <p className="home-v2-display m-0 text-2xl italic leading-snug">
        “I trust my vision and act on it every day.”
      </p>
      <p className="home-v2-display m-0 text-xl italic leading-snug text-[var(--hv2-muted)]">
        “I charge what the work is worth.”
      </p>
      <p className="m-0 text-sm text-[var(--hv2-muted)]">
        Lines you’ll recognise under pressure
      </p>
    </div>
  );
}

function ManifestGoalsVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-5 rounded-3xl bg-[var(--hv2-navy)] p-8 text-[var(--hv2-ivory)]"
      aria-hidden
    >
      <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
        Goal
      </p>
      <p className="home-v2-display m-0 text-[26px]">Open my own studio</p>
      <div className="flex flex-col gap-2.5 text-[15px]">
        <span>● Price the first collection</span>
        <span className="text-[rgba(246,241,231,0.7)]">○ Find a studio space</span>
        <span className="text-[rgba(246,241,231,0.7)]">○ Open the online shop</span>
      </div>
      <div className="mt-1 rounded-2xl border border-[rgba(246,241,231,0.14)] px-4 py-3">
        <p className="m-0 text-xs uppercase tracking-[1px] text-[var(--hv2-gold)]">
          Named obstacle
        </p>
        <p className="home-v2-display m-0 mt-1 text-base italic">
          “Who am I to charge for this?”
        </p>
      </div>
    </div>
  );
}

function ManifestHandoffVignette() {
  return (
    <Stack>
      <AskCard label="From Manifest">
        <p className="home-v2-display m-0 text-xl leading-snug">
          Open my own studio
        </p>
        <p className="m-0 text-sm text-[var(--hv2-muted)]">
          Step · Price the first collection
        </p>
      </AskCard>
      <ArrowDown />
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2 rounded-3xl bg-[var(--hv2-navy)] p-5 text-[var(--hv2-ivory)]">
          <Lockup tool="Meditate" size="card" onNavy />
          <p className="home-v2-display m-0 text-sm leading-snug">
            Feel the opening day
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-3xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] p-5">
          <Lockup tool="Focus" size="card" onNavy />
          <p className="home-v2-display m-0 text-sm leading-snug">
            25:00 on pricing
          </p>
        </div>
      </div>
    </Stack>
  );
}

function FocusFromStepVignette() {
  return <FocusVignette />;
}

function FocusBlockingVignette() {
  return (
    <Stack>
      <div
        className="flex w-full items-center gap-6 rounded-3xl border border-[var(--hv2-card-border)] bg-[var(--hv2-card)] px-8 py-8"
        aria-hidden
      >
        <span className="home-v2-display flex h-[100px] w-[100px] shrink-0 items-center justify-center rounded-full border-[6px] border-[var(--hv2-line-soft)] border-r-[var(--hv2-gold)] border-t-[var(--hv2-gold)] text-[26px]">
          18:24
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="home-v2-display m-0 text-xl">Session running</p>
          <p className="m-0 text-sm text-[var(--hv2-tan-text)]">
            Distracting sites blocked
          </p>
        </div>
      </div>
      <AskCard label="Blocked until the bell">
        {(["Social feeds", "News tabs", "Shopping rabbit holes"] as const).map(
          (site) => (
            <div
              key={site}
              className="flex items-center justify-between border-t border-[var(--hv2-card-border)] pt-2.5 first:border-t-0 first:pt-0"
            >
              <span className="text-[15px]">{site}</span>
              <span className="text-xs font-semibold uppercase tracking-[1px] text-[var(--hv2-tan-text)]">
                Blocked
              </span>
            </div>
          ),
        )}
      </AskCard>
    </Stack>
  );
}

function FocusLengthsVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-3"
      aria-hidden
    >
      {(
        [
          ["25:00", "Pomodoro", "Price the first collection", true],
          ["50:00", "Deep work", "Draft the shop copy", false],
        ] as const
      ).map(([time, kind, task, on]) => (
        <div
          key={time}
          className={`flex items-center gap-5 rounded-3xl px-7 py-6 ${
            on
              ? "bg-[var(--hv2-navy)] text-[var(--hv2-ivory)]"
              : "border border-[var(--hv2-card-border)] bg-[var(--hv2-card)]"
          }`}
        >
          <span
            className={`home-v2-display flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full border-[5px] text-lg ${
              on
                ? "border-[rgba(246,241,231,0.2)] border-r-[var(--hv2-gold)] border-t-[var(--hv2-gold)]"
                : "border-[var(--hv2-line-soft)] border-r-[var(--hv2-gold)] border-t-[var(--hv2-gold)]"
            }`}
          >
            {time}
          </span>
          <div>
            <p
              className={`m-0 text-xs uppercase tracking-[1.2px] ${
                on ? "text-[var(--hv2-gold)]" : "text-[var(--hv2-tan-text)]"
              }`}
            >
              {kind}
            </p>
            <p className="home-v2-display m-0 text-lg leading-snug">{task}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FocusCloseLoopVignette() {
  return (
    <Stack>
      <GetCard label="Session complete">
        <p className="home-v2-display m-0 text-[22px]">
          Price the first collection
        </p>
        <p className="m-0 text-[13px] text-[rgba(246,241,231,0.6)]">
          25:00 · Open my own studio · step 1 of 3
        </p>
        <p className="m-0 text-[15px] font-semibold text-[var(--hv2-gold)]">
          Progress logged on the goal
        </p>
      </GetCard>
      <ArrowDown />
      <AskCard label="Queued next">
        <p className="home-v2-display m-0 text-xl leading-snug">
          Find a studio space
        </p>
        <p className="m-0 text-sm text-[var(--hv2-muted)]">
          Ready for tomorrow · less willpower to start
        </p>
      </AskCard>
    </Stack>
  );
}

function ChatContextVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-3.5 rounded-3xl bg-[var(--hv2-navy)] p-8"
      aria-hidden
    >
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-[rgba(246,241,231,0.25)] px-3 py-1.5 text-xs text-[rgba(246,241,231,0.75)]">
          Goal · Open studio
        </span>
        <span className="rounded-full border border-[rgba(246,241,231,0.25)] px-3 py-1.5 text-xs text-[rgba(246,241,231,0.75)]">
          Journal · last night
        </span>
      </div>
      <div className="self-end rounded-[18px_18px_4px_18px] bg-[var(--hv2-gold)] px-[18px] py-3.5 text-base text-[var(--hv2-navy)]">
        I keep doubting myself before I price anything.
      </div>
      <div className="self-start rounded-[18px_18px_18px_4px] bg-[rgba(246,241,231,0.08)] px-[18px] py-3.5 text-base text-[var(--hv2-ivory)]">
        That doubt showed up in last night’s entry too. Want to name what’s under it?
      </div>
    </div>
  );
}

function ChatActionsVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-3.5 rounded-3xl bg-[var(--hv2-navy)] p-8"
      aria-hidden
    >
      <div className="self-end rounded-[18px_18px_4px_18px] bg-[var(--hv2-gold)] px-[18px] py-3.5 text-base text-[var(--hv2-navy)]">
        I finished the first price sheet.
      </div>
      <div className="self-start rounded-[18px_18px_18px_4px] bg-[rgba(246,241,231,0.08)] px-[18px] py-3.5 text-base text-[var(--hv2-ivory)]">
        Beautiful. I can log that win, add the next step, or start a meditation.
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        {(
          ["Log gratitude", "Add Manifest step", "Start meditation"] as const
        ).map((action) => (
          <span
            key={action}
            className="rounded-full border border-[rgba(246,241,231,0.3)] px-3.5 py-2 text-sm text-[var(--hv2-ivory)]"
          >
            ▸ {action}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChatDoorwayVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-3.5 rounded-3xl bg-[var(--hv2-navy)] p-8"
      aria-hidden
    >
      <div className="self-end rounded-[18px_18px_4px_18px] bg-[var(--hv2-gold)] px-[18px] py-3.5 text-base text-[var(--hv2-navy)]">
        I don’t know if I should write, plan, or sit.
      </div>
      <div className="self-start rounded-[18px_18px_18px_4px] bg-[rgba(246,241,231,0.08)] px-[18px] py-3.5 text-base text-[var(--hv2-ivory)]">
        Start here. Then we can hand off:
      </div>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {(
          [
            ["Journal", "Get it out of your head"],
            ["Manifest", "Name the next step"],
            ["Meditate", "Sit with the knot"],
            ["Focus", "Protect an hour"],
          ] as const
        ).map(([tool, line]) => (
          <div
            key={tool}
            className="rounded-2xl border border-[rgba(246,241,231,0.14)] px-3.5 py-3"
          >
            <Lockup tool={tool} size="card" onNavy />
            <p className="m-0 mt-1.5 text-[13px] text-[rgba(246,241,231,0.7)]">
              {line}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatLongArcVignette() {
  return (
    <div
      className="flex w-full max-w-[540px] flex-col gap-3.5 rounded-3xl bg-[var(--hv2-navy)] p-8"
      aria-hidden
    >
      <p className="m-0 text-xs uppercase tracking-[1.3px] text-[var(--hv2-gold)]">
        Continues from Tuesday
      </p>
      <div className="self-end rounded-[18px_18px_4px_18px] bg-[var(--hv2-gold)] px-[18px] py-3.5 text-base text-[var(--hv2-navy)]">
        I’m back. The shop copy still feels stuck.
      </div>
      <div className="self-start rounded-[18px_18px_18px_4px] bg-[rgba(246,241,231,0.08)] px-[18px] py-3.5 text-base text-[var(--hv2-ivory)]">
        Last time you priced the collection. Want a Focus block on the copy, or a visualisation first?
      </div>
    </div>
  );
}

export type ToolMarketingVignetteId =
  | "meditate-oneshot"
  | "meditate-bytype"
  | "meditate-chat"
  | "meditate-journal"
  | "meditate-goal"
  | "meditate-programs"
  | "journal-write"
  | "journal-import"
  | "journal-patterns"
  | "journal-gratitudes"
  | "journal-meditate"
  | "manifest-board"
  | "manifest-manifesto"
  | "manifest-goals"
  | "manifest-handoff"
  | "focus-step"
  | "focus-blocking"
  | "focus-lengths"
  | "focus-close"
  | "chat-context"
  | "chat-actions"
  | "chat-doorway"
  | "chat-arc";

export const TOOL_MARKETING_VIGNETTES: Record<
  ToolMarketingVignetteId,
  ReactNode
> = {
  "meditate-oneshot": <MeditateOneShotVignette />,
  "meditate-bytype": <MeditateByTypeVignette />,
  "meditate-chat": <MeditateFromChatVignette />,
  "meditate-journal": <MeditateFromJournalVignette />,
  "meditate-goal": <MeditateFromGoalVignette />,
  "meditate-programs": <MeditateProgramsVignette />,
  "journal-write": <JournalWriteSpeakVignette />,
  "journal-import": <JournalImportVignette />,
  "journal-patterns": <JournalPatternsVignette />,
  "journal-gratitudes": <JournalGratitudesVignette />,
  "journal-meditate": <JournalToMeditateVignette />,
  "manifest-board": <ManifestBoardVignette />,
  "manifest-manifesto": <ManifestManifestoVignette />,
  "manifest-goals": <ManifestGoalsVignette />,
  "manifest-handoff": <ManifestHandoffVignette />,
  "focus-step": <FocusFromStepVignette />,
  "focus-blocking": <FocusBlockingVignette />,
  "focus-lengths": <FocusLengthsVignette />,
  "focus-close": <FocusCloseLoopVignette />,
  "chat-context": <ChatContextVignette />,
  "chat-actions": <ChatActionsVignette />,
  "chat-doorway": <ChatDoorwayVignette />,
  "chat-arc": <ChatLongArcVignette />,
};

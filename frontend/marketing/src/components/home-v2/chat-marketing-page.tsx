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

const CTA_HREF = `/login?mode=signup&next=${encodeURIComponent("/chat")}`;

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="ml-auto max-w-[92%] rounded-[18px_18px_4px_18px] bg-[var(--hv2-gold)] px-3.5 py-2.5 text-[14px] leading-snug text-[var(--hv2-navy)]">
      {children}
    </div>
  );
}

function AssistantBubble({ children }: { children: ReactNode }) {
  return (
    <div
      className={`mr-auto max-w-[92%] rounded-[18px_18px_18px_4px] px-3.5 py-2.5 text-[14px] leading-snug ${IVORY} ${INSET}`}
    >
      {children}
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

function CoachGraphic() {
  return (
    <div
      className={`flex flex-col gap-3.5 rounded-[18px] ${CARD} p-5 md:h-[240px]`}
      aria-hidden
    >
      <UserBubble>I keep doubting myself before I price anything.</UserBubble>
      <AssistantBubble>
        That doubt keeps showing up right when the work gets real. Want to name
        what’s under it — or pick the next concrete step?
      </AssistantBubble>
    </div>
  );
}

function ActionsGraphic() {
  const rows = [
    {
      label: "Manifest",
      text: "3 next steps added to Studio",
      action: "View",
    },
    {
      label: "Focus",
      text: "Price the collection · 25 min",
      action: "Start",
    },
    {
      label: "Meditate",
      text: "Worth what you make",
      action: "Open",
    },
  ] as const;

  return (
    <div
      className={`flex flex-col gap-3 rounded-[18px] ${CARD} p-5 md:h-[295px]`}
      aria-hidden
    >
      <UserBubble>Help me get moving on the studio this week.</UserBubble>
      <AssistantBubble>Done. Here’s where you’re at:</AssistantBubble>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div
            key={r.label}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 ${INSET}`}
          >
            <span
              className={`shrink-0 text-[10px] font-semibold uppercase tracking-[1.2px] ${GOLD}`}
            >
              {r.label}
            </span>
            <span className={`min-w-0 flex-1 truncate text-[13px] ${IVORY}`}>
              {r.text}
            </span>
            <span className={`shrink-0 text-[12px] font-semibold ${GOLD}`}>
              {r.action}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function JournalGraphic() {
  return (
    <div className="flex flex-col items-stretch gap-3.5 md:h-[210px] md:flex-row md:items-center">
      <div className={`flex min-w-0 flex-1 flex-col gap-3 rounded-[18px] ${CARD} p-5`}>
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
          Journal · Thu 25 Sept
        </p>
        <p className={`home-v2-display m-0 text-[16px] italic leading-snug ${IVORY}`}>
          “Priced the first piece today. Still felt like I was asking too much.”
        </p>
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
      <div className={`flex min-w-0 flex-1 flex-col gap-2.5 rounded-[18px] ${CARD} p-5`}>
        <UserBubble>Why does it feel like too much?</UserBubble>
        <AssistantBubble>
          You priced it below what you said it took to make. Want to work out a
          number that covers your time?
        </AssistantBubble>
      </div>
    </div>
  );
}

function MemoryGraphic() {
  return (
    <div
      className={`flex flex-col gap-3.5 rounded-[18px] ${CARD} p-5 md:h-[220px]`}
      aria-hidden
    >
      <p className={`m-0 text-[11px] font-semibold uppercase tracking-[1.4px] ${GOLD}`}>
        Continues from Tuesday
      </p>
      <UserBubble>I’m back. The shop copy still feels stuck.</UserBubble>
      <AssistantBubble>
        Last time you priced the collection. Want a Focus block on the copy, or
        a short visualisation first?
      </AssistantBubble>
    </div>
  );
}

export function ChatMarketingPage() {
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
              Never stuck in your own head.
            </h1>
            <p
              className={`m-0 max-w-[34rem] text-base text-[var(--hv2-hero-muted)] sm:text-lg md:text-[21px] md:leading-[1.5] ${sub.className}`}
              style={sub.style}
            >
              Think out loud. It listens, and it acts.
            </p>
            <div className={cta.className} style={cta.style}>
              <Link
                href={CTA_HREF}
                className="accent-fill-gradient inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[17px] font-semibold text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
              >
                <HomeV2ToolIcon tool="chat" />
                Talk to your coach
              </Link>
            </div>
          </div>
        </section>

        <Strip
          band={BANDS[0]}
          text={
            <SectionCopy
              eyebrow="Your coach"
              title="It already knows the story."
              lead="Replies that can draw on your goals and journal — not a generic pep talk."
              points={[
                {
                  title: "Grounded when it matters",
                  body: "It can look up a goal, an entry or a session when the conversation needs it.",
                },
                {
                  title: "Only for you",
                  body: "Your conversations stay private.",
                },
              ]}
            />
          }
          graphic={<CoachGraphic />}
        />

        <Strip
          band={BANDS[1]}
          visualLeft
          text={
            <SectionCopy
              eyebrow="Actions"
              title="Then it does something about it."
              lead="Ask, and it acts in the app: no copying, no switching."
              points={[
                {
                  title: "Plan next steps",
                  body: "Talk a goal through and the To Dos land in Manifest.",
                },
                {
                  title: "Start the session",
                  body: "Open a Focus block, or hand off into Create Meditation.",
                },
                {
                  title: "Not sure where to start?",
                  body: "Say what’s stuck. It opens the right tool.",
                },
              ]}
            />
          }
          graphic={<ActionsGraphic />}
        />

        <Strip
          band={BANDS[2]}
          graphicClassName="md:w-[min(100%,560px)]"
          text={
            <SectionCopy
              eyebrow="Journal"
              title="Talk it over."
              lead="Bring what’s on the page into the conversation — then keep what helps."
              points={[
                {
                  title: "Write it down",
                  body: "Ask it to capture a journal entry while you talk.",
                },
                {
                  title: "Keep what helps",
                  body: "Turn a useful line into a Manifest next step.",
                },
              ]}
            />
          }
          graphic={<JournalGraphic />}
        />

        <Strip
          band={BANDS[3]}
          visualLeft
          text={
            <SectionCopy
              eyebrow="Memory"
              title="Pick up where you left off."
              lead="Come back mid-doubt or mid-celebration. It remembers where you got to."
              points={[
                {
                  title: "One ongoing thread",
                  body: "Your history carries over, so you never start from zero.",
                },
                {
                  title: "A fresh start when you want one",
                  body: "Begin a new chat any time.",
                },
              ]}
            />
          }
          graphic={<MemoryGraphic />}
        />

        <section className={`${BANDS[0]} w-full px-5 py-14 md:px-6 md:py-20`}>
          <div
            className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 md:flex-row md:items-center md:justify-between"
            data-hv2-reveal
          >
            <div className="flex flex-col gap-2.5">
              <h2
                className={`home-v2-display m-0 text-[30px] font-normal tracking-tight ${IVORY} md:text-[46px]`}
              >
                What’s on your mind?
              </h2>
              <p className={`m-0 text-base ${MUTED} md:text-lg`}>
                Say it out loud. Start there.
              </p>
            </div>
            <div className="flex flex-col items-start gap-4 md:items-end">
              <Link
                href={CTA_HREF}
                className="accent-fill-gradient inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[17px] font-semibold text-[var(--hv2-navy)] transition-opacity hover:opacity-90"
              >
                <HomeV2ToolIcon tool="chat" />
                Talk to your coach
              </Link>
              <p
                className={`max-w-[28rem] border-t border-[var(--hv2-card-border)] pt-4 text-[13px] leading-relaxed ${FAINT} md:text-right`}
              >
                A coach, not a therapist. If things get heavy, it points you to
                real support.
              </p>
            </div>
          </div>
        </section>
      </div>
    </HomeV2ScrollChrome>
  );
}

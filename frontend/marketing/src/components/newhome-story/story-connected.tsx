import { ArrowDown } from "lucide-react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/logo-mark";
import { FocusRing, PlayDisc } from "./story-art";
import { StoryPhone } from "./story-phone";

/* Card content is shared by the desktop diagram and the mobile chain. */

function CardHead({ name, when }: { name: string; when: string }) {
  return (
    <div className="ns-conn-card-top">
      <span className="ns-label">{name}</span>
      <span className="ns-conn-when">{when}</span>
    </div>
  );
}

function JournalCard({ className = "" }: { className?: string }) {
  return (
    <article className={`ns-card ns-conn-card ${className}`}>
      <CardHead name="Journal" when="Tonight" />
      <p className="ns-conn-text">
        “I know the numbers.{" "}
        <span className="ns-hl-doubt">
          I don’t know if I’m allowed to ask for them.
        </span>
        ”
      </p>
    </article>
  );
}

function HealCard({ className = "" }: { className?: string }) {
  return (
    <article className={`ns-card ns-conn-card ${className}`}>
      <CardHead name="Heal" when="When it comes up" />
      <p className="ns-conn-text">
        “I get scared when it matters. Now I notice it and keep going.”
      </p>
    </article>
  );
}

function MeditateCard({
  desktop,
  className = "",
}: {
  desktop: boolean;
  className?: string;
}) {
  return (
    <article className={`ns-card ns-conn-card ${className}`}>
      <CardHead name="Meditate" when="Tomorrow morning" />
      <div className="ns-conn-row">
        <PlayDisc />
        {desktop ? (
          <span>
            <strong>Steady before the pitch</strong>
            <small>Made from last night’s entry</small>
          </span>
        ) : (
          <strong>Steady before the pitch</strong>
        )}
      </div>
    </article>
  );
}

function FocusCard({
  desktop,
  className = "",
}: {
  desktop: boolean;
  className?: string;
}) {
  return (
    <article className={`ns-card ns-conn-card ${className}`}>
      <CardHead name="Focus" when="When you sit down" />
      <div className="ns-conn-row">
        <FocusRing size={desktop ? 44 : 38} />
        {desktop ? (
          <span>
            <strong>Build the website</strong>
            <small>18:42 left · next step from your goal</small>
          </span>
        ) : (
          <strong>
            Build the website <span className="ns-dim">· 18:42 left</span>
          </strong>
        )}
      </div>
    </article>
  );
}

function ChainLink({ children }: { children: ReactNode }) {
  return (
    <div className="ns-link">
      <ArrowDown size={22} strokeWidth={1.8} aria-hidden />
      <span>{children}</span>
    </div>
  );
}

const PILLS = [
  ["Meditate", "personalised guided meditation app"],
  ["Manifest", "vision board, goal planner and personal manifesto"],
  ["Journal", "daily journal with insights"],
  ["Heal", "self-help workbook"],
  ["Focus", "focus timer"],
] as const;

function WireLeft() {
  return (
    <svg
      className="ns-conn-wire is-left"
      viewBox="0 0 110 780"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 175 C60 175 50 300 110 300" />
      <path d="M0 520 C60 520 50 420 110 420" />
    </svg>
  );
}

function WireRight() {
  return (
    <svg
      className="ns-conn-wire is-right"
      viewBox="0 0 110 780"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M110 175 C50 175 60 300 0 300" />
      <path d="M110 520 C50 520 60 420 0 420" />
    </svg>
  );
}

function SideArrow({ side }: { side: "left" | "right" }) {
  const d =
    side === "left"
      ? "M140 262 C110 330 110 380 140 440"
      : "M140 262 C170 330 170 380 140 440";
  return (
    <svg
      className="ns-conn-arrow"
      viewBox="0 0 280 780"
      aria-hidden="true"
    >
      <defs>
        <marker
          id={`ns-ah-${side}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0 0L10 5L0 10z" fill="var(--ns-gold)" />
        </marker>
      </defs>
      <path
        d={d}
        fill="none"
        stroke="var(--ns-gold)"
        strokeWidth="2"
        markerEnd={`url(#ns-ah-${side})`}
      />
    </svg>
  );
}

export function StoryConnected() {
  return (
    <section className="ns-connected" aria-labelledby="ns-connected-title">
      <div className="ns-wrap">
        <div className="ns-connected-head">
          <p className="ns-kicker">One app instead of five</p>
          <h2 id="ns-connected-title" className="ns-display">
            It’s all connected.
          </h2>
          <p>A doubt you write down tonight can shape tomorrow’s meditation.</p>
        </div>

        {/* Desktop: phone in the centre, four cards around it. */}
        <div className="ns-conn ns-lg-only">
          <div className="ns-conn-col is-left">
            <JournalCard className="is-top" />
            <MeditateCard desktop className="is-bottom" />
            <SideArrow side="left" />
            <span className="ns-conn-label">shapes tomorrow’s meditation</span>
          </div>
          <WireLeft />
          <div className="ns-conn-phone">
            <StoryPhone />
          </div>
          <WireRight />
          <div className="ns-conn-col is-right">
            <HealCard className="is-top" />
            <FocusCard desktop className="is-bottom" />
            <SideArrow side="right" />
            <span className="ns-conn-label">turns into your next step</span>
          </div>
          <p className="ns-conn-caption">
            Everything links back to your goals in Manifest
          </p>
        </div>
        <div className="ns-pills ns-lg-only">
          {PILLS.map(([name, what]) => (
            <span className="ns-pill" key={name}>
              <em>{name}</em>
              <span aria-hidden>·</span>
              {what}
            </span>
          ))}
        </div>

        {/* Mobile: the same four cards as a vertical chain. */}
        <div className="ns-chain ns-sm-only">
          <JournalCard />
          <ChainLink>shapes tomorrow’s meditation</ChainLink>
          <MeditateCard desktop={false} />
          <ChainLink>brings up the fear underneath</ChainLink>
          <HealCard />
          <ChainLink>turns into your next step</ChainLink>
          <FocusCard desktop={false} />
        </div>
        <div className="ns-linkback ns-sm-only">
          <LogoMark size={30} />
          <span>
            Everything links back to your goals in <i>Manifest</i>.
          </span>
        </div>
      </div>
    </section>
  );
}

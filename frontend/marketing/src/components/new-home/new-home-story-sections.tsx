"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { HOME_V2_START_FREE_HREF } from "@/components/home-v2/constants";
import { HOME_FAQ_ITEMS } from "@/components/new-home/new-home-faq-data";
import { useWaitlist } from "@/components/new-home/waitlist-modal";

export { HOME_FAQ_ITEMS };

const PROBLEM_LINES = [
  "You’ve made the vision board, set the goals, downloaded the apps. Six months later, nothing has really moved.",
  "Meditation apps calm you down for ten minutes. Then the same doubts come back.",
  "You know what’s holding you back. Knowing hasn’t changed it.",
] as const;

const TESTIMONIALS = [
  {
    name: "Ananda",
    initial: "A",
    use: "Aligning with myself",
    weeks: "4 weeks",
    quote:
      "Like a companion in my pocket. Each part of my inner life has its own space, and most nights I fall asleep to my Story.",
  },
  {
    name: "David",
    initial: "D",
    use: "Visualising success",
    weeks: "3 weeks",
    quote:
      "I'd put off starting my business for years. Now my inner critic has gone quiet, and I'm working through the actual to-dos.",
  },
  {
    name: "Sarah",
    initial: "S",
    use: "Healing from trauma",
    weeks: "2 weeks",
    quote:
      "I'd been stuck on a breakup for years. Making meditations from Heal gives me something to turn to when the bad thoughts come up.",
  },
] as const;

const PLAN_FEATURES = [
  "Personalised meditations, written and narrated for you",
  "Your manifesto, vision board and nightly story",
  "Journal with insights, and import your old one",
  "Heal workbook and Focus timer",
] as const;

export function ProblemBand() {
  return (
    <section className="new-home-problem" aria-labelledby="new-home-problem-title">
      <div className="new-home-wrap new-home-problem-inner" data-hv2-reveal>
        <p className="new-home-kicker new-home-problem-kicker">Sound familiar?</p>
        <h2 id="new-home-problem-title" className="new-home-display">
          You know what you want. You’re still not doing it.
        </h2>
        <ul className="new-home-problem-list">
          {PROBLEM_LINES.map((line) => (
            <li key={line}>
              <span className="new-home-problem-dash" aria-hidden>
                –
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="new-home-problem-close">
          It’s not motivation you’re missing. It’s daily work on your own goals
          and what stands in their way, until you move.
        </p>
      </div>
    </section>
  );
}

export function FounderBand() {
  return (
    <section className="new-home-founder" aria-labelledby="new-home-founder-title">
      <div className="new-home-wrap new-home-founder-inner">
        <div className="new-home-founder-row" data-hv2-reveal>
          <figure className="new-home-founder-photo">
            <Image
              src="/new-home/founder-alex.jpg"
              alt="Alex, founder of Consciously"
              width={340}
              height={340}
              sizes="(max-width: 767px) 100vw, 340px"
              className="new-home-founder-img"
            />
            <figcaption>
              <strong>Alex, founder</strong>
              <span>Engineer and musician</span>
            </figcaption>
          </figure>
          <div className="new-home-founder-copy">
            <p className="new-home-kicker new-home-problem-kicker">Why it exists</p>
            <h2 id="new-home-founder-title" className="new-home-display">
              I built Consciously to reconnect people with their divine nature.
            </h2>
            <p>
              We all deserve the life we picture. What stops us is fear: that if
              we follow what&apos;s authentic to us, we&apos;ll fail.
            </p>
            <p>
              The meditation and manifestation apps I tried were too general.
              They calmed me down for a while, but never touched my actual goals
              or mindset.
            </p>
            <p>
              Consciously is built around you: your ideal self, your goals and
              your blocks, with meditations made for your exact situation.
            </p>
          </div>
        </div>

        <div className="new-home-founder-quotes" data-hv2-reveal>
          <p className="new-home-kicker new-home-problem-kicker">From early testers</p>
          <ul>
            {TESTIMONIALS.map((t) => (
              <li key={t.name}>
                <blockquote>“{t.quote}”</blockquote>
                <div className="new-home-founder-person">
                  <span className="new-home-founder-initial" aria-hidden>
                    {t.initial}
                  </span>
                  <span>
                    <strong>{t.name}</strong>
                    <em>
                      {t.use} · {t.weeks}
                    </em>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function PlanBand() {
  const waitlist = useWaitlist();

  function onCta() {
    if (waitlist) waitlist.open({ source: "create" });
    else window.location.assign(HOME_V2_START_FREE_HREF);
  }

  return (
    <section className="new-home-plan" aria-labelledby="new-home-plan-title">
      <div className="new-home-wrap new-home-plan-inner" data-hv2-reveal>
        <div className="new-home-plan-copy">
          <p className="new-home-kicker">One plan</p>
          <h2 id="new-home-plan-title" className="new-home-display">
            Everything, for less than one coaching session a month.
          </h2>
          <p>
            Cancel any time from Settings. Free to start: make your first
            meditation before you pay.
          </p>
        </div>
        <article className="new-home-plan-card">
          <p className="new-home-plan-price">
            <span className="new-home-display">£27</span>
            <span>/ month</span>
          </p>
          <ul>
            {PLAN_FEATURES.map((feature) => (
              <li key={feature}>
                <Check size={16} strokeWidth={2.2} aria-hidden />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          {waitlist ? (
            <button type="button" className="new-home-mist" onClick={onCta}>
              Make your first meditation
            </button>
          ) : (
            <a className="new-home-mist" href={HOME_V2_START_FREE_HREF}>
              Make your first meditation
            </a>
          )}
        </article>
      </div>
    </section>
  );
}

export function FaqBand() {
  const base = useId();
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="new-home-faq" aria-labelledby="new-home-faq-title">
      <div className="new-home-wrap new-home-faq-inner" data-hv2-reveal>
        <p className="new-home-kicker">Questions</p>
        <h2 id="new-home-faq-title" className="new-home-display">
          Before you start
        </h2>
        <div className="new-home-faq-list">
          {HOME_FAQ_ITEMS.map((item, i) => {
            const panelId = `${base}-a-${i}`;
            const btnId = `${base}-q-${i}`;
            const isOpen = open === i;
            return (
              <div key={item.q} className="new-home-faq-item">
                <button
                  type="button"
                  id={btnId}
                  className="new-home-faq-q"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    size={20}
                    strokeWidth={1.8}
                    aria-hidden
                    className={isOpen ? "is-open" : undefined}
                  />
                </button>
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  hidden={!isOpen}
                  className="new-home-faq-a"
                >
                  <p>{item.a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

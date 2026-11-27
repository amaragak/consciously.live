"use client";

import Image from "next/image";
import { HOME_V2_START_FREE_HREF } from "@/components/home-v2/constants";
import { useWaitlist } from "@/components/new-home/waitlist-modal";

export function StoryIntro() {
  return (
    <section className="ns-intro" aria-labelledby="ns-intro-title">
      <div className="ns-wrap ns-intro-inner">
        <p className="ns-kicker">One week with Consciously</p>
        <h2 id="ns-intro-title" className="ns-display">
          From one doubt to the next step.
        </h2>
        <p>
          How it works through one week. The examples follow one goal: starting
          a business.
        </p>
      </div>
    </section>
  );
}

const FOUNDER_ALT = "Alex, founder of Consciously";

export function StoryFounder() {
  return (
    <section className="ns-founder" aria-labelledby="ns-founder-title">
      <div className="ns-wrap">
        <div className="ns-founder-inner">
          {/* Desktop: photo with caption beside the full story. */}
          <div className="ns-founder-wide ns-lg-only">
            <div className="ns-founder-photo">
              <Image
                src="/newhome/founder.jpg"
                alt={FOUNDER_ALT}
                width={340}
                height={340}
                sizes="340px"
              />
              <span>
                <span className="ns-founder-name">Alex, founder</span>
                <span className="ns-founder-role">Engineer and musician</span>
              </span>
            </div>
            <div className="ns-founder-copy">
              <p className="ns-kicker">Why it exists</p>
              <h2 id="ns-founder-title" className="ns-display">
                I built Consciously to reconnect people with their divine
                nature.
              </h2>
              <p>
                We all deserve the life we picture. What stops us is fear: that
                if we follow what&apos;s authentic to us, we&apos;ll fail.
              </p>
              <p>
                The meditation and manifestation apps I tried were too general.
                They calmed me down for a while, but never touched my actual
                goals or mindset.
              </p>
              <p>
                Consciously is built around you: your ideal self, your goals and
                your blocks, with meditations made for your exact situation.
              </p>
            </div>
          </div>

          {/* Mobile: compact byline, heading and the opening paragraph. */}
          <div className="ns-founder-small ns-sm-only">
            <div className="ns-founder-small-id">
              <Image
                src="/newhome/founder.jpg"
                alt={FOUNDER_ALT}
                width={64}
                height={64}
                sizes="64px"
              />
              <span>
                <span className="ns-kicker">Why it exists</span>
                <span className="ns-founder-name">Alex, founder</span>
                <span className="ns-founder-role">Engineer and musician</span>
              </span>
            </div>
            <h2 className="ns-display">
              I built Consciously to reconnect people with their divine nature.
            </h2>
            <p>
              We all deserve the life we picture. What stops us is fear: that if
              we follow what’s authentic to us, we’ll fail.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Same Start free behaviour as the homepage's closing band. */
export function StoryFinalCta() {
  const waitlist = useWaitlist();
  return (
    <section className="ns-cta" aria-labelledby="ns-cta-title">
      <div className="ns-wrap ns-cta-inner">
        <h2 id="ns-cta-title" className="ns-display">
          Who are you becoming?
        </h2>
        {waitlist ? (
          <button
            type="button"
            className="new-home-mist"
            onClick={() => waitlist.open({ source: "close" })}
          >
            Start free
          </button>
        ) : (
          <a className="new-home-mist" href={HOME_V2_START_FREE_HREF}>
            Start free
          </a>
        )}
      </div>
    </section>
  );
}

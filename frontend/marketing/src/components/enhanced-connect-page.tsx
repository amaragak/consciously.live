"use client";

import { useEffect, useState } from "react";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { HomeV2TopChrome } from "@/components/home-v2/home-v2-top-chrome";

function hasAppSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

/**
 * Connect at `/connect` — marketing landing for everyone for now.
 * Forum scaffold (`ConnectForum`) stays in the repo until Connect ships.
 */
export function EnhancedConnectPage() {
  const [signedIn, setSignedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => setSignedIn(hasAppSession());
    sync();
    setReady(true);
    window.addEventListener("medimade-session-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("medimade-session-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!ready) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6" aria-busy>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return <ConnectMarketingLanding signedIn={signedIn} />;
}

function ConnectMarketingLanding({ signedIn }: { signedIn: boolean }) {
  const signInHref = "/connect?signin=1&next=%2Fconnect";

  return (
    <div className="w-full">
      <section className="home-v2-hero flex w-full flex-col px-5 pb-16 text-[var(--hv2-hero-fg)] md:px-6 md:pb-20">
        <HomeV2TopChrome />
        <div className="relative z-[1] mx-auto flex w-full max-w-[1200px] flex-col items-center px-0 pb-4 pt-10 text-center md:pt-14">
          <h1 className="home-v2-display m-0 max-w-3xl text-[34px] font-[350] leading-tight tracking-[-0.8px] text-[var(--hv2-hero-fg)] sm:text-[44px] md:text-[clamp(44px,5vw,56px)] md:tracking-[-1.2px]">
            A place to talk about what life is asking of you.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--hv2-hero-muted)] sm:text-lg">
            A forum for philosophy, personal journeys, and the questions that
            don&apos;t fit in a feed — shared with care.
          </p>
          <div className="mt-8">
            {signedIn ? (
              <p className="home-v2-display text-lg italic tracking-wide text-[var(--hv2-gold)] sm:text-xl">
                Coming soon
              </p>
            ) : (
              <a
                href={signInHref}
                className="accent-fill-gradient inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              >
                Sign in to join
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="home-v2-band home-v2-band--a w-full px-5 py-16 md:px-6 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="home-v2-display m-0 text-3xl font-medium tracking-tight text-[var(--hv2-ink)] sm:text-4xl">
            What we&apos;ll talk about
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[var(--hv2-muted)] sm:text-lg">
            Threads for meaning, practice, and the long arc of becoming — not
            hot takes. Philosophy that meets daily life. Journeys told honestly.
            Questions held without rushing to answers.
          </p>
          <ul className="mx-auto mt-10 max-w-lg space-y-4 text-left text-base leading-relaxed text-[var(--hv2-body)]">
            <li>
              <span className="home-v2-display text-lg font-medium text-[var(--hv2-ink)]">
                Philosophy
              </span>
              <span className="mt-1 block text-[var(--hv2-muted)]">
                Ideas that change how you live — ethics, meaning, attention,
                freedom.
              </span>
            </li>
            <li>
              <span className="home-v2-display text-lg font-medium text-[var(--hv2-ink)]">
                Personal journeys
              </span>
              <span className="mt-1 block text-[var(--hv2-muted)]">
                Turning points, practices that stuck, and seasons of uncertainty.
              </span>
            </li>
            <li>
              <span className="home-v2-display text-lg font-medium text-[var(--hv2-ink)]">
                Shared inquiry
              </span>
              <span className="mt-1 block text-[var(--hv2-muted)]">
                Open questions and thoughtful replies — a slower kind of
                conversation.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="flex w-full flex-col items-center bg-[var(--hv2-navy)] px-5 py-20 text-[var(--hv2-ivory)] md:px-6 md:py-24">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
          <h2 className="home-v2-display m-0 text-3xl font-medium tracking-tight text-[var(--hv2-ivory)] sm:text-4xl">
            Join the conversation
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-[rgba(246,241,231,0.7)]">
            {signedIn
              ? "Connect is on the way. Until then, this page is the preview of what's coming."
              : "Sign in to read and start threads. The forum lives here on Consciously — no separate community site."}
          </p>
          <div className="mt-8">
            {signedIn ? (
              <p className="home-v2-display text-lg italic tracking-wide text-[var(--hv2-gold)] sm:text-xl">
                Coming soon
              </p>
            ) : (
              <a
                href={signInHref}
                className="accent-fill-gradient inline-flex items-center justify-center rounded-full px-7 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
              >
                Sign in to join
              </a>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { ConnectForum } from "@/components/connect-forum";

function hasAppSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

/**
 * Connect at `/connect` — marketing landing when signed out;
 * forum scaffold (still on Next) when signed in.
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

  if (signedIn) {
    return <ConnectForum />;
  }

  return <ConnectMarketingLanding />;
}

function ConnectMarketingLanding() {
  const signInHref = "/connect?signin=1&next=%2Fconnect";

  return (
    <div className="w-full">
      <section className="home-hero home-hero--product w-full px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-16">
        <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
          <p className="font-display text-2xl font-medium tracking-tight text-marketing-ink sm:text-3xl">
            Connect
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-3xl font-medium leading-tight tracking-tight text-marketing-ink sm:text-4xl md:text-[2.75rem]">
            A place to talk about what life is asking of you.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-marketing-body sm:text-lg">
            A forum for philosophy, personal journeys, and the questions that
            don&apos;t fit in a feed — shared with care.
          </p>
          <div className="mt-8">
            <a
              href={signInHref}
              className="inline-flex items-center justify-center rounded-full accent-fill-gradient px-7 py-3 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              Sign in to join
            </a>
          </div>
        </div>
      </section>

      <section className="w-full bg-marketing-band-a px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink sm:text-4xl">
            What we&apos;ll talk about
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-marketing-muted sm:text-lg">
            Threads for meaning, practice, and the long arc of becoming — not
            hot takes. Philosophy that meets daily life. Journeys told honestly.
            Questions held without rushing to answers.
          </p>
          <ul className="mx-auto mt-10 max-w-lg space-y-4 text-left text-base leading-relaxed text-marketing-body">
            <li>
              <span className="font-display text-lg font-medium text-marketing-ink">
                Philosophy
              </span>
              <span className="mt-1 block text-marketing-muted">
                Ideas that change how you live — ethics, meaning, attention,
                freedom.
              </span>
            </li>
            <li>
              <span className="font-display text-lg font-medium text-marketing-ink">
                Personal journeys
              </span>
              <span className="mt-1 block text-marketing-muted">
                Turning points, practices that stuck, and seasons of uncertainty.
              </span>
            </li>
            <li>
              <span className="font-display text-lg font-medium text-marketing-ink">
                Shared inquiry
              </span>
              <span className="mt-1 block text-marketing-muted">
                Open questions and thoughtful replies — a slower kind of
                conversation.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="w-full bg-marketing-band-b px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h2 className="font-display text-3xl font-medium tracking-tight text-marketing-ink sm:text-4xl">
            Join the conversation
          </h2>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-marketing-muted">
            Sign in to read and start threads. The forum lives here on
            Consciously — no separate community site.
          </p>
          <div className="mt-8">
            <a
              href={signInHref}
              className="inline-flex items-center justify-center rounded-full accent-fill-gradient px-7 py-3 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90"
            >
              Sign in to join
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

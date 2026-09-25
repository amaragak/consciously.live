"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/medimade-api";
import { marketingSignInUrl } from "@/lib/app-routes";
import { createMeditationHref } from "@/lib/create-meditation-path";
import { startHomepageOneShotGeneration } from "@/lib/homepage-one-shot-handoff";
import { stashHomeV2OneShotPrompt } from "@/lib/home-v2-oneshot-prompt";
import { PreviousVersionsMenu } from "@/components/previous-versions-menu";
import {
  ColorSchemePicker,
  COLOR_SCHEME_OPTIONS_HOME_V2,
} from "@consciously/common";

function hasSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

export function HeroPrompt() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);

    const createHref = createMeditationHref({ path: "oneShot" });

    if (!hasSession()) {
      stashHomeV2OneShotPrompt(trimmed);
      router.push(marketingSignInUrl(createHref));
      return;
    }

    try {
      const { libraryHref } = await startHomepageOneShotGeneration({
        prompt: trimmed,
      });
      router.push(libraryHref);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error ? err.message : "Could not create your meditation.",
      );
    }
  }

  return (
    <div className="flex w-full flex-col gap-3.5 pt-2">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="home-v2-prompt-shell home-v2-hero-glass flex w-full flex-col gap-2.5 md:flex-row md:items-center md:gap-2 md:rounded-full md:border md:border-[rgb(var(--hv2-gold-rgb)/0.5)] md:bg-[var(--hv2-hero-input-bg)] md:py-1.5 md:pl-[28px] md:pr-1.5 md:shadow-[var(--hv2-hero-elev)]"
      >
        <label htmlFor="home-v2-hero-prompt" className="sr-only">
          What would you like a meditation for?
        </label>
        <input
          id="home-v2-hero-prompt"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          placeholder="Calm before my big pitch, confidence for launch day, deeper sleep…"
          className="home-v2-prompt-input h-12 min-w-0 flex-1 rounded-2xl border border-[rgb(var(--hv2-gold-rgb)/0.5)] bg-[var(--hv2-hero-input-bg)] px-5 text-base text-[var(--hv2-hero-input-fg)] shadow-[var(--hv2-hero-elev)] placeholder:text-[var(--hv2-hero-placeholder)] outline-none md:h-11 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:text-[19px] md:shadow-none"
        />
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className="h-12 shrink-0 rounded-full bg-[var(--hv2-gold)] px-7 text-base font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 disabled:opacity-50 md:h-12 md:px-7 md:text-[17px]"
        >
          {busy ? "Creating…" : "Create my meditation"}
        </button>
      </form>
      <p className="px-0 text-center text-[13px] text-[var(--hv2-hero-nav-muted)] md:px-[30px] md:text-left md:text-[15px]">
        Any intention, any moment: a guided meditation written and voiced just for
        you.
      </p>
      {error ? (
        <p className="px-[30px] text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Nav auth cluster shared by hero + sticky header. */
export function HomeV2AuthActions({
  compact,
  ctaHref,
  ctaLabel,
}: {
  compact?: boolean;
  ctaHref: string;
  ctaLabel: string;
}) {
  const [signedIn, setSignedIn] = useState(false);
  const [dashboardBusy, setDashboardBusy] = useState(false);
  const loginHref = "/login";

  useEffect(() => {
    const sync = () => setSignedIn(hasSession());
    sync();
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);

  if (signedIn) {
    return (
      <div className="flex items-center gap-3">
        <ColorSchemePicker
          variant="home-v2"
          options={COLOR_SCHEME_OPTIONS_HOME_V2}
        />
        <button
          type="button"
          disabled={dashboardBusy}
          onClick={() => {
            setDashboardBusy(true);
            void import("@/lib/spa-handoff").then(({ navigateToSpa }) =>
              navigateToSpa("/").finally(() => setDashboardBusy(false)),
            );
          }}
          className={`rounded-full bg-[var(--hv2-gold)] font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 disabled:opacity-50 ${
            compact ? "px-5 py-2.5 text-[15px]" : "px-[22px] py-3 text-[15px]"
          }`}
        >
          {dashboardBusy ? "Opening…" : "Dashboard"}
        </button>
        <HomeV2AccountMenu />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <ColorSchemePicker
        variant="home-v2"
        options={COLOR_SCHEME_OPTIONS_HOME_V2}
      />
      <Link
        href={loginHref}
        className="whitespace-nowrap text-[15px] text-[var(--hv2-hero-nav)] hover:text-[var(--hv2-gold)]"
      >
        Sign in
      </Link>
      <Link
        href={ctaHref}
        className={`whitespace-nowrap rounded-full bg-[var(--hv2-gold)] text-center font-semibold text-[var(--hv2-on-gold)] transition-opacity hover:opacity-90 ${
          compact
            ? "min-w-[180px] px-5 py-2.5 text-[15px]"
            : "px-[22px] py-3 text-[15px]"
        }`}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function HomeV2AccountMenu() {
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [greeting, setGreeting] = useState("Signed in");

  useEffect(() => {
    void import("@/lib/medimade-api").then((m) => {
      setGreeting(
        m.getMedimadeSessionDisplayName() ||
          m.getMedimadeSessionEmail() ||
          "Signed in",
      );
    });
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const el = detailsRef.current;
      if (!el?.open) return;
      if (e.target instanceof Node && !el.contains(e.target)) el.open = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return (
    <details ref={detailsRef} className="relative">
      <summary
        aria-label="Account menu"
        className="inline-flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full border border-[var(--hv2-hero-divider)] text-[var(--hv2-hero-fg)] [&::-webkit-details-marker]:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-[var(--hv2-line)] bg-[var(--hv2-ivory)] py-1.5 text-[var(--hv2-ink)] shadow-lg">
        <p className="truncate px-4 py-2.5 text-sm text-[var(--hv2-muted)]">
          Hi, <span className="font-medium text-[var(--hv2-ink)]">{greeting}</span>
        </p>
        <div className="my-1 border-t border-[var(--hv2-line)]" role="separator" />
        <Link
          href="/profile"
          onClick={close}
          className="block w-full px-4 py-2 text-left text-sm font-medium hover:bg-[var(--hv2-sand)]"
        >
          Profile
        </Link>
        <button
          type="button"
          onClick={() => {
            close();
            void import("@/lib/medimade-api").then((m) => m.clearMedimadeSession());
          }}
          className="block w-full px-4 py-2 text-left text-sm text-[var(--hv2-muted)] hover:bg-[var(--hv2-sand)]"
        >
          Sign out
        </button>
        <PreviousVersionsMenu onNavigate={close} />
      </div>
    </details>
  );
}

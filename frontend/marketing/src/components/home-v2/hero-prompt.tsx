"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { HomeV2ToolIcon } from "@/components/home-v2/home-v2-tool-icon";

function hasSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

export function HeroPrompt() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeholder, setPlaceholder] = useState("e.g. calm before a pitch");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      setPlaceholder(
        mq.matches
          ? "Calm before my big pitch, confidence for launch day, deeper sleep…"
          : "e.g. calm before a pitch",
      );
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

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
    <div className="flex w-full flex-col gap-3.5">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="home-v2-prompt-shell home-v2-hero-glass flex w-full flex-col gap-2.5 md:flex-row md:items-center md:gap-2 md:rounded-full md:border md:border-[#c3d2e8]/45 md:bg-[var(--hv2-hero-input-bg)] md:py-1.5 md:pl-[28px] md:pr-1.5 md:shadow-[var(--hv2-hero-elev)] md:transition-[border-color,box-shadow] md:duration-200 md:ease-out md:hover:border-[#c3d2e8]"
      >
        <label
          htmlFor="home-v2-hero-prompt"
          className="text-[13px] text-[var(--hv2-hero-muted)] md:sr-only"
        >
          What would you like a meditation for?
        </label>
        <input
          id="home-v2-hero-prompt"
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          placeholder={placeholder}
          className="home-v2-prompt-input box-border h-[50px] w-full min-w-0 rounded-full border border-[#c3d2e8]/45 bg-[var(--hv2-hero-input-bg)] px-4 text-[16px] text-[var(--hv2-hero-input-fg)] shadow-[var(--hv2-hero-elev)] outline-none transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-[var(--hv2-hero-placeholder)] hover:border-[#c3d2e8] md:h-11 md:flex-1 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:text-[19px] md:shadow-none md:hover:border-0"
        />
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className={`accent-fill-gradient relative isolate inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full px-7 text-[16px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 md:h-12 md:w-auto md:px-7 md:text-[17px] ${
            prompt.trim() && !busy ? "home-v2-create-meditate-pulse" : ""
          }`}
        >
          {busy ? (
            "Creating…"
          ) : (
            <>
              <HomeV2ToolIcon tool="meditate" />
              Create my meditation
            </>
          )}
        </button>
      </form>
      {error ? (
        <p className="px-1 text-sm text-red-300 md:px-[30px]" role="alert">
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
  ctaIcon,
}: {
  compact?: boolean;
  ctaHref: string;
  ctaLabel: string;
  /** Sidebar-matching glyph for tool CTAs (not Start free / Dashboard). */
  ctaIcon?: ReactNode;
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
        <button
          type="button"
          disabled={dashboardBusy}
          onClick={() => {
            setDashboardBusy(true);
            void import("@/lib/spa-handoff").then(({ navigateToSpa }) =>
              navigateToSpa("/").finally(() => setDashboardBusy(false)),
            );
          }}
          className={`home-v2-header-cta accent-fill-gradient rounded-full font-semibold transition-opacity hover:opacity-90 disabled:opacity-50${
            compact ? " is-compact" : ""
          }`}
        >
          {dashboardBusy ? "Opening…" : "Dashboard →"}
        </button>
        <HomeV2AccountMenu />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href={loginHref}
        className="whitespace-nowrap text-[15px] text-[var(--hv2-hero-nav)] hover:text-[var(--hv2-gold)]"
      >
        Sign in
      </Link>
      <Link
        href={ctaHref}
        className={`home-v2-header-cta accent-fill-gradient inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-center font-semibold transition-opacity hover:opacity-90${
          compact ? " is-compact" : ""
        }`}
      >
        {ctaIcon}
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
        <div className="px-3 py-2">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--hv2-muted)]">
            Appearance
          </p>
          <ColorSchemePicker
            className="w-full [&_button]:w-full [&_button]:justify-between"
            options={COLOR_SCHEME_OPTIONS_HOME_V2}
          />
        </div>
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

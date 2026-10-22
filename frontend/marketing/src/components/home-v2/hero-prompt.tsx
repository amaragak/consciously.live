"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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

export function HeroPrompt({
  tone = "default",
}: { tone?: "default" | "light" | "card" | "line" } = {}) {
  const router = useRouter();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState(
    tone === "line" ? "Calm and certain before my pitch on Friday." : "",
  );
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

  const light = tone === "light";

  if (tone === "line") {
    const pulsing = Boolean(prompt.trim()) && !busy;
    return (
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="new-home-line"
      >
        <div className="new-home-line-row new-home-prompt-card">
          <div className="new-home-line-field">
            <label className="new-home-line-label" htmlFor="new-home-manifest-prompt">
              What do you want to manifest?
            </label>
            <input
              id="new-home-manifest-prompt"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
              placeholder="Calm and certain before my pitch on Friday."
            />
          </div>
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className={`new-home-mist${pulsing ? " home-v2-create-meditate-pulse" : ""}`}
          >
            <span>{busy ? "Starting…" : "Create meditation"}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        {error ? (
          <p className="m-0 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  if (tone === "card") {
    function resizeField(el: HTMLTextAreaElement) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }

    function onCardKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      if (!prompt.trim() || busy) return;
      e.currentTarget.form?.requestSubmit();
    }

    return (
      <div className="flex w-full flex-col gap-2">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="new-home-prompt-card flex w-full flex-col gap-2.5 rounded-[20px] border border-white/80 bg-[rgba(255,255,255,.94)] px-4 pb-3.5 pt-4 shadow-[0_18px_44px_rgba(62,52,66,.18)] md:gap-3 md:px-[22px] md:pb-[18px] md:pt-5"
        >
          <label
            htmlFor="home-v2-hero-prompt"
            className="text-[14px] font-semibold text-[#3E3442] md:text-[15px]"
          >
            What would you like a meditation for?
          </label>
          <textarea
            ref={fieldRef}
            id="home-v2-hero-prompt"
            rows={2}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              resizeField(e.target);
            }}
            onKeyDown={onCardKeyDown}
            disabled={busy}
            placeholder="Calm before my big pitch, confidence for launch day, deeper sleep…"
            className="box-border min-h-12 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[1.5] text-[#3E3442] outline-none placeholder:text-[#857C70] md:min-h-[52px] md:text-[16.5px]"
          />
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            className={`relative isolate inline-flex h-[50px] w-full shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-full border border-[#AFC2DC] bg-[#C9D7EA] px-[22px] text-[15px] font-semibold text-[#14203A] hover:bg-[#BDCDE4] disabled:opacity-50 md:ml-auto md:h-[46px] md:w-auto${
              prompt.trim() && !busy ? " home-v2-create-meditate-pulse" : ""
            }`}
          >
            {busy ? "Creating…" : "Create my meditation"}
          </button>
        </form>
        {error ? (
          <p className="px-1 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3.5">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className={
          light
            ? "flex w-full flex-col gap-2.5 md:flex-row md:items-center md:gap-2 md:rounded-full md:border md:border-[rgba(62,52,66,.12)] md:bg-[rgba(255,255,255,.88)] md:py-1.5 md:pl-[26px] md:pr-1.5 md:shadow-[0_10px_30px_rgba(27,34,56,.08)]"
            : "home-v2-prompt-shell home-v2-hero-glass flex w-full flex-col gap-2.5 md:flex-row md:items-center md:gap-2 md:rounded-full md:border md:border-[#c3d2e8]/45 md:bg-[var(--hv2-hero-input-bg)] md:py-1.5 md:pl-[28px] md:pr-1.5 md:shadow-[var(--hv2-hero-elev)] md:transition-[border-color,box-shadow] md:duration-200 md:ease-out md:hover:border-[#c3d2e8]"
        }
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
          className={
            light
              ? "box-border h-[52px] w-full min-w-0 rounded-full border border-[rgba(62,52,66,.14)] bg-[rgba(255,255,255,.92)] px-5 text-[15px] text-[#3E3442] shadow-[0_6px_18px_rgba(27,34,56,.06)] outline-none placeholder:text-[#7D7568] md:h-14 md:flex-1 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:text-[18px] md:shadow-none"
              : "home-v2-prompt-input box-border h-[50px] w-full min-w-0 rounded-full border border-[#c3d2e8]/45 bg-[var(--hv2-hero-input-bg)] px-4 text-[16px] text-[var(--hv2-hero-input-fg)] shadow-[var(--hv2-hero-elev)] outline-none transition-[border-color,box-shadow] duration-200 ease-out placeholder:text-[var(--hv2-hero-placeholder)] hover:border-[#c3d2e8] md:h-11 md:flex-1 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:text-[19px] md:shadow-none md:hover:border-0"
          }
        />
        <button
          type="submit"
          disabled={busy || !prompt.trim()}
          className={
            light
              ? "inline-flex h-[52px] w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-[#AFC2DC] bg-[#C9D7EA] px-7 text-[16px] font-semibold text-[#14203A] hover:bg-[#BDCDE4] disabled:opacity-50 md:h-14 md:w-auto md:text-[17px]"
              : `accent-fill-gradient relative isolate inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full px-7 text-[16px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 md:h-12 md:w-auto md:px-7 md:text-[17px] ${
                  prompt.trim() && !busy ? "home-v2-create-meditate-pulse" : ""
                }`
          }
        >
          {busy ? (
            "Creating…"
          ) : light ? (
            "Create my meditation"
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
  tone = "default",
}: {
  compact?: boolean;
  ctaHref: string;
  ctaLabel: string;
  /** Sidebar-matching glyph for tool CTAs (not Start free / Dashboard). */
  ctaIcon?: ReactNode;
  tone?: "default" | "mist";
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

  const mist = tone === "mist";
  const ctaClass = mist
    ? `inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full border border-[#AFC2DC] bg-[#C9D7EA] px-[22px] text-[15px] font-semibold text-[#14203A] hover:bg-[#BDCDE4]${
        compact ? " h-9 px-4 text-[14px]" : ""
      }`
    : `home-v2-header-cta accent-fill-gradient inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-center font-semibold transition-opacity hover:opacity-90${
        compact ? " is-compact" : ""
      }`;

  if (signedIn) {
    return (
      <div className="relative z-10 flex items-center gap-3">
        <button
          type="button"
          disabled={dashboardBusy}
          onClick={() => {
            setDashboardBusy(true);
            void import("@/lib/spa-handoff")
              .then(({ navigateToSpaOrThrow }) => navigateToSpaOrThrow("/"))
              .catch(() => setDashboardBusy(false));
          }}
          className={`${ctaClass} cursor-pointer disabled:opacity-50`}
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
        className={
          mist
            ? "hidden whitespace-nowrap text-[15px] text-[#4A4652] hover:text-[#3E3442] md:inline"
            : "whitespace-nowrap text-[15px] text-[var(--hv2-hero-nav)] hover:text-[var(--hv2-gold)]"
        }
      >
        Sign in
      </Link>
      <Link
        href={ctaHref}
        className={ctaClass}
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
    <details ref={detailsRef} className="relative z-50">
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

"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/medimade-api";
import { marketingSignInUrl } from "@/lib/app-routes";
import { createMeditationHref } from "@/lib/create-meditation-path";
import { startHomepageOneShotGeneration } from "@/lib/homepage-one-shot-handoff";
import { stashHomeV2OneShotPrompt } from "@/lib/home-v2-oneshot-prompt";

function hasSession(): boolean {
  return isMedimadeSessionActive() && Boolean(getMedimadeSessionJwt());
}

export function ListenBriefBand({
  headline,
  body,
}: {
  headline: string;
  body: string;
}) {
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
    <section className="bg-[var(--hv2-sticky-bg)] px-5 py-16 text-[var(--hv2-ivory)] md:px-6 md:py-20">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col items-center gap-4 text-center">
        <h2 className="home-v2-display m-0 text-[2rem] font-normal leading-[1.1] tracking-[-0.5px] md:text-[3rem]">
          {headline}
        </h2>
        <p className="m-0 max-w-[620px] text-[16px] leading-[1.5] text-[var(--hv2-on-navy)] md:text-[18px]">
          {body}
        </p>
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-2 flex w-full max-w-[640px] items-center gap-2.5 rounded-full border border-[rgba(255,255,255,.12)] bg-[var(--hv2-ivory)] py-1.5 pl-[22px] pr-1.5 text-left shadow-[0_16px_40px_rgba(8,12,24,.25)]"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
            placeholder="What do you need right now?"
            className="min-w-0 flex-1 border-0 bg-transparent text-[16.5px] text-[var(--hv2-ink)] outline-none placeholder:text-[var(--hv2-muted)]"
          />
          <button
            type="submit"
            disabled={busy || !prompt.trim()}
            aria-label="Create meditation"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[#AFC2DC] bg-[#C3D2E8] text-[#14203A] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        {error ? (
          <p className="m-0 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        <p className="m-0 text-[14px] text-[var(--hv2-on-navy-muted)]">
          Already have an account?{" "}
          <a
            href="/login"
            className="text-[var(--hv2-gold)] hover:underline"
          >
            Sign in
          </a>
        </p>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { SiteFooterV2 } from "@/components/home-v2/site-footer-v2";
import { ListenBriefBand } from "@/components/listen/listen-brief-band";
import { ListenCoverArt } from "@/components/listen/listen-cover";
import {
  formatListenClock,
  formatListenDuration,
  listenItemHref,
  type ListenPublicItem,
} from "@/lib/public-listen";

export function ListenShareClient({
  item,
  more,
}: {
  item: ListenPublicItem;
  more: ListenPublicItem[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const total = item.durationSec ?? 0;
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;
  const dur = formatListenDuration(item.durationSec);
  const eyebrow =
    item.kind === "story"
      ? `STORY${dur ? ` · ${dur.toUpperCase()}` : ""}`
      : `MEDITATION${item.style ? ` · ${item.style.toUpperCase()}` : ""}${
          dur ? ` · ${dur.toUpperCase()}` : ""
        }`;

  function toggle() {
    const audio = audioRef.current;
    if (!audio || !item.audioUrl) return;
    if (audio.paused) {
      void audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  async function copyLink() {
    const url =
      typeof window !== "undefined"
        ? window.location.href
        : `https://consciously.live${listenItemHref(item)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  const madeBy = item.isExample
    ? "Made by Consciously"
    : item.shownAs
      ? `Made by ${item.shownAs} with Consciously`
      : "Made with Consciously";

  const bandBody = item.isExample
    ? "Write yours, and Consciously writes and narrates a meditation for it. Your first one is free."
    : item.shownAs
      ? `${item.shownAs} wrote one line and got this. Write yours, and Consciously writes and narrates a meditation for it. Your first one is free.`
      : "Write yours, and Consciously writes and narrates a meditation for it. Your first one is free.";

  return (
    <div className="home-v2 min-h-full bg-[var(--hv2-page)] text-[var(--hv2-ink)]">
      <audio
        ref={audioRef}
        src={item.audioUrl ?? undefined}
        preload="metadata"
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />

      <section className="px-5 py-10 md:px-6 md:py-14">
        <div className="mx-auto w-full max-w-[1100px]">
          <article className="flex flex-col gap-6 overflow-hidden rounded-[24px] border border-[rgba(62,52,66,.12)] bg-[#FFFBF3] p-3 md:flex-row md:gap-8 md:p-4">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[18px] md:aspect-auto md:min-h-[420px] md:w-[44%] md:shrink-0">
              <ListenCoverArt
                title={item.title}
                coverImageUrl={item.coverImageUrl}
              />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-4 px-2 pb-4 pt-2 md:pr-4 md:pt-6">
              <p className="m-0 text-[12px] font-semibold uppercase tracking-[1.4px] text-[var(--hv2-tan-text)]">
                {eyebrow}
              </p>
              <h1 className="home-v2-display m-0 text-[2rem] font-normal leading-[1.1] tracking-[-0.5px] md:text-[2.75rem]">
                {item.title}
              </h1>
              <div className="flex items-center gap-2.5">
                <span
                  className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--hv2-sticky-bg)] text-[13px] font-semibold text-[var(--hv2-ivory)]"
                  aria-hidden
                >
                  {(item.shownAs || "C").slice(0, 1).toUpperCase()}
                </span>
                <p className="m-0 text-[15px] text-[var(--hv2-body)]">{madeBy}</p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={toggle}
                  disabled={!item.audioUrl}
                  aria-label={playing ? "Pause" : "Play"}
                  className="inline-flex size-14 items-center justify-center rounded-full border border-[#AFC2DC] bg-[#C3D2E8] text-[#14203A] disabled:opacity-40"
                >
                  {playing ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                      <path d="M8 5v14M16 5v14" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="relative h-8 min-w-0 flex-1 touch-none"
                  aria-label="Seek"
                  onClick={(e) => {
                    const audio = audioRef.current;
                    if (!audio || !total) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const t = (e.clientX - rect.left) / rect.width;
                    audio.currentTime = Math.max(0, Math.min(1, t)) * total;
                  }}
                >
                  <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[rgba(62,52,66,.18)]" />
                  <span
                    className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--hv2-tan-text)]"
                    style={{ width: `${progress * 100}%` }}
                  />
                </button>
                <span className="shrink-0 text-[13px] tabular-nums text-[var(--hv2-muted)]">
                  {formatListenClock(elapsed)}
                  {total ? ` / ${formatListenClock(total)}` : ""}
                </span>
              </div>

              {item.description ? (
                <p className="m-0 text-[15.5px] leading-[1.55] text-[var(--hv2-body)]">
                  {item.description}
                </p>
              ) : null}

              {item.showBrief && item.brief ? (
                <div className="rounded-xl bg-[#F4ECDD] px-4 py-3.5">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--hv2-tan-text)]">
                    Made from one line
                  </p>
                  <p className="m-0 mt-1 text-[15px] leading-[1.45] text-[var(--hv2-body)]">
                    “{item.brief}”
                  </p>
                </div>
              ) : null}

              {item.kind === "story" && item.storyText ? (
                <div className="max-h-[280px] overflow-y-auto rounded-xl border border-[rgba(62,52,66,.1)] bg-white/60 px-4 py-3 text-[15px] leading-[1.6] text-[var(--hv2-body)] whitespace-pre-wrap">
                  {item.storyText}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void copyLink()}
                className="mt-1 inline-flex w-fit items-center gap-2 text-[15px] font-medium text-[var(--hv2-ink)] hover:text-[var(--hv2-tan-text)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </article>
        </div>
      </section>

      <ListenBriefBand headline="Make one for yourself." body={bandBody} />

      {more.length > 0 ? (
        <section className="px-5 py-12 md:px-6 md:py-16">
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="home-v2-display m-0 text-[1.75rem] font-normal">
                More to listen to
              </h2>
              <Link
                href="/listen"
                className="text-[15px] font-medium text-[var(--hv2-tan-text)]"
              >
                All of Listen ›
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {more.map((m) => (
                <Link
                  key={m.slug}
                  href={listenItemHref(m)}
                  className="overflow-hidden rounded-[18px] border border-[rgba(62,52,66,.12)] bg-[#FFFBF3]"
                >
                  <div className="relative h-36 w-full">
                    <ListenCoverArt
                      title={m.title}
                      coverImageUrl={m.coverImageUrl}
                    />
                  </div>
                  <div className="px-3.5 py-3">
                    <p className="m-0 text-[15px] font-semibold text-[var(--hv2-ink)]">
                      {m.title}
                    </p>
                    <p className="m-0 mt-0.5 text-[13px] text-[var(--hv2-muted)]">
                      {[m.style, formatListenDuration(m.durationSec)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <SiteFooterV2 />
    </div>
  );
}

export function ListenLinkOff() {
  return (
    <div className="home-v2 flex min-h-[70vh] flex-col items-center justify-center bg-[var(--hv2-page)] px-5 py-16 text-center">
      <div className="w-full max-w-md rounded-[20px] border border-[rgba(62,52,66,.12)] bg-[#FFFBF3] px-6 py-10">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-[#F4ECDD] text-[var(--hv2-tan-text)]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </div>
        <h1 className="home-v2-display m-0 text-[1.75rem] font-normal text-[var(--hv2-ink)]">
          This link isn’t shared any more
        </h1>
        <p className="m-0 mt-2 text-[15px] leading-[1.5] text-[var(--hv2-body)]">
          Whoever made it has turned sharing off. You can still listen to the
          meditations and Stories in Listen.
        </p>
        <Link
          href="/listen"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-[#AFC2DC] bg-[#C3D2E8] px-6 text-[15px] font-semibold text-[#14203A]"
        >
          Go to Listen
        </Link>
      </div>
    </div>
  );
}

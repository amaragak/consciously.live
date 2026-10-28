"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ListenCoverArt } from "@/components/listen/listen-cover";
import {
  formatListenClock,
  type ListenPublicItem,
} from "@/lib/public-listen";

export function ReadListenEmbed({
  item,
  cardLabel,
}: {
  item: ListenPublicItem;
  cardLabel: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const totalSec = item.durationSec ?? 0;
  const progress = useMemo(() => {
    if (!totalSec || totalSec <= 0) return 0;
    return Math.min(1, Math.max(0, elapsed / totalSec));
  }, [elapsed, totalSec]);

  function toggle() {
    if (!item.audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (!playing) {
      audio.src = item.audioUrl;
      void audio.play();
      setPlaying(true);
      setPaused(false);
      return;
    }
    if (audio.paused) {
      void audio.play();
      setPaused(false);
    } else {
      audio.pause();
      setPaused(true);
    }
  }

  const kindLabel = item.kind === "story" ? "Story" : "Meditation";
  const durationLabel =
    totalSec > 0 ? formatListenClock(totalSec) : "";

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgba(62,52,66,.1)] bg-[#FFFBF3]">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onEnded={() => {
          setPaused(true);
          setPlaying(false);
        }}
        onPause={() => setPaused(true)}
        onPlay={() => setPaused(false)}
      />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:gap-5 sm:p-5">
        <div className="w-full shrink-0 overflow-hidden rounded-xl sm:w-[140px]">
          <ListenCoverArt
            coverImageUrl={item.coverImageUrl}
            title={item.title}
            className="aspect-square w-full"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--hv2-tan-text)]">
            {cardLabel || "From Listen"}
          </p>
          <h3 className="home-v2-display m-0 mt-1 text-[1.25rem] font-normal leading-snug tracking-[-0.2px] text-[var(--hv2-ink)]">
            {item.title}
          </h3>
          {item.description ? (
            <p className="m-0 mt-1 line-clamp-2 text-[14.5px] leading-snug text-[var(--hv2-body)]">
              {item.description}
            </p>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
            {item.audioUrl ? (
              <button
                type="button"
                onClick={toggle}
                className="inline-flex size-11 items-center justify-center rounded-full bg-[var(--hv2-sticky-bg)] text-[var(--hv2-ivory)] transition-opacity hover:opacity-90"
                aria-label={playing && !paused ? "Pause" : "Play"}
              >
                {playing && !paused ? (
                  <span className="flex gap-1" aria-hidden>
                    <span className="h-3.5 w-[3px] rounded-sm bg-current" />
                    <span className="h-3.5 w-[3px] rounded-sm bg-current" />
                  </span>
                ) : (
                  <span
                    className="ml-0.5 inline-block border-y-[7px] border-l-[12px] border-y-transparent border-l-current"
                    aria-hidden
                  />
                )}
              </button>
            ) : null}
            <span className="text-[13.5px] text-[var(--hv2-body)]">
              {kindLabel}
              {durationLabel ? ` · ${durationLabel}` : ""}
            </span>
            <Link
              href={`/listen/${encodeURIComponent(item.slug)}`}
              className="ml-auto text-[13.5px] font-medium text-[var(--hv2-tan-text)] transition-colors hover:text-[var(--hv2-ink)]"
            >
              Open in Listen ›
            </Link>
          </div>
          {playing ? (
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-[rgba(62,52,66,.1)]">
              <div
                className="h-full rounded-full bg-[var(--hv2-sticky-bg)] transition-[width] duration-150"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

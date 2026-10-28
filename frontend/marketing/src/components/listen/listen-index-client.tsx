"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SiteFooterV2 } from "@/components/home-v2/site-footer-v2";
import { ListenBriefBand } from "@/components/listen/listen-brief-band";
import { ListenCoverArt } from "@/components/listen/listen-cover";
import {
  formatListenClock,
  formatListenDuration,
  type ListenPublicItem,
} from "@/lib/public-listen";

type Filter = "all" | "meditations" | "stories";

function parseFilter(raw: string | null): Filter {
  if (raw === "meditations" || raw === "stories") return raw;
  return "all";
}

export function ListenIndexClient({
  meditations,
  stories,
}: {
  meditations: ListenPublicItem[];
  stories: ListenPublicItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filter = parseFilter(searchParams.get("type"));

  const [playing, setPlaying] = useState<ListenPublicItem | null>(null);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const showMeditations = filter !== "stories";
  const showStories = filter !== "meditations";

  const mobileMeditationCap = filter === "all" ? 3 : meditations.length;
  const mobileStoryCap = filter === "all" ? 1 : stories.length;

  const visibleMeditations = meditations;
  const visibleStories = stories;

  function setFilter(next: Filter) {
    const q = new URLSearchParams(searchParams.toString());
    if (next === "all") q.delete("type");
    else q.set("type", next);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function playItem(item: ListenPublicItem) {
    if (!item.audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    if (playing?.slug === item.slug) {
      if (audio.paused) {
        void audio.play();
        setPaused(false);
      } else {
        audio.pause();
        setPaused(true);
      }
      return;
    }
    setPlaying(item);
    setPaused(false);
    setElapsed(0);
    audio.src = item.audioUrl;
    void audio.play();
  }

  function closePlayer() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setPlaying(null);
    setPaused(false);
    setElapsed(0);
  }

  const totalSec = playing?.durationSec ?? 0;
  const progress = useMemo(() => {
    if (!totalSec || totalSec <= 0) return 0;
    return Math.min(1, Math.max(0, elapsed / totalSec));
  }, [elapsed, totalSec]);

  return (
    <div className="home-v2 min-h-full bg-[var(--hv2-page)] text-[var(--hv2-ink)]">
      <audio
        ref={audioRef}
        preload="metadata"
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onEnded={() => setPaused(true)}
        onPause={() => setPaused(true)}
        onPlay={() => setPaused(false)}
      />

      <section className="px-5 pb-2 pt-10 md:px-6 md:pt-16">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
          <h1 className="home-v2-display m-0 text-[2.5rem] font-normal leading-[1.05] tracking-[-1px] md:text-[3.75rem]">
            Made with{" "}
            <em className="italic text-[var(--hv2-tan-text)]">Consciously</em>.
          </h1>
          <p className="m-0 max-w-[680px] text-[17px] leading-[1.5] text-[var(--hv2-body)] md:text-[19px]">
            Meditations and Stories, each made from a few words about what
            someone needed. Press play on any of them, no account needed.
          </p>
          <div className="pt-3">
            <div className="inline-flex gap-0.5 rounded-full border border-[rgba(62,52,66,.12)] bg-[#FFFBF3] p-1">
              {(
                [
                  ["all", "All"],
                  ["meditations", "Meditations"],
                  ["stories", "Stories"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`inline-flex h-9 items-center rounded-full px-[18px] text-[14.5px] ${
                    filter === id
                      ? "bg-[var(--hv2-sticky-bg)] font-semibold text-[var(--hv2-ivory)]"
                      : "text-[var(--hv2-body)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {showMeditations ? (
        <section className="px-5 py-10 md:px-6 md:py-12">
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
            <div>
              <h2 className="home-v2-display m-0 text-[1.75rem] font-normal tracking-[-0.4px] md:text-[2.125rem]">
                Meditations
              </h2>
              <p className="m-0 mt-1.5 max-w-[720px] text-[15px] leading-[1.5] text-[var(--hv2-body)] md:text-[16px]">
                Each one was written and narrated from the one line under it.
              </p>
            </div>
            {visibleMeditations.length === 0 ? (
              <p className="text-[15px] text-[var(--hv2-muted)]">
                No public meditations yet.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-[18px] md:grid-cols-3">
                  {visibleMeditations.map((item, i) => {
                    const hideOnMobile =
                      filter === "all" && i >= mobileMeditationCap;
                    return (
                      <MeditationCard
                        key={item.slug}
                        item={item}
                        active={playing?.slug === item.slug && !paused}
                        className={hideOnMobile ? "hidden md:flex" : "flex"}
                        onPlay={() => playItem(item)}
                      />
                    );
                  })}
                </div>
                {filter === "all" &&
                meditations.length > mobileMeditationCap ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[15px] font-medium text-[var(--hv2-tan-text)] md:hidden"
                    onClick={() => setFilter("meditations")}
                  >
                    All {meditations.length} meditations
                    <span aria-hidden>›</span>
                  </button>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}

      {showStories ? (
        <section
          className={`px-5 pb-28 pt-4 md:px-6 md:pb-32 md:pt-6 ${
            playing ? "pb-36" : ""
          }`}
        >
          <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
            <div>
              <h2 className="home-v2-display m-0 text-[1.75rem] font-normal tracking-[-0.4px] md:text-[2.125rem]">
                Stories
              </h2>
              <p className="m-0 mt-1.5 max-w-[720px] text-[15px] leading-[1.5] text-[var(--hv2-body)] md:text-[16px]">
                A Story is written about the person you’re becoming, in the
                third person, and narrated for you to listen to at night.
              </p>
            </div>
            {visibleStories.length === 0 ? (
              <p className="text-[15px] text-[var(--hv2-muted)]">
                No public Stories yet.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2">
                  {visibleStories.map((item, i) => {
                    const hideOnMobile =
                      filter === "all" && i >= mobileStoryCap;
                    return (
                      <StoryCard
                        key={item.slug}
                        item={item}
                        active={playing?.slug === item.slug && !paused}
                        className={hideOnMobile ? "hidden md:flex" : "flex"}
                        onPlay={() => playItem(item)}
                      />
                    );
                  })}
                </div>
                {filter === "all" && stories.length > mobileStoryCap ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[15px] font-medium text-[var(--hv2-tan-text)] md:hidden"
                    onClick={() => setFilter("stories")}
                  >
                    All {stories.length} Stories
                    <span aria-hidden>›</span>
                  </button>
                ) : null}
              </>
            )}
          </div>
        </section>
      ) : null}

      <ListenBriefBand
        headline="Make one from your own words."
        body="Write one line about what you need. Consciously writes and narrates a meditation for it. Your first one is free."
      />
      <SiteFooterV2 />

      {playing ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-5 md:pb-7">
          <div className="pointer-events-auto flex w-full max-w-[760px] items-center gap-3.5 rounded-[18px] border border-[rgba(62,52,66,.12)] bg-[#FFFBF3] p-2.5 shadow-[0_18px_44px_rgba(28,35,54,.22)]">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-[10px]">
              <ListenCoverArt
                title={playing.title}
                coverImageUrl={playing.coverImageUrl}
              />
            </div>
            <div className="min-w-0 w-[140px] shrink-0 sm:w-[230px]">
              <p className="m-0 truncate text-[14.5px] font-semibold text-[var(--hv2-ink)]">
                {playing.title}
              </p>
              <p className="m-0 text-[12.5px] text-[var(--hv2-muted)]">
                {playing.style || (playing.kind === "story" ? "Story" : "Meditation")}
                {totalSec
                  ? ` · ${formatListenClock(elapsed)} / ${formatListenClock(totalSec)}`
                  : null}
              </p>
            </div>
            <button
              type="button"
              aria-label={paused ? "Play" : "Pause"}
              onClick={() => playItem(playing)}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-[#AFC2DC] bg-[#C3D2E8] text-[#14203A]"
            >
              {paused ? (
                <PlayIcon size={16} />
              ) : (
                <PauseIcon size={16} />
              )}
            </button>
            <button
              type="button"
              aria-label="Seek"
              className="relative hidden h-7 min-w-0 flex-1 touch-none sm:block"
              onClick={(e) => {
                const audio = audioRef.current;
                if (!audio || !totalSec) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const t = (e.clientX - rect.left) / rect.width;
                audio.currentTime = Math.max(0, Math.min(1, t)) * totalSec;
              }}
            >
              <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[rgba(62,52,66,.18)]" />
              <span
                className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-[var(--hv2-tan-text)]"
                style={{ width: `${progress * 100}%` }}
              />
            </button>
            <Link
              href={`/listen/${encodeURIComponent(playing.slug)}`}
              className="shrink-0 text-[14px] font-semibold text-[var(--hv2-tan-text)]"
            >
              Open
            </Link>
            <button
              type="button"
              aria-label="Close player"
              onClick={closePlayer}
              className="shrink-0 text-[var(--hv2-muted)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MeditationCard({
  item,
  active,
  onPlay,
  className,
}: {
  item: ListenPublicItem;
  active: boolean;
  onPlay: () => void;
  className?: string;
}) {
  const dur = formatListenDuration(item.durationSec);
  return (
    <article
      className={`${className ?? "flex"} min-w-0 flex-col gap-3.5 rounded-[20px] border border-[rgba(62,52,66,.12)] bg-[#FFFBF3] p-2.5 pb-4`}
    >
      <div className="relative h-[200px] w-full overflow-hidden rounded-[14px]">
        <ListenCoverArt title={item.title} coverImageUrl={item.coverImageUrl} />
        <div className="absolute bottom-3.5 left-3.5 flex items-center gap-2.5">
          <button
            type="button"
            aria-label={active ? "Pause" : "Play"}
            onClick={onPlay}
            disabled={!item.audioUrl}
            className="inline-flex size-11 items-center justify-center rounded-full border border-[#AFC2DC] bg-[#C3D2E8] text-[#14203A] disabled:opacity-40"
          >
            {active ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
          </button>
          {dur ? (
            <span className="inline-flex h-[26px] items-center rounded-full bg-[rgba(28,35,54,.55)] px-2.5 text-[12.5px] font-semibold text-[var(--hv2-ivory)]">
              {dur}
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-3 px-1.5">
        <div>
          <Link
            href={`/listen/${encodeURIComponent(item.slug)}`}
            className="text-[17px] font-semibold leading-snug text-[var(--hv2-ink)] hover:underline"
          >
            {item.title}
          </Link>
          <p className="m-0 mt-1 text-[13.5px] text-[var(--hv2-muted)]">
            {[item.style, dur].filter(Boolean).join(" · ")}
          </p>
        </div>
        {item.showBrief && item.brief ? (
          <div className="rounded-xl bg-[#F4ECDD] px-3.5 py-3">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[1.2px] text-[var(--hv2-tan-text)]">
              Made from
            </p>
            <p className="m-0 mt-1 text-[14px] leading-[1.45] text-[var(--hv2-body)]">
              “{item.brief}”
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function StoryCard({
  item,
  active,
  onPlay,
  className,
}: {
  item: ListenPublicItem;
  active: boolean;
  onPlay: () => void;
  className?: string;
}) {
  const dur = formatListenDuration(item.durationSec);
  const excerpt =
    item.storyText?.slice(0, 180) ||
    item.description.slice(0, 180) ||
    "";
  return (
    <article
      className={`${className ?? "flex"} min-w-0 gap-[18px] rounded-[20px] border border-[rgba(62,52,66,.12)] bg-[#FFFBF3] p-2.5`}
    >
      <div className="relative hidden h-auto w-[200px] shrink-0 overflow-hidden rounded-[14px] sm:block">
        <ListenCoverArt title={item.title} coverImageUrl={item.coverImageUrl} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 py-2.5 pr-3">
        {item.isExample ? (
          <span className="inline-flex h-6 w-fit items-center rounded-full bg-[#F4ECDD] px-2.5 text-[12px] font-semibold text-[var(--hv2-tan-text)]">
            Example Story
          </span>
        ) : null}
        <Link
          href={`/listen/${encodeURIComponent(item.slug)}`}
          className="text-[18px] font-semibold leading-snug text-[var(--hv2-ink)] hover:underline"
        >
          {item.title}
        </Link>
        {excerpt ? (
          <p className="m-0 line-clamp-3 text-[14.5px] leading-[1.55] text-[var(--hv2-body)]">
            {excerpt}
            {excerpt.length >= 180 ? "…" : ""}
          </p>
        ) : null}
        <div className="mt-auto flex items-center gap-3 pt-1">
          <button
            type="button"
            aria-label={active ? "Pause" : "Play"}
            onClick={onPlay}
            disabled={!item.audioUrl}
            className="inline-flex size-10 items-center justify-center rounded-full border border-[#AFC2DC] bg-[#C3D2E8] text-[#14203A] disabled:opacity-40"
          >
            {active ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
          <span className="text-[13.5px] text-[var(--hv2-muted)]">
            Story{dur ? ` · ${dur}` : ""}
          </span>
        </div>
      </div>
    </article>
  );
}

function PlayIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
      <path d="M8 5v14M16 5v14" />
    </svg>
  );
}

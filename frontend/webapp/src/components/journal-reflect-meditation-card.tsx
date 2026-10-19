"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, Pause, Play, X } from "lucide-react";
import { Link } from "@/lib/spa-nav";
import { formatDuration } from "@/components/library-meditation-card";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import type { JournalMeditationSnapshot } from "@/lib/journal-storage";
import {
  libraryMeditationDetailHref,
  libraryMeditationDetailHrefById,
} from "@/lib/library-meditation-detail";
import {
  libraryMeditationCategoryLabel,
  listLibraryMeditations,
} from "@/lib/medimade-api";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function voiceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

/** Tab the snapshot's (possibly legacy) link pointed at. */
function detailFromSnapshotHref(
  href: string | null | undefined,
): "creations" | "community" | "programs" {
  const h = href ?? "";
  if (h.includes("/library/community") || h.includes("from=community")) {
    return "community";
  }
  if (h.includes("/library/programs") || h.includes("from=programs")) {
    return "programs";
  }
  return "creations";
}

function isDetailHref(href: string | null | undefined): boolean {
  if (!href?.startsWith("/meditate/library/")) return false;
  const seg = href.slice("/meditate/library/".length).split(/[/?#]/)[0] ?? "";
  return Boolean(seg) && !["creations", "community", "programs"].includes(seg);
}

export function JournalReflectMeditationCard({
  meditationId,
  snapshot,
  onUnlink,
  label = "Reflecting on",
  removable = true,
}: {
  meditationId: string;
  snapshot?: JournalMeditationSnapshot | null;
  onUnlink?: () => void;
  label?: string;
  removable?: boolean;
}) {
  const {
    nowPlaying,
    playingS3Key,
    playbackTimeSeconds,
    playItem,
    playTrack,
    toggleCurrent,
  } = useLibraryPlayer();
  const [menuOpen, setMenuOpen] = useState(false);
  const [resolved, setResolved] = useState<JournalMeditationSnapshot | null>(
    snapshot ?? null,
  );

  const isCurrent = nowPlaying?.s3Key === meditationId;
  const isPlaying = isCurrent && playingS3Key === meditationId;

  useEffect(() => {
    setResolved(snapshot ?? null);
  }, [snapshot]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const items = await listLibraryMeditations().catch(() => []);
        if (cancelled) return;
        const hit = items.find(
          (x) =>
            x.s3Key === meditationId ||
            x.sk === meditationId ||
            x.id === meditationId,
        );
        if (!hit) return;
        setResolved((prev) => ({
          title: hit.title?.trim() || prev?.title || "Meditation",
          coverImageUrl: hit.coverImageUrl ?? prev?.coverImageUrl ?? null,
          speakerName: hit.speakerName ?? prev?.speakerName ?? null,
          styleLabel:
            libraryMeditationCategoryLabel(hit) || prev?.styleLabel || null,
          durationSeconds: hit.durationSeconds ?? prev?.durationSeconds ?? null,
          openHref: libraryMeditationDetailHref(hit, {
            from: detailFromSnapshotHref(prev?.openHref),
          }),
        }));
      } catch {
        /* */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meditationId]);

  const title = resolved?.title?.trim() || "Meditation";
  const voice = resolved?.speakerName?.trim() || "";
  const style = resolved?.styleLabel?.trim() || "";
  const duration =
    (isCurrent && nowPlaying?.durationSeconds) ||
    resolved?.durationSeconds ||
    0;
  // Older entries stored a list/focus link — always open the detail page.
  const openHref = isDetailHref(resolved?.openHref)
    ? (resolved?.openHref as string)
    : libraryMeditationDetailHrefById(meditationId, {
        from: detailFromSnapshotHref(resolved?.openHref),
      });
  const displayElapsed = isCurrent ? playbackTimeSeconds : 0;
  const progress = duration > 0 ? Math.min(1, displayElapsed / duration) : 0;

  async function handlePlayPause() {
    if (isCurrent) {
      toggleCurrent();
      return;
    }
    try {
      const items = await listLibraryMeditations().catch(() => []);
      const hit = items.find(
        (x) =>
          x.s3Key === meditationId ||
          x.sk === meditationId ||
          x.id === meditationId,
      );
      if (hit) {
        playItem(hit);
        return;
      }
    } catch {
      /* */
    }
    if (nowPlaying?.s3Key === meditationId) {
      playTrack(nowPlaying);
    }
  }

  return (
    <div className="flex items-center gap-3.5 rounded-[14px] border border-accent/35 bg-accent-soft/40 px-3.5 py-3 max-md:gap-2.5 max-md:px-3 max-md:py-2.5">
      <span className="h-16 w-16 shrink-0 overflow-hidden rounded-[10px] bg-accent-soft max-md:h-12 max-md:w-12">
        {resolved?.coverImageUrl ? (
          <img
            src={resolved.coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="block h-full w-full bg-accent-soft/80" />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          {label}
        </p>
        <p className="truncate font-display text-[17px] leading-tight text-foreground max-md:text-base">
          {title}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-2.5 max-md:flex-col max-md:items-stretch max-md:gap-1.5">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            {voice ? (
              <span
                aria-hidden
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-[8px] font-semibold text-accent-link"
              >
                {voiceInitials(voice)}
              </span>
            ) : null}
            <span className="min-w-0 truncate">
              {[voice, style].filter(Boolean).join(" · ") || "Meditation"}
            </span>
          </span>
          <div className="flex min-w-0 max-w-[320px] flex-1 items-center gap-2 text-[11px] tabular-nums text-muted max-md:max-w-none">
            <span className="w-8 shrink-0">{formatClock(displayElapsed)}</span>
            <span className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                style={{ width: `${progress * 100}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right">
              {duration > 0 ? formatDuration(duration) : "0:00"}
            </span>
          </div>
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => void handlePlayPause()}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent"
          style={PRIMARY_ACCENT_FILL_STYLE}
        >
          {isPlaying ? (
            <Pause className="size-4" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play
              className="size-4 translate-x-px"
              fill="currentColor"
              strokeWidth={0}
            />
          )}
        </button>
        <Link
          href={openHref}
          className="inline-flex h-[34px] items-center justify-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground transition-colors hover:border-accent/40"
        >
          Open
        </Link>
        {removable && onUnlink ? (
          <button
            type="button"
            aria-label="Unlink meditation"
            onClick={onUnlink}
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-accent-soft/50 hover:text-foreground"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <div className="relative flex shrink-0 items-center gap-1.5 sm:hidden">
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={() => void handlePlayPause()}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent"
          style={PRIMARY_ACCENT_FILL_STYLE}
        >
          {isPlaying ? (
            <Pause className="size-3.5" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play
              className="size-3.5 translate-x-px"
              fill="currentColor"
              strokeWidth={0}
            />
          )}
        </button>
        <button
          type="button"
          aria-label="More"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted"
        >
          <MoreHorizontal className="size-4" strokeWidth={2} />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[9rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
            <Link
              href={openHref}
              className="block px-3 py-2 text-sm text-foreground hover:bg-accent-soft/40"
              onClick={() => setMenuOpen(false)}
            >
              Open
            </Link>
            {removable && onUnlink ? (
              <button
                type="button"
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-foreground hover:bg-accent-soft/40"
                onClick={() => {
                  setMenuOpen(false);
                  onUnlink();
                }}
              >
                Unlink
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

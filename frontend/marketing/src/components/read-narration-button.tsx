"use client";

import { Pause, Play } from "lucide-react";
import { trackFromBlogNarration } from "@consciously/common";
import { type MouseEvent } from "react";
import { useLibraryPlayer } from "@/components/library-player-provider";

export function ReadNarrationButton({
  src,
  title,
  label = "Listen",
  className = "",
}: {
  src: string;
  title: string;
  label?: string;
  className?: string;
}) {
  const { playTrack, toggleCurrent, nowPlaying, playingS3Key } =
    useLibraryPlayer();
  const track = trackFromBlogNarration(src, title);
  const isThis = nowPlaying?.s3Key === track.s3Key;
  const isPlaying = isThis && playingS3Key === track.s3Key;

  function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isThis) toggleCurrent();
    else playTrack(track);
  }

  return (
    <span className={`inline-flex ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? "Pause narration" : "Play narration"}
        title={isPlaying ? "Pause" : label}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent-soft/50"
      >
        {isPlaying ? (
          <Pause className="size-3.5" aria-hidden />
        ) : (
          <Play className="size-3.5" aria-hidden />
        )}
        {isPlaying ? "Pause" : label}
      </button>
    </span>
  );
}

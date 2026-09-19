"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent } from "react";

export function ReadNarrationButton({
  src,
  label = "Listen",
  className = "",
}: {
  src: string;
  label?: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, [src]);

  function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  return (
    <span className={`inline-flex ${className}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause narration" : "Play narration"}
        title={playing ? "Pause" : label}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent-soft/50"
      >
        {playing ? (
          <Pause className="size-3.5" aria-hidden />
        ) : (
          <Play className="size-3.5" aria-hidden />
        )}
        {playing ? "Pause" : label}
      </button>
    </span>
  );
}

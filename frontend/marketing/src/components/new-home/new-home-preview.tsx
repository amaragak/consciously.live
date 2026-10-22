"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type PreviewApi = {
  toggle: (src: string) => void;
  playing: (src: string) => boolean;
};

const PreviewContext = createContext<PreviewApi>({
  toggle: () => {},
  playing: () => false,
});

export function PreviewProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audioRef.current = audio;
    const stop = () => setSrc(null);
    audio.addEventListener("ended", stop);
    return () => {
      audio.pause();
      audio.removeEventListener("ended", stop);
      audioRef.current = null;
    };
  }, []);

  const toggle = useCallback((next: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src === next && !audio.paused) {
      audio.pause();
      setSrc(null);
      return;
    }
    audio.src = next;
    void audio
      .play()
      .then(() => setSrc(next))
      .catch(() => setSrc(null));
  }, []);

  const playing = useCallback((next: string) => src === next, [src]);

  return (
    <PreviewContext.Provider value={{ toggle, playing }}>
      {children}
    </PreviewContext.Provider>
  );
}

export function usePreview() {
  return useContext(PreviewContext);
}

export function PreviewButton({
  src,
  label,
  className,
}: {
  src: string;
  label: string;
  className?: string;
}) {
  const { toggle, playing } = usePreview();
  const on = playing(src);
  return (
    <button
      type="button"
      className={className}
      aria-label={on ? `Pause ${label}` : `Play ${label}`}
      aria-pressed={on}
      onClick={() => toggle(src)}
    >
      {on ? <PauseMark /> : <PlayMark />}
    </button>
  );
}

export function PlayMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5l11 7-11 7z" />
    </svg>
  );
}

export function PauseMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

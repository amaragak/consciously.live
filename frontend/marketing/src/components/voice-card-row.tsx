"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DualStemPlayer } from "@consciously/common";
import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

const LAST_VOICE_STORAGE_KEY = "mm_last_fish_voice_v1";
/** Pause between preview sample repeats (matches create-flow speaker bed). */
const PREVIEW_REPEAT_GAP_MS = 3000;

type Voice = {
  modelId: string;
  name: string;
  description?: string;
  goodFor?: string[];
  gender?: "male" | "female";
};

type VoiceCardRowProps = {
  voices: Voice[];
  value: string;
  onChange: (modelId: string) => void;
  /** Null while the media base URL is unknown, which disables previews. */
  previewDryUrl: (modelId: string) => string | null;
  previewWetUrl: (modelId: string) => string | null;
  voiceFxDial: number;
  disabled?: boolean;
  /** Bump to stop a running preview from outside, e.g. when generation starts. */
  stopNonce?: number;
};

function readLastVoiceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readAccountLocalStorage(LAST_VOICE_STORAGE_KEY)?.trim();
    return raw || null;
  } catch {
    return null;
  }
}

function writeLastVoiceId(modelId: string) {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(LAST_VOICE_STORAGE_KEY, modelId);
  } catch {
    /* ignore */
  }
}

function PlayPauseIcon({
  playing,
  size = 14,
}: {
  playing: boolean;
  size?: number;
}) {
  return playing ? (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

export function VoiceCardRow({
  voices,
  value,
  onChange,
  previewDryUrl,
  previewWetUrl,
  voiceFxDial,
  disabled,
  stopNonce = 0,
}: VoiceCardRowProps) {
  const playerRef = useRef<DualStemPlayer | null>(null);
  if (!playerRef.current) playerRef.current = new DualStemPlayer();
  const gapTimeoutRef = useRef<number | null>(null);
  const repeatWantedRef = useRef(false);
  const previewingIdRef = useRef<string | null>(null);
  const selectedBtnRef = useRef<HTMLButtonElement | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  function clearGapSchedule() {
    if (gapTimeoutRef.current !== null) {
      window.clearTimeout(gapTimeoutRef.current);
      gapTimeoutRef.current = null;
    }
  }

  function stopPreview() {
    clearGapSchedule();
    repeatWantedRef.current = false;
    previewingIdRef.current = null;
    playerRef.current?.stop();
    setPreviewingId(null);
  }

  useEffect(() => {
    if (hydratedRef.current || voices.length === 0) return;
    hydratedRef.current = true;
    const last = readLastVoiceId();
    const hasHistory = Boolean(
      last && voices.some((v) => v.modelId === last),
    );
    if (hasHistory && last && last !== value) {
      onChange(last);
    } else if (!value || !voices.some((v) => v.modelId === value)) {
      onChange(voices[0]!.modelId);
    }
    // Only on first voices load — parent may also set a default.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot hydrate
  }, [voices]);

  useLayoutEffect(() => {
    if (!value) return;
    const el = selectedBtnRef.current;
    if (!el) return;
    el.scrollIntoView({
      behavior: "auto",
      inline: "center",
      block: "nearest",
    });
  }, [value, voices.length]);

  useEffect(
    () => () => {
      clearGapSchedule();
      repeatWantedRef.current = false;
      playerRef.current?.dispose();
      playerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stop on external nonce only
  }, [stopNonce]);

  function armRepeat(player: DualStemPlayer) {
    clearGapSchedule();
    const waitMs = Math.max(player.duration, 0) * 1000 + PREVIEW_REPEAT_GAP_MS;
    gapTimeoutRef.current = window.setTimeout(() => {
      gapTimeoutRef.current = null;
      if (!repeatWantedRef.current) return;
      void playerRef.current
        ?.play()
        .then(() => {
          if (!repeatWantedRef.current || !playerRef.current) return;
          armRepeat(playerRef.current);
        })
        .catch(() => {
          stopPreview();
        });
    }, waitMs);
  }

  useEffect(() => {
    playerRef.current?.setDial(voiceFxDial);
  }, [voiceFxDial]);

  async function startPreview(modelId: string) {
    const dry = previewDryUrl(modelId);
    if (!dry) return;
    const player = playerRef.current;
    if (!player) return;
    clearGapSchedule();
    repeatWantedRef.current = true;
    previewingIdRef.current = modelId;
    setPreviewingId(modelId);
    try {
      await player.start(dry, previewWetUrl(modelId), voiceFxDial);
      await player.whenDuration();
      if (!repeatWantedRef.current || previewingIdRef.current !== modelId) return;
      armRepeat(player);
    } catch {
      stopPreview();
    }
  }

  /** Select the voice and play (or pause if already previewing this one). */
  function activateVoice(modelId: string) {
    if (disabled) return;
    writeLastVoiceId(modelId);
    if (modelId !== value) onChange(modelId);
    if (previewingIdRef.current === modelId) {
      stopPreview();
      return;
    }
    void startPreview(modelId);
  }

  const labelClass =
    "text-xs font-semibold uppercase tracking-[0.12em] text-foreground";

  const list = voices ?? [];

  return (
    <section className="shrink-0 border-b border-border">
      {/* Mobile: Voice label above the scroller */}
      <span className={`mb-2 block sm:hidden ${labelClass}`}>Voice</span>
      <div className="flex items-center gap-3">
        <span className={`hidden w-12 shrink-0 sm:block ${labelClass}`}>
          Voice
        </span>
        <div className="flex min-h-[3.5rem] min-w-0 flex-1 items-center gap-2.5 overflow-x-auto py-0.5">
          {list.map((voice) => {
            const selected = voice.modelId === value;
            const playing = previewingId === voice.modelId;
            const canPreview = Boolean(previewDryUrl(voice.modelId));
            return (
              <button
                key={voice.modelId}
                ref={selected ? selectedBtnRef : undefined}
                type="button"
                disabled={disabled || !canPreview}
                aria-pressed={selected}
                aria-label={
                  playing
                    ? `Pause ${voice.name} sample`
                    : `Select and play ${voice.name}`
                }
                onClick={() => activateVoice(voice.modelId)}
                className={`flex shrink-0 cursor-pointer items-center border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                  selected
                    ? "border-accent bg-card"
                    : "border-border bg-card"
                } flex-col gap-1 rounded-lg px-3 py-2 sm:flex-row sm:gap-2 sm:rounded-full sm:px-3.5`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                    selected
                      ? "bg-accent-button text-on-accent"
                      : "bg-accent/20 text-accent-link"
                  }`}
                  aria-hidden
                >
                  <PlayPauseIcon playing={playing} size={10} />
                </span>
                <span
                  className={`whitespace-nowrap text-sm leading-none ${
                    selected ? "font-medium" : "font-normal"
                  } text-foreground`}
                >
                  {voice.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

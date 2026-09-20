
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { isMelodicMusicKey } from "../audio/sound-taxonomy";
import {
  backgroundAudioPlaybackKey,
  backgroundAudioStreamingKey,
} from "../audio/background-audio-keys";
import {
  releaseGaplessBed,
  setGaplessBedVolume,
  syncGaplessBed,
} from "../audio/gapless-bed-loop";
import {
  applySpeechElementVolume,
  bedElementVolume,
  BED_VOICE_INTRO_SECONDS,
  SOUNDSCAPE_ELEMENT_VOLUME,
} from "../audio/bed-volume";
import type { BackgroundAudioItem, LibraryMeditationFields } from "./types";
import { DualStemPlayer } from "../audio/dual-stem-player";

export type LibraryActiveTrack = {
  url: string;
  title: string;
  s3Key: string;
  liveMix?: boolean;
  natureKey?: string;
  musicKey?: string;
  drumsKey?: string;
  noiseKey?: string;
  natureGain?: number;
  musicGain?: number;
  drumsGain?: number;
  noiseGain?: number;
  /**
   * Focus (and similar) bed without narration.
   * - `soundscape`: seekable main audio (same chrome as meditation)
   * - `mix`: looping multi-channel beds; progress shows ∞
   */
  ambientOnly?: boolean;
  ambientKind?: "soundscape" | "mix";
  dryUrl?: string;
  wetUrl?: string;
  voiceFxDial?: number;
};

export type BedVolumeChannel = "nature" | "music" | "drums" | "noise";

export type LibraryBedVolumeApi = {
  setBedVolume: (channel: BedVolumeChannel, gain: number) => void;
  setVoiceFxDial: (dial: number) => void;
};

export function mediaFileUrl(base: string, key: string): string {
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${b}/${path}`;
}

export function trackFromBlogNarration(url: string, title: string): LibraryActiveTrack {
  const src = url.trim();
  return {
    url: src,
    title: title.trim() || "Narration",
    s3Key: `blog:audio:${src}`,
  };
}

export function trackFromLibraryItem(
  m: LibraryMeditationFields,
): LibraryActiveTrack {
  return {
    url: m.audioUrl,
    title: m.title,
    s3Key: m.s3Key,
    liveMix: m.liveMix === true,
    natureKey: m.backgroundNatureKey ?? "",
    musicKey: m.backgroundMusicKey ?? "",
    drumsKey: m.backgroundDrumsKey ?? "",
    noiseKey: m.backgroundNoiseKey ?? "",
    natureGain: m.backgroundNatureGain ?? 25,
    musicGain: m.backgroundMusicGain ?? 50,
    drumsGain: m.backgroundDrumsGain ?? 40,
    noiseGain: m.backgroundNoiseGain ?? 10,
    dryUrl: m.dryAudioUrl ?? undefined,
    wetUrl: m.wetAudioUrl ?? undefined,
    voiceFxDial: m.voiceFxDial ?? 100,
  };
}

export function liveMixTrack(
  m: Pick<
    LibraryMeditationFields,
    "audioUrl" | "title" | "s3Key" | "dryAudioUrl" | "wetAudioUrl" | "voiceFxDial"
  >,
  mix: {
    natureKey: string;
    musicKey: string;
    drumsKey: string;
    noiseKey: string;
    natureGain: number;
    musicGain: number;
    drumsGain: number;
    noiseGain: number;
    voiceFxDial?: number;
  },
): LibraryActiveTrack {
  return {
    url: m.audioUrl,
    title: m.title,
    s3Key: m.s3Key,
    liveMix: true,
    natureKey: backgroundAudioStreamingKey(mix.natureKey),
    musicKey: backgroundAudioStreamingKey(mix.musicKey),
    drumsKey: backgroundAudioStreamingKey(mix.drumsKey),
    noiseKey: backgroundAudioStreamingKey(mix.noiseKey),
    natureGain: mix.natureGain,
    musicGain: mix.musicGain,
    drumsGain: mix.drumsGain,
    noiseGain: mix.noiseGain,
    dryUrl: m.dryAudioUrl ?? undefined,
    wetUrl: m.wetAudioUrl ?? undefined,
    voiceFxDial: mix.voiceFxDial ?? m.voiceFxDial ?? 100,
  };
}

function formatAudioClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Stable id prefix for Focus ambient strip tracks. */
export const FOCUS_AMBIENT_S3_PREFIX = "focus:ambient:";

/** A soundscape rides the music slot alone; that is how it is recognised later. */
export function isSoundscapeKey(
  compositions: BackgroundAudioItem[],
  key: string | null | undefined,
): boolean {
  const k = backgroundAudioStreamingKey(key ?? "");
  if (!k) return false;
  return compositions.some((c) => backgroundAudioStreamingKey(c.key) === k);
}

export function trackFromFocusMix(
  mix: {
    natureKey: string;
    musicKey: string;
    drumsKey: string;
    noiseKey: string;
    natureGain: number;
    musicGain: number;
    drumsGain: number;
    noiseGain: number;
  },
  opts: {
    title: string;
    mediaBase: string | null;
    compositions: BackgroundAudioItem[];
  },
): LibraryActiveTrack | null {
  const natureKey = backgroundAudioStreamingKey(mix.natureKey);
  const musicKey = backgroundAudioStreamingKey(mix.musicKey);
  const drumsKey = backgroundAudioStreamingKey(mix.drumsKey);
  const noiseKey = backgroundAudioStreamingKey(mix.noiseKey);
  const hasAny = Boolean(natureKey || musicKey || drumsKey || noiseKey);
  if (!hasAny) return null;

  // Soundscapes have a real duration — use the normal seekable strip player.
  const soundscape = isSoundscapeKey(opts.compositions, musicKey);
  if (soundscape && musicKey) {
    if (!opts.mediaBase) return null;
    return {
      url: mediaFileUrl(
        opts.mediaBase,
        backgroundAudioStreamingKey(musicKey),
      ),
      title: opts.title,
      s3Key: `${FOCUS_AMBIENT_S3_PREFIX}soundscape:${musicKey}`,
      ambientOnly: true,
      ambientKind: "soundscape",
      liveMix: false,
      musicKey,
      musicGain: mix.musicGain,
      natureKey: "",
      drumsKey: "",
      noiseKey: "",
      natureGain: 0,
      drumsGain: 0,
      noiseGain: 0,
    };
  }

  // Build-your-own only: looping gapless beds (∞ strip chrome).
  return {
    url: "",
    title: opts.title,
    s3Key: `${FOCUS_AMBIENT_S3_PREFIX}mix`,
    ambientOnly: true,
    ambientKind: "mix",
    liveMix: true,
    natureKey,
    musicKey,
    drumsKey,
    noiseKey,
    natureGain: mix.natureGain,
    musicGain: mix.musicGain,
    drumsGain: mix.drumsGain,
    noiseGain: mix.noiseGain,
  };
}

function downloadBasename(title: string): string {
  const t = title.trim() || "meditation";
  const safe = t.replace(/[^\w\- .]+/g, "_").replace(/\s+/g, " ").trim();
  return `${safe.slice(0, 80)}.mp3`;
}

export function LibraryAudioStrip({
  track,
  musicItems,
  compositionItems,
  onDismiss,
  playbackToggleNonce,
  bedVolumeApiRef,
  onPlayingChange,
  onPlaybackTimeChange,
  onHeightChange,
  mediaBase = null,
  besideSidebar = false,
}: {
  track: LibraryActiveTrack | null;
  musicItems: BackgroundAudioItem[];
  compositionItems: BackgroundAudioItem[];
  onDismiss: () => void;
  playbackToggleNonce: number;
  bedVolumeApiRef?: MutableRefObject<LibraryBedVolumeApi | null>;
  onPlayingChange?: (s3Key: string, playing: boolean) => void;
  onPlaybackTimeChange?: (s3Key: string, timeSeconds: number) => void;
  onHeightChange?: (heightPx: number) => void;
  /** CDN origin for bed files (no trailing slash). */
  mediaBase?: string | null;
  /** When true, dock inset leaves room for the app sidebar. */
  besideSidebar?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const dualRef = useRef<DualStemPlayer | null>(null);
  if (!dualRef.current) dualRef.current = new DualStemPlayer();
  const useDual = Boolean(track?.dryUrl && track?.wetUrl);
  const natureRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const drumsRef = useRef<HTMLAudioElement>(null);
  const noiseRef = useRef<HTMLAudioElement>(null);
  const seekingRef = useRef(false);
  const [playing, setPlaying] = useState(() => Boolean(track?.ambientOnly));
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const lastToggleNonceRef = useRef(playbackToggleNonce);
  const lastReportedTimeRef = useRef<number>(-Infinity);
  const voiceIntroTimerRef = useRef<number | null>(null);
  const liveBedGainsRef = useRef({
    nature: track?.natureGain ?? 0,
    music: track?.musicGain ?? 0,
    drums: track?.drumsGain ?? 0,
    noise: track?.noiseGain ?? 0,
  });
  const soundscapeActive =
    track?.liveMix === true && isSoundscapeKey(compositionItems, track.musicKey);
  const soundscapeActiveRef = useRef(soundscapeActive);
  soundscapeActiveRef.current = soundscapeActive;
  const ambientMix = track?.ambientOnly === true && track.ambientKind === "mix";
  const ambientSoundscape =
    track?.ambientOnly === true && track.ambientKind === "soundscape";

  /** Focus tasks shelf — inset the strip so it doesn't run under the rail. */
  const [focusTasksInsetPx, setFocusTasksInsetPx] = useState(0);
  useEffect(() => {
    const readInset = () => {
      const root = document.documentElement;
      const open = root.dataset.focusTasks === "open";
      const raw = getComputedStyle(root)
        .getPropertyValue("--focus-tasks-w")
        .trim();
      const fromVar = Number.parseFloat(raw);
      setFocusTasksInsetPx(
        open ? (Number.isFinite(fromVar) && fromVar > 0 ? fromVar : 320) : 0,
      );
    };
    readInset();
    const mo = new MutationObserver(readInset);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-focus-tasks", "style"],
    });
    return () => mo.disconnect();
  }, []);

  const reportTime = useCallback(
    (t: number) => {
      if (!track) return;
      if (!onPlaybackTimeChange) return;
      // Throttle so we don't re-render the whole library on every `timeupdate`.
      if (Math.abs(t - lastReportedTimeRef.current) < 0.25) return;
      lastReportedTimeRef.current = t;
      onPlaybackTimeChange(track.s3Key, t);
    },
    [track, onPlaybackTimeChange],
  );

  function trackHasLiveBeds(): boolean {
    if (!track?.liveMix) return false;
    if ((track.natureKey ?? "").trim()) return true;
    if ((track.musicKey ?? "").trim()) return true;
    if ((track.noiseKey ?? "").trim()) return true;
    const drums = (track.drumsKey ?? "").trim();
    if (!drums) return false;
    return !isMelodicMusicKey(musicItems, track.musicKey ?? "");
  }

  function clearVoiceIntro() {
    if (voiceIntroTimerRef.current != null) {
      window.clearTimeout(voiceIntroTimerRef.current);
      voiceIntroTimerRef.current = null;
    }
  }

  function shouldDelayVoice(atSeconds: number): boolean {
    return trackHasLiveBeds() && atSeconds < 0.08;
  }

  function startOrResumePlayback() {
    if (!track) return;
    if (ambientMix) {
      setPlaying(true);
      onPlayingChange?.(track.s3Key, true);
      return;
    }
    if (useDual) {
      const dual = dualRef.current;
      if (!dual) return;
      clearVoiceIntro();
      setPlaying(true);
      onPlayingChange?.(track.s3Key, true);
      if (shouldDelayVoice(dual.currentTime)) {
        voiceIntroTimerRef.current = window.setTimeout(() => {
          voiceIntroTimerRef.current = null;
          void dual.play().catch(() => {
            setPlaying(false);
            onPlayingChange?.(track.s3Key, false);
          });
        }, BED_VOICE_INTRO_SECONDS * 1000);
        return;
      }
      void dual.play().catch(() => {
        setPlaying(false);
        onPlayingChange?.(track.s3Key, false);
      });
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (ambientSoundscape) {
      el.volume = SOUNDSCAPE_ELEMENT_VOLUME;
      clearVoiceIntro();
      setPlaying(true);
      onPlayingChange?.(track.s3Key, true);
      // Start immediately — lead-buffer wait made Focus soundscapes feel stalled.
      void el.play().catch(() => {
        setPlaying(false);
        onPlayingChange?.(track.s3Key, false);
      });
      return;
    }
    applySpeechElementVolume(el);
    clearVoiceIntro();
    if (shouldDelayVoice(el.currentTime)) {
      setPlaying(true);
      onPlayingChange?.(track.s3Key, true);
      voiceIntroTimerRef.current = window.setTimeout(() => {
        voiceIntroTimerRef.current = null;
        applySpeechElementVolume(el);
        void el.play().catch(() => {});
      }, BED_VOICE_INTRO_SECONDS * 1000);
      return;
    }
    void el.play().catch(() => {});
  }

  function pausePlayback() {
    clearVoiceIntro();
    if (!ambientMix) {
      audioRef.current?.pause();
      dualRef.current?.pause();
    }
    if (track) onPlayingChange?.(track.s3Key, false);
    setPlaying(false);
  }

  function togglePlayback() {
    if (ambientMix) {
      if (playing) pausePlayback();
      else startOrResumePlayback();
      return;
    }
    if (useDual) {
      if (playing || voiceIntroTimerRef.current != null) pausePlayback();
      else startOrResumePlayback();
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (playing || voiceIntroTimerRef.current != null) pausePlayback();
    else startOrResumePlayback();
  }

  useEffect(() => {
    liveBedGainsRef.current = {
      nature: track?.natureGain ?? 0,
      music: track?.musicGain ?? 0,
      drums: track?.drumsGain ?? 0,
      noise: track?.noiseGain ?? 0,
    };
  }, [track?.natureGain, track?.musicGain, track?.drumsGain, track?.noiseGain]);

  useEffect(() => {
    if (!bedVolumeApiRef) return;
    bedVolumeApiRef.current = {
      setBedVolume(channel, gain) {
        liveBedGainsRef.current[channel] = gain;
        const el =
          channel === "nature"
            ? natureRef.current
            : channel === "music"
              ? musicRef.current
              : channel === "drums"
                ? drumsRef.current
                : noiseRef.current;
        setGaplessBedVolume(
          el,
          soundscapeActiveRef.current && channel === "music"
            ? SOUNDSCAPE_ELEMENT_VOLUME
            : bedElementVolume(gain),
        );
      },
      setVoiceFxDial(dial) {
        dualRef.current?.setDial(dial);
      },
    };
    return () => {
      bedVolumeApiRef.current = null;
    };
  }, [bedVolumeApiRef]);

  useEffect(() => {
    const beds = [natureRef, musicRef, drumsRef, noiseRef];
    return () => {
      for (const ref of beds) releaseGaplessBed(ref.current);
    };
  }, []);

  useEffect(() => {
    if (!track) {
      clearVoiceIntro();
      dualRef.current?.stop();
      return;
    }
    seekingRef.current = false;
    lastReportedTimeRef.current = -Infinity;
    if (ambientMix) {
      setCurrent(0);
      setDuration(0);
      startOrResumePlayback();
      return () => {
        clearVoiceIntro();
      };
    }
    if (useDual && track.dryUrl) {
      let cancelled = false;
      const dual = dualRef.current;
      if (!dual) return;
      dual.onEnded = () => {
        if (cancelled) return;
        setPlaying(false);
        onPlayingChange?.(track.s3Key, false);
        if (!ambientSoundscape) onDismiss();
      };
      void dual
        .load(track.dryUrl, track.wetUrl ?? null, track.voiceFxDial ?? 100)
        .then(() => {
          if (cancelled) return;
          setDuration(dual.duration);
          setCurrent(dual.currentTime);
          startOrResumePlayback();
        })
        .catch(() => {
          if (cancelled) return;
          setPlaying(false);
          onPlayingChange?.(track.s3Key, false);
        });
      return () => {
        cancelled = true;
        clearVoiceIntro();
        dual.pause();
        dual.onEnded = null;
      };
    }
    dualRef.current?.stop();
    const el = audioRef.current;
    if (!el) return;
    if (ambientSoundscape) {
      // Src is already on the element; load() only delays first play.
      el.volume = SOUNDSCAPE_ELEMENT_VOLUME;
      startOrResumePlayback();
      return () => {
        clearVoiceIntro();
      };
    }
    el.load();
    applySpeechElementVolume(el);
    startOrResumePlayback();
    return () => {
      clearVoiceIntro();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart when the stem changes
  }, [track?.s3Key, track?.url, track?.ambientKind, track?.dryUrl, track?.wetUrl, useDual]);

  useEffect(() => {
    if (!useDual) return;
    dualRef.current?.setDial(track?.voiceFxDial ?? 100);
  }, [track?.voiceFxDial, useDual]);

  useEffect(() => {
    return () => {
      dualRef.current?.dispose();
      dualRef.current = null;
    };
  }, []);

  useEffect(() => {
    const soundscape = soundscapeActive;
    const beds: Array<{
      channel: BedVolumeChannel;
      el: HTMLAudioElement | null;
      key: string;
    }> = [
      {
        channel: "nature",
        el: natureRef.current,
        key: track?.liveMix ? track.natureKey ?? "" : "",
      },
      {
        channel: "music",
        el: musicRef.current,
        key: track?.liveMix ? track.musicKey ?? "" : "",
      },
      {
        channel: "drums",
        el: drumsRef.current,
        key: track?.liveMix
          ? isMelodicMusicKey(musicItems, track.musicKey ?? "")
            ? ""
            : track.drumsKey ?? ""
          : "",
      },
      {
        channel: "noise",
        el: noiseRef.current,
        key: track?.liveMix ? track.noiseKey ?? "" : "",
      },
    ];
    for (const bed of beds) {
      const el = bed.el;
      if (!el) continue;
      const volume =
        soundscape && bed.channel === "music"
          ? SOUNDSCAPE_ELEMENT_VOLUME
          : bedElementVolume(liveBedGainsRef.current[bed.channel]);
      if (!mediaBase || !bed.key.trim()) {
        syncGaplessBed(el, { url: null, volume, playing: false });
        continue;
      }
      syncGaplessBed(el, {
        url: mediaFileUrl(mediaBase, backgroundAudioPlaybackKey(bed.key)),
        fallbackUrl: mediaFileUrl(mediaBase, backgroundAudioStreamingKey(bed.key)),
        volume,
        playing,
        leadSec: ambientMix ? 0.4 : undefined,
        leadTimeoutMs: ambientMix ? 2000 : undefined,
        onPlaybackBlocked: ambientMix
          ? () => {
              setPlaying(false);
              if (track) onPlayingChange?.(track.s3Key, false);
            }
          : undefined,
      });
    }
  }, [
    track?.liveMix,
    track?.natureKey,
    track?.musicKey,
    track?.drumsKey,
    track?.noiseKey,
    track?.natureGain,
    track?.musicGain,
    track?.drumsGain,
    track?.noiseGain,
    track?.s3Key,
    playing,
    mediaBase,
    musicItems,
    soundscapeActive,
    ambientMix,
    onPlayingChange,
    track,
  ]);

  useEffect(() => {
    if (!track) return;
    if (playbackToggleNonce === lastToggleNonceRef.current) return;
    lastToggleNonceRef.current = playbackToggleNonce;
    togglePlayback();
  }, [playbackToggleNonce, track]);

  useEffect(() => {
    if (useDual) return;
    const el = audioRef.current;
    if (!el || !track || ambientMix) return;

    const onTime = () => {
      if (!seekingRef.current) {
        const t = el.currentTime;
        setCurrent(t);
        reportTime(t);
      }
    };
    const syncDuration = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    const onPlay = () => {
      setPlaying(true);
      onPlayingChange?.(track.s3Key, true);
    };
    const onPause = () => {
      setPlaying(false);
      onPlayingChange?.(track.s3Key, false);
    };
    const onEnded = () => {
      setPlaying(false);
      onPlayingChange?.(track.s3Key, false);
      // Focus soundscapes keep the strip (seekable piece ended); meditations dismiss.
      if (!ambientSoundscape) onDismiss();
    };

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("durationchange", syncDuration);
    el.addEventListener("loadedmetadata", syncDuration);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);

    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("durationchange", syncDuration);
      el.removeEventListener("loadedmetadata", syncDuration);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, [
    track,
    ambientMix,
    ambientSoundscape,
    onPlayingChange,
    onDismiss,
    reportTime,
    useDual,
  ]);

  useEffect(() => {
    if (!useDual || !track || ambientMix) return;
    let raf = 0;
    const tick = () => {
      const dual = dualRef.current;
      if (dual && !seekingRef.current) {
        const t = dual.currentTime;
        setCurrent(t);
        reportTime(t);
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [useDual, track, ambientMix, reportTime]);

  useLayoutEffect(() => {
    if (!track) {
      onHeightChange?.(0);
      return;
    }
    const el = rootRef.current;
    if (!el || !onHeightChange) return;
    const report = () => {
      const h = el.getBoundingClientRect().height;
      // Avoid clobbering the optimistic estimate with a 0 pre-layout read.
      if (h > 0) onHeightChange(h);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [track, onHeightChange]);

  if (!track) return null;

  const max = Math.max(duration, 0.0001);
  const hideTransportSeek = ambientMix;

  function skipSeconds(delta: number) {
    if (ambientMix) return;
    if (useDual) {
      const dual = dualRef.current;
      if (!dual) return;
      const end =
        Number.isFinite(dual.duration) && dual.duration > 0
          ? dual.duration
          : Number.isFinite(duration) && duration > 0
            ? duration
            : max;
      const next = Math.min(end, Math.max(0, dual.currentTime + delta));
      dual.seek(next);
      setCurrent(next);
      reportTime(next);
      if (!playing && voiceIntroTimerRef.current == null) return;
      clearVoiceIntro();
      if (shouldDelayVoice(next)) {
        dual.pause();
        startOrResumePlayback();
      } else if (!dual.isPlaying) {
        void dual.play().catch(() => {});
      }
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    const end =
      Number.isFinite(el.duration) && el.duration > 0
        ? el.duration
        : Number.isFinite(duration) && duration > 0
          ? duration
          : max;
    const next = Math.min(end, Math.max(0, el.currentTime + delta));
    el.currentTime = next;
    setCurrent(next);
    if (!playing && voiceIntroTimerRef.current == null) return;
    clearVoiceIntro();
    if (shouldDelayVoice(next)) {
      el.pause();
      startOrResumePlayback();
    } else if (el.paused) {
      void el.play().catch(() => {});
    }
  }

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none fixed bottom-0 z-50 ${
        besideSidebar
          ? "left-0 md:left-[var(--app-sidebar-w,200px)]"
          : "left-0"
      }`}
      style={{
        right: focusTasksInsetPx > 0 ? focusTasksInsetPx : 0,
        paddingLeft: "0.75rem",
        paddingRight: "0.75rem",
        paddingTop: "0.75rem",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      {ambientMix || useDual ? null : (
        <audio
          key={track.s3Key}
          ref={audioRef}
          src={track.url}
          preload="metadata"
          className="hidden"
        />
      )}
      {/* Looping is scheduled by syncGaplessBed, so these must not set `loop`. */}
      <audio ref={natureRef} className="hidden" playsInline />
      <audio ref={musicRef} className="hidden" playsInline />
      <audio ref={drumsRef} className="hidden" playsInline />
      <audio ref={noiseRef} className="hidden" playsInline />

      <div
        className="pointer-events-auto mx-auto w-full max-w-6xl min-w-0 rounded-full border border-border bg-card/95 px-4 py-2 shadow-[0_8px_28px_color-mix(in_srgb,var(--overlay)_12%,transparent)] backdrop-blur-md dark:bg-card/98 dark:shadow-[0_8px_28px_color-mix(in_srgb,var(--overlay)_40%,transparent)] sm:px-5"
        role="region"
        aria-label="Now playing"
      >
      <div className="flex w-full min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
          <div className="flex shrink-0 items-center gap-1">
            {hideTransportSeek ? null : (
              <button
                type="button"
                onClick={() => skipSeconds(-10)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-foreground hover:border-accent/40 sm:h-9 sm:w-9"
                aria-label="Back 10 seconds"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M11 18V6l-8.5 6L11 18zm11 0V6l-8.5 6L22 18z" />
                </svg>
              </button>
            )}
            <button
              type="button"
              onClick={() => togglePlayback()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full accent-fill-gradient text-on-accent"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              )}
            </button>
            {hideTransportSeek ? null : (
              <button
                type="button"
                onClick={() => skipSeconds(10)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-foreground hover:border-accent/40 sm:h-9 sm:w-9"
                aria-label="Forward 10 seconds"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
                </svg>
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-center font-display text-base font-semibold leading-tight text-foreground sm:text-lg">
                {track.title}
              </p>
              <button
                type="button"
                onClick={() => {
                  pausePlayback();
                  onDismiss();
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-accent-soft/40 hover:text-foreground sm:hidden"
                aria-label="Close player"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="w-10 shrink-0 tabular-nums text-[11px] leading-none text-muted">
                {hideTransportSeek ? "" : formatAudioClock(current)}
              </span>
              {hideTransportSeek ? (
                <div
                  className="relative h-1 w-full min-w-0 flex-1 overflow-hidden rounded-full bg-border/70"
                  aria-hidden
                >
                  <div
                    className={`absolute inset-y-0 left-0 w-1/3 rounded-full bg-gold/80 ${
                      playing ? "animate-pulse" : ""
                    }`}
                  />
                </div>
              ) : (
                <input
                  type="range"
                  className="h-1 w-full min-w-0 flex-1 cursor-pointer accent-accent"
                  min={0}
                  max={max}
                  step={0.05}
                  value={Math.min(current, max)}
                  aria-label="Seek"
                  onMouseDown={() => {
                    seekingRef.current = true;
                  }}
                  onMouseUp={() => {
                    seekingRef.current = false;
                  }}
                  onMouseLeave={() => {
                    seekingRef.current = false;
                  }}
                  onTouchStart={() => {
                    seekingRef.current = true;
                  }}
                  onTouchEnd={() => {
                    seekingRef.current = false;
                  }}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v)) return;
                    if (useDual) {
                      const dual = dualRef.current;
                      if (!dual) return;
                      dual.seek(v);
                      setCurrent(v);
                      reportTime(v);
                      if (!playing && voiceIntroTimerRef.current == null) return;
                      clearVoiceIntro();
                      if (shouldDelayVoice(v)) {
                        dual.pause();
                        startOrResumePlayback();
                      } else if (!dual.isPlaying) {
                        void dual.play().catch(() => {});
                      }
                      return;
                    }
                    const el = audioRef.current;
                    if (!el) return;
                    el.currentTime = v;
                    setCurrent(v);
                    reportTime(v);
                    if (!playing && voiceIntroTimerRef.current == null) return;
                    clearVoiceIntro();
                    if (shouldDelayVoice(v)) {
                      el.pause();
                      startOrResumePlayback();
                    } else if (el.paused) {
                      void el.play().catch(() => {});
                    }
                  }}
                />
              )}
              <span
                className="w-10 shrink-0 text-right tabular-nums text-[11px] leading-none text-muted"
                aria-label={hideTransportSeek ? "Continuous loop" : undefined}
              >
                {hideTransportSeek ? "∞" : formatAudioClock(duration)}
              </span>
            </div>
          </div>
        </div>

        <div className="hidden shrink-0 items-center justify-end gap-2 sm:flex">
          {ambientMix || ambientSoundscape ? null : (
            <a
              href={track.url}
              download={downloadBasename(track.title)}
              className="inline-flex rounded-xl border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground hover:border-accent/40"
              aria-label="Download audio"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 3v12" />
                <path d="M7 10l5 5 5-5" />
                <path d="M21 21H3" />
              </svg>
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              pausePlayback();
              onDismiss();
            }}
            className="rounded-xl px-2.5 py-1.5 text-sm text-muted hover:bg-accent-soft/40 hover:text-foreground"
            aria-label="Close player"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}


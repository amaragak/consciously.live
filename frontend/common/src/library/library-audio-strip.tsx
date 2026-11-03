
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
  seekGaplessBed,
  setGaplessBedVolume,
  syncGaplessBed,
} from "../audio/gapless-bed-loop";
import {
  applySpeechElementVolume,
  bedElementVolume,
  BED_OUTRO_FADE_SECONDS,
  BED_OUTRO_HOLD_SECONDS,
  BED_VOICE_INTRO_SECONDS,
  soundscapeListenVolume,
} from "../audio/bed-volume";
import type { BackgroundAudioItem, LibraryMeditationFields } from "./types";
import { PlayerStripView } from "./player-strip-view";
import {
  DualStemPlayer,
  getLibraryVoicePlayer,
} from "../audio/dual-stem-player";
import { voiceStemPlaybackUrl } from "../audio/voice-stem-keys";
import { clampVoiceFxDial } from "../audio/voice-fx-dial";

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
  /** Bust CDN cache for bed `.m4a` rebuilds (catalog updatedAt). */
  mediaCacheBust?: string | null;
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
  durationSeconds?: number;
  /** Bed-only seconds before voice; omit = default BED_VOICE_INTRO_SECONDS. */
  leadInSeconds?: number;
  /** When false, skip post-voice bed fade. Default true. */
  fadeOut?: boolean;
  coverImageUrl?: string;
  /** Speaker / voice credit — shown as artist under the title. */
  speakerName?: string;
};

export type BedVolumeChannel = "nature" | "music" | "drums" | "noise";

export type LibraryBedVolumeApi = {
  setBedVolume: (channel: BedVolumeChannel, gain: number) => void;
  setVoiceFxDial: (dial: number) => void;
};

/**
 * CDN URL for a media key. Pass `cacheBust` (catalog `updatedAt` / bake time)
 * whenever the object can be replaced in place — AAC beds use long-lived
 * CloudFront cache (`immutable`); without `?v=` clients keep hearing the old file.
 */
export function mediaFileUrl(
  base: string,
  key: string,
  cacheBust?: string | null,
): string {
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  const url = `${b}/${path}`;
  const v = cacheBust?.trim();
  if (!v) return url;
  return `${url}?v=${encodeURIComponent(v)}`;
}

export function trackFromBlogNarration(url: string, title: string): LibraryActiveTrack {
  const src = url.trim();
  return {
    url: src,
    title: title.trim() || "Narration",
    s3Key: `blog:audio:${src}`,
  };
}

function siblingStemUrl(
  audioUrl: string,
  kind: "dry" | "wet",
): string | undefined {
  const src = audioUrl.trim();
  if (!src) return undefined;
  try {
    const u = new URL(src);
    if (!/\.(mp3|wav|opus|m4a)$/i.test(u.pathname)) return undefined;
    u.pathname = u.pathname.replace(/\.(mp3|wav|opus|m4a)$/i, `-${kind}.m4a`);
    return u.toString();
  } catch {
    return undefined;
  }
}

export function trackFromLibraryItem(
  m: LibraryMeditationFields,
): LibraryActiveTrack {
  const cover = m.coverImageUrl?.trim();
  const speaker = m.speakerName?.trim();
  return {
    url: voiceStemPlaybackUrl(m.audioUrl),
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
    dryUrl: m.dryAudioUrl || siblingStemUrl(m.audioUrl, "dry"),
    wetUrl: m.wetAudioUrl || siblingStemUrl(m.audioUrl, "wet"),
    voiceFxDial: m.voiceFxDial ?? 100,
    durationSeconds:
      typeof m.durationSeconds === "number" && m.durationSeconds > 0
        ? m.durationSeconds
        : undefined,
    ...(typeof m.leadInSeconds === "number" &&
    Number.isFinite(m.leadInSeconds) &&
    m.leadInSeconds >= 0
      ? { leadInSeconds: m.leadInSeconds }
      : {}),
    ...(typeof m.fadeOut === "boolean" ? { fadeOut: m.fadeOut } : {}),
    ...(cover ? { coverImageUrl: cover } : {}),
    ...(speaker ? { speakerName: speaker } : {}),
  };
}

export function liveMixTrack(
  m: Pick<
    LibraryMeditationFields,
    | "audioUrl"
    | "title"
    | "s3Key"
    | "dryAudioUrl"
    | "wetAudioUrl"
    | "voiceFxDial"
    | "durationSeconds"
    | "coverImageUrl"
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
  const cover = m.coverImageUrl?.trim();
  return {
    url: voiceStemPlaybackUrl(m.audioUrl),
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
    dryUrl: m.dryAudioUrl || siblingStemUrl(m.audioUrl, "dry"),
    wetUrl: m.wetAudioUrl || siblingStemUrl(m.audioUrl, "wet"),
    voiceFxDial: mix.voiceFxDial ?? m.voiceFxDial ?? 100,
    durationSeconds:
      typeof m.durationSeconds === "number" && m.durationSeconds > 0
        ? m.durationSeconds
        : undefined,
    ...(cover ? { coverImageUrl: cover } : {}),
  };
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
    const bust =
      opts.compositions.find((c) => c.key === musicKey)?.updatedAt ?? null;
    return {
      url: mediaFileUrl(
        opts.mediaBase,
        backgroundAudioPlaybackKey(musicKey),
        bust,
      ),
      title: opts.title,
      s3Key: `${FOCUS_AMBIENT_S3_PREFIX}soundscape:${musicKey}`,
      ambientOnly: true,
      ambientKind: "soundscape",
      liveMix: false,
      musicKey,
      musicGain: mix.musicGain,
      mediaCacheBust: bust,
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
  /** Lift the strip above a bottom chrome bar (e.g. create-flow length nav). */
  bottomOffsetPx = 0,
  /**
   * `fixed` — viewport dock (default).
   * `inline` — in-flow host (e.g. above create length nav).
   */
  placement = "fixed",
  /** When false, load/sync only — do not start (click / playItem starts playback). */
  autoplay = false,
  tone: _tone = "default",
  /**
   * Create · Sound: strip play chrome reflects voice+beds together, and the
   * play button uses this toggle instead of bed-only transport.
   */
  externalPlaying = null,
  onExternalTransportToggle = null,
  /** Optional Reflect action (meditations only). */
  onReflect = null,
  reflectActive = false,
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
  bottomOffsetPx?: number;
  placement?: "fixed" | "inline";
  autoplay?: boolean;
  /** Kept for API compat; strip chrome is always the PlayerStrip navy gradient. */
  tone?: "default" | "dark";
  /** When non-null, overrides the strip play/pause icon state. */
  externalPlaying?: boolean | null;
  /** When set, strip play button calls this instead of internal toggle. */
  onExternalTransportToggle?: (() => void) | null;
  onReflect?: (() => void) | null;
  /** Accent outline when viewing this meditation’s linked journal entry. */
  reflectActive?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const dualRef = useRef<DualStemPlayer>(getLibraryVoicePlayer());
  dualRef.current = getLibraryVoicePlayer();
  const [dualFailed, setDualFailed] = useState(false);
  const voiceFxDial = clampVoiceFxDial(track?.voiceFxDial ?? 100);
  // Dry + FX stems for the whole play. Knob only setDial()s. No mixed file.
  const useDual = Boolean(track?.dryUrl && track?.wetUrl) && !dualFailed;
  const voiceUrl = track?.url ?? "";
  const natureRef = useRef<HTMLAudioElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const drumsRef = useRef<HTMLAudioElement>(null);
  const noiseRef = useRef<HTMLAudioElement>(null);
  const seekingRef = useRef(false);
  const [playing, setPlaying] = useState(() => Boolean(track?.ambientOnly));
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(() => track?.durationSeconds ?? 0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  /** Seconds into the post-voice hold+fade when paused there. */
  const outroParkedOffsetRef = useRef<number | null>(null);
  const lastToggleNonceRef = useRef(playbackToggleNonce);
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const lastReportedTimeRef = useRef<number>(-Infinity);
  const voiceIntroTimerRef = useRef<number | null>(null);
  /** 1 → 0 during post-voice bed outro fade (music + other live beds). */
  const bedOutroGainRef = useRef(1);
  const bedOutroRef = useRef<{
    active: boolean;
    /** performance.now() when outro offset 0 started. */
    originMs: number;
    raf: number | null;
  }>({ active: false, originMs: 0, raf: null });
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
  const ambientSoundscapeRef = useRef(ambientSoundscape);
  ambientSoundscapeRef.current = ambientSoundscape;

  const onPlayingChangeRef = useRef(onPlayingChange);
  onPlayingChangeRef.current = onPlayingChange;
  // Keep provider `playingS3Key` in lockstep with local transport (incl. ambient mount).
  useLayoutEffect(() => {
    if (!track) return;
    onPlayingChangeRef.current?.(track.s3Key, playing);
  }, [track?.s3Key, playing, track]);
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

  function bedChannelVolume(channel: BedVolumeChannel, gain: number): number {
    const base =
      soundscapeActiveRef.current && channel === "music"
        ? soundscapeListenVolume(gain)
        : bedElementVolume(gain);
    return base * Math.min(1, Math.max(0, bedOutroGainRef.current));
  }

  /** Ambient soundscape plays on the main `<audio>`, not the music bed channel. */
  function applyAmbientSoundscapeVolume() {
    const el = audioRef.current;
    if (!el || !ambientSoundscapeRef.current) return;
    el.volume = soundscapeListenVolume(liveBedGainsRef.current.music);
  }

  function applyLiveBedVolumes() {
    const gains = liveBedGainsRef.current;
    const beds: Array<{ channel: BedVolumeChannel; el: HTMLAudioElement | null }> =
      [
        { channel: "nature", el: natureRef.current },
        { channel: "music", el: musicRef.current },
        { channel: "drums", el: drumsRef.current },
        { channel: "noise", el: noiseRef.current },
      ];
    for (const bed of beds) {
      setGaplessBedVolume(
        bed.el,
        bedChannelVolume(bed.channel, gains[bed.channel]),
      );
    }
  }

  /** Soundscapes/compositions only — scrub music bed to the voice clock. */
  function syncSoundscapeToVoice(voiceSeconds: number) {
    if (!soundscapeActiveRef.current) return;
    seekGaplessBed(musicRef.current, voiceSeconds);
  }

  function clearBedOutro() {
    const o = bedOutroRef.current;
    if (o.raf != null) {
      window.cancelAnimationFrame(o.raf);
      o.raf = null;
    }
    o.active = false;
  }

  function voiceLenSeconds(): number {
    const d = durationRef.current;
    if (d > 0) return d;
    if (useDual) {
      const dd = dualRef.current?.duration ?? 0;
      if (Number.isFinite(dd) && dd > 0) return dd;
    }
    const ed = audioRef.current?.duration;
    if (typeof ed === "number" && Number.isFinite(ed) && ed > 0) return ed;
    return 0;
  }

  /** Post-voice bed tail: 10s hold + 10s fade. Zero when there is nothing to fade. */
  function outroPadSeconds(): number {
    if (!track || ambientMix || ambientSoundscape) return 0;
    if (track.fadeOut === false) return 0;
    if (!trackHasLiveBeds()) return 0;
    return BED_OUTRO_HOLD_SECONDS + BED_OUTRO_FADE_SECONDS;
  }

  function fadeGainAtOutroOffset(intoOutro: number): number {
    if (intoOutro <= BED_OUTRO_HOLD_SECONDS) return 1;
    const t = Math.min(
      1,
      Math.max(
        0,
        (intoOutro - BED_OUTRO_HOLD_SECONDS) / BED_OUTRO_FADE_SECONDS,
      ),
    );
    // Equal-power-ish ease: stay fuller early, settle quietly at the end.
    return Math.cos((t * Math.PI) / 2);
  }

  /**
   * Soundscapes lock to the voice clock, including the tail.
   * Looping custom mixes are not seeked — only their fade follows the scrub.
   */
  function applyOutroAudible(
    intoOutro: number,
    voiceLen: number,
    seekSoundscape: boolean,
  ) {
    bedOutroGainRef.current = fadeGainAtOutroOffset(intoOutro);
    applyLiveBedVolumes();
    if (seekSoundscape && soundscapeActiveRef.current) {
      seekGaplessBed(musicRef.current, voiceLen + intoOutro);
    }
  }

  function parkVoiceAtEnd() {
    if (useDual) {
      dualRef.current?.pause();
      return;
    }
    audioRef.current?.pause();
  }

  /** Hold beds, then fade out after the voice stem ends. */
  function beginBedOutro(
    fromOffset = 0,
    opts?: { seekSoundscape?: boolean },
  ) {
    if (!track) return;
    if (!trackHasLiveBeds()) {
      bedOutroGainRef.current = 1;
      clearBedOutro();
      setPlaying(false);
      onPlayingChange?.(track.s3Key, false);
      if (!ambientSoundscape) onDismiss();
      return;
    }
    if (track.fadeOut === false) {
      bedOutroGainRef.current = 1;
      clearBedOutro();
      clearVoiceIntro();
      setPlaying(false);
      onPlayingChange?.(track.s3Key, false);
      if (!ambientSoundscape) onDismiss();
      return;
    }
    const pad = BED_OUTRO_HOLD_SECONDS + BED_OUTRO_FADE_SECONDS;
    const voiceLen = voiceLenSeconds();
    const offset = Math.min(pad, Math.max(0, fromOffset));
    const seekSoundscape = opts?.seekSoundscape !== false;
    clearBedOutro();
    clearVoiceIntro();
    outroParkedOffsetRef.current = null;
    bedOutroRef.current.active = true;
    bedOutroRef.current.originMs = performance.now() - offset * 1000;
    parkVoiceAtEnd();
    applyOutroAudible(offset, voiceLen, seekSoundscape);
    setPlaying(true);
    onPlayingChange?.(track.s3Key, true);
    const timeline = voiceLen + offset;
    setCurrent(timeline);
    reportTime(timeline);

    const s3Key = track.s3Key;
    const tick = (now: number) => {
      if (!bedOutroRef.current.active) return;
      const into = (now - bedOutroRef.current.originMs) / 1000;
      if (into >= pad - 0.02) {
        setCurrent(voiceLen + pad);
        reportTime(voiceLen + pad);
        bedOutroGainRef.current = 0;
        applyLiveBedVolumes();
        bedOutroRef.current.active = false;
        bedOutroRef.current.raf = null;
        bedOutroGainRef.current = 1;
        setPlaying(false);
        onPlayingChange?.(s3Key, false);
        if (!ambientSoundscapeRef.current) onDismiss();
        return;
      }
      bedOutroGainRef.current = fadeGainAtOutroOffset(into);
      applyLiveBedVolumes();
      const t = voiceLen + into;
      setCurrent(t);
      reportTime(t);
      bedOutroRef.current.raf = window.requestAnimationFrame(tick);
    };
    bedOutroRef.current.raf = window.requestAnimationFrame(tick);
  }

  function seekTransport(v: number) {
    if (!track || ambientMix) return;
    const voiceLen = voiceLenSeconds();
    const pad = outroPadSeconds();
    const end = voiceLen + pad;
    const t = Math.min(end > 0 ? end : Math.max(0, v), Math.max(0, v));
    const keepPlaying =
      playing ||
      bedOutroRef.current.active ||
      voiceIntroTimerRef.current != null;

    if (pad > 0 && voiceLen > 0 && t >= voiceLen - 0.03) {
      const into = Math.min(pad, Math.max(0, t - voiceLen));
      if (keepPlaying) {
        beginBedOutro(into);
        return;
      }
      clearBedOutro();
      outroParkedOffsetRef.current = into;
      parkVoiceAtEnd();
      applyOutroAudible(into, voiceLen, true);
      setCurrent(voiceLen + into);
      reportTime(voiceLen + into);
      return;
    }

    outroParkedOffsetRef.current = null;
    clearBedOutro();
    bedOutroGainRef.current = 1;
    applyLiveBedVolumes();

    if (useDual) {
      const dual = dualRef.current;
      if (!dual) return;
      if (!keepPlaying) dual.pause();
      dual.seek(t);
      syncSoundscapeToVoice(t);
      setCurrent(t);
      reportTime(t);
      if (!keepPlaying) return;
      clearVoiceIntro();
      if (shouldDelayVoice(t)) {
        dual.pause();
        startOrResumePlayback();
      } else if (!dual.isPlaying) {
        void dual.play().catch(() => {});
      }
      return;
    }

    const el = audioRef.current;
    if (!el) return;
    const voiceEnd =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : t;
    try {
      el.currentTime = Math.min(t, voiceEnd);
    } catch {
      /* ignore seek before metadata */
    }
    syncSoundscapeToVoice(t);
    setCurrent(t);
    reportTime(t);
    if (!keepPlaying) return;
    clearVoiceIntro();
    if (shouldDelayVoice(t)) {
      el.pause();
      startOrResumePlayback();
    } else if (el.paused) {
      void el.play().catch(() => {});
    }
  }

  function voiceIntroSeconds(): number {
    const n = track?.leadInSeconds;
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) return n;
    return BED_VOICE_INTRO_SECONDS;
  }

  function shouldDelayVoice(atSeconds: number): boolean {
    return trackHasLiveBeds() && voiceIntroSeconds() > 0 && atSeconds < 0.08;
  }

  function startOrResumePlayback() {
    if (!track) return;
    const parked = outroParkedOffsetRef.current;
    if (parked != null && outroPadSeconds() > 0) {
      outroParkedOffsetRef.current = null;
      beginBedOutro(parked);
      return;
    }
    outroParkedOffsetRef.current = null;
    bedOutroGainRef.current = 1;
    clearBedOutro();
    applyLiveBedVolumes();
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
          syncSoundscapeToVoice(0);
          void dual.play().catch(() => {
            setPlaying(false);
            onPlayingChange?.(track.s3Key, false);
          });
        }, voiceIntroSeconds() * 1000);
        return;
      }
      syncSoundscapeToVoice(dual.currentTime);
      void dual.play().catch(() => {
        setPlaying(false);
        onPlayingChange?.(track.s3Key, false);
      });
      return;
    }
    const el = audioRef.current;
    if (!el) return;
    if (ambientSoundscape) {
      applyAmbientSoundscapeVolume();
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
        // Align composition to voice start after the bed-only intro.
        syncSoundscapeToVoice(0);
        void el.play().catch(() => {});
      }, voiceIntroSeconds() * 1000);
      return;
    }
    syncSoundscapeToVoice(el.currentTime);
    void el.play().catch(() => {});
  }

  function pausePlayback() {
    if (bedOutroRef.current.active) {
      const into =
        (performance.now() - bedOutroRef.current.originMs) / 1000;
      outroParkedOffsetRef.current = Math.max(0, into);
    }
    clearVoiceIntro();
    clearBedOutro();
    applyLiveBedVolumes();
    // Always pause voice — beds follow `playing` via syncGaplessBed. Skipping
    // dual/audio when ambientMix left live-mix voice running after pause.
    audioRef.current?.pause();
    dualRef.current?.pause();
    if (track) onPlayingChange?.(track.s3Key, false);
    setPlaying(false);
  }

  /** Bed/voice elements only — used by playbackToggleNonce from the provider. */
  function togglePlaybackInternal() {
    if (ambientMix) {
      if (playing) pausePlayback();
      else startOrResumePlayback();
      return;
    }
    // Prefer audible/transport reality over React state so pause always stops
    // voice that raced ahead of beds (or desynced after async start).
    const voiceAudible =
      playing ||
      voiceIntroTimerRef.current != null ||
      Boolean(useDual && dualRef.current?.isPlaying) ||
      Boolean(
        !useDual &&
          audioRef.current &&
          !audioRef.current.paused &&
          !audioRef.current.ended,
      );
    if (voiceAudible) pausePlayback();
    else startOrResumePlayback();
  }

  /** Strip play button — Create · Sound may override to joint voice+beds transport. */
  function togglePlayback() {
    if (onExternalTransportToggle) {
      onExternalTransportToggle();
      return;
    }
    togglePlaybackInternal();
  }

  const stripPlaying =
    typeof externalPlaying === "boolean" ? externalPlaying : playing;

  useEffect(() => {
    liveBedGainsRef.current = {
      nature: track?.natureGain ?? 0,
      music: track?.musicGain ?? 0,
      drums: track?.drumsGain ?? 0,
      noise: track?.noiseGain ?? 0,
    };
    applyAmbientSoundscapeVolume();
  }, [track?.natureGain, track?.musicGain, track?.drumsGain, track?.noiseGain]);

  useEffect(() => {
    if (!bedVolumeApiRef) return;
    bedVolumeApiRef.current = {
      setBedVolume(channel, gain) {
        liveBedGainsRef.current[channel] = gain;
        if (ambientSoundscapeRef.current && channel === "music") {
          applyAmbientSoundscapeVolume();
          return;
        }
        const el =
          channel === "nature"
            ? natureRef.current
            : channel === "music"
              ? musicRef.current
              : channel === "drums"
                ? drumsRef.current
                : noiseRef.current;
        setGaplessBedVolume(el, bedChannelVolume(channel, gain));
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
      clearBedOutro();
      for (const ref of beds) releaseGaplessBed(ref.current);
    };
  }, []);

  useEffect(() => {
    setDualFailed(false);
  }, [track?.s3Key]);

  useEffect(() => {
    if (!track) {
      clearVoiceIntro();
      clearBedOutro();
      dualRef.current?.stop();
      return;
    }
    bedOutroGainRef.current = 1;
    outroParkedOffsetRef.current = null;
    clearBedOutro();
    seekingRef.current = false;
    lastReportedTimeRef.current = -Infinity;
    const shouldPlay = autoplayRef.current;
    if (ambientMix) {
      setCurrent(0);
      setDuration(0);
      if (shouldPlay) startOrResumePlayback();
      else {
        setPlaying(false);
        onPlayingChange?.(track.s3Key, false);
      }
      return () => {
        clearVoiceIntro();
      };
    }
    if (useDual && track.dryUrl) {
      let cancelled = false;
      const dual = dualRef.current;
      dual.onEnded = () => {
        if (cancelled) return;
        beginBedOutro(0, { seekSoundscape: false });
      };
      if (track.durationSeconds) setDuration(track.durationSeconds);
      if (dual.isPlaying) {
        if (!shouldPlay) {
          dual.pause();
          setPlaying(false);
          onPlayingChange?.(track.s3Key, false);
        } else if (
          trackHasLiveBeds() &&
          shouldDelayVoice(0) &&
          dual.currentTime < 0.5
        ) {
          // Voice raced ahead of beds (gesture start before strip mount).
          // Reset so lead-in + beds start together.
          dual.pause();
          dual.seek(0);
          startOrResumePlayback();
        } else {
          setPlaying(true);
          onPlayingChange?.(track.s3Key, true);
        }
        void dual.whenDuration().then((d) => {
          if (!cancelled && d > 0) setDuration(d);
        });
        return () => {
          cancelled = true;
          dual.onEnded = null;
        };
      }
      void dual
        .load(track.dryUrl, track.wetUrl ?? null, voiceFxDial, track.url)
        .then(() => {
          if (cancelled) return;
          if (autoplayRef.current) {
            startOrResumePlayback();
          } else {
            setPlaying(false);
            onPlayingChange?.(track.s3Key, false);
          }
          void dual.whenDuration().then((d) => {
            if (!cancelled && d > 0) setDuration(d);
          });
        })
        .catch(() => {
          if (cancelled) return;
          setDualFailed(true);
          setPlaying(false);
          onPlayingChange?.(track.s3Key, false);
        });
      return () => {
        cancelled = true;
        dual.onEnded = null;
      };
    }
    dualRef.current?.stop();
    const el = audioRef.current;
    if (!el) return;
    if (ambientSoundscape) {
      applyAmbientSoundscapeVolume();
      if (shouldPlay) startOrResumePlayback();
      else {
        el.pause();
        setPlaying(false);
        onPlayingChange?.(track.s3Key, false);
      }
      return () => {
        clearVoiceIntro();
      };
    }
    el.load();
    applySpeechElementVolume(el);
    if (shouldPlay) startOrResumePlayback();
    else {
      el.pause();
      setPlaying(false);
      onPlayingChange?.(track.s3Key, false);
    }
    return () => {
      clearVoiceIntro();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart when the stem changes; autoplay via ref (HMR-safe)
  }, [track?.s3Key, track?.url, track?.ambientKind, track?.dryUrl, track?.wetUrl, useDual]);

  useEffect(() => {
    if (!useDual) return;
    dualRef.current?.setDial(track?.voiceFxDial ?? 100);
  }, [track?.voiceFxDial, useDual]);

  useEffect(() => {
    return () => {
      dualRef.current.onEnded = null;
    };
  }, []);

  useEffect(() => {
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
      const volume = bedChannelVolume(
        bed.channel,
        liveBedGainsRef.current[bed.channel],
      );
      if (!mediaBase || !bed.key.trim()) {
        syncGaplessBed(el, { url: null, volume, playing: false });
        continue;
      }
      syncGaplessBed(el, {
        url: mediaFileUrl(
          mediaBase,
          backgroundAudioPlaybackKey(bed.key),
          track?.mediaCacheBust,
        ),
        fallbackUrl: null,
        volume,
        playing,
        leadSec: ambientMix ? 0.4 : undefined,
        leadTimeoutMs: ambientMix ? 2000 : undefined,
        onPlaybackBlocked:
          ambientMix || track?.liveMix
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
    track?.mediaCacheBust,
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
    // Always drive strip elements — never the Create · Sound external bridge
    // (that bridge itself calls toggleCurrent → this nonce).
    togglePlaybackInternal();
  }, [playbackToggleNonce, track]);

  useEffect(() => {
    if (useDual) return;
    const el = audioRef.current;
    if (!el || !track || ambientMix) return;

    const onTime = () => {
      if (
        seekingRef.current ||
        bedOutroRef.current.active ||
        outroParkedOffsetRef.current != null
      ) {
        return;
      }
      const t = el.currentTime;
      setCurrent(t);
      reportTime(t);
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
      // Voice pause at the end of narration is the start of the bed tail.
      if (bedOutroRef.current.active || outroParkedOffsetRef.current != null) {
        return;
      }
      setPlaying(false);
      onPlayingChange?.(track.s3Key, false);
    };
    const onEnded = () => {
      // Live beds: hold then fade. Focus soundscapes / no beds: dismiss (or keep strip).
      beginBedOutro(0, { seekSoundscape: false });
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
      if (
        dual &&
        !seekingRef.current &&
        !bedOutroRef.current.active &&
        outroParkedOffsetRef.current == null
      ) {
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
    if (!track) onHeightChange?.(0);
  }, [track, onHeightChange]);

  if (!track) return null;

  const outroPad =
    !ambientMix &&
    !ambientSoundscape &&
    track.fadeOut !== false &&
    trackHasLiveBeds() &&
    duration > 0
      ? BED_OUTRO_HOLD_SECONDS + BED_OUTRO_FADE_SECONDS
      : 0;
  const timelineDuration = duration + outroPad;
  /** Looping ambient mixes have no timeline; meditations and soundscapes scrub. */
  const canSeekTransport = !ambientMix;

  function skipSeconds(delta: number) {
    if (!canSeekTransport) return;
    seekTransport(current + delta);
  }

  return (
    <PlayerStripView
      track={track}
      playing={stripPlaying}
      current={current}
      timelineDuration={timelineDuration}
      canSeek={canSeekTransport}
      onTogglePlay={togglePlayback}
      onSkip={skipSeconds}
      onSeek={seekTransport}
      onScrubStart={() => {
        seekingRef.current = true;
      }}
      onScrubEnd={() => {
        seekingRef.current = false;
      }}
      onClose={() => {
        pausePlayback();
        onDismiss();
      }}
      onReflect={onReflect}
      reflectActive={reflectActive}
      onHeightChange={onHeightChange}
      besideSidebar={besideSidebar}
      bottomOffsetPx={bottomOffsetPx}
      placement={placement}
      hiddenMedia={
        <>
          {ambientMix || useDual ? null : (
            <audio
              key={`${track.s3Key}:${voiceUrl}`}
              ref={audioRef}
              src={voiceUrl}
              preload="metadata"
              className="hidden"
              onError={(e) => {
                const el = e.currentTarget;
                const mp3 = voiceUrl.replace(/\.m4a(\?|$)/i, ".mp3$1");
                if (mp3 && mp3 !== el.src && !el.dataset.aacFallback) {
                  el.dataset.aacFallback = "1";
                  el.src = mp3;
                }
              }}
            />
          )}
          {/* Looping is scheduled by syncGaplessBed, so these must not set `loop`. */}
          <audio ref={natureRef} className="hidden" playsInline />
          <audio ref={musicRef} className="hidden" playsInline />
          <audio ref={drumsRef} className="hidden" playsInline />
          <audio ref={noiseRef} className="hidden" playsInline />
        </>
      }
    />
  );
}


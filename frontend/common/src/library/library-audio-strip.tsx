
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
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
import { CoverArtThumb } from "./cover-art-thumb";
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

/** Optional strip subtitle — mixes / voice samples only (not soundscapes). */
function playerStripSubtitle(track: LibraryActiveTrack): string | null {
  if (track.s3Key.startsWith("create:sound:voice:")) return "Voice sample";
  if (track.s3Key === "create:sound:mix" || track.ambientKind === "mix") {
    return "Your mix";
  }
  return null;
}

function PlayerStripWaveformIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
    </svg>
  );
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
  const inline = placement === "inline";
  const rootRef = useRef<HTMLDivElement>(null);
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

  /** Desktop app chrome: size the strip to the main column, not the viewport. */
  const [contentColumnLayout, setContentColumnLayout] = useState(false);
  useEffect(() => {
    if (!besideSidebar || inline) {
      setContentColumnLayout(false);
      return;
    }
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setContentColumnLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [besideSidebar, inline]);

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

  const outroPad =
    !ambientMix &&
    !ambientSoundscape &&
    track.fadeOut !== false &&
    trackHasLiveBeds() &&
    duration > 0
      ? BED_OUTRO_HOLD_SECONDS + BED_OUTRO_FADE_SECONDS
      : 0;
  const timelineDuration = duration + outroPad;
  const max = Math.max(timelineDuration, 0.0001);
  /** Looping ambient mixes have no timeline; meditations and soundscapes scrub. */
  const canSeekTransport = !ambientMix;

  function skipSeconds(delta: number) {
    if (!canSeekTransport) return;
    seekTransport(current + delta);
  }

  const coverUrl =
    typeof track.coverImageUrl === "string" ? track.coverImageUrl.trim() : "";
  const stripSubtitle = playerStripSubtitle(track);
  /** Match PlayerStrip mockup ivory — hard colors so Tailwind/theme remaps can't kill contrast. */
  const ivory = "#F3EDE2";
  const ivory60 = "rgba(243,237,226,0.6)";
  const ivory55 = "rgba(243,237,226,0.55)";
  const ivory18 = "rgba(243,237,226,0.18)";
  const ivory10 = "rgba(243,237,226,0.10)";
  const stripBorder = "rgba(243,237,226,0.22)";
  const stripStyle = {
    height: track.speakerName ? 88 : 76,
    boxSizing: "border-box",
    color: ivory,
    backgroundImage:
      "linear-gradient(90deg, var(--player-surface-start, #2a3c5a) 0%, var(--deep, #0f1b2d) 100%)",
    border: `1px solid ${stripBorder}`,
    boxShadow:
      "0 10px 30px color-mix(in srgb, var(--deep, #0f1b2d) 25%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.14)",
    padding: "10px 24px 10px 10px",
    display: "flex",
    alignItems: "center",
    gap: 16,
  } as CSSProperties;
  const outlineBtnStyle = {
    width: 36,
    height: 36,
    borderRadius: 9999,
    border: `1.5px solid ${ivory55}`,
    boxSizing: "border-box",
    background: "transparent",
    color: ivory,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: "pointer",
    padding: 0,
  } as CSSProperties;
  const playBtnStyle = {
    width: 44,
    height: 44,
    borderRadius: 9999,
    boxSizing: "border-box",
    backgroundColor: "var(--accent-button, #c3d2e8)",
    backgroundImage: "var(--accent-gradient-button)",
    border: "1px solid color-mix(in srgb, var(--accent-button, #c3d2e8) 72%, #6b7f9a)",
    color: "var(--on-accent, #0f1b2d)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    cursor: "pointer",
    padding: 0,
  } as CSSProperties;
  const mutedTextStyle = {
    color: ivory60,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1,
  } as CSSProperties;
  const scrubPct = canSeekTransport
    ? Math.min(100, Math.max(0, (Math.min(current, max) / max) * 100))
    : 50;
  const scrubTrackBg = `linear-gradient(to right, var(--accent, #c8a46a) 0%, var(--accent, #c8a46a) ${scrubPct}%, ${ivory18} ${scrubPct}%, ${ivory18} 100%)`;

  return (
    <div
      ref={rootRef}
      className={
        // Match the page column: left-aligned max-w-6xl in the main area.
        // The column does not center in the leftover viewport (flex + max-width),
        // so a viewport-wide w-full pill with a sidebar left inset hangs off the right.
        // Sidebar inset must match AppChrome spacer (`lg:block`), not `md`.
        inline
          ? "pointer-events-none relative z-50 mx-auto w-full max-w-6xl px-4 pb-3 pt-2 md:px-6"
          : `pointer-events-none fixed z-50 left-0 w-full max-w-6xl px-4 pt-3 md:px-6 ${
              besideSidebar ? "lg:left-[var(--app-sidebar-w,200px)]" : ""
            }`
      }
      style={
        inline
          ? undefined
          : {
              bottom: Math.max(0, bottomOffsetPx),
              ...(contentColumnLayout
                ? {
                    width: `min(72rem, calc(100% - var(--app-sidebar-w, 200px) - ${Math.max(0, focusTasksInsetPx)}px))`,
                    maxWidth: "none",
                  }
                : {}),
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }
      }
    >
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

      <div
        className="pointer-events-auto w-full min-w-0 rounded-full"
        style={stripStyle}
        role="region"
        aria-label="Now playing"
      >
        {coverUrl ? (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 9999,
              flexShrink: 0,
              overflow: "hidden",
              border: `1px solid ${stripBorder}`,
              boxSizing: "border-box",
            }}
          >
            <CoverArtThumb
              src={coverUrl}
              alt=""
              edgePx={54}
              className="!rounded-full"
            />
          </div>
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 9999,
              flexShrink: 0,
              background: ivory10,
              border: `1px solid ${stripBorder}`,
              boxSizing: "border-box",
              color: "var(--accent, #c8a46a)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-hidden
          >
            <PlayerStripWaveformIcon />
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {canSeekTransport ? (
            <button
              type="button"
              onClick={() => skipSeconds(-10)}
              style={outlineBtnStyle}
              aria-label="Back 10 seconds"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = ivory;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = ivory55;
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
                <path d="M11 6v12L3 12zM20 6v12l-8-6z" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => togglePlayback()}
            style={playBtnStyle}
            aria-label={stripPlaying ? "Pause" : "Play"}
          >
            {stripPlaying ? (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>
          {canSeekTransport ? (
            <button
              type="button"
              onClick={() => skipSeconds(10)}
              style={outlineBtnStyle}
              aria-label="Forward 10 seconds"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = ivory;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = ivory55;
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
                <path d="M13 6v12l8-6zM4 6v12l8-6z" />
              </svg>
            </button>
          ) : null}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "center",
                gap: 10,
                minWidth: 0,
                maxWidth: "100%",
              }}
            >
              <p
                className="font-display"
                style={{
                  margin: 0,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 19,
                  lineHeight: 1.15,
                  color: ivory,
                }}
              >
                {track.title}
              </p>
              {stripSubtitle ? (
                <span style={{ ...mutedTextStyle, flexShrink: 0, fontVariantNumeric: undefined }}>
                  {stripSubtitle}
                </span>
              ) : null}
            </div>
            {track.speakerName ? (
              <p
                className="font-sans"
                style={{
                  margin: 0,
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 12,
                  fontWeight: 400,
                  lineHeight: 1.2,
                  color: ivory60,
                }}
              >
                {track.speakerName}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ ...mutedTextStyle, width: 40, flexShrink: 0 }}>
              {canSeekTransport ? formatAudioClock(current) : ""}
            </span>
            <input
              type="range"
              className={`library-strip-scrubber min-w-0 flex-1 ${
                canSeekTransport
                  ? "cursor-pointer"
                  : "pointer-events-none cursor-default opacity-50"
              }`}
              style={{ background: scrubTrackBg }}
              min={0}
              max={max}
              step={0.05}
              value={canSeekTransport ? Math.min(current, max) : max / 2}
              disabled={!canSeekTransport}
              aria-label={canSeekTransport ? "Seek" : "Seek unavailable"}
              onMouseDown={() => {
                if (!canSeekTransport) return;
                seekingRef.current = true;
              }}
              onMouseUp={() => {
                seekingRef.current = false;
              }}
              onMouseLeave={() => {
                seekingRef.current = false;
              }}
              onTouchStart={() => {
                if (!canSeekTransport) return;
                seekingRef.current = true;
              }}
              onTouchEnd={() => {
                seekingRef.current = false;
              }}
              onChange={(e) => {
                if (!canSeekTransport) return;
                const v = Number(e.target.value);
                if (!Number.isFinite(v)) return;
                seekTransport(v);
              }}
            />
            <span
              style={{
                ...mutedTextStyle,
                width: 40,
                flexShrink: 0,
                textAlign: "right",
              }}
            >
              {canSeekTransport ? formatAudioClock(timelineDuration) : ""}
            </span>
          </div>
        </div>

        {onReflect ? (
          <button
            type="button"
            onClick={onReflect}
            aria-label="Reflect on this meditation"
            aria-pressed={reflectActive}
            className="library-strip-reflect"
            style={{
              flexShrink: 0,
              height: 36,
              padding: "0 14px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 999,
              border: reflectActive
                ? "1.5px solid rgba(232, 196, 140, 0.85)"
                : "1.5px solid rgba(243, 237, 226, 0.55)",
              background: reflectActive
                ? "rgba(232, 196, 140, 0.18)"
                : "transparent",
              color: ivory,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "inherit",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span className="hidden sm:inline">Reflect</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => {
            pausePlayback();
            onDismiss();
          }}
          style={{
            flexShrink: 0,
            paddingLeft: 4,
            border: "none",
            background: "transparent",
            color: ivory60,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Close player"
          onMouseEnter={(e) => {
            e.currentTarget.style.color = ivory;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = ivory60;
          }}
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
  );
}


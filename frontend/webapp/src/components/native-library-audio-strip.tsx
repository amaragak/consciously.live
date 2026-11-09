/**
 * Capacitor strip: same chrome as the web strip, but playback runs in the
 * native audio plugin so it survives lock / background / silent switch and
 * shows on the lock screen. Loaded only in native builds.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import {
  BED_OUTRO_FADE_SECONDS,
  BED_OUTRO_HOLD_SECONDS,
  BED_VOICE_INTRO_SECONDS,
  PlayerStripView,
  SPEECH_ELEMENT_VOLUME,
  backgroundAudioPlaybackKey,
  bedElementVolume,
  isMelodicMusicKey,
  isSoundscapeKey,
  mediaFileUrl,
  soundscapeListenVolume,
  type BackgroundAudioItem,
  type BedVolumeChannel,
  type LibraryActiveTrack,
  type LibraryBedVolumeApi,
} from "@consciously/common";
import { setNativeSeekImpl } from "@/lib/native/native-bridge";
import { nativeAudioLog } from "@/lib/native/native-audio-log";
import { NativeMixSession, type NativeBedSpec, type NativeMixSpec } from "@/lib/native/native-mix-session";
import { nativeRuntimeFileUri, nowPlayingArtwork } from "@/lib/native/native-runtime-files";
import { offlineAudioUri } from "@/lib/native/offline-audio";

const NOW_PLAYING_ARTIST = "Consciously";
const CHANNELS: BedVolumeChannel[] = ["nature", "music", "drums", "noise"];

type Phase = "idle" | "leadIn" | "voice" | "outro";

type Props = {
  track: LibraryActiveTrack;
  musicItems: BackgroundAudioItem[];
  compositionItems: BackgroundAudioItem[];
  mediaBase: string | null;
  onDismiss: () => void;
  playbackToggleNonce: number;
  bedVolumeApiRef?: MutableRefObject<LibraryBedVolumeApi | null>;
  onPlayingChange?: (s3Key: string, playing: boolean) => void;
  onPlaybackTimeChange?: (s3Key: string, timeSeconds: number) => void;
  onHeightChange?: (heightPx: number) => void;
  autoplay?: boolean;
  placement?: "fixed" | "inline";
  bottomOffsetPx?: number;
  besideSidebar?: boolean;
  onReflect?: (() => void) | null;
  reflectActive?: boolean;
};

function bedKeys(
  track: LibraryActiveTrack,
  musicItems: BackgroundAudioItem[],
): Record<BedVolumeChannel, string> {
  if (!track.liveMix) return { nature: "", music: "", drums: "", noise: "" };
  const music = (track.musicKey ?? "").trim();
  return {
    nature: (track.natureKey ?? "").trim(),
    music,
    drums: isMelodicMusicKey(musicItems, music) ? "" : (track.drumsKey ?? "").trim(),
    noise: (track.noiseKey ?? "").trim(),
  };
}

function bedGain(track: LibraryActiveTrack, channel: BedVolumeChannel): number {
  const g =
    channel === "nature"
      ? track.natureGain
      : channel === "music"
        ? track.musicGain
        : channel === "drums"
          ? track.drumsGain
          : track.noiseGain;
  return g ?? 0;
}

export default function NativeLibraryAudioStrip({
  track,
  musicItems,
  compositionItems,
  mediaBase,
  onDismiss,
  playbackToggleNonce,
  bedVolumeApiRef,
  onPlayingChange,
  onPlaybackTimeChange,
  onHeightChange,
  autoplay = false,
  placement = "fixed",
  bottomOffsetPx = 0,
  besideSidebar = false,
  onReflect = null,
  reflectActive = false,
}: Props) {
  const ambientMix = track.ambientOnly === true && track.ambientKind === "mix";
  const ambientSoundscape = track.ambientOnly === true && track.ambientKind === "soundscape";
  const soundscapeBed = track.liveMix === true && isSoundscapeKey(compositionItems, track.musicKey);
  const keys = bedKeys(track, musicItems);
  const hasBeds = !ambientSoundscape && CHANNELS.some((c) => keys[c]);
  const outroPadSeconds =
    !ambientMix && !ambientSoundscape && hasBeds && track.fadeOut !== false
      ? BED_OUTRO_HOLD_SECONDS + BED_OUTRO_FADE_SECONDS
      : 0;
  const leadInSeconds =
    typeof track.leadInSeconds === "number" && Number.isFinite(track.leadInSeconds) && track.leadInSeconds >= 0
      ? track.leadInSeconds
      : BED_VOICE_INTRO_SECONDS;

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(() => track.durationSeconds ?? 0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const sessionRef = useRef<NativeMixSession | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const seekingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const leadInTimerRef = useRef<number | null>(null);
  const outroTimerRef = useRef<number | null>(null);
  const outroStartMsRef = useRef(0);
  const lastReportedRef = useRef(-Infinity);
  const gainsRef = useRef<Record<BedVolumeChannel, number>>({
    nature: bedGain(track, "nature"),
    music: bedGain(track, "music"),
    drums: bedGain(track, "drums"),
    noise: bedGain(track, "noise"),
  });
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onTimeRef = useRef(onPlaybackTimeChange);
  onTimeRef.current = onPlaybackTimeChange;
  // Same as the web strip: the mount-time paused report was clearing autoplay
  // before the native session could start.
  const skipInitialPauseReport = useRef(Boolean(autoplay));

  useLayoutEffect(() => {
    if (skipInitialPauseReport.current && !playing) return;
    skipInitialPauseReport.current = false;
    onPlayingChange?.(track.s3Key, playing);
  }, [track.s3Key, playing, onPlayingChange]);

  const reportTime = useCallback(
    (t: number) => {
      setCurrent(t);
      if (Math.abs(t - lastReportedRef.current) < 0.25) return;
      lastReportedRef.current = t;
      onTimeRef.current?.(track.s3Key, t);
    },
    [track.s3Key],
  );

  function clearLeadIn() {
    if (leadInTimerRef.current != null) {
      window.clearTimeout(leadInTimerRef.current);
      leadInTimerRef.current = null;
    }
  }

  function clearOutro() {
    if (outroTimerRef.current != null) {
      window.clearTimeout(outroTimerRef.current);
      outroTimerRef.current = null;
    }
  }

  function finish() {
    clearLeadIn();
    clearOutro();
    phaseRef.current = "idle";
    setPlaying(false);
    if (ambientSoundscape) {
      reportTime(0);
      return;
    }
    onDismissRef.current();
  }

  function handleVoiceEnd() {
    clearLeadIn();
    const voiceLen = durationRef.current;
    if (outroPadSeconds <= 0) {
      finish();
      return;
    }
    // Native side already holds then fades the beds; mirror it on the timeline.
    phaseRef.current = "outro";
    outroStartMsRef.current = Date.now();
    reportTime(voiceLen);
    clearOutro();
    outroTimerRef.current = window.setTimeout(finish, outroPadSeconds * 1000);
  }

  async function start() {
    const session = sessionRef.current;
    if (!session) return;
    clearLeadIn();
    setPlaying(true);
    try {
      if (ambientMix || ambientSoundscape) {
        phaseRef.current = "voice";
        await session.play();
        return;
      }
      const at = await session.currentTime();
      if (session.hasBeds && leadInSeconds > 0 && at < 0.08) {
        phaseRef.current = "leadIn";
        await session.playBedsOnly();
        leadInTimerRef.current = window.setTimeout(() => {
          leadInTimerRef.current = null;
          if (phaseRef.current !== "leadIn") return;
          phaseRef.current = "voice";
          void session.play({ restartSoundscape: true });
        }, leadInSeconds * 1000);
        return;
      }
      phaseRef.current = "voice";
      await session.play();
    } catch (e) {
      nativeAudioLog("error", `play failed: ${e instanceof Error ? e.message : String(e)}`);
      setPlaying(false);
    }
  }

  async function pause() {
    clearLeadIn();
    if (phaseRef.current === "outro") {
      // Voice is over; pausing the tail just ends the session.
      finish();
      return;
    }
    phaseRef.current = "idle";
    setPlaying(false);
    await sessionRef.current?.pause().catch(() => {});
  }

  function toggle() {
    if (playing) void pause();
    else void start();
  }

  async function seek(v: number) {
    const session = sessionRef.current;
    if (!session || ambientMix) return;
    const voiceLen = durationRef.current;
    const t = Math.max(0, voiceLen > 0 ? Math.min(v, voiceLen - 0.5) : v);
    reportTime(t);
    if (phaseRef.current === "outro") {
      clearOutro();
      phaseRef.current = "voice";
      await session.seek(t);
      await session.play();
      return;
    }
    if (phaseRef.current === "leadIn") {
      clearLeadIn();
      phaseRef.current = "voice";
      await session.seek(t);
      await session.play();
      return;
    }
    await session.seek(t);
  }

  const seekRef = useRef(seek);
  seekRef.current = seek;
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  const startRef = useRef(start);
  startRef.current = start;

  // Build + own the native session for this track.
  useEffect(() => {
    let cancelled = false;
    let created: NativeMixSession | null = null;

    void (async () => {
      const beds: NativeBedSpec[] = [];
      if (!ambientSoundscape && mediaBase) {
        for (const channel of CHANNELS) {
          const key = keys[channel];
          if (!key) continue;
          const isSoundscape = channel === "music" && soundscapeBed;
          beds.push({
            channel,
            url: mediaFileUrl(mediaBase, backgroundAudioPlaybackKey(key), track.mediaCacheBust),
            volume: isSoundscape
              ? soundscapeListenVolume(gainsRef.current.music)
              : bedElementVolume(gainsRef.current[channel]),
            loop: !isSoundscape,
            followSeek: isSoundscape,
          });
        }
      }

      let primaryUrl = track.url;
      if (ambientMix) {
        primaryUrl = await nativeRuntimeFileUri("silence.m4a");
      } else {
        const local = await offlineAudioUri(track.url).catch(() => null);
        if (local) {
          primaryUrl = local;
          nativeAudioLog("session", "using downloaded copy");
        }
      }

      const spec: NativeMixSpec = {
        primary: {
          url: primaryUrl,
          volume: ambientSoundscape ? soundscapeListenVolume(gainsRef.current.music) : SPEECH_ELEMENT_VOLUME,
          loop: ambientMix,
          seekable: !ambientMix,
          title: track.title,
          artist: NOW_PLAYING_ARTIST,
          artwork: await nowPlayingArtwork(track.coverImageUrl),
        },
        beds,
        outroHoldSeconds: outroPadSeconds > 0 ? BED_OUTRO_HOLD_SECONDS : 0,
        outroFadeSeconds: outroPadSeconds > 0 ? BED_OUTRO_FADE_SECONDS : 0,
      };
      if (cancelled) return;

      created = await NativeMixSession.create(spec, {
        onStatus: (status) => {
          if (cancelled) return;
          if (status === "playing") {
            if (phaseRef.current !== "outro") phaseRef.current = "voice";
            setPlaying(true);
          } else if (status === "paused") {
            // Lock screen / Control Centre / interruption pause.
            if (phaseRef.current === "voice") {
              phaseRef.current = "idle";
              setPlaying(false);
            }
          }
        },
        onEnd: () => {
          if (!cancelled) handleVoiceEnd();
        },
      });
      if (cancelled) {
        void created.destroy();
        return;
      }
      sessionRef.current = created;
      if (!ambientMix) {
        const d = await created.duration().catch(() => 0);
        if (!cancelled && d > 0) setDuration(d);
      }
      if (autoplayRef.current) void startRef.current();
    })().catch(() => {
      if (!cancelled) setPlaying(false);
    });

    return () => {
      cancelled = true;
      clearLeadIn();
      clearOutro();
      phaseRef.current = "idle";
      sessionRef.current = null;
      void created?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one native session per track
  }, [track.s3Key, track.url, mediaBase]);

  // Timeline: poll the native clock while visible (JS is suspended in the background).
  useEffect(() => {
    if (ambientMix) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible" || seekingRef.current) return;
      const phase = phaseRef.current;
      if (phase === "outro") {
        const into = (Date.now() - outroStartMsRef.current) / 1000;
        reportTime(durationRef.current + Math.min(outroPadSeconds, into));
        return;
      }
      if (phase === "leadIn") return;
      const session = sessionRef.current;
      if (!session) return;
      void session.currentTime().then((t) => {
        if (phaseRef.current === phase && !seekingRef.current) reportTime(t);
      }, () => {});
      if (durationRef.current <= 0) {
        void session.duration().then((d) => {
          if (d > 0) setDuration(d);
        }, () => {});
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [ambientMix, outroPadSeconds, reportTime]);

  // Returning from background: re-read play state the web view missed.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const session = sessionRef.current;
      if (!session || phaseRef.current === "outro" || phaseRef.current === "leadIn") return;
      void session.isPlaying().then((p) => {
        phaseRef.current = p ? "voice" : "idle";
        setPlaying(p);
      }, () => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const lastNonceRef = useRef(playbackToggleNonce);
  useEffect(() => {
    if (playbackToggleNonce === lastNonceRef.current) return;
    lastNonceRef.current = playbackToggleNonce;
    toggleRef.current();
  }, [playbackToggleNonce]);

  useEffect(() => {
    setNativeSeekImpl((t) => void seekRef.current(t));
    return () => setNativeSeekImpl(null);
  }, []);

  useEffect(() => {
    if (!bedVolumeApiRef) return;
    bedVolumeApiRef.current = {
      setBedVolume(channel, gain) {
        gainsRef.current[channel] = gain;
        const session = sessionRef.current;
        if (!session) return;
        if (ambientSoundscape) {
          if (channel === "music") void session.setPrimaryVolume(soundscapeListenVolume(gain));
          return;
        }
        const volume =
          channel === "music" && soundscapeBed ? soundscapeListenVolume(gain) : bedElementVolume(gain);
        void session.setBedVolume(channel, volume);
      },
      setVoiceFxDial() {
        /* Native plays the baked voice; the FX dial is web-only. */
      },
    };
    return () => {
      bedVolumeApiRef.current = null;
    };
  }, [bedVolumeApiRef, ambientSoundscape, soundscapeBed]);

  return (
    <PlayerStripView
      track={track}
      playing={playing}
      current={current}
      timelineDuration={duration + (duration > 0 ? outroPadSeconds : 0)}
      canSeek={!ambientMix}
      onTogglePlay={toggle}
      onSkip={(delta) => void seek(current + delta)}
      onSeek={(v) => {
        // While dragging, move the thumb only; one native seek on release.
        if (seekingRef.current) {
          pendingSeekRef.current = v;
          setCurrent(v);
          return;
        }
        void seek(v);
      }}
      onScrubStart={() => {
        seekingRef.current = true;
      }}
      onScrubEnd={() => {
        seekingRef.current = false;
        const v = pendingSeekRef.current;
        pendingSeekRef.current = null;
        if (v != null) void seek(v);
      }}
      onClose={() => {
        void pause();
        onDismiss();
      }}
      onReflect={onReflect}
      reflectActive={reflectActive}
      onHeightChange={onHeightChange}
      besideSidebar={besideSidebar}
      bottomOffsetPx={bottomOffsetPx}
      placement={placement}
    />
  );
}

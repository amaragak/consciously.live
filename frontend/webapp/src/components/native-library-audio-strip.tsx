/**
 * Capacitor strip: same chrome as the web strip, but playback runs in the
 * native audio plugin so it survives lock / background / silent switch and
 * shows on the lock screen. Loaded only in native builds.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import {
  BED_OUTRO_FADE_SECONDS,
  BED_OUTRO_HOLD_SECONDS,
  DEFAULT_MEDITATION_LEAD_IN_SECONDS,
  PlayerStripView,
  SPEECH_ELEMENT_VOLUME,
  backgroundAudioPlaybackKey,
  bedElementVolume,
  isMelodicMusicKey,
  isSoundscapeKey,
  mediaFileUrl,
  mediaPlaybackCandidates,
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
import {
  getMeditationDownload,
  getSoundscapeDownload,
} from "@/lib/native/offline-downloads";

const NOW_PLAYING_ARTIST = "Consciously";
const CHANNELS: BedVolumeChannel[] = ["nature", "music", "drums", "noise"];

type Phase = "idle" | "leadIn" | "voice" | "outro";

/** AAC-only playback URLs — never pick leftover catalog `.mp3`. */
async function firstReachablePlaybackUrl(candidates: string[]): Promise<string> {
  const list = candidates.filter(
    (url) => url && !/\.mp3(?=\?|$)/i.test(url),
  );
  if (list.length === 0) return "";
  for (const url of list) {
    if (/^file:/i.test(url) || url.startsWith("capacitor:")) return url;
    try {
      const res = await fetch(url, { method: "HEAD", mode: "cors" });
      if (res.status === 404) continue;
      return url;
    } catch {
      return url;
    }
  }
  return list[0]!;
}

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
  const leadInSeconds = !hasBeds
    ? 0
    : typeof track.leadInSeconds === "number" &&
        Number.isFinite(track.leadInSeconds) &&
        track.leadInSeconds >= 0
      ? track.leadInSeconds
      : DEFAULT_MEDITATION_LEAD_IN_SECONDS;

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const sessionRef = useRef<NativeMixSession | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const seekingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const leadInTimerRef = useRef<number | null>(null);
  const leadInStartedMsRef = useRef(0);
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
    reportTime(leadInSeconds + voiceLen);
    clearOutro();
    outroTimerRef.current = window.setTimeout(finish, outroPadSeconds * 1000);
  }

  function withPlayTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("play timed out")), ms);
      p.then(
        (v) => {
          window.clearTimeout(t);
          resolve(v);
        },
        (e) => {
          window.clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  async function startVoiceAfterLeadIn(session: NativeMixSession) {
    if (phaseRef.current !== "leadIn") return;
    phaseRef.current = "voice";
    try {
      // Plugin can hang (missing source resolves nothing) — don't leave beds orphaned.
      await withPlayTimeout(session.play({ restartSoundscape: true }));
      const t = await session.currentTime().catch(() => 0);
      reportTime(leadInSeconds + t);
    } catch (e) {
      nativeAudioLog(
        "error",
        `voice after lead-in failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      await session.pause().catch(() => {});
      phaseRef.current = "idle";
      setPlaying(false);
    }
  }

  async function start() {
    const session = sessionRef.current;
    if (!session) return;
    clearLeadIn();
    setPlaying(true);
    try {
      if (ambientMix || ambientSoundscape) {
        phaseRef.current = "voice";
        await withPlayTimeout(session.play());
        return;
      }
      const at = await session.currentTime();
      if (session.hasBeds && leadInSeconds > 0 && at < 0.08) {
        phaseRef.current = "leadIn";
        leadInStartedMsRef.current = Date.now();
        reportTime(0);
        await session.playBedsOnly();
        leadInTimerRef.current = window.setTimeout(() => {
          leadInTimerRef.current = null;
          void startVoiceAfterLeadIn(session);
        }, leadInSeconds * 1000);
        return;
      }
      phaseRef.current = "voice";
      await withPlayTimeout(session.play());
    } catch (e) {
      nativeAudioLog("error", `play failed: ${e instanceof Error ? e.message : String(e)}`);
      await session.pause().catch(() => {});
      phaseRef.current = "idle";
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
    const timeline = Math.max(0, v);
    // Scrubber includes lead-in pre-roll; native seek is voice-clock only.
    if (timeline < leadInSeconds - 0.05 && leadInSeconds > 0) {
      reportTime(timeline);
      if (phaseRef.current !== "leadIn") {
        clearOutro();
        clearLeadIn();
        phaseRef.current = "leadIn";
        leadInStartedMsRef.current = Date.now() - timeline * 1000;
        await session.pause().catch(() => {});
        await session.seek(0).catch(() => {});
        await session.playBedsOnly();
        leadInTimerRef.current = window.setTimeout(() => {
          leadInTimerRef.current = null;
          void startVoiceAfterLeadIn(session);
        }, Math.max(0, (leadInSeconds - timeline) * 1000));
      }
      return;
    }
    const voiceT = Math.max(
      0,
      voiceLen > 0
        ? Math.min(timeline - leadInSeconds, voiceLen - 0.5)
        : timeline - leadInSeconds,
    );
    reportTime(leadInSeconds + voiceT);
    if (phaseRef.current === "outro") {
      clearOutro();
      phaseRef.current = "voice";
      await session.seek(voiceT);
      await session.play();
      return;
    }
    if (phaseRef.current === "leadIn") {
      clearLeadIn();
      phaseRef.current = "voice";
      await session.seek(voiceT);
      await session.play();
      return;
    }
    await session.seek(voiceT);
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
      const offlineOnly =
        typeof navigator !== "undefined" && navigator.onLine === false;
      const meditationSaved = getMeditationDownload(track.s3Key);
      const soundscapeSaved = ambientSoundscape
        ? getSoundscapeDownload(track.musicKey ?? track.s3Key)
        : null;
      // Prefer CDN while online unless this item was explicitly downloaded —
      // opportunistic bed cache from other downloads can be incomplete/stale.
      const preferLocal = offlineOnly || Boolean(meditationSaved) || Boolean(soundscapeSaved);

      const beds: NativeBedSpec[] = [];
      if (!ambientSoundscape && mediaBase) {
        for (const channel of CHANNELS) {
          const key = keys[channel];
          if (!key) continue;
          const isSoundscape = channel === "music" && soundscapeBed;
          const remote = mediaFileUrl(
            mediaBase,
            backgroundAudioPlaybackKey(key),
            track.mediaCacheBust,
          );
          const localBed = preferLocal
            ? await offlineAudioUri(remote).catch(() => null)
            : null;
          beds.push({
            channel,
            url: localBed || remote,
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
      } else if (preferLocal) {
        const local = await offlineAudioUri(track.url).catch(() => null);
        if (local) {
          primaryUrl = local;
          nativeAudioLog("session", "using downloaded copy");
        } else {
          primaryUrl = await firstReachablePlaybackUrl(
            mediaPlaybackCandidates(track.url),
          );
        }
      } else {
        // Online: AAC-only candidates.
        primaryUrl = await firstReachablePlaybackUrl(
          mediaPlaybackCandidates(track.url),
        );
      }

      if (
        !ambientMix &&
        typeof track.durationSeconds === "number" &&
        track.durationSeconds > 0
      ) {
        setDuration(track.durationSeconds);
      } else if (!ambientMix) {
        setDuration(0);
      }

      const spec: NativeMixSpec = {
        primary: {
          url: primaryUrl,
          volume: ambientSoundscape
            ? soundscapeListenVolume(gainsRef.current.music)
            : SPEECH_ELEMENT_VOLUME,
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
            // Don't clobber lead-in — beds-only never fires this; voice start
            // sets phase itself before play().
            if (phaseRef.current !== "outro" && phaseRef.current !== "leadIn") {
              phaseRef.current = "voice";
            }
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
    })().catch((e) => {
      nativeAudioLog(
        "error",
        `session setup failed: ${e instanceof Error ? e.message : String(e)}`,
      );
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
        reportTime(
          leadInSeconds + durationRef.current + Math.min(outroPadSeconds, into),
        );
        return;
      }
      if (phase === "leadIn") {
        // Pre-roll on the scrubber so a 20s bed intro doesn't look stuck at 0.
        const into = Math.min(
          leadInSeconds,
          (Date.now() - leadInStartedMsRef.current) / 1000,
        );
        reportTime(into);
        return;
      }
      const session = sessionRef.current;
      if (!session) return;
      void session.currentTime().then((t) => {
        if (phaseRef.current === phase && !seekingRef.current) {
          reportTime(leadInSeconds + t);
        }
      }, () => {});
      if (durationRef.current <= 0) {
        void session.duration().then((d) => {
          if (d > 0) setDuration(d);
        }, () => {});
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [ambientMix, leadInSeconds, outroPadSeconds, reportTime]);

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
      timelineDuration={
        (duration > 0 ? leadInSeconds : 0) +
        duration +
        (duration > 0 ? outroPadSeconds : 0)
      }
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

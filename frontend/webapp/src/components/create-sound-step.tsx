/**
 * Sound step: existing Audio & voice controls (voice, FX, pacing, beds).
 * Used by CreateOneFlow under the "You're making" summary card.
 */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  forwardRef,
} from "react";
import * as Switch from "@radix-ui/react-switch";
import * as Tooltip from "@radix-ui/react-tooltip";
import { VOICE_FX_DIAL_DEFAULT, VoiceFxKnob } from "@consciously/common";
import { AppTopBarTrailingPortal } from "@/components/app-primary-tabs";
import { DrumsLockedWrap } from "@/components/drums-locked-wrap";
import { MixerChannel, MixerPresetChannel } from "@/components/mixer-channel";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import { SoundscapeDevVolumeFader } from "@/components/soundscape-dev-volume-fader";
import { SoundscapePicker } from "@/components/soundscape-picker";
import { VoiceCardRow } from "@/components/voice-card-row";
import { playWithLeadBuffer } from "@/lib/audio-lead-buffer";
import { bedElementVolume, soundscapeListenVolume } from "@/lib/bed-volume";
import {
  CLAUDE_HAIKU_45_MODEL_ID,
  CLAUDE_SONNET_45_MODEL_ID,
} from "@/lib/claude-pricing";
import {
  buildCreateMeditationBedJobFields,
  type CreateSoundBedMode,
} from "@/lib/create-meditation-bed-payload";
import { shouldRenderDevUi, useDevUiSettings } from "@/lib/dev-ui-settings";
import {
  pauseGaplessBed,
  releaseGaplessBed,
  resumeGaplessBed,
  setGaplessBedVolume,
  syncGaplessBed,
} from "@/lib/gapless-bed-loop";
import {
  pickDefaultSpeechifySpeaker,
  speechifySpeakersForPicker,
} from "@/lib/fish-speakers";
import {
  factoryPresetToMix,
  type MixerFactoryPreset,
} from "@/lib/mixer-factory-presets";
import {
  loadMixerPresetStore,
  mixerPresetToMix,
  newMixerPreset,
  saveMixerPresetStore,
  type MixerPreset,
  type MixerPresetMix,
} from "@/lib/mixer-preset-storage";
import {
  backgroundAudioPlaybackKey,
  backgroundAudioStreamingKey,
  getMedimadeMediaBaseUrl,
  listBackgroundAudio,
  listFishSpeakers,
  peekBackgroundAudioCache,
  preloadBackgroundAudioCoverImages,
  type BackgroundAudioItem,
  type FishPauseMode,
  type FishSpeaker,
  VOICE_FX_PRESET_MEDITATION_MIXER,
} from "@/lib/medimade-api";
import { isMelodicMusicKey } from "@/lib/sound-taxonomy";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  speakerPreviewLoudDrySampleKey,
  speakerPreviewLoudFxSampleKey,
  withSpeakerSampleCacheBust,
} from "@/lib/speaker-sample-speed";

function mediaFileUrl(base: string, key: string): string {
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${b}/${path}`;
}

type SoloTrack = "nature" | "music" | "drums" | "noise";

export type CreateSoundStepJobExtras = {
  reference_id: string;
  voiceFxDial: number;
  voiceFxPreset: string | null;
  speed: number;
  longerBreaks?: boolean;
  speakerName: string | null;
  claudeModel?: string;
  fishPauseMode?: FishPauseMode;
  skipVoiceFx?: boolean;
  skipSpeechifyLoudnorm?: boolean;
  speechifyEmotionVariants?: boolean;
  speechifyRate?: number;
} & ReturnType<typeof buildCreateMeditationBedJobFields>;

export type CreateSoundStepHandle = {
  stopPreviews: () => void;
  getJobExtras: () => Promise<CreateSoundStepJobExtras>;
};

export const CreateSoundStep = forwardRef<
  CreateSoundStepHandle,
  { disabled?: boolean }
>(function CreateSoundStep({ disabled = false }, ref) {
  const speechSpeed = FIXED_SPEECH_PREVIEW_SPEED;
  const devUi = useDevUiSettings();
  const showCreateAudioDevControls = shouldRenderDevUi(
    devUi.createAudioDevControls,
  );
  const [speakers, setSpeakers] = useState<FishSpeaker[]>([]);
  const [speakerModelId, setSpeakerModelId] = useState("");
  const [voiceFxDial, setVoiceFxDial] = useState(VOICE_FX_DIAL_DEFAULT);
  const [longerBreaks, setLongerBreaks] = useState(false);
  const [voiceCardStopNonce, setVoiceCardStopNonce] = useState(0);
  const [claudeModelChoice, setClaudeModelChoice] = useState(
    CLAUDE_SONNET_45_MODEL_ID,
  );
  const [fishPauseMode, setFishPauseMode] =
    useState<FishPauseMode>("segmented");
  const [speakerFxPreviewOn, setSpeakerFxPreviewOn] = useState(true);
  const [speechifyEmotionVariants, setSpeechifyEmotionVariants] =
    useState(false);
  const [speechifyRateInput, setSpeechifyRateInput] = useState("");
  const [skipVoiceFx, setSkipVoiceFx] = useState(false);
  const [skipSpeechifyLoudnorm, setSkipSpeechifyLoudnorm] = useState(false);
  const [soundscapeDevFader, setSoundscapeDevFader] = useState(100);
  const soundscapeDevFaderRef = useRef(100);
  const voiceFxOn = showCreateAudioDevControls ? speakerFxPreviewOn : true;

  const [cachedBeds] = useState(() => peekBackgroundAudioCache());
  const [backgroundNature, setBackgroundNature] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.nature ?? [],
  );
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.music ?? [],
  );
  const [backgroundNoise, setBackgroundNoise] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.noise ?? [],
  );
  const [backgroundDrums, setBackgroundDrums] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.drums ?? [],
  );
  const [compositions, setCompositions] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.compositions ?? [],
  );
  const [factoryMixes, setFactoryMixes] = useState<MixerFactoryPreset[]>(
    () => cachedBeds?.factoryMixes ?? [],
  );
  const [factoryMixesLoading, setFactoryMixesLoading] = useState(!cachedBeds);
  const [mediaBaseUrl, setMediaBaseUrl] = useState<string | null>(
    () => cachedBeds?.baseUrl?.trim() || getMedimadeMediaBaseUrl() || null,
  );

  const [soundMode, setSoundMode] = useState<CreateSoundBedMode>("soundscape");
  const [compositionKey, setCompositionKey] = useState("");
  const [compositionPlaying, setCompositionPlaying] = useState(false);
  const compositionAudioRef = useRef<HTMLAudioElement | null>(null);

  const [backgroundNatureKey, setBackgroundNatureKey] = useState("");
  const [backgroundMusicKey, setBackgroundMusicKey] = useState("");
  const [backgroundDrumsKey, setBackgroundDrumsKey] = useState("");
  const [backgroundNoiseKey, setBackgroundNoiseKey] = useState("");
  const [backgroundNatureGain, setBackgroundNatureGain] = useState(25);
  const [backgroundMusicGain, setBackgroundMusicGain] = useState(50);
  const [backgroundDrumsGain, setBackgroundDrumsGain] = useState(40);
  const [backgroundNoiseGain, setBackgroundNoiseGain] = useState(10);

  const [userMixPresets, setUserMixPresets] = useState<MixerPreset[]>(
    () => loadMixerPresetStore().presets,
  );
  const [selectedMixKey, setSelectedMixKey] = useState("");
  const [mixBaseline, setMixBaseline] = useState<MixerPresetMix | null>(null);

  const [playing, setPlaying] = useState({
    nature: false,
    music: false,
    drums: false,
    noise: false,
  });
  const previewNatureRef = useRef<HTMLAudioElement | null>(null);
  const previewMusicRef = useRef<HTMLAudioElement | null>(null);
  const previewDrumsRef = useRef<HTMLAudioElement | null>(null);
  const previewNoiseRef = useRef<HTMLAudioElement | null>(null);
  const lastBgKeysRef = useRef({ nature: "", music: "", drums: "", noise: "" });
  const bedGainRef = useRef({
    nature: backgroundNatureGain,
    music: backgroundMusicGain,
    drums: backgroundDrumsGain,
    noise: backgroundNoiseGain,
  });

  useEffect(() => {
    bedGainRef.current = {
      nature: backgroundNatureGain,
      music: backgroundMusicGain,
      drums: backgroundDrumsGain,
      noise: backgroundNoiseGain,
    };
  }, [
    backgroundNatureGain,
    backgroundMusicGain,
    backgroundDrumsGain,
    backgroundNoiseGain,
  ]);

  useEffect(() => {
    if (cachedBeds) preloadBackgroundAudioCoverImages(cachedBeds);
  }, [cachedBeds]);

  useEffect(() => {
    let cancelled = false;
    void listFishSpeakers()
      .then((list) => {
        if (cancelled) return;
        const next = speechifySpeakersForPicker(list);
        setSpeakers(next);
        const pick = pickDefaultSpeechifySpeaker(next);
        if (pick?.modelId) setSpeakerModelId(pick.modelId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const envMediaBase = getMedimadeMediaBaseUrl();
    (async () => {
      try {
        const data = await listBackgroundAudio();
        if (cancelled) return;
        setBackgroundNature(data.nature);
        setBackgroundMusic(data.music);
        setCompositions(data.compositions);
        setBackgroundDrums(data.drums);
        setBackgroundNoise(data.noise);
        setFactoryMixes(data.factoryMixes ?? []);
        const fromApi = data.baseUrl?.trim();
        setMediaBaseUrl(fromApi || envMediaBase || null);
        preloadBackgroundAudioCoverImages(data);
      } catch {
        if (cancelled) return;
        if (cachedBeds) return;
        setBackgroundNature([]);
        setBackgroundMusic([]);
        setCompositions([]);
        setBackgroundDrums([]);
        setBackgroundNoise([]);
        setFactoryMixes([]);
        setMediaBaseUrl(envMediaBase || null);
      } finally {
        if (!cancelled) setFactoryMixesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cachedBeds]);

  const drumsLockedForMelodic = isMelodicMusicKey(
    backgroundMusic,
    backgroundMusicKey,
  );
  const drumsPreviewKey = drumsLockedForMelodic ? "" : backgroundDrumsKey;

  const currentBedMix: MixerPresetMix = useMemo(
    () => ({
      musicKey: backgroundMusicKey,
      natureKey: backgroundNatureKey,
      drumsKey: backgroundDrumsKey,
      noiseKey: backgroundNoiseKey,
      musicGain: backgroundMusicGain,
      natureGain: backgroundNatureGain,
      drumsGain: backgroundDrumsGain,
      noiseGain: backgroundNoiseGain,
    }),
    [
      backgroundMusicKey,
      backgroundNatureKey,
      backgroundDrumsKey,
      backgroundNoiseKey,
      backgroundMusicGain,
      backgroundNatureGain,
      backgroundDrumsGain,
      backgroundNoiseGain,
    ],
  );

  const mixDirty =
    mixBaseline != null &&
    (mixBaseline.musicKey !== currentBedMix.musicKey ||
      mixBaseline.natureKey !== currentBedMix.natureKey ||
      mixBaseline.drumsKey !== currentBedMix.drumsKey ||
      mixBaseline.noiseKey !== currentBedMix.noiseKey ||
      mixBaseline.musicGain !== currentBedMix.musicGain ||
      mixBaseline.natureGain !== currentBedMix.natureGain ||
      mixBaseline.drumsGain !== currentBedMix.drumsGain ||
      mixBaseline.noiseGain !== currentBedMix.noiseGain);

  useEffect(() => {
    if (mixBaseline != null) return;
    setMixBaseline(currentBedMix);
  }, [currentBedMix, mixBaseline]);

  function stopTrack(track: SoloTrack) {
    if (track === "nature") pauseGaplessBed(previewNatureRef.current);
    else if (track === "music") pauseGaplessBed(previewMusicRef.current);
    else if (track === "drums") pauseGaplessBed(previewDrumsRef.current);
    else pauseGaplessBed(previewNoiseRef.current);
    setPlaying((p) => ({ ...p, [track]: false }));
  }

  function stopCompositionPreview() {
    const el = compositionAudioRef.current;
    if (el) el.pause();
    setCompositionPlaying(false);
  }

  function stopMixerBedPreviews() {
    pauseGaplessBed(previewNatureRef.current);
    pauseGaplessBed(previewMusicRef.current);
    pauseGaplessBed(previewDrumsRef.current);
    pauseGaplessBed(previewNoiseRef.current);
    setPlaying({ nature: false, music: false, drums: false, noise: false });
  }

  const stopAllAudioPreview = useCallback(() => {
    stopCompositionPreview();
    stopMixerBedPreviews();
    setVoiceCardStopNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const base = mediaBaseUrl;
    const sync = (
      el: HTMLAudioElement | null,
      key: string,
      track: SoloTrack,
    ) => {
      if (!el) return;
      const volume = bedElementVolume(bedGainRef.current[track]);
      if (base && key) {
        const prevKey = lastBgKeysRef.current[track];
        const keyChanged = prevKey !== key;
        const shouldPlay = keyChanged || playing[track];
        syncGaplessBed(el, {
          url: mediaFileUrl(base, backgroundAudioPlaybackKey(key)),
          fallbackUrl: mediaFileUrl(base, backgroundAudioStreamingKey(key)),
          volume,
          playing: shouldPlay,
          onPlaybackBlocked: () => stopTrack(track),
        });
        if (shouldPlay) setPlaying((p) => ({ ...p, [track]: true }));
        lastBgKeysRef.current[track] = key;
      } else {
        syncGaplessBed(el, { url: null, volume, playing: false });
        if (playing[track]) stopTrack(track);
        lastBgKeysRef.current[track] = "";
      }
    };
    sync(previewNatureRef.current, backgroundNatureKey, "nature");
    sync(previewMusicRef.current, backgroundMusicKey, "music");
    sync(previewDrumsRef.current, drumsPreviewKey, "drums");
    sync(previewNoiseRef.current, backgroundNoiseKey, "noise");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror create-workspace bed sync
  }, [
    mediaBaseUrl,
    backgroundNatureKey,
    backgroundMusicKey,
    drumsPreviewKey,
    backgroundNoiseKey,
    playing.nature,
    playing.music,
    playing.drums,
    playing.noise,
  ]);

  useEffect(() => {
    if (!drumsLockedForMelodic) return;
    previewDrumsRef.current?.pause();
    setPlaying((p) => (p.drums ? { ...p, drums: false } : p));
  }, [drumsLockedForMelodic]);

  useEffect(() => {
    return () => {
      [previewNatureRef, previewMusicRef, previewDrumsRef, previewNoiseRef].forEach(
        (r) => releaseGaplessBed(r.current),
      );
      const c = compositionAudioRef.current;
      if (c) {
        c.pause();
        c.removeAttribute("src");
      }
    };
  }, []);

  function applyLiveBedGain(track: SoloTrack, gain: number) {
    bedGainRef.current[track] = gain;
    const el =
      track === "nature"
        ? previewNatureRef.current
        : track === "music"
          ? previewMusicRef.current
          : track === "drums"
            ? previewDrumsRef.current
            : previewNoiseRef.current;
    setGaplessBedVolume(el, bedElementVolume(gain));
  }

  function speakerPreviewDryUrl(modelId: string): string | null {
    if (!mediaBaseUrl || !modelId) return null;
    const speaker = speakers.find((s) => s.modelId === modelId);
    return withSpeakerSampleCacheBust(
      mediaFileUrl(
        mediaBaseUrl,
        speakerPreviewLoudDrySampleKey(modelId, speechSpeed, speaker?.brand),
      ),
      speaker?.updatedAt,
    );
  }

  function speakerPreviewWetUrl(modelId: string): string | null {
    if (!mediaBaseUrl || !modelId) return null;
    const speaker = speakers.find((s) => s.modelId === modelId);
    return withSpeakerSampleCacheBust(
      mediaFileUrl(
        mediaBaseUrl,
        speakerPreviewLoudFxSampleKey(modelId, speechSpeed, speaker?.brand),
      ),
      speaker?.updatedAt,
    );
  }

  function soundscapePreviewUrl(key: string): string | null {
    if (!mediaBaseUrl || !key) return null;
    return mediaFileUrl(mediaBaseUrl, backgroundAudioPlaybackKey(key));
  }

  function toggleCompositionPreview(key: string) {
    const el = compositionAudioRef.current;
    const url = soundscapePreviewUrl(key);
    if (!el || !url) return;
    if (compositionPlaying && el.src === url) {
      stopCompositionPreview();
      return;
    }
    stopMixerBedPreviews();
    if (el.src !== url) {
      el.src = url;
      el.load();
    }
    el.volume = soundscapeListenVolume(soundscapeDevFaderRef.current);
    setCompositionPlaying(true);
    void playWithLeadBuffer(el).catch(() => setCompositionPlaying(false));
  }

  function applySoundscapeDevFader(percent: number) {
    const n = Math.min(100, Math.max(0, percent));
    soundscapeDevFaderRef.current = n;
    setSoundscapeDevFader(n);
    const el = compositionAudioRef.current;
    if (el) el.volume = soundscapeListenVolume(n);
  }

  async function toggleRowPreview(track: SoloTrack) {
    if (track === "nature" && !backgroundNatureKey) return;
    if (track === "music" && !backgroundMusicKey) return;
    if (track === "drums" && (!backgroundDrumsKey || drumsLockedForMelodic))
      return;
    if (track === "noise" && !backgroundNoiseKey) return;
    const el =
      track === "nature"
        ? previewNatureRef.current
        : track === "music"
          ? previewMusicRef.current
          : track === "drums"
            ? previewDrumsRef.current
            : previewNoiseRef.current;
    if (!el?.src) return;
    try {
      if (playing[track]) {
        pauseGaplessBed(el);
        setPlaying((p) => ({ ...p, [track]: false }));
      } else {
        stopCompositionPreview();
        await resumeGaplessBed(el);
        setPlaying((p) => ({ ...p, [track]: true }));
      }
    } catch {
      stopTrack(track);
    }
  }

  function applyBedMix(mix: MixerPresetMix) {
    setBackgroundMusicKey(mix.musicKey);
    setBackgroundNatureKey(mix.natureKey);
    setBackgroundDrumsKey(mix.drumsKey);
    setBackgroundNoiseKey(mix.noiseKey);
    setBackgroundMusicGain(mix.musicGain);
    setBackgroundNatureGain(mix.natureGain);
    setBackgroundDrumsGain(mix.drumsGain);
    setBackgroundNoiseGain(mix.noiseGain);
    setMixBaseline(mix);
    const drumsLocked = isMelodicMusicKey(backgroundMusic, mix.musicKey);
    setPlaying({
      music: Boolean(mix.musicKey.trim()),
      nature: Boolean(mix.natureKey.trim()),
      drums: Boolean(mix.drumsKey.trim()) && !drumsLocked,
      noise: Boolean(mix.noiseKey.trim()),
    });
  }

  function onSelectMixPreset(key: string) {
    setSelectedMixKey(key);
    if (!key) {
      setMixBaseline(currentBedMix);
      return;
    }
    const sep = key.indexOf(":");
    const kind = key.slice(0, sep);
    const id = key.slice(sep + 1);
    if (kind === "factory") {
      const p = factoryMixes.find((x) => x.id === id);
      if (p) applyBedMix(factoryPresetToMix(p));
      return;
    }
    if (kind === "user") {
      const p = userMixPresets.find((x) => x.id === id);
      if (p) applyBedMix(mixerPresetToMix(p));
    }
  }

  function saveNewMixPreset(name: string) {
    const p: MixerPreset = {
      ...newMixerPreset(name),
      musicKey: backgroundMusicKey,
      natureKey: backgroundNatureKey,
      drumsKey: backgroundDrumsKey,
      noiseKey: backgroundNoiseKey,
      musicGain: backgroundMusicGain,
      natureGain: backgroundNatureGain,
      drumsGain: backgroundDrumsGain,
      noiseGain: backgroundNoiseGain,
    };
    const store = loadMixerPresetStore();
    const next = {
      version: 1 as const,
      activeId: p.id,
      presets: [p, ...store.presets.filter((x) => x.id !== p.id)],
    };
    saveMixerPresetStore(next);
    setUserMixPresets(next.presets);
    setSelectedMixKey(`user:${p.id}`);
    setMixBaseline(mixerPresetToMix(p));
  }

  useImperativeHandle(
    ref,
    () => ({
      stopPreviews: stopAllAudioPreview,
      getJobExtras: async () => {
        let referenceId = speakerModelId.trim();
        if (!referenceId) {
          const list = await listFishSpeakers();
          const pick = pickDefaultSpeechifySpeaker(
            speechifySpeakersForPicker(list),
          );
          referenceId = pick?.modelId ?? "";
        }
        if (!referenceId) throw new Error("No voice available");
        const speaker =
          speakers.find((s) => s.modelId === referenceId) ?? null;
        const rateN = Number(speechifyRateInput.trim());
        return {
          reference_id: referenceId,
          voiceFxDial,
          voiceFxPreset: voiceFxOn ? VOICE_FX_PRESET_MEDITATION_MIXER : null,
          speed: FIXED_SPEECH_PREVIEW_SPEED,
          ...(longerBreaks ? { longerBreaks: true as const } : {}),
          speakerName: speaker?.name ?? null,
          ...(showCreateAudioDevControls
            ? {
                claudeModel: claudeModelChoice,
                fishPauseMode,
                ...(skipVoiceFx ? { skipVoiceFx: true as const } : {}),
                ...(skipSpeechifyLoudnorm
                  ? { skipSpeechifyLoudnorm: true as const }
                  : {}),
                ...(speechifyEmotionVariants
                  ? { speechifyEmotionVariants: true as const }
                  : {}),
                ...(Number.isFinite(rateN)
                  ? {
                      speechifyRate: Math.max(
                        -50,
                        Math.min(50, Math.round(rateN)),
                      ),
                    }
                  : {}),
              }
            : {
                claudeModel: CLAUDE_SONNET_45_MODEL_ID,
                fishPauseMode: "segmented" as const,
              }),
          ...buildCreateMeditationBedJobFields({
            soundMode,
            compositionKey,
            backgroundNatureKey,
            backgroundMusicKey,
            backgroundDrumsKey,
            backgroundNoiseKey,
            backgroundNatureGain,
            backgroundMusicGain,
            backgroundDrumsGain,
            backgroundNoiseGain,
            drumsPreviewKey,
          }),
        };
      },
    }),
    [
      stopAllAudioPreview,
      speakerModelId,
      speakers,
      voiceFxDial,
      voiceFxOn,
      longerBreaks,
      showCreateAudioDevControls,
      claudeModelChoice,
      fishPauseMode,
      skipVoiceFx,
      skipSpeechifyLoudnorm,
      speechifyEmotionVariants,
      speechifyRateInput,
      soundMode,
      compositionKey,
      backgroundNatureKey,
      backgroundMusicKey,
      backgroundDrumsKey,
      backgroundNoiseKey,
      backgroundNatureGain,
      backgroundMusicGain,
      backgroundDrumsGain,
      backgroundNoiseGain,
      drumsPreviewKey,
    ],
  );

  const soundControlsDisabled = disabled;

  return (
    <div className="flex flex-col gap-3">
      <audio ref={compositionAudioRef} preload="none" className="hidden" />
      <audio ref={previewNatureRef} preload="none" className="hidden" />
      <audio ref={previewMusicRef} preload="none" className="hidden" />
      <audio ref={previewDrumsRef} preload="none" className="hidden" />
      <audio ref={previewNoiseRef} preload="none" className="hidden" />

      {showCreateAudioDevControls ? (
        <AppTopBarTrailingPortal>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-dashed border-accent/50 bg-accent-soft/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-link">
              Dev
            </span>
            <div
              className="inline-flex h-8 shrink-0 overflow-hidden rounded-lg border border-border bg-background"
              role="group"
              aria-label="Claude model"
            >
              {(
                [
                  [CLAUDE_SONNET_45_MODEL_ID, "Sonnet"],
                  [CLAUDE_HAIKU_45_MODEL_ID, "Haiku"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setClaudeModelChoice(value)}
                  className={`cursor-pointer px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    claudeModelChoice === value
                      ? "bg-accent-soft text-foreground"
                      : "text-muted hover:bg-accent-soft/40 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="inline-flex h-8 shrink-0 overflow-hidden rounded-lg border border-border bg-background"
              role="group"
              aria-label="Pause render path"
            >
              {(
                [
                  ["segmented", "Our chunks"],
                  ["native", "Fish tags"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setFishPauseMode(value)}
                  className={`cursor-pointer px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    fishPauseMode === value
                      ? "bg-accent-soft text-foreground"
                      : "text-muted hover:bg-accent-soft/40 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="inline-flex h-8 shrink-0 overflow-hidden rounded-lg border border-border bg-background"
              role="group"
              aria-label="Voice FX"
            >
              {(
                [
                  [true, "FX on"],
                  [false, "FX off"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setSpeakerFxPreviewOn(value);
                    setVoiceCardStopNonce((n) => n + 1);
                  }}
                  className={`cursor-pointer px-2.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    speakerFxPreviewOn === value
                      ? "bg-accent-soft text-foreground"
                      : "text-muted hover:bg-accent-soft/40 hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </AppTopBarTrailingPortal>
      ) : null}

      {showCreateAudioDevControls ? (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
          <label
            className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 px-3 py-2 text-sm text-foreground"
            title="Localhost only. Off by default. When on, also renders warm and calm Speechify stems (serial)."
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent-button,#c4a574)]"
              checked={speechifyEmotionVariants}
              disabled={disabled}
              onChange={(e) => setSpeechifyEmotionVariants(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="font-semibold">Dev · ×3 emotions</span>
              <span className="text-muted">
                {" "}
                — also generate warm + calm (slower)
              </span>
            </span>
          </label>
          <label
            className="flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 px-3 py-2 text-sm text-foreground"
            title="Localhost only. Speechify SSML rate percent (−50…50)."
          >
            <span className="font-semibold whitespace-nowrap">Dev · rate</span>
            <input
              type="number"
              inputMode="numeric"
              min={-50}
              max={50}
              step={1}
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              value={speechifyRateInput}
              disabled={disabled}
              onChange={(e) => setSpeechifyRateInput(e.target.value)}
              aria-label="Speechify rate percent"
            />
            <span className="text-muted">%</span>
          </label>
          <label
            className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 px-3 py-2 text-sm text-foreground"
            title="Localhost only. Skips the wet Pedalboard Voice FX bounce + stem uploads."
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent-button,#c4a574)]"
              checked={skipVoiceFx}
              disabled={disabled}
              onChange={(e) => setSkipVoiceFx(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="font-semibold">Dev · skip FX</span>
              <span className="text-muted"> — no wet bounce (faster A/B)</span>
            </span>
          </label>
          <label
            className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-accent/50 bg-accent-soft/30 px-3 py-2 text-sm text-foreground"
            title="Localhost only. Sets Speechify options.loudness_normalization=false."
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--color-accent-button,#c4a574)]"
              checked={skipSpeechifyLoudnorm}
              disabled={disabled}
              onChange={(e) => setSkipSpeechifyLoudnorm(e.target.checked)}
            />
            <span className="min-w-0">
              <span className="font-semibold">Dev · no Speechify loudnorm</span>
              <span className="text-muted"> — raw volume check</span>
            </span>
          </label>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-col">
        <VoiceCardRow
          voices={speakers.map((s) => ({
            modelId: s.modelId,
            name: s.name,
            description: s.description ?? undefined,
          }))}
          value={speakerModelId}
          onChange={setSpeakerModelId}
          disabled={soundControlsDisabled}
          previewDryUrl={speakerPreviewDryUrl}
          previewWetUrl={speakerPreviewWetUrl}
          voiceFxDial={voiceFxDial}
          stopNonce={voiceCardStopNonce}
          headerEnd={
            <Tooltip.Provider delayDuration={200} disableHoverableContent>
              <div
                className="flex items-center gap-2"
                role="group"
                aria-label="Meditation pacing"
              >
                <span
                  className={`inline-flex items-center gap-1 text-sm font-semibold ${
                    longerBreaks ? "text-muted" : "text-foreground"
                  }`}
                >
                  Guided
                </span>
                <Switch.Root
                  checked={longerBreaks}
                  onCheckedChange={(v) => setLongerBreaks(Boolean(v))}
                  disabled={soundControlsDisabled}
                  aria-label={
                    longerBreaks
                      ? "Switch to guided pacing"
                      : "Switch to open sits pacing"
                  }
                  className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full border border-border bg-muted transition-colors data-[state=checked]:border-accent-button data-[state=checked]:bg-accent-button disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Switch.Thumb className="block h-4 w-4 translate-x-[2px] rounded-full bg-card shadow-sm transition-transform will-change-transform data-[state=checked]:translate-x-[16px]" />
                </Switch.Root>
                <span
                  className={`inline-flex items-center gap-1 text-sm font-semibold ${
                    longerBreaks ? "text-foreground" : "text-muted"
                  }`}
                >
                  Open sits
                </span>
              </div>
            </Tooltip.Provider>
          }
        />
        <div className="flex items-center gap-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
            FX
          </span>
          <VoiceFxKnob
            value={voiceFxDial}
            disabled={soundControlsDisabled}
            onChange={setVoiceFxDial}
          />
          <span className="text-xs tabular-nums text-muted">{voiceFxDial}</span>
        </div>
        <div className="border-t border-border" role="separator" aria-hidden />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex shrink-0 items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
            Sound
          </span>
          {showCreateAudioDevControls && soundMode === "soundscape" ? (
            <SoundscapeDevVolumeFader
              value={soundscapeDevFader}
              onChange={applySoundscapeDevFader}
              className="mx-2"
            />
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          <SegmentedPillTabs<CreateSoundBedMode>
            aria-label="Sound bed"
            value={soundMode}
            onChange={(mode) => {
              if (soundMode === mode) return;
              stopAllAudioPreview();
              setSoundMode(mode);
            }}
            selectedClassName="bg-[color-mix(in_srgb,var(--header-gold)_72%,white)] text-on-selected"
            options={[
              { id: "soundscape", label: "Soundscapes" },
              { id: "mixer", label: "Build your own" },
            ]}
          />
        </div>

        {soundMode === "soundscape" ? (
          <SoundscapePicker
            variant="create"
            items={compositions}
            value={compositionKey}
            onChange={setCompositionKey}
            previewUrl={soundscapePreviewUrl}
            playingKey={compositionPlaying ? compositionKey : null}
            onTogglePreview={(key) => {
              if (key !== compositionKey) setCompositionKey(key);
              toggleCompositionPreview(key);
            }}
            disabled={soundControlsDisabled}
            loading={factoryMixesLoading}
          />
        ) : (
          <>
            <div className="shrink-0 pb-2 pt-0">
              <div className="flex items-center justify-start gap-3">
                <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
                  Preset
                </span>
                <div className="min-w-0 w-full max-w-sm sm:w-auto sm:max-w-none">
                  <MixerPresetChannel
                    layout="toolbar"
                    factoryPresets={factoryMixes}
                    userPresets={userMixPresets}
                    selectedKey={selectedMixKey}
                    onSelect={onSelectMixPreset}
                    onSaveNew={saveNewMixPreset}
                    disabled={soundControlsDisabled}
                    loading={factoryMixesLoading}
                    showSave={mixDirty}
                    modified={mixDirty}
                    defaultSaveName={
                      selectedMixKey
                        ? "Untitled mix (edited)"
                        : "Untitled mix"
                    }
                  />
                </div>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
              <section className="w-full max-w-xl shrink-0 rounded-2xl border border-border bg-card px-4 py-1">
                <MixerChannel
                  layout="row"
                  label="Music"
                  category="music"
                  items={backgroundMusic}
                  value={backgroundMusicKey}
                  onChange={setBackgroundMusicKey}
                  gain={backgroundMusicGain}
                  onGainChange={setBackgroundMusicGain}
                  onLiveGainChange={(g) => applyLiveBedGain("music", g)}
                  disabled={soundControlsDisabled}
                  faderDisabled={soundControlsDisabled || !backgroundMusicKey}
                  playing={playing.music}
                  onTogglePreview={() => void toggleRowPreview("music")}
                  playDisabled={soundControlsDisabled || !backgroundMusicKey}
                  playAriaLabel={playing.music ? "Pause music" : "Play music"}
                />
              </section>
              <section className="w-full max-w-xl shrink-0 rounded-2xl border border-border bg-card px-4 py-1">
                <MixerChannel
                  layout="row"
                  label="Ambience"
                  category="ambience"
                  items={backgroundNature}
                  value={backgroundNatureKey}
                  onChange={setBackgroundNatureKey}
                  gain={backgroundNatureGain}
                  onGainChange={setBackgroundNatureGain}
                  onLiveGainChange={(g) => applyLiveBedGain("nature", g)}
                  disabled={soundControlsDisabled}
                  faderDisabled={soundControlsDisabled || !backgroundNatureKey}
                  playing={playing.nature}
                  onTogglePreview={() => void toggleRowPreview("nature")}
                  playDisabled={soundControlsDisabled || !backgroundNatureKey}
                  playAriaLabel={
                    playing.nature ? "Pause ambience" : "Play ambience"
                  }
                />
              </section>
              <DrumsLockedWrap locked={drumsLockedForMelodic} className="block">
                <section className="w-full max-w-xl shrink-0 rounded-2xl border border-border bg-card px-4 py-1">
                  <MixerChannel
                    layout="row"
                    label="Drums"
                    category="drums"
                    items={backgroundDrums}
                    value={backgroundDrumsKey}
                    onChange={setBackgroundDrumsKey}
                    gain={backgroundDrumsGain}
                    onGainChange={setBackgroundDrumsGain}
                    onLiveGainChange={(g) => applyLiveBedGain("drums", g)}
                    disabled={soundControlsDisabled || drumsLockedForMelodic}
                    faderDisabled={
                      soundControlsDisabled ||
                      drumsLockedForMelodic ||
                      !backgroundDrumsKey
                    }
                    playing={playing.drums}
                    onTogglePreview={() => void toggleRowPreview("drums")}
                    playDisabled={
                      soundControlsDisabled ||
                      drumsLockedForMelodic ||
                      !backgroundDrumsKey
                    }
                    playAriaLabel={
                      playing.drums ? "Pause drums" : "Play drums"
                    }
                  />
                </section>
              </DrumsLockedWrap>
              <section className="w-full max-w-xl shrink-0 rounded-2xl border border-border bg-card px-4 py-1">
                <MixerChannel
                  layout="row"
                  label="Noise"
                  category="noise"
                  items={backgroundNoise}
                  value={backgroundNoiseKey}
                  onChange={setBackgroundNoiseKey}
                  gain={backgroundNoiseGain}
                  onGainChange={setBackgroundNoiseGain}
                  onLiveGainChange={(g) => applyLiveBedGain("noise", g)}
                  disabled={soundControlsDisabled}
                  faderDisabled={soundControlsDisabled || !backgroundNoiseKey}
                  playing={playing.noise}
                  onTogglePreview={() => void toggleRowPreview("noise")}
                  playDisabled={soundControlsDisabled || !backgroundNoiseKey}
                  playAriaLabel={playing.noise ? "Pause noise" : "Play noise"}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

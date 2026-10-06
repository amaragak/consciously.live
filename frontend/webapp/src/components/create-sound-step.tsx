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
import { DualStemPlayer, VOICE_FX_DIAL_DEFAULT } from "@consciously/common";
import { AppTopBarTrailingPortal } from "@/components/app-primary-tabs";
import { DrumsLockedWrap } from "@/components/drums-locked-wrap";
import { MixerDeskRow } from "@/components/mixer-channel";
import { CreateOneFlowPickerShell } from "@/components/create-one-flow-picker-shell";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import { playWithLeadBuffer } from "@/lib/audio-lead-buffer";
import { bedElementVolume, soundscapeListenVolume } from "@/lib/bed-volume";
import {
  CLAUDE_HAIKU_45_MODEL_ID,
  CLAUDE_SONNET_45_MODEL_ID,
} from "@/lib/claude-pricing";
import {
  buildCreateMeditationBedJobFields,
  SOUNDSCAPE_GAIN,
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
  listStyleVoicePrefs,
  peekBackgroundAudioCache,
  preloadBackgroundAudioCoverImages,
  type BackgroundAudioItem,
  type FishPauseMode,
  type FishSpeaker,
  type VoicePreferredTraits,
  VOICE_FX_PRESET_MEDITATION_MIXER,
  hasVoicePrefs,
} from "@/lib/medimade-api";
import { FavoriteHeartButton } from "@/components/favorite-heart-button";
import {
  computeSoundPicks,
  musicLevelToBedGain,
  rankVoicesByPrefs,
  readLastVoiceId,
  readRecentSoundIds,
  rememberRecentSound,
  SILENCE_SOUND_ID,
  soundscapeCategoryLabel,
  swapAlt,
  voiceDisplayMeta,
  voiceFilterChips,
  voiceMatchesFilter,
  writeLastSoundForStyle,
  writeLastVoiceId,
} from "@/lib/create-sound-picks";
import { useSoundFavorites } from "@/lib/sound-favorites";
import { isMelodicMusicKey, prettySubcategoryLabel } from "@/lib/sound-taxonomy";
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
  togglePreviewMix: () => void;
  previewMixPlaying: boolean;
};

type CreateSoundStepProps = {
  disabled?: boolean;
  meditationStyle?: string | null;
  programSpeakerModelId?: string | null;
  programTitle?: string | null;
  programVoicePrefs?: VoicePreferredTraits | null;
  onPreviewMixPlayingChange?: (playing: boolean) => void;
};

type FlowSoundLock = {
  speakerModelId: string;
  compositionKey: string;
  soundMode: CreateSoundBedMode;
  voiceAlts: string[];
  soundAlts: string[];
  showVoiceReason: boolean;
  showSoundReason: boolean;
  voiceFxDial: number;
  musicLevel: number;
  longerBreaks: boolean;
};

let flowSoundLock: FlowSoundLock | null = null;

export const CreateSoundStep = forwardRef<
  CreateSoundStepHandle,
  CreateSoundStepProps
>(function CreateSoundStep(
  {
    disabled = false,
    meditationStyle = null,
    programSpeakerModelId = null,
    programTitle: _programTitle = null,
    programVoicePrefs = null,
    onPreviewMixPlayingChange,
  },
  ref,
) {
  const speechSpeed = FIXED_SPEECH_PREVIEW_SPEED;
  const devUi = useDevUiSettings();
  const showCreateAudioDevControls = shouldRenderDevUi(
    devUi.createAudioDevControls,
  );
  const [speakers, setSpeakers] = useState<FishSpeaker[]>([]);
  const [styleVoicePrefs, setStyleVoicePrefs] = useState<
    Record<string, VoicePreferredTraits>
  >({});
  const favorites = useSoundFavorites();
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

  const [voiceAlts, setVoiceAlts] = useState<string[]>([]);
  const [soundAlts, setSoundAlts] = useState<string[]>([]);
  const [voiceReason, setVoiceReason] = useState("");
  const [soundReason, setSoundReason] = useState("");
  const [showVoiceReason, setShowVoiceReason] = useState(true);
  const [showSoundReason, setShowSoundReason] = useState(true);
  const [musicLevel, setMusicLevel] = useState(50);
  const [picksReady, setPicksReady] = useState(false);
  const [changeKind, setChangeKind] = useState<null | "voice" | "sound">(null);
  const [stagedVoiceId, setStagedVoiceId] = useState("");
  const [stagedSoundId, setStagedSoundId] = useState("");
  const [soundPanelTab, setSoundPanelTab] = useState<"library" | "mixer">(
    "library",
  );
  const [voiceFilter, setVoiceFilter] = useState("All");
  const [soundSearch, setSoundSearch] = useState("");
  const [soundCategory, setSoundCategory] = useState("all");
  const [soundSort, setSoundSort] = useState<"az" | "recent">("az");
  const [voicePreviewId, setVoicePreviewId] = useState<string | null>(null);
  const [previewMixPlaying, setPreviewMixPlaying] = useState(false);
  useEffect(() => {
    onPreviewMixPlayingChange?.(previewMixPlaying);
  }, [previewMixPlaying, onPreviewMixPlayingChange]);
  const voicePlayerRef = useRef<DualStemPlayer | null>(null);
  if (!voicePlayerRef.current) voicePlayerRef.current = new DualStemPlayer();
  const previewMixTimerRef = useRef<number | null>(null);
  const togglePreviewMixRef = useRef<(() => Promise<void>) | null>(null);
  const changeVoiceBtnRef = useRef<HTMLButtonElement | null>(null);
  const changeSoundBtnRef = useRef<HTMLButtonElement | null>(null);

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
  const voicePrefs = useMemo<VoicePreferredTraits | null>(() => {
    if (hasVoicePrefs(programVoicePrefs)) return programVoicePrefs;
    const styleKey = meditationStyle?.trim();
    if (!styleKey) return null;
    const fromStyle = styleVoicePrefs[styleKey];
    return hasVoicePrefs(fromStyle) ? fromStyle : null;
  }, [programVoicePrefs, meditationStyle, styleVoicePrefs]);
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
  const [mixNaming, setMixNaming] = useState(false);
  const [mixSaveName, setMixSaveName] = useState("Untitled mix");

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
      })
      .catch(() => {});
    void listStyleVoicePrefs()
      .then((prefs) => {
        if (!cancelled) setStyleVoicePrefs(prefs);
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

  useEffect(() => {
    if (picksReady) return;
    if (speakers.length === 0) return;
    const lock = flowSoundLock;
    const picks = computeSoundPicks({
      speakers,
      soundscapes: compositions,
      style: meditationStyle,
      lockedVoiceId: lock?.speakerModelId,
      lockedSoundId: lock ? lock.compositionKey : null,
      voicePrefs,
      programSpeakerId: programSpeakerModelId,
      favoriteVoiceIds: favorites.voiceSet,
    });
    if (lock) {
      setSpeakerModelId(lock.speakerModelId || picks.voiceId);
      setCompositionKey(lock.compositionKey);
      setSoundMode(lock.soundMode);
      setVoiceAlts(lock.voiceAlts.length ? lock.voiceAlts : picks.voiceAlts);
      setSoundAlts(lock.soundAlts.length ? lock.soundAlts : picks.soundAlts);
      setShowVoiceReason(lock.showVoiceReason);
      setShowSoundReason(lock.showSoundReason);
      setVoiceFxDial(lock.voiceFxDial);
      setMusicLevel(lock.musicLevel);
      setLongerBreaks(lock.longerBreaks);
      setVoiceReason(picks.voiceReason);
      setSoundReason(picks.soundReason);
    } else {
      setSpeakerModelId(picks.voiceId);
      setCompositionKey(picks.soundId);
      setVoiceAlts(picks.voiceAlts);
      setSoundAlts(picks.soundAlts);
      setVoiceReason(picks.voiceReason);
      setSoundReason(picks.soundReason);
      setShowVoiceReason(true);
      setShowSoundReason(true);
    }
    setPicksReady(true);
  }, [
    speakers,
    compositions,
    meditationStyle,
    picksReady,
    voicePrefs,
    programSpeakerModelId,
    favorites.voiceSet,
  ]);

  useEffect(() => {
    if (!picksReady) return;
    flowSoundLock = {
      speakerModelId,
      compositionKey,
      soundMode,
      voiceAlts,
      soundAlts,
      showVoiceReason,
      showSoundReason,
      voiceFxDial,
      musicLevel,
      longerBreaks,
    };
  }, [
    picksReady,
    speakerModelId,
    compositionKey,
    soundMode,
    voiceAlts,
    soundAlts,
    showVoiceReason,
    showSoundReason,
    voiceFxDial,
    musicLevel,
    longerBreaks,
  ]);

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

  const stopVoicePreview = useCallback(() => {
    voicePlayerRef.current?.stop();
    setVoicePreviewId(null);
  }, []);

  const stopPreviewMix = useCallback(() => {
    if (previewMixTimerRef.current != null) {
      window.clearTimeout(previewMixTimerRef.current);
      previewMixTimerRef.current = null;
    }
    setPreviewMixPlaying(false);
    stopVoicePreview();
    stopCompositionPreview();
    stopMixerBedPreviews();
  }, [stopVoicePreview]);

  const stopAllAudioPreview = useCallback(() => {
    stopPreviewMix();
    setVoiceCardStopNonce((n) => n + 1);
  }, [stopPreviewMix]);

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

  async function startVoicePreview(modelId: string) {
    const dry = speakerPreviewDryUrl(modelId);
    if (!dry) return;
    stopMixerBedPreviews();
    stopCompositionPreview();
    const player = voicePlayerRef.current;
    if (!player) return;
    setVoicePreviewId(modelId);
    try {
      await player.start(dry, speakerPreviewWetUrl(modelId), voiceFxDial);
    } catch {
      setVoicePreviewId(null);
    }
  }

  function toggleVoicePreview(modelId: string) {
    if (voicePreviewId === modelId) {
      stopVoicePreview();
      return;
    }
    void startVoicePreview(modelId);
  }

  async function runPreviewMix() {
    if (previewMixPlaying) {
      stopPreviewMix();
      return;
    }
    stopAllAudioPreview();
    setPreviewMixPlaying(true);
    const listen = soundscapeListenVolume(
      Math.min(100, Math.max(0, musicLevel * 2)),
    );
    if (soundMode === "soundscape" && compositionKey) {
      const el = compositionAudioRef.current;
      const url = soundscapePreviewUrl(compositionKey);
      if (el && url) {
        if (el.src !== url) {
          el.src = url;
          el.load();
        }
        el.volume = listen;
        setCompositionPlaying(true);
        void playWithLeadBuffer(el).catch(() => setCompositionPlaying(false));
      }
    } else if (soundMode === "mixer") {
      setPlaying({
        music: Boolean(backgroundMusicKey),
        nature: Boolean(backgroundNatureKey),
        drums: Boolean(drumsPreviewKey),
        noise: Boolean(backgroundNoiseKey),
      });
    }
    if (speakerModelId) {
      const dry = speakerPreviewDryUrl(speakerModelId);
      if (dry && voicePlayerRef.current) {
        try {
          await voicePlayerRef.current.start(
            dry,
            speakerPreviewWetUrl(speakerModelId),
            voiceFxDial,
          );
          setVoicePreviewId(speakerModelId);
        } catch {
          /* bed-only is still a mix */
        }
      }
    }
    previewMixTimerRef.current = window.setTimeout(() => {
      previewMixTimerRef.current = null;
      stopPreviewMix();
    }, 15_000);
  }

  togglePreviewMixRef.current = runPreviewMix;

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
    setMixNaming(false);
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
    setMixNaming(false);
  }

  function updateUserMixPreset() {
    if (!selectedMixKey.startsWith("user:")) return;
    const id = selectedMixKey.slice("user:".length);
    const store = loadMixerPresetStore();
    const now = new Date().toISOString();
    const presets = store.presets.map((p) =>
      p.id === id ? { ...p, ...currentBedMix, updatedAt: now } : p,
    );
    saveMixerPresetStore({ version: 1, activeId: id, presets });
    setUserMixPresets(presets);
    setMixBaseline(currentBedMix);
  }

  function deleteUserMixPreset() {
    if (!selectedMixKey.startsWith("user:")) return;
    const id = selectedMixKey.slice("user:".length);
    const store = loadMixerPresetStore();
    const presets = store.presets.filter((p) => p.id !== id);
    saveMixerPresetStore({
      version: 1,
      activeId: presets[0]?.id ?? null,
      presets,
    });
    setUserMixPresets(presets);
    setSelectedMixKey("");
  }

  useImperativeHandle(
    ref,
    () => ({
      stopPreviews: stopAllAudioPreview,
      previewMixPlaying,
      togglePreviewMix: () => {
        void togglePreviewMixRef.current?.();
      },
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
            backgroundNatureGain: musicLevelToBedGain(
              musicLevel,
              backgroundNatureGain,
            ),
            backgroundMusicGain: musicLevelToBedGain(
              musicLevel,
              soundMode === "soundscape" ? SOUNDSCAPE_GAIN : backgroundMusicGain,
            ),
            backgroundDrumsGain: musicLevelToBedGain(
              musicLevel,
              backgroundDrumsGain,
            ),
            backgroundNoiseGain: musicLevelToBedGain(
              musicLevel,
              backgroundNoiseGain,
            ),
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
      musicLevel,
      previewMixPlaying,
    ],
  );

  const selectedVoice =
    speakers.find((s) => s.modelId === speakerModelId) ?? null;
  const selectedVoiceMeta = selectedVoice
    ? voiceDisplayMeta(selectedVoice)
    : null;
  const selectedSound =
    compositions.find((c) => c.key === compositionKey) ?? null;
  const mixLayerBits = [
    backgroundMusicKey &&
      (backgroundMusic.find((x) => x.key === backgroundMusicKey)?.name ??
        "Music"),
    backgroundNatureKey &&
      (backgroundNature.find((x) => x.key === backgroundNatureKey)?.name ??
        "Ambience"),
    drumsPreviewKey &&
      (backgroundDrums.find((x) => x.key === drumsPreviewKey)?.name ?? "Drums"),
    backgroundNoiseKey &&
      (backgroundNoise.find((x) => x.key === backgroundNoiseKey)?.name ??
        "Noise"),
  ].filter((x): x is string => Boolean(x));
  const usingMix = soundMode === "mixer";
  const mixerPanelName = selectedMixKey.startsWith("user:")
    ? (userMixPresets.find((p) => `user:${p.id}` === selectedMixKey)?.name ??
      "Your mix")
    : selectedMixKey.startsWith("factory:")
      ? (factoryMixes.find((p) => `factory:${p.id}` === selectedMixKey)
          ?.name ?? "Your mix")
      : "Your mix";
  const soundTitle = usingMix
    ? mixerPanelName
    : compositionKey
      ? (selectedSound?.name ?? "Soundscape")
      : "Silence";
  const soundDescription = usingMix
    ? mixLayerBits.join(" · ") || "No layers"
    : compositionKey
      ? soundscapeCategoryLabel(selectedSound)
      : "Voice only";
  const soundCategories = useMemo(() => {
    const ids = new Set<string>();
    for (const item of compositions) {
      if (item.subcategory) ids.add(item.subcategory);
    }
    return [...ids].sort((a, b) =>
      prettySubcategoryLabel(a).localeCompare(prettySubcategoryLabel(b)),
    );
  }, [compositions]);
  const recentSoundIds = useMemo(() => readRecentSoundIds(), [changeKind]);
  const filteredSoundscapes = useMemo(() => {
    const q = soundSearch.trim().toLowerCase();
    let list = compositions.filter((item) => {
      if (soundCategory === "favourites") {
        if (!favorites.compositionSet.has(item.key)) return false;
      } else if (soundCategory !== "all" && item.subcategory !== soundCategory) {
        return false;
      }
      if (!q) return true;
      const cat = item.subcategory
        ? prettySubcategoryLabel(item.subcategory)
        : "";
      return (
        item.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q)
      );
    });
    const favRank = (key: string) =>
      favorites.compositionSet.has(key) ? 0 : 1;
    if (soundSort === "recent") {
      const rank = new Map(recentSoundIds.map((id, i) => [id, i]));
      list = [...list].sort((a, b) => {
        const fav = favRank(a.key) - favRank(b.key);
        if (fav !== 0) return fav;
        return (rank.get(a.key) ?? 999) - (rank.get(b.key) ?? 999);
      });
    } else {
      list = [...list].sort((a, b) => {
        const fav = favRank(a.key) - favRank(b.key);
        if (fav !== 0) return fav;
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [
    compositions,
    soundSearch,
    soundCategory,
    soundSort,
    recentSoundIds,
    favorites.compositionSet,
  ]);
  const showSuggestedSounds =
    !soundSearch.trim() && soundCategory === "all" && soundPanelTab === "library";
  const suggestedSoundIds = [
    compositionKey,
    ...soundAlts.filter((id) => id !== SILENCE_SOUND_ID),
  ].filter((id, i, a) => id && a.indexOf(id) === i);
  const voiceFilters = voiceFilterChips(speakers);
  const filteredVoices = rankVoicesByPrefs(
    speakers.filter((s) =>
      voiceMatchesFilter(s, voiceFilter, favorites.voiceSet),
    ),
    voicePrefs,
    {
      pinModelId: programSpeakerModelId,
      favoriteIds: favorites.voiceSet,
    },
  );
  const usualVoiceId = readLastVoiceId();
  const programSpeakerId = programSpeakerModelId?.trim() || "";

  function adoptVoice(id: string, asSuggestion: boolean) {
    if (!id || id === speakerModelId) return;
    const swapped = swapAlt(speakerModelId, voiceAlts, id);
    setSpeakerModelId(swapped.current);
    setVoiceAlts(swapped.alts);
    setShowVoiceReason(asSuggestion);
    writeLastVoiceId(id);
    stopVoicePreview();
  }

  function adoptSound(id: string, asSuggestion: boolean) {
    if (id === compositionKey && soundMode === "soundscape") return;
    if (id !== SILENCE_SOUND_ID && compositionKey && soundMode === "soundscape") {
      const swapped = swapAlt(compositionKey, soundAlts, id);
      setSoundAlts(swapped.alts);
    }
    setSoundMode("soundscape");
    setCompositionKey(id);
    setShowSoundReason(asSuggestion);
    writeLastSoundForStyle(meditationStyle ?? "_general", id);
    stopAllAudioPreview();
  }

  function openVoicePanel() {
    setStagedVoiceId(speakerModelId);
    setVoiceFilter("All");
    setChangeKind("voice");
  }

  function openSoundPanel() {
    setStagedSoundId(
      soundMode === "mixer" ? "__mix__" : compositionKey,
    );
    setSoundPanelTab(soundMode === "mixer" ? "mixer" : "library");
    setSoundSearch("");
    setSoundCategory("all");
    setChangeKind("sound");
  }

  function commitVoicePanel() {
    if (stagedVoiceId) adoptVoice(stagedVoiceId, false);
    setChangeKind(null);
    window.setTimeout(() => changeVoiceBtnRef.current?.focus(), 0);
  }

  function commitSoundPanel() {
    if (soundPanelTab === "mixer" || stagedSoundId === "__mix__") {
      setSoundMode("mixer");
      setShowSoundReason(false);
    } else {
      adoptSound(stagedSoundId, false);
    }
    rememberRecentSound(
      soundPanelTab === "mixer" ? "mixer" : stagedSoundId,
    );
    setChangeKind(null);
    window.setTimeout(() => changeSoundBtnRef.current?.focus(), 0);
  }

  function closeChangePanel() {
    const kind = changeKind;
    setChangeKind(null);
    window.setTimeout(() => {
      if (kind === "voice") changeVoiceBtnRef.current?.focus();
      else changeSoundBtnRef.current?.focus();
    }, 0);
  }

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

      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-4 py-3.5 md:px-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
              Voice
            </p>
            <div
              className="hidden rounded-xl bg-background p-[3px] md:flex"
              role="group"
              aria-label="Meditation pacing"
            >
              {(["guided", "open"] as const).map((id) => {
                const on = id === "open" ? longerBreaks : !longerBreaks;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={soundControlsDisabled}
                    onClick={() => setLongerBreaks(id === "open")}
                    className={`cursor-pointer rounded-[9px] px-3.5 py-[7px] text-[13px] ${
                      on
                        ? "border border-border bg-card font-semibold text-foreground"
                        : "border border-transparent text-muted"
                    }`}
                  >
                    {id === "guided" ? "Guided" : "Open sits"}
                  </button>
                );
              })}
            </div>
          </div>
          <div
            className="flex w-full rounded-xl bg-background p-[3px] md:hidden"
            role="group"
            aria-label="Meditation pacing"
          >
            {(["guided", "open"] as const).map((id) => {
              const on = id === "open" ? longerBreaks : !longerBreaks;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={soundControlsDisabled}
                  onClick={() => setLongerBreaks(id === "open")}
                  className={`min-w-0 flex-1 cursor-pointer rounded-[9px] px-3.5 py-[7px] text-[13px] ${
                    on
                      ? "border border-border bg-card font-semibold text-foreground"
                      : "border border-transparent text-muted"
                  }`}
                >
                  {id === "guided" ? "Guided" : "Open sits"}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={soundControlsDisabled || !speakerModelId}
              aria-label={
                voicePreviewId === speakerModelId
                  ? "Stop voice preview"
                  : "Preview voice"
              }
              onClick={() =>
                speakerModelId ? toggleVoicePreview(speakerModelId) : undefined
              }
              style={PRIMARY_ACCENT_FILL_STYLE}
              className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent md:h-11 md:w-11"
            >
              {voicePreviewId === speakerModelId ? (
                <span className="block h-2.5 w-2.5 rounded-[1px] bg-current" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] leading-[1.25] text-foreground md:text-[19px]">
                {selectedVoice?.name ?? "Choose a voice"}
              </p>
              {selectedVoiceMeta ? (
                <p className="text-[13px] text-muted">
                  {selectedVoiceMeta.description}
                </p>
              ) : null}
              {showVoiceReason && voiceReason ? (
                <p className="text-[12px] text-accent-link">✦ {voiceReason}</p>
              ) : null}
            </div>
            <button
              ref={changeVoiceBtnRef}
              type="button"
              disabled={soundControlsDisabled}
              onClick={openVoicePanel}
              className="h-9 shrink-0 cursor-pointer rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground"
            >
              Change
            </button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto md:flex-wrap">
            <span className="shrink-0 text-[12px] text-muted">Or try</span>
            {voiceAlts.map((id) => {
              const v = speakers.find((s) => s.modelId === id);
              if (!v) return null;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={soundControlsDisabled}
                  onClick={() => adoptVoice(id, false)}
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card py-0 pl-1 pr-2.5 text-[13px] text-foreground"
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full accent-fill-gradient text-on-accent"
                    style={PRIMARY_ACCENT_FILL_STYLE}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVoicePreview(id);
                    }}
                    role="presentation"
                  >
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor">
                      <path d="M8 5v14l11-7L8 5z" />
                    </svg>
                  </span>
                  {v.name}
                </button>
              );
            })}
          </div>
          <div className="h-px bg-border" />
          <label className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[13px] font-semibold">Space</span>
            <span className="shrink-0 text-[12px] text-muted">Dry</span>
            <input
              type="range"
              min={0}
              max={100}
              aria-label="Space"
              disabled={soundControlsDisabled}
              value={voiceFxDial}
              onChange={(e) => setVoiceFxDial(Number(e.target.value))}
              className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--color-accent)]"
            />
            <span className="shrink-0 text-[12px] text-muted">Spacious</span>
          </label>
        </section>

        <section className="flex flex-col gap-3 rounded-[14px] border border-border bg-card px-3.5 py-3 md:px-4 md:py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
            Sound
          </p>
          <div className="flex items-center gap-3">
            {usingMix || !compositionKey ? (
              <button
                type="button"
                disabled={soundControlsDisabled}
                aria-label={compositionPlaying ? "Stop sound preview" : "Preview sound"}
                onClick={() => {
                  if (usingMix) {
                    void toggleRowPreview("music");
                    return;
                  }
                }}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-accent/35 bg-accent-soft/50 text-accent-link md:h-14 md:w-14"
              >
                <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M11 5 6 9H3v6h3l5 4V5z" />
                  <path d="M16 9.5a4 4 0 0 1 0 5" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg md:h-14 md:w-14"
                onClick={() => toggleCompositionPreview(compositionKey)}
                aria-label={compositionPlaying ? "Stop soundscape" : "Preview soundscape"}
              >
                {selectedSound?.coverImageThumbUrl || selectedSound?.coverImageUrl ? (
                  <img
                    src={
                      selectedSound.coverImageThumbUrl ||
                      selectedSound.coverImageUrl ||
                      ""
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="block h-full w-full bg-accent-soft" />
                )}
                <span className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-foreground">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                    <path d="M8 5v14l11-7L8 5z" />
                  </svg>
                </span>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-display text-[17px] leading-[1.25] text-foreground md:text-[19px]">
                {soundTitle}
              </p>
              <p className="text-[13px] text-muted">{soundDescription}</p>
              {usingMix ? (
                <p className="text-[12px] text-accent-link">✦ Your mix</p>
              ) : showSoundReason && soundReason ? (
                <p className="text-[12px] text-accent-link">✦ {soundReason}</p>
              ) : null}
            </div>
            <button
              ref={changeSoundBtnRef}
              type="button"
              disabled={soundControlsDisabled}
              onClick={openSoundPanel}
              className="h-9 shrink-0 cursor-pointer rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground"
            >
              Change
            </button>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto md:flex-wrap">
            <span className="shrink-0 text-[12px] text-muted">Or try</span>
            {soundAlts.map((id) => {
              if (id === SILENCE_SOUND_ID) {
                return (
                  <button
                    key="silence"
                    type="button"
                    disabled={soundControlsDisabled}
                    onClick={() => adoptSound(SILENCE_SOUND_ID, false)}
                    className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card py-0 pl-1 pr-2.5 text-[13px]"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft/70 text-muted">
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M11 5 6 9H3v6h3l5 4V5z" />
                        <path d="m22 9-6 6M16 9l6 6" />
                      </svg>
                    </span>
                    Silence
                  </button>
                );
              }
              const item = compositions.find((c) => c.key === id);
              if (!item) return null;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={soundControlsDisabled}
                  onClick={() => adoptSound(id, false)}
                  className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card py-0 pl-1 pr-2.5 text-[13px]"
                >
                  <span className="h-6 w-6 overflow-hidden rounded-full bg-accent-soft">
                    {item.coverImageThumbUrl || item.coverImageUrl ? (
                      <img
                        src={item.coverImageThumbUrl || item.coverImageUrl || ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </span>
                  {item.name}
                </button>
              );
            })}
          </div>
          <div className="h-px bg-border" />
          <label className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[13px] font-semibold">Balance</span>
            <span className="shrink-0 text-[12px] text-muted">Voice</span>
            <input
              type="range"
              min={0}
              max={100}
              aria-label="Balance"
              disabled={soundControlsDisabled}
              value={musicLevel}
              onChange={(e) => setMusicLevel(Number(e.target.value))}
              className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--color-accent)]"
            />
            <span className="shrink-0 text-[12px] text-muted">Music</span>
          </label>
        </section>
      </div>

      <CreateOneFlowPickerShell
        open={changeKind === "voice"}
        eyebrow="Change · Voice"
        title="Choose a voice"
        panelWidth="voice"
        footSummary={
          speakers.find((s) => s.modelId === stagedVoiceId)?.name
            ? `${speakers.find((s) => s.modelId === stagedVoiceId)!.name} selected`
            : undefined
        }
        confirmLabel="Use this voice"
        confirmDisabled={!stagedVoiceId}
        onClose={closeChangePanel}
        onConfirm={commitVoicePanel}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 md:px-6 md:py-3.5"
      >
        <div className="flex shrink-0 gap-1.5 overflow-x-auto pb-3">
          {voiceFilters.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setVoiceFilter(chip)}
              className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${
                voiceFilter === chip
                  ? "border border-accent bg-accent-soft/50 font-semibold"
                  : "border border-border bg-card"
              }`}
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-0.5">
            {filteredVoices.map((v) => {
              const meta = voiceDisplayMeta(v);
              const selected = stagedVoiceId === v.modelId;
              return (
                <button
                  key={v.modelId}
                  type="button"
                  onClick={() => setStagedVoiceId(v.modelId)}
                  className={`flex min-h-[52px] items-center gap-3 rounded-[10px] px-2.5 text-left ${
                    selected
                      ? "border border-accent/40 bg-accent-soft/40"
                      : "border border-transparent"
                  }`}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full accent-fill-gradient text-on-accent"
                    style={PRIMARY_ACCENT_FILL_STYLE}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVoicePreview(v.modelId);
                    }}
                    role="presentation"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor">
                      <path d="M8 5v14l11-7L8 5z" />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">{v.name}</span>
                    <span className="block text-[12px] text-muted">{meta.description}</span>
                  </span>
                  {programSpeakerId && v.modelId === programSpeakerId ? (
                    <span className="rounded-full bg-accent-soft/80 px-2 py-0.5 text-[11px] text-accent-link">
                      Program speaker
                    </span>
                  ) : hasVoicePrefs(voicePrefs) &&
                    filteredVoices.find((x) => x.modelId !== programSpeakerId)
                      ?.modelId === v.modelId ? (
                    <span className="rounded-full bg-accent-soft/80 px-2 py-0.5 text-[11px] text-accent-link">
                      Closest match
                    </span>
                  ) : usualVoiceId === v.modelId ? (
                    <span className="rounded-full bg-accent-soft/80 px-2 py-0.5 text-[11px] text-accent-link">
                      Your usual
                    </span>
                  ) : null}
                  <FavoriteHeartButton
                    pressed={favorites.voiceSet.has(v.modelId)}
                    label={v.name}
                    onToggle={() => favorites.toggleVoice(v.modelId)}
                  />
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {selected ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-on-accent">
                        ✓
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </CreateOneFlowPickerShell>

      <CreateOneFlowPickerShell
        open={changeKind === "sound"}
        eyebrow="Change · Sound"
        title="Choose a soundscape"
        panelWidth="sound"
        footSummary={
          soundPanelTab === "mixer"
            ? `${mixerPanelName} · ${mixLayerBits.length} layers`
            : stagedSoundId === SILENCE_SOUND_ID
              ? "Silence selected"
              : compositions.find((c) => c.key === stagedSoundId)?.name
                ? `${compositions.find((c) => c.key === stagedSoundId)!.name} selected`
                : undefined
        }
        confirmLabel={
          soundPanelTab === "mixer" ? "Use this mix" : "Use this sound"
        }
        onClose={closeChangePanel}
        onConfirm={commitSoundPanel}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 md:px-6 md:py-3.5"
      >
        <div className="flex shrink-0 flex-col gap-3">
          {soundPanelTab === "library" ? (
            <div className="flex h-10 items-center gap-2 rounded-[10px] border border-border bg-card px-3.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                value={soundSearch}
                onChange={(e) => setSoundSearch(e.target.value)}
                placeholder={`Search ${compositions.length} soundscapes`}
                className="min-w-0 flex-1 border-0 bg-transparent text-[14px] outline-none"
              />
            </div>
          ) : null}
          <SegmentedPillTabs<"library" | "mixer">
            aria-label="Sound library"
            value={soundPanelTab}
            onChange={setSoundPanelTab}
            equalWidth
            className="w-full rounded-xl border-0 bg-accent-soft/80 p-[3px]"
            selectedClassName="rounded-[9px] border border-border bg-card font-semibold text-foreground"
            idleClassName="rounded-[9px] border border-transparent font-medium text-muted"
            options={[
              { id: "library", label: "Soundscapes" },
              { id: "mixer", label: "Build your own" },
            ]}
          />
          {soundPanelTab === "library" ? (
            <div className="flex gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setSoundCategory("all")}
                className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${
                  soundCategory === "all"
                    ? "border border-accent bg-accent-soft/50 font-semibold"
                    : "border border-border bg-card"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSoundCategory("favourites")}
                className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${
                  soundCategory === "favourites"
                    ? "border border-accent bg-accent-soft/50 font-semibold"
                    : "border border-border bg-card"
                }`}
              >
                Favourites
              </button>
              {soundCategories.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSoundCategory(id)}
                  className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${
                    soundCategory === id
                      ? "border border-accent bg-accent-soft/50 font-semibold"
                      : "border border-border bg-card"
                  }`}
                >
                  {prettySubcategoryLabel(id)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {soundPanelTab === "library" ? (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {showSuggestedSounds ? (
              <div className="mb-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                  Suggested for this meditation
                </p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-2">
                  {suggestedSoundIds.slice(0, 3).map((id) => {
                    const item = compositions.find((c) => c.key === id);
                    if (!item) return null;
                    const selected = stagedSoundId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setStagedSoundId(id)}
                        className={`flex items-center gap-3 rounded-xl border p-2 text-left ${
                          selected
                            ? "border-2 border-accent p-[7px]"
                            : "border-border"
                        }`}
                      >
                        <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
                          {item.coverImageThumbUrl || item.coverImageUrl ? (
                            <img
                              src={
                                item.coverImageThumbUrl || item.coverImageUrl || ""
                              }
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-display text-[15px] leading-[1.25]">
                            {item.name}
                          </span>
                          <span className="mt-1 inline-flex rounded-full bg-accent-soft/80 px-2 py-0.5 text-[11px] text-accent-link">
                            {soundscapeCategoryLabel(item)}
                          </span>
                        </span>
                        <FavoriteHeartButton
                          pressed={favorites.compositionSet.has(item.key)}
                          label={item.name}
                          onToggle={() => favorites.toggleComposition(item.key)}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mb-2 mt-1 flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                All soundscapes · {filteredSoundscapes.length + 1}
              </p>
              <button
                type="button"
                className="text-[12px] text-muted"
                onClick={() =>
                  setSoundSort((s) => (s === "az" ? "recent" : "az"))
                }
              >
                {soundSort === "az" ? "A–Z ▾" : "Recently used ▾"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setStagedSoundId(SILENCE_SOUND_ID)}
                className={`flex items-center gap-3 rounded-xl border p-2 text-left ${
                  stagedSoundId === SILENCE_SOUND_ID
                    ? "border-2 border-accent p-[7px]"
                    : "border-border"
                }`}
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-accent-soft/70 text-accent-link">
                  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M11 5 6 9H3v6h3l5 4V5z" />
                    <path d="m22 9-6 6M16 9l6 6" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-[15px]">Silence</span>
                  <span className="text-[12px] text-muted">Voice only</span>
                </span>
              </button>
              {filteredSoundscapes.map((item) => {
                const selected = stagedSoundId === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStagedSoundId(item.key)}
                    className={`flex items-center gap-3 rounded-xl border p-2 text-left ${
                      selected ? "border-2 border-accent p-[7px]" : "border-border"
                    }`}
                  >
                    <span className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-accent-soft">
                      {item.coverImageThumbUrl || item.coverImageUrl ? (
                        <img
                          src={
                            item.coverImageThumbUrl || item.coverImageUrl || ""
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] leading-[1.25]">
                        {item.name}
                      </span>
                      <span className="mt-1 inline-flex rounded-full bg-accent-soft/80 px-2 py-0.5 text-[11px] text-accent-link">
                        {soundscapeCategoryLabel(item)}
                      </span>
                    </span>
                    <FavoriteHeartButton
                      pressed={favorites.compositionSet.has(item.key)}
                      label={item.name}
                      onToggle={() => favorites.toggleComposition(item.key)}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <div className="mb-3 flex flex-col gap-2 border-b border-border pb-3 md:flex-row md:items-center md:gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                Preset
              </span>
              {mixNaming ? (
                <>
                  <input
                    value={mixSaveName}
                    onChange={(e) => setMixSaveName(e.target.value)}
                    disabled={soundControlsDisabled}
                    placeholder="Untitled mix"
                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-card px-3 text-[14px] outline-none"
                  />
                  <button
                    type="button"
                    disabled={soundControlsDisabled || !mixSaveName.trim()}
                    onClick={() => saveNewMixPreset(mixSaveName.trim())}
                    className="h-10 shrink-0 cursor-pointer rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold disabled:opacity-40"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setMixNaming(false)}
                    className="h-10 shrink-0 cursor-pointer px-2 text-[13px] text-muted"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="relative min-w-0 flex-1">
                    <select
                      aria-label="Sound mix preset"
                      value={selectedMixKey}
                      disabled={soundControlsDisabled || factoryMixesLoading}
                      onChange={(e) => onSelectMixPreset(e.target.value)}
                      className="h-10 w-full appearance-none rounded-[10px] border border-border bg-card px-3 pr-8 text-[14px] outline-none disabled:opacity-50"
                    >
                      <option value="">
                        {factoryMixesLoading ? "Loading…" : "None"}
                      </option>
                      {factoryMixes.length > 0 ? (
                        <optgroup label="Factory">
                          {factoryMixes.map((p) => (
                            <option key={p.id} value={`factory:${p.id}`}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {userMixPresets.length > 0 ? (
                        <optgroup label="Your mixes">
                          {userMixPresets.map((p) => (
                            <option key={p.id} value={`user:${p.id}`}>
                              {p.name} (yours)
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                    <span
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted"
                      aria-hidden
                    >
                      ▾
                    </span>
                  </div>
                  {selectedMixKey.startsWith("user:") ? (
                    <button
                      type="button"
                      disabled={soundControlsDisabled}
                      onClick={updateUserMixPreset}
                      className="h-10 shrink-0 cursor-pointer rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Update
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={soundControlsDisabled}
                    onClick={() => {
                      setMixSaveName(
                        mixerPanelName === "Your mix"
                          ? "Untitled mix"
                          : mixerPanelName,
                      );
                      setMixNaming(true);
                    }}
                    className="h-10 shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold"
                  >
                    Save as new
                  </button>
                  {selectedMixKey.startsWith("user:") ? (
                    <button
                      type="button"
                      disabled={soundControlsDisabled}
                      onClick={deleteUserMixPreset}
                      className="shrink-0 cursor-pointer text-[13px] text-muted hover:text-foreground"
                    >
                      Delete
                    </button>
                  ) : null}
                </>
              )}
            </div>
            <div className="overflow-hidden rounded-[14px] border border-border bg-card">
              <MixerDeskRow
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
                playAriaLabel={playing.music ? "Stop music" : "Play music"}
                favoriteKeys={favorites.compositionSet}
                onToggleFavorite={favorites.toggleComposition}
              />
              <MixerDeskRow
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
                  playing.nature ? "Stop ambience" : "Play ambience"
                }
                favoriteKeys={favorites.compositionSet}
                onToggleFavorite={favorites.toggleComposition}
              />
              <DrumsLockedWrap locked={drumsLockedForMelodic} className="block">
                <MixerDeskRow
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
                  playAriaLabel={playing.drums ? "Stop drums" : "Play drums"}
                  favoriteKeys={favorites.compositionSet}
                  onToggleFavorite={favorites.toggleComposition}
                />
              </DrumsLockedWrap>
              <MixerDeskRow
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
                playAriaLabel={playing.noise ? "Stop noise" : "Play noise"}
                favoriteKeys={favorites.compositionSet}
                onToggleFavorite={favorites.toggleComposition}
                last
              />
            </div>
            <div className="mt-3 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  const any =
                    playing.music ||
                    playing.nature ||
                    playing.drums ||
                    playing.noise;
                  if (any) {
                    stopMixerBedPreviews();
                    return;
                  }
                  setPlaying({
                    music: Boolean(backgroundMusicKey),
                    nature: Boolean(backgroundNatureKey),
                    drums: Boolean(drumsPreviewKey),
                    noise: Boolean(backgroundNoiseKey),
                  });
                }}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-card py-0 pl-1 pr-3.5 text-[13px] font-semibold"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full accent-fill-gradient text-on-accent">
                  <svg
                    viewBox="0 0 24 24"
                    width="10"
                    height="10"
                    fill="currentColor"
                    aria-hidden
                  >
                    {playing.music ||
                    playing.nature ||
                    playing.drums ||
                    playing.noise ? (
                      <rect x="7" y="7" width="10" height="10" rx="1.5" />
                    ) : (
                      <path d="M8 5v14l11-7L8 5z" />
                    )}
                  </svg>
                </span>
                Play mix
              </button>
              <span className="text-[12px] text-muted">
                {mixLayerBits.length} layers
              </span>
            </div>
          </div>
        )}
      </CreateOneFlowPickerShell>
    </div>
  );
})
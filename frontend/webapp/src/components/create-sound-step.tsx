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
  type CSSProperties,
} from "react";
import * as Switch from "@radix-ui/react-switch";
import { DualStemPlayer, VOICE_FX_DIAL_DEFAULT } from "@consciously/common";
import { AppTopBarTrailingPortal } from "@/components/app-primary-tabs";
import { DrumsLockedWrap } from "@/components/drums-locked-wrap";
import {
  useLibraryPlayer,
  type LibraryActiveTrack,
} from "@/components/library-player-provider";
import { MixerDeskRow, MixerPresetChannel } from "@/components/mixer-channel";
import { SelectChevron } from "@/components/select-chevron";
import { CreateOneFlowPickerShell } from "@/components/create-one-flow-picker-shell";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import {
  SyncedMarqueeProvider,
  SyncedMarqueeTitle,
} from "@/components/synced-marquee-title";
import { bedElementVolume } from "@/lib/bed-volume";
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
  getMedimadeMediaBaseUrl,
  listBackgroundAudio,
  listFishSpeakers,
  listStyleVoicePrefs,
  peekBackgroundAudioCache,
  preloadBackgroundAudioCoverImages,
  DEFAULT_COMPOSITION_TAG_TYPES,
  type AdminCompositionTagType,
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
  compositionTagLabel,
  musicLevelToBedGain,
  SOUND_VOLUME_RECOMMENDED,
  VOICE_PACING_MAX,
  VOICE_PACING_MIN,
  VOICE_PACING_RECOMMENDED,
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
import {
  SOUND_SETTING_KEYS,
  VOICE_SETTING_KEYS,
  countNonEmptyOverrides,
  diffSoundSessionSettings,
  overrideHasKeys,
  resolveSoundSessionSettings,
  stripOverrideKeys,
  type CreateSoundSessionOverride,
  type CreateSoundSessionSettings,
} from "@/lib/create-sound-session-settings";
import { isMelodicMusicKey } from "@/lib/sound-taxonomy";
import {
  FIXED_SPEECH_PREVIEW_SPEED,
  effectiveSpeechifyRate,
  speakerPreviewLoudDrySampleKey,
  speakerPreviewLoudFxSampleKey,
  speakerSampleSpeedOrRate,
  withSpeakerSampleCacheBust,
} from "@/lib/speaker-sample-speed";

/** Sample line shown under the selected voice (plays the voice sample). */
const VOICE_SAMPLE_LINE = "Welcome to your personalised meditation";

function FaderRecommendedMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-3 w-3"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 2.5l2.6 6.3 6.9.6-5.2 4.5 1.6 6.7L12 16.8 6.1 20.6l1.6-6.7-5.2-4.5 6.9-.6L12 2.5z" />
    </svg>
  );
}

/** Must match `.create-sound-axis-fader` thumb size — thumb center ≠ raw %. */
const AXIS_FADER_THUMB_PX = 18;

function axisFaderThumbCenter(pct: number): string {
  const p = Math.min(100, Math.max(0, pct)) / 100;
  return `calc(${AXIS_FADER_THUMB_PX / 2}px + (100% - ${AXIS_FADER_THUMB_PX}px) * ${p})`;
}

function axisFaderThumbCenterStyle(pct: number): CSSProperties {
  return { left: axisFaderThumbCenter(pct) };
}

/** Library strip tracks started from Create · Sound. */
const CREATE_SOUND_PREVIEW_PREFIX = "create:sound:";

const BRAINWAVE_SYMBOLS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  theta: "θ",
  delta: "δ",
  gamma: "γ",
  binaural: "∿",
};

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
  /** Bed-only seconds before voice (0 or 20). */
  leadInSeconds: 0 | 20;
  /** Fade beds out after the voice ends. */
  fadeOut: boolean;
  claudeModel?: string;
  fishPauseMode?: FishPauseMode;
  skipVoiceFx?: boolean;
  skipSpeechifyLoudnorm?: boolean;
  speechifyEmotionVariants?: boolean;
  speechifyRate?: number;
} & ReturnType<typeof buildCreateMeditationBedJobFields>;

export type CreateSoundSessionOverrideMeta = {
  /** Sessions with a non-empty override. */
  overrideCount: number;
  /** Ids of the overridden sessions (for pill dots). */
  overriddenSessionIds: string[];
  /** null = All. */
  focusSessionId: string | null;
  expanded: boolean;
  voiceDiffers: boolean;
  soundDiffers: boolean;
};

export type CreateSoundStepHandle = {
  stopPreviews: () => void;
  /** Job extras for the current focus (All or the focused session). */
  getJobExtras: () => Promise<CreateSoundStepJobExtras>;
  /** Job extras for one session's resolved settings; null = All. */
  getJobExtrasForSession: (
    sessionId: string | null,
  ) => Promise<CreateSoundStepJobExtras>;
  getSessionOverrideMeta: () => CreateSoundSessionOverrideMeta;
  setSessionPickerExpanded: (v: boolean) => void;
  setFocusSessionId: (id: string | null) => void;
  clearAllSessionOverrides: () => void;
  resetVoiceOverrideForFocus: () => void;
  resetSoundOverrideForFocus: () => void;
  togglePreviewMix: () => void;
  /** Pause/resume whichever preview is active (strip transport). */
  togglePreviewTransport: () => void;
  previewMixPlaying: boolean;
};

type CreateSoundStepProps = {
  disabled?: boolean;
  meditationStyle?: string | null;
  programSpeakerModelId?: string | null;
  programTitle?: string | null;
  programVoicePrefs?: VoicePreferredTraits | null;
  onPreviewMixPlayingChange?: (playing: boolean) => void;
  /** Attached program id; per-session overrides only exist with a program. */
  programId?: string | null;
  /** When length >= 1 and a program is attached, per-session mode is available. */
  programSessionIds?: string[] | null;
  onSessionOverrideMetaChange?: (meta: CreateSoundSessionOverrideMeta) => void;
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
  leadInSeconds: 0 | 20;
  fadeOut: boolean;
  longerBreaks: boolean;
  programId: string | null;
  /** programId + session ids; overrides only restore when this matches. */
  sessionKey: string;
  sessionOverrides: Record<string, CreateSoundSessionOverride>;
};

function sessionKeyFor(
  programId: string | null | undefined,
  sessionIds: string[] | null | undefined,
): string {
  if (!programId || !sessionIds || sessionIds.length < 1) return "";
  return `${programId}|${sessionIds.join(",")}`;
}

function SessionDiffNote({
  sessionNumber,
  onReset,
  disabled,
}: {
  sessionNumber: number;
  onReset: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] bg-accent-soft px-3 py-2 text-[13px] text-foreground">
      <span
        aria-hidden
        className="h-2 w-2 shrink-0 rounded-full bg-accent"
      />
      <span className="min-w-0">Session {sessionNumber} differs from All</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onReset}
        className="ml-auto shrink-0 cursor-pointer font-semibold text-accent-link disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reset to all
      </button>
    </div>
  );
}

function formatBrainwaveBadge(
  tag: string,
  binauralHz: number | null | undefined,
): string {
  const key = tag.trim().toLowerCase();
  const sym = BRAINWAVE_SYMBOLS[key] ?? compositionTagLabel(tag);
  if (
    typeof binauralHz === "number" &&
    Number.isFinite(binauralHz) &&
    binauralHz > 0
  ) {
    return `${sym} ${Math.round(binauralHz)} Hz`;
  }
  return sym;
}

function soundscapeTagBits(
  item: BackgroundAudioItem | null,
  tagTypes: AdminCompositionTagType[],
): { brainwave: string | null; others: string[] } {
  if (!item) return { brainwave: null, others: [] };
  const tags = item.tags ?? [];
  const types =
    tagTypes.length > 0 ? tagTypes : DEFAULT_COMPOSITION_TAG_TYPES;
  const brainwaveType =
    types.find((t) => t.id === "brainwave") ??
    DEFAULT_COMPOSITION_TAG_TYPES.find((t) => t.id === "brainwave");
  const brainwaveSet = new Set(brainwaveType?.tags ?? []);
  const brainwaveTag = tags.find((t) => brainwaveSet.has(t)) ?? null;
  const others = tags
    .filter((t) => t !== brainwaveTag)
    .slice(0, 4)
    .map(compositionTagLabel);
  return {
    brainwave: brainwaveTag
      ? formatBrainwaveBadge(brainwaveTag, item.binauralHz)
      : null,
    others,
  };
}

function SoundscapeCardMeta({
  item,
}: {
  item: BackgroundAudioItem;
}) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      <span className="inline-flex rounded-full bg-accent-soft/80 px-2 py-0.5 text-[11px] text-accent-link">
        {soundscapeCategoryLabel(item)}
      </span>
      {item.adminFavourite ? (
        <span className="inline-flex rounded-full border border-accent/40 bg-accent-soft/50 px-2 py-0.5 text-[11px] font-semibold text-accent-link">
          Our Picks
        </span>
      ) : null}
    </span>
  );
}

/** Mist circular play/pause — pause bars match play triangle size. */
function MistPlayBadge({
  playing,
  size = "md",
}: {
  playing: boolean;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-7 w-7" : "h-7 w-7 md:h-8 md:w-8";
  const icon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span
      className={`flex ${box} items-center justify-center rounded-full accent-fill-gradient text-on-accent shadow-[0_1px_4px_rgb(15_27_45_/_0.2)]`}
      style={PRIMARY_ACCENT_FILL_STYLE}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className={icon} fill="currentColor">
        {playing ? (
          <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
        ) : (
          <path d="M8 5v14l11-7L8 5z" />
        )}
      </svg>
    </span>
  );
}

function TagTypeMultiSelect({
  type,
  selected,
  onChange,
}: {
  type: AdminCompositionTagType;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label =
    selected.length === 0
      ? type.label
      : `${type.label} (${selected.length} selected)`;

  function toggle(tag: string) {
    if (selectedSet.has(tag)) {
      onChange(selected.filter((t) => t !== tag));
    } else {
      onChange([...selected, tag]);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 basis-[9.5rem]">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 w-full items-center justify-between gap-2 rounded-[10px] border bg-card px-3 text-left text-[13px] ${
          selected.length > 0
            ? "border-accent font-semibold text-foreground"
            : "border-border font-medium text-muted"
        }`}
      >
        <span className="truncate">{label}</span>
        <SelectChevron open={open} />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-56 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {type.tags.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-muted">No tags yet</p>
          ) : (
            type.tags.map((tag) => {
              const checked = selectedSet.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  role="option"
                  aria-selected={checked}
                  onClick={() => toggle(tag)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-foreground hover:bg-accent-soft/50"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-accent bg-accent text-on-accent"
                        : "border-border bg-background"
                    }`}
                  >
                    {checked ? (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 12l5 5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="truncate">{compositionTagLabel(tag)}</span>
                </button>
              );
            })
          )}
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-0.5 w-full border-t border-border px-3 py-2 text-left text-[12px] text-muted hover:text-foreground"
            >
              Clear {type.label}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

let flowSoundLock: FlowSoundLock | null = null;

/** Drop remembered per-session overrides (call once a flow has been generated). */
export function clearCreateSoundSessionOverridesLock(): void {
  if (flowSoundLock) flowSoundLock.sessionOverrides = {};
}

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
    programId = null,
    programSessionIds = null,
    onSessionOverrideMetaChange,
  },
  ref,
) {
  const {
    playTrack,
    dismiss: dismissLibraryPlayer,
    nowPlaying,
    playingS3Key,
    toggleCurrent: toggleLibraryPlayback,
    patchNowPlaying,
    bedVolumeApiRef,
    setCreateSoundStripBridge,
  } = useLibraryPlayer();
  /** Create Sound pacing: Speechify = admin rate ± integer (−5…+5); Fish unused for samples. */
  const [pacingPercent, setPacingPercent] = useState(VOICE_PACING_RECOMMENDED);
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
  const [musicLevel, setMusicLevel] = useState(SOUND_VOLUME_RECOMMENDED);
  const [leadInSeconds, setLeadInSeconds] = useState<0 | 20>(20);
  const [fadeOut, setFadeOut] = useState(true);
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
  const voiceFxOn = showCreateAudioDevControls ? speakerFxPreviewOn : true;

  const [voiceAlts, setVoiceAlts] = useState<string[]>([]);
  const [soundAlts, setSoundAlts] = useState<string[]>([]);
  const [voiceReason, setVoiceReason] = useState("");
  const [soundReason, setSoundReason] = useState("");
  const [showVoiceReason, setShowVoiceReason] = useState(true);
  const [showSoundReason, setShowSoundReason] = useState(true);
  const [picksReady, setPicksReady] = useState(false);
  const [changeKind, setChangeKind] = useState<null | "voice" | "sound">(null);
  const [stagedVoiceId, setStagedVoiceId] = useState("");
  const [stagedSoundId, setStagedSoundId] = useState("");
  const [soundPanelTab, setSoundPanelTab] = useState<"library" | "mixer">(
    "library",
  );
  const [voiceFiltersActive, setVoiceFiltersActive] = useState<string[]>([]);
  const [soundCategory, setSoundCategory] = useState("our-picks");
  /** Selected tags keyed by tag-type id (multi-select within each type). */
  const [soundTagFilters, setSoundTagFilters] = useState<
    Record<string, string[]>
  >({});
  const [compositionTagTypes, setCompositionTagTypes] = useState<
    AdminCompositionTagType[]
  >(
    () =>
      peekBackgroundAudioCache()?.compositionTagTypes ??
      DEFAULT_COMPOSITION_TAG_TYPES,
  );
  const [soundSort, setSoundSort] = useState<"az" | "recent">("az");
  const [voicePreviewId, setVoicePreviewId] = useState<string | null>(null);
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false);
  /**
   * Voice remains represented on the strip after a joint strip-pause (title
   * still includes the speaker). Cleared only when voice is stopped from the
   * VOICE card, ends, or previews are dismissed.
   */
  const [voiceOnStrip, setVoiceOnStrip] = useState(false);
  const [previewMixPlaying, setPreviewMixPlaying] = useState(false);
  const voicePlayerRef = useRef<DualStemPlayer | null>(null);
  if (!voicePlayerRef.current) voicePlayerRef.current = new DualStemPlayer();
  /** When true, sample restarts at end (speaker previews loop). */
  const voiceLoopWantedRef = useRef(false);
  const togglePreviewMixRef = useRef<(() => void) | null>(null);
  const togglePreviewTransportRef = useRef<() => void>(() => {});
  const isCreateLibraryPreview =
    nowPlaying?.s3Key?.startsWith(CREATE_SOUND_PREVIEW_PREFIX) === true;
  const isCreateBedStrip =
    nowPlaying?.s3Key === `${CREATE_SOUND_PREVIEW_PREFIX}mix` ||
    nowPlaying?.s3Key?.startsWith(`${CREATE_SOUND_PREVIEW_PREFIX}scape:`) ===
      true;
  const createBedPlaying = Boolean(
    isCreateBedStrip &&
      playingS3Key &&
      playingS3Key === nowPlaying?.s3Key,
  );
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
  /** Selected soundscape/mix is what’s mounted and playing in the strip. */
  const selectedSoundPlaying =
    createBedPlaying &&
    (soundMode === "mixer"
      ? nowPlaying?.s3Key === `${CREATE_SOUND_PREVIEW_PREFIX}mix`
      : Boolean(compositionKey) &&
        (nowPlaying?.s3Key ===
          `${CREATE_SOUND_PREVIEW_PREFIX}scape:${compositionKey}` ||
          (nowPlaying?.s3Key === `${CREATE_SOUND_PREVIEW_PREFIX}mix` &&
            soundMode === "soundscape")));
  const selectedVoicePlaying =
    voicePreviewPlaying && voicePreviewId === speakerModelId;
  const [compositionPlaying, setCompositionPlaying] = useState(false);
  const [compositionPreviewKey, setCompositionPreviewKey] = useState<string | null>(
    null,
  );
  const compositionAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const anyPreview = createBedPlaying || voicePreviewPlaying;
    onPreviewMixPlayingChange?.(anyPreview);
    setPreviewMixPlaying(anyPreview);
    if (!isCreateLibraryPreview) {
      setCompositionPlaying(false);
      setCompositionPreviewKey(null);
      return;
    }
    const key = nowPlaying?.s3Key ?? "";
    if (key === `${CREATE_SOUND_PREVIEW_PREFIX}mix`) {
      if (soundMode === "soundscape" && compositionKey) {
        setCompositionPreviewKey(compositionKey);
        setCompositionPlaying(createBedPlaying);
      } else {
        setCompositionPlaying(createBedPlaying);
        setCompositionPreviewKey(null);
      }
    } else if (key.startsWith(`${CREATE_SOUND_PREVIEW_PREFIX}scape:`)) {
      const scapeKey = key.slice(`${CREATE_SOUND_PREVIEW_PREFIX}scape:`.length);
      setCompositionPreviewKey(scapeKey);
      setCompositionPlaying(createBedPlaying);
    } else {
      setCompositionPlaying(false);
      setCompositionPreviewKey(null);
    }
  }, [
    onPreviewMixPlayingChange,
    createBedPlaying,
    voicePreviewPlaying,
    isCreateLibraryPreview,
    nowPlaying?.s3Key,
    soundMode,
    compositionKey,
  ]);

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

  function applyBackgroundAudioData(data: Awaited<ReturnType<typeof listBackgroundAudio>>) {
    setBackgroundNature(data.nature);
    setBackgroundMusic(data.music);
    setCompositions(data.compositions);
    setBackgroundDrums(data.drums);
    setBackgroundNoise(data.noise);
    setFactoryMixes(data.factoryMixes ?? []);
    setCompositionTagTypes(
      data.compositionTagTypes?.length
        ? data.compositionTagTypes
        : DEFAULT_COMPOSITION_TAG_TYPES,
    );
    const fromApi = data.baseUrl?.trim();
    const envMediaBase = getMedimadeMediaBaseUrl();
    setMediaBaseUrl(fromApi || envMediaBase || null);
    preloadBackgroundAudioCoverImages(data);
  }

  useEffect(() => {
    let cancelled = false;
    const envMediaBase = getMedimadeMediaBaseUrl();
    (async () => {
      try {
        const data = await listBackgroundAudio();
        if (cancelled) return;
        applyBackgroundAudioData(data);
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

  // ── Per-session overrides (Program attached) ──────────────────────────
  const sessionKey = sessionKeyFor(programId, programSessionIds);
  const sessionMode = sessionKey !== "";
  const [sessionOverrides, setSessionOverrides] = useState<
    Record<string, CreateSoundSessionOverride>
  >(() =>
    sessionKey !== "" && flowSoundLock?.sessionKey === sessionKey
      ? { ...flowSoundLock.sessionOverrides }
      : {},
  );
  /** null = All. */
  const [focusSessionId, setFocusSessionIdState] = useState<string | null>(
    null,
  );
  const [sessionPickerExpanded, setSessionPickerExpandedState] =
    useState(false);
  /** Program-wide ("All") settings; only updated while All is focused. */
  const allSettingsRef = useRef<CreateSoundSessionSettings | null>(null);
  /** True from a focus switch / reset until the commit that applied it. */
  const hydratingFocusRef = useRef(false);
  const sessionOverridesRef = useRef(sessionOverrides);
  sessionOverridesRef.current = sessionOverrides;
  const focusSessionIdRef = useRef(focusSessionId);
  focusSessionIdRef.current = focusSessionId;

  const currentSettings = useMemo<CreateSoundSessionSettings>(
    () => ({
      speakerModelId,
      longerBreaks,
      pacingPercent,
      voiceFxDial,
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
      selectedMixKey,
      musicLevel,
      leadInSeconds,
      fadeOut,
    }),
    [
      speakerModelId,
      longerBreaks,
      pacingPercent,
      voiceFxDial,
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
      selectedMixKey,
      musicLevel,
      leadInSeconds,
      fadeOut,
    ],
  );
  const currentSettingsRef = useRef(currentSettings);
  currentSettingsRef.current = currentSettings;

  /** Snapshot the editable UI state into the settings shape. */
  function snapshotSettings(): CreateSoundSessionSettings {
    return currentSettingsRef.current;
  }

  /** Push a settings object back into the card state. */
  function applySettings(next: CreateSoundSessionSettings) {
    setSpeakerModelId(next.speakerModelId);
    setLongerBreaks(next.longerBreaks);
    setPacingPercent(next.pacingPercent);
    setVoiceFxDial(next.voiceFxDial);
    setSoundMode(next.soundMode);
    setCompositionKey(next.compositionKey);
    setBackgroundNatureKey(next.backgroundNatureKey);
    setBackgroundMusicKey(next.backgroundMusicKey);
    setBackgroundDrumsKey(next.backgroundDrumsKey);
    setBackgroundNoiseKey(next.backgroundNoiseKey);
    setBackgroundNatureGain(next.backgroundNatureGain);
    setBackgroundMusicGain(next.backgroundMusicGain);
    setBackgroundDrumsGain(next.backgroundDrumsGain);
    setBackgroundNoiseGain(next.backgroundNoiseGain);
    setSelectedMixKey(next.selectedMixKey);
    setMusicLevel(next.musicLevel);
    setLeadInSeconds(next.leadInSeconds);
    setFadeOut(next.fadeOut);
    setMixBaseline({
      musicKey: next.backgroundMusicKey,
      natureKey: next.backgroundNatureKey,
      drumsKey: next.backgroundDrumsKey,
      noiseKey: next.backgroundNoiseKey,
      musicGain: next.backgroundMusicGain,
      natureGain: next.backgroundNatureGain,
      drumsGain: next.backgroundDrumsGain,
      noiseGain: next.backgroundNoiseGain,
    });
  }

  // Program removed / changed → clear overrides, back to All, collapse.
  const prevSessionKeyRef = useRef(sessionKey);
  useEffect(() => {
    if (prevSessionKeyRef.current === sessionKey) return;
    prevSessionKeyRef.current = sessionKey;
    const all = allSettingsRef.current;
    if (focusSessionIdRef.current != null && all) {
      hydratingFocusRef.current = true;
      applySettings(all);
    }
    setSessionOverrides({});
    setFocusSessionIdState(null);
    setSessionPickerExpandedState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on sessionKey only
  }, [sessionKey]);

  // Sync UI edits into All (focus = All) or the focused session's override.
  useEffect(() => {
    if (!picksReady) return;
    if (hydratingFocusRef.current) return;
    if (focusSessionId == null || !sessionMode) {
      allSettingsRef.current = currentSettings;
      return;
    }
    const all = allSettingsRef.current;
    if (!all) return;
    const diff = diffSoundSessionSettings(all, currentSettings);
    const empty = Object.keys(diff).length === 0;
    setSessionOverrides((prev) => {
      const had = prev[focusSessionId];
      if (empty) {
        if (!had) return prev;
        const { [focusSessionId]: _drop, ...rest } = prev;
        return rest;
      }
      if (
        had &&
        Object.keys(had).length === Object.keys(diff).length &&
        (Object.keys(diff) as Array<keyof CreateSoundSessionSettings>).every(
          (k) => had[k] === diff[k],
        )
      ) {
        return prev;
      }
      return { ...prev, [focusSessionId]: diff };
    });
  }, [picksReady, focusSessionId, sessionMode, currentSettings]);

  // Runs after the sync effect above: the switch/reset commit has landed.
  useEffect(() => {
    hydratingFocusRef.current = false;
  });

  function setFocusSessionId(id: string | null) {
    if (!sessionMode) return;
    if (id === focusSessionIdRef.current) return;
    if (id != null && !programSessionIds?.includes(id)) return;
    const all =
      focusSessionIdRef.current == null
        ? snapshotSettings()
        : allSettingsRef.current;
    if (!all) {
      setFocusSessionIdState(id);
      return;
    }
    allSettingsRef.current = all;
    hydratingFocusRef.current = true;
    stopAllAudioPreview();
    applySettings(
      id == null
        ? all
        : resolveSoundSessionSettings(all, sessionOverridesRef.current[id]),
    );
    setFocusSessionIdState(id);
  }

  function setSessionPickerExpanded(v: boolean) {
    if (!sessionMode) return;
    if (!v) setFocusSessionId(null);
    setSessionPickerExpandedState(v);
  }

  function clearAllSessionOverrides() {
    if (!sessionMode) return;
    const all = allSettingsRef.current;
    setSessionOverrides({});
    if (focusSessionIdRef.current != null && all) {
      hydratingFocusRef.current = true;
      applySettings(all);
    }
  }

  function resetFocusedOverrideKeys(
    keys: ReadonlyArray<keyof CreateSoundSessionSettings>,
  ) {
    const id = focusSessionIdRef.current;
    const all = allSettingsRef.current;
    if (!sessionMode || id == null || !all) return;
    const nextOverride = stripOverrideKeys(
      sessionOverridesRef.current[id],
      keys,
    );
    const next = { ...sessionOverridesRef.current };
    if (nextOverride) next[id] = nextOverride;
    else delete next[id];
    hydratingFocusRef.current = true;
    setSessionOverrides(next);
    applySettings(resolveSoundSessionSettings(all, nextOverride));
  }

  const focusOverride =
    focusSessionId != null ? sessionOverrides[focusSessionId] : undefined;
  const sessionFocused = sessionMode && focusSessionId != null;
  const focusSessionNumber =
    focusSessionId != null
      ? (programSessionIds?.indexOf(focusSessionId) ?? -1) + 1
      : 0;
  const voiceDiffers =
    sessionFocused && overrideHasKeys(focusOverride, VOICE_SETTING_KEYS);
  const soundDiffers =
    sessionFocused && overrideHasKeys(focusOverride, SOUND_SETTING_KEYS);
  const overriddenSessionIds = sessionMode
    ? Object.keys(sessionOverrides).filter(
        (id) => Object.keys(sessionOverrides[id] ?? {}).length > 0,
      )
    : [];
  const overrideCount = sessionMode
    ? countNonEmptyOverrides(sessionOverrides)
    : 0;
  const sessionOverrideMeta: CreateSoundSessionOverrideMeta = {
    overrideCount,
    overriddenSessionIds,
    focusSessionId: sessionMode ? focusSessionId : null,
    expanded: sessionMode && sessionPickerExpanded,
    voiceDiffers,
    soundDiffers,
  };
  const sessionOverrideMetaRef = useRef(sessionOverrideMeta);
  sessionOverrideMetaRef.current = sessionOverrideMeta;
  const onSessionOverrideMetaChangeRef = useRef(onSessionOverrideMetaChange);
  onSessionOverrideMetaChangeRef.current = onSessionOverrideMetaChange;
  const sessionOverrideMetaKey = `${overrideCount}|${overriddenSessionIds.join(",")}|${sessionOverrideMeta.focusSessionId ?? ""}|${sessionOverrideMeta.expanded}|${voiceDiffers}|${soundDiffers}`;
  useEffect(() => {
    onSessionOverrideMetaChangeRef.current?.(sessionOverrideMetaRef.current);
  }, [sessionOverrideMetaKey]);

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
      // Echo + Volume always open at recommended — ignore prior lock / session.
      setVoiceFxDial(VOICE_FX_DIAL_DEFAULT);
      setMusicLevel(SOUND_VOLUME_RECOMMENDED);
      setLeadInSeconds(lock.leadInSeconds);
      setFadeOut(lock.fadeOut);
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
    // While a session is focused the card shows its resolved values — the lock
    // always remembers the program-wide (All) ones.
    const base =
      sessionMode && focusSessionId != null && allSettingsRef.current
        ? allSettingsRef.current
        : {
            speakerModelId,
            compositionKey,
            soundMode,
            voiceFxDial,
            musicLevel,
            leadInSeconds,
            fadeOut,
            longerBreaks,
          };
    flowSoundLock = {
      speakerModelId: base.speakerModelId,
      compositionKey: base.compositionKey,
      soundMode: base.soundMode,
      voiceAlts,
      soundAlts,
      showVoiceReason,
      showSoundReason,
      voiceFxDial: base.voiceFxDial,
      musicLevel: base.musicLevel,
      leadInSeconds: base.leadInSeconds,
      fadeOut: base.fadeOut,
      longerBreaks: base.longerBreaks,
      programId: sessionMode ? (programId ?? null) : null,
      sessionKey,
      sessionOverrides: sessionMode ? sessionOverrides : {},
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
    leadInSeconds,
    fadeOut,
    longerBreaks,
    sessionMode,
    focusSessionId,
    programId,
    sessionKey,
    sessionOverrides,
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
    setCompositionPreviewKey(null);
  }

  function stopMixerBedPreviews() {
    pauseGaplessBed(previewNatureRef.current);
    pauseGaplessBed(previewMusicRef.current);
    pauseGaplessBed(previewDrumsRef.current);
    pauseGaplessBed(previewNoiseRef.current);
    setPlaying({ nature: false, music: false, drums: false, noise: false });
  }

  const stopVoicePreview = useCallback(() => {
    voiceLoopWantedRef.current = false;
    const player = voicePlayerRef.current;
    if (player) {
      player.onEnded = null;
      player.stop();
    }
    setVoicePreviewPlaying(false);
    setVoicePreviewId(null);
    setVoiceOnStrip(false);
  }, []);

  const stopLocalPreviewAudio = useCallback(() => {
    stopVoicePreview();
    stopCompositionPreview();
    stopMixerBedPreviews();
  }, [stopVoicePreview]);

  const stopAllAudioPreview = useCallback(() => {
    stopLocalPreviewAudio();
    if (nowPlaying?.s3Key?.startsWith(CREATE_SOUND_PREVIEW_PREFIX)) {
      dismissLibraryPlayer();
    }
    setPreviewMixPlaying(false);
    setVoiceCardStopNonce((n) => n + 1);
  }, [stopLocalPreviewAudio, nowPlaying?.s3Key, dismissLibraryPlayer]);

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
          fallbackUrl: null,
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
    const speedOrRate = speakerSampleSpeedOrRate(
      speaker?.brand,
      speaker?.speechifyRate,
      pacingPercent,
    );
    return withSpeakerSampleCacheBust(
      mediaFileUrl(
        mediaBaseUrl,
        speakerPreviewLoudDrySampleKey(modelId, speedOrRate, speaker?.brand),
      ),
      speaker?.updatedAt,
    );
  }

  function speakerPreviewWetUrl(modelId: string): string | null {
    if (!mediaBaseUrl || !modelId) return null;
    const speaker = speakers.find((s) => s.modelId === modelId);
    const speedOrRate = speakerSampleSpeedOrRate(
      speaker?.brand,
      speaker?.speechifyRate,
      pacingPercent,
    );
    return withSpeakerSampleCacheBust(
      mediaFileUrl(
        mediaBaseUrl,
        speakerPreviewLoudFxSampleKey(modelId, speedOrRate, speaker?.brand),
      ),
      speaker?.updatedAt,
    );
  }

  function soundscapePreviewUrl(key: string): string | null {
    if (!mediaBaseUrl || !key) return null;
    return mediaFileUrl(mediaBaseUrl, backgroundAudioPlaybackKey(key));
  }

  function selectedSoundLabelForPreview(): string {
    if (soundMode === "mixer") {
      if (selectedMixKey.startsWith("factory:")) {
        return (
          factoryMixes.find((p) => `factory:${p.id}` === selectedMixKey)
            ?.name ?? "Custom mix"
        );
      }
      if (selectedMixKey.startsWith("user:")) {
        const name = userMixPresets.find(
          (p) => `user:${p.id}` === selectedMixKey,
        )?.name;
        return name?.trim() || "Custom mix";
      }
      return "Custom mix";
    }
    if (compositionKey) {
      return (
        compositions.find((c) => c.key === compositionKey)?.name ?? "Soundscape"
      );
    }
    return "Silence";
  }

  /** Strip title: soundscape/mix name, plus speaker only while a voice sample is playing. */
  function createPreviewTitle(opts: {
    soundLabel?: string | null;
    voiceName?: string | null;
  }): string {
    const parts = [opts.soundLabel?.trim(), opts.voiceName?.trim()].filter(
      (p): p is string => Boolean(p),
    );
    return parts.join(" · ") || "Preview";
  }

  function voiceNameForPreview(modelId: string | null | undefined): string | null {
    const id = modelId?.trim() || "";
    if (!id) return null;
    return speakers.find((s) => s.modelId === id)?.name?.trim() || "Voice";
  }

  function soundLabelFromCreateStrip(): string | null {
    const key = nowPlaying?.s3Key ?? "";
    if (key.startsWith(`${CREATE_SOUND_PREVIEW_PREFIX}scape:`)) {
      const scapeKey = key.slice(`${CREATE_SOUND_PREVIEW_PREFIX}scape:`.length);
      return (
        compositions.find((c) => c.key === scapeKey)?.name?.trim() || "Soundscape"
      );
    }
    if (key === `${CREATE_SOUND_PREVIEW_PREFIX}mix`) {
      return selectedSoundLabelForPreview();
    }
    return null;
  }

  function syncCreateStripTitle(voiceName: string | null) {
    if (!nowPlaying?.s3Key?.startsWith(CREATE_SOUND_PREVIEW_PREFIX)) return;
    const soundLabel = soundLabelFromCreateStrip();
    const title = createPreviewTitle({ soundLabel, voiceName });
    patchNowPlaying((prev) => (prev ? { ...prev, title } : prev));
  }

  /** Beds/soundscape only — voice samples play on a separate local player. */
  function buildCreateBedTrack(opts: {
    s3Key: string;
    soundLabel?: string | null;
    /** Soundscape file vs multi-channel mix beds. */
    kind: "soundscape" | "mix";
    musicKey?: string;
    natureKey?: string;
    drumsKey?: string;
    noiseKey?: string;
    musicGain?: number;
    natureGain?: number;
    drumsGain?: number;
    noiseGain?: number;
    coverImageUrl?: string | null;
  }): LibraryActiveTrack | null {
    const musicKey = opts.musicKey?.trim() || "";
    const natureKey = opts.natureKey?.trim() || "";
    const drumsKey = opts.drumsKey?.trim() || "";
    const noiseKey = opts.noiseKey?.trim() || "";
    const hasBeds = Boolean(musicKey || natureKey || drumsKey || noiseKey);
    if (!hasBeds) return null;
    const soundLabel = opts.soundLabel?.trim() || null;
    const voiceName = voicePreviewPlaying
      ? voiceNameForPreview(voicePreviewId)
      : null;
    const title = createPreviewTitle({ soundLabel, voiceName });
    const cover = opts.coverImageUrl?.trim() || undefined;
    const musicGain = opts.musicGain ?? 0;
    const natureGain = opts.natureGain ?? 0;
    const drumsGain = opts.drumsGain ?? 0;
    const noiseGain = opts.noiseGain ?? 0;

    if (opts.kind === "soundscape" && musicKey && soundscapePreviewUrl(musicKey)) {
      return {
        url: soundscapePreviewUrl(musicKey)!,
        title,
        s3Key: opts.s3Key,
        ambientOnly: true,
        ambientKind: "soundscape",
        liveMix: false,
        musicKey,
        musicGain,
        leadInSeconds: 0,
        fadeOut: true,
        ...(cover ? { coverImageUrl: cover } : {}),
      };
    }
    return {
      url: "",
      title,
      s3Key: opts.s3Key,
      ambientOnly: true,
      ambientKind: "mix",
      liveMix: true,
      musicKey,
      natureKey,
      drumsKey,
      noiseKey,
      musicGain,
      natureGain,
      drumsGain,
      noiseGain,
      leadInSeconds: 0,
      fadeOut: true,
      ...(cover ? { coverImageUrl: cover } : {}),
    };
  }

  function playCreateBedTrack(track: LibraryActiveTrack) {
    stopCompositionPreview();
    stopMixerBedPreviews();
    // Soft-paused voice isn't playing — don't keep it on the strip with new beds.
    if (voiceOnStrip && !voicePreviewPlaying) {
      setVoiceOnStrip(false);
      setVoicePreviewId(null);
    }
    playTrack(track);
  }

  function ensureVoiceLabelStrip(modelId: string, voiceName: string) {
    // Share the strip with beds only while they are actually playing.
    // A paused soundscape stays mounted until something else starts — then it drops.
    if (createBedPlaying && soundLabelFromCreateStrip()) {
      syncCreateStripTitle(voiceName);
      return;
    }
    const s3Key = `${CREATE_SOUND_PREVIEW_PREFIX}voice:${modelId}`;
    playTrack({
      s3Key,
      title: voiceName,
      url: "",
      ambientOnly: true,
      ambientKind: "mix",
      liveMix: true,
    });
  }

  function clearVoiceFromStrip() {
    const soundLabel = soundLabelFromCreateStrip();
    if (soundLabel) {
      syncCreateStripTitle(null);
      return;
    }
    if (nowPlaying?.s3Key?.startsWith(`${CREATE_SOUND_PREVIEW_PREFIX}voice:`)) {
      dismissLibraryPlayer();
    }
  }

  /** Drop beds from the strip while voice keeps playing (SOUND card pause). */
  function clearSoundFromStripKeepVoice() {
    const modelId = (voicePreviewId || speakerModelId).trim();
    if (!modelId) {
      toggleLibraryPlayback();
      return;
    }
    const voiceName = voiceNameForPreview(modelId) || "Voice";
    playTrack({
      s3Key: `${CREATE_SOUND_PREVIEW_PREFIX}voice:${modelId}`,
      title: voiceName,
      url: "",
      ambientOnly: true,
      ambientKind: "mix",
      liveMix: true,
    });
  }

  function armVoiceSampleLoop(player: DualStemPlayer) {
    player.onEnded = () => {
      if (!voiceLoopWantedRef.current) return;
      // finishNatural already reset offset to 0 — restart immediately.
      void player.play().catch(() => {
        voiceLoopWantedRef.current = false;
        pauseVoicePreview();
      });
    };
  }

  /** Pause voice but keep it named on the strip (joint strip pause). */
  function softPauseVoiceKeepOnStrip() {
    voiceLoopWantedRef.current = false;
    const player = voicePlayerRef.current;
    if (player) {
      player.onEnded = null;
      player.pause();
    }
    setVoicePreviewPlaying(false);
    setVoiceOnStrip(true);
  }

  async function softResumeVoiceOnStrip() {
    const modelId = (voicePreviewId || speakerModelId).trim();
    if (!modelId) return;
    const player = voicePlayerRef.current;
    if (!player) return;
    const voiceName = voiceNameForPreview(modelId) || "Voice";
    voiceLoopWantedRef.current = true;
    armVoiceSampleLoop(player);
    setVoicePreviewId(modelId);
    setVoiceOnStrip(true);
    setVoicePreviewPlaying(true);
    // Joint strip resume: beds are toggled back separately — never kick them off
    // just because createBedPlaying is briefly still false.
    if (isCreateBedStrip) {
      syncCreateStripTitle(voiceName);
    } else {
      ensureVoiceLabelStrip(modelId, voiceName);
    }
    try {
      player.seek(0);
      await player.play();
    } catch {
      await startVoicePreview(modelId);
    }
  }

  async function startVoicePreview(modelId: string) {
    const dry = speakerPreviewDryUrl(modelId);
    if (!dry) return;
    const wet = speakerPreviewWetUrl(modelId);
    const voiceName = voiceNameForPreview(modelId) || "Voice";
    const player = voicePlayerRef.current;
    if (!player) return;
    voiceLoopWantedRef.current = true;
    armVoiceSampleLoop(player);
    setVoicePreviewId(modelId);
    setVoiceOnStrip(true);
    setVoicePreviewPlaying(true);
    ensureVoiceLabelStrip(modelId, voiceName);
    try {
      await player.load(dry, wet, voiceFxDial, null);
      player.seek(0);
      await player.play();
    } catch {
      voiceLoopWantedRef.current = false;
      player.onEnded = null;
      setVoicePreviewPlaying(false);
      setVoicePreviewId(null);
      setVoiceOnStrip(false);
      clearVoiceFromStrip();
    }
  }

  /** Pause voice from the VOICE card — remove it from the strip. */
  function pauseVoicePreview() {
    voiceLoopWantedRef.current = false;
    const player = voicePlayerRef.current;
    if (player) {
      player.onEnded = null;
      player.pause();
    }
    setVoicePreviewPlaying(false);
    setVoicePreviewId(null);
    setVoiceOnStrip(false);
    clearVoiceFromStrip();
  }

  function toggleVoicePreview(modelId: string) {
    if (voicePreviewPlaying && voicePreviewId === modelId) {
      pauseVoicePreview();
      return;
    }
    // Card play always goes through startVoicePreview: a paused soundscape on
    // the strip is dropped (only playing sources stay named).
    void startVoicePreview(modelId);
  }

  function runPreviewMix() {
    const mixKey = `${CREATE_SOUND_PREVIEW_PREFIX}mix`;
    const hasSound =
      soundMode === "mixer"
        ? Boolean(
            backgroundMusicKey ||
              backgroundNatureKey ||
              drumsPreviewKey ||
              backgroundNoiseKey,
          )
        : Boolean(compositionKey);
    if (nowPlaying?.s3Key === mixKey && (createBedPlaying || voicePreviewPlaying)) {
      if (createBedPlaying) toggleLibraryPlayback();
      if (voicePreviewPlaying) pauseVoicePreview();
      else if (!createBedPlaying && speakerModelId) void startVoicePreview(speakerModelId);
      return;
    }
    const scape = compositions.find((c) => c.key === compositionKey);
    if (hasSound) {
      const track = buildCreateBedTrack({
        s3Key: mixKey,
        soundLabel: selectedSoundLabelForPreview(),
        kind: soundMode === "soundscape" ? "soundscape" : "mix",
        musicKey:
          soundMode === "soundscape" ? compositionKey : backgroundMusicKey,
        natureKey: soundMode === "mixer" ? backgroundNatureKey : "",
        drumsKey: soundMode === "mixer" ? drumsPreviewKey : "",
        noiseKey: soundMode === "mixer" ? backgroundNoiseKey : "",
        musicGain: musicLevelToBedGain(
          musicLevel,
          soundMode === "soundscape" ? SOUNDSCAPE_GAIN : backgroundMusicGain,
        ),
        natureGain: musicLevelToBedGain(musicLevel, backgroundNatureGain),
        drumsGain: musicLevelToBedGain(musicLevel, backgroundDrumsGain),
        noiseGain: musicLevelToBedGain(musicLevel, backgroundNoiseGain),
        coverImageUrl: scape?.coverImageThumbUrl || scape?.coverImageUrl || null,
      });
      if (track) playCreateBedTrack(track);
    }
    if (speakerModelId) void startVoicePreview(speakerModelId);
  }

  togglePreviewMixRef.current = runPreviewMix;

  function toggleCompositionPreview(key: string) {
    const s3Key = `${CREATE_SOUND_PREVIEW_PREFIX}scape:${key}`;
    const mixKey = `${CREATE_SOUND_PREVIEW_PREFIX}mix`;
    const onThisSound =
      nowPlaying?.s3Key === s3Key ||
      (nowPlaying?.s3Key === mixKey &&
        soundMode === "soundscape" &&
        compositionKey === key);
    if (onThisSound) {
      if (createBedPlaying) {
        // SOUND card pause: drop beds from the strip if voice is still going.
        if (voicePreviewPlaying || voiceOnStrip) {
          clearSoundFromStripKeepVoice();
        } else {
          toggleLibraryPlayback();
        }
        return;
      }
      // Resume beds — drop soft-paused voice (only playing sources stay named).
      if (voiceOnStrip && !voicePreviewPlaying) {
        setVoiceOnStrip(false);
        setVoicePreviewId(null);
        syncCreateStripTitle(null);
      }
      toggleLibraryPlayback();
      return;
    }
    const item = compositions.find((c) => c.key === key);
    const track = buildCreateBedTrack({
      s3Key,
      soundLabel: item?.name ?? "Soundscape",
      kind: "soundscape",
      musicKey: key,
      musicGain: musicLevelToBedGain(musicLevel, SOUNDSCAPE_GAIN),
      coverImageUrl: item?.coverImageThumbUrl || item?.coverImageUrl || null,
    });
    if (!track) return;
    playCreateBedTrack(track);
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

  /** Build job extras from one resolved settings object (All or a session). */
  async function buildJobExtras(
    cfg: CreateSoundSessionSettings,
  ): Promise<CreateSoundStepJobExtras> {
    let referenceId = cfg.speakerModelId.trim();
    if (!referenceId) {
      const list = await listFishSpeakers();
      const pick = pickDefaultSpeechifySpeaker(
        speechifySpeakersForPicker(list),
      );
      referenceId = pick?.modelId ?? "";
    }
    if (!referenceId) throw new Error("No voice available");
    const speaker =
      speakers.find((sp) => sp.modelId === referenceId) ?? null;
    const cfgDrumsPreviewKey = isMelodicMusicKey(backgroundMusic, cfg.backgroundMusicKey)
      ? ""
      : cfg.backgroundDrumsKey;
    const rateN = Number(speechifyRateInput.trim());
    const pacedSpeechifyRate = effectiveSpeechifyRate(
      speaker?.speechifyRate,
      cfg.pacingPercent,
    );
    return {
      reference_id: referenceId,
      voiceFxDial: cfg.voiceFxDial,
      voiceFxPreset: voiceFxOn ? VOICE_FX_PRESET_MEDITATION_MIXER : null,
      speed: speechSpeed,
      ...(cfg.longerBreaks ? { longerBreaks: true as const } : {}),
      speakerName: speaker?.name ?? null,
      leadInSeconds: cfg.leadInSeconds,
      fadeOut: cfg.fadeOut,
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
              : { speechifyRate: pacedSpeechifyRate }),
          }
        : {
            claudeModel: CLAUDE_SONNET_45_MODEL_ID,
            fishPauseMode: "segmented" as const,
            ...(speaker?.brand === "speechify"
              ? { speechifyRate: pacedSpeechifyRate }
              : {}),
          }),
      ...buildCreateMeditationBedJobFields({
        soundMode: cfg.soundMode,
        compositionKey: cfg.compositionKey,
        backgroundNatureKey: cfg.backgroundNatureKey,
        backgroundMusicKey: cfg.backgroundMusicKey,
        backgroundDrumsKey: cfg.backgroundDrumsKey,
        backgroundNoiseKey: cfg.backgroundNoiseKey,
        backgroundNatureGain: musicLevelToBedGain(
          cfg.musicLevel,
          cfg.backgroundNatureGain,
        ),
        backgroundMusicGain: musicLevelToBedGain(
          cfg.musicLevel,
          cfg.soundMode === "soundscape"
            ? SOUNDSCAPE_GAIN
            : cfg.backgroundMusicGain,
        ),
        backgroundDrumsGain: musicLevelToBedGain(
          cfg.musicLevel,
          cfg.backgroundDrumsGain,
        ),
        backgroundNoiseGain: musicLevelToBedGain(
          cfg.musicLevel,
          cfg.backgroundNoiseGain,
        ),
        drumsPreviewKey: cfgDrumsPreviewKey,
      }),
    };
  }

  /** Settings for a session: All, or { ...All, ...override }. */
  function settingsForSession(sessionId: string | null): CreateSoundSessionSettings {
    const focus = focusSessionIdRef.current;
    const all =
      focus == null || !sessionMode
        ? snapshotSettings()
        : (allSettingsRef.current ?? snapshotSettings());
    if (sessionId == null || !sessionMode) return all;
    // The focused session's live UI is the freshest source for its override.
    const override =
      focus === sessionId
        ? diffSoundSessionSettings(all, snapshotSettings())
        : sessionOverridesRef.current[sessionId];
    return resolveSoundSessionSettings(all, override);
  }

  // Latest closures for the (stable) imperative handle below.
  const sessionApi = {
    getJobExtras: () => buildJobExtras(snapshotSettings()),
    getJobExtrasForSession: (id: string | null) =>
      buildJobExtras(settingsForSession(id)),
    getSessionOverrideMeta: () => sessionOverrideMetaRef.current,
    setSessionPickerExpanded,
    setFocusSessionId,
    clearAllSessionOverrides,
    resetVoiceOverrideForFocus: () => resetFocusedOverrideKeys(VOICE_SETTING_KEYS),
    resetSoundOverrideForFocus: () => resetFocusedOverrideKeys(SOUND_SETTING_KEYS),
  };
  const sessionApiRef = useRef(sessionApi);
  sessionApiRef.current = sessionApi;

  useImperativeHandle(
    ref,
    () => ({
      stopPreviews: stopAllAudioPreview,
      previewMixPlaying,
      togglePreviewMix: () => {
        void togglePreviewMixRef.current?.();
      },
      togglePreviewTransport: () => {
        togglePreviewTransportRef.current();
      },
      getJobExtras: () => sessionApiRef.current.getJobExtras(),
      getJobExtrasForSession: (id) =>
        sessionApiRef.current.getJobExtrasForSession(id),
      getSessionOverrideMeta: () => sessionApiRef.current.getSessionOverrideMeta(),
      setSessionPickerExpanded: (v) =>
        sessionApiRef.current.setSessionPickerExpanded(v),
      setFocusSessionId: (id) => sessionApiRef.current.setFocusSessionId(id),
      clearAllSessionOverrides: () =>
        sessionApiRef.current.clearAllSessionOverrides(),
      resetVoiceOverrideForFocus: () =>
        sessionApiRef.current.resetVoiceOverrideForFocus(),
      resetSoundOverrideForFocus: () =>
        sessionApiRef.current.resetSoundOverrideForFocus(),
    }),
    [stopAllAudioPreview, previewMixPlaying],
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
  /** Strip / summary label: factory/user names, else "Custom mix". */
  const mixerSoundLabel =
    selectedMixKey.startsWith("factory:") || selectedMixKey.startsWith("user:")
      ? mixerPanelName === "Your mix"
        ? "Custom mix"
        : mixerPanelName
      : "Custom mix";
  const soundTitle = usingMix
    ? mixerSoundLabel
    : compositionKey
      ? (selectedSound?.name ?? "Soundscape")
      : "Silence";
  const soundDescription = usingMix
    ? "Your mix"
    : compositionKey
      ? soundscapeCategoryLabel(selectedSound)
      : "Voice only";

  togglePreviewTransportRef.current = () => {
    if (!isCreateLibraryPreview) {
      runPreviewMix();
      return;
    }
    const bedsOnStrip = isCreateBedStrip;
    const voiceOnlyStrip =
      nowPlaying?.s3Key?.startsWith(`${CREATE_SOUND_PREVIEW_PREFIX}voice:`) ===
      true;
    const voiceBound = voiceOnStrip || voicePreviewPlaying || voiceOnlyStrip;
    const anyPlaying = createBedPlaying || voicePreviewPlaying;

    if (anyPlaying) {
      // Joint pause — keep every bound source represented on the strip.
      if (createBedPlaying || (voiceOnlyStrip && playingS3Key)) {
        toggleLibraryPlayback();
      }
      if (voicePreviewPlaying) softPauseVoiceKeepOnStrip();
      return;
    }

    // Joint resume — restart whatever is still bound to the strip.
    if (bedsOnStrip && !createBedPlaying) toggleLibraryPlayback();
    else if (voiceOnlyStrip && !playingS3Key) toggleLibraryPlayback();
    if (voiceBound && !voicePreviewPlaying) void softResumeVoiceOnStrip();
  };

  // Strip play chrome = union of voice + beds; strip button uses joint transport.
  useEffect(() => {
    if (!isCreateLibraryPreview) {
      setCreateSoundStripBridge(null);
      return;
    }
    setCreateSoundStripBridge({
      playing: createBedPlaying || voicePreviewPlaying,
      onToggle: () => togglePreviewTransportRef.current(),
    });
    return () => setCreateSoundStripBridge(null);
  }, [
    isCreateLibraryPreview,
    createBedPlaying,
    voicePreviewPlaying,
    setCreateSoundStripBridge,
  ]);

  useEffect(() => {
    voicePlayerRef.current?.setDial(voiceFxDial);
  }, [voiceFxDial]);

  // Speechify pacing swaps pre-baked rate stems; reload while preview is active.
  useEffect(() => {
    const modelId = (voicePreviewId || speakerModelId).trim();
    if (!modelId || !voicePreviewPlaying) return;
    const speaker = speakers.find((s) => s.modelId === modelId);
    if (speaker?.brand !== "speechify") return;
    void startVoicePreview(modelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when pacing notch changes
  }, [pacingPercent]);
  const soundPacks = useMemo(() => {
    const names = new Set<string>();
    for (const item of compositions) {
      const pack = item.customPackName?.trim();
      if (pack) names.add(pack);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [compositions]);
  const soundTagFilterTypes = useMemo(() => {
    const list =
      compositionTagTypes.length > 0
        ? compositionTagTypes
        : DEFAULT_COMPOSITION_TAG_TYPES;
    return [...list].sort(
      (a, b) => a.sort - b.sort || a.label.localeCompare(b.label),
    );
  }, [compositionTagTypes]);
  const selectedSoundTags = useMemo(
    () => soundscapeTagBits(selectedSound, soundTagFilterTypes),
    [selectedSound, soundTagFilterTypes],
  );
  const activeSoundTags = useMemo(() => {
    const s = new Set<string>();
    for (const tags of Object.values(soundTagFilters)) {
      for (const t of tags) s.add(t);
    }
    return s;
  }, [soundTagFilters]);
  const hasSoundTagFilters = activeSoundTags.size > 0;
  const recentSoundIds = useMemo(() => readRecentSoundIds(), [changeKind]);
  const filteredSoundscapes = useMemo(() => {
    const requiredTags = [...activeSoundTags];
    let list = compositions.filter((item) => {
      if (soundCategory === "favourites") {
        if (!favorites.compositionSet.has(item.key)) return false;
      } else if (soundCategory === "our-picks") {
        if (!item.adminFavourite) return false;
      } else if (soundCategory !== "all") {
        if ((item.customPackName ?? "").trim() !== soundCategory) return false;
      }
      const itemTags = item.tags ?? [];
      // Every selected tag must be present (AND), regardless of type.
      if (
        requiredTags.length > 0 &&
        !requiredTags.every((t) => itemTags.includes(t))
      ) {
        return false;
      }
      return true;
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
    soundCategory,
    activeSoundTags,
    soundSort,
    recentSoundIds,
    favorites.compositionSet,
  ]);
  function setTypeTagFilter(typeId: string, next: string[]) {
    setSoundTagFilters((prev) => {
      if (next.length === 0) {
        if (!(typeId in prev)) return prev;
        const copy = { ...prev };
        delete copy[typeId];
        return copy;
      }
      return { ...prev, [typeId]: next };
    });
  }

  const soundListHeading = (() => {
    const n = filteredSoundscapes.length;
    if (soundCategory === "favourites") return `Favourites · ${n}`;
    if (soundCategory === "our-picks") return `Our Picks · ${n}`;
    if (soundCategory !== "all") return `${soundCategory} · ${n}`;
    if (hasSoundTagFilters) return `Matching · ${n}`;
    return `All soundscapes · ${n}`;
  })();

  const voiceFilters = voiceFilterChips(speakers);
  const voiceFilterSet = useMemo(
    () => new Set(voiceFiltersActive),
    [voiceFiltersActive],
  );
  const filteredVoices = rankVoicesByPrefs(
    speakers.filter((s) =>
      voiceMatchesFilter(s, voiceFilterSet, favorites.voiceSet),
    ),
    voicePrefs,
    {
      pinModelId: programSpeakerModelId,
      favoriteIds: favorites.voiceSet,
    },
  );

  function toggleVoiceFilter(chip: string) {
    setVoiceFiltersActive((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip],
    );
  }
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
    setVoiceFiltersActive([]);
    setChangeKind("voice");
  }

  function openSoundPanel(opts?: { tab?: "library" | "mixer" }) {
    const tab =
      opts?.tab ?? (soundMode === "mixer" ? "mixer" : "library");
    setStagedSoundId(tab === "mixer" ? "__mix__" : compositionKey);
    setSoundPanelTab(tab);
    setSoundCategory("our-picks");
    setSoundTagFilters({});
    setChangeKind("sound");
    // Pull fresh tags / tag types (list payload includes composition tags).
    void listBackgroundAudio({ refresh: true })
      .then(applyBackgroundAudioData)
      .catch(() => undefined);
  }

  function openMixerPanel() {
    openSoundPanel({ tab: "mixer" });
  }

  function previewSelectedSound() {
    if (usingMix) {
      const mixKey = `${CREATE_SOUND_PREVIEW_PREFIX}mix`;
      if (nowPlaying?.s3Key === mixKey) {
        if (createBedPlaying) {
          if (voicePreviewPlaying || voiceOnStrip) {
            clearSoundFromStripKeepVoice();
          } else {
            toggleLibraryPlayback();
          }
          return;
        }
        if (voiceOnStrip && !voicePreviewPlaying) {
          setVoiceOnStrip(false);
          setVoicePreviewId(null);
          syncCreateStripTitle(null);
        }
        toggleLibraryPlayback();
        return;
      }
      const track = buildCreateBedTrack({
        s3Key: mixKey,
        soundLabel: selectedSoundLabelForPreview(),
        kind: "mix",
        musicKey: backgroundMusicKey,
        natureKey: backgroundNatureKey,
        drumsKey: drumsPreviewKey,
        noiseKey: backgroundNoiseKey,
        musicGain: musicLevelToBedGain(musicLevel, backgroundMusicGain),
        natureGain: musicLevelToBedGain(musicLevel, backgroundNatureGain),
        drumsGain: musicLevelToBedGain(musicLevel, backgroundDrumsGain),
        noiseGain: musicLevelToBedGain(musicLevel, backgroundNoiseGain),
        coverImageUrl: null,
      });
      if (track) playCreateBedTrack(track);
      return;
    }
    if (compositionKey) toggleCompositionPreview(compositionKey);
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

  function commitSilenceFromPanel() {
    adoptSound(SILENCE_SOUND_ID, false);
    rememberRecentSound(SILENCE_SOUND_ID);
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

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-4">
        <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-5 py-[18px]">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
              Voice
            </p>
            <div className="flex items-center gap-[10px]">
              {sessionFocused && !voiceDiffers ? (
                <span className="text-[12px] text-muted">Same as All</span>
              ) : null}
              <div
                className="inline-flex rounded-xl bg-background p-[3px]"
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
          </div>
          {sessionFocused && voiceDiffers ? (
            <SessionDiffNote
              sessionNumber={focusSessionNumber}
              disabled={soundControlsDisabled}
              onReset={() => resetFocusedOverrideKeys(VOICE_SETTING_KEYS)}
            />
          ) : null}
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              disabled={soundControlsDisabled || !speakerModelId}
              aria-label={
                selectedVoicePlaying ? "Pause voice preview" : "Preview voice"
              }
              onClick={() =>
                speakerModelId ? toggleVoicePreview(speakerModelId) : undefined
              }
              style={
                selectedVoice?.portraitImageUrl
                  ? undefined
                  : PRIMARY_ACCENT_FILL_STYLE
              }
              className="relative flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full accent-fill-gradient text-on-accent"
            >
              {selectedVoice?.portraitImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedVoice.portraitImageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
              <svg
                viewBox="0 0 24 24"
                className={`relative h-4 w-4 ${
                  selectedVoice?.portraitImageUrl
                    ? "drop-shadow-[0_0_2px_rgba(0,0,0,0.85)]"
                    : ""
                }`}
                fill="currentColor"
              >
                {selectedVoicePlaying ? (
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                ) : (
                  <path d="M8 5v14l11-7L8 5z" />
                )}
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[21px] leading-snug text-foreground">
                {selectedVoice?.name ?? "Choose a voice"}
              </p>
              {selectedVoiceMeta ? (
                <p className="mt-0.5 text-[13px] leading-snug text-muted">
                  {selectedVoiceMeta.description}
                </p>
              ) : null}
              {showVoiceReason && voiceReason ? (
                <p className="mt-0.5 text-[12px] leading-snug text-accent-link">
                  ✦ {voiceReason}
                </p>
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
          <div className="flex items-center gap-3 rounded-xl bg-background px-3.5 py-3">
            <button
              type="button"
              disabled={soundControlsDisabled || !speakerModelId}
              aria-label={
                selectedVoicePlaying ? "Pause sample" : "Play sample line"
              }
              onClick={() =>
                speakerModelId ? toggleVoicePreview(speakerModelId) : undefined
              }
              style={PRIMARY_ACCENT_FILL_STYLE}
              className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent"
            >
              <svg viewBox="0 0 24 24" className="h-[11px] w-[11px]" fill="currentColor">
                {selectedVoicePlaying ? (
                  <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                ) : (
                  <path d="M8 5v14l11-7L8 5z" />
                )}
              </svg>
            </button>
            <p className="min-w-0 font-display text-[16px] italic leading-[1.45] text-muted">
              “{VOICE_SAMPLE_LINE}”
            </p>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto md:flex-wrap">
            <span className="mr-0.5 shrink-0 text-[12px] text-muted">Or try</span>
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
          <div className="mt-auto h-px bg-border" />
          <div className="flex items-start gap-3">
            <span className="w-16 shrink-0 pt-0.5 text-[13px] font-semibold text-foreground">
              Echo
            </span>
            <div className="min-w-0 flex-1">
              <div className="relative h-[18px]">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  aria-label="Echo"
                  disabled={soundControlsDisabled}
                  value={voiceFxDial}
                  onChange={(e) => setVoiceFxDial(Number(e.target.value))}
                  className="create-sound-axis-fader relative z-[1]"
                  style={
                    {
                      ["--fader-pct" as string]:
                        axisFaderThumbCenter(voiceFxDial),
                    } as CSSProperties
                  }
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-1/2 h-0"
                >
                  <span
                    className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                    style={axisFaderThumbCenterStyle(0)}
                  />
                  <span
                    className="absolute top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                    style={axisFaderThumbCenterStyle(VOICE_FX_DIAL_DEFAULT)}
                  />
                  <span
                    className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                    style={axisFaderThumbCenterStyle(100)}
                  />
                </div>
              </div>
              <div className="relative mt-1.5 h-4 w-full text-[11px] leading-none text-muted">
                <span className="absolute left-0 top-0">Dry</span>
                <span
                  className="absolute top-0 flex -translate-x-1/2 items-center text-muted"
                  style={axisFaderThumbCenterStyle(VOICE_FX_DIAL_DEFAULT)}
                  title="Recommended"
                  aria-label="Recommended"
                >
                  <FaderRecommendedMark />
                </span>
                <span className="absolute right-0 top-0">Wet</span>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-16 shrink-0 pt-0.5 text-[13px] font-semibold text-foreground">
              Pacing
            </span>
            <div className="min-w-0 flex-1">
              <div className="relative h-[18px]">
                <input
                  type="range"
                  min={VOICE_PACING_MIN}
                  max={VOICE_PACING_MAX}
                  step={1}
                  aria-label="Pacing"
                  disabled={soundControlsDisabled}
                  value={pacingPercent}
                  onChange={(e) => setPacingPercent(Number(e.target.value))}
                  className="create-sound-axis-fader relative z-[1]"
                  style={
                    {
                      ["--fader-pct" as string]: axisFaderThumbCenter(
                        ((pacingPercent - VOICE_PACING_MIN) /
                          (VOICE_PACING_MAX - VOICE_PACING_MIN)) *
                          100,
                      ),
                    } as CSSProperties
                  }
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-1/2 h-0"
                >
                  <span
                    className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                    style={axisFaderThumbCenterStyle(0)}
                  />
                  <span
                    className="absolute top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                    style={axisFaderThumbCenterStyle(50)}
                  />
                  <span
                    className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                    style={axisFaderThumbCenterStyle(100)}
                  />
                </div>
              </div>
              <div className="relative mt-1.5 h-4 w-full text-[11px] leading-none text-muted">
                <span className="absolute left-0 top-0">Slower</span>
                <span
                  className="absolute top-0 flex -translate-x-1/2 items-center text-muted"
                  style={axisFaderThumbCenterStyle(50)}
                  title="Recommended"
                  aria-label="Recommended"
                >
                  <FaderRecommendedMark />
                </span>
                <span className="absolute right-0 top-0">Faster</span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3.5 rounded-2xl border border-border bg-card px-5 py-[18px]">
          {usingMix || !compositionKey ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                  Sound
                </p>
                <div className="flex items-center gap-[10px]">
                  {sessionFocused && !soundDiffers ? (
                    <span className="text-[12px] text-muted">Same as All</span>
                  ) : null}
                  <button
                    ref={changeSoundBtnRef}
                    type="button"
                    disabled={soundControlsDisabled}
                    onClick={() => openSoundPanel()}
                    className="h-9 shrink-0 cursor-pointer rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground"
                  >
                    Change
                  </button>
                </div>
              </div>
              {sessionFocused && soundDiffers ? (
                <SessionDiffNote
                  sessionNumber={focusSessionNumber}
                  disabled={soundControlsDisabled}
                  onReset={() => resetFocusedOverrideKeys(SOUND_SETTING_KEYS)}
                />
              ) : null}
              <div className="flex items-center gap-3.5">
                <button
                  type="button"
                  disabled={soundControlsDisabled}
                  aria-label={
                    selectedSoundPlaying
                      ? "Pause sound preview"
                      : "Preview sound"
                  }
                  onClick={() => previewSelectedSound()}
                  style={PRIMARY_ACCENT_FILL_STYLE}
                  className="flex h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    {selectedSoundPlaying ? (
                      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                    ) : (
                      <path d="M8 5v14l11-7L8 5z" />
                    )}
                  </svg>
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-[21px] leading-snug text-foreground">
                    {soundTitle}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-snug text-muted">
                    {soundDescription}
                  </p>
                </div>
              </div>
              {usingMix ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 shrink-0 text-[12px] text-muted">
                    Layers
                  </span>
                  {mixLayerBits.length === 0 ? (
                    <span className="rounded-full border border-border px-2.5 py-1 text-[12px] text-muted">
                      No layers
                    </span>
                  ) : (
                    mixLayerBits.map((name) => (
                      <span
                        key={name}
                        className="rounded-full border border-border px-2.5 py-1 text-[12px] text-foreground"
                      >
                        {name}
                      </span>
                    ))
                  )}
                  <button
                    type="button"
                    disabled={soundControlsDisabled}
                    onClick={openMixerPanel}
                    className="ml-auto shrink-0 cursor-pointer text-[13px] font-semibold text-accent-link"
                  >
                    Open mixer ›
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="relative -mx-5 -mt-[18px] h-[136px] overflow-hidden rounded-t-2xl bg-accent-soft">
                {selectedSound?.coverImageUrl ||
                selectedSound?.coverImageThumbUrl ? (
                  <img
                    src={
                      selectedSound.coverImageUrl ||
                      selectedSound.coverImageThumbUrl ||
                      ""
                    }
                    alt=""
                    className="absolute left-0 top-1/2 w-full max-w-none -translate-y-1/2"
                  />
                ) : null}
                <span className="absolute inset-0 bg-gradient-to-b from-foreground/5 to-foreground/45" />
                <p className="absolute left-5 top-4 text-[11px] font-semibold uppercase tracking-[1.4px] text-white">
                  Sound
                </p>
                <button
                  ref={changeSoundBtnRef}
                  type="button"
                  disabled={soundControlsDisabled}
                  onClick={() => openSoundPanel()}
                  className="absolute right-4 top-3 h-9 shrink-0 cursor-pointer rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground"
                >
                  Change
                </button>
                <div className="absolute bottom-3.5 left-5 flex items-center gap-3">
                  <button
                    type="button"
                    disabled={soundControlsDisabled}
                    aria-label={
                      selectedSoundPlaying
                        ? "Pause soundscape"
                        : "Preview soundscape"
                    }
                    onClick={() => toggleCompositionPreview(compositionKey)}
                    style={PRIMARY_ACCENT_FILL_STYLE}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-[15px] w-[15px]"
                      fill="currentColor"
                    >
                      {selectedSoundPlaying ? (
                        <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                      ) : (
                        <path d="M8 5v14l11-7L8 5z" />
                      )}
                    </svg>
                  </button>
                  <p className="font-display text-[22px] leading-snug text-white [text-shadow:0_1px_8px_rgb(0_0_0_/_0.3)]">
                    {soundTitle}
                  </p>
                </div>
              </div>
              {sessionFocused && soundDiffers ? (
                <SessionDiffNote
                  sessionNumber={focusSessionNumber}
                  disabled={soundControlsDisabled}
                  onReset={() => resetFocusedOverrideKeys(SOUND_SETTING_KEYS)}
                />
              ) : null}
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedSoundTags.brainwave ? (
                  <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[color:var(--color-accent,#E9D3A8)]">
                    {selectedSoundTags.brainwave}
                  </span>
                ) : null}
                {selectedSoundTags.others.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] whitespace-nowrap text-accent-link"
                  >
                    {tag}
                  </span>
                ))}
                {showSoundReason && soundReason ? (
                  <span className="ml-auto text-[12px] text-accent-link">
                    ✦ {soundReason}
                  </span>
                ) : null}
              </div>
            </>
          )}
          <div className="flex items-center gap-1.5 overflow-x-auto md:flex-wrap">
            <span className="mr-0.5 shrink-0 text-[12px] text-muted">Or try</span>
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
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft/70 text-[11px] text-accent-link">
                      ✕
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
          <div className="mt-auto border-t border-border pt-3.5">
            <div className="flex items-start gap-3">
              <span className="w-16 shrink-0 pt-0.5 text-[13px] font-semibold text-foreground">
                Volume
              </span>
              <div className="min-w-0 flex-1">
                <div className="relative h-[18px]">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    aria-label="Volume"
                    disabled={soundControlsDisabled}
                    value={musicLevel}
                    onChange={(e) => setMusicLevel(Number(e.target.value))}
                    className="create-sound-axis-fader relative z-[1]"
                    style={
                      {
                        ["--fader-pct" as string]:
                          axisFaderThumbCenter(musicLevel),
                      } as CSSProperties
                    }
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-1/2 h-0"
                  >
                    <span
                      className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                      style={axisFaderThumbCenterStyle(0)}
                    />
                    <span
                      className="absolute top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                      style={axisFaderThumbCenterStyle(SOUND_VOLUME_RECOMMENDED)}
                    />
                    <span
                      className="absolute top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-muted"
                      style={axisFaderThumbCenterStyle(100)}
                    />
                  </div>
                </div>
                <div className="relative mt-1.5 h-4 w-full text-[11px] leading-none text-muted">
                  <span className="absolute left-0 top-0">0%</span>
                  <span
                    className="absolute top-0 flex -translate-x-1/2 items-center text-muted"
                    style={axisFaderThumbCenterStyle(SOUND_VOLUME_RECOMMENDED)}
                    title="Recommended"
                    aria-label="Recommended"
                  >
                    <FaderRecommendedMark />
                  </span>
                  <span className="absolute right-0 top-0">100%</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-6 pl-[76px]">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted">
              <Switch.Root
                checked={leadInSeconds === 20}
                onCheckedChange={(v) => setLeadInSeconds(v ? 20 : 0)}
                disabled={soundControlsDisabled}
                aria-label="20 seconds of sound before the voice"
                className="relative h-[18px] w-8 shrink-0 cursor-pointer rounded-full border border-border bg-muted/30 transition-colors data-[state=checked]:border-accent-button data-[state=checked]:bg-accent-button disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Switch.Thumb className="block h-3.5 w-3.5 translate-x-[2px] rounded-full bg-card shadow transition-transform will-change-transform data-[state=checked]:translate-x-[14px]" />
              </Switch.Root>
              20 s of sound before the voice
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted">
              <Switch.Root
                checked={fadeOut}
                onCheckedChange={setFadeOut}
                disabled={soundControlsDisabled}
                aria-label="Fade out at the end"
                className="relative h-[18px] w-8 shrink-0 cursor-pointer rounded-full border border-border bg-muted/30 transition-colors data-[state=checked]:border-accent-button data-[state=checked]:bg-accent-button disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Switch.Thumb className="block h-3.5 w-3.5 translate-x-[2px] rounded-full bg-card shadow transition-transform will-change-transform data-[state=checked]:translate-x-[14px]" />
              </Switch.Root>
              Fade out at the end
            </label>
          </div>
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
          {voiceFilters.map((chip) => {
            const on = voiceFilterSet.has(chip);
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={on}
                onClick={() => toggleVoiceFilter(chip)}
                className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${
                  on
                    ? "border border-accent bg-accent-soft/50 font-semibold"
                    : "border border-border bg-card"
                }`}
              >
                {chip}
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-0.5">
            {filteredVoices.map((v) => {
              const meta = voiceDisplayMeta(v);
              const selected = stagedVoiceId === v.modelId;
              const prefIdx = (voicePrefs?.speakers ?? []).indexOf(v.modelId);
              const closestId = filteredVoices.find(
                (x) =>
                  x.modelId !== programSpeakerId &&
                  !(voicePrefs?.speakers ?? []).includes(x.modelId),
              )?.modelId;
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
                    className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full accent-fill-gradient text-on-accent"
                    style={
                      v.portraitImageUrl
                        ? undefined
                        : PRIMARY_ACCENT_FILL_STYLE
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleVoicePreview(v.modelId);
                    }}
                    role="presentation"
                  >
                    {v.portraitImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={v.portraitImageUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : null}
                    <svg
                      viewBox="0 0 24 24"
                      className={`relative h-3 w-3 ${
                        v.portraitImageUrl
                          ? "drop-shadow-[0_0_2px_rgba(0,0,0,0.85)]"
                          : ""
                      }`}
                      fill="currentColor"
                    >
                      {voicePreviewPlaying && voicePreviewId === v.modelId ? (
                        <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                      ) : (
                        <path d="M8 5v14l11-7L8 5z" />
                      )}
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
                  ) : prefIdx >= 0 ? (
                    <span className="rounded-full bg-accent-soft/80 px-2 py-0.5 text-[11px] text-accent-link">
                      {prefIdx === 0 ? "Preferred" : `Preferred ${prefIdx + 1}`}
                    </span>
                  ) : hasVoicePrefs(voicePrefs) && closestId === v.modelId ? (
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
            : compositions.find((c) => c.key === stagedSoundId)?.name
              ? `${compositions.find((c) => c.key === stagedSoundId)!.name} selected`
              : undefined
        }
        confirmLabel={
          soundPanelTab === "mixer" ? "Use this mix" : "Use this sound"
        }
        secondaryLabel={
          soundPanelTab === "library" ? "Use silence" : undefined
        }
        onSecondary={
          soundPanelTab === "library" ? commitSilenceFromPanel : undefined
        }
        onClose={closeChangePanel}
        onConfirm={commitSoundPanel}
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 md:px-6 md:py-3.5"
      >
        <div className="flex shrink-0 flex-col gap-3">
          <SegmentedPillTabs<"library" | "mixer">
            aria-label="Sound library"
            value={soundPanelTab}
            onChange={setSoundPanelTab}
            equalWidth
            className="w-full rounded-xl border-0 bg-accent-soft/80 p-[3px]"
            selectedClassName="header-gold-sunlit-fill rounded-[9px] border-0 font-semibold text-on-accent"
            idleClassName="rounded-[9px] border border-transparent font-medium text-muted"
            options={[
              { id: "library", label: "Soundscapes" },
              { id: "mixer", label: "Build your own" },
            ]}
          />
          {soundPanelTab === "library" ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  aria-pressed={soundCategory === "favourites"}
                  aria-label="Favourites"
                  title="Favourites"
                  onClick={() =>
                    setSoundCategory((c) =>
                      c === "favourites" ? "all" : "favourites",
                    )
                  }
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    soundCategory === "favourites"
                      ? "border border-accent bg-accent-soft/50 text-accent-link"
                      : "border border-border bg-card text-muted hover:text-foreground"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="15"
                    height="15"
                    fill={
                      soundCategory === "favourites" ? "currentColor" : "none"
                    }
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
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
                  onClick={() => setSoundCategory("our-picks")}
                  className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${
                    soundCategory === "our-picks"
                      ? "border border-accent bg-accent-soft/50 font-semibold"
                      : "border border-border bg-card"
                  }`}
                >
                  Our Picks
                </button>
                {soundPacks.map((pack) => (
                  <button
                    key={pack}
                    type="button"
                    onClick={() =>
                      setSoundCategory((c) => (c === pack ? "all" : pack))
                    }
                    className={`h-8 shrink-0 rounded-full px-3 text-[13px] ${
                      soundCategory === pack
                        ? "border border-accent bg-accent-soft/50 font-semibold"
                        : "border border-border bg-card"
                    }`}
                  >
                    {pack}
                  </button>
                ))}
              </div>
              {soundTagFilterTypes.length > 0 ? (
                <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
                  {soundTagFilterTypes.map((type) => (
                    <TagTypeMultiSelect
                      key={type.id}
                      type={type}
                      selected={soundTagFilters[type.id] ?? []}
                      onChange={(next) => setTypeTagFilter(type.id, next)}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        {soundPanelTab === "library" ? (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            <div className="mb-2 mt-1 flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                {soundListHeading}
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[12px] text-muted"
                onClick={() =>
                  setSoundSort((s) => (s === "az" ? "recent" : "az"))
                }
              >
                {soundSort === "az" ? "A–Z" : "Recently used"}
                <SelectChevron />
              </button>
            </div>
            <SyncedMarqueeProvider
              resetKey={`${soundCategory}|${[...activeSoundTags].join(",")}|${filteredSoundscapes.length}`}
              className="grid grid-cols-1 gap-2 md:grid-cols-2"
            >
              {filteredSoundscapes.map((item) => {
                const selected = stagedSoundId === item.key;
                const playing =
                  createBedPlaying && compositionPreviewKey === item.key;
                return (
                  <div
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setStagedSoundId(item.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setStagedSoundId(item.key);
                      }
                    }}
                    className={`relative flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border p-2 text-left ${
                      selected ? "border-2 border-accent p-[7px]" : "border-border"
                    }`}
                  >
                    <span
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-accent-soft"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCompositionPreview(item.key);
                      }}
                      role="presentation"
                    >
                      {item.coverImageThumbUrl || item.coverImageUrl ? (
                        <img
                          src={
                            item.coverImageThumbUrl || item.coverImageUrl || ""
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <MistPlayBadge playing={playing} size="sm" />
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 basis-0 overflow-hidden pr-8">
                      <SyncedMarqueeTitle
                        id={item.key}
                        text={item.name}
                        className="w-full font-display text-[15px] leading-[1.25] text-foreground"
                      />
                      <SoundscapeCardMeta item={item} />
                    </span>
                    <span className="pointer-events-auto absolute inset-y-0 right-1.5 z-10 flex items-center">
                      <FavoriteHeartButton
                        pressed={favorites.compositionSet.has(item.key)}
                        label={item.name}
                        onToggle={() => favorites.toggleComposition(item.key)}
                      />
                    </span>
                  </div>
                );
              })}
            </SyncedMarqueeProvider>
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
                  <div className="min-w-0 flex-1">
                    <MixerPresetChannel
                      layout="toolbar"
                      factoryPresets={factoryMixes}
                      userPresets={userMixPresets}
                      selectedKey={selectedMixKey}
                      onSelect={onSelectMixPreset}
                      onSaveNew={saveNewMixPreset}
                      disabled={soundControlsDisabled}
                      loading={factoryMixesLoading}
                      modified={mixDirty}
                      defaultSaveName={
                        mixerPanelName === "Your mix"
                          ? "Untitled mix"
                          : mixerPanelName
                      }
                    />
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
            <div className="overflow-visible rounded-[14px] border border-border bg-card">
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
                playAriaLabel={playing.music ? "Pause music" : "Play music"}
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
                  playing.nature ? "Pause ambience" : "Play ambience"
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
                  playAriaLabel={playing.drums ? "Pause drums" : "Play drums"}
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
                playAriaLabel={playing.noise ? "Pause noise" : "Play noise"}
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
                      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
                    ) : (
                      <path d="M8 5v14l11-7L8 5z" />
                    )}
                  </svg>
                </span>
                {playing.music ||
                playing.nature ||
                playing.drums ||
                playing.noise
                  ? "Pause mix"
                  : "Play mix"}
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
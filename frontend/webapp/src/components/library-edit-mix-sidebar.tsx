/**
 * Library “Edit mix” — same right Change · Sound sidebar as Create Sound,
 * plus a master Volume fader (MUSIC-card behaviour).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CreateOneFlowPickerShell } from "@/components/create-one-flow-picker-shell";
import { DrumsLockedWrap } from "@/components/drums-locked-wrap";
import { FavoriteHeartButton } from "@/components/favorite-heart-button";
import type { BedVolumeChannel } from "@/components/library-player-provider";
import {
  MixerDeskRow,
  MixerPresetChannel,
} from "@/components/mixer-channel";
import {
  SOUNDSCAPE_MIX_GAIN,
  type MixEditorValues,
  mixWithGain,
  mixWithKey,
} from "@/components/mix-editor-panel";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import { SelectChevron } from "@/components/select-chevron";
import { SoundscapePicker } from "@/components/soundscape-picker";
import {
  SyncedMarqueeProvider,
  SyncedMarqueeTitle,
} from "@/components/synced-marquee-title";
import {
  musicLevelToBedGain,
  SOUND_VOLUME_RECOMMENDED,
  soundscapeCategoryLabel,
} from "@/lib/create-sound-picks";
import {
  factoryPresetToMix,
  type MixerFactoryPreset,
} from "@/lib/mixer-factory-presets";
import {
  loadMixerPresetStore,
  mixForPlayback,
  mixerPresetToMix,
  newMixerPreset,
  saveMixerPresetStore,
  type MixerPreset,
  type MixerPresetMix,
} from "@/lib/mixer-preset-storage";
import {
  backgroundAudioStreamingKey,
  getMedimadeMediaBaseUrl,
  type BackgroundAudioItem,
} from "@/lib/medimade-api";
import { useSoundFavorites } from "@/lib/sound-favorites";
import { isMelodicMusicKey } from "@/lib/sound-taxonomy";
import { VOICE_FX_DIAL_DEFAULT, VoiceFxKnob } from "@consciously/common";

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

const AXIS_FADER_THUMB_PX = 18;

function axisFaderThumbCenter(pct: number): string {
  const p = Math.min(100, Math.max(0, pct)) / 100;
  return `calc(${AXIS_FADER_THUMB_PX / 2}px + (100% - ${AXIS_FADER_THUMB_PX}px) * ${p})`;
}

function axisFaderThumbCenterStyle(pct: number): CSSProperties {
  return { left: axisFaderThumbCenter(pct) };
}

function mediaFileUrl(base: string, key: string): string {
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${b}/${path}`;
}

function isSoundscapeKey(
  compositions: BackgroundAudioItem[],
  key: string | null | undefined,
): boolean {
  const k = backgroundAudioStreamingKey(key ?? "");
  if (!k) return false;
  return compositions.some((c) => backgroundAudioStreamingKey(c.key) === k);
}

function IconMixReset({ className }: { className?: string }) {
  return (
    <svg
      className={className}
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
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function LibraryEditMixSidebar({
  open,
  title,
  natureItems,
  musicItems,
  drumsItems,
  noiseItems,
  compositionItems,
  factoryMixes = [],
  factoryMixesLoading = false,
  error,
  initialMix,
  resetMix,
  stripPlayingMusicKey = null,
  onLiveVolume,
  onLiveVoiceFx,
  onPreview,
  onPersist,
  onClose,
  closeRef,
}: {
  open: boolean;
  title: string;
  natureItems: BackgroundAudioItem[];
  musicItems: BackgroundAudioItem[];
  drumsItems: BackgroundAudioItem[];
  noiseItems: BackgroundAudioItem[];
  compositionItems: BackgroundAudioItem[];
  factoryMixes?: MixerFactoryPreset[];
  factoryMixesLoading?: boolean;
  error: string | null;
  initialMix: MixEditorValues;
  resetMix: MixEditorValues;
  stripPlayingMusicKey?: string | null;
  onLiveVolume: (channel: BedVolumeChannel, gain: number) => void;
  onLiveVoiceFx?: (dial: number) => void;
  onPreview: (mix: MixEditorValues) => void;
  onPersist: (mix: MixEditorValues) => void | Promise<void>;
  onClose: () => void;
  closeRef: { current: (() => void) | null };
}) {
  const favorites = useSoundFavorites();
  const [bedTab, setBedTab] = useState<"library" | "mixer">("library");
  const [natureKey, setNatureKey] = useState(initialMix.natureKey);
  const [musicKey, setMusicKey] = useState(initialMix.musicKey);
  const [drumsKey, setDrumsKey] = useState(initialMix.drumsKey);
  const [noiseKey, setNoiseKey] = useState(initialMix.noiseKey);
  const [natureGain, setNatureGain] = useState(initialMix.natureGain);
  const [musicGain, setMusicGain] = useState(initialMix.musicGain);
  const [drumsGain, setDrumsGain] = useState(initialMix.drumsGain);
  const [noiseGain, setNoiseGain] = useState(initialMix.noiseGain);
  const [voiceFxDial, setVoiceFxDial] = useState(
    initialMix.voiceFxDial ?? VOICE_FX_DIAL_DEFAULT,
  );
  const [musicLevel, setMusicLevel] = useState(SOUND_VOLUME_RECOMMENDED);
  const [stagedSoundId, setStagedSoundId] = useState("");
  const [soundCategory, setSoundCategory] = useState("our-picks");
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
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const mediaBase = getMedimadeMediaBaseUrl();

  const mixRef = useRef<MixEditorValues>({
    natureKey,
    musicKey,
    drumsKey,
    noiseKey,
    natureGain,
    musicGain,
    drumsGain,
    noiseGain,
    voiceFxDial,
  });
  mixRef.current = {
    natureKey,
    musicKey,
    drumsKey,
    noiseKey,
    natureGain,
    musicGain,
    drumsGain,
    noiseGain,
    voiceFxDial,
  };

  const musicLevelRef = useRef(musicLevel);
  musicLevelRef.current = musicLevel;

  function effectiveMix(base: MixEditorValues, level = musicLevelRef.current): MixEditorValues {
    return {
      ...base,
      natureGain: musicLevelToBedGain(level, base.natureGain),
      musicGain: musicLevelToBedGain(level, base.musicGain),
      drumsGain: musicLevelToBedGain(level, base.drumsGain),
      noiseGain: musicLevelToBedGain(level, base.noiseGain),
    };
  }

  function previewNow(next: MixEditorValues) {
    onPreview(effectiveMix(next));
  }

  function pushLiveVolumes(level: number, base: MixEditorValues) {
    onLiveVolume("music", musicLevelToBedGain(level, base.musicGain));
    onLiveVolume("nature", musicLevelToBedGain(level, base.natureGain));
    onLiveVolume("drums", musicLevelToBedGain(level, base.drumsGain));
    onLiveVolume("noise", musicLevelToBedGain(level, base.noiseGain));
  }

  useEffect(() => {
    if (!open) return;
    setNatureKey(initialMix.natureKey);
    setMusicKey(initialMix.musicKey);
    setDrumsKey(initialMix.drumsKey);
    setNoiseKey(initialMix.noiseKey);
    setNatureGain(initialMix.natureGain);
    setMusicGain(initialMix.musicGain);
    setDrumsGain(initialMix.drumsGain);
    setNoiseGain(initialMix.noiseGain);
    setVoiceFxDial(initialMix.voiceFxDial ?? VOICE_FX_DIAL_DEFAULT);
    setMusicLevel(SOUND_VOLUME_RECOMMENDED);
    const scape = isSoundscapeKey(compositionItems, initialMix.musicKey);
    const hasMixer =
      Boolean(initialMix.natureKey.trim()) ||
      Boolean(initialMix.drumsKey.trim()) ||
      Boolean(initialMix.noiseKey.trim()) ||
      (Boolean(initialMix.musicKey.trim()) && !scape);
    setBedTab(scape || !hasMixer ? "library" : "mixer");
    setStagedSoundId(
      scape
        ? compositionItems.find(
            (c) =>
              backgroundAudioStreamingKey(c.key) ===
              backgroundAudioStreamingKey(initialMix.musicKey),
          )?.key ?? initialMix.musicKey
        : "",
    );
    previewNow(initialMix);
    pushLiveVolumes(SOUND_VOLUME_RECOMMENDED, initialMix);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once per open
  }, [open]);

  const closeAndSave = useCallback(() => {
    const mix = effectiveMix(mixRef.current);
    void Promise.resolve(onPersist(mix)).catch(() => {});
    onClose();
  }, [onClose, onPersist]);

  closeRef.current = closeAndSave;

  const drumsLockedForMelodic = isMelodicMusicKey(musicItems, musicKey);
  const drumsPreviewKey = drumsLockedForMelodic ? "" : drumsKey;
  const soundscapeSelected = isSoundscapeKey(compositionItems, musicKey);

  const filteredSoundscapes = useMemo(() => {
    let list = [...compositionItems];
    if (soundCategory === "favourites") {
      list = list.filter((c) => favorites.compositionSet.has(c.key));
    } else if (soundCategory === "our-picks") {
      const picks = list.filter((c) => c.adminFavourite);
      list = picks.length > 0 ? picks : list;
    } else if (soundCategory !== "all") {
      list = list.filter(
        (c) =>
          (c.customPackName ?? "").trim().toLowerCase() ===
          soundCategory.trim().toLowerCase(),
      );
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [compositionItems, soundCategory, favorites.compositionSet]);

  const soundPacks = useMemo(() => {
    const packs = new Set<string>();
    for (const c of compositionItems) {
      const p = c.customPackName?.trim();
      if (p) packs.add(p);
    }
    return [...packs].sort((a, b) => a.localeCompare(b));
  }, [compositionItems]);

  const currentMixBeds: MixerPresetMix = {
    natureKey,
    musicKey: soundscapeSelected ? "" : musicKey,
    drumsKey: drumsPreviewKey,
    noiseKey,
    natureGain,
    musicGain,
    drumsGain,
    noiseGain,
    musicEnabled: true,
    natureEnabled: true,
    drumsEnabled: true,
    noiseEnabled: true,
    masterVolume: 100,
  };

  const mixDirty =
    mixBaseline != null &&
    (mixBaseline.natureKey !== currentMixBeds.natureKey ||
      mixBaseline.musicKey !== currentMixBeds.musicKey ||
      mixBaseline.drumsKey !== currentMixBeds.drumsKey ||
      mixBaseline.noiseKey !== currentMixBeds.noiseKey ||
      mixBaseline.natureGain !== currentMixBeds.natureGain ||
      mixBaseline.musicGain !== currentMixBeds.musicGain ||
      mixBaseline.drumsGain !== currentMixBeds.drumsGain ||
      mixBaseline.noiseGain !== currentMixBeds.noiseGain);

  function applyBedMix(mix: MixerPresetMix, selectedKey: string) {
    setNatureKey(mix.natureKey);
    setMusicKey(mix.musicKey);
    setDrumsKey(mix.drumsKey);
    setNoiseKey(mix.noiseKey);
    setNatureGain(mix.natureGain);
    setMusicGain(mix.musicGain);
    setDrumsGain(mix.drumsGain);
    setNoiseGain(mix.noiseGain);
    setSelectedMixKey(selectedKey);
    setMixBaseline({ ...mix });
    const next: MixEditorValues = {
      natureKey: mix.natureKey,
      musicKey: mix.musicKey,
      drumsKey: mix.drumsKey,
      noiseKey: mix.noiseKey,
      natureGain: mix.natureGain,
      musicGain: mix.musicGain,
      drumsGain: mix.drumsGain,
      noiseGain: mix.noiseGain,
      voiceFxDial,
    };
    mixRef.current = next;
    previewNow(next);
    pushLiveVolumes(musicLevelRef.current, next);
  }

  function onSelectMixPreset(key: string) {
    if (key.startsWith("factory:")) {
      const id = key.slice("factory:".length);
      const preset = factoryMixes.find((p) => p.id === id);
      if (!preset) return;
      applyBedMix(mixForPlayback(factoryPresetToMix(preset)), key);
      return;
    }
    if (key.startsWith("user:")) {
      const id = key.slice("user:".length);
      const preset = userMixPresets.find((p) => p.id === id);
      if (!preset) return;
      applyBedMix(mixForPlayback(mixerPresetToMix(preset)), key);
    }
  }

  function saveNewMixPreset(name: string) {
    const preset: MixerPreset = {
      ...newMixerPreset(name),
      ...currentMixBeds,
    };
    const store = loadMixerPresetStore();
    const next = {
      version: 1 as const,
      activeId: preset.id,
      presets: [preset, ...store.presets.filter((x) => x.id !== preset.id)],
    };
    saveMixerPresetStore(next);
    setUserMixPresets(next.presets);
    setSelectedMixKey(`user:${preset.id}`);
    setMixBaseline(mixerPresetToMix(preset));
    setMixNaming(false);
  }

  function updateUserMixPreset() {
    if (!selectedMixKey.startsWith("user:")) return;
    const id = selectedMixKey.slice("user:".length);
    const store = loadMixerPresetStore();
    const presets = store.presets.map((p) =>
      p.id === id ? { ...p, ...currentMixBeds, updatedAt: new Date().toISOString() } : p,
    );
    saveMixerPresetStore({ ...store, presets });
    setUserMixPresets(presets);
    setMixBaseline({ ...currentMixBeds });
  }

  function deleteUserMixPreset() {
    if (!selectedMixKey.startsWith("user:")) return;
    const id = selectedMixKey.slice("user:".length);
    const store = loadMixerPresetStore();
    const presets = store.presets.filter((p) => p.id !== id);
    saveMixerPresetStore({ ...store, presets });
    setUserMixPresets(presets);
    setSelectedMixKey("");
    setMixBaseline(null);
  }

  function soundscapePreviewUrl(key: string): string | null {
    if (!mediaBase || !key.trim()) return null;
    return mediaFileUrl(mediaBase, backgroundAudioStreamingKey(key));
  }

  function chooseSoundscape(key: string) {
    const next: MixEditorValues = {
      natureKey: "",
      musicKey: key,
      drumsKey: "",
      noiseKey: "",
      natureGain,
      musicGain: SOUNDSCAPE_MIX_GAIN,
      drumsGain,
      noiseGain,
      voiceFxDial,
    };
    setNatureKey("");
    setMusicKey(key);
    setDrumsKey("");
    setNoiseKey("");
    setMusicGain(SOUNDSCAPE_MIX_GAIN);
    setStagedSoundId(key);
    mixRef.current = next;
    previewNow(next);
    pushLiveVolumes(musicLevelRef.current, next);
  }

  function chooseSilence() {
    const next: MixEditorValues = {
      natureKey: "",
      musicKey: "",
      drumsKey: "",
      noiseKey: "",
      natureGain,
      musicGain: SOUNDSCAPE_MIX_GAIN,
      drumsGain,
      noiseGain,
      voiceFxDial,
    };
    setNatureKey("");
    setMusicKey("");
    setDrumsKey("");
    setNoiseKey("");
    setStagedSoundId("");
    mixRef.current = next;
    void Promise.resolve(onPersist(effectiveMix(next))).catch(() => {});
    onClose();
  }

  function commitPanel() {
    if (bedTab === "mixer") {
      closeAndSave();
      return;
    }
    if (stagedSoundId) {
      chooseSoundscape(stagedSoundId);
      const next = mixRef.current;
      void Promise.resolve(onPersist(effectiveMix(next))).catch(() => {});
      onClose();
      return;
    }
    closeAndSave();
  }

  function applyResetMix() {
    const next = resetMix;
    setNatureKey(next.natureKey);
    setMusicKey(next.musicKey);
    setDrumsKey(next.drumsKey);
    setNoiseKey(next.noiseKey);
    setNatureGain(next.natureGain);
    setMusicGain(next.musicGain);
    setDrumsGain(next.drumsGain);
    setNoiseGain(next.noiseGain);
    setVoiceFxDial(next.voiceFxDial ?? VOICE_FX_DIAL_DEFAULT);
    setMusicLevel(SOUND_VOLUME_RECOMMENDED);
    mixRef.current = next;
    const scape = isSoundscapeKey(compositionItems, next.musicKey);
    setBedTab(scape ? "library" : "mixer");
    setStagedSoundId(scape ? next.musicKey : "");
    previewNow(next);
    pushLiveVolumes(SOUND_VOLUME_RECOMMENDED, next);
    void Promise.resolve(onPersist(effectiveMix(next, SOUND_VOLUME_RECOMMENDED))).catch(
      () => {},
    );
  }

  function onMixerKeyChange(channel: BedVolumeChannel, value: string) {
    let next = mixWithKey(mixRef.current, channel, value);
    if (
      channel !== "music" &&
      isSoundscapeKey(compositionItems, mixRef.current.musicKey)
    ) {
      next = { ...next, musicKey: "" };
      setMusicKey("");
    }
    if (channel === "music") setMusicKey(value);
    if (channel === "nature") setNatureKey(value);
    if (channel === "drums") setDrumsKey(value);
    if (channel === "noise") setNoiseKey(value);
    mixRef.current = next;
    previewNow(next);
  }

  function onMixerGainCommit(channel: BedVolumeChannel, gain: number) {
    const next = mixWithGain(mixRef.current, channel, gain);
    if (channel === "music") setMusicGain(gain);
    if (channel === "nature") setNatureGain(gain);
    if (channel === "drums") setDrumsGain(gain);
    if (channel === "noise") setNoiseGain(gain);
    mixRef.current = next;
    previewNow(next);
  }

  function applyLiveBedGain(channel: BedVolumeChannel, gain: number) {
    mixRef.current = mixWithGain(mixRef.current, channel, gain);
    onLiveVolume(channel, musicLevelToBedGain(musicLevelRef.current, gain));
  }

  useEffect(() => {
    if (!open) return;
    pushLiveVolumes(musicLevel, mixRef.current);
    previewNow(mixRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicLevel, open]);

  useEffect(
    () => () => {
      const el = previewRef.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
      }
    },
    [],
  );

  const mixerPanelName = selectedMixKey.startsWith("user:")
    ? (userMixPresets.find((p) => `user:${p.id}` === selectedMixKey)?.name ??
      "Your mix")
    : selectedMixKey.startsWith("factory:")
      ? (factoryMixes.find((p) => `factory:${p.id}` === selectedMixKey)?.name ??
        "Your mix")
      : "Your mix";

  const mixLayerBits = [
    !soundscapeSelected && musicKey && "Music",
    natureKey && "Ambience",
    drumsPreviewKey && "Drums",
    noiseKey && "Noise",
  ].filter(Boolean);

  const footSummary =
    bedTab === "mixer"
      ? `${mixerPanelName} · ${mixLayerBits.length} layers · Vol ${musicLevel}%`
      : stagedSoundId
        ? `${compositionItems.find((c) => c.key === stagedSoundId)?.name ?? "Soundscape"} · Vol ${musicLevel}%`
        : `Volume ${musicLevel}%`;

  const volumeFader = (
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
            aria-label="Master volume"
            value={musicLevel}
            onChange={(e) => setMusicLevel(Number(e.target.value))}
            className="create-sound-axis-fader relative z-[1]"
            style={
              {
                ["--fader-pct" as string]: axisFaderThumbCenter(musicLevel),
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
  );

  return (
    <CreateOneFlowPickerShell
      open={open}
      host="viewport"
      eyebrow="Edit · Mix"
      title={title.trim() || "Background mix"}
      panelWidth="sound"
      footSummary={footSummary}
      confirmLabel={bedTab === "mixer" ? "Use this mix" : "Use this sound"}
      secondaryLabel={bedTab === "library" ? "Use silence" : undefined}
      onSecondary={bedTab === "library" ? chooseSilence : undefined}
      onClose={closeAndSave}
      onConfirm={commitPanel}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 md:px-6 md:py-3.5"
      preFooter={volumeFader}
    >
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <SegmentedPillTabs<"library" | "mixer">
            aria-label="Sound library"
            value={bedTab}
            onChange={(id) => {
              if (id === "mixer" && soundscapeSelected) {
                const next = mixWithKey(mixRef.current, "music", "");
                setMusicKey("");
                mixRef.current = next;
                previewNow(next);
              }
              setBedTab(id);
            }}
            equalWidth
            className="min-w-0 flex-1 rounded-xl border-0 bg-accent-soft/80 p-[3px]"
            selectedClassName="header-gold-sunlit-fill rounded-[9px] border-0 font-semibold text-on-accent"
            idleClassName="rounded-[9px] border border-transparent font-medium text-muted"
            options={[
              { id: "library", label: "Soundscapes" },
              { id: "mixer", label: "Build your own" },
            ]}
          />
          <button
            type="button"
            onClick={applyResetMix}
            className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted hover:bg-accent-soft/50 hover:text-foreground"
            aria-label="Reset mix to original"
            title="Reset mix to original"
          >
            <IconMixReset />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground">
            FX
          </span>
          <VoiceFxKnob
            value={voiceFxDial}
            onChange={(n) => {
              setVoiceFxDial(n);
              mixRef.current = { ...mixRef.current, voiceFxDial: n };
              onLiveVoiceFx?.(n);
            }}
            onCommit={() => {
              previewNow(mixRef.current);
            }}
          />
          <span className="text-xs tabular-nums text-muted">{voiceFxDial}</span>
        </div>
        {bedTab === "library" ? (
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={soundCategory === "favourites"}
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
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>

      {bedTab === "library" ? (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <div className="mb-2 mt-1 flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
              {soundCategory === "our-picks"
                ? `Our Picks · ${filteredSoundscapes.length}`
                : soundCategory === "favourites"
                  ? `Favourites · ${filteredSoundscapes.length}`
                  : `Soundscapes · ${filteredSoundscapes.length}`}
            </p>
            <span className="inline-flex items-center gap-1 text-[12px] text-muted">
              A–Z
              <SelectChevron />
            </span>
          </div>
          {filteredSoundscapes.length > 0 ? (
            <SyncedMarqueeProvider
              resetKey={`${soundCategory}|${filteredSoundscapes.length}`}
              className="grid grid-cols-1 gap-2 md:grid-cols-2"
            >
              {filteredSoundscapes.map((item) => {
                const selected = stagedSoundId === item.key;
                const playingScape =
                  Boolean(stripPlayingMusicKey) &&
                  backgroundAudioStreamingKey(stripPlayingMusicKey ?? "") ===
                    backgroundAudioStreamingKey(item.key);
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
                      selected
                        ? "border-2 border-accent p-[7px]"
                        : "border-border"
                    }`}
                  >
                    <span
                      className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-accent-soft"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (
                          backgroundAudioStreamingKey(musicKey) !==
                          backgroundAudioStreamingKey(item.key)
                        ) {
                          chooseSoundscape(item.key);
                        } else {
                          previewNow(mixRef.current);
                        }
                      }}
                      role="presentation"
                    >
                      {item.coverImageThumbUrl || item.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            item.coverImageThumbUrl || item.coverImageUrl || ""
                          }
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 basis-0 overflow-hidden pr-8">
                      <SyncedMarqueeTitle
                        id={item.key}
                        text={item.name}
                        className="w-full font-display text-[15px] leading-[1.25] text-foreground"
                      />
                      <p className="mt-0.5 truncate text-[12px] text-muted">
                        {soundscapeCategoryLabel(item)}
                        {playingScape ? " · Playing" : ""}
                      </p>
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
          ) : (
            <SoundscapePicker
              variant="create"
              items={compositionItems}
              value={stagedSoundId}
              onChange={chooseSoundscape}
              previewUrl={soundscapePreviewUrl}
              playingKey={stripPlayingMusicKey ?? previewKey}
              requirePreviewUrl={false}
              onTogglePreview={(key) => {
                if (
                  backgroundAudioStreamingKey(musicKey) !==
                  backgroundAudioStreamingKey(key)
                ) {
                  chooseSoundscape(key);
                } else {
                  previewNow(mixRef.current);
                }
              }}
            />
          )}
          <audio
            ref={previewRef}
            className="hidden"
            playsInline
            onEnded={() => setPreviewKey(null)}
          />
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
                  placeholder="Untitled mix"
                  className="h-10 min-w-0 flex-1 rounded-[10px] border border-border bg-card px-3 text-[14px] outline-none"
                />
                <button
                  type="button"
                  disabled={!mixSaveName.trim()}
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
                    disabled={false}
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
                    onClick={updateUserMixPreset}
                    className="h-10 shrink-0 cursor-pointer rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold"
                  >
                    Update
                  </button>
                ) : null}
                <button
                  type="button"
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
              items={musicItems}
              value={soundscapeSelected ? "" : musicKey}
              onChange={(k) => onMixerKeyChange("music", k)}
              gain={musicGain}
              onGainChange={(g) => onMixerGainCommit("music", g)}
              onLiveGainChange={(g) => applyLiveBedGain("music", g)}
              faderDisabled={!musicKey || soundscapeSelected}
              playing={playing.music}
              onTogglePreview={() =>
                setPlaying((p) => ({ ...p, music: !p.music }))
              }
              playDisabled={!musicKey || soundscapeSelected}
              playAriaLabel={playing.music ? "Pause music" : "Play music"}
              favoriteKeys={favorites.compositionSet}
              onToggleFavorite={favorites.toggleComposition}
            />
            <MixerDeskRow
              label="Ambience"
              category="ambience"
              items={natureItems}
              value={natureKey}
              onChange={(k) => onMixerKeyChange("nature", k)}
              gain={natureGain}
              onGainChange={(g) => onMixerGainCommit("nature", g)}
              onLiveGainChange={(g) => applyLiveBedGain("nature", g)}
              faderDisabled={!natureKey}
              playing={playing.nature}
              onTogglePreview={() =>
                setPlaying((p) => ({ ...p, nature: !p.nature }))
              }
              playDisabled={!natureKey}
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
                items={drumsItems}
                value={drumsKey}
                onChange={(k) => onMixerKeyChange("drums", k)}
                gain={drumsGain}
                onGainChange={(g) => onMixerGainCommit("drums", g)}
                onLiveGainChange={(g) => applyLiveBedGain("drums", g)}
                disabled={drumsLockedForMelodic}
                faderDisabled={drumsLockedForMelodic || !drumsKey}
                playing={playing.drums}
                onTogglePreview={() =>
                  setPlaying((p) => ({ ...p, drums: !p.drums }))
                }
                playDisabled={drumsLockedForMelodic || !drumsKey}
                playAriaLabel={playing.drums ? "Pause drums" : "Play drums"}
                favoriteKeys={favorites.compositionSet}
                onToggleFavorite={favorites.toggleComposition}
              />
            </DrumsLockedWrap>
            <MixerDeskRow
              label="Noise"
              category="noise"
              items={noiseItems}
              value={noiseKey}
              onChange={(k) => onMixerKeyChange("noise", k)}
              gain={noiseGain}
              onGainChange={(g) => onMixerGainCommit("noise", g)}
              onLiveGainChange={(g) => applyLiveBedGain("noise", g)}
              faderDisabled={!noiseKey}
              playing={playing.noise}
              onTogglePreview={() =>
                setPlaying((p) => ({ ...p, noise: !p.noise }))
              }
              playDisabled={!noiseKey}
              playAriaLabel={playing.noise ? "Pause noise" : "Play noise"}
              favoriteKeys={favorites.compositionSet}
              onToggleFavorite={favorites.toggleComposition}
              last
            />
          </div>
        </div>
      )}
    </CreateOneFlowPickerShell>
  );
}

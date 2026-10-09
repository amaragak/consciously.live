import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import { MixerChannel, MixerVoiceChannel } from "@/components/mixer-channel";
import { DrumsLockedWrap } from "@/components/drums-locked-wrap";
import { FactoryIconSelect } from "@/components/factory-icons";
import { FactoryPresetRow } from "@/components/factory-preset-row";
import { SoundFolderSelect } from "@/components/sound-folder-select";
import { SoundsConfirmModal } from "@/components/sounds-confirm-modal";
import { SoundsDiscardChangesModal } from "@/components/sounds-discard-changes-modal";
import {
  SoundsMobileActionBar,
  SoundsPresetBar,
  type SoundsSaveActions,
} from "@/components/sounds-preset-bar";
import {
  flattenPresetSections,
  sectionPresetMenu,
  type SoundsPresetMenuItem,
} from "@/components/sounds-preset-menu";
import {
  SoundsLayerRow,
  SoundsLayerStrip,
} from "@/components/sounds-mixer-strips";
import { useMinWidth } from "@/hooks/use-min-width";
import { isMelodicMusicKey } from "@/lib/sound-taxonomy";
import { bedElementVolume } from "@/lib/bed-volume";
import {
  pauseGaplessBed,
  releaseGaplessBed,
  resumeGaplessBed,
  setGaplessBedVolume,
  syncGaplessBed,
} from "@/lib/gapless-bed-loop";
import {
  backgroundAudioPlaybackKey,
  deleteAdminFactoryMix,
  getMedimadeMediaBaseUrl,
  listAdminFactoryMixes,
  listBackgroundAudio,
  listFishSpeakers,
  peekBackgroundAudioCache,
  preloadBackgroundAudioCoverImages,
  saveAdminFactoryMix,
  type BackgroundAudioItem,
  type FishSpeaker,
} from "@/lib/medimade-api";
import {
  FACTORY_COLOR_PRESETS,
  emptyFactoryPreset,
  factoryPresetEquals,
  factoryPresetToMix,
  mixToFactoryChannels,
  type MixerFactoryPreset,
} from "@/lib/mixer-factory-presets";
import {
  factoryMixFavoriteId,
  userMixFavoriteId,
  useSoundFavorites,
} from "@/lib/sound-favorites";
import {
  emptyMixerMix,
  loadMixerPresetStore,
  mixEquals,
  mixForPlayback,
  mixerPresetToMix,
  newMixerPreset,
  normalizeFaderGains,
  saveMixerPresetStore,
  type MixerPreset,
  type MixerPresetMix,
} from "@/lib/mixer-preset-storage";
import {
  speakerPreviewLoudFxSampleKey,
  speakerPreviewLoudSampleKey,
  speakerSampleSpeedOrRate,
  withSpeakerSampleCacheBust,
} from "@/lib/speaker-sample-speed";

import {
  readSoundsLastOpen,
  writeSoundsLastOpen,
} from "@/lib/sounds-recent-mixes";
import { SOUNDS_HREF } from "@/lib/sounds-tabs";

type SoundsRoute =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "mix"; id: string }
  | { kind: "preset"; id: string };

function soundsRouteFromPath(pathname: string): SoundsRoute {
  if (pathname === SOUNDS_HREF || pathname === `${SOUNDS_HREF}/`) {
    return { kind: "list" };
  }
  if (pathname === `${SOUNDS_HREF}/new` || pathname === `${SOUNDS_HREF}/new/`) {
    return { kind: "new" };
  }
  const mix = /^\/meditate\/sounds\/mix\/([^/]+)\/?$/.exec(pathname);
  if (mix?.[1]) {
    try {
      return { kind: "mix", id: decodeURIComponent(mix[1]) };
    } catch {
      return { kind: "mix", id: mix[1] };
    }
  }
  const preset = /^\/meditate\/sounds\/preset\/([^/]+)\/?$/.exec(pathname);
  if (preset?.[1]) {
    try {
      return { kind: "preset", id: decodeURIComponent(preset[1]) };
    } catch {
      return { kind: "preset", id: preset[1] };
    }
  }
  return { kind: "list" };
}

type BedTrack = "nature" | "music" | "drums" | "noise";

function mediaFileUrl(base: string, key: string): string {
  const b = base.replace(/\/+$/, "");
  const k = key.replace(/^\/+/, "");
  return `${b}/${k}`;
}

function FactoryPresetListSkeleton() {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Loading factory presets">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-[3.75rem] animate-pulse rounded-[10px] border-[0.5px] border-border bg-muted/25"
        />
      ))}
    </ul>
  );
}

export function MixerSoundsStudio({
  variant = "user",
  initialFactoryPresets = null,
}: {
  variant?: "user" | "admin";
  initialFactoryPresets?: MixerFactoryPreset[] | null;
}) {
  const isAdmin = variant === "admin";
  const { pathname: pathnameRaw } = useLocation();
  const pathname = pathnameRaw || SOUNDS_HREF;
  const navigate = useNavigate();
  const soundsRoute = isAdmin ? { kind: "list" as const } : soundsRouteFromPath(pathname);
  const mobileEditorOpen =
    !isAdmin &&
    (soundsRoute.kind === "new" ||
      soundsRoute.kind === "mix" ||
      soundsRoute.kind === "preset");
  const [hydrated, setHydrated] = useState(false);
  const [presets, setPresets] = useState<MixerPreset[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mix, setMix] = useState<MixerPresetMix>(emptyMixerMix);
  const [nameDraft, setNameDraft] = useState("Untitled mix");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [iconDraft, setIconDraft] = useState("cloud-rain");
  const [iconBgDraft, setIconBgDraft] = useState("#E4EEF4");
  const [iconColorDraft, setIconColorDraft] = useState("#3D5A73");
  const [cachedBeds] = useState(() => peekBackgroundAudioCache());
  const [factoryPresets, setFactoryPresets] = useState<MixerFactoryPreset[]>(
    () => initialFactoryPresets ?? cachedBeds?.factoryMixes ?? [],
  );
  const [factoryPresetsLoading, setFactoryPresetsLoading] = useState(
    () =>
      initialFactoryPresets == null &&
      (isAdmin || !cachedBeds),
  );
  const [loadedFactoryId, setLoadedFactoryId] = useState<string | null>(null);
  const [factoryPreviewId, setFactoryPreviewId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Pending action after Discard in the unsaved-changes modal (user path). */
  const [discardPrompt, setDiscardPrompt] = useState<{
    mixName: string;
    proceed: () => void;
  } | null>(null);
  /** Delete confirm (user mix or factory) — same light modal as discard. */
  const [deletePrompt, setDeletePrompt] = useState<{
    mixName: string;
    factory: boolean;
    proceed: () => void;
  } | null>(null);
  const [factoryPresetsOpen, setFactoryPresetsOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem("mm_sounds_factory_open_v1") !== "0";
    } catch {
      return true;
    }
  });

  const [backgroundNature, setBackgroundNature] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.nature ?? [],
  );
  const [backgroundMusic, setBackgroundMusic] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.music ?? [],
  );
  const [backgroundDrums, setBackgroundDrums] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.drums ?? [],
  );
  const [backgroundNoise, setBackgroundNoise] = useState<BackgroundAudioItem[]>(
    () => cachedBeds?.noise ?? [],
  );
  const [mediaBaseUrl, setMediaBaseUrl] = useState<string | null>(
    () => cachedBeds?.baseUrl?.trim() || getMedimadeMediaBaseUrl() || null,
  );
  const [fishSpeakers, setFishSpeakers] = useState<FishSpeaker[]>([]);
  const [speakerModelId, setSpeakerModelId] = useState("");
  const [speakerFxPreviewOn, setSpeakerFxPreviewOn] = useState(true);
  const [speakerPlaying, setSpeakerPlaying] = useState(false);
  const favorites = useSoundFavorites();
  const isDesktop = useMinWidth(768);

  const [playing, setPlaying] = useState<Record<BedTrack, boolean>>({
    nature: false,
    music: false,
    drums: false,
    noise: false,
  });
  const [playAllActive, setPlayAllActive] = useState(false);

  const previewNatureRef = useRef<HTMLAudioElement | null>(null);
  const previewMusicRef = useRef<HTMLAudioElement | null>(null);
  const previewDrumsRef = useRef<HTMLAudioElement | null>(null);
  const previewNoiseRef = useRef<HTMLAudioElement | null>(null);
  const speakerSampleRef = useRef<HTMLAudioElement | null>(null);
  const factoryNatureRef = useRef<HTMLAudioElement | null>(null);
  const factoryMusicRef = useRef<HTMLAudioElement | null>(null);
  const factoryDrumsRef = useRef<HTMLAudioElement | null>(null);
  const factoryNoiseRef = useRef<HTMLAudioElement | null>(null);
  const handledNewRouteRef = useRef(false);
  /** One-shot restore of last-open / Nostalgia when landing on `/meditate/sounds`. */
  const listRestoreDoneRef = useRef(false);
  /** Route key last applied to the editor — prevents click+navigate double-load flash. */
  const appliedRouteKeyRef = useRef<string | null>(null);
  const lastBgKeysRef = useRef<Record<BedTrack, string>>({
    nature: "",
    music: "",
    drums: "",
    noise: "",
  });
  const bedGainRef = useRef({
    nature: mix.natureGain,
    music: mix.musicGain,
    drums: mix.drumsGain,
    noise: mix.noiseGain,
  });

  const masterVolumeRef = useRef(mix.masterVolume);

  function layerVolume(track: BedTrack): number {
    return bedElementVolume(
      (bedGainRef.current[track] * masterVolumeRef.current) / 100,
    );
  }

  function applyAllLiveVolumes() {
    setGaplessBedVolume(previewNatureRef.current, layerVolume("nature"));
    setGaplessBedVolume(previewMusicRef.current, layerVolume("music"));
    setGaplessBedVolume(previewDrumsRef.current, layerVolume("drums"));
    setGaplessBedVolume(previewNoiseRef.current, layerVolume("noise"));
  }

  useEffect(() => {
    bedGainRef.current = {
      nature: mix.natureGain,
      music: mix.musicGain,
      drums: mix.drumsGain,
      noise: mix.noiseGain,
    };
    masterVolumeRef.current = mix.masterVolume;
    applyAllLiveVolumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mix.natureGain,
    mix.musicGain,
    mix.drumsGain,
    mix.noiseGain,
    mix.masterVolume,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "mm_sounds_factory_open_v1",
        factoryPresetsOpen ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [factoryPresetsOpen]);

  function applyLiveBedGain(track: BedTrack, gain: number) {
    bedGainRef.current[track] = gain;
    const el =
      track === "nature"
        ? previewNatureRef.current
        : track === "music"
          ? previewMusicRef.current
          : track === "drums"
            ? previewDrumsRef.current
            : previewNoiseRef.current;
    setGaplessBedVolume(el, layerVolume(track));
  }

  const drumsLockedForMelodic = isMelodicMusicKey(
    backgroundMusic,
    mix.musicKey,
  );
  const drumsPreviewKey = drumsLockedForMelodic ? "" : mix.drumsKey;

  const activePreset = useMemo(
    () => presets.find((p) => p.id === activeId) ?? null,
    [presets, activeId],
  );

  const loadedFactory = useMemo(
    () => factoryPresets.find((p) => p.id === loadedFactoryId) ?? null,
    [factoryPresets, loadedFactoryId],
  );

  const editorFactory: MixerFactoryPreset = useMemo(
    () => ({
      id: loadedFactoryId || "",
      name: nameDraft.trim() || "Untitled mix",
      description: descriptionDraft.trim(),
      icon: iconDraft,
      icon_bg: iconBgDraft,
      icon_color: iconColorDraft,
      channels: mixToFactoryChannels(mix),
    }),
    [
      loadedFactoryId,
      nameDraft,
      descriptionDraft,
      iconDraft,
      iconBgDraft,
      iconColorDraft,
      mix,
    ],
  );

  /** Factory presets are locked: edits live in memory until "Save as my mix". */
  const factoryDirty = useMemo(() => {
    if (isAdmin || !loadedFactory) return false;
    // Saved factory gains are fader-normalised; compare like-for-like so Save
    // doesn’t leave the desk looking dirty while faders stay as the user set them.
    return !mixEquals(
      normalizeFaderGains(mix),
      factoryPresetToMix(loadedFactory),
    );
  }, [isAdmin, loadedFactory, mix]);

  const dirty = useMemo(() => {
    if (!isAdmin && loadedFactory) return factoryDirty;
    if (isAdmin) {
      if (!loadedFactory) return true;
      return !factoryPresetEquals(loadedFactory, {
        ...editorFactory,
        id: loadedFactory.id,
        channels: mixToFactoryChannels(normalizeFaderGains(mix)),
      });
    }
    if (!activePreset) return true;
    if (nameDraft.trim() !== activePreset.name) return true;
    return !mixEquals(normalizeFaderGains(mix), mixerPresetToMix(activePreset));
  }, [
    isAdmin,
    loadedFactory,
    factoryDirty,
    editorFactory,
    activePreset,
    mix,
    nameDraft,
  ]);

  useEffect(() => {
    if (isAdmin) {
      setHydrated(true);
      return;
    }
    const store = loadMixerPresetStore();
    setPresets(store.presets);
    setActiveId(store.activeId);
    // List URL restores last-open / Nostalgia in the route effect — don't paint
    // a stale user mix first (that flashes before the factory default loads).
    setHydrated(true);
  }, [isAdmin]);

  useEffect(() => {
    if (!hydrated || isAdmin) return;
    saveMixerPresetStore({
      version: 1,
      activeId,
      presets,
    });
  }, [hydrated, isAdmin, activeId, presets]);

  /**
   * Deep-link / browser back: sync editor from `/meditate/sounds/...` (user only).
   *
   * Do not depend on `activeId` / editor state here — a preset click updates those
   * before `pathname` catches up, and re-running with the stale URL reloads the
   * previous mix (visible UI flash). Clicks set `appliedRouteKeyRef` first so the
   * path update is a no-op; this effect only applies when the URL is ahead of the
   * editor (back/forward, cold load, or factory list just arriving).
   */
  useEffect(() => {
    if (isAdmin || !hydrated) return;
    const route = soundsRouteFromPath(pathname);

    if (route.kind === "list") {
      handledNewRouteRef.current = false;
      if (factoryPresetsLoading) return;
      if (listRestoreDoneRef.current) {
        appliedRouteKeyRef.current = "list";
        return;
      }
      listRestoreDoneRef.current = true;

      const openLastOrDefault = () => {
        const last = readSoundsLastOpen();
        if (last?.kind === "mix") {
          const p = presets.find((x) => x.id === last.id);
          if (p) {
            appliedRouteKeyRef.current = `mix:${p.id}`;
            loadMixIntoEditor({
              name: p.name,
              mix: mixerPresetToMix(p),
              savedId: p.id,
            });
            navigate(`${SOUNDS_HREF}/mix/${encodeURIComponent(p.id)}`, {
              replace: true,
            });
            return;
          }
        }
        if (last?.kind === "preset") {
          const p = factoryPresets.find((x) => x.id === last.id);
          if (p) {
            appliedRouteKeyRef.current = `preset:${p.id}`;
            loadMixIntoEditor({
              name: p.name,
              mix: factoryPresetToMix(p),
              savedId: null,
              factoryId: p.id,
              factoryMeta: {
                description: p.description,
                icon: p.icon,
                icon_bg: p.icon_bg,
                icon_color: p.icon_color,
              },
            });
            navigate(`${SOUNDS_HREF}/preset/${encodeURIComponent(p.id)}`, {
              replace: true,
            });
            return;
          }
        }
        const nostalgia =
          factoryPresets.find(
            (p) => p.name.trim().toLowerCase() === "nostalgia",
          ) ?? null;
        const fallback = nostalgia ?? factoryPresets[0] ?? null;
        if (fallback) {
          appliedRouteKeyRef.current = `preset:${fallback.id}`;
          loadMixIntoEditor({
            name: fallback.name,
            mix: factoryPresetToMix(fallback),
            savedId: null,
            factoryId: fallback.id,
            factoryMeta: {
              description: fallback.description,
              icon: fallback.icon,
              icon_bg: fallback.icon_bg,
              icon_color: fallback.icon_color,
            },
          });
          writeSoundsLastOpen({ kind: "preset", id: fallback.id });
          navigate(`${SOUNDS_HREF}/preset/${encodeURIComponent(fallback.id)}`, {
            replace: true,
          });
          return;
        }
        appliedRouteKeyRef.current = "list";
      };
      openLastOrDefault();
      return;
    }

    if (route.kind === "new") {
      if (handledNewRouteRef.current) return;
      handledNewRouteRef.current = true;
      const p = newMixerPreset();
      appliedRouteKeyRef.current = `mix:${p.id}`;
      setPresets((prev) => [p, ...prev]);
      setActiveId(p.id);
      setLoadedFactoryId(null);
      setNameDraft(p.name);
      setMix(emptyMixerMix());
      setSaveError(null);
      navigate(`${SOUNDS_HREF}/mix/${encodeURIComponent(p.id)}`, {
        replace: true,
      });
      return;
    }

    handledNewRouteRef.current = false;

    if (route.kind === "mix") {
      const routeKey = `mix:${route.id}`;
      if (appliedRouteKeyRef.current === routeKey) return;
      const p = presets.find((x) => x.id === route.id);
      if (!p) {
        // createNew sets appliedRouteKey before presets state commits.
        if (appliedRouteKeyRef.current === routeKey) return;
        navigate(SOUNDS_HREF, { replace: true });
        return;
      }
      appliedRouteKeyRef.current = routeKey;
      loadMixIntoEditor({
        name: p.name,
        mix: mixerPresetToMix(p),
        savedId: p.id,
      });
      writeSoundsLastOpen({ kind: "mix", id: p.id });
      return;
    }

    if (route.kind === "preset") {
      if (factoryPresetsLoading) return;
      const routeKey = `preset:${route.id}`;
      if (appliedRouteKeyRef.current === routeKey) return;
      const p = factoryPresets.find((x) => x.id === route.id);
      if (!p) {
        navigate(SOUNDS_HREF, { replace: true });
        return;
      }
      appliedRouteKeyRef.current = routeKey;
      loadMixIntoEditor({
        name: p.name,
        mix: factoryPresetToMix(p),
        savedId: null,
        factoryId: p.id,
        factoryMeta: {
          description: p.description,
          icon: p.icon,
          icon_bg: p.icon_bg,
          icon_color: p.icon_color,
        },
      });
      writeSoundsLastOpen({ kind: "preset", id: p.id });
    }
  }, [
    isAdmin,
    hydrated,
    pathname,
    presets,
    factoryPresets,
    factoryPresetsLoading,
    navigate,
  ]);

  useEffect(() => {
    if (cachedBeds) preloadBackgroundAudioCoverImages(cachedBeds);
  }, [cachedBeds]);

  useEffect(() => {
    let cancelled = false;
    const envMediaBase = getMedimadeMediaBaseUrl();
    void (async () => {
      try {
        const data = await listBackgroundAudio();
        if (cancelled) return;
        setBackgroundNature(data.nature);
        setBackgroundMusic(data.music);
        setBackgroundDrums(data.drums);
        setBackgroundNoise(data.noise);
        const fromApi = data.baseUrl?.trim();
        setMediaBaseUrl(fromApi || envMediaBase || null);
        preloadBackgroundAudioCoverImages(data);
        if (isAdmin) {
          try {
            const speakers = await listFishSpeakers();
            if (cancelled) return;
            setFishSpeakers(speakers);
            setSpeakerModelId((cur) => cur || speakers[0]?.modelId || "");
          } catch {
            if (!cancelled) setFishSpeakers([]);
          }
        }
        if (!isAdmin) {
          setFactoryPresets(data.factoryMixes ?? []);
        }
      } catch {
        if (cancelled) return;
        if (!cachedBeds) {
          setBackgroundNature([]);
          setBackgroundMusic([]);
          setBackgroundDrums([]);
          setBackgroundNoise([]);
          setMediaBaseUrl(envMediaBase || null);
          if (!isAdmin && initialFactoryPresets == null) {
            setFactoryPresets([]);
          }
        }
      } finally {
        if (!cancelled && !isAdmin) setFactoryPresetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, initialFactoryPresets, cachedBeds]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    setFactoryPresetsLoading(true);
    void (async () => {
      try {
        const mixes = await listAdminFactoryMixes();
        if (cancelled) return;
        setFactoryPresets(mixes);
      } catch {
        if (!cancelled) setFactoryPresets([]);
      } finally {
        if (!cancelled) setFactoryPresetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  function stopTrack(track: BedTrack) {
    setPlayAllActive(false);
    if (track === "nature") pauseGaplessBed(previewNatureRef.current);
    if (track === "music") pauseGaplessBed(previewMusicRef.current);
    if (track === "drums") pauseGaplessBed(previewDrumsRef.current);
    if (track === "noise") pauseGaplessBed(previewNoiseRef.current);
    setPlaying((p) => ({ ...p, [track]: false }));
  }

  function stopAll() {
    pauseGaplessBed(previewNatureRef.current);
    pauseGaplessBed(previewMusicRef.current);
    pauseGaplessBed(previewDrumsRef.current);
    pauseGaplessBed(previewNoiseRef.current);
    speakerSampleRef.current?.pause();
    setPlayAllActive(false);
    setSpeakerPlaying(false);
    setPlaying((p) =>
      p.nature || p.music || p.drums || p.noise
        ? { nature: false, music: false, drums: false, noise: false }
        : p,
    );
  }

  function stopFactoryPreview() {
    pauseGaplessBed(factoryNatureRef.current);
    pauseGaplessBed(factoryMusicRef.current);
    pauseGaplessBed(factoryDrumsRef.current);
    pauseGaplessBed(factoryNoiseRef.current);
    setFactoryPreviewId(null);
  }

  function loadMixIntoEditor(opts: {
    name: string;
    mix: MixerPresetMix;
    savedId: string | null;
    factoryId?: string | null;
    factoryMeta?: Pick<
      MixerFactoryPreset,
      "description" | "icon" | "icon_bg" | "icon_color"
    >;
  }) {
    // Selecting a preset only loads the editor — do not auto-start beds.
    // Auto-play on every switch was flashing titles/selects/faders as layers
    // remounted and gapless beds reloaded.
    stopFactoryPreview();
    stopAll();
    setNameDraft(opts.name);
    setMix(opts.mix);
    setActiveId(opts.savedId);
    setLoadedFactoryId(opts.factoryId ?? null);
    setDescriptionDraft(opts.factoryMeta?.description ?? "");
    setIconDraft(opts.factoryMeta?.icon ?? "cloud-rain");
    setIconBgDraft(opts.factoryMeta?.icon_bg ?? "#E4EEF4");
    setIconColorDraft(opts.factoryMeta?.icon_color ?? "#3D5A73");
    setSaveError(null);
    lastBgKeysRef.current = {
      nature: "",
      music: "",
      drums: "",
      noise: "",
    };
  }

  useEffect(() => {
    if (!drumsLockedForMelodic) return;
    pauseGaplessBed(previewDrumsRef.current);
    setPlaying((p) => (p.drums ? { ...p, drums: false } : p));
  }, [drumsLockedForMelodic]);

  useEffect(() => {
    const base = mediaBaseUrl;
    const sync = (
      el: HTMLAudioElement | null,
      key: string,
      enabled: boolean,
      track: BedTrack,
    ) => {
      if (!el) return;
      // Mixer 100% → 0.5 playback so speech at 1.0 stays louder.
      const volume = layerVolume(track);
      if (base && key && enabled) {
        // Only play when the transport says so — never auto-start on key change
        // (that flashed UI and reloaded audio on every factory preset click).
        const wantPlay = playing[track];
        syncGaplessBed(el, {
          url: mediaFileUrl(base, backgroundAudioPlaybackKey(key)),
          fallbackUrl: null,
          volume,
          playing: wantPlay,
          onPlaybackBlocked: () => stopTrack(track),
        });
        lastBgKeysRef.current[track] = key;
      } else {
        syncGaplessBed(el, { url: null, volume, playing: false });
        if (playing[track]) stopTrack(track);
        lastBgKeysRef.current[track] = "";
      }
    };
    sync(previewNatureRef.current, mix.natureKey, mix.natureEnabled, "nature");
    sync(previewMusicRef.current, mix.musicKey, mix.musicEnabled, "music");
    sync(previewDrumsRef.current, drumsPreviewKey, mix.drumsEnabled, "drums");
    sync(previewNoiseRef.current, mix.noiseKey, mix.noiseEnabled, "noise");
  }, [
    mediaBaseUrl,
    mix.natureKey,
    mix.musicKey,
    drumsPreviewKey,
    mix.noiseKey,
    mix.natureEnabled,
    mix.musicEnabled,
    mix.drumsEnabled,
    mix.noiseEnabled,
    mix.natureGain,
    mix.musicGain,
    mix.drumsGain,
    mix.noiseGain,
    mix.masterVolume,
    playing.nature,
    playing.music,
    playing.drums,
    playing.noise,
  ]);

  useEffect(() => {
    return () => {
      [
        previewNatureRef,
        previewMusicRef,
        previewDrumsRef,
        previewNoiseRef,
        factoryNatureRef,
        factoryMusicRef,
        factoryDrumsRef,
        factoryNoiseRef,
      ].forEach((r) => {
        releaseGaplessBed(r.current);
      });
      const speaker = speakerSampleRef.current;
      if (speaker) {
        speaker.pause();
        speaker.removeAttribute("src");
      }
    };
  }, []);

  useEffect(() => {
    const el = speakerSampleRef.current;
    if (!el || !isAdmin) return;
    el.loop = true;
    el.volume = 1;
    if (mediaBaseUrl && speakerModelId) {
      const speaker = fishSpeakers.find((s) => s.modelId === speakerModelId);
      const speedOrRate = speakerSampleSpeedOrRate(
        speaker?.brand,
        speaker?.speechifyRate,
      );
      const key = speakerFxPreviewOn
        ? speakerPreviewLoudFxSampleKey(
            speakerModelId,
            speedOrRate,
            speaker?.brand,
          )
        : speakerPreviewLoudSampleKey(
            speakerModelId,
            speedOrRate,
            speaker?.brand,
          );
      const next = withSpeakerSampleCacheBust(
        mediaFileUrl(mediaBaseUrl, key),
        speaker?.updatedAt,
      );
      if (!next) return;
      if (el.src !== next) {
        el.src = next;
        void el.load();
      }
      el.volume = 1;
      if (speakerPlaying) {
        void el.play().catch(() => setSpeakerPlaying(false));
      }
    } else {
      el.removeAttribute("src");
      el.load();
      if (speakerPlaying) setSpeakerPlaying(false);
    }
  }, [
    isAdmin,
    mediaBaseUrl,
    speakerModelId,
    speakerFxPreviewOn,
    speakerPlaying,
  ]);

  const anyTrackPlaying =
    playing.nature ||
    playing.music ||
    playing.drums ||
    playing.noise ||
    speakerPlaying;

  async function togglePlayAll() {
    if (!mediaBaseUrl) return;
    stopFactoryPreview();
    if (anyTrackPlaying || playAllActive) {
      stopAll();
      return;
    }
    stopAll();
    const parts: Promise<void>[] = [];
    // Disabled or None layers are skipped.
    const audible: Record<BedTrack, boolean> = {
      nature: Boolean(
        mix.natureEnabled && mix.natureKey && previewNatureRef.current?.src,
      ),
      music: Boolean(
        mix.musicEnabled && mix.musicKey && previewMusicRef.current?.src,
      ),
      drums: Boolean(
        mix.drumsEnabled && drumsPreviewKey && previewDrumsRef.current?.src,
      ),
      noise: Boolean(
        mix.noiseEnabled && mix.noiseKey && previewNoiseRef.current?.src,
      ),
    };
    const els: Record<BedTrack, HTMLAudioElement | null> = {
      nature: previewNatureRef.current,
      music: previewMusicRef.current,
      drums: previewDrumsRef.current,
      noise: previewNoiseRef.current,
    };
    for (const track of ["music", "nature", "drums", "noise"] as const) {
      if (!audible[track]) continue;
      setGaplessBedVolume(els[track], layerVolume(track));
      parts.push(resumeGaplessBed(els[track]));
    }
    if (isAdmin && speakerModelId && speakerSampleRef.current?.src) {
      parts.push(speakerSampleRef.current.play());
    }
    setPlayAllActive(true);
    setSpeakerPlaying(
      Boolean(isAdmin && speakerModelId && speakerSampleRef.current?.src),
    );
    setPlaying(audible);
    await Promise.all(parts.map((p) => p.catch(() => undefined)));
  }

  async function toggleSpeakerPreview() {
    if (!isAdmin || !mediaBaseUrl || !speakerModelId) return;
    stopFactoryPreview();
    const el = speakerSampleRef.current;
    if (!el) return;
    if (speakerPlaying) {
      el.pause();
      setSpeakerPlaying(false);
      setPlayAllActive(false);
      return;
    }
    if (!el.src) return;
    try {
      setPlayAllActive(false);
      await el.play();
      setSpeakerPlaying(true);
    } catch {
      setSpeakerPlaying(false);
    }
  }

  async function toggleRowPreview(track: BedTrack) {
    stopFactoryPreview();
    if (track === "nature" && (!mix.natureKey || !mix.natureEnabled)) return;
    if (track === "music" && (!mix.musicKey || !mix.musicEnabled)) return;
    if (
      track === "drums" &&
      (!mix.drumsKey || !mix.drumsEnabled || drumsLockedForMelodic)
    ) {
      return;
    }
    if (track === "noise" && (!mix.noiseKey || !mix.noiseEnabled)) return;
    if (playing[track]) {
      stopTrack(track);
      return;
    }
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
      setGaplessBedVolume(el, layerVolume(track));
      await resumeGaplessBed(el);
      setPlaying((p) => ({ ...p, [track]: true }));
    } catch {
      stopTrack(track);
    }
  }

  function applyPreset(p: MixerPreset, opts?: { navigate?: boolean }) {
    appliedRouteKeyRef.current = `mix:${p.id}`;
    loadMixIntoEditor({
      name: p.name,
      mix: mixerPresetToMix(p),
      savedId: p.id,
    });
    if (!isAdmin) writeSoundsLastOpen({ kind: "mix", id: p.id });
    if (!isAdmin && opts?.navigate !== false) {
      navigate(`${SOUNDS_HREF}/mix/${encodeURIComponent(p.id)}`);
    }
  }

  function applyFactoryPreset(
    p: MixerFactoryPreset,
    opts?: { navigate?: boolean; force?: boolean },
  ) {
    if (loadedFactoryId === p.id && !opts?.force) {
      if (!isAdmin) writeSoundsLastOpen({ kind: "preset", id: p.id });
      if (!isAdmin && opts?.navigate !== false) {
        navigate(`${SOUNDS_HREF}/preset/${encodeURIComponent(p.id)}`);
      }
      return;
    }
    appliedRouteKeyRef.current = `preset:${p.id}`;
    loadMixIntoEditor({
      name: p.name,
      mix: factoryPresetToMix(p),
      savedId: isAdmin ? p.id : null,
      factoryId: p.id,
      factoryMeta: {
        description: p.description,
        icon: p.icon,
        icon_bg: p.icon_bg,
        icon_color: p.icon_color,
      },
    });
    if (!isAdmin) writeSoundsLastOpen({ kind: "preset", id: p.id });
    if (!isAdmin && opts?.navigate !== false) {
      navigate(`${SOUNDS_HREF}/preset/${encodeURIComponent(p.id)}`);
    }
  }

  async function toggleFactoryPreview(p: MixerFactoryPreset) {
    await togglePresetPreview(p.id, factoryPresetToMix(p));
  }

  async function togglePresetPreview(id: string, presetMix: MixerPresetMix) {
    if (factoryPreviewId === id) {
      stopFactoryPreview();
      return;
    }
    if (!mediaBaseUrl) return;
    stopAll();
    // Disabled layers are dropped and master volume is applied.
    const nextMix = mixForPlayback(presetMix);
    const beds: Array<{
      el: HTMLAudioElement | null;
      key: string;
      gain: number;
    }> = [
      {
        el: factoryNatureRef.current,
        key: nextMix.natureKey,
        gain: nextMix.natureGain,
      },
      {
        el: factoryMusicRef.current,
        key: nextMix.musicKey,
        gain: nextMix.musicGain,
      },
      {
        el: factoryDrumsRef.current,
        key: nextMix.drumsKey,
        gain: nextMix.drumsGain,
      },
      {
        el: factoryNoiseRef.current,
        key: nextMix.noiseKey,
        gain: nextMix.noiseGain,
      },
    ];
    const parts: Promise<void>[] = [];
    for (const bed of beds) {
      const el = bed.el;
      if (!el) continue;
      const volume = bedElementVolume(bed.gain);
      if (bed.key) {
        syncGaplessBed(el, {
          url: mediaFileUrl(mediaBaseUrl, backgroundAudioPlaybackKey(bed.key)),
          fallbackUrl: null,
          volume,
          playing: true,
        });
        parts.push(resumeGaplessBed(el));
      } else {
        syncGaplessBed(el, { url: null, volume, playing: false });
      }
    }
    if (parts.length === 0) return;
    setFactoryPreviewId(id);
    await Promise.all(parts);
  }

  function createNew() {
    stopFactoryPreview();
    stopAll();
    setSaveError(null);
    if (isAdmin) {
      const p = emptyFactoryPreset();
      setFactoryPresets((prev) => [p, ...prev]);
      loadMixIntoEditor({
        name: p.name,
        mix: factoryPresetToMix(p),
        savedId: p.id,
        factoryId: p.id,
        factoryMeta: {
          description: p.description,
          icon: p.icon,
          icon_bg: p.icon_bg,
          icon_color: p.icon_color,
        },
      });
      return;
    }
    const p = newMixerPreset();
    appliedRouteKeyRef.current = `mix:${p.id}`;
    setPresets((prev) => [p, ...prev]);
    setActiveId(p.id);
    setLoadedFactoryId(null);
    setNameDraft(p.name);
    setMix(emptyMixerMix());
    writeSoundsLastOpen({ kind: "mix", id: p.id });
    navigate(`${SOUNDS_HREF}/mix/${encodeURIComponent(p.id)}`);
  }

  function openSoundsList() {
    navigate(SOUNDS_HREF);
  }

  async function saveCurrent() {
    const name = nameDraft.trim() || "Untitled mix";
    setNameDraft(name);
    // Normalise only in the persisted payload — leave the desk + playback alone.
    const normalized = normalizeFaderGains(mix);
    if (isAdmin) {
      setSaving(true);
      setSaveError(null);
      try {
        const payload: MixerFactoryPreset = {
          ...editorFactory,
          id: loadedFactoryId || editorFactory.id || emptyFactoryPreset().id,
          name,
          channels: mixToFactoryChannels(normalized),
        };
        const saved = await saveAdminFactoryMix(payload);
        setFactoryPresets((prev) => {
          const withoutDraft = prev.filter(
            (p) => p.id !== payload.id && p.id !== saved.id,
          );
          return [saved, ...withoutDraft];
        });
        setLoadedFactoryId(saved.id);
        setActiveId(saved.id);
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : "Could not save mix");
      } finally {
        setSaving(false);
      }
      return;
    }
    const now = new Date().toISOString();
    if (!activeId) {
      const p: MixerPreset = {
        ...newMixerPreset(name),
        ...normalized,
        name,
        updatedAt: now,
      };
      setPresets((prev) => [p, ...prev]);
      setActiveId(p.id);
      setLoadedFactoryId(null);
      navigate(`${SOUNDS_HREF}/mix/${encodeURIComponent(p.id)}`);
      return;
    }
    setPresets((prev) =>
      prev.map((p) =>
        p.id === activeId
          ? { ...p, ...normalized, name, updatedAt: now }
          : p,
      ),
    );
    setLoadedFactoryId(null);
  }

  /** New user mix from the current editor state (factory "Save as my mix", user "Save as new"). */
  function saveAsNewUserMix(promptTitle: string, defaultName: string) {
    const entered = window.prompt(promptTitle, defaultName);
    if (entered == null) return;
    const name = entered.trim().slice(0, 80) || "Untitled mix";
    const now = new Date().toISOString();
    const normalized = normalizeFaderGains(mix);
    const p: MixerPreset = {
      ...newMixerPreset(name),
      ...normalized,
      name,
      updatedAt: now,
    };
    setPresets((prev) => [p, ...prev]);
    setActiveId(p.id);
    setLoadedFactoryId(null);
    setNameDraft(name);
    setSaveError(null);
    writeSoundsLastOpen({ kind: "mix", id: p.id });
    navigate(`${SOUNDS_HREF}/mix/${encodeURIComponent(p.id)}`);
  }

  function resetFactoryPreset() {
    if (!loadedFactory) return;
    applyFactoryPreset(loadedFactory, { navigate: false, force: true });
  }

  function deleteCurrentFactory() {
    if (!isAdmin || !loadedFactoryId) return;
    const id = loadedFactoryId;
    const mixName = nameDraft.trim() || "Untitled mix";
    setDeletePrompt({
      mixName,
      factory: true,
      proceed: () => {
        void (async () => {
          setSaveError(null);
          try {
            try {
              await deleteAdminFactoryMix(id);
            } catch {
              /* Draft mixes are local-only until Save. */
            }
            setFactoryPresets((prev) => prev.filter((p) => p.id !== id));
            setLoadedFactoryId(null);
            setActiveId(null);
            setNameDraft("Untitled mix");
            setDescriptionDraft("");
            setMix(emptyMixerMix());
          } catch (e) {
            setSaveError(
              e instanceof Error ? e.message : "Could not delete mix",
            );
          }
        })();
      },
    });
  }

  function deleteUserMix(id: string) {
    const current = presets.find((p) => p.id === id);
    if (!current) return;
    setDeletePrompt({
      mixName: current.name,
      factory: false,
      proceed: () => {
        setPresets((prev) => prev.filter((p) => p.id !== id));
        if (activeId === id) {
          stopFactoryPreview();
          stopAll();
          setActiveId(null);
          setLoadedFactoryId(null);
          setNameDraft("Untitled mix");
          setMix(emptyMixerMix());
          // Stay on the mixer with an empty mix (no separate list page).
          navigate(SOUNDS_HREF, { replace: true });
        }
      },
    });
  }

  const deleteConfirmModal = (
    <SoundsConfirmModal
      open={Boolean(deletePrompt)}
      title={deletePrompt?.factory ? "Delete factory mix?" : "Delete mix?"}
      description={
        deletePrompt?.factory ? (
          <>
            Remove{" "}
            <span className="font-medium text-foreground">
              {deletePrompt.mixName.trim() || "Untitled mix"}
            </span>{" "}
            for everyone? This can’t be undone.
          </>
        ) : (
          <>
            Delete{" "}
            <span className="font-medium text-foreground">
              “{deletePrompt?.mixName.trim() || "Untitled mix"}”
            </span>
            ? This can’t be undone.
          </>
        )
      }
      confirmLabel="Delete"
      onCancel={() => setDeletePrompt(null)}
      onConfirm={() => {
        const proceed = deletePrompt?.proceed;
        setDeletePrompt(null);
        proceed?.();
      }}
    />
  );

  function patchMix(partial: Partial<MixerPresetMix>) {
    const next = { ...mix, ...partial };
    setMix(next);
    const drumsLocked = isMelodicMusicKey(backgroundMusic, next.musicKey);
    setPlaying((p) => {
      const live = { ...p };
      if (partial.musicKey !== undefined || partial.musicEnabled !== undefined) {
        live.music = Boolean(next.musicKey.trim()) && next.musicEnabled;
      }
      if (partial.natureKey !== undefined || partial.natureEnabled !== undefined) {
        live.nature = Boolean(next.natureKey.trim()) && next.natureEnabled;
      }
      if (partial.drumsKey !== undefined || partial.drumsEnabled !== undefined) {
        live.drums =
          Boolean(next.drumsKey.trim()) && next.drumsEnabled && !drumsLocked;
      }
      if (partial.noiseKey !== undefined || partial.noiseEnabled !== undefined) {
        live.noise = Boolean(next.noiseKey.trim()) && next.noiseEnabled;
      }
      if (drumsLocked) live.drums = false;
      return live;
    });
  }

  if (!isAdmin) {
    const allPlaying = anyTrackPlaying || playAllActive;

    const selectWrapBase =
      "min-w-0 [&_button[aria-haspopup=listbox]]:rounded-[10px] [&_button[aria-haspopup=listbox]]:border [&_button[aria-haspopup=listbox]]:bg-card [&_button[aria-haspopup=listbox]]:text-[13px] [&_button[aria-haspopup=listbox]]:whitespace-nowrap";
    const selectWrapClass = isDesktop
      ? `${selectWrapBase} [&_button[aria-haspopup=listbox]]:h-[38px]`
      : `${selectWrapBase} [&_button[aria-haspopup=listbox]]:h-[40px]`;
    const layerSelect = (
      category: "music" | "ambience" | "drums" | "noise",
      items: BackgroundAudioItem[],
      value: string,
      onChange: (key: string) => void,
      disabled?: boolean,
    ) => (
      <div className={selectWrapClass}>
        <SoundFolderSelect
          category={category}
          items={items}
          value={value}
          onChange={onChange}
          disabled={disabled}
          desk
          favoriteKeys={favorites.compositionSet}
          onToggleFavorite={favorites.toggleComposition}
        />
      </div>
    );

    // ── Preset bar ──────────────────────────────────────────────────────
    const factoryMenuItems: SoundsPresetMenuItem[] = factoryPresets.map((p) => ({
      key: `f:${p.id}`,
      kind: "factory",
      id: p.id,
      name: p.name,
      iconId: p.icon,
      iconBg: p.icon_bg,
      iconColor: p.icon_color,
      favorite: favorites.mixSet.has(factoryMixFavoriteId(p.id)),
    }));
    const userMenuItems: SoundsPresetMenuItem[] = presets.map((p) => ({
      key: `u:${p.id}`,
      kind: "user",
      id: p.id,
      name: p.name,
      iconId: "headphones",
      favorite: favorites.mixSet.has(userMixFavoriteId(p.id)),
    }));
    const menuSections = sectionPresetMenu(factoryMenuItems, userMenuItems);
    const menuOrder = flattenPresetSections(menuSections);
    const loadedKey = loadedFactoryId
      ? `f:${loadedFactoryId}`
      : activeId
        ? `u:${activeId}`
        : null;

    const currentFavId = loadedFactoryId
      ? factoryMixFavoriteId(loadedFactoryId)
      : activeId
        ? userMixFavoriteId(activeId)
        : null;
    const currentIsFavorite = currentFavId
      ? favorites.mixSet.has(currentFavId)
      : false;

    const currentName = nameDraft.trim() || "Untitled mix";
    const isOwnLoaded = !loadedFactory && Boolean(activeId);
    /** Only a loaded saved preset has anything to discard. */
    const hasDiscardable = dirty && Boolean(loadedFactory || activePreset);

    function requestDiscard(proceed: () => void) {
      if (!hasDiscardable) {
        proceed();
        return;
      }
      setDiscardPrompt({ mixName: currentName, proceed });
    }

    function selectMenuItem(item: SoundsPresetMenuItem) {
      if (item.key === loadedKey) return;
      requestDiscard(() => {
        if (item.kind === "factory") {
          const p = factoryPresets.find((x) => x.id === item.id);
          if (p) applyFactoryPreset(p);
        } else {
          const p = presets.find((x) => x.id === item.id);
          if (p) applyPreset(p);
        }
      });
    }

    function stepPreset(dir: 1 | -1) {
      const n = menuOrder.length;
      if (n === 0) return;
      const idx = menuOrder.findIndex((i) => i.key === loadedKey);
      const next =
        idx < 0
          ? dir === 1
            ? 0
            : n - 1
          : (idx + dir + n) % n;
      if (menuOrder[next].key === loadedKey) return;
      selectMenuItem(menuOrder[next]);
    }

    function newMixFromMenu() {
      requestDiscard(() => createNew());
    }

    function renameCurrentMix() {
      if (!activeId || loadedFactory) return;
      const entered = window.prompt("Rename mix", nameDraft);
      if (entered == null) return;
      const name = entered.trim().slice(0, 80);
      if (!name) return;
      const now = new Date().toISOString();
      setPresets((prev) =>
        prev.map((p) =>
          p.id === activeId ? { ...p, name, updatedAt: now } : p,
        ),
      );
      setNameDraft(name);
    }

    function revertToSaved() {
      if (loadedFactory) {
        resetFactoryPreset();
      } else if (activePreset) {
        applyPreset(activePreset, { navigate: false });
      }
    }

    const saveActions: SoundsSaveActions = {
      mainLabel: loadedFactory ? "Save as…" : saving ? "Saving…" : "Save",
      mainDisabled: loadedFactory ? false : !dirty || saving,
      onMain: () => {
        if (loadedFactory) saveAsNewUserMix("Save as my mix", nameDraft);
        else void saveCurrent();
      },
      onSaveAsNew: () =>
        saveAsNewUserMix(
          loadedFactory ? "Save as my mix" : "Save as new mix",
          loadedFactory ? nameDraft : `${currentName} copy`,
        ),
      onRename: renameCurrentMix,
      onRevert: revertToSaved,
      onDelete: () => {
        if (activeId) deleteUserMix(activeId);
      },
      canRename: isOwnLoaded,
      canDelete: isOwnLoaded,
      canRevert: hasDiscardable,
    };

    const statusText = loadedFactory
      ? factoryDirty
        ? "Factory · unsaved changes"
        : "Factory"
      : dirty
        ? "unsaved changes"
        : "saved";

    const presetBar = (
      <SoundsPresetBar
        variant={isDesktop ? "desktop" : "mobile"}
        current={{
          name: currentName,
          iconId: loadedFactory ? iconDraft : "headphones",
          iconBg: loadedFactory ? iconBgDraft : undefined,
          iconColor: loadedFactory ? iconColorDraft : undefined,
          locked: Boolean(loadedFactory),
        }}
        dirty={dirty}
        statusText={statusText}
        sections={menuSections}
        loadedKey={loadedKey}
        onSelect={selectMenuItem}
        onPrev={() => stepPreset(-1)}
        onNext={() => stepPreset(1)}
        onNew={newMixFromMenu}
        favorite={
          currentFavId
            ? {
                pressed: currentIsFavorite,
                onToggle: () => favorites.toggleMix(currentFavId),
              }
            : null
        }
        playing={allPlaying}
        playDisabled={!mediaBaseUrl}
        onTogglePlayAll={() => void togglePlayAll()}
        save={saveActions}
      />
    );

    // ── Layers ──────────────────────────────────────────────────────────
    const layerDefs = [
      {
        track: "music" as const,
        label: "Music",
        category: "music" as const,
        items: backgroundMusic,
        soundKey: mix.musicKey,
        gain: mix.musicGain,
        enabled: mix.musicEnabled,
        onSoundKey: (key: string) => patchMix({ musicKey: key }),
        onGain: (gain: number) => patchMix({ musicGain: gain }),
        onEnabled: (on: boolean) => patchMix({ musicEnabled: on }),
        selectDisabled: false,
        hasSound: Boolean(mix.musicKey),
        playAria: playing.music ? "Pause music" : "Play music",
      },
      {
        track: "nature" as const,
        label: "Ambience",
        category: "ambience" as const,
        items: backgroundNature,
        soundKey: mix.natureKey,
        gain: mix.natureGain,
        enabled: mix.natureEnabled,
        onSoundKey: (key: string) => patchMix({ natureKey: key }),
        onGain: (gain: number) => patchMix({ natureGain: gain }),
        onEnabled: (on: boolean) => patchMix({ natureEnabled: on }),
        selectDisabled: false,
        hasSound: Boolean(mix.natureKey),
        playAria: playing.nature ? "Pause ambience" : "Play ambience",
      },
      {
        track: "drums" as const,
        label: "Drums",
        category: "drums" as const,
        items: backgroundDrums,
        soundKey: mix.drumsKey,
        gain: mix.drumsGain,
        enabled: mix.drumsEnabled,
        onSoundKey: (key: string) => patchMix({ drumsKey: key }),
        onGain: (gain: number) => patchMix({ drumsGain: gain }),
        onEnabled: (on: boolean) => patchMix({ drumsEnabled: on }),
        selectDisabled: drumsLockedForMelodic,
        hasSound: Boolean(mix.drumsKey) && !drumsLockedForMelodic,
        playAria: playing.drums ? "Pause drums" : "Play drums",
      },
      {
        track: "noise" as const,
        label: "Noise",
        category: "noise" as const,
        items: backgroundNoise,
        soundKey: mix.noiseKey,
        gain: mix.noiseGain,
        enabled: mix.noiseEnabled,
        onSoundKey: (key: string) => patchMix({ noiseKey: key }),
        onGain: (gain: number) => patchMix({ noiseGain: gain }),
        onEnabled: (on: boolean) => patchMix({ noiseEnabled: on }),
        selectDisabled: false,
        hasSound: Boolean(mix.noiseKey),
        playAria: playing.noise ? "Pause noise" : "Play noise",
      },
    ];

    const renderLayer = (d: (typeof layerDefs)[number]) => {
      const common = {
        label: d.label,
        soundSelect: layerSelect(
          d.category,
          d.items,
          d.soundKey,
          d.onSoundKey,
          d.selectDisabled,
        ),
        gain: d.gain,
        onGainChange: d.onGain,
        onLiveGainChange: (gain: number) => applyLiveBedGain(d.track, gain),
        enabled: d.enabled,
        onEnabledChange: d.onEnabled,
        hasSound: d.hasSound,
        playing: playing[d.track],
        onTogglePreview: () => void toggleRowPreview(d.track),
        playAriaLabel: d.playAria,
      };
      const strip = isDesktop ? (
        <SoundsLayerStrip {...common} />
      ) : (
        <SoundsLayerRow {...common} />
      );
      if (d.track !== "drums") return <div key={d.track} className="contents">{strip}</div>;
      return (
        <DrumsLockedWrap
          key={d.track}
          locked={drumsLockedForMelodic}
          className={isDesktop ? "flex min-w-[112px] flex-1" : "block"}
        >
          {strip}
        </DrumsLockedWrap>
      );
    };

    return (
      <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col">
        <audio ref={previewNatureRef} className="hidden" playsInline />
        <audio ref={previewMusicRef} className="hidden" playsInline />
        <audio ref={previewDrumsRef} className="hidden" playsInline />
        <audio ref={previewNoiseRef} className="hidden" playsInline />
        <audio ref={factoryNatureRef} className="hidden" playsInline />
        <audio ref={factoryMusicRef} className="hidden" playsInline />
        <audio ref={factoryDrumsRef} className="hidden" playsInline />
        <audio ref={factoryNoiseRef} className="hidden" playsInline />

        <SoundsDiscardChangesModal
          open={Boolean(discardPrompt)}
          mixName={discardPrompt?.mixName ?? currentName}
          onCancel={() => setDiscardPrompt(null)}
          onDiscard={() => {
            const proceed = discardPrompt?.proceed;
            setDiscardPrompt(null);
            proceed?.();
          }}
        />
        {deleteConfirmModal}

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-3 px-4 pb-6 pt-2 sm:px-6 sm:pt-3 md:pb-4">
            {/* One full-width mixer card; the preset bar is its header. */}
            <section className="min-w-0 rounded-2xl border border-border bg-card shadow-sm">
              {presetBar}

              {isDesktop ? (
                <div className="overflow-x-auto px-5 py-3.5">
                  <div className="flex gap-3">
                    {layerDefs.map(renderLayer)}
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-b-2xl">
                  {layerDefs.map(renderLayer)}
                </div>
              )}
            </section>
          </div>

          {/* Sticky bottom action bar — mobile only */}
          <SoundsMobileActionBar
            playing={allPlaying}
            playDisabled={!mediaBaseUrl}
            onTogglePlayAll={() => void togglePlayAll()}
            save={saveActions}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isAdmin
          ? "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
          : "mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col px-4 pt-2 pb-6 sm:px-6 sm:pt-4 sm:pb-6"
      }
    >
      <audio ref={previewNatureRef} className="hidden" playsInline />
      <audio ref={previewMusicRef} className="hidden" playsInline />
      <audio ref={previewDrumsRef} className="hidden" playsInline />
      <audio ref={previewNoiseRef} className="hidden" playsInline />
      {isAdmin ? (
        <audio ref={speakerSampleRef} className="hidden" playsInline />
      ) : null}
      <audio ref={factoryNatureRef} className="hidden" playsInline />
      <audio ref={factoryMusicRef} className="hidden" playsInline />
      <audio ref={factoryDrumsRef} className="hidden" playsInline />
      <audio ref={factoryNoiseRef} className="hidden" playsInline />
      {deleteConfirmModal}

      {isAdmin ? (
        <div
          className={`mb-3 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 ${
            mobileEditorOpen ? "max-sm:hidden" : ""
          }`}
        >
          <p className="text-sm text-muted">
            Factory presets shown on the Sounds page. Save publishes to everyone.
          </p>
          <PrimaryCreateButton
            onClick={createNew}
            className="ml-auto sm:px-3"
            aria-label="New mix"
          >
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New mix</span>
          </PrimaryCreateButton>
        </div>
      ) : null}

      {mobileEditorOpen ? (
        <div className="mb-3 flex shrink-0 items-center justify-between gap-2 sm:hidden">
          <button
            type="button"
            onClick={openSoundsList}
            className="inline-flex cursor-pointer items-center gap-0.5 text-sm font-semibold text-accent-link"
            aria-label="Back to Sounds list"
          >
            <ChevronLeft aria-hidden className="size-5" strokeWidth={2} />
            Sounds
          </button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden lg:flex-row lg:gap-4">
        <aside
          className={`flex shrink-0 flex-col gap-2 overflow-hidden border-b border-border pb-4 lg:w-72 lg:border-b-0 lg:pb-0 ${
            isAdmin
              ? "max-h-[11rem] min-h-0 lg:max-h-none lg:h-full"
              : "max-h-[14rem] max-sm:max-h-none max-sm:min-h-0 max-sm:flex-1 max-sm:border-b-0 max-sm:pb-0 overflow-visible lg:max-h-none"
          } ${mobileEditorOpen ? "max-sm:hidden" : ""}`}
        >
          <nav
            className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1 [scrollbar-gutter:stable]"
            aria-label={
              isAdmin ? "Factory presets" : "Factory presets and saved mixes"
            }
          >
            <div>
              <button
                type="button"
                onClick={() => setFactoryPresetsOpen((o) => !o)}
                aria-expanded={factoryPresetsOpen}
                className="mb-2 flex w-full cursor-pointer items-center justify-between gap-2 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Factory presets
                </span>
                <ChevronDown
                  aria-hidden
                  className={`size-4 shrink-0 text-muted transition-transform ${
                    factoryPresetsOpen ? "rotate-0" : "-rotate-90"
                  }`}
                  strokeWidth={2}
                />
              </button>
              {factoryPresetsOpen ? (
                factoryPresetsLoading ? (
                  <FactoryPresetListSkeleton />
                ) : factoryPresets.length === 0 ? (
                  <p className="text-sm text-muted">
                    {isAdmin
                      ? "No factory mixes yet. Start with + New mix, then Save."
                      : "No factory mixes yet."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {[...factoryPresets]
                      .sort((a, b) => {
                        const af = favorites.mixSet.has(factoryMixFavoriteId(a.id))
                          ? 0
                          : 1;
                        const bf = favorites.mixSet.has(factoryMixFavoriteId(b.id))
                          ? 0
                          : 1;
                        return af - bf;
                      })
                      .map((p) => (
                      <li key={p.id}>
                        <FactoryPresetRow
                          preset={p}
                          loaded={p.id === loadedFactoryId}
                          previewing={p.id === factoryPreviewId}
                          favorite={favorites.mixSet.has(
                            factoryMixFavoriteId(p.id),
                          )}
                          onLoad={() => applyFactoryPreset(p)}
                          onPreview={() => void toggleFactoryPreview(p)}
                          onToggleFavorite={() =>
                            favorites.toggleMix(factoryMixFavoriteId(p.id))
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>

          </nav>
        </aside>

        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${
            !isAdmin && !mobileEditorOpen ? "max-sm:hidden" : ""
          }`}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              <label className="sr-only" htmlFor="mixer-preset-name">
                Mix name
              </label>
              <input
                id="mixer-preset-name"
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Name this mix"
                className="min-w-0 flex-1 border-0 bg-transparent font-display text-xl font-medium tracking-tight text-foreground outline-none placeholder:text-muted/45"
              />
              {dirty && !isAdmin ? (
                <span className="shrink-0 text-xs font-medium text-muted">
                  Modified
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => void togglePlayAll()}
                disabled={!mediaBaseUrl}
                className="inline-flex cursor-pointer items-center rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {anyTrackPlaying || playAllActive ? "Pause all" : "Play all"}
              </button>
              <button
                type="button"
                onClick={() => void saveCurrent()}
                disabled={!dirty || saving}
                className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {isAdmin && loadedFactoryId ? (
                <button
                  type="button"
                  onClick={() => deleteCurrentFactory()}
                  className="cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-muted shadow-sm transition-colors hover:border-accent/40 hover:text-foreground"
                >
                  Delete
                </button>
              ) : null}
            </div>
            {isAdmin ? (
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
                <label className="sr-only" htmlFor="factory-mix-description">
                  Description
                </label>
                <input
                  id="factory-mix-description"
                  type="text"
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  placeholder="Short description"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted"
                />
                <label className="sr-only" htmlFor="factory-mix-icon">
                  Icon
                </label>
                <FactoryIconSelect
                  value={iconDraft}
                  onChange={setIconDraft}
                  iconBg={iconBgDraft}
                  iconColor={iconColorDraft}
                />
                <div className="flex items-center gap-1.5" aria-label="Icon color">
                  {FACTORY_COLOR_PRESETS.map((c) => {
                    const selected =
                      c.icon_bg === iconBgDraft && c.icon_color === iconColorDraft;
                    return (
                      <button
                        key={c.icon_bg}
                        type="button"
                        title="Preset color"
                        onClick={() => {
                          setIconBgDraft(c.icon_bg);
                          setIconColorDraft(c.icon_color);
                        }}
                        className={`h-7 w-7 rounded-lg border ${
                          selected ? "border-accent" : "border-border"
                        }`}
                        style={{ backgroundColor: c.icon_bg }}
                      />
                    );
                  })}
                </div>
                {saveError ? (
                  <p className="w-full text-sm text-danger">{saveError}</p>
                ) : null}
              </div>
            ) : null}

            {/* Stacked row mixer — below lg (same pattern as Create) */}
            <div className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto lg:hidden">
              {isAdmin ? (
                <div className="shrink-0 border-b border-border px-4">
                  <MixerVoiceChannel
                    layout="row"
                    voices={fishSpeakers}
                    value={speakerModelId}
                    onChange={setSpeakerModelId}
                    fxOn={speakerFxPreviewOn}
                    onFxChange={setSpeakerFxPreviewOn}
                    fxDisabled={!mediaBaseUrl || !speakerModelId}
                    playing={speakerPlaying}
                    onTogglePreview={() => void toggleSpeakerPreview()}
                    playDisabled={!mediaBaseUrl || !speakerModelId}
                    showDisc={false}
                    favoriteIds={favorites.voiceSet}
                    onToggleFavorite={favorites.toggleVoice}
                  />
                </div>
              ) : null}
              <div className="shrink-0 px-4 pb-3 pt-1">
                <MixerChannel
                  layout="row"
                  label="Music"
                  category="music"
                  items={backgroundMusic}
                  value={mix.musicKey}
                  onChange={(key) => patchMix({ musicKey: key })}
                  gain={mix.musicGain}
                  onGainChange={(gain) => patchMix({ musicGain: gain })}
                  onLiveGainChange={(gain) => applyLiveBedGain("music", gain)}
                  faderDisabled={!mix.musicKey}
                  playing={playing.music}
                  onTogglePreview={() => void toggleRowPreview("music")}
                  playDisabled={!mix.musicKey}
                  playAriaLabel={playing.music ? "Pause music" : "Play music"}
                  favoriteKeys={favorites.compositionSet}
                  onToggleFavorite={favorites.toggleComposition}
                />
                <MixerChannel
                  layout="row"
                  label="Ambience"
                  category="ambience"
                  items={backgroundNature}
                  value={mix.natureKey}
                  onChange={(key) => patchMix({ natureKey: key })}
                  gain={mix.natureGain}
                  onGainChange={(gain) => patchMix({ natureGain: gain })}
                  onLiveGainChange={(gain) => applyLiveBedGain("nature", gain)}
                  faderDisabled={!mix.natureKey}
                  playing={playing.nature}
                  onTogglePreview={() => void toggleRowPreview("nature")}
                  playDisabled={!mix.natureKey}
                  playAriaLabel={
                    playing.nature ? "Pause ambience" : "Play ambience"
                  }
                  favoriteKeys={favorites.compositionSet}
                  onToggleFavorite={favorites.toggleComposition}
                />
                <DrumsLockedWrap
                  locked={drumsLockedForMelodic}
                  className="block"
                >
                  <MixerChannel
                    layout="row"
                    label="Drums"
                    category="drums"
                    items={backgroundDrums}
                    value={mix.drumsKey}
                    onChange={(key) => patchMix({ drumsKey: key })}
                    gain={mix.drumsGain}
                    onGainChange={(gain) => patchMix({ drumsGain: gain })}
                    onLiveGainChange={(gain) => applyLiveBedGain("drums", gain)}
                    disabled={drumsLockedForMelodic}
                    faderDisabled={drumsLockedForMelodic || !mix.drumsKey}
                    playing={playing.drums}
                    onTogglePreview={() => void toggleRowPreview("drums")}
                    playDisabled={drumsLockedForMelodic || !mix.drumsKey}
                    playAriaLabel={
                      playing.drums ? "Pause drums" : "Play drums"
                    }
                    favoriteKeys={favorites.compositionSet}
                    onToggleFavorite={favorites.toggleComposition}
                  />
                </DrumsLockedWrap>
                <MixerChannel
                  layout="row"
                  label="Noise"
                  category="noise"
                  items={backgroundNoise}
                  value={mix.noiseKey}
                  onChange={(key) => patchMix({ noiseKey: key })}
                  gain={mix.noiseGain}
                  onGainChange={(gain) => patchMix({ noiseGain: gain })}
                  onLiveGainChange={(gain) => applyLiveBedGain("noise", gain)}
                  faderDisabled={!mix.noiseKey}
                  playing={playing.noise}
                  onTogglePreview={() => void toggleRowPreview("noise")}
                  playDisabled={!mix.noiseKey}
                  playAriaLabel={playing.noise ? "Pause noise" : "Play noise"}
                  favoriteKeys={favorites.compositionSet}
                  onToggleFavorite={favorites.toggleComposition}
                />
              </div>
            </div>

            {/* Column mixer — lg+ (unchanged) */}
            <div className="hidden min-h-0 flex-1 items-stretch gap-2 overflow-x-auto p-4 lg:flex">
              {isAdmin ? (
                <MixerVoiceChannel
                  voices={fishSpeakers}
                  value={speakerModelId}
                  onChange={setSpeakerModelId}
                  fxOn={speakerFxPreviewOn}
                  onFxChange={setSpeakerFxPreviewOn}
                  fxDisabled={!mediaBaseUrl || !speakerModelId}
                  playing={speakerPlaying}
                  onTogglePreview={() => void toggleSpeakerPreview()}
                  playDisabled={!mediaBaseUrl || !speakerModelId}
                  showDisc={false}
                  favoriteIds={favorites.voiceSet}
                  onToggleFavorite={favorites.toggleVoice}
                />
              ) : null}
              <MixerChannel
                label="Music"
                category="music"
                items={backgroundMusic}
                value={mix.musicKey}
                onChange={(key) => patchMix({ musicKey: key })}
                gain={mix.musicGain}
                onGainChange={(gain) => patchMix({ musicGain: gain })}
                onLiveGainChange={(gain) => applyLiveBedGain("music", gain)}
                faderDisabled={!mix.musicKey}
                playing={playing.music}
                onTogglePreview={() => void toggleRowPreview("music")}
                playDisabled={!mix.musicKey}
                playAriaLabel={playing.music ? "Pause music" : "Play music"}
                favoriteKeys={favorites.compositionSet}
                onToggleFavorite={favorites.toggleComposition}
              />
              <MixerChannel
                label="Ambience"
                category="ambience"
                items={backgroundNature}
                value={mix.natureKey}
                onChange={(key) => patchMix({ natureKey: key })}
                gain={mix.natureGain}
                onGainChange={(gain) => patchMix({ natureGain: gain })}
                onLiveGainChange={(gain) => applyLiveBedGain("nature", gain)}
                faderDisabled={!mix.natureKey}
                playing={playing.nature}
                onTogglePreview={() => void toggleRowPreview("nature")}
                playDisabled={!mix.natureKey}
                playAriaLabel={
                  playing.nature ? "Pause ambience" : "Play ambience"
                }
                favoriteKeys={favorites.compositionSet}
                onToggleFavorite={favorites.toggleComposition}
              />
              <DrumsLockedWrap
                locked={drumsLockedForMelodic}
                className="flex h-full min-w-[5.75rem] flex-1 items-stretch"
              >
                <MixerChannel
                  label="Drums"
                  category="drums"
                  items={backgroundDrums}
                  value={mix.drumsKey}
                  onChange={(key) => patchMix({ drumsKey: key })}
                  gain={mix.drumsGain}
                  onGainChange={(gain) => patchMix({ drumsGain: gain })}
                  onLiveGainChange={(gain) => applyLiveBedGain("drums", gain)}
                  disabled={drumsLockedForMelodic}
                  faderDisabled={drumsLockedForMelodic || !mix.drumsKey}
                  playing={playing.drums}
                  onTogglePreview={() => void toggleRowPreview("drums")}
                  playDisabled={drumsLockedForMelodic || !mix.drumsKey}
                  playAriaLabel={playing.drums ? "Pause drums" : "Play drums"}
                  favoriteKeys={favorites.compositionSet}
                  onToggleFavorite={favorites.toggleComposition}
                />
              </DrumsLockedWrap>
              <MixerChannel
                label="Noise"
                category="noise"
                items={backgroundNoise}
                value={mix.noiseKey}
                onChange={(key) => patchMix({ noiseKey: key })}
                gain={mix.noiseGain}
                onGainChange={(gain) => patchMix({ noiseGain: gain })}
                onLiveGainChange={(gain) => applyLiveBedGain("noise", gain)}
                faderDisabled={!mix.noiseKey}
                playing={playing.noise}
                onTogglePreview={() => void toggleRowPreview("noise")}
                playDisabled={!mix.noiseKey}
                playAriaLabel={playing.noise ? "Pause noise" : "Play noise"}
                favoriteKeys={favorites.compositionSet}
                onToggleFavorite={favorites.toggleComposition}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

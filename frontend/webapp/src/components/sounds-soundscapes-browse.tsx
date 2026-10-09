import { useEffect, useMemo, useState } from "react";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { MistPlayBadge } from "@/components/mist-play-badge";
import { SelectChevron } from "@/components/select-chevron";
import { SOUNDSCAPE_GAIN } from "@/lib/create-meditation-bed-payload";
import {
  compositionTagLabel,
  readRecentSoundIds,
} from "@/lib/create-sound-picks";
import { mediaFileUrl } from "@/components/library-audio-strip";
import {
  DEFAULT_COMPOSITION_TAG_TYPES,
  backgroundAudioPlaybackKey,
  getMedimadeMediaBaseUrl,
  listBackgroundAudio,
  peekBackgroundAudioCache,
  preloadBackgroundAudioCoverImages,
  type AdminCompositionTagType,
  type BackgroundAudioItem,
} from "@/lib/medimade-api";
import { SoundsBrowseWell } from "@/components/sounds-browse-well";
import { useSoundFavorites } from "@/lib/sound-favorites";

const SCAPE_PREFIX = "sounds:scape:";

type SoundCategory = "all" | "favourites" | "our-picks" | string;

const BRAINWAVE_SYMBOLS: Record<string, string> = {
  delta: "δ",
  theta: "θ",
  alpha: "α",
  beta: "β",
  gamma: "γ",
};

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
    return `${sym} ${Math.round(binauralHz * 10) / 10} Hz`;
  }
  return sym;
}

function soundscapeTagBits(
  item: BackgroundAudioItem,
  tagTypes: AdminCompositionTagType[],
): { brainwave: string | null; others: string[] } {
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
    .slice(0, 3)
    .map(compositionTagLabel);
  return {
    brainwave: brainwaveTag
      ? formatBrainwaveBadge(brainwaveTag, item.binauralHz)
      : null,
    others,
  };
}

function FilterIcon() {
  return (
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
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

/** Admin widescreen crop focus → CSS object-position Y % (centre = 50). */
function coverCropObjectPosition(
  cropY: number | null | undefined,
): { objectPosition: string } {
  const y =
    typeof cropY === "number" && Number.isFinite(cropY)
      ? Math.min(100, Math.max(0, Math.round(cropY)))
      : 50;
  return { objectPosition: `center ${y}%` };
}

export function SoundsSoundscapesBrowse() {
  const favorites = useSoundFavorites();
  const { playTrack, toggleCurrent, nowPlaying, playingS3Key } =
    useLibraryPlayer();
  const cached = peekBackgroundAudioCache();
  const [compositions, setCompositions] = useState<BackgroundAudioItem[]>(
    () => cached?.compositions ?? [],
  );
  const [tagTypes, setTagTypes] = useState<AdminCompositionTagType[]>(
    () =>
      cached?.compositionTagTypes?.length
        ? cached.compositionTagTypes
        : DEFAULT_COMPOSITION_TAG_TYPES,
  );
  const [mediaBase, setMediaBase] = useState<string | null>(
    () => cached?.baseUrl?.trim() || getMedimadeMediaBaseUrl() || null,
  );
  const [loading, setLoading] = useState(() => !cached);
  const [soundCategory, setSoundCategory] = useState<SoundCategory>("all");
  const [soundSort, setSoundSort] = useState<"az" | "recent">("az");
  const [filterOpen, setFilterOpen] = useState(false);
  const [extraTags, setExtraTags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const hadCache = Boolean(peekBackgroundAudioCache());
    if (!hadCache) setLoading(true);
    void listBackgroundAudio()
      .then((data) => {
        if (cancelled) return;
        setCompositions(data.compositions ?? []);
        setMediaBase(
          data.baseUrl?.trim() || getMedimadeMediaBaseUrl() || null,
        );
        if (data.compositionTagTypes?.length) {
          setTagTypes(data.compositionTagTypes);
        }
        void preloadBackgroundAudioCoverImages(data);
      })
      .catch(() => {
        if (!cancelled) setCompositions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const soundPacks = useMemo(() => {
    const packs = new Set<string>();
    for (const item of compositions) {
      const pack = item.customPackName?.trim();
      if (pack) packs.add(pack);
    }
    return [...packs].sort((a, b) => a.localeCompare(b));
  }, [compositions]);

  /** First packs stay as chips; overflow (+ tag facets) go in Filter. */
  const primaryPacks = soundPacks.slice(0, 4);
  const overflowPacks = soundPacks.slice(4);
  const filterFacetTags = useMemo(() => {
    const out: string[] = [...overflowPacks];
    for (const type of tagTypes) {
      if (type.id === "brainwave") continue;
      for (const t of type.tags ?? []) {
        if (!out.includes(t)) out.push(t);
      }
    }
    return out;
  }, [overflowPacks, tagTypes]);

  const recentSoundIds = useMemo(() => readRecentSoundIds(), []);

  const filteredSoundscapes = useMemo(() => {
    const requiredExtra = extraTags;
    let list = compositions.filter((item) => {
      if (soundCategory === "favourites") {
        if (!favorites.compositionSet.has(item.key)) return false;
      } else if (soundCategory === "our-picks") {
        if (!item.adminFavourite) return false;
      } else if (soundCategory !== "all") {
        if ((item.customPackName ?? "").trim() !== soundCategory) return false;
      }
      if (requiredExtra.length > 0) {
        const pack = (item.customPackName ?? "").trim();
        const tags = item.tags ?? [];
        const ok = requiredExtra.every(
          (t) => t === pack || tags.includes(t),
        );
        if (!ok) return false;
      }
      return true;
    });
    // Favourites stay in place — the Favourites chip filters; don’t float them.
    if (soundSort === "recent") {
      const rank = new Map(recentSoundIds.map((id, i) => [id, i]));
      list = [...list].sort(
        (a, b) => (rank.get(a.key) ?? 999) - (rank.get(b.key) ?? 999),
      );
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [
    compositions,
    soundCategory,
    soundSort,
    recentSoundIds,
    favorites.compositionSet,
    extraTags,
  ]);

  const listHeading = (() => {
    const n = filteredSoundscapes.length;
    if (soundCategory === "favourites") return `Favourites · ${n}`;
    if (soundCategory === "our-picks") return `Our picks · ${n}`;
    if (soundCategory !== "all") return `${soundCategory} · ${n}`;
    return `All soundscapes · ${n}`;
  })();

  function previewUrl(key: string): string | null {
    if (!mediaBase || !key) return null;
    return mediaFileUrl(mediaBase, backgroundAudioPlaybackKey(key));
  }

  function togglePreview(item: BackgroundAudioItem) {
    const s3Key = `${SCAPE_PREFIX}${item.key}`;
    if (nowPlaying?.s3Key === s3Key) {
      toggleCurrent();
      return;
    }
    const url = previewUrl(item.key);
    if (!url) return;
    const cover =
      item.coverImageUrl?.trim() || item.coverImageThumbUrl?.trim() || "";
    playTrack({
      url,
      title: item.name,
      s3Key,
      ambientOnly: true,
      ambientKind: "soundscape",
      liveMix: false,
      musicKey: item.key,
      musicGain: SOUNDSCAPE_GAIN,
      leadInSeconds: 0,
      fadeOut: true,
      ...(cover ? { coverImageUrl: cover } : {}),
    });
  }

  const chipClass = (on: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3.5 py-[7px] text-[13px] ${
      on
        ? "border border-accent bg-accent-soft/50 font-semibold text-foreground"
        : "border border-border bg-card text-foreground"
    }`;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col px-4 pt-2 pb-6 sm:px-6 sm:pt-4 sm:pb-6">
      <h1 className="sr-only">Soundscapes</h1>
      <div className="flex shrink-0 flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundCategory("all")}
            className={chipClass(soundCategory === "all")}
          >
            All
          </button>
          <button
            type="button"
            onClick={() =>
              setSoundCategory((c) =>
                c === "favourites" ? "all" : "favourites",
              )
            }
            className={chipClass(soundCategory === "favourites")}
          >
            ♡ Favourites
          </button>
          <button
            type="button"
            onClick={() => setSoundCategory("our-picks")}
            className={chipClass(soundCategory === "our-picks")}
          >
            Our picks
          </button>
          {primaryPacks.map((pack) => (
            <button
              key={pack}
              type="button"
              onClick={() =>
                setSoundCategory((c) => (c === pack ? "all" : pack))
              }
              className={chipClass(soundCategory === pack)}
            >
              {pack}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2.5">
            {filterFacetTags.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  aria-expanded={filterOpen}
                  onClick={() => setFilterOpen((v) => !v)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] ${
                    extraTags.length > 0 || filterOpen
                      ? "border-accent bg-accent-soft/50 font-semibold"
                      : "border-border bg-card"
                  }`}
                >
                  <FilterIcon />
                  Filter
                </button>
                {filterOpen ? (
                  <div className="absolute right-0 z-30 mt-2 max-h-64 w-64 overflow-y-auto rounded-xl border border-border bg-card p-3 shadow-lg">
                    <div className="flex flex-wrap gap-1.5">
                      {filterFacetTags.map((tag) => {
                        const on = extraTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setExtraTags((prev) =>
                                on
                                  ? prev.filter((t) => t !== tag)
                                  : [...prev, tag],
                              )
                            }
                            className={chipClass(on)}
                          >
                            {compositionTagLabel(tag)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[13px] text-foreground"
              onClick={() =>
                setSoundSort((s) => (s === "az" ? "recent" : "az"))
              }
            >
              {soundSort === "az" ? "A–Z" : "Recent"}
              <SelectChevron />
            </button>
          </div>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          {listHeading}
        </p>
      </div>

      <SoundsBrowseWell>
        {loading && compositions.length === 0 ? (
          <p className="text-sm text-muted">Loading soundscapes…</p>
        ) : filteredSoundscapes.length === 0 ? (
          <p className="text-sm text-muted">
            {soundCategory === "favourites"
              ? "No favourite soundscapes yet."
              : "No soundscapes match."}
          </p>
        ) : (
          <div
            className="@container grid gap-3.5"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {filteredSoundscapes.map((item) => {
              const s3Key = `${SCAPE_PREFIX}${item.key}`;
              const playing = playingS3Key === s3Key;
              const cover =
                item.coverImageUrl?.trim() ||
                item.coverImageThumbUrl?.trim() ||
                "";
              const bits = soundscapeTagBits(item, tagTypes);
              const fav = favorites.compositionSet.has(item.key);
              return (
                <article
                  key={item.key}
                  className="relative flex flex-row overflow-hidden rounded-[14px] border border-border bg-card shadow-sm @[28rem]:flex-col"
                >
                  {/* Single-col: square left; multi-col (≥2×220): wide image on top */}
                  <div className="relative h-[88px] w-[88px] shrink-0 bg-accent-soft @[28rem]:h-32 @[28rem]:w-full">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cover}
                        alt=""
                        className="h-full w-full object-cover"
                        style={coverCropObjectPosition(item.coverWideCropY)}
                      />
                    ) : null}
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-[35%] @[28rem]:block"
                      style={{
                        background:
                          "linear-gradient(to top, color-mix(in srgb, var(--deep, #0f1b2d) 35%, transparent), transparent)",
                      }}
                      aria-hidden
                    />
                    <button
                      type="button"
                      aria-label={
                        playing ? `Pause ${item.name}` : `Play ${item.name}`
                      }
                      onClick={() => togglePreview(item)}
                      className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center @[28rem]:bottom-2.5 @[28rem]:left-2.5 @[28rem]:top-auto @[28rem]:translate-x-0 @[28rem]:translate-y-0"
                    >
                      {/* Larger when centered (single-col); corner control when stacked */}
                      <span className="@[28rem]:hidden">
                        <MistPlayBadge playing={playing} size="lg" />
                      </span>
                      <span className="hidden @[28rem]:contents">
                        <MistPlayBadge playing={playing} size="md" />
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={fav}
                      aria-label={
                        fav
                          ? `Unfavourite ${item.name}`
                          : `Favourite ${item.name}`
                      }
                      onClick={() => favorites.toggleComposition(item.key)}
                      className={`absolute right-2 top-2 hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full shadow-sm @[28rem]:flex ${
                        fav
                          ? "header-gold-sunlit-fill text-black"
                          : "bg-white/55 text-foreground backdrop-blur-[2px]"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill={fav ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 @[28rem]:block @[28rem]:pb-3 @[28rem]:pt-2.5">
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <h2 className="truncate font-display text-base leading-[1.25] text-foreground">
                        {item.name}
                      </h2>
                      <div className="flex flex-wrap gap-1">
                        {bits.brainwave ? (
                          <span className="inline-flex rounded-full bg-[var(--deep,#0f1b2d)] px-2.5 py-0.5 text-[11px] font-semibold text-[rgb(246_241_231)]">
                            {bits.brainwave}
                          </span>
                        ) : null}
                        {bits.others.map((t) => (
                          <span
                            key={t}
                            className="inline-flex rounded-full bg-accent-soft/80 px-2.5 py-0.5 text-[11px] text-accent-link"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-pressed={fav}
                      aria-label={
                        fav
                          ? `Unfavourite ${item.name}`
                          : `Favourite ${item.name}`
                      }
                      onClick={() => favorites.toggleComposition(item.key)}
                      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full shadow-sm @[28rem]:hidden ${
                        fav
                          ? "header-gold-sunlit-fill text-black"
                          : "bg-white/55 text-foreground backdrop-blur-[2px]"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill={fav ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SoundsBrowseWell>
    </div>
  );
}

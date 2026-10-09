import { useEffect, useMemo, useRef, useState } from "react";
import { VOICE_FX_DIAL_DEFAULT } from "@consciously/common";
import { mediaFileUrl } from "@/components/library-audio-strip";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { MistPlayBadge } from "@/components/mist-play-badge";
import { SelectChevron } from "@/components/select-chevron";
import {
  rankVoicesByPrefs,
  voiceDisplayMeta,
} from "@/lib/create-sound-picks";
import { speechifySpeakersForPicker } from "@/lib/fish-speakers";
import {
  getMedimadeMediaBaseUrl,
  listFishSpeakers,
  type FishSpeaker,
} from "@/lib/medimade-api";
import { SoundsBrowseWell } from "@/components/sounds-browse-well";
import { useSoundFavorites } from "@/lib/sound-favorites";
import {
  speakerPreviewLoudDrySampleKey,
  speakerPreviewLoudFxSampleKey,
  speakerSampleSpeedOrRate,
  withSpeakerSampleCacheBust,
} from "@/lib/speaker-sample-speed";

const VOICE_PREFIX = "sounds:voice:";

function voiceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export function SoundsVoicesBrowse() {
  const favorites = useSoundFavorites();
  const { playTrack, toggleCurrent, nowPlaying, playingS3Key } =
    useLibraryPlayer();
  const [speakers, setSpeakers] = useState<FishSpeaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [mediaBase] = useState(
    () => getMedimadeMediaBaseUrl()?.trim() || null,
  );
  const [chip, setChip] = useState<"all" | "favourites" | "female" | "male">(
    "all",
  );
  const [accent, setAccent] = useState<string | null>(null);
  const [accentOpen, setAccentOpen] = useState(false);
  const [sortAz, setSortAz] = useState(true);
  const accentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listFishSpeakers()
      .then((list) => {
        if (!cancelled) setSpeakers(speechifySpeakersForPicker(list));
      })
      .catch(() => {
        if (!cancelled) setSpeakers([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accentOpen) return;
    function onDoc(e: MouseEvent) {
      if (!accentRef.current?.contains(e.target as Node)) setAccentOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [accentOpen]);

  const accents = useMemo(() => {
    const set = new Set<string>();
    for (const s of speakers) {
      const a = voiceDisplayMeta(s).accent;
      if (a && a !== "unspecified") set.add(a);
    }
    return [...set].sort();
  }, [speakers]);

  const filteredVoices = useMemo(() => {
    let list = speakers.filter((s) => {
      const meta = voiceDisplayMeta(s);
      if (chip === "favourites" && !favorites.voiceSet.has(s.modelId)) {
        return false;
      }
      if (chip === "female" && meta.gender !== "female") return false;
      if (chip === "male" && meta.gender !== "male") return false;
      if (accent && meta.accent !== accent) return false;
      return true;
    });
    // Favourites stay in place — the Favourites chip filters; don’t float them.
    list = rankVoicesByPrefs(list, null);
    if (sortAz) {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [speakers, chip, accent, sortAz, favorites.voiceSet]);

  function sampleUrls(speaker: FishSpeaker): {
    dry: string | null;
    wet: string | null;
  } {
    if (!mediaBase) return { dry: null, wet: null };
    const speedOrRate = speakerSampleSpeedOrRate(
      speaker.brand,
      speaker.speechifyRate,
    );
    const dry = withSpeakerSampleCacheBust(
      mediaFileUrl(
        mediaBase,
        speakerPreviewLoudDrySampleKey(
          speaker.modelId,
          speedOrRate,
          speaker.brand,
        ),
      ),
      speaker.updatedAt,
    );
    const wet = withSpeakerSampleCacheBust(
      mediaFileUrl(
        mediaBase,
        speakerPreviewLoudFxSampleKey(
          speaker.modelId,
          speedOrRate,
          speaker.brand,
        ),
      ),
      speaker.updatedAt,
    );
    return { dry, wet };
  }

  function togglePreview(speaker: FishSpeaker) {
    const s3Key = `${VOICE_PREFIX}${speaker.modelId}`;
    if (nowPlaying?.s3Key === s3Key) {
      toggleCurrent();
      return;
    }
    const { dry, wet } = sampleUrls(speaker);
    if (!dry) return;
    const portrait = speaker.portraitImageUrl?.trim() || "";
    playTrack({
      url: dry,
      title: speaker.name,
      s3Key,
      dryUrl: dry,
      wetUrl: wet || undefined,
      voiceFxDial: VOICE_FX_DIAL_DEFAULT,
      speakerName: speaker.name,
      ...(portrait ? { coverImageUrl: portrait } : {}),
    });
  }

  const chipClass = (on: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3.5 py-[7px] text-[13px] ${
      on
        ? "border border-accent bg-accent-soft/50 font-semibold text-foreground"
        : "border border-border bg-card text-foreground"
    }`;

  const listHeading = (() => {
    const n = filteredVoices.length;
    if (chip === "favourites") return `Favourites · ${n}`;
    if (chip === "female") return `Female · ${n}`;
    if (chip === "male") return `Male · ${n}`;
    if (accent) return `${accent} · ${n}`;
    return `All voices · ${n}`;
  })();

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-6xl flex-1 flex-col px-4 pt-2 pb-6 sm:px-6 sm:pt-4 sm:pb-6">
      <h1 className="sr-only">Voices</h1>
      <div className="flex shrink-0 flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setChip("all")}
            className={chipClass(chip === "all")}
          >
            All
          </button>
          <button
            type="button"
            onClick={() =>
              setChip((c) => (c === "favourites" ? "all" : "favourites"))
            }
            className={chipClass(chip === "favourites")}
          >
            ♡ Favourites
          </button>
          <button
            type="button"
            onClick={() => setChip((c) => (c === "female" ? "all" : "female"))}
            className={chipClass(chip === "female")}
          >
            Female
          </button>
          <button
            type="button"
            onClick={() => setChip((c) => (c === "male" ? "all" : "male"))}
            className={chipClass(chip === "male")}
          >
            Male
          </button>
          {accents.length > 0 ? (
            <div ref={accentRef} className="relative">
              <button
                type="button"
                aria-expanded={accentOpen}
                onClick={() => setAccentOpen((v) => !v)}
                className={`inline-flex items-center gap-1 ${chipClass(
                  Boolean(accent) || accentOpen,
                )}`}
              >
                {accent ?? "Accent"}
                <SelectChevron open={accentOpen} />
              </button>
              {accentOpen ? (
                <div className="absolute left-0 z-30 mt-2 min-w-[10rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setAccent(null);
                      setAccentOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-accent-soft/40"
                  >
                    All accents
                  </button>
                  {accents.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => {
                        setAccent(a);
                        setAccentOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-accent-soft/40 ${
                        accent === a ? "font-semibold" : ""
                      }`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 text-[13px] text-foreground"
            onClick={() => setSortAz((v) => !v)}
          >
            {sortAz ? "A–Z" : "Suggested"}
            <SelectChevron />
          </button>
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          {listHeading}
        </p>
      </div>

      <SoundsBrowseWell>
        {loading && speakers.length === 0 ? (
          <p className="text-sm text-muted">Loading voices…</p>
        ) : filteredVoices.length === 0 ? (
          <p className="text-sm text-muted">No voices match.</p>
        ) : (
          <div
            className="grid gap-3.5"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            }}
          >
            {filteredVoices.map((v) => {
              const meta = voiceDisplayMeta(v);
              const s3Key = `${VOICE_PREFIX}${v.modelId}`;
              const playing = playingS3Key === s3Key;
              const fav = favorites.voiceSet.has(v.modelId);
              return (
                <article
                  key={v.modelId}
                  className="flex items-center gap-3.5 rounded-[14px] border border-border bg-card p-4"
                >
                  {v.portraitImageUrl ? (
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.portraitImageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </span>
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-accent/35 bg-accent-soft/50 font-display text-[25px] leading-none text-accent-link">
                      {voiceInitials(v.name)}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="truncate font-display text-lg text-foreground">
                      {v.name}
                    </span>
                    <span className="truncate text-[13px] text-muted">
                      {meta.description}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-center gap-2.5">
                    <button
                      type="button"
                      aria-label={
                        playing ? `Pause ${v.name}` : `Play ${v.name}`
                      }
                      onClick={() => togglePreview(v)}
                      className="flex h-9 w-9 cursor-pointer items-center justify-center"
                    >
                      <MistPlayBadge playing={playing} size="md" />
                    </button>
                    <button
                      type="button"
                      aria-pressed={fav}
                      aria-label={
                        fav ? `Unfavourite ${v.name}` : `Favourite ${v.name}`
                      }
                      onClick={() => favorites.toggleVoice(v.modelId)}
                      className={`flex cursor-pointer items-center justify-center ${
                        fav ? "text-accent" : "text-muted hover:text-foreground"
                      }`}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="17"
                        height="17"
                        fill={fav ? "currentColor" : "none"}
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </button>
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </SoundsBrowseWell>
    </div>
  );
}

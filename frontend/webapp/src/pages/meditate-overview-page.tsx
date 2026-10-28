import { useEffect, useState } from "react";
import { formatDuration } from "@/components/library-meditation-card";
import { MeditateOverviewCreateHero } from "@/components/meditate-overview-create-hero";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import {
  OverviewOutlineLink,
  OverviewSection,
} from "@/components/overview-hero";
import { OverviewSubpagesPanel } from "@/components/overview-subpages-panel";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { useGuides } from "@/content/guides";
import {
  ensureMedimadeSession,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { speechifySpeakersForPicker } from "@/lib/fish-speakers";
import { libraryMeditationDetailHref } from "@/lib/library-meditation-detail";
import {
  libraryMeditationCategoryLabel,
  listBackgroundAudio,
  listFishSpeakers,
  listLibraryMeditations,
  getMedimadeMediaBaseUrl,
  listLibraryPrograms,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import { SOUNDS_CUSTOM_HREF, SOUNDS_HREF } from "@/lib/sounds-tabs";
import { useRouter } from "@/lib/spa-nav";

const EXPLORE_THUMB_STAMP = "1792456353682";

/** Generated illustration thumbs for the Explore tiles. */
function exploreThumb(name: string): string {
  const media = (
    getMedimadeMediaBaseUrl() ?? "https://d3k8rq6eqba40d.cloudfront.net"
  ).replace(/\/$/, "");
  return `${media}/explore-thumbs/${name}-${EXPLORE_THUMB_STAMP}.jpg`;
}

function formatRelativeShort(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const startToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round(
      (startToday.getTime() - startThat.getTime()) / 86_400_000,
    );
    if (dayDiff === 0) return "Today";
    if (dayDiff === 1) return "Yesterday";
    if (dayDiff > 1 && dayDiff < 7) {
      return d.toLocaleDateString(undefined, { weekday: "short" });
    }
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function voiceInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function OverviewTypePill({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border border-[#E6D3AE] bg-[#F6EEDD] px-2 text-[11.5px] font-semibold text-[#8A6424]">
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="6" r="2" />
        <path d="M6 20c1-4 3-6 6-6s5 2 6 6M4 14l4-2M20 14l-4-2" />
      </svg>
      {label}
    </span>
  );
}

function MeditationOverviewCard({
  item,
  divider = false,
}: {
  item: LibraryMeditationItem;
  divider?: boolean;
}) {
  const router = useRouter();
  const { playItem, toggleCurrent, playingS3Key, nowPlaying } =
    useLibraryPlayer();
  const isPlaying =
    Boolean(item.s3Key) &&
    playingS3Key === item.s3Key &&
    nowPlaying != null;
  const typeLabel = libraryMeditationCategoryLabel(item);
  const voice = item.speakerName?.trim() || "Voice";
  const when = formatRelativeShort(item.createdAt);
  const detailHref = libraryMeditationDetailHref(item);
  const length =
    item.durationSeconds != null && item.durationSeconds > 0
      ? formatDuration(item.durationSeconds)
      : null;

  return (
    <div className={divider ? "max-md:border-t max-md:border-border" : ""}>
      <article className="hidden min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-card md:flex">
        <div className="relative h-[132px] w-full shrink-0 bg-accent-soft/30">
          <button
            type="button"
            className="absolute inset-0 cursor-pointer"
            aria-label={`Open ${item.title}`}
            onClick={() => router.push(detailHref)}
          >
            {item.coverImageUrl ? (
              <img
                src={item.coverImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="block h-full w-full bg-accent-soft/50" />
            )}
          </button>
          <button
            type="button"
            className="absolute bottom-2.5 left-2.5 z-10 flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent shadow-[0_1px_4px_rgb(15_27_45_/_0.2)]"
            style={PRIMARY_ACCENT_FILL_STYLE}
            aria-label={isPlaying ? "Pause" : `Play ${item.title}`}
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying) toggleCurrent();
              else playItem(item);
            }}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[13px] w-[13px]"
              fill="currentColor"
              aria-hidden
            >
              {isPlaying ? (
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              ) : (
                <path d="M8 5v14l11-7L8 5z" />
              )}
            </svg>
          </button>
          {length ? (
            <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-[rgb(15_27_45_/_0.6)] px-2 py-0.5 text-[11px] text-[#F3EDE2]">
              {length}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="flex cursor-pointer flex-col gap-1.5 px-3 pb-3 pt-2.5 text-left"
          onClick={() => router.push(detailHref)}
        >
          <span className="line-clamp-2 font-display text-[15px] leading-[1.3] text-foreground">
            {item.title}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden
              className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-[9px] font-semibold text-accent-link"
            >
              {item.speakerPortraitUrl ? (
                <img
                  src={item.speakerPortraitUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                voiceInitials(voice)
              )}
            </span>
            <span className="min-w-0 truncate">
              {voice}
              {when ? ` · ${when}` : ""}
            </span>
            {typeLabel && typeLabel !== "—" ? (
              <span className="ml-auto shrink-0">
                <OverviewTypePill label={typeLabel} />
              </span>
            ) : null}
          </span>
        </button>
      </article>

      <div className="flex items-center gap-3 py-2.5 md:hidden">
        <button
          type="button"
          className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-[10px] bg-accent-soft/40"
          aria-label={isPlaying ? "Pause" : `Play ${item.title}`}
          onClick={() => {
            if (isPlaying) toggleCurrent();
            else playItem(item);
          }}
        >
          {item.coverImageUrl ? (
            <img
              src={item.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : null}
          <span className="absolute inset-0 flex items-center justify-center bg-[rgb(15_27_45_/_0.28)] text-white">
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="currentColor"
              aria-hidden
            >
              {isPlaying ? (
                <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
              ) : (
                <path d="M8 5v14l11-7L8 5z" />
              )}
            </svg>
          </span>
        </button>
        <button
          type="button"
          className="min-w-0 flex-1 cursor-pointer text-left"
          onClick={() => router.push(detailHref)}
        >
          <span className="block truncate font-display text-[15px] text-foreground">
            {item.title}
          </span>
          <span className="mt-0.5 block truncate text-[12.5px] text-muted">
            {voice}
            {length ? ` · ${length}` : ""}
          </span>
        </button>
      </div>
    </div>
  );
}

export function MeditateOverviewPage() {
  const [meditations, setMeditations] = useState<LibraryMeditationItem[]>([]);
  const [creationsCount, setCreationsCount] = useState(0);
  const [programsCount, setProgramsCount] = useState(0);
  const [soundscapesCount, setSoundscapesCount] = useState(0);
  const [voicesCount, setVoicesCount] = useState(0);
  const [ready, setReady] = useState(false);
  const { guides: meditateGuides, loading: guidesLoading } =
    useGuides("meditate");
  const guides = meditateGuides.slice(0, 4);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!isMedimadeSessionActive()) {
        if (!cancelled) {
          setMeditations([]);
          setReady(true);
        }
        return;
      }
      try {
        await ensureMedimadeSession();
        if (cancelled || !getMedimadeSessionJwt()) {
          if (!cancelled) setReady(true);
          return;
        }
        const [items, programs, bg, speakers] = await Promise.all([
          listLibraryMeditations().catch(() => [] as LibraryMeditationItem[]),
          listLibraryPrograms().catch(() => []),
          listBackgroundAudio().catch(() => null),
          listFishSpeakers().catch(() => []),
        ]);
        if (cancelled) return;
        const visible = items
          .filter(
            (x) => x.catalogued && x.archived !== true && x.isDraft !== true,
          )
          .sort((a, b) =>
            (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
          );
        setMeditations(visible);
        setCreationsCount(visible.length);
        setProgramsCount(programs.length);
        setSoundscapesCount(bg?.compositions?.length ?? 0);
        setVoicesCount(speechifySpeakersForPicker(speakers).length);
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const recent = meditations.slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10 max-md:px-4">
      <div className="flex flex-col gap-5">
        {/*
        Previous OverviewHero (input + quick-start chips + Library/Sounds links)
        — replaced by compact Create Start hero + sub-pages panel.
        */}
        <MeditateOverviewCreateHero />

        <OverviewSubpagesPanel
          loading={!ready}
          layout="sideBySide"
          groups={[
            {
              label: "Library",
              tiles: [
                {
                  href: "/meditate/library/creations",
                  label: "My creations",
                  count: ready ? creationsCount : null,
                  imageSrc: exploreThumb("creations"),
                },
                {
                  href: "/meditate/library/community",
                  label: "Community",
                  imageSrc: exploreThumb("community"),
                },
                {
                  href: "/meditate/library/programs",
                  label: "Programs",
                  count: ready ? programsCount : null,
                  imageSrc: exploreThumb("programs"),
                },
              ],
            },
            {
              label: "Sounds",
              tiles: [
                {
                  href: `${SOUNDS_HREF}/soundscapes`,
                  label: "Soundscapes",
                  count: ready ? soundscapesCount : null,
                  imageSrc: exploreThumb("soundscapes"),
                },
                {
                  href: `${SOUNDS_HREF}/voices`,
                  label: "Voices",
                  count: ready ? voicesCount : null,
                  imageSrc: exploreThumb("voices"),
                },
                {
                  href: SOUNDS_CUSTOM_HREF,
                  label: "Custom sounds",
                  imageSrc: exploreThumb("custom-sounds"),
                },
              ],
            },
          ]}
        />

        {/* Hide Your meditations when empty (after load). */}
        {!ready || recent.length > 0 ? (
          <OverviewSection
            title="Your meditations"
            action={
              <OverviewOutlineLink href="/meditate/library/creations">
                {ready ? (
                  <>
                    <span className="md:hidden">My creations</span>
                    <span className="hidden md:inline">
                      My creations · {creationsCount}
                    </span>
                  </>
                ) : (
                  "My creations"
                )}
              </OverviewOutlineLink>
            }
          >
            {!ready ? (
              <div className="grid grid-cols-1 md:grid-cols-4 md:gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="mm-skeleton h-[180px] rounded-[14px] max-md:h-14 max-md:rounded-none"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 md:gap-3">
                {recent.map((item, index) => (
                  <MeditationOverviewCard
                    key={item.s3Key || item.id || item.title}
                    item={item}
                    divider={index > 0}
                  />
                ))}
              </div>
            )}
          </OverviewSection>
        ) : null}

        {/* Library and Sounds hub panels — replaced by sub-pages tiles.
        <div className="grid ... HubRow ... </div>
        */}

        {guidesLoading || guides.length > 0 ? (
          <OverviewSection
            title="Guides"
            action={
              <OverviewOutlineLink href="/meditate/guides">
                All guides
              </OverviewOutlineLink>
            }
          >
            {guidesLoading && guides.length === 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="mm-skeleton h-[160px] rounded-[14px]" />
                ))}
              </div>
            ) : (
              <MeditateGuidesGrid guides={guides} />
            )}
          </OverviewSection>
        ) : null}
      </div>
    </div>
  );
}

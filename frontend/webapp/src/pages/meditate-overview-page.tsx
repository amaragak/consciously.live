import { useEffect, useState } from "react";
import { ChevronRight, Library, Plus, Users, Waves } from "lucide-react";
import { Link, useRouter } from "@/lib/spa-nav";
import { formatDuration } from "@/components/library-meditation-card";
import {
  ExploreMiniCard,
  ExploreMiniGrid,
  ExploreMiniGroupLabel,
} from "@/components/explore-mini-card";
import { OverviewGreeting } from "@/components/overview-greeting";
import {
  libraryMeditationCategoryLabel,
  listBackgroundAudio,
  listFishSpeakers,
  listLibraryMeditations,
  getMedimadeMediaBaseUrl,
  listLibraryPrograms,
  type LibraryMeditationItem,
} from "@/lib/medimade-api";
import {
  ensureMedimadeSession,
  getMedimadeSessionJwt,
  isMedimadeSessionActive,
} from "@/lib/auth-session";
import { speechifySpeakersForPicker } from "@/lib/fish-speakers";
import { CREATE_MEDITATE_ROOT } from "@/lib/create-meditation-path";
import { useGuides } from "@/content/guides";
import { MEDITATE_OVERVIEW_GREETINGS } from "@/content/overview-greetings";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { libraryMeditationDetailHref } from "@/lib/library-meditation-detail";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import {
  MEDITATION_TYPE_PILL_CLASS,
  meditationTypePillColors,
  meditationTypePillSurfaceFromDom,
} from "@/lib/meditation-type-pill";
import { SOUNDS_HREF } from "@/lib/sounds-tabs";

const EXPLORE_THUMB_STAMP = "1792456353682";

/** Generated illustration thumbs for the Explore tiles. */
function exploreThumb(name: string): string {
  const media = (
    getMedimadeMediaBaseUrl() ?? "https://d3k8rq6eqba40d.cloudfront.net"
  ).replace(/\/$/, "");
  return `${media}/explore-thumbs/${name}-${EXPLORE_THUMB_STAMP}.jpg`;
}

function SectionHeading({
  title,
  href,
  linkLabel,
  linkLabelMobile,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  linkLabelMobile?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3 max-md:mb-2.5">
      <h2 className="font-display text-[22px] text-foreground max-md:text-xl">
        {title}
      </h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-accent-link transition-opacity hover:opacity-80"
        >
          <span className="md:hidden">{linkLabelMobile ?? linkLabel}</span>
          <span className="hidden md:inline">{linkLabel}</span>
          <ChevronRight
            aria-hidden
            className="size-[18px] shrink-0"
            strokeWidth={2}
          />
        </Link>
      ) : null}
    </div>
  );
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
  const colors = meditationTypePillColors(
    label,
    typeof document !== "undefined"
      ? meditationTypePillSurfaceFromDom()
      : "light",
  );
  return (
    <span
      className={`${MEDITATION_TYPE_PILL_CLASS} !rounded-full !px-2 !py-0.5 !text-[11px] !normal-case !tracking-normal`}
      style={{ backgroundColor: colors.bg, color: colors.fg }}
    >
      {label}
    </span>
  );
}

function MeditationOverviewCard({
  item,
}: {
  item: LibraryMeditationItem;
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

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-card max-md:rounded-xl">
      <div className="relative h-[132px] w-full shrink-0 bg-accent-soft/30 max-md:h-[92px]">
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
          className="absolute bottom-2.5 left-2.5 z-10 flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-full accent-fill-gradient text-on-accent shadow-[0_1px_4px_rgb(15_27_45_/_0.2)] max-md:bottom-2 max-md:left-2 max-md:h-[30px] max-md:w-[30px]"
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
            className="h-[13px] w-[13px] max-md:h-[11px] max-md:w-[11px]"
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
        {item.durationSeconds != null && item.durationSeconds > 0 ? (
          <span className="pointer-events-none absolute bottom-2.5 right-2.5 rounded-full bg-[rgb(15_27_45_/_0.6)] px-2 py-0.5 text-[11px] text-[#F3EDE2] max-md:bottom-2 max-md:right-2 max-md:px-1.5 max-md:py-px max-md:text-[10px]">
            {formatDuration(item.durationSeconds)}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="flex cursor-pointer flex-col gap-1.5 px-3 pb-3 pt-2.5 text-left max-md:gap-1.5 max-md:px-2.5 max-md:pb-2.5 max-md:pt-2"
        onClick={() => router.push(detailHref)}
      >
        <span className="line-clamp-2 font-display text-[15px] leading-[1.3] text-foreground max-md:text-sm">
          {item.title}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted max-md:gap-1 max-md:text-[11px]">
          <span
            aria-hidden
            className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-[9px] font-semibold text-accent-link max-md:h-4 max-md:w-4"
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
          <span className="min-w-0 truncate max-md:hidden">
            {voice}
            {when ? ` · ${when}` : ""}
          </span>
          <span className="min-w-0 truncate md:hidden">{when || voice}</span>
          {typeLabel && typeLabel !== "—" ? (
            <span className="ml-auto hidden shrink-0 md:inline">
              <OverviewTypePill label={typeLabel} />
            </span>
          ) : null}
        </span>
      </button>
    </article>
  );
}

function NewMeditationTile() {
  return (
    <Link
      href={CREATE_MEDITATE_ROOT}
      className="relative flex min-h-0 items-center justify-center rounded-[14px] border-[1.5px] border-dashed border-accent/45 bg-accent-soft/40 px-4 py-4 text-center transition-opacity hover:opacity-90 max-md:min-h-[160px] max-md:rounded-xl"
    >
      <span
        className="flex h-[52px] w-[52px] items-center justify-center rounded-full accent-fill-gradient text-on-accent max-md:h-11 max-md:w-11"
        style={PRIMARY_ACCENT_FILL_STYLE}
        aria-hidden
      >
        <Plus className="size-6 max-md:size-5" strokeWidth={2.25} />
      </span>
      <span className="absolute top-[calc(50%+38px)] font-display text-lg text-foreground max-md:top-[calc(50%+32px)] max-md:text-base">
        New meditation
      </span>
    </Link>
  );
}

export function MeditateOverviewPage() {
  const [meditations, setMeditations] = useState<LibraryMeditationItem[]>([]);
  const [creationsCount, setCreationsCount] = useState(0);
  const [programsCount, setProgramsCount] = useState(0);
  const [soundscapesCount, setSoundscapesCount] = useState(0);
  const [voicesCount, setVoicesCount] = useState(0);
  const [ready, setReady] = useState(false);
  const guides = useGuides("meditate").guides.slice(0, 4);

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

  const recent = meditations.slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10 max-md:px-4">
      <div className="flex flex-col gap-7 max-md:gap-[22px]">
        <OverviewGreeting pool={MEDITATE_OVERVIEW_GREETINGS} />

        {/* 1. Your meditations */}
        <section>
          <SectionHeading
            title="Your meditations"
            href="/meditate/library/creations"
            linkLabel="Library"
          />
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3.5">
            <NewMeditationTile />
            {recent.map((m) => (
              <MeditationOverviewCard key={m.s3Key || m.id || m.title} item={m} />
            ))}
            {ready && recent.length === 0 ? (
              <p className="col-span-1 flex items-center self-center text-[13px] text-muted md:col-span-3">
                Your meditations will appear here.
              </p>
            ) : null}
          </div>
        </section>

        {/* 2. In progress — omitted: program session progress is not tracked yet. */}

        {/* 3. Explore */}
        <section>
          <SectionHeading title="Explore" />
          <ExploreMiniGrid>
            <ExploreMiniGroupLabel>Library</ExploreMiniGroupLabel>
            <ExploreMiniCard
              href="/meditate/library/creations"
              title="My Creations"
              description="Everything you've made, ready to play again."
              count={creationsCount}
              imageSrc={exploreThumb("creations")}
              icon={<Library className="size-5" strokeWidth={1.75} />}
            />
            <ExploreMiniCard
              href="/meditate/library/community"
              title="Community"
              description="Meditations other people have shared."
              imageSrc={exploreThumb("community")}
              icon={<Users className="size-5" strokeWidth={1.75} />}
            />
            <ExploreMiniCard
              href="/meditate/library/programs"
              title="Programs"
              description="Guided courses you can follow or make your own."
              count={programsCount}
              imageSrc={exploreThumb("programs")}
              icon={<Library className="size-5" strokeWidth={1.75} />}
            />
            <ExploreMiniGroupLabel>Sounds</ExploreMiniGroupLabel>
            <ExploreMiniCard
              href={`${SOUNDS_HREF}/soundscapes`}
              title="Soundscapes"
              description="Just listen. Meditation music for sitting on your own."
              count={soundscapesCount}
              imageSrc={exploreThumb("soundscapes")}
              icon={<Waves className="size-5" strokeWidth={1.75} />}
            />
            <ExploreMiniCard
              href={`${SOUNDS_HREF}/voices`}
              title="Voices"
              description="Meet the guides who narrate your meditations."
              count={voicesCount}
              imageSrc={exploreThumb("voices")}
              icon={<Users className="size-5" strokeWidth={1.75} />}
            />
            <ExploreMiniCard
              href={SOUNDS_HREF}
              title="Custom sounds"
              description="Layer music, ambience and noise into a mix of your own."
              imageSrc={exploreThumb("custom-sounds")}
              icon={<Waves className="size-5" strokeWidth={1.75} />}
            />
          </ExploreMiniGrid>
        </section>

        {/* 4. Guides */}
        {guides.length > 0 ? (
          <section>
            <SectionHeading
              title="Guides"
              href="/meditate/guides"
              linkLabel="All guides"
              linkLabelMobile="All"
            />
            <MeditateGuidesGrid guides={guides} />
          </section>
        ) : null}
      </div>
    </div>
  );
}

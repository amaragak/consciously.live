import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link, useRouter } from "@/lib/spa-nav";
import { formatDuration } from "@/components/library-meditation-card";
import {
  OverviewHero,
  OverviewOutlineLink,
  OverviewSection,
} from "@/components/overview-hero";
import { SelectChevron } from "@/components/select-chevron";
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
import { writeGuidePracticeBrief } from "@/lib/guide-practice-handoff";
import { useGuides } from "@/content/guides";
import {
  MEDITATE_OVERVIEW_PROMPTS,
  promptsForDay,
} from "@/content/overview-prompts";
import { MeditateGuidesGrid } from "@/components/meditate-guide-cards";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { libraryMeditationDetailHref } from "@/lib/library-meditation-detail";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
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
  return (
    <span className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full border border-[#E6D3AE] bg-[#F6EEDD] px-2 text-[11.5px] font-semibold text-[#8A6424]">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="6" r="2" />
        <path d="M6 20c1-4 3-6 6-6s5 2 6 6M4 14l4-2M20 14l-4-2" />
      </svg>
      {label}
    </span>
  );
}

function HubRow({
  href,
  title,
  description,
  count,
  imageSrc,
}: {
  href: string;
  title: string;
  description: string;
  count?: number;
  imageSrc: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-[14px] border border-border bg-card p-3"
    >
      <img src={imageSrc} alt="" className="size-[52px] shrink-0 rounded-[10px] object-cover" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display text-[17px] leading-tight text-foreground">
          {title}
          {typeof count === "number" ? (
            <span className="ml-1.5 text-[12.5px] font-normal text-muted">{count}</span>
          ) : null}
        </span>
        <span className="truncate text-[13px] text-foreground/80">{description}</span>
      </span>
      <SelectChevron direction="right" />
    </Link>
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

  const router = useRouter();
  const recent = meditations.slice(0, 4);
  const prompts = promptsForDay(MEDITATE_OVERVIEW_PROMPTS);
  const openBrief = (brief: string) => {
    writeGuidePracticeBrief(brief);
    router.push(CREATE_MEDITATE_ROOT);
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0 px-4 pb-24 pt-3 sm:px-6 sm:pb-10 sm:pt-4 md:pb-10 max-md:px-4">
      <div className="flex flex-col gap-5">
        <OverviewHero
          question="What do you need right now?"
          actionHref={CREATE_MEDITATE_ROOT}
          actionLabel="Create meditation"
          actionIcon={
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="6" r="2" />
              <path d="M6 20c1-4 3-6 6-6s5 2 6 6M4 14l4-2M20 14l-4-2" />
            </svg>
          }
          placeholder="Calm before my big pitch, confidence for launch day, deeper sleep…"
          promptLabel="Quick start"
          prompts={prompts}
          onPrompt={openBrief}
          onSubmit={openBrief}
        />

        <OverviewSection
          title="Your meditations"
          action={
            <OverviewOutlineLink href="/meditate/library/creations">
              Open library · {creationsCount}
            </OverviewOutlineLink>
          }
        >
          {recent.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {recent.map((item) => (
                <MeditationOverviewCard key={item.s3Key || item.id || item.title} item={item} />
              ))}
            </div>
          ) : ready ? (
            <p className="text-[13px] text-muted">Your meditations will appear here.</p>
          ) : null}
        </OverviewSection>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <OverviewSection title="Library">
            <div className="flex flex-col gap-2.5">
              <HubRow
                href="/meditate/library/creations"
                title="My creations"
                description="Everything you've made"
                count={creationsCount}
                imageSrc={exploreThumb("creations")}
              />
              <HubRow
                href="/meditate/library/community"
                title="Community"
                description="Meditations other people have shared"
                imageSrc={exploreThumb("community")}
              />
              <HubRow
                href="/meditate/library/programs"
                title="Programs"
                description="Guided courses you can follow"
                count={programsCount}
                imageSrc={exploreThumb("programs")}
              />
            </div>
          </OverviewSection>
          <OverviewSection title="Sounds">
            <div className="flex flex-col gap-2.5">
              <HubRow
                href={`${SOUNDS_HREF}/soundscapes`}
                title="Soundscapes"
                description="Meditation music for sitting on your own"
                count={soundscapesCount}
                imageSrc={exploreThumb("soundscapes")}
              />
              <HubRow
                href={`${SOUNDS_HREF}/voices`}
                title="Voices"
                description="The guides who narrate your meditations"
                count={voicesCount}
                imageSrc={exploreThumb("voices")}
              />
              <HubRow
                href={SOUNDS_HREF}
                title="Custom sounds"
                description="Layer music, ambience and noise"
                imageSrc={exploreThumb("custom-sounds")}
              />
            </div>
          </OverviewSection>
        </div>

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

/**
 * Shared Story card for Library pin and Manifest Edit placements.
 */

import type { MouseEvent, ReactNode } from "react";
import { Link, useRouter } from "@/lib/spa-nav";
import { CREATE_FLOW_NAV_PILL_CLASS } from "@/components/create-flow-nav-pill";
import { LogoMark } from "@/components/logo-mark";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import { useLibraryPlayer } from "@/components/library-player-provider";
import {
  STORY_DRAFT_HREF,
  STORY_NARRATION_HREF,
  storyCardCompactMeta,
  storyCardMetaLine,
  storyTitlePossessive,
  type NarratedStoryPlacement,
} from "@/lib/manifesto-story-placement";

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z" />
      <path d="M12 14v6" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
    </svg>
  );
}

function StoryArtwork({
  urls,
  sizePx,
}: {
  urls: string[];
  sizePx: number;
}) {
  const cells =
    urls.length === 0
      ? []
      : Array.from({ length: 4 }, (_, i) => urls[i % urls.length]!);
  const cell = sizePx / 2;
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[14px]"
      style={{ width: sizePx, height: sizePx }}
      aria-hidden
    >
      {cells.length === 0 ? (
        <div className="h-full w-full bg-accent-soft" />
      ) : (
        <div
          className="grid h-full w-full"
          style={{
            gridTemplateColumns: `${cell}px ${cell}px`,
            gridTemplateRows: `${cell}px ${cell}px`,
          }}
        >
          {cells.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${src}-${i}`}
              src={src}
              alt=""
              className="h-full w-full object-cover"
            />
          ))}
        </div>
      )}
      <span
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 40%, color-mix(in srgb, var(--foreground) 55%, transparent) 100%)",
        }}
      />
      <span className="absolute bottom-2 left-2.5 flex text-gold">
        <LogoMark size={18} className="text-gold" />
      </span>
    </div>
  );
}

function PlayCircle({
  size,
  label,
  onClick,
}: {
  size: number;
  label: string;
  onClick: (e: MouseEvent) => void;
}) {
  const icon = size >= 50 ? 17 : 14;
  return (
    <PrimaryCreateButton
      variant="compact"
      leadingPlus={false}
      aria-label={label}
      onClick={onClick}
      className="!rounded-full"
      style={{ width: size, height: size, borderRadius: 9999 }}
    >
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden
      >
        <path d="M8 5v14l11-7z" />
      </svg>
    </PrimaryCreateButton>
  );
}

export type StoryPlacementCardVariant = "library" | "manifest";

type Props = {
  placement: NarratedStoryPlacement;
  firstName: string;
  variant: StoryPlacementCardVariant;
  /** Force compact (mobile) layout; when omitted, uses responsive classes. */
  compact?: boolean;
};

function Eyebrow({
  variant,
  compact,
}: {
  variant: StoryPlacementCardVariant;
  compact: boolean;
}) {
  const libraryLabel = compact ? "Pinned" : "Pinned · Your story";
  const label = variant === "library" ? libraryLabel : "Your story";
  const Icon = variant === "library" ? PinIcon : MoonIcon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
      <Icon />
      {label}
    </span>
  );
}

export function StoryPlacementCard({
  placement,
  firstName,
  variant,
  compact = false,
}: Props) {
  const router = useRouter();
  const { playItem } = useLibraryPlayer();
  const title = storyTitlePossessive(firstName);
  const bodyHref =
    variant === "manifest" ? STORY_DRAFT_HREF : STORY_NARRATION_HREF;
  const linkLabel = variant === "manifest" ? "Edit story" : "Open story";
  const linkHref =
    variant === "manifest" ? STORY_DRAFT_HREF : STORY_NARRATION_HREF;
  const artSize = compact
    ? 72
    : variant === "library"
      ? 104
      : 88;
  const playSize = compact ? 44 : 52;
  const meta = compact
    ? storyCardCompactMeta(placement)
    : storyCardMetaLine(placement);
  const showDraftDrift =
    variant === "manifest" && !compact && placement.changedCount > 0;

  function play(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    playItem(placement.libraryItem);
  }

  function openBody() {
    router.push(bodyHref);
  }

  const textCol: ReactNode = (
    <div
      className={`flex min-w-0 flex-1 flex-col ${compact ? "gap-1" : "gap-1.5"}`}
    >
      <Eyebrow variant={variant} compact={compact} />
      <span
        className={`font-display leading-[1.15] text-foreground ${
          compact ? "text-[19px]" : "text-[24px]"
        }`}
      >
        {title}
      </span>
      <span className="text-[13px] text-muted">{meta}</span>
      {showDraftDrift ? (
        <span className="inline-flex items-center gap-1.5 text-[12px] text-accent-link">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          Your draft has newer changes
        </span>
      ) : null}
    </div>
  );

  const artwork = (
    <div className="relative shrink-0" style={{ width: artSize, height: artSize }}>
      <StoryArtwork urls={placement.visionImageUrls} sizePx={artSize} />
      <div className="absolute inset-0 flex items-center justify-center">
        <PlayCircle size={playSize} label={`Play ${title}`} onClick={play} />
      </div>
    </div>
  );

  if (compact) {
    return (
      <button
        type="button"
        onClick={openBody}
        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]"
        aria-label={title}
      >
        {artwork}
        {textCol}
      </button>
    );
  }

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={openBody}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openBody();
        }
      }}
      className="flex w-full cursor-pointer items-center gap-[18px] rounded-2xl border border-border bg-card py-4 pl-4 pr-5 text-left shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]"
      aria-label={title}
    >
      {artwork}
      {textCol}
      <Link
        href={linkHref}
        onClick={(e) => e.stopPropagation()}
        className={`${CREATE_FLOW_NAV_PILL_CLASS} whitespace-nowrap`}
      >
        {linkLabel} →
      </Link>
    </div>
  );
}

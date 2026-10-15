/**
 * Dashboard dark-card variants for Story top slot and Manifest inset row.
 */

import type { ReactNode } from "react";
import { Link } from "@/lib/spa-nav";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import {
  STORY_DRAFT_HREF,
  STORY_NARRATION_HREF,
  storyMetaListenLine,
  storyTitlePossessive,
  type NarratedStoryPlacement,
} from "@/lib/manifesto-story-placement";

function MoonIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" />
    </svg>
  );
}

function PlayIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

type TopSlotProps = {
  placement: NarratedStoryPlacement;
  firstName: string;
  onPlay: () => void;
  waveform: ReactNode;
  compact?: boolean;
};

/** Dark top-left card when Story owns the dashboard slot. */
export function DashboardStoryTopSlot({
  placement,
  firstName,
  onPlay,
  waveform,
  compact = false,
}: TopSlotProps) {
  const title = storyTitlePossessive(firstName);
  const meta = `Your life vision · ${placement.minutes} min · ${storyMetaListenLine(placement)}`;
  const playSize = compact ? 48 : 60;
  const playIcon = compact ? 16 : 20;

  return (
    <section
      aria-label="Your story"
      className={
        compact
          ? "flex flex-col gap-3 rounded-2xl bg-[var(--deep)] p-4 text-[color-mix(in_srgb,white_92%,var(--gold))]"
          : "flex flex-col gap-5 rounded-[22px] bg-[var(--deep)] p-7 text-[color-mix(in_srgb,white_92%,var(--gold))] lg:col-span-7"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className={`inline-flex items-center gap-2 font-semibold uppercase text-gold ${
            compact
              ? "text-[11px] tracking-[1.4px]"
              : "text-[12px] tracking-[0.14em]"
          }`}
        >
          <MoonIcon size={compact ? 12 : 13} />
          Your story
        </p>
        <Link
          href={STORY_DRAFT_HREF}
          className={`shrink-0 text-[14px] text-[color-mix(in_srgb,white_75%,transparent)] ${
            compact ? "" : ""
          }`}
        >
          {compact ? "Edit →" : "Edit story →"}
        </Link>
      </div>
      <div className={`flex items-center ${compact ? "gap-3.5" : "gap-4"}`}>
        <PrimaryCreateButton
          variant="compact"
          leadingPlus={false}
          aria-label={`Play ${title}`}
          onClick={onPlay}
          className="!rounded-full"
          style={{ width: playSize, height: playSize, borderRadius: 9999 }}
        >
          <PlayIcon size={playIcon} />
        </PrimaryCreateButton>
        <div className={`flex min-w-0 flex-1 flex-col ${compact ? "gap-[3px]" : "gap-1"}`}>
          <p
            className={`font-display leading-[1.25] ${
              compact
                ? "text-[18px]"
                : "text-[22px] font-medium sm:text-[24px]"
            }`}
          >
            {title}
          </p>
          <p
            className={`text-[color-mix(in_srgb,white_65%,transparent)] ${
              compact ? "text-[12px]" : "text-[14px]"
            }`}
          >
            {meta}
          </p>
        </div>
      </div>
      {waveform}
    </section>
  );
}

type RowProps = {
  placement: NarratedStoryPlacement;
  firstName: string;
  onPlay: () => void;
  compact?: boolean;
};

/** Dark inset row inside the Manifest card when Story isn’t in the top slot. */
export function DashboardStoryManifestRow({
  placement,
  firstName,
  onPlay,
  compact = false,
}: RowProps) {
  const title = storyTitlePossessive(firstName);
  const meta = `${placement.minutes} min · ${storyMetaListenLine(placement)}`;
  const playSize = compact ? 44 : 52;
  const playIcon = compact ? 14 : 18;

  const inner = (
    <>
      <PrimaryCreateButton
        variant="compact"
        leadingPlus={false}
        aria-label={`Play ${title}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPlay();
        }}
        className="!rounded-full"
        style={{ width: playSize, height: playSize, borderRadius: 9999 }}
      >
        <PlayIcon size={playIcon} />
      </PrimaryCreateButton>
      <div
        className={`flex min-w-0 flex-1 flex-col ${compact ? "gap-0.5" : "gap-[3px]"}`}
      >
        <span
          className={`inline-flex items-center gap-1.5 font-semibold uppercase text-gold ${
            compact
              ? "text-[10px] tracking-[1.4px]"
              : "text-[11px] tracking-[1.4px]"
          }`}
        >
          <MoonIcon size={compact ? 11 : 12} />
          Your story
        </span>
        <span
          className={`font-display text-[color-mix(in_srgb,white_92%,var(--gold))] ${
            compact ? "text-[17px]" : "text-[21px]"
          }`}
        >
          {title}
        </span>
        <span
          className={`text-[color-mix(in_srgb,white_65%,transparent)] ${
            compact ? "text-[12px]" : "text-[13px]"
          }`}
        >
          {meta}
        </span>
      </div>
      {!compact ? (
        <Link
          href={STORY_DRAFT_HREF}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-[14px] text-[color-mix(in_srgb,white_80%,transparent)]"
        >
          Edit story →
        </Link>
      ) : null}
    </>
  );

  const className = compact
    ? "flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-[var(--deep)] p-3 text-left"
    : "flex w-full items-center gap-4 rounded-2xl bg-[var(--deep)] px-5 py-4 text-left";

  if (compact) {
    return (
      <Link href={STORY_NARRATION_HREF} className={className} aria-label={title}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={className} aria-label={title}>
      {inner}
    </div>
  );
}

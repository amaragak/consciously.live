import { IconHeart, IconSparkles, IconSun } from "@tabler/icons-react";
import {
  formatJournalEntryDate,
  localDateKey,
  localDateKeyFromIso,
  type JournalGratitudeLines,
} from "@/lib/journal-storage";
import type { ReactNode } from "react";

const FIELD_ICONS = [IconSun, IconHeart, IconSparkles] as const;

function ariaLabelForIndex(i: number): string {
  if (i === 0) return "First thing you’re grateful for";
  if (i === 1) return "Second thing you’re grateful for";
  if (i === 2) return "Third thing you’re grateful for";
  return `Gratitude ${i + 1}`;
}

type Props = {
  createdAt: string;
  lines: JournalGratitudeLines;
  onChange: (lines: JournalGratitudeLines) => void;
  children?: ReactNode;
  footerNote?: string;
  onDelete?: () => void;
  /** Hub / day pages: small uppercase label instead of large “Today” title. */
  headingVariant?: "page" | "compact";
  /** Override compact heading text (e.g. “TODAY · THU 5 NOV”). */
  compactHeading?: string;
};

export function JournalGratitudeEditor({
  createdAt,
  lines,
  onChange,
  children,
  footerNote,
  onDelete,
  headingVariant = "page",
  compactHeading,
}: Props) {
  const isToday = localDateKeyFromIso(createdAt) === localDateKey();
  const dateLabel = formatJournalEntryDate(createdAt);
  const slotCount = Math.max(3, lines.length);
  const displayLines = Array.from({ length: slotCount }, (_, i) => lines[i] ?? "");
  const showFooter = Boolean(children || footerNote || onDelete);
  const compact = headingVariant === "compact";

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden bg-[color:var(--journal-warm-bg)] max-sm:flex-none ${
        compact ? "shrink-0" : "flex-1"
      }`}
    >
      <div
        className={`relative z-10 shrink-0 border-b border-border px-5 pb-3 pt-3 sm:px-7 ${
          compact ? "" : ""
        }`}
      >
        {compact ? (
          <>
            <p className="text-[11.5px] font-semibold uppercase tracking-[1.4px] text-[color:#8A6424]">
              {compactHeading ??
                (isToday ? "Today" : dateLabel.toUpperCase())}
            </p>
            <p className="mt-0.5 text-[14.5px] text-muted">
              {isToday
                ? slotCount > 3
                  ? "Things you’re grateful for today."
                  : "Three things you’re grateful for today."
                : slotCount > 3
                  ? `Things you were grateful for on ${dateLabel}.`
                  : `Three things you were grateful for on ${dateLabel}.`}
            </p>
          </>
        ) : (
          <>
            <h2 className="font-display text-[26px] font-normal tracking-tight text-foreground">
              {isToday ? "Today" : dateLabel}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {isToday
                ? slotCount > 3
                  ? "Things you’re grateful for today."
                  : "Three things you’re grateful for today."
                : slotCount > 3
                  ? `Things you were grateful for on ${dateLabel}.`
                  : `Three things you were grateful for on ${dateLabel}.`}
            </p>
          </>
        )}
      </div>
      <div className="space-y-5 px-7 pt-5 pb-4 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain sm:py-6">
        {displayLines.map((value, i) => {
          const Icon = FIELD_ICONS[i] ?? IconSparkles;
          const ariaLabel = ariaLabelForIndex(i);
          return (
            <div key={ariaLabel} className="flex items-start gap-3">
              <span
                className="mt-2.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--gold)_70%,white)] text-on-accent"
                aria-hidden
              >
                <Icon size={16} stroke={1.75} />
              </span>
              <textarea
                value={value}
                onChange={(e) => {
                  const next = [...displayLines];
                  next[i] = e.target.value;
                  onChange(next);
                }}
                rows={2}
                placeholder="I’m grateful for…"
                aria-label={ariaLabel}
                className="min-w-0 flex-1 resize-y rounded-xl border border-border bg-background px-4 text-base leading-relaxed text-foreground outline-none ring-accent/30 placeholder:text-muted/70 focus:ring-2 max-sm:h-[2.75rem] max-sm:min-h-[2.75rem] max-sm:resize-none max-sm:overflow-y-auto max-sm:py-2.5 sm:min-h-[4rem] sm:py-3"
              />
            </div>
          );
        })}
      </div>
      {showFooter ? (
        <div className="relative z-10 shrink-0 border-t border-border px-7 py-3">
          {children}
          {footerNote || onDelete ? (
            <div
              className={`flex flex-wrap items-center gap-3 ${
                children ? "mt-3" : ""
              }`}
            >
              {footerNote ? (
                <p className="text-sm text-muted">{footerNote}</p>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  onClick={onDelete}
                  className="cursor-pointer text-xs font-medium text-muted underline-offset-2 hover:text-danger hover:underline"
                >
                  Delete day
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

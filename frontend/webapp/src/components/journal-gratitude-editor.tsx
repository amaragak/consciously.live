"use client";

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
};

export function JournalGratitudeEditor({ createdAt, lines, onChange, children }: Props) {
  const isToday = localDateKeyFromIso(createdAt) === localDateKey();
  const dateLabel = formatJournalEntryDate(createdAt);
  const slotCount = Math.max(3, lines.length);
  const displayLines = Array.from({ length: slotCount }, (_, i) => lines[i] ?? "");

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-journal-warm-border bg-journal-warm-bg shadow-sm">
      <div className="relative z-10 shrink-0 border-b border-journal-warm-border bg-journal-warm-bg px-5 py-4 sm:px-6">
        <h2 className="font-display text-xl font-medium tracking-tight text-foreground sm:text-2xl">
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
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
        {displayLines.map((value, i) => {
          const Icon = FIELD_ICONS[i] ?? IconSparkles;
          const ariaLabel = ariaLabelForIndex(i);
          return (
            <div key={ariaLabel} className="flex items-start gap-3">
              <span
                className="mt-2.5 flex size-8 shrink-0 items-center justify-center rounded-full accent-fill-gradient text-on-accent"
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
                rows={3}
                placeholder="I’m grateful for…"
                aria-label={ariaLabel}
                className="min-h-[4.5rem] min-w-0 flex-1 resize-y rounded-2xl border border-journal-warm-border bg-journal-warm-input-bg px-4 py-3 text-base leading-relaxed text-foreground outline-none ring-accent/30 placeholder:text-muted/70 focus:ring-2"
              />
            </div>
          );
        })}
      </div>
      {children ? (
        <div className="relative z-10 shrink-0 border-t border-journal-warm-border bg-journal-warm-bg px-5 py-3 sm:px-6">
          {children}
        </div>
      ) : null}
    </div>
  );
}

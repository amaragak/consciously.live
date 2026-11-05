import { Link } from "@/lib/spa-nav";
import type { GratitudeDayRow } from "@/lib/journal-gratitudes";

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** One-line past-day row: date · first line · count · chevron. */
export function JournalGratitudeDayRow({
  day,
  bordered,
}: {
  day: GratitudeDayRow;
  bordered?: boolean;
}) {
  return (
    <Link
      href={day.href}
      className={`flex h-[46px] items-center gap-2.5 text-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--foreground)_4%,transparent)] ${
        bordered ? "border-t border-border" : ""
      }`}
    >
      <span className="w-[74px] shrink-0 text-[13px] font-semibold text-muted">
        {day.dateLabel}
      </span>
      <span className="min-w-0 flex-1 truncate text-[15px]">
        {day.firstLine || "—"}
      </span>
      <span className="shrink-0 text-[13px] text-muted">{day.count}</span>
      <span className="flex shrink-0 opacity-55" aria-hidden>
        <ChevronRight />
      </span>
    </Link>
  );
}

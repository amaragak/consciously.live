import { formatBlogSeries } from "@/lib/public-blog";

export function ReadSeriesLabel({
  series,
  part,
  className = "",
}: {
  series: string;
  part: number | null;
  className?: string;
}) {
  const line = formatBlogSeries(series, part);
  if (!line) return null;
  return (
    <p
      className={`text-[11px] font-medium uppercase tracking-wide text-accent-link ${className}`}
    >
      {line}
    </p>
  );
}

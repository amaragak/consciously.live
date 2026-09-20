import { formatBlogSeries } from "@/lib/public-blog";

export function ReadSeriesLabel({
  series,
  part,
  className = "",
  size = "sm",
}: {
  series: string;
  part: number | null;
  className?: string;
  size?: "sm" | "lg";
}) {
  const s = series.trim();
  if (!s && part == null) return null;

  if (size === "lg") {
    return (
      <p className={`font-medium tracking-wide text-accent-link${className ? ` ${className}` : ""}`}>
        {s ? <span className="text-sm uppercase">{s}</span> : null}
        {s && part != null ? <span className="text-sm"> · </span> : null}
        {part != null ? (
          <span className="text-lg font-medium normal-case tracking-normal sm:text-xl">
            Part {part}
          </span>
        ) : null}
      </p>
    );
  }

  const line = formatBlogSeries(s, part);
  return (
    <p
      className={`text-[11px] font-medium uppercase tracking-wide text-accent-link ${className}`}
    >
      {line}
    </p>
  );
}

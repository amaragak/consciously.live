import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/lib/spa-nav";

export function ExploreMiniCard({
  href,
  title,
  description,
  count,
  imageSrc,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  /** Hidden when 0, null, or undefined. */
  count?: number | null;
  imageSrc?: string | null;
  icon?: ReactNode;
}) {
  const showCount = typeof count === "number" && count > 0;

  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-[14px] border border-border bg-card px-4 py-3.5 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] transition-opacity hover:opacity-90"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-accent-soft/50 text-accent-link">
        {imageSrc ? (
          <img src={imageSrc} alt="" className="h-full w-full object-cover" />
        ) : (
          icon
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-baseline">
          <span className="font-display text-[17px] leading-tight text-foreground">
            {title}
          </span>
          {showCount ? (
            <span className="ml-1.5 text-xs text-muted tabular-nums">{count}</span>
          ) : null}
        </span>
        <span className="text-[13px] leading-[1.45] text-foreground/90">
          {description}
        </span>
      </span>
      <ChevronRight
        aria-hidden
        className="mt-0.5 size-[18px] shrink-0 self-center text-muted"
        strokeWidth={2}
      />
    </Link>
  );
}

export function ExploreMiniGroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="col-span-full my-1 text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link max-md:mb-0 max-md:mt-1.5 first:max-md:mt-0 md:-mb-1">
      {children}
    </p>
  );
}

export function ExploreMiniGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-3">
      {children}
    </div>
  );
}

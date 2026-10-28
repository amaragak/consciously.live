import { SelectChevron } from "@/components/select-chevron";
import { Link } from "@/lib/spa-nav";

export type OverviewSubpageTile = {
  href: string;
  label: string;
  count?: number | null;
  /** Full-bleed card illustration URL. */
  imageSrc: string;
};

export type OverviewSubpageGroup = {
  label?: string;
  tiles: readonly OverviewSubpageTile[];
};

/**
 * Image-led sub-page cards for Journal / Meditate overviews.
 * - Desktop Meditate (`sideBySide`): Library + Sounds labelled columns, six equal cards in one row.
 * - Desktop Journal (default): equal cards in one row.
 * - Mobile: each group scrolls sideways (Meditate); Journal fits three across without chevrons.
 */
export function OverviewSubpagesPanel({
  groups,
  loading = false,
  layout = "row",
}: {
  groups: readonly OverviewSubpageGroup[];
  loading?: boolean;
  layout?: "row" | "sideBySide";
}) {
  if (layout === "sideBySide") {
    return (
      <section className="rounded-[22px] border border-border bg-card px-3 py-3 shadow-[0_2px_14px_rgba(15,27,45,0.05)] md:px-4 md:py-4">
        {/* Desktop: one row of equal cards under two group labels */}
        <div className="hidden md:block">
          <div
            className="mb-2 grid gap-2.5"
            style={{
              gridTemplateColumns: `repeat(${groups.reduce((n, g) => n + g.tiles.length, 0)}, minmax(0, 1fr))`,
            }}
          >
            {groups.map((group) => (
              <p
                key={`label-${group.label}`}
                className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"
                style={{ gridColumn: `span ${group.tiles.length}` }}
              >
                {group.label}
              </p>
            ))}
            {groups.flatMap((group) =>
              group.tiles.map((tile) => (
                <OverviewSubpageCard
                  key={tile.href}
                  tile={tile}
                  loading={loading}
                  size="desktop"
                />
              )),
            )}
          </div>
        </div>

        {/* Mobile: labelled rows that scroll sideways */}
        <div className="flex flex-col gap-3.5 md:hidden">
          {groups.map((group) => (
            <div key={group.label ?? group.tiles[0]?.href} className="flex flex-col gap-1.5">
              {group.label ? (
                <p className="px-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {group.label}
                </p>
              ) : null}
              <div className="-mx-0.5 flex gap-2 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {group.tiles.map((tile) => (
                  <OverviewSubpageCard
                    key={tile.href}
                    tile={tile}
                    loading={loading}
                    size="mobileScroll"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Single row (Journal): three equal cards; mobile fits side by side, no chevron.
  const tiles = groups.flatMap((g) => g.tiles);
  return (
    <section className="rounded-[22px] border border-border bg-card px-3 py-3 shadow-[0_2px_14px_rgba(15,27,45,0.05)] md:px-4 md:py-4">
      <div className="grid grid-cols-3 gap-2 md:gap-2.5">
        {tiles.map((tile) => (
          <OverviewSubpageCard
            key={tile.href}
            tile={tile}
            loading={loading}
            size="journal"
          />
        ))}
      </div>
    </section>
  );
}

function OverviewSubpageCard({
  tile,
  loading,
  size,
}: {
  tile: OverviewSubpageTile;
  loading: boolean;
  size: "desktop" | "mobileScroll" | "journal";
}) {
  const count =
    loading || tile.count == null || tile.count <= 0 ? null : tile.count;
  const imageH =
    size === "desktop"
      ? "h-[104px]"
      : size === "mobileScroll"
        ? "h-[78px]"
        : "h-[70px] md:h-[104px]";
  const widthClass =
    size === "mobileScroll" ? "w-[132px] shrink-0" : "min-w-0 w-full";

  return (
    <Link
      href={tile.href}
      className={`flex flex-col overflow-hidden rounded-[14px] border border-border bg-card ${widthClass}`}
    >
      <span
        className={`relative block w-full shrink-0 overflow-hidden bg-accent-soft/40 ${imageH}`}
      >
        {loading ? (
          <span className="mm-skeleton absolute inset-0 block" />
        ) : (
          <img
            src={tile.imageSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
      </span>
      <span className="flex items-center gap-1.5 px-2.5 py-2.5 md:px-3">
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-nowrap">
          <span className="truncate text-[13.5px] font-semibold text-foreground md:text-[14px]">
            {tile.label}
          </span>
          {loading ? (
            <span className="mm-skeleton inline-block h-3 w-5 rounded" />
          ) : count != null ? (
            <span className="text-[12.5px] text-muted">{count}</span>
          ) : null}
        </span>
        {/* Journal mobile: drop chevron at narrow width. */}
        <SelectChevron
          direction="right"
          className={
            size === "journal"
              ? "hidden shrink-0 text-muted md:block"
              : "shrink-0 text-muted"
          }
        />
      </span>
    </Link>
  );
}

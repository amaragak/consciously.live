import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";
import { FavoriteHeartButton } from "@/components/favorite-heart-button";
import {
  SoundsMixTile,
  SoundsPlayCircle,
  SoundsPresetChip,
} from "@/components/sounds-preset-chip";

export type SoundsMixItem = {
  id: string;
  name: string;
  /** e.g. "Rain · Singing bowl · Drone" */
  summary: string;
  iconId: string;
  iconBg?: string;
  iconColor?: string;
  favorite: boolean;
};

const POPOVER_W = 340;
const SEARCH_THRESHOLD = 8;

const GROUP_LABEL_CLASS =
  "text-[10px] font-semibold uppercase tracking-[1.4px] text-accent-link";

function lineCount(widths: number[], avail: number, gap: number): number {
  let lines = 1;
  let x = 0;
  for (const w of widths) {
    if (x === 0) x = w;
    else if (x + gap + w <= avail) x += gap + w;
    else {
      lines += 1;
      x = w;
    }
  }
  return lines;
}

function sameWidths(a: Record<string, number>, b: Record<string, number>) {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
}

/** Popover / bottom-sheet body: search (if >8), heading, rows, footer. */
function SoundsMixPanel({
  heading,
  searchPlaceholder,
  items,
  loadedId,
  previewingId,
  listMaxClass,
  onSelect,
  onPreview,
  onToggleFavorite,
}: {
  heading: string;
  searchPlaceholder: string;
  items: SoundsMixItem[];
  loadedId: string | null;
  previewingId: string | null;
  listMaxClass: string;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onToggleFavorite: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const showSearch = items.length > SEARCH_THRESHOLD;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!showSearch || !q) return items;
    return items.filter((i) => i.name.toLowerCase().includes(q));
  }, [items, query, showSearch]);

  return (
    <div className="flex flex-col gap-1">
      {showSearch ? (
        <div className="relative mb-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            strokeWidth={2}
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-[38px] w-full rounded-[10px] border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted focus:border-accent/50"
          />
        </div>
      ) : null}
      <p className={`px-2.5 pb-0.5 pt-1.5 ${GROUP_LABEL_CLASS}`}>
        {heading} · {items.length}
      </p>
      <ul className={`flex flex-col gap-1 overflow-y-auto ${listMaxClass}`}>
        {filtered.map((item) => {
          const loaded = item.id === loadedId;
          return (
            <li key={item.id}>
              <div
                role="button"
                tabIndex={0}
                aria-current={loaded ? "true" : undefined}
                onClick={() => onSelect(item.id)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(item.id);
                  }
                }}
                className={`flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 ${
                  loaded ? "bg-accent-soft" : "hover:bg-accent-soft/40"
                }`}
              >
                <SoundsMixTile
                  iconId={item.iconId}
                  iconBg={item.iconBg}
                  iconColor={item.iconColor}
                  size={32}
                  radius={9}
                  iconSize={18}
                />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {item.name}
                  </span>
                  {item.summary ? (
                    <span className="block truncate text-[11px] text-muted">
                      {item.summary}
                    </span>
                  ) : null}
                </span>
                <FavoriteHeartButton
                  pressed={item.favorite}
                  label={item.name}
                  onToggle={() => onToggleFavorite(item.id)}
                  iconSize={15}
                  boxClassName="h-7 w-7 rounded-lg"
                />
                <button
                  type="button"
                  aria-label={
                    previewingId === item.id
                      ? `Stop preview of ${item.name}`
                      : `Preview ${item.name}`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(item.id);
                  }}
                  className="flex shrink-0 cursor-pointer items-center justify-center rounded-full"
                >
                  <SoundsPlayCircle
                    playing={previewingId === item.id}
                    size={26}
                    iconSize={10}
                  />
                </button>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="px-2.5 py-2 text-xs text-muted">No matches.</li>
        ) : null}
      </ul>
      <p className="px-2.5 pt-1.5 text-xs text-muted">
        Favourites and recently used appear first in the row.
      </p>
    </div>
  );
}

/**
 * One Sounds-page preset group (Factory / Your mixes): label + chips clamped
 * to one line (desktop) or two lines (mobile). Overflow goes behind "+n more".
 * `items` must already be ordered favourites → recent → rest.
 */
export function SoundsPresetChipRow({
  label,
  heading,
  searchPlaceholder = "Search your mixes",
  items,
  loadedId,
  previewingId,
  variant,
  loading = false,
  emptyText,
  onSelect,
  onPreview,
  onToggleFavorite,
  onNew,
}: {
  label: string;
  /** Popover heading, e.g. "Your mixes". */
  heading: string;
  searchPlaceholder?: string;
  items: SoundsMixItem[];
  loadedId: string | null;
  previewingId: string | null;
  variant: "desktop" | "mobile";
  loading?: boolean;
  emptyText?: string;
  onSelect: (id: string) => void;
  onPreview: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  /** Renders the dashed "+ New mix" pill (always visible). */
  onNew?: () => void;
}) {
  const desktop = variant === "desktop";
  const gap = desktop ? 8 : 6;
  const maxLines = desktop ? 1 : 2;

  const trackRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const moreBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = useState<number | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [fontTick, setFontTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );

  // Available width for chips.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    setAvail(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(() => {
      setAvail(el.getBoundingClientRect().width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [variant]);

  // Re-measure after web fonts settle.
  useEffect(() => {
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) setFontTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Natural chip widths (measured off-screen, every render, state set only on change).
  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const next: Record<string, number> = {};
    root.querySelectorAll<HTMLElement>("[data-m]").forEach((el) => {
      next[el.dataset.m as string] = el.offsetWidth;
    });
    setWidths((prev) => (sameWidths(prev, next) ? prev : next));
  });
  void fontTick;

  const { visible, hidden } = useMemo(() => {
    const n = items.length;
    if (avail == null || avail <= 0) {
      return { visible: [] as SoundsMixItem[], hidden: n };
    }
    const loadedItem = items.find((i) => i.id === loadedId) ?? null;
    const pick = (k: number): SoundsMixItem[] => {
      let vis = items.slice(0, k);
      if (loadedItem && !vis.some((v) => v.id === loadedItem.id)) {
        vis = k === 0 ? [loadedItem] : [...vis.slice(0, k - 1), loadedItem];
      }
      return vis;
    };
    const newW = desktop && onNew ? (widths["new"] ?? 0) : 0;
    for (let k = n; k >= 0; k--) {
      const vis = pick(k);
      const hiddenCount = n - vis.length;
      const ws = vis.map((v) => widths[`c:${v.id}`] ?? 0);
      if (hiddenCount > 0) {
        ws.push(widths[hiddenCount >= 10 ? "more2" : "more1"] ?? 0);
      }
      if (newW > 0) ws.push(newW);
      if (lineCount(ws, avail, gap) <= maxLines) {
        return { visible: vis, hidden: hiddenCount };
      }
    }
    return { visible: pick(0), hidden: n - pick(0).length };
  }, [items, loadedId, avail, widths, desktop, onNew, gap, maxLines]);

  const close = useCallback(() => setOpen(false), []);

  function toggleOpen() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = moreBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.max(
        8,
        Math.min(rect.left, window.innerWidth - POPOVER_W - 8),
      );
      setAnchor({ top: rect.bottom + 6, left });
    }
    setOpen(true);
  }

  // Esc / outside click / viewport changes close the popover.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if (moreBtnRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScroll(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    if (desktop) {
      document.addEventListener("pointerdown", onPointer);
      window.addEventListener("resize", close);
      window.addEventListener("scroll", onScroll, true);
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, desktop, close]);

  // Variant switched while open (viewport resize): close.
  useEffect(() => {
    setOpen(false);
  }, [variant]);

  const chipH = desktop ? "h-10" : "h-[34px]";

  const moreChip =
    hidden > 0 ? (
      <button
        ref={moreBtnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleOpen}
        className={`inline-flex ${chipH} shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-border bg-background px-3.5 text-[13px] font-semibold text-foreground hover:border-accent/40`}
      >
        +{hidden} more
        <span aria-hidden className="text-[10px] text-muted">
          ▾
        </span>
      </button>
    ) : null;

  const newChip = onNew ? (
    <button
      type="button"
      onClick={onNew}
      aria-label="New mix"
      className={`inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-dashed border-accent/35 text-[13px] font-semibold text-accent-link transition-colors hover:bg-accent-soft/40 ${
        desktop ? "h-10 px-3.5" : "h-7 px-3 text-xs"
      }`}
    >
      + New mix
    </button>
  ) : null;

  const labelEl = (
    <span className={`whitespace-nowrap ${GROUP_LABEL_CLASS}`}>{label}</span>
  );

  const chips = loading ? (
    <>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className={`${chipH} w-28 shrink-0 animate-pulse rounded-full border border-border bg-muted/25`}
        />
      ))}
    </>
  ) : items.length === 0 ? (
    emptyText ? (
      <span className="whitespace-nowrap text-xs text-muted">{emptyText}</span>
    ) : null
  ) : (
    <>
      {visible.map((item) => (
        <SoundsPresetChip
          key={item.id}
          name={item.name}
          iconId={item.iconId}
          iconBg={item.iconBg}
          iconColor={item.iconColor}
          loaded={item.id === loadedId}
          previewing={item.id === previewingId}
          variant={variant}
          onSelect={() => onSelect(item.id)}
          onPreview={() => onPreview(item.id)}
        />
      ))}
      {moreChip}
    </>
  );

  const panel = (
    <SoundsMixPanel
      heading={heading}
      searchPlaceholder={searchPlaceholder}
      items={items}
      loadedId={loadedId}
      previewingId={previewingId}
      listMaxClass={desktop ? "max-h-[min(400px,50vh)]" : "max-h-[55vh]"}
      onSelect={(id) => {
        onSelect(id);
        setOpen(false);
      }}
      onPreview={onPreview}
      onToggleFavorite={onToggleFavorite}
    />
  );

  const measureLayer = (
    <div
      ref={measureRef}
      aria-hidden
      className="pointer-events-none invisible absolute left-0 top-0 flex h-0 w-max gap-2 overflow-hidden"
    >
      {items.map((item) => (
        <span key={item.id} data-m={`c:${item.id}`} className="inline-flex shrink-0">
          <SoundsPresetChip
            name={item.name}
            iconId={item.iconId}
            loaded={item.id === loadedId}
            previewing={false}
            variant={variant}
            onSelect={() => undefined}
            onPreview={() => undefined}
            inert
          />
        </span>
      ))}
      {[1, 2].map((digits) => (
        <span
          key={digits}
          data-m={`more${digits}`}
          className={`inline-flex ${chipH} shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border px-3.5 text-[13px] font-semibold`}
        >
          +{digits === 1 ? "8" : "88"} more
          <span className="text-[10px]">▾</span>
        </span>
      ))}
      {desktop && onNew ? (
        <span data-m="new" className="inline-flex shrink-0">
          <span className="inline-flex h-10 items-center whitespace-nowrap rounded-full border border-dashed px-3.5 text-[13px] font-semibold">
            + New mix
          </span>
        </span>
      ) : null}
    </div>
  );

  const overlay =
    open && typeof document !== "undefined"
      ? createPortal(
          desktop ? (
            anchor ? (
              <div
                ref={panelRef}
                role="dialog"
                aria-label={`${heading} list`}
                className="fixed z-[140] flex flex-col gap-1 rounded-[14px] border border-border bg-card p-2.5 shadow-[0_12px_32px_rgb(15_27_45_/_0.16)]"
                style={{ top: anchor.top, left: anchor.left, width: POPOVER_W }}
              >
                {panel}
              </div>
            ) : null
          ) : (
            <div className="fixed inset-0 z-[140]">
              <button
                type="button"
                aria-label="Close"
                onClick={close}
                className="absolute inset-0 cursor-default bg-foreground/30"
              />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${heading} list`}
                className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card px-3 pb-6 pt-2 shadow-[0_-8px_28px_rgb(15_27_45_/_0.18)]"
              >
                <div
                  aria-hidden
                  className="mx-auto mb-2 h-1 w-10 rounded-full bg-border"
                />
                {panel}
              </div>
            </div>
          ),
          document.body,
        )
      : null;

  if (desktop) {
    return (
      <div className="relative flex items-center gap-2">
        <span className="flex w-[84px] shrink-0 items-center">{labelEl}</span>
        <div
          ref={trackRef}
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2"
        >
          {chips}
          {newChip}
        </div>
        {measureLayer}
        {overlay}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {labelEl}
        {newChip}
      </div>
      <div ref={trackRef} className="flex flex-wrap gap-1.5">
        {chips}
      </div>
      {measureLayer}
      {overlay}
    </div>
  );
}

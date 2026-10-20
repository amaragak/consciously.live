import {
  Check,
  Crop as CropIcon,
  GripVertical,
  Layers,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  VISION_COMPOSE_SLOT_COUNT,
  visionItemAspect,
  visionImageStyleOf,
  type VisionBoardItem,
  type VisionCrop,
  type VisionCropPreset,
} from "@/lib/ideate-vision-board";
import { subscribeVisionRedrawing, visionRedrawingIds } from "@/lib/vision-image-jobs";

export type MosaicArea = { id: string; title: string; visionText?: string };

const PRESETS: { id: VisionCropPreset | "original"; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "1:1", label: "1:1" },
  { id: "4:5", label: "4:5" },
  { id: "3:2", label: "3:2" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "free", label: "Free" },
];

const PRESET_ASPECT: Record<VisionCropPreset, number | null> = {
  "1:1": 1,
  "4:5": 4 / 5,
  "3:2": 3 / 2,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  free: null,
};

type Packed = { item: VisionBoardItem; width: number };
type PackedRow = { height: number; items: Packed[] };

function metrics(px: number): { target: number; gap: number } {
  if (px >= 1280) return { target: 210, gap: 8 };
  if (px >= 640) return { target: 170, gap: 8 };
  return { target: 110, gap: 6 };
}

function packRows(
  items: VisionBoardItem[],
  width: number,
  target: number,
  gap: number,
): PackedRow[] {
  if (width < 40 || items.length === 0) return [];
  const ratios = items.map((item) => Math.max(0.35, Math.min(visionItemAspect(item), 3.2)));
  const rows: PackedRow[] = [];
  let cursor = 0;
  while (cursor < items.length) {
    const row: number[] = [];
    while (cursor + row.length < items.length) {
      const trial = [...row, cursor + row.length];
      const natural =
        trial.reduce((sum, index) => sum + ratios[index]! * target, 0) +
        gap * (trial.length - 1);
      if (row.length > 0 && natural > width + 0.5) break;
      row.push(cursor + row.length);
    }
    cursor += row.length;
    const more = cursor < items.length;
    const ratioSum = row.reduce((sum, index) => sum + ratios[index]!, 0) || 1;
    const height = more ? (width - gap * (row.length - 1)) / ratioSum : target;
    rows.push({
      height,
      items: row.map((index) => ({
        item: items[index]!,
        width: ratios[index]! * height,
      })),
    });
  }
  return rows;
}

function takeRow(
  items: VisionBoardItem[],
  width: number,
  target: number,
  gap: number,
): { row: PackedRow | null; rest: VisionBoardItem[] } {
  if (items.length === 0 || width < 40) return { row: null, rest: items };
  const packed = packRows(items, width, target, gap);
  const first = packed[0];
  if (!first) return { row: null, rest: items };
  const used = new Set(first.items.map((entry) => entry.item.id));
  return { row: first, rest: items.filter((item) => !used.has(item.id)) };
}

function cropStyle(crop: VisionCrop | null | undefined): CSSProperties {
  if (!crop || crop.w <= 0 || crop.h <= 0) {
    return {
      position: "absolute",
      inset: 0,
      width: "100%",
      height: "100%",
      objectFit: "cover",
    };
  }
  return {
    position: "absolute",
    maxWidth: "none",
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    left: `${(-crop.x / crop.w) * 100}%`,
    top: `${(-crop.y / crop.h) * 100}%`,
  };
}

function areaLabel(item: VisionBoardItem, areas: MosaicArea[]): string {
  const id = item.lifeAreaIds?.[0];
  return areas.find((area) => area.id === id)?.title ?? "";
}

export function VisionBoardMosaic({
  board,
  library,
  tileUrls,
  lifeAreas,
  hydrated,
  busy,
  freshId,
  error,
  onUpload,
  onCreate,
  onCreateForArea,
  onToggleFavourite,
  onPlace,
  onRemove,
  onAdd,
  onFeature,
  onApplyCrop,
  onMeasure,
  onNewTake,
  onVersions,
  onRedraw,
  onRestore,
}: {
  board: VisionBoardItem[];
  library: VisionBoardItem[];
  tileUrls: Record<string, string>;
  lifeAreas: MosaicArea[];
  hydrated: boolean;
  busy: string | null;
  freshId: string | null;
  error: string | null;
  onUpload: () => void;
  onCreate: () => void;
  onCreateForArea: (area: MosaicArea) => void;
  onToggleFavourite: (item: VisionBoardItem) => void;
  onPlace: (itemId: string, index: number) => void;
  onRemove: (item: VisionBoardItem) => void;
  onAdd: (item: VisionBoardItem) => void;
  onFeature: (item: VisionBoardItem) => void;
  onApplyCrop: (
    item: VisionBoardItem,
    crop: VisionCrop | null,
    featured: boolean,
  ) => void;
  onMeasure: (item: VisionBoardItem, width: number, height: number) => void;
  onNewTake: (item: VisionBoardItem) => void;
  onVersions: (item: VisionBoardItem) => void;
  onRedraw: (item: VisionBoardItem) => void;
  onRestore: (item: VisionBoardItem) => void;
}) {
  const wallRef = useRef<HTMLDivElement | null>(null);
  const libraryRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(0);
  const [viewport, setViewport] = useState(1280);
  const [arrange, setArrange] = useState(false);
  const [filter, setFilter] = useState<"all" | "favourites" | "off">("all");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [cropFor, setCropFor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const node = wallRef.current;
    if (!node) return;
    const measure = () => {
      setWidth(node.clientWidth);
      setViewport(window.innerWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!arrange) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setArrange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arrange]);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuId]);

  const { target, gap } = metrics(viewport);
  const wide = viewport >= 768;
  const inner = Math.max(0, width - 28);
  const featured = board.find((item) => item.featured) ?? null;
  const flow = featured ? board.filter((item) => item.id !== featured.id) : board;
  const featureRatio = featured
    ? Math.max(0.35, Math.min(visionItemAspect(featured), 3.2))
    : 1;

  let featureBox: { width: number; height: number } | null = null;
  let beside: PackedRow[] = [];
  let below = flow;
  if (featured && inner > 0) {
    if (!wide) {
      featureBox = { width: inner, height: inner / featureRatio };
    } else {
      let blockH = target * 2 + gap;
      let featureW = featureRatio * blockH;
      const cap = inner * 0.6;
      if (featureW > cap) {
        featureW = cap;
        blockH = cap / featureRatio;
      }
      const side = Math.max(80, inner - featureW - gap);
      const rowTarget = Math.max(48, (blockH - gap) / 2);
      const first = takeRow(flow, side, rowTarget, gap);
      const second = takeRow(first.rest, side, rowTarget, gap);
      beside = [first.row, second.row].filter((row): row is PackedRow => Boolean(row));
      below = second.rest;
      const usedH =
        beside.length === 0
          ? blockH
          : beside.reduce((sum, row) => sum + row.height, 0) + gap * (beside.length - 1);
      featureBox = { width: featureW, height: usedH };
    }
  }
  const lower = packRows(below, inner, target, gap);
  const libraryRows = packRows(
    library.filter((item) => {
      if (filter === "favourites" && !item.favourite) return false;
      if (filter === "off" && board.some((entry) => entry.id === item.id)) return false;
      if (areaId && !(item.lifeAreaIds ?? []).includes(areaId)) return false;
      return true;
    }),
    width,
    150,
    gap,
  );

  const boardIndex = new Map(board.map((item, index) => [item.id, index]));
  const favourites = library.filter((item) => item.favourite).length;
  const offBoard = library.filter(
    (item) => !board.some((entry) => entry.id === item.id),
  ).length;
  const cropItem = library.find((item) => item.id === cropFor) ?? null;

  const dropAt = (index: number) => {
    if (!dragId) return;
    const moving = library.find((item) => item.id === dragId);
    if (!moving || moving.featured) return;
    const onBoard = board.some((item) => item.id === dragId);
    if (!onBoard && board.length >= VISION_COMPOSE_SLOT_COUNT) {
      onAdd(moving);
      return;
    }
    onPlace(dragId, index);
  };

    return (
    <>
      <div
        ref={wallRef}
        className="rounded-[20px] bg-[var(--deep)] p-3.5 shadow-[0_18px_40px_-18px_color-mix(in_srgb,var(--foreground)_45%,transparent)]"
        onDragOver={(event) => {
          if (!arrange || !dragId) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!arrange || !dragId) return;
          event.preventDefault();
          dropAt(overIndex ?? board.length);
        }}
      >
        {!hydrated ? (
          <div className="h-40 animate-pulse rounded-lg bg-white/10" />
        ) : board.length === 0 ? (
          <button
            type="button"
            onClick={() => {
              setFilter("off");
              setAreaId(null);
              libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex h-[110px] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-white/35 bg-white/[0.06] text-sm font-semibold text-white sm:h-[170px]"
          >
            <Plus className="size-5" strokeWidth={1.8} />
            Add
          </button>
        ) : (
          <div className="flex flex-col" style={{ gap }}>
            {featured && featureBox ? (
              <div className="flex items-start" style={{ gap }}>
                <Tile
                  item={featured}
                  url={tileUrls[featured.id]}
                  width={featureBox.width}
                  height={featureBox.height}
                  label={areaLabel(featured, lifeAreas)}
                  arrange={arrange}
                  dragging={dragId === featured.id}
                  fresh={freshId === featured.id}
                  feature
                  menuOpen={menuId === featured.id}
                  onMeasure={onMeasure}
                  onOpenMenu={() => setMenuId(menuId === featured.id ? null : featured.id)}
                  onFavourite={() => onToggleFavourite(featured)}
                  onCrop={() => setCropFor(featured.id)}
                  menu={
                    menuId === featured.id ? (
                      <TileMenu
                        item={featured}
                        onBoard
                        onNewTake={() => onNewTake(featured)}
                        onVersions={() => onVersions(featured)}
                        onFavourite={() => onToggleFavourite(featured)}
                        onFeature={() => onFeature(featured)}
                        onCrop={() => setCropFor(featured.id)}
                        onBoardAction={() => onRemove(featured)}
                        onRedraw={() => onRedraw(featured)}
                        onRestore={() => onRestore(featured)}
                        onClose={() => setMenuId(null)}
                      />
                    ) : null
                  }
                />
                {beside.length > 0 ? (
                  <div className="flex min-w-0 flex-1 flex-col" style={{ gap }}>
                    {beside.map((row, index) => (
                      <Row
                        key={`beside-${index}`}
                        row={row}
                        gap={gap}
                        arrange={arrange}
                        dragId={dragId}
                        freshId={freshId}
                        menuId={menuId}
                        tileUrls={tileUrls}
                        lifeAreas={lifeAreas}
                        boardIndex={boardIndex}
                        onMeasure={onMeasure}
                        onMenu={setMenuId}
                        onFavourite={onToggleFavourite}
                        onCrop={setCropFor}
                        onNewTake={onNewTake}
                        onVersions={onVersions}
                        onFeature={onFeature}
                        onRemove={onRemove}
                        onDragStart={setDragId}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverIndex(null);
                        }}
                        onOver={setOverIndex}
                        overIndex={overIndex}
                        onDrop={dropAt}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {lower.map((row, index) => (
              <Row
                key={`below-${index}`}
                row={row}
                gap={gap}
                arrange={arrange}
                dragId={dragId}
                freshId={freshId}
                menuId={menuId}
                tileUrls={tileUrls}
                lifeAreas={lifeAreas}
                boardIndex={boardIndex}
                onMeasure={onMeasure}
                onMenu={setMenuId}
                onFavourite={onToggleFavourite}
                onCrop={setCropFor}
                onNewTake={onNewTake}
                onVersions={onVersions}
                onFeature={onFeature}
                onRemove={onRemove}
                onDragStart={setDragId}
                onDragEnd={() => {
                  setDragId(null);
                  setOverIndex(null);
                }}
                onOver={setOverIndex}
                overIndex={overIndex}
                onDrop={dropAt}
              />
            ))}
          </div>
        )}
      </div>

      <section ref={libraryRef} id="vision-library" className="mt-8 scroll-mt-24">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[1.6px] text-accent-link">
            Library
          </span>
          <FilterChip on={filter === "all" && !areaId} onClick={() => { setFilter("all"); setAreaId(null); }}>
            All {library.length}
          </FilterChip>
          <FilterChip on={filter === "favourites"} onClick={() => { setFilter("favourites"); setAreaId(null); }}>
            ★ Favourites {favourites}
          </FilterChip>
          <FilterChip on={filter === "off"} onClick={() => { setFilter("off"); setAreaId(null); }}>
            Not on board {offBoard}
          </FilterChip>
          <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
          {lifeAreas.map((area) => {
            const count = board.filter((item) =>
              (item.lifeAreaIds ?? []).includes(area.id),
            ).length;
            const empty = count === 0;
            return (
              <button
                key={area.id}
                type="button"
                onClick={() => {
                  if (empty) onCreateForArea(area);
                  else {
                    setFilter("all");
                    setAreaId(area.id);
                  }
                }}
                className={
                  empty
                    ? "inline-flex h-8 cursor-pointer items-center gap-1 rounded-full border-[1.5px] border-dashed border-accent bg-accent-soft px-3 text-[13px] font-semibold text-accent-link"
                    : areaId === area.id
                      ? "inline-flex h-8 cursor-pointer items-center rounded-full bg-foreground px-3 text-[13px] font-semibold text-background"
                      : "inline-flex h-8 cursor-pointer items-center rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground"
                }
              >
                {empty ? <Plus className="size-3.5" strokeWidth={1.8} /> : null}
                {area.title} {count}
              </button>
            );
          })}
        </div>
        {width === 0 ? (
          <div className="mt-4 h-32" />
        ) : libraryRows.length === 0 ? (
          <p className="mt-6 text-sm text-muted">
            {hydrated
              ? library.length === 0
                ? "Your library is empty."
                : "Nothing in the library matches this filter."
              : "Loading your images…"}
          </p>
        ) : (
          <div className="mt-4 flex flex-col" style={{ gap }}>
            {libraryRows.map((row, index) => (
              <div key={index} className="flex" style={{ gap }}>
                {row.items.map(({ item, width: tileW }) => {
                  const onBoard = board.some((entry) => entry.id === item.id);
                  const versions = (item.versions?.length ?? 0) + 1;
    return (
                    <div
                      key={item.id}
                      draggable={arrange}
                      onDragStart={() => arrange && setDragId(item.id)}
                      onDragEnd={() => {
                        setDragId(null);
                        setOverIndex(null);
                      }}
                      className={`group relative shrink-0 overflow-hidden rounded-lg ${
                        arrange ? "cursor-grab ring-1 ring-accent/40" : ""
                      }`}
                      style={{ width: tileW, height: row.height }}
                    >
                      <TileImage
                        item={item}
                        url={tileUrls[item.id]}
                        onMeasure={onMeasure}
                      />
                      <RedrawVeil id={item.id} />
                      {item.favourite ? (
                        <Star className="absolute bottom-2.5 right-2.5 size-[18px] fill-accent text-accent" />
                      ) : null}
                      {onBoard ? (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-foreground">
                          <Check className="size-3" strokeWidth={2} />
                          On board
                        </span>
                      ) : null}
                      {versions > 1 ? (
                        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold">
                          <Layers className="size-3" strokeWidth={1.8} />
                          {versions}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Image actions"
                        onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                        className="absolute right-2 top-2 hidden size-8 items-center justify-center rounded-lg bg-white/90 group-hover:inline-flex"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                      {menuId === item.id ? (
                        <TileMenu
                          item={item}
                          onBoard={onBoard}
                          onNewTake={() => onNewTake(item)}
                          onVersions={() => onVersions(item)}
                          onFavourite={() => onToggleFavourite(item)}
                          onFeature={() => onFeature(item)}
                          onCrop={() => setCropFor(item.id)}
                          onBoardAction={() => (onBoard ? onRemove(item) : onAdd(item))}
                          onRedraw={() => onRedraw(item)}
                          onRestore={() => onRestore(item)}
                          onClose={() => setMenuId(null)}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>

      <div
        className={`fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card p-[5px] shadow-[0_10px_28px_color-mix(in_srgb,var(--foreground)_16%,transparent)] ${
          arrange
            ? "bottom-[calc(58px+env(safe-area-inset-bottom,0px)+14px)] w-[calc(100%-28px)] max-w-xl sm:bottom-7"
            : "bottom-[calc(58px+env(safe-area-inset-bottom,0px)+14px)] w-[calc(100%-28px)] max-w-md sm:bottom-7 sm:w-auto"
        }`}
      >
        {arrange ? (
          <>
            <p className="min-w-0 flex-1 px-3 text-[13px] text-foreground">
              Drag to reorder · drag from your library to add
            </p>
            <span className="h-6 w-px bg-border" aria-hidden />
            <button
              type="button"
              onClick={() => setArrange(false)}
              className="accent-fill-gradient inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold text-on-accent"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onCreate}
              className="accent-fill-gradient inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-on-accent sm:flex-none"
            >
              <Sparkles className="size-4" strokeWidth={1.8} />
              Create image
            </button>
            <button
              type="button"
              onClick={onUpload}
              disabled={busy !== null}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold text-foreground disabled:opacity-40 sm:px-3"
            >
              <Upload className="size-4 sm:hidden" strokeWidth={1.8} />
              <span className="hidden items-center gap-2 sm:inline-flex">
                <Upload className="size-4" strokeWidth={1.8} />
                Upload
              </span>
              <span className="sr-only sm:hidden">Upload</span>
            </button>
            <span className="h-6 w-px bg-border" aria-hidden />
            <button
              type="button"
              onClick={() => setArrange(true)}
              className="inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-foreground sm:h-10 sm:w-auto sm:gap-2 sm:px-3 sm:text-sm sm:font-semibold"
            >
              <LayoutGrid className="size-4" strokeWidth={1.8} />
              <span className="hidden sm:inline">Arrange</span>
              <span className="sr-only sm:hidden">Arrange</span>
            </button>
          </>
        )}
      </div>

      {error?.includes("board is full") && !cropFor ? (
        <p
          role="status"
          className="fixed bottom-[calc(58px+env(safe-area-inset-bottom,0px)+76px)] left-1/2 z-40 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background sm:bottom-24"
        >
          {error}
        </p>
      ) : null}

      {cropItem ? (
        <CropDialog
          item={cropItem}
          url={tileUrls[cropItem.id]}
          onClose={() => setCropFor(null)}
          onApply={(crop, featured) => {
            onApplyCrop(cropItem, crop, featured);
            setCropFor(null);
          }}
        />
      ) : null}
    </>
  );
}

function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        on
          ? "inline-flex h-8 cursor-pointer items-center rounded-full bg-foreground px-3 text-[13px] font-semibold text-background"
          : "inline-flex h-8 cursor-pointer items-center rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-foreground"
      }
    >
      {children}
    </button>
  );
}

function Row({
  row,
  gap,
  arrange,
  dragId,
  freshId,
  menuId,
  tileUrls,
  lifeAreas,
  boardIndex,
  overIndex,
  onMeasure,
  onMenu,
  onFavourite,
  onCrop,
  onNewTake,
  onVersions,
  onFeature,
  onRemove,
  onDragStart,
  onDragEnd,
  onOver,
  onDrop,
}: {
  row: PackedRow;
  gap: number;
  arrange: boolean;
  dragId: string | null;
  freshId: string | null;
  menuId: string | null;
  tileUrls: Record<string, string>;
  lifeAreas: MosaicArea[];
  boardIndex: Map<string, number>;
  overIndex: number | null;
  onMeasure: (item: VisionBoardItem, width: number, height: number) => void;
  onMenu: (id: string | null) => void;
  onFavourite: (item: VisionBoardItem) => void;
  onCrop: (id: string) => void;
  onNewTake: (item: VisionBoardItem) => void;
  onVersions: (item: VisionBoardItem) => void;
  onFeature: (item: VisionBoardItem) => void;
  onRemove: (item: VisionBoardItem) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOver: (index: number) => void;
  onDrop: (index: number) => void;
}) {
  return (
    <div className="flex" style={{ gap }}>
      {row.items.map(({ item, width }) => {
        const index = boardIndex.get(item.id) ?? 0;
    return (
          <div key={item.id} className="relative shrink-0" style={{ width, height: row.height }}>
            {arrange && overIndex === index ? (
              <span className="absolute -left-1 top-0 z-10 h-full w-1 rounded-full bg-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_35%,transparent)]" />
            ) : null}
            <Tile
              item={item}
              url={tileUrls[item.id]}
              width={width}
              height={row.height}
              label={areaLabel(item, lifeAreas)}
              arrange={arrange}
              dragging={dragId === item.id}
              fresh={freshId === item.id}
              menuOpen={menuId === item.id}
              onMeasure={onMeasure}
              onOpenMenu={() => onMenu(menuId === item.id ? null : item.id)}
              onFavourite={() => onFavourite(item)}
              onCrop={() => onCrop(item.id)}
              draggable={arrange}
              onDragStart={() => onDragStart(item.id)}
              onDragEnd={onDragEnd}
              onDragOver={() => onOver(index)}
              onDrop={() => onDrop(index)}
              menu={
                menuId === item.id ? (
                  <TileMenu
                    item={item}
                    onBoard
                    onNewTake={() => onNewTake(item)}
                    onVersions={() => onVersions(item)}
                    onFavourite={() => onFavourite(item)}
                    onFeature={() => onFeature(item)}
                    onCrop={() => onCrop(item.id)}
                    onBoardAction={() => onRemove(item)}
                    onRedraw={() => onRedraw(item)}
                    onRestore={() => onRestore(item)}
                    onClose={() => onMenu(null)}
                  />
                ) : null
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function Tile({
  item,
  url,
  width,
  height,
  label,
  arrange,
  dragging,
  fresh,
  feature,
  menuOpen,
  menu,
  draggable,
  onMeasure,
  onOpenMenu,
  onFavourite,
  onCrop,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  item: VisionBoardItem;
  url?: string;
  width: number;
  height: number;
  label: string;
  arrange: boolean;
  dragging: boolean;
  fresh: boolean;
  feature?: boolean;
  menuOpen: boolean;
  menu: ReactNode;
  draggable?: boolean;
  onMeasure: (item: VisionBoardItem, width: number, height: number) => void;
  onOpenMenu: () => void;
  onFavourite: () => void;
  onCrop: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: () => void;
  onDrop?: () => void;
}) {
  return (
    <div
      id={`vision-tile-${item.id}`}
      draggable={draggable && !item.featured}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        if (arrange) return;
        const target = event.target as HTMLElement;
        if (target.closest("button")) return;
        onOpenMenu();
      }}
      onDragOver={(event) => {
        if (!draggable) return;
        event.preventDefault();
        onDragOver?.();
      }}
        onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop?.();
      }}
      className={`group relative shrink-0 overflow-hidden rounded-lg ${
        fresh ? "ring-2 ring-accent" : ""
      } ${menuOpen || arrange ? "" : "hover:ring-2 hover:ring-accent"} ${
        dragging ? "opacity-35" : ""
      }`}
      style={{ width, height }}
    >
      <TileImage item={item} url={url} onMeasure={onMeasure} />
      <RedrawVeil id={item.id} />
      {item.favourite && !arrange ? (
        <Star className="pointer-events-none absolute bottom-2.5 right-2.5 size-[18px] fill-accent text-accent" />
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-16 bg-gradient-to-t from-[color-mix(in_srgb,var(--foreground)_55%,transparent)] to-transparent group-hover:block" />
      {label ? (
        <p className="pointer-events-none absolute bottom-3 left-3 hidden text-[13px] font-semibold text-white group-hover:block">
          {label}
        </p>
      ) : null}
      {arrange ? (
        <>
          {!item.featured ? (
            <span className="absolute left-2 top-2 inline-flex size-[30px] items-center justify-center rounded-lg bg-white/90">
              <GripVertical className="size-4" />
            </span>
          ) : null}
          <span className="absolute right-2 top-2 flex gap-1.5">
            <button
              type="button"
              aria-label="Crop"
              onClick={onCrop}
              className="inline-flex size-[30px] cursor-pointer items-center justify-center rounded-lg bg-white/90"
            >
              <CropIcon className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Image actions"
              onClick={onOpenMenu}
              className="inline-flex size-[30px] cursor-pointer items-center justify-center rounded-lg bg-white/90"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </span>
          {feature ? (
            <span className="absolute bottom-2.5 left-3 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
              Feature
            </span>
          ) : null}
          {item.crop ? (
            <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold">
              <CropIcon className="size-3" />
              {item.crop.preset}
            </span>
          ) : null}
        </>
      ) : (
        <span className="absolute right-2 top-2 hidden gap-1.5 group-hover:flex group-focus-within:flex">
          <button
            type="button"
            aria-label="Image actions"
            onClick={onOpenMenu}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg bg-white/90"
          >
            <MoreHorizontal className="size-4" />
          </button>
          <button
            type="button"
            aria-label={item.favourite ? "Unfavourite" : "Favourite"}
            onClick={onFavourite}
            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-lg bg-white/90"
          >
            <Star className={`size-4 ${item.favourite ? "fill-accent text-accent" : ""}`} />
          </button>
        </span>
      )}
      {menu}
    </div>
  );
}

function TileImage({
  item,
  url,
  onMeasure,
}: {
  item: VisionBoardItem;
  url?: string;
  onMeasure: (item: VisionBoardItem, width: number, height: number) => void;
}) {
  if (!url) {
    return <div className="absolute inset-0" style={{ background: item.color }} />;
  }
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      style={cropStyle(item.crop)}
      onLoad={(event) => {
        const img = event.currentTarget;
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          onMeasure(item, img.naturalWidth, img.naturalHeight);
        }
      }}
    />
  );
}

function TileMenu({
  item,
  onBoard,
  onNewTake,
  onVersions,
  onFavourite,
  onFeature,
  onCrop,
  onBoardAction,
  onRedraw,
  onRestore,
  onClose,
}: {
  item: VisionBoardItem;
  onBoard: boolean;
  onNewTake: () => void;
  onVersions: () => void;
  onFavourite: () => void;
  onFeature: () => void;
  onCrop: () => void;
  onBoardAction: () => void;
  onRedraw: () => void;
  onRestore: () => void;
  onClose: () => void;
}) {
  const versions = (item.versions?.length ?? 0) + 1;
  const style = visionImageStyleOf(item.imageStyle);
  const run = (fn: () => void) => {
    onClose();
    fn();
  };
    return (
      <div
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute left-2 top-12 z-40 w-[220px] rounded-xl border border-border bg-card p-1.5 shadow-lg"
    >
      {item.prompt?.trim() ? (
        <MenuButton onClick={() => run(onRedraw)}>
          {style === "illustrated" ? "Redraw as realistic" : "Redraw as illustration"}
        </MenuButton>
      ) : null}
      {item.previousImage ? (
        <MenuButton onClick={() => run(onRestore)}>Go back to previous version</MenuButton>
      ) : null}
      <MenuButton onClick={() => run(onNewTake)}>New take</MenuButton>
      {versions > 1 ? (
        <MenuButton onClick={() => run(onVersions)}>Versions ({versions})</MenuButton>
      ) : null}
      <MenuButton onClick={() => run(onFavourite)}>
        {item.favourite ? "Unfavourite" : "Favourite"}
      </MenuButton>
      <MenuButton onClick={() => run(onCrop)}>Crop</MenuButton>
      <MenuButton onClick={() => run(onFeature)}>Feature on board</MenuButton>
      <MenuButton onClick={() => run(onBoardAction)}>
        {onBoard ? "Remove from board" : "Add to board"}
      </MenuButton>
      </div>
    );
  }

function RedrawVeil({ id }: { id: string }) {
  const ids = useSyncExternalStore(
    subscribeVisionRedrawing,
    visionRedrawingIds,
    visionRedrawingIds,
  );
  if (!ids.includes(id)) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
      <span className="size-6 animate-pulse rounded-full bg-white/80" />
    </div>
  );
}

function MenuButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
    return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-accent-soft"
    >
      {children}
    </button>
  );
}

function fitRect(
  imageAspect: number,
  target: number,
  center: VisionCrop,
  preset: VisionCropPreset,
): VisionCrop {
  let w: number;
  let h: number;
  if (target >= imageAspect) {
    w = 1;
    h = Math.min(1, imageAspect / target);
  } else {
    h = 1;
    w = Math.min(1, target / imageAspect);
  }
  const cx = center.x + center.w / 2;
  const cy = center.y + center.h / 2;
  return {
    preset,
    x: Math.min(Math.max(0, cx - w / 2), 1 - w),
    y: Math.min(Math.max(0, cy - h / 2), 1 - h),
    w,
    h,
  };
}

function CropDialog({
  item,
  url,
  onClose,
  onApply,
}: {
  item: VisionBoardItem;
  url?: string;
  onClose: () => void;
  onApply: (crop: VisionCrop | null, featured: boolean) => void;
}) {
  const imageAspect =
    item.width && item.height && item.height > 0 ? item.width / item.height : 1;
  const initial = item.crop ?? {
    preset: "free" as const,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  };
  const [preset, setPreset] = useState<VisionCropPreset | "original">(
    item.crop ? item.crop.preset : "original",
  );
  const [rect, setRect] = useState<VisionCrop>(initial);
  const [zoom, setZoom] = useState(100);
  const [featured, setFeatured] = useState(Boolean(item.featured));
  const frameRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    rect: VisionCrop;
    mode: "move" | "se";
  } | null>(null);

  const shown = (() => {
    const scale = 100 / zoom;
    const w = Math.min(rect.w, Math.max(0.08, rect.w * scale));
    const h = Math.min(rect.h, Math.max(0.08, rect.h * scale));
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return {
      ...rect,
      w,
      h,
      x: Math.min(Math.max(0, cx - w / 2), 1 - w),
      y: Math.min(Math.max(0, cy - h / 2), 1 - h),
    };
  })();

  const choose = (next: VisionCropPreset | "original") => {
    setPreset(next);
    setZoom(100);
    if (next === "original") {
      setRect({ preset: "free", x: 0, y: 0, w: 1, h: 1 });
      return;
    }
    const aspect = PRESET_ASPECT[next];
    if (!aspect) {
      setRect({ ...rect, preset: "free" });
      return;
    }
    setRect(fitRect(imageAspect, aspect, rect, next));
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - drag.current.x) / bounds.width;
    const dy = (event.clientY - drag.current.y) / bounds.height;
    const base = drag.current.rect;
    if (drag.current.mode === "se") {
      setPreset("free");
      setRect({
        ...base,
        preset: "free",
        w: Math.min(Math.max(0.08, base.w + dx), 1 - base.x),
        h: Math.min(Math.max(0.08, base.h + dy), 1 - base.y),
      });
    } else {
      setRect({
        ...base,
        x: Math.min(Math.max(0, base.x + dx), 1 - base.w),
        y: Math.min(Math.max(0, base.y + dy), 1 - base.h),
      });
    }
    setZoom(100);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/45 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-labelledby="vision-crop-title"
        className="flex w-full max-w-[620px] flex-col gap-4 rounded-t-[20px] bg-card px-6 py-6 sm:rounded-[20px] sm:px-[30px] sm:py-6"
      >
        <div className="flex items-center justify-between">
          <h2 id="vision-crop-title" className="font-display text-2xl text-foreground">
            Crop
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => choose(entry.id)}
              className={`inline-flex h-8 cursor-pointer items-center rounded-full px-[13px] text-[13px] font-semibold ${
                preset === entry.id
                  ? "bg-foreground text-background"
                  : "border border-border bg-card text-foreground"
              }`}
            >
              {entry.label}
            </button>
        ))}
      </div>
        <div
          className="relative mx-auto w-full overflow-hidden bg-black"
          style={{ aspectRatio: String(imageAspect) }}
          ref={frameRef}
          onPointerDown={(event) => {
            drag.current = { x: event.clientX, y: event.clientY, rect: shown, mode: "move" };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={move}
          onPointerUp={() => {
            drag.current = null;
          }}
        >
          {url ? (
            <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" />
          ) : (
            <div className="absolute inset-0" style={{ background: item.color }} />
          )}
          <div
            className="absolute border border-white"
            style={{
              left: `${shown.x * 100}%`,
              top: `${shown.y * 100}%`,
              width: `${shown.w * 100}%`,
              height: `${shown.h * 100}%`,
              boxShadow: "0 0 0 999px color-mix(in srgb, var(--foreground) 62%, transparent)",
            }}
          >
            <span className="absolute inset-y-0 left-1/3 w-px bg-white/45" />
            <span className="absolute inset-y-0 left-2/3 w-px bg-white/45" />
            <span className="absolute inset-x-0 top-1/3 h-px bg-white/45" />
            <span className="absolute inset-x-0 top-2/3 h-px bg-white/45" />
            <span className="absolute left-0 top-0 size-[18px] border-l-[3px] border-t-[3px] border-white" />
            <span className="absolute right-0 top-0 size-[18px] border-r-[3px] border-t-[3px] border-white" />
            <span className="absolute bottom-0 left-0 size-[18px] border-b-[3px] border-l-[3px] border-white" />
            <span
              className="absolute bottom-0 right-0 size-[18px] cursor-nwse-resize border-b-[3px] border-r-[3px] border-white"
              onPointerDown={(event) => {
                if (preset !== "free") return;
                event.stopPropagation();
                drag.current = {
                  x: event.clientX,
                  y: event.clientY,
                  rect: shown,
                  mode: "se",
                };
                frameRef.current?.setPointerCapture(event.pointerId);
              }}
      />
    </div>
        </div>
        <label className="flex items-center gap-3 text-[13px] font-semibold text-foreground">
          Zoom
          <input
            type="range"
            min={100}
            max={300}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-1 flex-1 accent-[var(--accent)]"
          />
          <span className="w-12 text-right">{zoom}%</span>
        </label>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-semibold text-foreground">Size on board</span>
          <div className="inline-flex rounded-full border border-border p-0.5">
            <button
              type="button"
              onClick={() => setFeatured(false)}
              className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-semibold ${featured ? "" : "bg-foreground text-background"}`}
            >
              Normal
            </button>
            <button
              type="button"
              onClick={() => setFeatured(true)}
              className={`h-8 cursor-pointer rounded-full px-3 text-[13px] font-semibold ${featured ? "bg-foreground text-background" : ""}`}
            >
              Feature
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setPreset("original");
              setZoom(100);
              setRect({ preset: "free", x: 0, y: 0, w: 1, h: 1 });
            }}
            className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-accent-link"
          >
            <RefreshCw className="size-3.5" />
            Reset to original
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 cursor-pointer items-center rounded-full border border-border px-4 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() =>
                onApply(preset === "original" && zoom === 100 ? null : shown, featured)
              }
              className="accent-fill-gradient inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold text-on-accent"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

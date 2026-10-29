import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Crop as CropIcon,
  GripVertical,
  Maximize2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";
import { Link } from "@/lib/spa-nav";
import { MIST } from "@/components/plan/life-area/kit";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { listLibraryMeditations, type LibraryMeditationItem } from "@/lib/medimade-api";
import { CropDialog } from "@/components/plan/vision-board-mosaic";
import {
  boardVisionItems,
  visionAreaId,
  visionImageStyleOf,
  type VisionBoardItem,
  type VisionCrop,
  type VisionImageStyle,
} from "@/lib/ideate-vision-board";
import {
  subscribeVisionRedrawing,
  subscribeVisionStyleProgress,
  visionRedrawingIds,
  visionStyleProgress,
} from "@/lib/vision-image-jobs";
import { lifeAreaHref } from "@/lib/entity-href";

export type VisionBoardArea = { id: string; title: string; visionText: string };

const HELP = "Don't like AI images of yourself? Use illustrations instead.";

function cropStyle(crop: VisionCrop | null | undefined): CSSProperties {
  if (!crop || crop.w <= 0 || crop.h <= 0) {
    return { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" };
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

function useRedrawing() {
  return useSyncExternalStore(subscribeVisionRedrawing, visionRedrawingIds, visionRedrawingIds);
}

function useStyleProgress() {
  return useSyncExternalStore(subscribeVisionStyleProgress, visionStyleProgress, visionStyleProgress);
}

export function VisionBoardAreas({
  items,
  tileUrls,
  lifeAreas,
  imageStyle,
  hydrated,
  freshId,
  onStyle,
  onUpload,
  onCreate,
  onCreateForArea,
  onToggleFavourite,
  onAdd,
  onRemove,
  onDropImage,
  onMoveArea,
  onApplyCrop,
  onMeasure,
  onNewTake,
  onVersions,
  onCaption,
}: {
  items: VisionBoardItem[];
  tileUrls: Record<string, string>;
  lifeAreas: VisionBoardArea[];
  imageStyle: VisionImageStyle;
  hydrated: boolean;
  freshId: string | null;
  onStyle: (style: VisionImageStyle) => void;
  onUpload: () => void;
  onCreate: () => void;
  onCreateForArea: (area: VisionBoardArea) => void;
  onToggleFavourite: (item: VisionBoardItem) => void;
  onAdd: (item: VisionBoardItem) => void;
  onRemove: (item: VisionBoardItem) => void;
  onDropImage: (itemId: string, areaId: string | null, index: number) => void;
  onMoveArea: (areaId: string, direction: -1 | 1) => void;
  onApplyCrop: (item: VisionBoardItem, crop: VisionCrop | null) => void;
  onMeasure: (item: VisionBoardItem, width: number, height: number) => void;
  onNewTake: (item: VisionBoardItem) => void;
  onVersions: (item: VisionBoardItem) => void;
  onCaption: (item: VisionBoardItem, caption: string) => void;
}) {
  const board = boardVisionItems(items);
  const library = items.filter(
    (item) => item.imageUrl?.trim() || item.mediaId?.trim() || tileUrls[item.id],
  );
  const [arrange, setArrange] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [cropFor, setCropFor] = useState<string | null>(null);
  const [captionFor, setCaptionFor] = useState<VisionBoardItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ areaId: string | null; index: number } | null>(null);
  const progress = useStyleProgress();
  const redrawing = useRedrawing();
  const shimmering = progress?.style === imageStyle ? redrawing : [];
  const cropItem = items.find((item) => item.id === cropFor) ?? null;

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuId]);

  const inArea = (areaId: string | null) =>
    board.filter((item) => visionAreaId(item) === areaId);

  const loose = board.filter((item) => !visionAreaId(item) || !lifeAreas.some((area) => area.id === visionAreaId(item)));

  return (
    <>
      <div className="rounded-[20px] border border-border bg-card shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]">
        <div className="flex flex-wrap items-center gap-3.5 px-5 pb-3.5 pt-4 sm:px-7">
          <div className="inline-flex rounded-xl bg-accent-soft p-[3px]" role="group" aria-label="Vision board images">
            {(["realistic", "illustrated"] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => style !== imageStyle && onStyle(style)}
                className={`h-8 cursor-pointer rounded-[9px] px-3.5 text-[13px] font-semibold ${
                  imageStyle === style ? "bg-card text-foreground shadow-sm" : "text-foreground/70"
                }`}
              >
                {style === "realistic" ? "Photorealistic" : "Illustrated"}
              </button>
            ))}
          </div>
          <p className="min-w-0 flex-1 text-[12.5px] text-foreground/80">{HELP}</p>
          {progress && progress.total > 0 ? (
            <p className="text-xs font-semibold text-accent-link">
              {progress.style === "illustrated" ? "Illustrating" : "Making"} {progress.done} of {progress.total}
              {progress.style === "illustrated" ? "…" : " photorealistic…"}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setFull(true)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 text-[13px] font-semibold"
          >
            <Maximize2 className="size-3.5" />
            View full screen
          </button>
        </div>

        {!hydrated ? (
          <div className="mx-5 mb-5 h-40 animate-pulse rounded-lg bg-accent-soft sm:mx-7" />
        ) : (
          <>
            {lifeAreas.map((area, areaIndex) => (
              <AreaSection
                key={area.id}
                area={area}
                items={inArea(area.id)}
                tileUrls={tileUrls}
                arrange={arrange}
                areaIndex={areaIndex}
                areaCount={lifeAreas.length}
                menuId={menuId}
                dragId={dragId}
                dropAt={dropAt}
                freshId={freshId}
                redrawing={shimmering}
                onCreate={() => onCreateForArea(area)}
                onMoveArea={onMoveArea}
                onOpenMenu={setMenuId}
                onFavourite={onToggleFavourite}
                onCrop={setCropFor}
                onRemove={onRemove}
                onNewTake={onNewTake}
                onVersions={onVersions}
                onCaption={setCaptionFor}
                onMeasure={onMeasure}
                onDragStart={setDragId}
                onDragEnd={() => {
                  setDragId(null);
                  setDropAt(null);
                }}
                onOver={setDropAt}
                onDrop={() => {
                  if (dragId && dropAt) onDropImage(dragId, dropAt.areaId, dropAt.index);
                  setDragId(null);
                  setDropAt(null);
                }}
              />
            ))}
            {loose.length > 0 || arrange ? (
              <AreaSection
                area={null}
                items={loose}
                tileUrls={tileUrls}
                arrange={arrange}
                areaIndex={-1}
                areaCount={0}
                menuId={menuId}
                dragId={dragId}
                dropAt={dropAt}
                freshId={freshId}
                redrawing={shimmering}
                onCreate={() => onCreate()}
                onMoveArea={onMoveArea}
                onOpenMenu={setMenuId}
                onFavourite={onToggleFavourite}
                onCrop={setCropFor}
                onRemove={onRemove}
                onNewTake={onNewTake}
                onVersions={onVersions}
                onCaption={setCaptionFor}
                onMeasure={onMeasure}
                onDragStart={setDragId}
                onDragEnd={() => {
                  setDragId(null);
                  setDropAt(null);
                }}
                onOver={setDropAt}
                onDrop={() => {
                  if (dragId && dropAt) onDropImage(dragId, dropAt.areaId, dropAt.index);
                  setDragId(null);
                  setDropAt(null);
                }}
              />
            ) : null}
          </>
        )}
      </div>

      <div className="fixed bottom-[calc(58px+env(safe-area-inset-bottom,0px)+12px)] left-1/2 z-30 flex max-w-[calc(100%-28px)] -translate-x-1/2 items-center gap-2 overflow-x-auto rounded-full border border-border bg-card px-2 py-2 shadow-[0_8px_24px_rgb(15_27_45_/_0.12)] md:bottom-6">
        {arrange ? (
          <>
            <p className="whitespace-nowrap px-3 text-[13px] text-foreground/80">
              Drag images within or between areas · reorder areas with the handles
            </p>
            <button
              type="button"
              onClick={() => setArrange(false)}
              className="h-9 shrink-0 cursor-pointer rounded-full bg-foreground px-4 text-[13px] font-semibold text-background"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onCreate}
              className="accent-fill-gradient inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-on-accent"
            >
              <Sparkles className="size-4" />
              Create image
            </button>
            <button
              type="button"
              onClick={onUpload}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-semibold"
            >
              <Upload className="size-4" />
              Upload
            </button>
            <button
              type="button"
              onClick={() => setArrange(true)}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border px-3.5 text-sm font-semibold"
            >
              <GripVertical className="size-4" />
              Arrange
            </button>
            <span className="h-6 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-full px-3 text-sm font-semibold"
            >
              Library · {library.length}
            </button>
          </>
        )}
      </div>

      {libraryOpen ? (
        <LibraryDrawer
          items={library}
          board={board}
          lifeAreas={lifeAreas}
          tileUrls={tileUrls}
          onClose={() => setLibraryOpen(false)}
          onAdd={onAdd}
          onDragStart={setDragId}
        />
      ) : null}

      {full ? (
        <FullScreen
          board={board}
          lifeAreas={lifeAreas}
          tileUrls={tileUrls}
          onClose={() => setFull(false)}
        />
      ) : null}

      {cropItem ? (
        <CropDialog
          item={cropItem}
          url={tileUrls[cropItem.id] || cropItem.imageUrl}
          onClose={() => setCropFor(null)}
          onApply={(crop) => {
            onApplyCrop(cropItem, crop);
            setCropFor(null);
          }}
        />
      ) : null}

      {captionFor ? (
        <CaptionDialog
          item={captionFor}
          onClose={() => setCaptionFor(null)}
          onSave={(caption) => {
            onCaption(captionFor, caption);
            setCaptionFor(null);
          }}
        />
      ) : null}
    </>
  );
}

function AreaSection({
  area,
  items,
  tileUrls,
  arrange,
  areaIndex,
  areaCount,
  menuId,
  dragId,
  dropAt,
  freshId,
  redrawing,
  onCreate,
  onMoveArea,
  onOpenMenu,
  onFavourite,
  onCrop,
  onRemove,
  onNewTake,
  onVersions,
  onCaption,
  onMeasure,
  onDragStart,
  onDragEnd,
  onOver,
  onDrop,
}: {
  area: VisionBoardArea | null;
  items: VisionBoardItem[];
  tileUrls: Record<string, string>;
  arrange: boolean;
  areaIndex: number;
  areaCount: number;
  menuId: string | null;
  dragId: string | null;
  dropAt: { areaId: string | null; index: number } | null;
  freshId: string | null;
  redrawing: string[];
  onCreate: () => void;
  onMoveArea: (areaId: string, direction: -1 | 1) => void;
  onOpenMenu: (id: string | null) => void;
  onFavourite: (item: VisionBoardItem) => void;
  onCrop: (id: string) => void;
  onRemove: (item: VisionBoardItem) => void;
  onNewTake: (item: VisionBoardItem) => void;
  onVersions: (item: VisionBoardItem) => void;
  onCaption: (item: VisionBoardItem) => void;
  onMeasure: (item: VisionBoardItem, width: number, height: number) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onOver: (target: { areaId: string | null; index: number }) => void;
  onDrop: () => void;
}) {
  const areaId = area?.id ?? null;
  const lead = items[0] ?? null;
  const rest = items.slice(1);
  const stacked = rest.length >= 4;
  const showBar = dropAt?.areaId === areaId;

  return (
    <section
      className="border-t border-border px-5 py-[22px] first:border-t-0 sm:px-7 lg:flex lg:gap-6"
      onDragOver={(event) => {
        if (!dragId) return;
        event.preventDefault();
        onOver({ areaId, index: items.length });
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      {area ? (
        <div className="mb-3 w-full shrink-0 lg:mb-0 lg:w-[300px]">
          {arrange ? (
            <div className="mb-2 flex items-center gap-1">
              <span className="inline-flex size-7 items-center justify-center rounded-md border border-border">
                <GripVertical className="size-3.5" />
              </span>
              <button
                type="button"
                disabled={areaIndex <= 0}
                onClick={() => onMoveArea(area.id, -1)}
                className="h-7 cursor-pointer rounded-md border border-border px-2 text-[11px] font-semibold disabled:opacity-40"
              >
                Move up
              </button>
              <button
                type="button"
                disabled={areaIndex >= areaCount - 1}
                onClick={() => onMoveArea(area.id, 1)}
                className="h-7 cursor-pointer rounded-md border border-border px-2 text-[11px] font-semibold disabled:opacity-40"
              >
                Move down
              </button>
            </div>
          ) : null}
          <Link
            href={lifeAreaHref(area)}
            className="inline-flex items-center gap-0.5 text-[12px] font-bold uppercase tracking-[1.6px] text-accent-link"
          >
            {area.title}
            <ChevronRight className="size-3.5" strokeWidth={2} />
          </Link>
          {area.visionText ? (
            <p className="mt-2 font-display text-lg leading-[1.3] text-foreground sm:text-[22px]">
              {area.visionText}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted">
            {items.length === 1 ? "1 image" : `${items.length} images`}
          </p>
        </div>
      ) : (
        <div className="mb-3 lg:hidden" />
      )}

      <div className="min-w-0 flex-1">
        {items.length === 0 && area ? (
          <button
            type="button"
            onClick={onCreate}
            className="flex h-[150px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-accent text-[13px]"
          >
            <Sparkles className="size-[18px]" strokeWidth={1.8} />
            <span className="font-semibold text-foreground">Create an image for {area.title}</span>
            <span className="text-xs text-muted">or add one from your library</span>
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {showBar && dropAt?.index === 0 ? <DropBar /> : null}
            {lead ? (
              <BoardTile
                item={lead}
                url={tileUrls[lead.id] || lead.imageUrl}
                lead
                wide
                arrange={arrange}
                fresh={freshId === lead.id}
                busy={redrawing.includes(lead.id)}
                menuOpen={menuId === lead.id}
                onOpenMenu={() => onOpenMenu(menuId === lead.id ? null : lead.id)}
                onFavourite={() => onFavourite(lead)}
                onCrop={() => onCrop(lead.id)}
                onRemove={() => onRemove(lead)}
                onNewTake={() => onNewTake(lead)}
                onVersions={() => onVersions(lead)}
                onCaption={() => onCaption(lead)}
                onMeasure={onMeasure}
                onDragStart={() => onDragStart(lead.id)}
                onDragEnd={onDragEnd}
                dragging={dragId === lead.id}
              />
            ) : null}
            {stacked
              ? chunk(rest, 2).map((pair, column) => (
                  <div key={pair[0]!.id} className="flex flex-col gap-2">
                    {pair.map((item, row) => (
                      <BoardTile
                        key={item.id}
                        item={item}
                        url={tileUrls[item.id] || item.imageUrl}
                        square
                        arrange={arrange}
                        fresh={freshId === item.id}
                        busy={redrawing.includes(item.id)}
                        menuOpen={menuId === item.id}
                        onOpenMenu={() => onOpenMenu(menuId === item.id ? null : item.id)}
                        onFavourite={() => onFavourite(item)}
                        onCrop={() => onCrop(item.id)}
                        onRemove={() => onRemove(item)}
                        onNewTake={() => onNewTake(item)}
                        onVersions={() => onVersions(item)}
                        onCaption={() => onCaption(item)}
                        onMeasure={onMeasure}
                        onDragStart={() => onDragStart(item.id)}
                        onDragEnd={onDragEnd}
                        dragging={dragId === item.id}
                        onOver={() => onOver({ areaId, index: 1 + column * 2 + row })}
                      />
                    ))}
                  </div>
                ))
              : rest.map((item, index) => (
                  <BoardTile
                    key={item.id}
                    item={item}
                    url={tileUrls[item.id] || item.imageUrl}
                    arrange={arrange}
                    fresh={freshId === item.id}
                    busy={redrawing.includes(item.id)}
                    menuOpen={menuId === item.id}
                    onOpenMenu={() => onOpenMenu(menuId === item.id ? null : item.id)}
                    onFavourite={() => onFavourite(item)}
                    onCrop={() => onCrop(item.id)}
                    onRemove={() => onRemove(item)}
                    onNewTake={() => onNewTake(item)}
                    onVersions={() => onVersions(item)}
                    onCaption={() => onCaption(item)}
                    onMeasure={onMeasure}
                    onDragStart={() => onDragStart(item.id)}
                    onDragEnd={onDragEnd}
                    dragging={dragId === item.id}
                    onOver={() => onOver({ areaId, index: index + 1 })}
                  />
                ))}
            {showBar && dropAt && dropAt.index >= items.length ? <DropBar /> : null}
          </div>
        )}
      </div>
    </section>
  );
}

function DropBar() {
  return <span className="h-1 w-8 self-center rounded-full bg-accent" />;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function BoardTile({
  item,
  url,
  lead,
  wide,
  square,
  arrange,
  fresh,
  busy,
  menuOpen,
  dragging,
  onOpenMenu,
  onFavourite,
  onCrop,
  onRemove,
  onNewTake,
  onVersions,
  onCaption,
  onMeasure,
  onDragStart,
  onDragEnd,
  onOver,
}: {
  item: VisionBoardItem;
  url?: string;
  lead?: boolean;
  wide?: boolean;
  square?: boolean;
  arrange: boolean;
  fresh: boolean;
  busy: boolean;
  menuOpen: boolean;
  dragging: boolean;
  onOpenMenu: () => void;
  onFavourite: () => void;
  onCrop: () => void;
  onRemove: () => void;
  onNewTake: () => void;
  onVersions: () => void;
  onCaption: () => void;
  onMeasure: (item: VisionBoardItem, width: number, height: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOver?: () => void;
}) {
  const size = square
    ? "h-[100px] w-[calc(50%-4px)] sm:h-[116px] sm:w-[116px]"
    : wide
      ? "h-[190px] w-full sm:h-[240px] sm:w-[320px]"
      : "h-[100px] w-[calc(50%-4px)] sm:h-[240px] sm:w-[180px]";
  return (
    <div
      id={`vision-tile-${item.id}`}
      draggable={arrange}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        if (!onOver) return;
        event.preventDefault();
        event.stopPropagation();
        onOver();
      }}
      className={`group relative shrink-0 overflow-hidden rounded-[10px] ${size} ${
        fresh ? "ring-2 ring-accent" : "hover:ring-2 hover:ring-accent"
      } ${dragging ? "opacity-40" : ""}`}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="absolute"
          style={cropStyle(item.crop)}
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth > 0) onMeasure(item, img.naturalWidth, img.naturalHeight);
          }}
        />
      ) : (
        <span className="absolute inset-0 bg-accent-soft" />
      )}
      {busy ? <span className="absolute inset-0 animate-pulse bg-white/35" /> : null}
      {item.favourite ? (
        <Star className="absolute right-2 top-2 size-5 fill-accent text-accent" />
      ) : null}
      {lead && arrange ? (
        <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
          ★ Leads
        </span>
      ) : null}
      {(lead || arrange) && item.caption ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2.5 pb-2 pt-6 text-sm font-semibold text-white">
          {item.caption}
        </p>
      ) : item.caption ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-5 text-xs font-semibold text-white group-hover:block">
          {item.caption}
        </p>
      ) : null}
      <div className={`absolute right-1.5 top-1.5 flex gap-1 ${arrange || menuOpen ? "" : "hidden group-hover:flex"}`}>
        {arrange ? (
          <button type="button" aria-label="Crop" onClick={onCrop} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/90">
            <CropIcon className="size-3.5" />
          </button>
        ) : null}
        <button type="button" aria-label="More" onClick={onOpenMenu} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/90">
          <MoreHorizontal className="size-3.5" />
        </button>
        <button type="button" aria-label={item.favourite ? "Unfavourite" : "Favourite"} onClick={onFavourite} className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/90">
          <Star className={`size-3.5 ${item.favourite ? "fill-accent text-accent" : ""}`} />
        </button>
      </div>
      {arrange ? (
        <span className="absolute left-1.5 top-1.5 inline-flex size-7 items-center justify-center rounded-md bg-white/90">
          <GripVertical className="size-3.5" />
        </span>
      ) : null}
      {menuOpen ? (
        <TileMenu
          item={item}
          onNewTake={onNewTake}
          onVersions={onVersions}
          onCaption={onCaption}
          onFavourite={onFavourite}
          onRemove={onRemove}
          onClose={() => onOpenMenu()}
        />
      ) : null}
    </div>
  );
}

function TileMenu({
  item,
  onNewTake,
  onVersions,
  onCaption,
  onFavourite,
  onRemove,
  onClose,
}: {
  item: VisionBoardItem;
  onNewTake: () => void;
  onVersions: () => void;
  onCaption: () => void;
  onFavourite: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const versions = (item.versions?.length ?? 0) + 1;
  const run = (fn: () => void) => {
    onClose();
    fn();
  };
  return (
    <div
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      className="absolute right-2 top-10 z-20 w-[220px] rounded-xl border border-border bg-card p-1.5 shadow-lg"
    >
      {item.prompt?.trim() ? <MenuButton onClick={() => run(onNewTake)}>New take</MenuButton> : null}
      {versions > 1 ? <MenuButton onClick={() => run(onVersions)}>Versions ({versions})</MenuButton> : null}
      <MenuButton onClick={() => run(onCaption)}>Edit caption</MenuButton>
      <MenuButton onClick={() => run(onFavourite)}>{item.favourite ? "Unfavourite" : "Favourite"}</MenuButton>
      <MenuButton onClick={() => run(onRemove)}>Remove from board</MenuButton>
    </div>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-accent-soft">
      {children}
    </button>
  );
}

function LibraryDrawer({
  items,
  board,
  lifeAreas,
  tileUrls,
  onClose,
  onAdd,
  onDragStart,
}: {
  items: VisionBoardItem[];
  board: VisionBoardItem[];
  lifeAreas: VisionBoardArea[];
  tileUrls: Record<string, string>;
  onClose: () => void;
  onAdd: (item: VisionBoardItem) => void;
  onDragStart: (id: string) => void;
}) {
  const [filter, setFilter] = useState<string>("all");
  const onBoard = new Set(board.map((item) => item.id));
  const shown = items.filter((item) => {
    if (filter === "off") return !onBoard.has(item.id);
    if (filter === "favourites") return item.favourite;
    if (filter !== "all") return visionAreaId(item) === filter;
    return true;
  });
  const count = (id: string) =>
    id === "all"
      ? items.length
      : id === "off"
        ? items.filter((item) => !onBoard.has(item.id)).length
        : id === "favourites"
          ? items.filter((item) => item.favourite).length
          : items.filter((item) => visionAreaId(item) === id).length;

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 md:items-stretch md:justify-end">
      <button type="button" aria-label="Close library" className="absolute inset-0 cursor-default" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full flex-col rounded-t-[20px] bg-card md:mt-16 md:h-[calc(100%-4rem)] md:max-h-none md:w-[460px] md:rounded-none">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-display text-2xl">Library</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto px-5 pb-3">
          {(
            [
              ["all", "All"],
              ["off", "Not on board"],
              ["favourites", "Favourites"],
              ...lifeAreas.map((area) => [area.id, area.title] as const),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={`inline-flex h-[34px] shrink-0 cursor-pointer items-center rounded-full px-3.5 text-[13px] font-semibold ${
                filter === id ? "bg-foreground text-background" : "border border-border bg-card"
              }`}
            >
              {label} <span className="ml-1 opacity-70">{count(id)}</span>
            </button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-2 overflow-y-auto px-5 pb-4">
          {shown.map((item) => {
            const placed = onBoard.has(item.id);
            const src = tileUrls[item.id] || item.imageUrl;
            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => onDragStart(item.id)}
                className="relative h-[120px] overflow-hidden rounded-[10px]"
              >
                {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <span className="block h-full bg-accent-soft" />}
                {placed ? (
                  <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
                    <Check className="size-3" /> On board
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAdd(item)}
                    className="absolute bottom-2 left-2 inline-flex cursor-pointer items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold"
                  >
                    <Plus className="size-3" /> Add to board
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="px-5 pb-4 text-xs text-muted">
          Drag onto the board, or Add to board. It goes under its life area, or at the end if it has none.
        </p>
      </div>
    </div>
  );
}

function FullScreen({
  board,
  lifeAreas,
  tileUrls,
  onClose,
}: {
  board: VisionBoardItem[];
  lifeAreas: VisionBoardArea[];
  tileUrls: Record<string, string>;
  onClose: () => void;
}) {
  const order = slideshowOrder(board, lifeAreas);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [meditations, setMeditations] = useState<LibraryMeditationItem[]>([]);
  const { playItem, toggleCurrent, nowPlaying, playingS3Key, playbackTimeSeconds } =
    useLibraryPlayer();
  const item = order[index] ?? null;
  const area = item ? lifeAreas.find((entry) => entry.id === visionAreaId(item)) : undefined;
  const meditation = latestAreaMeditation(meditations, area?.id);
  const meditationPlaying =
    Boolean(meditation) &&
    nowPlaying?.s3Key === meditation?.s3Key &&
    playingS3Key === meditation?.s3Key;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    void listLibraryMeditations()
      .then((rows) => {
        if (!cancel) setMeditations(rows);
      })
      .catch(() => {
        if (!cancel) setMeditations([]);
      });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (paused || order.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % order.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [paused, order.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex((current) => (current + 1) % order.length);
      if (event.key === "ArrowLeft") setIndex((current) => (current - 1 + order.length) % order.length);
      if (event.key === " ") {
        event.preventDefault();
        setPaused((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, order.length]);

  if (!item || typeof document === "undefined") return null;
  const src = tileUrls[item.id] || item.imageUrl || "";
  const dream = area?.visionText?.trim() ?? "";
  const count = `${index + 1} of ${order.length}`;

  const onMeditation = () => {
    if (!meditation) return;
    if (nowPlaying?.s3Key === meditation.s3Key) toggleCurrent();
    else playItem(meditation);
  };

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 top-[var(--app-header-h)] z-[220] flex bg-[rgba(10,14,24,0.5)] p-3 backdrop-blur-[2px] md:px-16 md:py-14"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vision board"
        className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[20px] bg-[#0E1626] text-[#F6F1E7] shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          const x = event.changedTouches[0]?.clientX ?? 0;
          event.currentTarget.dataset.x = String(x);
        }}
        onTouchEnd={(event) => {
          const start = Number(event.currentTarget.dataset.x || 0);
          const end = event.changedTouches[0]?.clientX ?? start;
          if (end - start > 40) setIndex((current) => (current - 1 + order.length) % order.length);
          if (start - end > 40) setIndex((current) => (current + 1) % order.length);
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/[0.08] md:right-3.5 md:top-3.5 md:size-10"
        >
          <X className="size-[17px]" strokeWidth={1.8} />
        </button>
        <WholeImage src={src} />
        <div className="flex flex-col gap-2 bg-[#121C30] px-[18px] pb-4 pt-[18px] md:hidden">
          <SlideWords area={area?.title} count={count} dream={dream} caption={item.caption} mobile />
          <div className="mt-auto flex items-center justify-between">
            <Dots order={order} index={index} onPick={setIndex} />
            <Round
              icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />}
              label={paused ? "Play" : "Pause"}
              onClick={() => setPaused((value) => !value)}
            />
          </div>
          {meditation && area ? (
            <button
              type="button"
              onClick={onMeditation}
              className={`${MIST} mt-1 h-[42px] w-full text-sm`}
            >
              {meditationPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" fill="currentColor" />}
              {meditationPlaying
                ? pauseLabel(meditation.durationSeconds, playbackTimeSeconds)
                : `Play meditation · ${lengthLabel(meditation.durationSeconds)}`}
            </button>
          ) : null}
        </div>
        <div className="hidden min-h-40 items-center gap-7 border-t border-white/[0.08] bg-[#121C30] px-7 py-[22px] md:flex">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <SlideWords area={area?.title} count={count} dream={dream} caption={item.caption} />
          </div>
          {meditation && area ? (
            <div className="flex max-w-[420px] shrink-0 items-center gap-3 rounded-[14px] border border-white/12 bg-white/[0.06] p-2">
              <span className="size-10 shrink-0 overflow-hidden rounded-[9px] bg-white/10">
                {meditation.coverImageUrl || meditation.speakerPortraitUrl ? (
                  <img
                    src={meditation.coverImageUrl || meditation.speakerPortraitUrl || ""}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : null}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[15px]">{meditation.title}</span>
                <span className="text-xs text-[#F6F1E7]/60">
                  {lengthLabel(meditation.durationSeconds)} · from {area.title}
                </span>
              </span>
              <button type="button" onClick={onMeditation} className={`${MIST} h-10 shrink-0 px-4 text-sm`}>
                {meditationPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" fill="currentColor" />}
                {meditationPlaying
                  ? pauseLabel(meditation.durationSeconds, playbackTimeSeconds)
                  : "Play meditation"}
              </button>
            </div>
          ) : null}
          <div className="flex shrink-0 flex-col items-end gap-3">
            <Dots order={order} index={index} onPick={setIndex} />
            <div className="flex gap-2">
              <Round icon={<ChevronLeft className="size-4" />} label="Previous" onClick={() => setIndex((current) => (current - 1 + order.length) % order.length)} />
              <Round icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />} label={paused ? "Play" : "Pause"} onClick={() => setPaused((value) => !value)} />
              <Round icon={<ChevronRight className="size-4" />} label="Next" onClick={() => setIndex((current) => (current + 1) % order.length)} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WholeImage({ src }: { src: string }) {
  const shown = useRef(src);
  const [fade, setFade] = useState<{ from: string | null; to: string }>({ from: null, to: src });
  const [showTo, setShowTo] = useState(true);

  useEffect(() => {
    if (!src || src === shown.current) return;
    const from = shown.current;
    shown.current = src;
    setShowTo(false);
    setFade({ from, to: src });
    const frame = requestAnimationFrame(() => setShowTo(true));
    const timer = window.setTimeout(() => setFade((current) => ({ from: null, to: current.to })), 700);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [src]);

  return (
    <div className="relative flex min-h-[200px] min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#0E1626]">
      {fade.from ? <StagePicture src={fade.from} shown={!showTo} /> : null}
      {fade.to ? <StagePicture src={fade.to} shown={showTo} /> : null}
    </div>
  );
}

function StagePicture({ src, shown }: { src: string; shown: boolean }) {
  return (
    <div className={`absolute inset-0 transition-opacity duration-700 ${shown ? "opacity-100" : "opacity-0"}`}>
      <img
        src={src}
        alt=""
        aria-hidden
        className="pointer-events-none absolute -inset-10 h-[calc(100%+5rem)] w-[calc(100%+5rem)] max-w-none object-cover brightness-[0.45] saturate-110 blur-[36px]"
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <img src={src} alt="" className="max-h-full max-w-full object-contain shadow-[0_20px_60px_rgba(0,0,0,0.45)]" />
      </div>
    </div>
  );
}

function SlideWords({
  area,
  count,
  dream,
  caption,
  mobile = false,
}: {
  area?: string;
  count: string;
  dream: string;
  caption?: string;
  mobile?: boolean;
}) {
  const long = dream.length > 80;
  return (
    <>
      <p className={`font-bold uppercase text-accent ${mobile ? "text-[11px] tracking-[1.4px]" : "text-xs tracking-[1.5px]"}`}>
        {area || "Vision"}
        <span className="font-medium normal-case tracking-normal text-[#F6F1E7]/45"> · {count}</span>
      </p>
      {dream ? (
        <p
          className={`font-display leading-[1.3] ${
            mobile ? "text-[18px]" : long ? "text-[21px]" : "text-2xl"
          }`}
        >
          {dream}
        </p>
      ) : null}
      {caption ? (
        <p className={mobile ? "text-xs text-[#F6F1E7]/65" : "text-[13px] text-[#F6F1E7]/65"}>{caption}</p>
      ) : null}
    </>
  );
}

function Dots({
  order,
  index,
  onPick,
}: {
  order: VisionBoardItem[];
  index: number;
  onPick: (index: number) => void;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {order.map((entry, dot) => (
        <button
          key={entry.id}
          type="button"
          aria-label={`Image ${dot + 1}`}
          onClick={() => onPick(dot)}
          className={`h-1.5 cursor-pointer rounded-full ${dot === index ? "w-[18px] bg-[#F6F1E7]" : "w-1.5 bg-[#F6F1E7]/35"}`}
        />
      ))}
    </span>
  );
}

function latestAreaMeditation(
  rows: LibraryMeditationItem[],
  areaId: string | undefined,
): LibraryMeditationItem | null {
  if (!areaId) return null;
  const matches = rows.filter(
    (row) => !row.archived && !row.isDraft && row.lifeAreaId === areaId,
  );
  matches.sort(
    (a, b) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
  );
  return matches[0] ?? null;
}

function lengthLabel(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "Meditation";
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

function pauseLabel(seconds: number | null | undefined, elapsed: number): string {
  const left = timeLeftLabel(seconds, elapsed);
  return left ? `Pause · ${left} left` : "Pause";
}

function timeLeftLabel(seconds: number | null | undefined, elapsed: number): string {
  if (!seconds || seconds <= 0) return "";
  const left = Math.max(0, Math.round(seconds - elapsed));
  const minutes = Math.floor(left / 60);
  const remain = left % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function Round({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/[0.08] text-[#F6F1E7]">
      {icon}
    </button>
  );
}

function slideshowOrder(board: VisionBoardItem[], areas: VisionBoardArea[]): VisionBoardItem[] {
  const rank = new Map(areas.map((area, index) => [area.id, index]));
  return board.slice().sort((a, b) => {
    const fav = Number(Boolean(b.favourite)) - Number(Boolean(a.favourite));
    if (fav) return fav;
    const left = rank.get(visionAreaId(a) ?? "") ?? 999;
    const right = rank.get(visionAreaId(b) ?? "") ?? 999;
    if (left !== right) return left - right;
    return (a.boardOrder ?? 0) - (b.boardOrder ?? 0);
  });
}

function CaptionDialog({
  item,
  onClose,
  onSave,
}: {
  item: VisionBoardItem;
  onClose: () => void;
  onSave: (caption: string) => void;
}) {
  const [value, setValue] = useState(item.caption ?? "");
  return (
    <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-md rounded-t-[20px] bg-card p-6 sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Edit caption</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="mt-4 h-11 w-full rounded-xl border border-border px-3 text-[15px]"
        />
        <button
          type="button"
          onClick={() => onSave(value.trim())}
          className="accent-fill-gradient mt-4 h-11 w-full cursor-pointer rounded-full text-sm font-semibold text-on-accent"
        >
          Save
        </button>
      </div>
    </div>
  );
}

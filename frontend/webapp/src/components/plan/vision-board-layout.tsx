import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronRight,
  GripVertical,
  Layers,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Upload,
  X,
} from "lucide-react";
import { LIGHT_ACCENT_BORDER } from "@/components/plan/manifesto-section";
import {
  boardVisionItems,
  VISION_COMPOSE_SLOT_COUNT,
  visionItemHasImage,
  type VisionBoardItem,
  type VisionExtraReference,
} from "@/lib/ideate-vision-board";

export type VisionArea = { id: string; title: string; visionText: string };

const EYEBROW =
  "text-xs font-semibold uppercase tracking-[1.6px] text-accent-link";
const CHIP_ON =
  "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background";
const CHIP_OFF =
  "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground";
const DARK_CHIP =
  "inline-flex h-6 items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--foreground)_55%,transparent)] px-[9px] text-[11px] font-semibold text-white backdrop-blur-sm";

type StatusFilter = "all" | "favourites" | "on" | "off";

function srcOf(item: VisionBoardItem, urls: Record<string, string>): string | null {
  return (
    (typeof item.imageUrl === "string" && item.imageUrl.trim()) ||
    urls[item.id] ||
    null
  );
}

function areaName(item: VisionBoardItem, areas: VisionArea[]): string | null {
  const id = item.lifeAreaIds?.[0];
  if (!id) return null;
  return areas.find((area) => area.id === id)?.title ?? null;
}

function draftScene(area: VisionArea, names: string[]): string {
  const vision = area.visionText.replace(/\s+/g, " ").trim();
  const sentence = vision
    ? vision.split(/(?<=[.!?])\s/)[0]!
    : `I am in a clear, present moment of my ${area.title} life.`;
  const body = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  const lead = /^i\b/i.test(body) ? body : `I am there. ${body}`;
  if (!names.length) return lead;
  return `${lead.replace(/[.!?]$/, "")}, with ${names.join(" and ")}.`;
}

export function VisionBoardLayout({
  items,
  tileUrls,
  lifeAreas,
  hydrated,
  busy,
  error,
  scenePrompt,
  onScenePrompt,
  onGenerate,
  onUploadClick,
  onToggleFavourite,
  onPlace,
  onRemoveFromBoard,
  onAddToBoard,
  onNewTake,
  onUseVersion,
  freshId,
  selfPreviewUrl,
  hasReference,
  extraRefs,
  extraPreviewUrls,
  onPickSelf,
  onClearSelf,
  onPickExtra,
  onClearExtra,
  onExtraDescription,
  selfFileName,
}: {
  items: VisionBoardItem[];
  tileUrls: Record<string, string>;
  lifeAreas: VisionArea[];
  hydrated: boolean;
  busy: string | null;
  error: string | null;
  scenePrompt: string;
  onScenePrompt: (value: string) => void;
  onGenerate: (areaId: string | null) => void;
  onUploadClick: () => void;
  onToggleFavourite: (item: VisionBoardItem) => void;
  onPlace: (itemId: string, slot: number) => void;
  onRemoveFromBoard: (item: VisionBoardItem) => void;
  onAddToBoard: (item: VisionBoardItem) => void;
  onNewTake: (item: VisionBoardItem) => Promise<{ versionId: string } | null>;
  onUseVersion: (item: VisionBoardItem, versionId: string) => void;
  freshId: string | null;
  selfPreviewUrl: string | null;
  hasReference: boolean;
  extraRefs: VisionExtraReference[];
  extraPreviewUrls: Record<string, string>;
  onPickSelf: () => void;
  onClearSelf: () => void;
  onPickExtra: () => void;
  onClearExtra: (id: string) => void;
  onExtraDescription: (id: string, value: string) => void;
  selfFileName: string | null;
}) {
  const images = items.filter(visionItemHasImage);
  const board = boardVisionItems(items);
  const boardIds = new Set(board.map((item) => item.id));
  const favourites = images.filter((item) => item.favourite).length;
  const libraryRef = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [createArea, setCreateArea] = useState<string | null>(null);
  const [drafted, setDrafted] = useState(false);
  const [draftAreaName, setDraftAreaName] = useState("");
  const [over, setOver] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [take, setTake] = useState<{
    itemId: string;
    phase: "making" | "ready";
    versionId: string | null;
    selected: string;
  } | null>(null);

  useEffect(() => {
    if (!menuId) return;
    const close = () => setMenuId(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuId]);

  const openLibrary = (next: StatusFilter, nextArea: string | null) => {
    setStatus(next);
    setAreaId(nextArea);
    libraryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openCreate = (area: VisionArea | null, prefill: boolean) => {
    setCreateArea(area?.id ?? null);
    if (prefill && area) {
      const names = [
        ...(hasReference ? ["you"] : []),
        ...extraRefs.map((ref) => ref.description.trim()).filter(Boolean),
      ];
      onScenePrompt(draftScene(area, names));
      setDrafted(true);
      setDraftAreaName(area.title);
    } else {
      setDrafted(false);
    }
    setCreateOpen(true);
  };

  const counts = `${board.length} on your board${
    favourites ? ` · ${favourites} favourite${favourites === 1 ? "" : "s"}` : ""
  }`;

  const uncovered = lifeAreas.find(
    (area) =>
      !board.some((item) => (item.lifeAreaIds ?? []).includes(area.id)),
  );
  const emptyAt = board.length < VISION_COMPOSE_SLOT_COUNT ? board.length : -1;

  const filtered = images.filter((item) => {
    if (status === "favourites" && !item.favourite) return false;
    if (status === "on" && !boardIds.has(item.id)) return false;
    if (status === "off" && boardIds.has(item.id)) return false;
    if (areaId && !(item.lifeAreaIds ?? []).includes(areaId)) return false;
    return true;
  });

  const startTake = async (item: VisionBoardItem) => {
    setMenuId(null);
    setTake({
      itemId: item.id,
      phase: "making",
      versionId: null,
      selected: "current",
    });
    const result = await onNewTake(item);
    if (!result) {
      setTake(null);
      return;
    }
    setTake({
      itemId: item.id,
      phase: "ready",
      versionId: result.versionId,
      selected: result.versionId,
    });
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10 sm:pt-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-normal leading-none text-foreground sm:text-[30px]">
            Vision board
          </h1>
          <p className="mt-1.5 text-sm text-foreground">
            {counts}
            <span className="hidden sm:inline">
              {` · ${images.length} in your library`}
            </span>
          </p>
        </div>
        <div className="hidden items-center gap-2.5 sm:flex">
          <button
            type="button"
            onClick={onUploadClick}
            disabled={busy !== null}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-foreground disabled:opacity-40"
          >
            <Upload className="size-4" strokeWidth={1.8} />
            Upload
          </button>
          <button
            type="button"
            onClick={() => openCreate(null, false)}
            className="accent-fill-gradient inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold text-on-accent"
          >
            <Sparkles className="size-4" strokeWidth={1.8} />
            Create image
          </button>
        </div>
      </div>

      <section className="mt-[22px]">
        <h2 className={EYEBROW}>Your board</h2>
        <p className="mt-1.5 text-sm text-foreground">
          Drag to reorder. Favourites lead on your Manifesto, story and poster.
        </p>
        {lifeAreas.length > 0 ? (
          <div className="mt-3.5 flex items-center gap-2 overflow-x-auto sm:flex-wrap">
            <span className="shrink-0 text-xs font-semibold text-muted">
              Areas on your board
            </span>
            {lifeAreas.map((area) => {
              const n = board.filter((item) =>
                (item.lifeAreaIds ?? []).includes(area.id),
              ).length;
              const covered = n > 0;
              return (
                <button
                  key={area.id}
                  type="button"
                  onClick={() =>
                    covered
                      ? openLibrary("all", area.id)
                      : openCreate(area, true)
                  }
                  className={
                    covered
                      ? "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground"
                      : `inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-dashed bg-accent-soft px-3.5 text-[13px] font-semibold text-accent-link ${LIGHT_ACCENT_BORDER}`
                  }
                >
                  {area.title}
                  <span className={covered ? "text-muted" : ""}>
                    {covered ? n : "0"}
                  </span>
                  {covered ? null : <Plus className="size-3.5" strokeWidth={1.8} />}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-2.5">
          {Array.from({ length: VISION_COMPOSE_SLOT_COUNT }, (_, slot) => {
            const item = board[slot] ?? null;
            if (!item) {
              if (slot !== emptyAt) {
                return (
                  <div
                    key={`empty-${slot}`}
                    className="h-[150px] rounded-xl bg-accent-soft sm:h-[190px]"
                  />
                );
              }
              if (uncovered) {
                return (
                  <div
                    key="suggest"
                    className={`flex h-[150px] flex-col gap-2 rounded-xl border-[1.5px] border-dashed bg-accent-soft p-4 sm:h-[190px] ${LIGHT_ACCENT_BORDER}`}
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
                      {uncovered.title}
                    </span>
                    <p className="font-display text-lg leading-tight text-foreground">
                      Nothing for {uncovered.title} yet
                    </p>
                    {uncovered.visionText ? (
                      <p className="line-clamp-2 text-[13px] text-foreground">
                        Your vision: “{uncovered.visionText.trim()}”
                      </p>
                    ) : null}
                    <div className="mt-auto flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => openCreate(uncovered, true)}
                        className="accent-fill-gradient inline-flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-on-accent"
                      >
                        <Sparkles className="size-3.5" strokeWidth={1.8} />
                        Create one
                      </button>
                      <button
                        type="button"
                        onClick={() => openLibrary("off", null)}
                        className="cursor-pointer text-[13px] font-semibold text-accent-link"
                      >
                        From library
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <button
                  key="add-library"
                  type="button"
                  onClick={() => openLibrary("off", null)}
                  className={`flex h-[150px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed bg-accent-soft text-[13px] font-semibold text-accent-link sm:h-[190px] ${LIGHT_ACCENT_BORDER}`}
                >
                  <Plus className="size-5" strokeWidth={1.8} />
                  Add from library
                </button>
              );
            }
            const src = srcOf(item, tileUrls);
            const name = areaName(item, lifeAreas);
            const menuOpen = menuId === item.id;
            return (
              <div
                key={item.id}
                id={`vision-tile-${item.id}`}
                data-board-slot={slot}
                className={`group relative h-[150px] scroll-mt-24 overflow-hidden rounded-xl sm:h-[190px] ${
                  over === slot ? "ring-[3px] ring-accent" : ""
                } ${freshId === item.id ? "ring-2 ring-accent" : ""} ${
                  draggingId === item.id ? "opacity-50" : ""
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(slot);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id =
                    e.dataTransfer.getData("application/x-ideate-vision-tile") ||
                    e.dataTransfer.getData("text/plain");
                  setOver(null);
                  setDraggingId(null);
                  if (id) onPlace(id, slot);
                }}
              >
                {src ? (
                  <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0" style={{ background: item.color }} />
                )}
                <button
                  type="button"
                  aria-label="Drag to reorder"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-ideate-vision-tile", item.id);
                    e.dataTransfer.setData("text/plain", item.id);
                    setDraggingId(item.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOver(null);
                  }}
                  className="absolute left-2.5 top-2.5 hidden size-7 cursor-grab items-center justify-center rounded-lg bg-white/90 text-foreground group-hover:inline-flex group-focus-within:inline-flex"
                >
                  <GripVertical className="size-4" strokeWidth={1.8} />
                </button>
                <div className="absolute right-2.5 top-2.5 hidden items-center gap-1.5 group-hover:flex group-focus-within:flex">
                  <button
                    type="button"
                    aria-label="Image actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuId(menuOpen ? null : item.id);
                    }}
                    className="inline-flex size-8 items-center justify-center rounded-lg bg-white/90 text-foreground"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={item.favourite ? "Unfavourite" : "Favourite"}
                    onClick={() => onToggleFavourite(item)}
                    className="inline-flex size-8 items-center justify-center rounded-lg bg-white/90"
                  >
                    <Star
                      className={`size-4 ${item.favourite ? "fill-[var(--accent)] text-[var(--accent)]" : "text-foreground"}`}
                      strokeWidth={1.8}
                    />
                  </button>
                </div>
                {item.favourite ? (
                  <button
                    type="button"
                    aria-label="Unfavourite"
                    onClick={() => onToggleFavourite(item)}
                    className="absolute right-2.5 top-2.5 z-20 inline-flex size-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--foreground)_55%,transparent)] backdrop-blur-sm group-hover:hidden"
                  >
                    <Star className="size-3.5 fill-[var(--accent)] text-[var(--accent)]" />
                  </button>
                ) : null}
                {name ? (
                  <span className={`${DARK_CHIP} absolute bottom-2.5 left-2.5`}>
                    {name}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="absolute inset-0 sm:hidden"
                  aria-label="Image actions"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuId(item.id);
                  }}
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse") return;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    let mode: "pending" | "menu" | "drag" | "scroll" = "pending";
                    const timer = window.setTimeout(() => {
                      mode = "menu";
                    }, 450);
                    const move = (ev: PointerEvent) => {
                      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
                      if (mode === "pending" && dist > 12) {
                        mode = "scroll";
                        window.clearTimeout(timer);
                      } else if (mode === "menu" && dist > 8) {
                        mode = "drag";
                        setMenuId(null);
                        setDraggingId(item.id);
                      }
                      if (mode === "drag") {
                        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
                        const slot = hit?.closest("[data-board-slot]");
                        const index = slot
                          ? Number(slot.getAttribute("data-board-slot"))
                          : NaN;
                        setOver(Number.isFinite(index) ? index : null);
                      }
                    };
                    const up = (ev: PointerEvent) => {
                      window.clearTimeout(timer);
                      e.currentTarget.removeEventListener("pointermove", move);
                      e.currentTarget.removeEventListener("pointerup", up);
                      e.currentTarget.removeEventListener("pointercancel", up);
                      if (mode === "menu") setMenuId(item.id);
                      if (mode === "drag") {
                        const hit = document.elementFromPoint(ev.clientX, ev.clientY);
                        const slot = hit?.closest("[data-board-slot]");
                        const index = slot
                          ? Number(slot.getAttribute("data-board-slot"))
                          : NaN;
                        if (Number.isFinite(index)) onPlace(item.id, index);
                        setDraggingId(null);
                        setOver(null);
                      }
                    };
                    e.currentTarget.addEventListener("pointermove", move);
                    e.currentTarget.addEventListener("pointerup", up);
                    e.currentTarget.addEventListener("pointercancel", up);
                  }}
                />
                {menuOpen ? (
                  <TileMenu
                    item={item}
                    onBoard
                    onNewTake={() => void startTake(item)}
                    onVersions={() => {
                      setMenuId(null);
                      setVersionsFor(item.id);
                    }}
                    onBoardAction={() => {
                      setMenuId(null);
                      onRemoveFromBoard(item);
                    }}
                    onFavourite={() => {
                      setMenuId(null);
                      onToggleFavourite(item);
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section id="vision-library" ref={libraryRef} className="mt-9 scroll-mt-24">
        <h2 className={EYEBROW}>Library</h2>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
          {(
            [
              ["all", "All", images.length],
              ["favourites", "Favourites", favourites],
              ["on", "On board", board.length],
              ["off", "Not on board", images.length - board.length],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={status === key ? CHIP_ON : CHIP_OFF}
            >
              {key === "favourites" ? (
                <Star className="size-3.5 fill-[var(--accent)] text-[var(--accent)]" />
              ) : null}
              {label}
              <span className="opacity-70">{n}</span>
            </button>
          ))}
          <span className="mx-1 hidden h-6 w-px self-center bg-border sm:block" />
          {lifeAreas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => setAreaId(areaId === area.id ? null : area.id)}
              className={areaId === area.id ? CHIP_ON : CHIP_OFF}
            >
              {area.title}
            </button>
          ))}
        </div>
        {!hydrated ? (
          <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6 sm:gap-2.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-[10px] bg-accent-soft" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-4 text-sm italic text-muted">
            {images.length === 0
              ? "Nothing in your library yet. Create or upload an image to begin."
              : "Nothing matches this filter."}
          </p>
        ) : (
          <ul className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6 sm:gap-2.5">
            {filtered.map((item) => {
              const src = srcOf(item, tileUrls);
              const versions = (item.versions?.length ?? 0) + 1;
              const onBoard = boardIds.has(item.id);
              return (
                <li
                  key={item.id}
                  id={onBoard ? undefined : `vision-tile-${item.id}`}
                  className={`group relative aspect-square scroll-mt-24 ${
                    freshId === item.id ? "ring-2 ring-accent" : ""
                  }`}
                >
                  {src ? (
                    <img
                      src={src}
                      alt=""
                      className="absolute inset-0 h-full w-full rounded-[10px] object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 rounded-[10px]"
                      style={{ background: item.color }}
                    />
                  )}
                  {item.favourite ? (
                    <button
                      type="button"
                      aria-label="Unfavourite"
                      onClick={() => onToggleFavourite(item)}
                      className="absolute right-2 top-2 inline-flex size-[26px] items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--foreground)_55%,transparent)] backdrop-blur-sm"
                    >
                      <Star className="size-3.5 fill-[var(--accent)] text-[var(--accent)]" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label="Favourite"
                      onClick={() => onToggleFavourite(item)}
                      className="absolute right-2 top-2 hidden size-[26px] items-center justify-center rounded-md bg-white/90 group-hover:inline-flex"
                    >
                      <Star className="size-3.5 text-foreground" strokeWidth={1.8} />
                    </button>
                  )}
                  {onBoard ? (
                    <span className={`${DARK_CHIP} absolute bottom-2 left-2`}>
                      <Check className="size-3" strokeWidth={2} />
                      <span className="hidden sm:inline">On board</span>
                    </span>
                  ) : null}
                  {versions > 1 ? (
                    <span className={`${DARK_CHIP} absolute bottom-2 right-2`}>
                      <Layers className="size-3" strokeWidth={1.8} />
                      {versions}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Image actions"
                    onClick={() => setMenuId(menuId === item.id ? null : item.id)}
                    className="absolute left-2 top-2 hidden size-7 items-center justify-center rounded-md bg-white/90 group-hover:inline-flex"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {menuId === item.id ? (
                    <TileMenu
                      item={item}
                      onBoard={onBoard}
                      onNewTake={() => void startTake(item)}
                      onVersions={() => {
                        setMenuId(null);
                        setVersionsFor(item.id);
                      }}
                      onBoardAction={() => {
                        setMenuId(null);
                        if (onBoard) onRemoveFromBoard(item);
                        else onAddToBoard(item);
                      }}
                      onFavourite={() => {
                        setMenuId(null);
                        onToggleFavourite(item);
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-[calc(58px+env(safe-area-inset-bottom,0px)+14px)] z-30 flex items-center gap-2.5 px-3.5 sm:hidden">
        <button
          type="button"
          onClick={() => openCreate(null, false)}
          className="accent-fill-gradient inline-flex h-[46px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-full text-sm font-semibold text-on-accent shadow-lg"
        >
          <Sparkles className="size-4" strokeWidth={1.8} />
          Create image
        </button>
        <button
          type="button"
          aria-label="Upload"
          onClick={onUploadClick}
          disabled={busy !== null}
          className="inline-flex size-[46px] cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg disabled:opacity-40"
        >
          <Upload className="size-4" strokeWidth={1.8} />
        </button>
      </div>

      {createOpen ? (
        <Sheet title="Create an image" onClose={() => setCreateOpen(false)}>
          <label className="block text-[13px] font-semibold text-foreground">
            Describe the scene
          </label>
          <textarea
            value={scenePrompt}
            onChange={(e) => {
              onScenePrompt(e.target.value);
              setDrafted(false);
            }}
            rows={4}
            placeholder="e.g. Me sitting on a large pile of money in a sunny room"
            className={`mt-2 min-h-24 w-full rounded-xl border px-3.5 py-3 text-[15px] leading-normal outline-none ${
              drafted
                ? "border-accent bg-accent-soft"
                : "border-border bg-card"
            }`}
          />
          {drafted ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent-link">
              <Sparkles className="size-3.5" strokeWidth={1.8} />
              Drafted from your {draftAreaName} vision · edit freely
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted">
              Mention people or pets by their reference names.
            </p>
          )}
          <p className="mt-5 text-[13px] font-semibold text-foreground">Life area</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreateArea(null)}
              className={createArea === null ? CHIP_ON : CHIP_OFF}
            >
              None
            </button>
            {lifeAreas.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => setCreateArea(area.id)}
                className={createArea === area.id ? CHIP_ON : CHIP_OFF}
              >
                {area.title}
              </button>
            ))}
          </div>
          <p className="mt-5 text-[13px] font-semibold text-foreground">References</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hasReference && selfPreviewUrl ? (
              <span className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card pr-3">
                <img src={selfPreviewUrl} alt="" className="size-8 rounded-full object-cover" />
                You
              </span>
            ) : null}
            {extraRefs.map((ref) => (
              <span
                key={ref.id}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card pr-3"
              >
                {extraPreviewUrls[ref.id] ? (
                  <img
                    src={extraPreviewUrls[ref.id]}
                    alt=""
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="size-8 rounded-full bg-accent-soft" />
                )}
                {ref.description.trim() || "Reference"}
              </span>
            ))}
            <button
              type="button"
              onClick={onPickExtra}
              className="inline-flex h-10 cursor-pointer items-center rounded-full border border-dashed border-border px-3 text-[13px] font-semibold text-accent-link"
            >
              + Person, pet or place
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRefsOpen(true)}
            className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-accent-link"
          >
            Manage references
            <ChevronRight className="size-4" strokeWidth={1.8} />
          </button>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-auto pt-6">
            <button
              type="button"
              disabled={busy !== null || !hasReference || scenePrompt.trim().length < 3}
              onClick={() => onGenerate(createArea)}
              className="accent-fill-gradient inline-flex h-[46px] w-full cursor-pointer items-center justify-center rounded-full text-sm font-semibold text-on-accent disabled:opacity-40"
            >
              {busy === "gen" ? "Generating…" : "Generate"}
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              New images go to your library. Add them to your board from there.
            </p>
          </div>
        </Sheet>
      ) : null}

      {refsOpen
        ? createPortal(
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-[20px] bg-card p-6 sm:max-w-md sm:rounded-[20px]">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">References</h2>
              <button type="button" aria-label="Close" onClick={() => setRefsOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <p className="mt-3 text-sm font-semibold">You</p>
            {selfPreviewUrl ? (
              <img src={selfPreviewUrl} alt="" className="mt-2 h-40 w-full rounded-lg object-cover" />
            ) : (
              <p className="mt-2 text-sm text-muted">No photo yet. A clear, front-facing photo works best.</p>
            )}
            {selfFileName ? (
              <p className="mt-1 text-xs text-muted">{selfFileName}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onPickSelf}
                className="accent-fill-gradient cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold text-on-accent"
              >
                {hasReference ? "Replace" : "Upload"}
              </button>
              {hasReference ? (
                <button
                  type="button"
                  onClick={onClearSelf}
                  className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs text-muted"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-5 text-sm font-semibold">Also in the scene</p>
            <ul className="mt-2 flex flex-col gap-3">
              {extraRefs.map((ref) => (
                <li key={ref.id}>
                  <div className="flex items-center gap-2">
                    {extraPreviewUrls[ref.id] ? (
                      <img src={extraPreviewUrls[ref.id]} alt="" className="size-12 rounded-md object-cover" />
                    ) : null}
                    <input
                      value={ref.description}
                      onChange={(e) => onExtraDescription(ref.id, e.target.value.slice(0, 280))}
                      placeholder="e.g. My mum"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
                    />
                    <button type="button" aria-label="Remove reference" onClick={() => onClearExtra(ref.id)}>
                      <X className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {extraRefs.length < 3 ? (
              <button
                type="button"
                onClick={onPickExtra}
                className="mt-3 cursor-pointer text-sm font-semibold text-accent-link"
              >
                + Add photo
              </button>
            ) : null}
          </div>
        </div>,
        document.body,
        )
        : null}

      {versionsFor ? (
        <VersionsDialog
          item={items.find((item) => item.id === versionsFor) ?? null}
          urls={tileUrls}
          onClose={() => setVersionsFor(null)}
          onUse={(versionId) => {
            const item = items.find((entry) => entry.id === versionsFor);
            if (!item) return;
            onUseVersion(item, versionId);
            setVersionsFor(null);
          }}
        />
      ) : null}

      {take ? (
        <NewTakeDialog
          item={items.find((item) => item.id === take.itemId) ?? null}
          urls={tileUrls}
          phase={take.phase}
          versionId={take.versionId}
          selected={take.selected}
          onSelect={(id) => setTake({ ...take, selected: id })}
          onClose={() => setTake(null)}
          onAnother={() => {
            const item = items.find((entry) => entry.id === take.itemId);
            if (item) void startTake(item);
          }}
          onUse={() => {
            const item = items.find((entry) => entry.id === take.itemId);
            if (item && take.selected !== "current") onUseVersion(item, take.selected);
            setTake(null);
          }}
          error={error}
        />
      ) : null}
    </div>
  );
}

function TileMenu({
  item,
  onBoard,
  onNewTake,
  onVersions,
  onBoardAction,
  onFavourite,
}: {
  item: VisionBoardItem;
  onBoard: boolean;
  onNewTake: () => void;
  onVersions: () => void;
  onBoardAction: () => void;
  onFavourite: () => void;
}) {
  const versions = (item.versions?.length ?? 0) + 1;
  return (
    <div
      role="menu"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute left-2 top-12 z-40 w-[250px] rounded-xl border border-border bg-card p-1.5 shadow-lg"
    >
      <button type="button" role="menuitem" onClick={onNewTake} className="flex w-full cursor-pointer items-center rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-accent-soft">
        New take
      </button>
      {versions > 1 ? (
        <button type="button" role="menuitem" onClick={onVersions} className="flex w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-accent-soft">
          Versions ({versions})
        </button>
      ) : null}
      <div className="my-1 h-px bg-border sm:hidden" />
      <button type="button" role="menuitem" onClick={onFavourite} className="flex w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-accent-soft sm:hidden">
        {item.favourite ? "Unfavourite" : "Favourite"}
      </button>
      <div className="my-1 h-px bg-border" />
      <button type="button" role="menuitem" onClick={onBoardAction} className="flex w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-accent-soft">
        {onBoard ? "Remove from board" : "Add to board"}
      </button>
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[140] bg-black/40">
      <div className="absolute inset-x-0 bottom-0 top-12 flex flex-col gap-0 overflow-y-auto rounded-t-[20px] bg-background px-6 pb-6 pt-6 sm:inset-y-0 sm:left-auto sm:w-[440px] sm:rounded-none sm:px-[26px] sm:pb-[22px] sm:pt-[26px]">
        <div className="flex items-start justify-between gap-5">
          <h2 className="font-display text-2xl text-foreground">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-0">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function VersionsDialog({
  item,
  urls,
  onClose,
  onUse,
}: {
  item: VisionBoardItem | null;
  urls: Record<string, string>;
  onClose: () => void;
  onUse: (versionId: string) => void;
}) {
  if (!item || typeof document === "undefined") return null;
  const current = srcOf(item, urls);
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-[700px] rounded-t-[20px] bg-card p-6 sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Versions</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto">
          <figure className="w-[200px] shrink-0">
            {current ? (
              <img src={current} alt="" className="h-[140px] w-full rounded-xl object-cover" />
            ) : null}
            <figcaption className="mt-1 text-sm font-semibold">Current</figcaption>
          </figure>
          {[...(item.versions ?? [])].reverse().map((version) => {
            const src = version.imageUrl || urls[version.id];
            return (
              <button
                key={version.id}
                type="button"
                onClick={() => onUse(version.id)}
                className="w-[200px] shrink-0 cursor-pointer text-left"
              >
                {src ? (
                  <img src={src} alt="" className="h-[140px] w-full rounded-xl object-cover" />
                ) : (
                  <div className="h-[140px] rounded-xl bg-accent-soft" />
                )}
                <span className="mt-1 block text-sm font-semibold">Earlier version</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NewTakeDialog({
  item,
  urls,
  phase,
  versionId,
  selected,
  onSelect,
  onClose,
  onAnother,
  onUse,
  error,
}: {
  item: VisionBoardItem | null;
  urls: Record<string, string>;
  phase: "making" | "ready";
  versionId: string | null;
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAnother: () => void;
  onUse: () => void;
  error: string | null;
}) {
  if (!item || typeof document === "undefined") return null;
  const current = srcOf(item, urls);
  const made = versionId
    ? item.versions?.find((version) => version.id === versionId)
    : null;
  const madeSrc = made ? made.imageUrl || urls[made.id] || null : null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-[700px] rounded-t-[20px] bg-card p-6 sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">New take</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-2 text-[13px] text-foreground">
          Same scene and people, a fresh moment. Kept as a version; your board shows the one you pick.
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex gap-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => onSelect("current")}
            className={`w-[200px] shrink-0 text-left ${selected === "current" ? "rounded-xl ring-[3px] ring-accent" : ""}`}
          >
            {current ? (
              <img src={current} alt="" className="h-[140px] w-full rounded-xl object-cover" />
            ) : null}
            <span className="mt-1 block text-sm font-semibold">Current</span>
          </button>
          {phase === "making" ? (
            <div className={`flex h-[140px] w-[200px] shrink-0 flex-col items-center justify-center rounded-xl border bg-accent-soft ${LIGHT_ACCENT_BORDER}`}>
              <Sparkles className="size-4 animate-pulse text-accent-link" />
              <p className="mt-1 text-[13px] font-semibold text-accent-link">Making a new take…</p>
              <p className="text-xs text-muted">About 20 seconds</p>
            </div>
          ) : made ? (
            <button
              type="button"
              onClick={() => versionId && onSelect(versionId)}
              className={`w-[200px] shrink-0 text-left ${selected === versionId ? "rounded-xl ring-[3px] ring-accent" : ""}`}
            >
              {madeSrc ? (
                <img src={madeSrc} alt="" className="h-[140px] w-full rounded-xl object-cover" />
              ) : (
                <div className="h-[140px] rounded-xl bg-accent-soft" />
              )}
              <span className="mt-1 block text-sm font-semibold">New take · Just now</span>
            </button>
          ) : null}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={phase === "making"}
            onClick={onAnother}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40"
          >
            <RefreshCw className="size-4" strokeWidth={1.8} />
            Another take
          </button>
          <button
            type="button"
            disabled={phase === "making"}
            onClick={onUse}
            className="accent-fill-gradient inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold text-on-accent disabled:opacity-40"
          >
            {selected === versionId ? "Use new take" : "Use this one"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

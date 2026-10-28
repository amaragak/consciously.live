import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IconLoader2, IconPencil } from "@tabler/icons-react";
import { Plus, Star } from "lucide-react";
import {
  LIGHT_ACCENT_BORDER,
  LIGHT_ACCENT_TEXT,
  MANIFESTO_EYEBROW_CLASS,
} from "@/components/plan/manifesto-section";
import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { MANIFESTO_MAX_CHARS } from "@/lib/ideate-manifesto";
import {
  boardVisionItems,
  visionBoardPhotoFilter,
  visionPickOrder,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";

type HeroImage = {
  id: string;
  src: string | null;
  color: string;
  favourite: boolean;
};

const HERO_DAY_KEY = "mm_hero_vision_day_v1";

function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toHero(item: VisionBoardItem, urls: Record<string, string>): HeroImage {
  return {
    id: item.id,
    color: item.color,
    favourite: Boolean(item.favourite),
    src:
      (typeof item.imageUrl === "string" && item.imageUrl.trim()) ||
      urls[item.id] ||
      null,
  };
}

/** One large-slot image per local day, cycling the favourite (or board) pool. */
function dayLargeId(pool: VisionBoardItem[]): string | null {
  if (!pool.length) return null;
  const day = localDay();
  let index = 0;
  try {
    const raw = readAccountLocalStorage(HERO_DAY_KEY);
    const saved = raw
      ? (JSON.parse(raw) as { day?: string; index?: number })
      : null;
    if (saved && saved.day === day && typeof saved.index === "number") {
      index = ((saved.index % pool.length) + pool.length) % pool.length;
    } else {
      const prev = typeof saved?.index === "number" ? saved.index : -1;
      index = (prev + 1) % pool.length;
      writeAccountLocalStorage(HERO_DAY_KEY, JSON.stringify({ day, index }));
    }
  } catch {
    index = 0;
  }
  return pool[index]?.id ?? null;
}

function PosterFrameIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <rect x="7.5" y="6.5" width="9" height="7" />
      <path d="M7.5 17h9" />
    </svg>
  );
}

const TILE = "relative block h-full min-h-0 min-w-0 overflow-hidden rounded-[10px]";
const PLAIN = "h-full min-h-0 min-w-0 rounded-[10px] bg-accent-soft";
const ADD =
  `flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed bg-accent-soft text-accent-link ${LIGHT_ACCENT_BORDER}`;

function TilePicture({ image }: { image: HeroImage }) {
  return image.src ? (
    <img
      key={image.src}
      src={image.src}
      alt=""
      className="absolute inset-0 h-full w-full object-cover"
      style={{
        animation: "hero-tile-fade 250ms ease",
        filter: visionBoardPhotoFilter(
          "grayscale(32%) sepia(22%) contrast(0.88) brightness(0.82) saturate(0.7)",
        ),
      }}
    />
  ) : (
    <div className="absolute inset-0" style={{ background: image.color }} />
  );
}

function FavouriteStar({
  image,
  onToggle,
  hoverOnly,
}: {
  image: HeroImage;
  onToggle: (id: string) => void;
  hoverOnly?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={image.favourite ? "Unfavourite" : "Favourite"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(image.id);
      }}
      className={`absolute right-3 top-3 inline-flex size-[34px] items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--foreground)_55%,transparent)] backdrop-blur-sm ${
        image.favourite || !hoverOnly
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      }`}
    >
      <Star
        className={`size-4 ${image.favourite ? "fill-[var(--accent)] text-[var(--accent)]" : "text-white"}`}
        strokeWidth={1.8}
      />
    </button>
  );
}

function ImageTile({
  image,
  className,
  scrim,
  onSwap,
  onToggleFavourite,
}: {
  image: HeroImage;
  className?: string;
  scrim?: string | null;
  onSwap?: () => void;
  onToggleFavourite?: (id: string) => void;
}) {
  const picture = (
    <>
      <TilePicture image={image} />
      {scrim ? (
        <span className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_srgb,var(--foreground)_55%,transparent)] text-[18px] font-semibold text-white">
          {scrim}
        </span>
      ) : null}
      {onToggleFavourite && !scrim ? (
        <FavouriteStar image={image} onToggle={onToggleFavourite} hoverOnly />
      ) : null}
    </>
  );
  if (onSwap && !scrim) {
    return (
      <button
        type="button"
        onClick={onSwap}
        className={`${TILE} group cursor-pointer ${className ?? ""}`}
      >
        {picture}
      </button>
    );
  }
  return (
    <Link
      to={
        scrim
          ? "/manifest/vision-board"
          : `/manifest/vision-board#vision-tile-${image.id}`
      }
      className={`${TILE} group ${className ?? ""}`}
    >
      {picture}
    </Link>
  );
}

function AddTile({
  onClick,
  busy,
  large,
  className,
}: {
  onClick: () => void;
  busy: boolean;
  large?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`${ADD} h-full min-h-0 min-w-0 ${className ?? ""}`}
    >
      {busy ? (
        <IconLoader2 size={18} stroke={1.75} className="animate-spin" aria-hidden />
      ) : (
        <Plus aria-hidden className="size-[18px]" strokeWidth={1.75} />
      )}
      <span className="text-[13px] font-semibold">
        {large ? "Add your first image" : busy ? "Adding…" : "Add image"}
      </span>
      {large ? (
        <span className="text-[12px] font-normal text-muted">
          Pictures of the life you&apos;re building
        </span>
      ) : null}
    </button>
  );
}

function BentoSlots({
  shown,
  total,
  onAdd,
  busy,
  onSwap,
  onToggleFavourite,
  className,
}: {
  shown: HeroImage[];
  total: number;
  onAdd: () => void;
  busy: boolean;
  onSwap: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  className: string;
}) {
  const extra = Math.max(0, total - 5);
  const slots = Array.from({ length: 5 }, (_, i) => shown[i] ?? null);
  const addAt = total < 5 ? total : -1;
  return (
    <div className={className}>
      {slots.map((image, i) => {
        const span = i === 0 ? "row-span-2" : "";
        if (image) {
          const scrim = i === 4 && extra > 0 ? `+${extra}` : null;
          return (
            <ImageTile
              key={`${i}-${image.id}`}
              image={image}
              scrim={scrim}
              className={span}
              onSwap={i > 0 ? () => onSwap(image.id) : undefined}
              onToggleFavourite={i === 0 ? onToggleFavourite : undefined}
            />
          );
        }
        if (total === 0 && i === 0) {
          return (
            <AddTile
              key="first"
              onClick={onAdd}
              busy={busy}
              large
              className={span}
            />
          );
        }
        if (i === addAt) {
          return (
            <AddTile key="add" onClick={onAdd} busy={busy} className={span} />
          );
        }
        return <div key={`plain-${i}`} className={`${PLAIN} ${span}`} aria-hidden />;
      })}
    </div>
  );
}

function MobileRow({
  shown,
  total,
  onAdd,
  busy,
  onSwap,
}: {
  shown: HeroImage[];
  total: number;
  onAdd: () => void;
  busy: boolean;
  onSwap: (id: string) => void;
}) {
  const extra = Math.max(0, total - 3);
  const slots = Array.from({ length: 3 }, (_, i) => shown[i] ?? null);
  const addAt = total < 3 ? total : -1;
  return (
    <div className="grid grid-cols-3 gap-1.5 md:hidden">
      {slots.map((image, i) => {
        if (image) {
          const scrim = i === 2 && extra > 0 ? `+${extra}` : null;
          return (
            <ImageTile
              key={`${i}-${image.id}`}
              image={image}
              scrim={scrim}
              className="aspect-square"
              onSwap={i > 0 ? () => onSwap(image.id) : undefined}
            />
          );
        }
        if (i === addAt) {
          return (
            <AddTile
              key="add"
              onClick={onAdd}
              busy={busy}
              className="aspect-square"
            />
          );
        }
        return <div key={`plain-${i}`} className={`${PLAIN} aspect-square`} aria-hidden />;
      })}
    </div>
  );
}

export function ManifestoHeroBento({
  items,
  urls,
  statement,
  loading,
  editing,
  draft,
  onDraft,
  onBeginEdit,
  onBeginWrite,
  onCancelEdit,
  onSaveEdit,
  onAddImage,
  addBusy,
  addError,
  onToggleFavourite,
}: {
  items: VisionBoardItem[];
  urls: Record<string, string>;
  statement: string;
  loading: boolean;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onBeginEdit: () => void;
  onBeginWrite: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onAddImage: () => void;
  addBusy: boolean;
  addError: string | null;
  onToggleFavourite: (id: string) => void;
}) {
  const ordered = useMemo(
    () => visionPickOrder(items).map((item) => toHero(item, urls)),
    [items, urls],
  );
  const baseLargeId = useMemo(() => {
    const board = boardVisionItems(items);
    const fav = board.filter((item) => item.favourite);
    return dayLargeId(fav.length ? fav : board);
  }, [items]);
  const baseIds = useMemo(() => {
    if (!ordered.length) return [] as string[];
    const large = ordered.find((image) => image.id === baseLargeId) ?? ordered[0]!;
    const rest = ordered.filter((image) => image.id !== large.id);
    return [large.id, ...rest.slice(0, 4).map((image) => image.id)];
  }, [ordered, baseLargeId]);
  const [swap, setSwap] = useState<string[] | null>(null);
  const shownIds =
    swap && swap.every((id) => ordered.some((image) => image.id === id))
      ? swap
      : baseIds;
  const byId = useMemo(
    () => new Map(ordered.map((image) => [image.id, image])),
    [ordered],
  );
  const shown = shownIds
    .map((id) => byId.get(id))
    .filter((image): image is HeroImage => Boolean(image));

  const swapWith = (id: string) => {
    const next = [...shownIds];
    const index = next.indexOf(id);
    if (index <= 0) return;
    const large = next[0]!;
    next[0] = id;
    next[index] = large;
    setSwap(next);
  };

  const hasStatement = Boolean(statement);

  return (
    <section aria-label="Vision board">
      <style>{`@keyframes hero-tile-fade{from{opacity:0}to{opacity:1}}`}</style>
      <h1 className="sr-only">Manifesto</h1>
      <div
        className={`grid items-stretch gap-1.5 xl:grid-cols-[5fr_7fr] ${
          editing ? "xl:min-h-[300px]" : "xl:h-[300px]"
        }`}
      >
        <div className="relative overflow-hidden rounded-2xl bg-[var(--deep)] text-white">
          <div className="navy-paisley-plate" aria-hidden />
          <div className="relative z-[1] flex flex-col justify-center gap-4 px-5 py-[22px] md:px-8 md:py-[30px]">
          {hasStatement ? (
            <button
              type="button"
              onClick={onBeginEdit}
              aria-label="Edit statement"
              className="absolute right-[14px] top-[14px] inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/[0.14] text-white"
            >
              <IconPencil size={13} stroke={1.8} aria-hidden />
            </button>
          ) : null}
          <span className={`${MANIFESTO_EYEBROW_CLASS} ${LIGHT_ACCENT_TEXT}`}>
            My manifesto
          </span>
          {editing ? (
            <form
              className="flex flex-col gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                onSaveEdit();
              }}
            >
              <label className="sr-only" htmlFor="ideate-manifesto-edit">
                Edit manifesto
              </label>
              <textarea
                id="ideate-manifesto-edit"
                autoFocus
                rows={4}
                maxLength={MANIFESTO_MAX_CHARS}
                value={draft}
                onChange={(e) =>
                  onDraft(e.target.value.slice(0, MANIFESTO_MAX_CHARS))
                }
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onCancelEdit();
                  }
                }}
                className="w-full resize-none rounded-xl border border-white/35 bg-black/35 px-3 py-2.5 text-left font-display text-[20px] font-normal italic leading-[1.38] text-white outline-none ring-white/25 focus:ring-2 md:text-[24px]"
              />
              <div className="flex items-center gap-2">
                <span
                  className={`mr-auto text-[11px] tabular-nums ${
                    draft.length >= MANIFESTO_MAX_CHARS
                      ? "text-[#E6C98A]"
                      : "text-white/50"
                  }`}
                >
                  {draft.length}/{MANIFESTO_MAX_CHARS}
                </span>
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className="cursor-pointer rounded-full border border-white bg-black px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Save
                </button>
              </div>
            </form>
          ) : hasStatement ? (
            <p className="line-clamp-6 pr-8 font-display text-[20px] font-normal italic leading-[1.38] text-white md:line-clamp-5 md:text-[24px]">
              <span className="mr-1 font-display text-[1.35em] not-italic leading-none text-[var(--header-gold,#d9b87c)]">
                “
              </span>
              {statement.trim().replace(/^[“"]\s*/, "")}
            </p>
          ) : (
            <p className="font-display text-[20px] font-normal italic leading-[1.38] text-white/60 md:text-[24px]">
              {loading
                ? "Distilling…"
                : "Write the one sentence you want to live by."}
            </p>
          )}
          {!editing && hasStatement ? (
            <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap">
              <Link
                to="/manifest/poster"
                className="accent-fill-gradient inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-semibold text-on-accent md:w-auto"
              >
                <PosterFrameIcon className="size-4" />
                View as poster
              </Link>
              <Link
                to="/manifest/vision-board"
                className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-full border border-white/70 px-4 text-sm font-semibold text-white md:w-auto"
              >
                Vision board →
              </Link>
            </div>
          ) : null}
          {!editing && !hasStatement && !loading ? (
            <div className="flex flex-col gap-2.5 md:flex-row md:flex-wrap">
              <button
                type="button"
                onClick={onBeginWrite}
                className="accent-fill-gradient inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-full px-[18px] text-sm font-semibold text-on-accent md:w-auto"
              >
                Write your statement
              </button>
              <Link
                to="/manifest/poster"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-white/70 px-4 text-sm font-semibold text-white md:w-auto"
              >
                <PosterFrameIcon className="size-4" />
                View as poster
              </Link>
            </div>
          ) : null}
          </div>
        </div>

        <BentoSlots
          shown={shown}
          total={ordered.length}
          onAdd={onAddImage}
          busy={addBusy}
          onSwap={swapWith}
          onToggleFavourite={onToggleFavourite}
          className="hidden h-[220px] grid-cols-[2fr_1fr_1fr] grid-rows-2 gap-1.5 overflow-hidden rounded-2xl md:grid xl:h-full"
        />
        <MobileRow
          shown={shown}
          total={ordered.length}
          onAdd={onAddImage}
          busy={addBusy}
          onSwap={swapWith}
        />
      </div>
      {addError ? (
        <p role="alert" className="mt-2 text-sm text-red-700/80 dark:text-red-300/90">
          {addError}
        </p>
      ) : null}
    </section>
  );
}

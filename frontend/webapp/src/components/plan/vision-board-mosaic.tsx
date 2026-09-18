/**
 * Vision board preview mosaic.
 * `asymmetric` — marketing pitch collage.
 * `grid` — straight 4×2 square grid (/manifest/my).
 * Slots prefer images when provided; remaining slots use color fills.
 */

"use client";

import { VisionBoardImage } from "@/components/plan/vision-board-image";

export const VISION_BOARD_EXAMPLE_COLORS = [
  "#C4A882",
  "#8FA89A",
  "#A8B5C4",
  "#D4A090",
  "#C9B896",
] as const;

/** Muted desaturated tones when the board has no real items yet. */
export const VISION_BOARD_EMPTY_COLORS = [
  "#E8E0D4",
  "#DCD6CA",
  "#D4CFC4",
  "#E2D9CE",
  "#D8D2C6",
  "#E0DAD0",
] as const;

export const VISION_BOARD_MOSAIC_SLOT_COUNT = 5;
export const VISION_BOARD_GRID_SLOT_COUNT = 8;
/** Single-row teaser strip on Ideate Overview (mobile). */
export const VISION_BOARD_STRIP_SLOT_COUNT = 6;

type Layout = "asymmetric" | "grid" | "strip";

type Props = {
  colors: readonly string[];
  /**
   * Image URLs for mosaic slots (board order).
   * Empty / missing entries fall back to `colors`.
   */
  images?: readonly (string | null | undefined)[];
  /** Default asymmetric (marketing). Use `grid` for My Ideas. */
  layout?: Layout;
  className?: string;
  /** Overall size of the mosaic box */
  sizeClassName?: string;
  /** Grid gap (Dream hero uses 3px). */
  gapClassName?: string;
  /** Outer radius; pass `rounded-none` for flush editorial hero. */
  radiusClassName?: string;
  /** Cell corner radius. */
  cellRadiusClassName?: string;
  /** Pulse cells instead of images/colors — same grid chrome. */
  loading?: boolean;
};

function MosaicCell({
  color,
  imageSrc,
  className,
  objectPositionClassName = "object-center",
  objectPosition,
  loading = false,
}: {
  color: string;
  imageSrc?: string | null;
  className?: string;
  objectPositionClassName?: string;
  /** CSS object-position when class utilities aren't enough (e.g. center 20%). */
  objectPosition?: string;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div
        className={`vision-board-tile-skeleton min-h-0 min-w-0 ${className ?? ""}`}
      />
    );
  }
  if (imageSrc) {
    return (
      <VisionBoardImage
        src={imageSrc}
        frameClassName={`relative min-h-0 min-w-0 overflow-hidden ${className ?? ""}`}
        imgClassName={`absolute inset-0 h-full w-full object-cover ${objectPosition ? "" : objectPositionClassName}`}
        objectPosition={objectPosition}
      />
    );
  }
  return (
    <div
      className={`min-h-0 min-w-0 ${className ?? ""}`}
      style={{ backgroundColor: color }}
    />
  );
}

export function VisionBoardMosaic({
  colors,
  images,
  layout = "asymmetric",
  className = "",
  sizeClassName = "h-[140px] w-[140px]",
  gapClassName = "gap-1.5",
  radiusClassName = "rounded-xl",
  cellRadiusClassName = "rounded-md",
  loading = false,
}: Props) {
  const palette =
    colors.length > 0 ? colors : [...VISION_BOARD_EMPTY_COLORS];
  const c = (i: number) => palette[i % palette.length]!;
  const img = (i: number) => {
    if (loading) return null;
    const src = images?.[i];
    return typeof src === "string" && src.trim() ? src : null;
  };

  if (layout === "strip") {
    return (
      <div
        className={`flex h-32 shrink-0 ${gapClassName} ${radiusClassName} ${sizeClassName} ${className}`}
        aria-hidden
        aria-busy={loading || undefined}
      >
        {Array.from({ length: VISION_BOARD_STRIP_SLOT_COUNT }, (_, i) => (
          <MosaicCell
            key={i}
            className={`aspect-square h-full w-auto shrink-0 ${cellRadiusClassName}`}
            color={c(i)}
            imageSrc={img(i)}
            objectPosition="center 20%"
            loading={loading}
          />
        ))}
      </div>
    );
  }

  if (layout === "grid") {
    return (
      <div
        className={`grid w-full shrink-0 ${gapClassName} ${radiusClassName} ${sizeClassName} ${className}`}
        style={{
          gridTemplateColumns: "repeat(4, 1fr)",
        }}
        aria-hidden
        aria-busy={loading || undefined}
      >
        {Array.from({ length: VISION_BOARD_GRID_SLOT_COUNT }, (_, i) => (
          <MosaicCell
            key={i}
            className={`aspect-square w-full ${cellRadiusClassName}`}
            color={c(i)}
            imageSrc={img(i)}
            objectPosition="center 20%"
            loading={loading}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`grid shrink-0 grid-cols-3 grid-rows-3 overflow-hidden ${gapClassName} ${radiusClassName} ${sizeClassName} ${className}`}
      aria-hidden
      aria-busy={loading || undefined}
    >
      <MosaicCell
        className={`col-span-2 row-span-2 ${cellRadiusClassName}`}
        color={c(0)}
        imageSrc={img(0)}
        loading={loading}
      />
      <MosaicCell
        className={cellRadiusClassName}
        color={c(1)}
        imageSrc={img(1)}
        loading={loading}
      />
      <MosaicCell
        className={cellRadiusClassName}
        color={c(2)}
        imageSrc={img(2)}
        loading={loading}
      />
      <MosaicCell
        className={`col-span-2 ${cellRadiusClassName}`}
        color={c(3)}
        imageSrc={img(3)}
        loading={loading}
      />
      <MosaicCell
        className={cellRadiusClassName}
        color={c(4)}
        imageSrc={img(4)}
        loading={loading}
      />
    </div>
  );
}

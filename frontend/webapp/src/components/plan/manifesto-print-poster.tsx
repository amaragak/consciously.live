import {
  Fragment,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { SquarePen, Plus } from "lucide-react";
import { LogoMark } from "@/components/logo-mark";
import {
  NOTE_ROTATIONS,
  NOTE_TINT_PERCENT,
  PAPER_GRAIN_URL,
  PRINT_BIG,
  PRINT_DESIGN_WIDTH,
  desktopTileLayout,
  mobileTileSizes,
  romanNumeral,
  type PrintNote,
  type PrintTile,
} from "@/lib/manifesto-print";
import {
  PrintStoryChapter,
  type PrintStoryCompose,
  type PrintStoryData,
} from "@/components/plan/manifesto-print-story";

/* ------------------------------------------------------------------ types */

export type PrintImage = { id: string; src: string };

export type PrintArea = {
  id: string;
  title: string;
  dream: string;
  looks: string;
  images: PrintImage[];
};

export type PrintValue = { id: string; text: string };

export type PrintData = {
  firstName: string;
  statement: string;
  values: PrintValue[];
  areas: PrintArea[];
  notes: PrintNote[];
  /** Latest prepared story for the print chapter (null = empty slot in compose). */
  story: PrintStoryData | null;
};

/**
 * Compose-only affordances. `null` / undefined means Preview or export: no
 * controls, no placeholders, no dashed slots.
 */
export type PrintCompose = {
  onEditStatement: (el: HTMLElement) => void;
  onAddValue: (el: HTMLElement) => void;
  onEditValue: (el: HTMLElement, valueId: string) => void;
  onEditAreaName: (el: HTMLElement, areaId: string) => void;
  onEditDream: (el: HTMLElement, areaId: string) => void;
  onEditLooks: (el: HTMLElement, areaId: string) => void;
  onAddImage: (el: HTMLElement, areaId: string) => void;
  /** Click a print image: choose main / other image actions. */
  onImageMenu: (el: HTMLElement, areaId: string, imageId: string) => void;
  onAddArea: (el: HTMLElement) => void;
  onAddNote: (el: HTMLElement) => void;
  /** Pencil on a note: Edit / Remove from print. */
  onNoteMenu: (el: HTMLElement, note: PrintNote) => void;
  storyCompose: PrintStoryCompose | null;
};

/* ----------------------------------------------------------------- tokens */

/** Light accent (rules, frame, dashed outlines) — from the gold token. */
const LIGHT = "color-mix(in srgb, var(--gold) 70%, white)";
const LIGHT_SOFT = "color-mix(in srgb, var(--gold) 70%, transparent)";
const INK_06 = "color-mix(in srgb, var(--marketing-ink) 6%, transparent)";
const INK_28 = "color-mix(in srgb, var(--marketing-ink) 28%, transparent)";
const INK_35 = "color-mix(in srgb, var(--marketing-ink) 35%, transparent)";
const PAPER_FILL = "color-mix(in srgb, var(--card) 55%, transparent)";
/** Midway between ivory band and card off-white. */
const PAPER_BG =
  "color-mix(in srgb, var(--marketing-band-a) 50%, var(--card))";

const PAPER_STYLE: CSSProperties = {
  backgroundColor: PAPER_BG,
  backgroundImage: PAPER_GRAIN_URL,
};

const SERIF_DISPLAY: CSSProperties = {
  fontVariationSettings: "'opsz' 144",
};
const SERIF_TEXT: CSSProperties = { fontVariationSettings: "'opsz' 24" };

function caps(size: number, letterSpacing: number, weight = 600): CSSProperties {
  return {
    fontSize: size,
    letterSpacing,
    fontWeight: weight,
    textTransform: "uppercase",
  };
}

const MOUNT_SHADOW = `0 1px 0 ${INK_06}, 0 10px 22px -8px ${INK_28}`;

/* -------------------------------------------------------------- primitives */

function Rule({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`block h-px flex-1 ${className}`}
      style={{ background: LIGHT }}
    />
  );
}

function DoubleRule({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-[3px] ${className}`} aria-hidden>
      <div className="h-px w-full" style={{ background: LIGHT }} />
      <div className="h-px w-full" style={{ background: LIGHT }} />
    </div>
  );
}

function Ornament({ gap = 14 }: { gap?: number }) {
  return (
    <div
      className="flex items-center text-accent"
      style={{ gap }}
      aria-hidden
    >
      <Rule />
      <span style={{ fontSize: 10 }}>✦</span>
      <Rule />
    </div>
  );
}

/** Compose-only "+" circle, absolutely positioned by the caller's className/style. */
function AddCircle({
  label,
  onClick,
  size,
  className = "",
  style,
}: {
  label: string;
  onClick: (el: HTMLElement) => void;
  size: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      data-compose-chrome
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.currentTarget);
      }}
      className={`absolute z-[4] flex cursor-pointer items-center justify-center rounded-full border bg-card text-accent-link shadow-[0_4px_12px_rgb(27_35_51_/_0.14)] transition-transform hover:scale-105 ${className}`}
      style={{ width: size, height: size, borderColor: LIGHT, ...style }}
    >
      <Plus aria-hidden className="size-4" strokeWidth={2} />
    </button>
  );
}

/** The "+ Add a life area" pill, absolutely centred on the areas column's bottom edge. */
function AddAreaPill({
  onClick,
  height,
  bottom,
}: {
  onClick: (el: HTMLElement) => void;
  height: number;
  bottom: number;
}) {
  return (
    <button
      type="button"
      data-compose-chrome
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.currentTarget);
      }}
      className="absolute left-1/2 z-[4] inline-flex -translate-x-1/2 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border bg-card px-3.5 text-[12px] font-semibold text-accent-link shadow-[0_4px_12px_rgb(27_35_51_/_0.14)] transition-transform hover:scale-[1.03]"
      style={{ height, bottom, borderColor: LIGHT }}
    >
      <Plus aria-hidden className="size-[13px]" strokeWidth={2} />
      Add a life area
    </button>
  );
}

/**
 * Text item that can be edited in place (compose only). The wrapper is always
 * rendered so Preview and compose lay out identically; the pencil is
 * absolutely positioned and only shown on hover. On touch, tapping edits.
 */
function Editable({
  onEdit,
  className = "",
  style,
  pencilClassName = "-right-[34px] top-0",
  inline = false,
  label = "Edit",
  children,
}: {
  onEdit?: ((el: HTMLElement) => void) | null;
  className?: string;
  style?: CSSProperties;
  pencilClassName?: string;
  inline?: boolean;
  label?: string;
  children: ReactNode;
}) {
  const Tag = inline ? "span" : "div";
  if (!onEdit) {
    return (
      <Tag className={`relative ${className}`} style={style}>
        {children}
      </Tag>
    );
  }
  return (
    <Tag
      className={`group/edit relative cursor-pointer ${className}`}
      style={style}
      onClick={(e: React.MouseEvent<HTMLElement>) => onEdit(e.currentTarget)}
    >
      {children}
      <button
        type="button"
        data-compose-chrome
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          const host = e.currentTarget.parentElement;
          if (host) onEdit(host);
        }}
        className={`absolute z-[4] flex size-[26px] cursor-pointer items-center justify-center rounded-full border bg-card text-muted opacity-0 shadow-[0_3px_8px_rgb(27_35_51_/_0.1)] transition-opacity focus-visible:opacity-100 group-hover/edit:opacity-100 [@media(hover:none)]:hidden ${pencilClassName}`}
        style={{ borderColor: LIGHT }}
      >
        <SquarePen aria-hidden className="size-[13px]" strokeWidth={1.75} />
      </button>
    </Tag>
  );
}

function PlusDisc({ size }: { size: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full border bg-card text-accent-link"
      style={{ width: size, height: size, borderColor: LIGHT }}
    >
      <Plus className="size-4" strokeWidth={2} />
    </span>
  );
}

/** Square print: card-surface mount with a 6px (5px on mobile) mat. */
function PrintMount({
  tile,
  src,
  pad,
  onClick,
}: {
  tile: PrintTile;
  src: string;
  pad: number;
  /** Compose only — opens the image menu. */
  onClick?: ((el: HTMLElement) => void) | null;
}) {
  const style: CSSProperties = {
    width: tile.size,
    height: tile.size,
    boxSizing: "border-box",
    padding: pad,
    boxShadow: MOUNT_SHADOW,
    transform: `rotate(${tile.tilt}deg)`,
  };
  const inner = (
    <div className="h-full w-full overflow-hidden">
      <img
        src={src}
        alt=""
        draggable={false}
        className="block h-full w-full object-cover"
      />
    </div>
  );
  if (onClick) {
    return (
      <button
        type="button"
        data-compose-chrome
        aria-label="Image options"
        onClick={(e) => onClick(e.currentTarget)}
        className="shrink-0 cursor-pointer bg-card p-0 text-left transition-opacity hover:opacity-90"
        style={style}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="shrink-0 bg-card" style={style}>
      {inner}
    </div>
  );
}

/** Missing-image placeholder: a 166px dashed square, rotated like a print. */
function ImagePlaceholder({
  areaTitle,
  tilt,
  onClick,
  size = 166,
}: {
  areaTitle: string;
  tilt: number;
  onClick: (el: HTMLElement) => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      data-compose-chrome
      onClick={(e) => onClick(e.currentTarget)}
      className="flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 px-3.5 text-center"
      style={{
        width: size,
        height: size,
        boxSizing: "border-box",
        border: `1.5px dashed ${LIGHT}`,
        background: PAPER_FILL,
        transform: `rotate(${tilt}deg)`,
      }}
    >
      <PlusDisc size={30} />
      <span className="text-[12px] font-semibold leading-tight text-accent-link">
        Add an image for {areaTitle}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ notes */

function noteBackground(i: number): string {
  const pct = NOTE_TINT_PERCENT[i % NOTE_TINT_PERCENT.length]!;
  return `color-mix(in srgb, var(--accent) ${pct}%, ${PAPER_BG})`;
}

function NoteCard({
  note,
  index,
  mobile,
  onMenu,
}: {
  note: PrintNote;
  index: number;
  mobile: boolean;
  onMenu?: ((el: HTMLElement) => void) | null;
}) {
  const rot = NOTE_ROTATIONS[index % NOTE_ROTATIONS.length]!;
  const bodyFont = mobile ? 13 : 14;
  const body = (
    <>
      <span
        aria-hidden
        className="absolute left-1/2 top-[-7px] ml-[-23px] h-[14px] w-[46px]"
        style={{
          background: "rgba(255,255,255,0.7)",
          boxShadow: `0 1px 2px ${INK_06}`,
          transform: `rotate(${rot * -1.5}deg)`,
        }}
      />
      {note.kind === "quote" ? (
        <>
          <span
            className="font-display italic leading-[1.42] text-marketing-ink"
            style={{ ...SERIF_TEXT, fontSize: bodyFont }}
          >
            {note.text}
          </span>
          {note.source ? (
            <span
              className="font-ui text-accent-link"
              style={caps(8.5, 1.6)}
            >
              {note.source}
            </span>
          ) : null}
        </>
      ) : (
        <>
          <span
            className="font-ui leading-[1.5] text-accent-link"
            style={caps(8.5, 1.5)}
          >
            {note.question}
          </span>
          <span
            className="font-display italic leading-[1.42] text-marketing-ink"
            style={{ ...SERIF_TEXT, fontSize: bodyFont }}
          >
            {note.answer}
          </span>
        </>
      )}
    </>
  );
  const common: CSSProperties = {
    background: noteBackground(index),
    padding: mobile ? "16px 13px 12px" : "18px 16px 14px",
    boxShadow: `0 1px 0 ${INK_06}, 0 12px 20px -12px ${INK_35}`,
    transform: `rotate(${rot}deg)`,
  };
  return (
    <Editable
      onEdit={onMenu}
      label="Edit or remove from print"
      className="flex flex-col gap-[10px]"
      style={common}
      pencilClassName="-right-2 -top-3"
    >
      {body}
    </Editable>
  );
}

function GhostNote({
  onClick,
}: {
  onClick: (el: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      data-compose-chrome
      onClick={(e) => onClick(e.currentTarget)}
      className="flex cursor-pointer flex-col items-start gap-2 p-4 text-left"
      style={{
        border: `1.5px dashed ${LIGHT}`,
        background: PAPER_FILL,
        transform: "rotate(-1.6deg)",
      }}
    >
      <PlusDisc size={26} />
      <span className="text-[12px] font-semibold text-accent-link">
        Add a quote
      </span>
      <span className="text-[12px] leading-[1.45] text-marketing-eyebrow">
        A line you want to keep close.
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------- footer */

function PosterFooter({
  mobile,
  className = "",
}: {
  mobile: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center text-marketing-eyebrow ${className}`}
      style={{ gap: mobile ? 10 : 14 }}
    >
      <Rule />
      <span
        className="font-ui flex items-center"
        style={{
          ...caps(mobile ? 8.5 : 9, mobile ? 1.8 : 2, 500),
          gap: mobile ? 5 : 6,
        }}
      >
        <LogoMark size={mobile ? 11 : 12} className="text-accent" />
        consciously
      </span>
      <Rule />
    </div>
  );
}

function WordsLabel({ mobile }: { mobile: boolean }) {
  return (
    <div
      className="font-ui flex items-center text-accent-link"
      style={{
        ...caps(mobile ? 8.5 : 9, mobile ? 2 : 2.4),
        gap: mobile ? 10 : 14,
      }}
    >
      <span>Words to keep</span>
      <Rule />
    </div>
  );
}

/* ------------------------------------------------------------ area pieces */

function AreaText({
  area,
  index,
  compose,
}: {
  area: PrintArea;
  index: number;
  compose: PrintCompose | null;
}) {
  const title = area.title.trim() || "Untitled";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Editable
          onEdit={compose ? (el) => compose.onEditAreaName(el, area.id) : null}
          className="flex items-baseline gap-[14px]"
          pencilClassName="-right-[34px] top-1"
        >
          <span
            className="font-display min-w-[26px] italic text-accent"
            style={{ ...SERIF_DISPLAY, fontSize: 18 }}
          >
            {romanNumeral(index + 1)}
          </span>
          <span
            className="font-display font-normal text-marketing-ink"
            style={{
              ...SERIF_DISPLAY,
              fontSize: 44,
              lineHeight: 0.98,
              letterSpacing: -0.5,
            }}
          >
            {title}
          </span>
        </Editable>
        {area.dream.trim() ? (
          <Editable
            onEdit={compose ? (el) => compose.onEditDream(el, area.id) : null}
            className="font-display italic text-marketing-ink"
            style={{
              ...SERIF_TEXT,
              fontSize: 19,
              lineHeight: 1.38,
              paddingLeft: 40,
            }}
            pencilClassName="-right-[34px] top-0"
          >
            {area.dream.trim()}
          </Editable>
        ) : compose ? (
          <div style={{ paddingLeft: 40 }}>
            <button
              type="button"
              data-compose-chrome
              onClick={(e) => compose.onEditDream(e.currentTarget, area.id)}
              className="cursor-pointer text-left font-display text-[19px] italic leading-[1.38] text-marketing-eyebrow"
              style={SERIF_TEXT}
            >
              Add the dream…
            </button>
          </div>
        ) : null}
      </div>
      {area.looks.trim() ? (
        <Editable
          onEdit={compose ? (el) => compose.onEditLooks(el, area.id) : null}
          className="flex flex-col gap-1"
          style={{ paddingLeft: 40 }}
          pencilClassName="-right-[34px] top-0"
        >
          <span
            className="font-ui text-marketing-eyebrow"
            style={caps(9, 1.8)}
          >
            What it looks like
          </span>
          <span className="text-[14px] leading-[1.55] text-marketing-muted">
            {area.looks.trim()}
          </span>
        </Editable>
      ) : compose ? (
        <div style={{ paddingLeft: 40 }}>
          <button
            type="button"
            data-compose-chrome
            onClick={(e) => compose.onEditLooks(e.currentTarget, area.id)}
            className="cursor-pointer text-left text-[12px] text-marketing-eyebrow"
          >
            + What it looks like
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DesktopTiles({
  area,
  rowIndex,
  big,
  onImageMenu,
}: {
  area: PrintArea;
  rowIndex: number;
  big: number;
  onImageMenu?: ((el: HTMLElement, imageId: string) => void) | null;
}) {
  const layout = desktopTileLayout(area.images.length, big, rowIndex);
  const clickable = Boolean(onImageMenu) && area.images.length >= 2;
  const mountClick = (imageId: string) =>
    clickable && onImageMenu
      ? (el: HTMLElement) => onImageMenu(el, imageId)
      : null;
  if (layout.kind === "none") return null;
  if (layout.kind === "row") {
    return (
      <div className="flex items-center gap-[10px]">
        {layout.tiles.map((t, i) => (
          <PrintMount
            key={area.images[i]!.id}
            tile={t}
            src={area.images[i]!.src}
            pad={6}
            onClick={mountClick(area.images[i]!.id)}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-[10px]">
      <PrintMount
        tile={layout.main}
        src={area.images[0]!.src}
        pad={6}
        onClick={mountClick(area.images[0]!.id)}
      />
      <div className="flex flex-col gap-[10px]">
        <PrintMount
          tile={layout.side[0]}
          src={area.images[1]!.src}
          pad={6}
          onClick={mountClick(area.images[1]!.id)}
        />
        <PrintMount
          tile={layout.side[1]}
          src={area.images[2]!.src}
          pad={6}
          onClick={mountClick(area.images[2]!.id)}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- empty ghosts */

function GhostLine({ width }: { width: number }) {
  return (
    <span
      className="block rounded-[4px]"
      style={{
        height: 14,
        width,
        marginLeft: 40,
        background: "color-mix(in srgb, var(--gold) 70%, transparent)",
        opacity: 0.28,
      }}
    />
  );
}

function GhostRow({
  numeral,
  imageLeft,
  opacity,
  tilt,
}: {
  numeral: string;
  imageLeft: boolean;
  opacity: number;
  tilt: number;
}) {
  const slot = (
    <div
      className="flex shrink-0"
      style={{
        width: 300,
        justifyContent: imageLeft ? "flex-start" : "flex-end",
      }}
    >
      <div
        style={{
          width: 150,
          height: 150,
          boxSizing: "border-box",
          border: `1.5px dashed ${LIGHT}`,
          background: PAPER_FILL,
          transform: `rotate(${tilt}deg)`,
        }}
      />
    </div>
  );
  const text = (
    <div className="flex flex-1 flex-col gap-[10px]">
      <span className="flex items-baseline gap-[14px]">
        <span
          className="font-display min-w-[26px] italic"
          style={{
            ...SERIF_DISPLAY,
            fontSize: 18,
            color: LIGHT,
          }}
        >
          {numeral}
        </span>
        <span
          className="block rounded-[6px]"
          style={{
            height: 30,
            width: 240,
            background: "color-mix(in srgb, var(--gold) 70%, transparent)",
            opacity: 0.32,
          }}
        />
      </span>
      <GhostLine width={340} />
      <GhostLine width={240} />
    </div>
  );
  return (
    <div
      aria-hidden
      className="flex items-center gap-9"
      style={{ opacity }}
    >
      {imageLeft ? slot : text}
      {imageLeft ? text : slot}
    </div>
  );
}

/* ================================================================ DESKTOP */

export type DesktopPosterProps = {
  data: PrintData;
  compose: PrintCompose | null;
};

export const DesktopPoster = forwardRef<HTMLDivElement, DesktopPosterProps>(
  function DesktopPoster({ data, compose }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => rootRef.current as HTMLDivElement);

    const { firstName, statement, values, areas, notes } = data;
    const hasStatement = Boolean(statement.trim());
    const showValues = values.length > 0 || Boolean(compose);
    const showNotes = notes.length > 0 || Boolean(compose);
    const emptyAreas = areas.length === 0;
    const big = PRINT_BIG;

    return (
      <div
        ref={rootRef}
        data-manifesto-poster="desktop"
        className="font-ui relative flex shrink-0 flex-col text-marketing-ink"
        style={{
          ...PAPER_STYLE,
          width: PRINT_DESIGN_WIDTH,
          height: "auto",
          boxSizing: "border-box",
          padding: "58px 76px 44px",
          boxShadow: `0 2px 4px ${INK_06}, 0 24px 60px -20px ${INK_35}`,
        }}
      >
        {/* Double inner frame */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ inset: 18, border: `1px solid ${LIGHT}` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            inset: 23,
            border: `1px solid color-mix(in srgb, ${LIGHT} 45%, transparent)`,
          }}
        />

        {/* Header block (label → values) — keep together when printing */}
        <div data-print-break>
        {/* 1 · Label row */}
        <div
          className="flex items-center text-accent-link"
          style={{ ...caps(10, 3), gap: 16 }}
        >
          <Rule />
          <span>My manifesto</span>
          <Rule />
        </div>

        {/* 2 · Name */}
        <div
          className="font-display text-center italic text-marketing-ink"
          style={{
            ...SERIF_DISPLAY,
            marginTop: 18,
            fontWeight: 300,
            fontSize: 40,
            lineHeight: 1,
            letterSpacing: -0.4,
          }}
        >
          {firstName || "\u00a0"}
        </div>

        {/* 3 · Statement */}
        {hasStatement ? (
          <Editable
            onEdit={compose ? compose.onEditStatement : null}
            className="flex flex-col items-center"
            style={{ marginTop: 14 }}
            pencilClassName="-right-[50px] top-1"
          >
            <span
              className="font-display text-center italic text-marketing-ink"
              style={{
                ...SERIF_TEXT,
                maxWidth: 720,
                fontSize: 25,
                lineHeight: 1.42,
              }}
            >
              “{statement.trim()}”
            </span>
          </Editable>
        ) : compose ? (
          <button
            type="button"
            data-compose-chrome
            onClick={(e) => compose.onEditStatement(e.currentTarget)}
            className="flex cursor-pointer flex-col items-center gap-2 text-center"
            style={{
              marginTop: 16,
              padding: "22px 30px",
              borderRadius: 12,
              border: `1.5px dashed ${LIGHT}`,
              background: PAPER_FILL,
            }}
          >
            <PlusDisc size={30} />
            <span
              className="font-display text-[22px] italic leading-[1.4] text-marketing-eyebrow"
              style={SERIF_TEXT}
            >
              “Write the sentence you want to grow into.”
            </span>
            <span className="text-[12px] leading-[1.45] text-marketing-eyebrow">
              One line about who you’re becoming. It heads your print.
            </span>
          </button>
        ) : null}

        {/* 4 · Values */}
        {showValues ? (
          <>
            <DoubleRule className={hasStatement ? "mt-5" : "mt-[22px]"} />
            <div className="relative" style={{ padding: "12px 0" }}>
              {values.length > 0 ? (
                <div
                  className="font-ui text-center text-marketing-ink"
                  style={caps(11, 2.6)}
                >
                  {values.map((v, i) => (
                    <Fragment key={v.id}>
                      {i > 0 ? (
                        <span
                          aria-hidden
                          className="text-accent"
                          style={{ fontSize: 9, margin: "0 14px" }}
                        >
                          ✦
                        </span>
                      ) : null}
                      <Editable
                        inline
                        onEdit={compose ? (el) => compose.onEditValue(el, v.id) : null}
                        pencilClassName="-right-3 -top-4"
                      >
                        {v.text}
                      </Editable>
                    </Fragment>
                  ))}
                </div>
              ) : compose ? (
                <button
                  type="button"
                  data-compose-chrome
                  onClick={(e) => compose.onAddValue(e.currentTarget)}
                  className="flex w-full cursor-pointer items-center justify-center gap-[10px]"
                >
                  <PlusDisc size={26} />
                  <span className="text-[12px] font-semibold text-accent-link">
                    Add your values
                  </span>
                  <span className="text-[12px] leading-[1.45] text-marketing-eyebrow">
                    · the 3 to 5 things you want your choices to come from
                  </span>
                </button>
              ) : null}
              {compose && values.length > 0 ? (
                <AddCircle
                  label="Add a value"
                  onClick={compose.onAddValue}
                  size={30}
                  className="top-1/2"
                  style={{ right: -58, marginTop: -15 }}
                />
              ) : null}
            </div>
            <DoubleRule />
          </>
        ) : null}
        </div>

        {/* 5 · Life areas */}
        {areas.length > 0 ? (
          <div
            className="relative flex flex-col"
            style={{ marginTop: 26, gap: 18 }}
          >
            {areas.map((area, i) => {
              const imageLeft = i % 2 === 0;
              const hasImages = area.images.length > 0;
              const slotNeeded = hasImages || Boolean(compose);
              const placeholderTilt = desktopTileLayout(1, big, i);
              const tilt =
                placeholderTilt.kind === "row" ? placeholderTilt.tiles[0]!.tilt : 0;
              const singlePrint =
                area.images.length === 1 || (!hasImages && Boolean(compose));
              const slot = slotNeeded ? (
                <div
                  className="flex shrink-0"
                  style={{
                    width: 300,
                    padding: "6px 0",
                    justifyContent: singlePrint
                      ? "center"
                      : imageLeft
                        ? "flex-start"
                        : "flex-end",
                  }}
                >
                  {hasImages ? (
                    <DesktopTiles
                      area={area}
                      rowIndex={i}
                      big={big}
                      onImageMenu={
                        compose
                          ? (el, imageId) =>
                              compose.onImageMenu(el, area.id, imageId)
                          : null
                      }
                    />
                  ) : compose ? (
                    <ImagePlaceholder
                      areaTitle={area.title.trim() || "this area"}
                      tilt={tilt}
                      onClick={(el) => compose.onAddImage(el, area.id)}
                    />
                  ) : null}
                </div>
              ) : null;
              const text = (
                <AreaText area={area} index={i} compose={compose} />
              );
              return (
                <Fragment key={area.id}>
                  {i > 0 ? <Ornament /> : null}
                  <div
                    data-print-break
                    className="relative flex items-center gap-9"
                  >
                    {imageLeft ? slot : text}
                    {imageLeft ? text : slot}
                    {compose ? (
                      <AddCircle
                        label={`Add an image to ${area.title.trim() || "this area"}`}
                        onClick={(el) => compose.onAddImage(el, area.id)}
                        size={30}
                        className="top-1/2"
                        style={{ right: -58, marginTop: -15 }}
                      />
                    ) : null}
                  </div>
                </Fragment>
              );
            })}
            {compose ? (
              <AddAreaPill onClick={compose.onAddArea} height={30} bottom={-30} />
            ) : null}
          </div>
        ) : compose ? (
          <>
            {/* Fresh user: ghost first life area + fading rows II–IV */}
            <div
              className="flex items-center gap-9"
              style={{ marginTop: 30 }}
            >
              <div className="flex shrink-0" style={{ width: 300 }}>
                <button
                  type="button"
                  data-compose-chrome
                  onClick={(e) => compose.onAddArea(e.currentTarget)}
                  className="flex shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 text-center"
                  style={{
                    width: 166,
                    height: 166,
                    boxSizing: "border-box",
                    border: `1.5px dashed ${LIGHT}`,
                    background: PAPER_FILL,
                    transform: "rotate(-1.2deg)",
                  }}
                >
                  <PlusDisc size={30} />
                  <span className="text-[12px] font-semibold text-accent-link">
                    Add images
                  </span>
                </button>
              </div>
              <div className="flex flex-1 flex-col gap-[10px]">
                <span className="flex items-baseline gap-[14px]">
                  <span
                    className="font-display min-w-[26px] italic"
                    style={{ ...SERIF_DISPLAY, fontSize: 18, color: LIGHT }}
                  >
                    I
                  </span>
                  <span
                    className="font-display"
                    style={{
                      ...SERIF_DISPLAY,
                      fontSize: 44,
                      lineHeight: 1,
                      color: LIGHT,
                    }}
                  >
                    Your first life area
                  </span>
                </span>
                <div
                  className="flex flex-col gap-[10px]"
                  style={{ paddingLeft: 40 }}
                >
                  <span className="text-[13px] leading-[1.45] text-marketing-eyebrow">
                    Music, work, health, people… an area of your life you want
                    to grow. Give it a name and a dream, then pin images to it.
                  </span>
                  <button
                    type="button"
                    data-compose-chrome
                    onClick={(e) => compose.onAddArea(e.currentTarget)}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 self-start whitespace-nowrap rounded-full border bg-card px-4 text-[13px] font-semibold text-accent-link shadow-[0_4px_12px_rgb(27_35_51_/_0.1)]"
                    style={{ borderColor: LIGHT }}
                  >
                    <Plus aria-hidden className="size-[14px]" strokeWidth={2} />
                    Add a life area
                  </button>
                </div>
              </div>
            </div>
            <div style={{ marginTop: 26 }}>
              <Ornament />
            </div>
            <div style={{ marginTop: 22 }}>
              <GhostRow numeral="II" imageLeft={false} opacity={0.5} tilt={1.1} />
              <div style={{ margin: "20px 0", opacity: 0.6 }}>
                <Ornament />
              </div>
              <GhostRow numeral="III" imageLeft opacity={0.32} tilt={-1.0} />
              <div style={{ margin: "20px 0", opacity: 0.6 }}>
                <Ornament />
              </div>
              <GhostRow numeral="IV" imageLeft={false} opacity={0.18} tilt={1.1} />
            </div>
          </>
        ) : null}

        {/* 5b · Story chapter */}
        {data.story ? (
          <PrintStoryChapter
            data={data.story}
            compose={compose?.storyCompose ?? null}
            mobile={false}
          />
        ) : null}

        {/* 6 · Words to keep */}
        {showNotes ? (
          <div
            className="relative flex flex-col"
            style={{ paddingTop: 30, gap: 18 }}
          >
            <WordsLabel mobile={false} />
            <div className="relative">
              <div
                className="grid items-start"
                style={{
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  columnGap: 22,
                  rowGap: 18,
                }}
              >
                {notes.length > 0 ? (
                  notes.map((n, i) => (
                    <div key={`${n.kind}-${n.id}`} data-print-break>
                      <NoteCard
                        note={n}
                        index={i}
                        mobile={false}
                        onMenu={
                          compose ? (el) => compose.onNoteMenu(el, n) : null
                        }
                      />
                    </div>
                  ))
                ) : compose ? (
                  <GhostNote onClick={compose.onAddNote} />
                ) : null}
              </div>
              {compose && notes.length > 0 ? (
                <AddCircle
                  label="Add a note"
                  onClick={compose.onAddNote}
                  size={30}
                  className="top-1/2"
                  style={{ right: -58, marginTop: -15 }}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {/* 7 · Footer */}
        <PosterFooter mobile={false} className="mt-[22px]" />
      </div>
    );
  },
);

/* ================================================================= MOBILE */

function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export type MobilePosterProps = {
  data: PrintData;
  compose: PrintCompose | null;
  /** Fixed width (export stage). Omit for a fluid card. */
  width?: number;
};

export const MobilePoster = forwardRef<HTMLDivElement, MobilePosterProps>(
  function MobilePoster({ data, compose, width }, ref) {
    const rootRef = useRef<HTMLDivElement>(null);
    useImperativeHandle(ref, () => rootRef.current as HTMLDivElement);
    const measured = useElementWidth(rootRef);
    const inner = Math.max(120, (width ?? measured) - 44);

    const { firstName, statement, values, areas, notes } = data;
    const hasStatement = Boolean(statement.trim());
    const showValues = values.length > 0 || Boolean(compose);
    const showNotes = notes.length > 0 || Boolean(compose);

    return (
      <div
        ref={rootRef}
        data-manifesto-poster="mobile"
        className="font-ui relative flex flex-col text-marketing-ink"
        style={{
          ...PAPER_STYLE,
          ...(width ? { width } : {}),
          padding: "34px 22px 26px",
          boxShadow: `0 2px 4px ${INK_06}, 0 16px 40px -18px ${INK_35}`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ inset: 10, border: `1px solid ${LIGHT}` }}
        />

        <div
          className="flex items-center text-accent-link"
          style={{ ...caps(9, 2.4), gap: 10 }}
        >
          <Rule />
          <span>My manifesto</span>
          <Rule />
        </div>
        <div
          className="font-display text-center italic text-marketing-ink"
          style={{
            ...SERIF_DISPLAY,
            marginTop: 18,
            fontWeight: 300,
            fontSize: 34,
            lineHeight: 1,
            letterSpacing: -0.3,
          }}
        >
          {firstName || "\u00a0"}
        </div>

        {hasStatement ? (
          <Editable
            onEdit={compose ? compose.onEditStatement : null}
            className="flex flex-col items-center"
            style={{ marginTop: 14 }}
            pencilClassName="-right-2 -top-3"
          >
            <span
              className="font-display text-center italic text-marketing-ink"
              style={{ ...SERIF_TEXT, fontSize: 19, lineHeight: 1.42 }}
            >
              “{statement.trim()}”
            </span>
          </Editable>
        ) : compose ? (
          <button
            type="button"
            data-compose-chrome
            onClick={(e) => compose.onEditStatement(e.currentTarget)}
            className="flex cursor-pointer flex-col items-center gap-2 text-center"
            style={{
              marginTop: 16,
              padding: "18px 18px",
              borderRadius: 12,
              border: `1.5px dashed ${LIGHT}`,
              background: PAPER_FILL,
            }}
          >
            <PlusDisc size={28} />
            <span
              className="font-display text-[18px] italic leading-[1.4] text-marketing-eyebrow"
              style={SERIF_TEXT}
            >
              “Write the sentence you want to grow into.”
            </span>
            <span className="text-[12px] leading-[1.45] text-marketing-eyebrow">
              One line about who you’re becoming. It heads your print.
            </span>
          </button>
        ) : null}

        {showValues ? (
          <>
            <DoubleRule className="mt-5" />
            <div className="relative" style={{ padding: "10px 0" }}>
              {values.length > 0 ? (
                <div
                  className="font-ui flex flex-wrap justify-center text-marketing-ink"
                  style={{ ...caps(10, 2), columnGap: 14, rowGap: 6 }}
                >
                  {values.map((v) => (
                    <Editable
                      key={v.id}
                      inline
                      className="whitespace-nowrap"
                      onEdit={compose ? (el) => compose.onEditValue(el, v.id) : null}
                      pencilClassName="-right-3 -top-4"
                    >
                      {v.text}
                    </Editable>
                  ))}
                </div>
              ) : compose ? (
                <button
                  type="button"
                  data-compose-chrome
                  onClick={(e) => compose.onAddValue(e.currentTarget)}
                  className="flex w-full cursor-pointer flex-wrap items-center justify-center gap-x-2.5 gap-y-1"
                >
                  <PlusDisc size={26} />
                  <span className="text-[12px] font-semibold text-accent-link">
                    Add your values
                  </span>
                  <span className="text-[12px] leading-[1.45] text-marketing-eyebrow">
                    · the 3 to 5 things you want your choices to come from
                  </span>
                </button>
              ) : null}
              {compose && values.length > 0 ? (
                <AddCircle
                  label="Add a value"
                  onClick={compose.onAddValue}
                  size={28}
                  style={{ right: -16, bottom: -14 }}
                />
              ) : null}
            </div>
            <DoubleRule />
          </>
        ) : null}

        {areas.length > 0 ? (
          <div
            className="relative flex flex-col"
            style={{ marginTop: 30, gap: 26 }}
          >
            {areas.map((area, i) => {
              const tiles = mobileTileSizes(area.images.length, inner);
              const title = area.title.trim() || "Untitled";
              return (
                <Fragment key={area.id}>
                  {i > 0 ? <Ornament /> : null}
                  <div className="flex flex-col" style={{ gap: 14 }}>
                    <div className="relative">
                      <Editable
                        onEdit={compose ? (el) => compose.onEditAreaName(el, area.id) : null}
                        className="flex items-baseline gap-3"
                        pencilClassName="-right-1 -top-4"
                      >
                        <span
                          className="font-display italic text-accent"
                          style={{ ...SERIF_DISPLAY, fontSize: 15 }}
                        >
                          {romanNumeral(i + 1)}
                        </span>
                        <span
                          className="font-display text-marketing-ink"
                          style={{
                            ...SERIF_DISPLAY,
                            fontSize: 34,
                            lineHeight: 1,
                            letterSpacing: -0.3,
                          }}
                        >
                          {title}
                        </span>
                      </Editable>
                      {compose ? (
                        <AddCircle
                          label={`Add an image to ${title}`}
                          onClick={(el) => compose.onAddImage(el, area.id)}
                          size={28}
                          style={{ right: -2, top: 2 }}
                        />
                      ) : null}
                    </div>
                    {tiles.length > 0 ? (
                      <div
                        className="flex"
                        style={{
                          gap: 10,
                          padding: "4px 0",
                          justifyContent: tiles.length === 1 ? "center" : "flex-start",
                        }}
                      >
                        {tiles.map((t, k) => {
                          const img = area.images[k]!;
                          const canPickMain =
                            Boolean(compose) && area.images.length >= 2;
                          return (
                            <PrintMount
                              key={img.id}
                              tile={t}
                              src={img.src}
                              pad={5}
                              onClick={
                                canPickMain && compose
                                  ? (el) =>
                                      compose.onImageMenu(el, area.id, img.id)
                                  : null
                              }
                            />
                          );
                        })}
                      </div>
                    ) : compose ? (
                      <div
                        className="flex"
                        style={{ padding: "4px 0", justifyContent: "center" }}
                      >
                        <ImagePlaceholder
                          areaTitle={title}
                          tilt={-1.6}
                          onClick={(el) => compose.onAddImage(el, area.id)}
                        />
                      </div>
                    ) : null}
                    {area.dream.trim() ? (
                      <Editable
                        onEdit={compose ? (el) => compose.onEditDream(el, area.id) : null}
                        className="font-display italic text-marketing-ink"
                        style={{ ...SERIF_TEXT, fontSize: 17, lineHeight: 1.4 }}
                        pencilClassName="-right-1 -top-4"
                      >
                        {area.dream.trim()}
                      </Editable>
                    ) : compose ? (
                      <button
                        type="button"
                        data-compose-chrome
                        onClick={(e) => compose.onEditDream(e.currentTarget, area.id)}
                        className="cursor-pointer text-left font-display text-[17px] italic leading-[1.4] text-marketing-eyebrow"
                        style={SERIF_TEXT}
                      >
                        Add the dream…
                      </button>
                    ) : null}
                    {area.looks.trim() ? (
                      <Editable
                        onEdit={compose ? (el) => compose.onEditLooks(el, area.id) : null}
                        className="flex flex-col gap-[3px]"
                        pencilClassName="-right-1 -top-4"
                      >
                        <span
                          className="font-ui text-marketing-eyebrow"
                          style={caps(8.5, 1.6)}
                        >
                          What it looks like
                        </span>
                        <span className="text-[13px] leading-[1.5] text-marketing-muted">
                          {area.looks.trim()}
                        </span>
                      </Editable>
                    ) : compose ? (
                      <button
                        type="button"
                        data-compose-chrome
                        onClick={(e) => compose.onEditLooks(e.currentTarget, area.id)}
                        className="cursor-pointer text-left text-[12px] text-marketing-eyebrow"
                      >
                        + What it looks like
                      </button>
                    ) : null}
                  </div>
                </Fragment>
              );
            })}
            {compose ? (
              <AddAreaPill onClick={compose.onAddArea} height={28} bottom={-36} />
            ) : null}
          </div>
        ) : compose ? (
          <div className="flex flex-col gap-3" style={{ marginTop: 30 }}>
            <span className="flex items-baseline gap-3">
              <span
                className="font-display italic"
                style={{ ...SERIF_DISPLAY, fontSize: 15, color: LIGHT }}
              >
                I
              </span>
              <span
                className="font-display"
                style={{
                  ...SERIF_DISPLAY,
                  fontSize: 30,
                  lineHeight: 1,
                  color: LIGHT,
                }}
              >
                Your first life area
              </span>
            </span>
            <span className="text-[13px] leading-[1.45] text-marketing-eyebrow">
              Music, work, health, people… an area of your life you want to
              grow. Give it a name and a dream, then pin images to it.
            </span>
            <button
              type="button"
              data-compose-chrome
              onClick={(e) => compose.onAddArea(e.currentTarget)}
              className="inline-flex h-9 cursor-pointer items-center gap-2 self-start whitespace-nowrap rounded-full border bg-card px-4 text-[13px] font-semibold text-accent-link shadow-[0_4px_12px_rgb(27_35_51_/_0.1)]"
              style={{ borderColor: LIGHT }}
            >
              <Plus aria-hidden className="size-[14px]" strokeWidth={2} />
              Add a life area
            </button>
          </div>
        ) : null}

        {data.story ? (
          <PrintStoryChapter
            data={data.story}
            compose={compose?.storyCompose ?? null}
            mobile
          />
        ) : null}

        {showNotes ? (
          <div
            className="flex flex-col"
            style={{ marginTop: 44, gap: 16 }}
          >
            <div className="relative">
              <WordsLabel mobile />
              {compose && notes.length > 0 ? (
                <AddCircle
                  label="Add a note"
                  onClick={compose.onAddNote}
                  size={28}
                  className="top-1/2"
                  style={{ right: -2, marginTop: -14 }}
                />
              ) : null}
            </div>
            <div
              className="grid grid-cols-2 items-start"
              style={{ gap: "18px 14px", padding: "4px 2px" }}
            >
              {notes.length > 0 ? (
                notes.map((n, i) => (
                  <NoteCard
                    key={`${n.kind}-${n.id}`}
                    note={n}
                    index={i}
                    mobile
                    onMenu={compose ? (el) => compose.onNoteMenu(el, n) : null}
                  />
                ))
              ) : compose ? (
                <GhostNote onClick={compose.onAddNote} />
              ) : null}
            </div>
          </div>
        ) : null}

        <PosterFooter mobile className="mt-[18px]" />
      </div>
    );
  },
);

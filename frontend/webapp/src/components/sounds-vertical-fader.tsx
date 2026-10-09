import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

const GUTTER = 28;
const CAP_H = 18;
const CAP_W = 44;
const TRACK_W = 6;
/** Horizontal cap: 18 wide × 34 tall. */
const H_CAP_W = 18;
const H_CAP_H = 34;
const TICKS = [0, 25, 50, 75, 100] as const;

function clampGain(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/**
 * Sounds-page fader (new component — not shared with Create mixer).
 *
 * Vertical (default): explicit height so flex cannot collapse the track —
 * 340px from `md`, 400px from `xl`. Pass `trackLengthPx` to pin a fixed height.
 *
 * Horizontal: 6px track filling from the left with an 18×34 cap (mobile rows).
 */
export function SoundsVerticalFader({
  value,
  onChange,
  onLiveChange,
  disabled = false,
  dimmed = false,
  ariaLabel,
  orientation = "vertical",
  trackLengthPx,
}: {
  value: number;
  onChange: (gain: number) => void;
  onLiveChange?: (gain: number) => void;
  disabled?: boolean;
  dimmed?: boolean;
  ariaLabel: string;
  orientation?: "vertical" | "horizontal";
  /** Fixed vertical track height in px; overrides the responsive 340/400. */
  trackLengthPx?: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const gain = clampGain(value);
  const inert = disabled || dimmed;
  const horizontal = orientation === "horizontal";

  const valueFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = trackRef.current;
      if (!el) return gain;
      const rect = el.getBoundingClientRect();
      if (horizontal) {
        if (rect.width <= 0) return gain;
        return clampGain(Math.round(((clientX - rect.left) / rect.width) * 100));
      }
      if (rect.height <= 0) return gain;
      const t = 1 - (clientY - rect.top) / rect.height;
      return clampGain(Math.round(t * 100));
    },
    [gain, horizontal],
  );

  const commit = useCallback(
    (next: number) => {
      const g = clampGain(next);
      onLiveChange?.(g);
      onChange(g);
    },
    [onChange, onLiveChange],
  );

  function onPointerDown(e: ReactPointerEvent) {
    if (inert) return;
    e.preventDefault();
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    commit(valueFromPointer(e.clientX, e.clientY));
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!draggingRef.current || inert) return;
    const g = valueFromPointer(e.clientX, e.clientY);
    onLiveChange?.(g);
    onChange(g);
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (inert) return;
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = gain + 1;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = gain - 1;
    else if (e.key === "PageUp") next = gain + 10;
    else if (e.key === "PageDown") next = gain - 10;
    else if (e.key === "Home") next = 100;
    else if (e.key === "End") next = 0;
    if (next == null) return;
    e.preventDefault();
    commit(next);
  }

  const fillPct = gain;
  const accentColor = dimmed ? "var(--border)" : "var(--accent, var(--color-accent))";

  const sliderProps = {
    role: "slider" as const,
    tabIndex: inert ? -1 : 0,
    "aria-orientation": orientation,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": gain,
    "aria-label": ariaLabel,
    "aria-disabled": inert || undefined,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onKeyDown,
  };

  if (horizontal) {
    return (
      <div
        className="relative min-w-0 flex-1"
        style={{ height: H_CAP_H, paddingLeft: H_CAP_W / 2, paddingRight: H_CAP_W / 2 }}
      >
        <div
          ref={trackRef}
          {...sliderProps}
          className={`relative h-full ${inert ? "cursor-default" : "cursor-pointer"}`}
          style={{ touchAction: "none" }}
        >
          <div
            className="absolute left-0 top-1/2 w-full -translate-y-1/2 rounded-[3px] bg-muted/40"
            style={{ height: TRACK_W }}
            aria-hidden
          />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-[3px]"
            style={{
              height: TRACK_W,
              width: `${fillPct}%`,
              backgroundColor: accentColor,
            }}
            aria-hidden
          />
          <div
            className="absolute top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-[3px] rounded-md border-[1.5px] bg-card shadow-sm"
            style={{
              width: H_CAP_W,
              height: H_CAP_H,
              left: `${fillPct}%`,
              borderColor: accentColor,
            }}
            aria-hidden
          >
            <span className="h-[14px] w-[1.5px] bg-muted" />
            <span className="h-[14px] w-[1.5px] bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const capBottom = `calc(${fillPct}% - ${CAP_H / 2}px)`;

  return (
    <div
      className={`relative shrink-0 ${
        trackLengthPx == null ? "h-[340px] xl:h-[400px]" : ""
      }`}
      style={{
        height: trackLengthPx,
        margin: "6px 0",
        paddingLeft: GUTTER,
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[18px]">
        {TICKS.map((t) => (
          <div
            key={t}
            className="absolute right-0 flex translate-y-1/2 items-center gap-0.5"
            style={{ bottom: `${t}%` }}
          >
            <span className="w-[18px] text-right text-[10px] tabular-nums text-muted">
              {t}
            </span>
            <span className="h-px w-1.5 bg-border" aria-hidden />
          </div>
        ))}
      </div>
      <div
        ref={trackRef}
        {...sliderProps}
        className={`relative h-full ${inert ? "cursor-default" : "cursor-pointer"}`}
        style={{ touchAction: "none" }}
      >
        <div
          className="absolute left-1/2 top-0 h-full -translate-x-1/2 rounded-[3px] bg-muted/40"
          style={{ width: TRACK_W }}
          aria-hidden
        />
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[3px]"
          style={{
            width: TRACK_W,
            height: `${fillPct}%`,
            backgroundColor: accentColor,
          }}
          aria-hidden
        />
        <div
          className="absolute left-1/2 z-10 flex -translate-x-1/2 flex-col items-center justify-center gap-[3px] rounded-md border-[1.5px] border-accent bg-card shadow-sm"
          style={{
            width: CAP_W,
            height: CAP_H,
            bottom: capBottom,
            borderColor: accentColor,
          }}
          aria-hidden
        >
          <span className="h-[1.5px] w-[22px] bg-muted" />
          <span className="h-[1.5px] w-[22px] bg-muted" />
        </div>
      </div>
    </div>
  );
}

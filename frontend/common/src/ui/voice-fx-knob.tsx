import { useCallback, useRef } from "react";
import { clampVoiceFxDial } from "../audio/voice-fx-dial";

/** 8 o'clock → 4 o'clock, clockwise from 12. */
const START_DEG = 240;
const SWEEP_DEG = 240;

function polar(cx: number, cy: number, r: number, clockDeg: number) {
  const rad = (clockDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, endDeg);
  const sweep = (endDeg - startDeg + 360) % 360;
  const large = sweep > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function pointerToValue(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): number {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const deg =
    ((Math.atan2(clientX - cx, -(clientY - cy)) * 180) / Math.PI + 360) % 360;
  let fromStart = (deg - START_DEG + 360) % 360;
  if (fromStart > SWEEP_DEG) {
    const gapMid = SWEEP_DEG + (360 - SWEEP_DEG) / 2;
    fromStart = fromStart < gapMid ? SWEEP_DEG : 0;
  }
  return Math.round((fromStart / SWEEP_DEG) * 100);
}

export function VoiceFxKnob({
  value,
  onChange,
  onCommit,
  disabled = false,
  size = 52,
}: {
  value: number;
  onChange: (n: number) => void;
  onCommit?: (n: number) => void;
  disabled?: boolean;
  size?: number;
}) {
  const dial = clampVoiceFxDial(value);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);
  const lastRef = useRef(dial);
  lastRef.current = dial;

  const applyPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = svgRef.current;
      if (!el) return;
      const next = pointerToValue(el.getBoundingClientRect(), clientX, clientY);
      if (next === lastRef.current) return;
      lastRef.current = next;
      onChange(next);
    },
    [onChange],
  );

  const finish = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    onCommit?.(lastRef.current);
  }, [onCommit]);

  const angle = START_DEG + (dial / 100) * SWEEP_DEG;
  const cx = 50;
  const cy = 50;
  const trackR = 40;
  const tip = polar(cx, cy, 28, angle);
  const hub = polar(cx, cy, 8, angle);

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Voice FX amount"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={dial}
      aria-disabled={disabled || undefined}
      className={`shrink-0 select-none outline-none ${
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"
      } touch-none focus-visible:ring-2 focus-visible:ring-accent/50`}
      onPointerDown={(e) => {
        if (disabled) return;
        e.preventDefault();
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        applyPointer(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current || disabled) return;
        applyPointer(e.clientX, e.clientY);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={(e) => {
        if (disabled) return;
        let next = dial;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = dial - 1;
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = dial + 1;
        else if (e.key === "PageDown") next = dial - 10;
        else if (e.key === "PageUp") next = dial + 10;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = 100;
        else return;
        e.preventDefault();
        const clamped = clampVoiceFxDial(next);
        lastRef.current = clamped;
        onChange(clamped);
      }}
      onKeyUp={(e) => {
        if (
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "Home" ||
          e.key === "End" ||
          e.key === "PageUp" ||
          e.key === "PageDown"
        ) {
          onCommit?.(lastRef.current);
        }
      }}
    >
      <path
        d={arcPath(cx, cy, trackR, START_DEG, START_DEG + SWEEP_DEG)}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        className="text-border"
      />
      {dial > 0 ? (
        <path
          d={arcPath(cx, cy, trackR, START_DEG, angle)}
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          className="text-accent"
        />
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r="30"
        className="fill-card stroke-border"
        strokeWidth="2"
      />
      <line
        x1={hub.x}
        y1={hub.y}
        x2={tip.x}
        y2={tip.y}
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        className="text-foreground"
      />
      <circle cx={cx} cy={cy} r="4" className="fill-foreground" />
    </svg>
  );
}

import { Play } from "lucide-react";
import type { CSSProperties } from "react";

/* Static marketing illustrations for /newhome. Decorative unless noted. */

/** Meditation card artwork (mountains at dusk). */
export function SceneSummit() {
  return (
    <svg
      viewBox="0 0 200 150"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="200" height="150" fill="#E9C08A" />
      <circle cx="140" cy="62" r="14" fill="#FBEBD0" />
      <path
        d="M0 110 L45 58 L75 90 L110 48 L150 96 L200 80 L200 150 L0 150Z"
        fill="#7C6A63"
      />
      <path
        d="M0 128 L60 92 L105 120 L150 100 L200 124 L200 150 L0 150Z"
        fill="#4E4651"
      />
    </svg>
  );
}

/** Vision tile: "Working from anywhere". */
export function SceneHarbour() {
  return (
    <svg
      viewBox="0 0 200 150"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="200" height="150" fill="#9FB3C8" />
      <circle cx="60" cy="66" r="16" fill="#F6E4C4" />
      <rect y="88" width="200" height="62" fill="#5F7389" />
      <path d="M0 134 Q100 122 200 138 V150 H0Z" fill="#D9C4A2" />
    </svg>
  );
}

/** Vision tile: "Sundays with the people I love". */
export function SceneMeadow() {
  return (
    <svg
      viewBox="0 0 200 150"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <rect width="200" height="150" fill="#B7C29A" />
      <rect width="200" height="58" fill="#EAD9B6" />
      <path d="M0 58 Q50 40 100 56 T200 50 V70 H0Z" fill="#7F946A" />
      <g fill="#5F7552">
        <circle cx="30" cy="84" r="18" />
        <circle cx="170" cy="86" r="20" />
      </g>
    </svg>
  );
}

/** The person placed in each vision-board picture. */
export function VisionFigure({ left }: { left: string }) {
  return (
    <svg
      className="ns-figure"
      viewBox="0 0 40 60"
      style={{ left } as CSSProperties}
      aria-hidden="true"
    >
      <circle cx="20" cy="14" r="8" fill="#E7C3A4" />
      <path
        d="M12 12 Q12 4 20 4 Q28 4 28 12 Q25 8 20 8 Q15 8 12 12Z"
        fill="#5A3E2E"
      />
      <path d="M6 60 Q7 26 20 25 Q33 26 34 60Z" fill="#4E4352" />
    </svg>
  );
}

/** Round play control (decorative; the cards are static illustrations). */
export function PlayDisc({ size = 13 }: { size?: number }) {
  return (
    <span className="ns-play" aria-hidden="true">
      <Play size={size} fill="currentColor" strokeWidth={0} />
    </span>
  );
}

/** Decorative waveform. `played` bars are bright, the rest are dimmed. */
export function Waveform({
  heights,
  played,
  className,
}: {
  heights: readonly number[];
  played: number;
  className?: string;
}) {
  return (
    <span className={`ns-wave${className ? ` ${className}` : ""}`} aria-hidden="true">
      {heights.map((h, i) => (
        <i
          key={i}
          className={i < played ? undefined : "is-rest"}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

export const WAVE_MEDITATE = [
  8, 24, 34, 37, 32, 21, 10, 12, 13, 9, 12, 15, 12, 12, 24, 34, 38, 34, 21, 10,
  25, 35, 36, 29, 18, 9, 12, 11, 9, 14, 16, 11, 14, 26, 36, 39, 33, 19, 13, 27,
  34, 34, 26, 16, 8, 11, 8, 12,
] as const;

export const WAVE_STORY = [
  8, 20, 29, 32, 28, 20, 12, 8, 8, 13, 20, 25, 25, 18, 8, 21, 31, 36, 34, 26,
  16, 8, 12, 10, 10, 16, 18, 15, 8, 20, 31, 37, 36, 29, 18, 8, 16, 18, 15, 9,
  11, 11, 8, 17, 27, 34, 36, 30, 19, 9, 20, 25, 24, 19,
] as const;

export const WAVE_COMPACT = [
  6, 18, 26, 28, 24, 16, 7, 9, 10, 7, 9, 11, 9, 9, 18, 26, 29, 26, 16, 7, 19,
  26, 27, 22, 14, 6, 9, 8, 7, 11, 12, 8, 10, 20,
] as const;

/** Focus progress ring on the "connected" Focus card. */
export function FocusRing({ size }: { size: number }) {
  return (
    <svg
      className="ns-ring"
      width={size}
      height={size}
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      <circle className="ns-ring-track" cx="22" cy="22" r="18" />
      <circle
        className="ns-ring-arc"
        cx="22"
        cy="22"
        r="18"
        strokeDasharray="85 113"
        transform="rotate(-90 22 22)"
      />
    </svg>
  );
}

const WEEKS = [
  ["Week 1", "mb"],
  ["Week 2", "mb"],
  ["Week 3", "mid"],
  ["Week 4", "mb"],
  ["Week 5", "mid"],
  ["Week 6", "mid"],
  ["Week 7", "mg"],
  ["Week 8", "mg"],
] as const;

const LEVEL_LABEL = {
  mb: "Mostly bad",
  mid: "Mixed",
  mg: "Mostly good",
} as const;

/**
 * "How it's felt · 8 weeks": one series, three gridlines.
 * `tall` is the mobile proportion (taller plot).
 */
export function HealChart({ tall = false }: { tall?: boolean }) {
  const x0 = 86;
  const x1 = 386;
  const bad = tall ? 160 : 120;
  const mid = tall ? 87 : 67;
  const good = 14;
  const axisY = tall ? 182 : 142;
  const height = tall ? 190 : 150;
  const y = {
    mb: (bad + mid) / 2,
    mid,
    mg: (mid + good) / 2,
  } as const;
  const step = (x1 - x0) / (WEEKS.length - 1);
  const points = WEEKS.map(([label, level], i) => ({
    label,
    level,
    x: x0 + step * i,
    y: y[level],
  }));
  const last = points.length - 1;

  return (
    <svg
      viewBox={`0 0 400 ${height}`}
      role="img"
      aria-label="Weekly check-ins over 8 weeks, rising from mostly bad to mostly good"
    >
      {(
        [
          ["Bad day", bad],
          ["Mixed", mid],
          ["Good day", good],
        ] as const
      ).map(([label, gy]) => (
        <g key={label}>
          <line className="ns-chart-grid" x1={x0} x2={x1} y1={gy} y2={gy} />
          <text className="ns-chart-text" x={76} y={gy + 4} textAnchor="end">
            {label}
          </text>
        </g>
      ))}
      <polyline
        className="ns-chart-line"
        points={points.map((p) => `${p.x.toFixed(1)},${p.y}`).join(" ")}
      />
      {points.map((p, i) => (
        <circle
          key={p.label}
          className={`ns-chart-point${i === last ? " is-last" : ""}`}
          cx={p.x.toFixed(1)}
          cy={p.y}
          r={i === last ? 5 : 4}
        >
          <title>{`${p.label}: ${LEVEL_LABEL[p.level]}`}</title>
        </circle>
      ))}
      <text className="ns-chart-text" x={x0} y={axisY}>
        October
      </text>
      <text className="ns-chart-text" x={x1} y={axisY} textAnchor="end">
        This week
      </text>
    </svg>
  );
}

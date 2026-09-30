/** Brand sun mark (fine sun). Colour via `currentColor` / `fill` prop — no hardcoded tokens. */
export const LOGO_MARK_FILL = "#F0A865";

const RAYS = [
  [36.5, 24, 45, 24],
  [32.84, 32.84, 38.85, 38.85],
  [24, 36.5, 24, 45],
  [15.16, 32.84, 9.15, 38.85],
  [11.5, 24, 3, 24],
  [15.16, 15.16, 9.15, 9.15],
  [24, 11.5, 24, 3],
  [32.84, 15.16, 38.85, 9.15],
  [35.59, 28.68, 39.3, 30.18],
  [28.88, 35.51, 30.45, 39.19],
  [19.32, 35.59, 17.82, 39.3],
  [12.49, 28.88, 8.81, 30.45],
  [12.41, 19.32, 8.7, 17.82],
  [19.12, 12.49, 17.55, 8.81],
  [28.68, 12.41, 30.18, 8.7],
  [35.51, 19.12, 39.19, 17.55],
] as const;

export function LogoMark({
  size = 34,
  className,
  fill = "currentColor",
}: {
  size?: number;
  className?: string;
  /** Defaults to `currentColor` so parents can theme light vs dark. */
  fill?: string;
}) {
  /** Gradient mark for large placements (64px+); flat elsewhere. */
  if (size >= 64) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- brand asset; avoid gradient-id collisions
      <img
        src="/sun-gradient.svg"
        width={size}
        height={size}
        alt=""
        aria-hidden
        className={className}
        draggable={false}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
      focusable="false"
    >
      <circle cx="24" cy="24" r="8.2" fill={fill} />
      <g
        stroke={fill}
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      >
        {RAYS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
    </svg>
  );
}

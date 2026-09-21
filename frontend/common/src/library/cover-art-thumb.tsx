/** Square cover thumb for library cards + now-playing strip. */

type CoverArtThumbProps = {
  src?: string | null;
  alt?: string;
  className?: string;
  /** Fixed square sizes in px (inline — not dependent on Tailwind scanning common). */
  size?: "sm" | "md" | "lg" | "card" | "player";
  /** Overrides `size` when set (e.g. list cards matched to content height). */
  edgePx?: number;
};

/** Pixel edge length per size token. */
const SIZE_PX = {
  sm: 40,
  md: 56,
  lg: 64,
  /** List card — one title line + 3 desc lines + meta. */
  card: 113,
  /** Now-playing strip. */
  player: 64,
} as const;

function PlaceholderMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.5l1.1 3.4 3.5 1.1-3.5 1.1L12 12.5l-1.1-3.4-3.5-1.1 3.5-1.1L12 3.5z" />
      <path d="M18 13.5l0.55 1.7 1.7.55-1.7.55L18 18l-.55-1.7-1.7-.55 1.7-.55L18 13.5z" />
      <path d="M5.5 14.5l0.45 1.4 1.4.45-1.4.45L5.5 18.2l-.45-1.4-1.4-.45 1.4-.45.45-1.4z" />
    </svg>
  );
}

/**
 * Photoreal cover when available; soft gradient sparkle placeholder otherwise
 * (matches library mockup artwork slot).
 */
export function CoverArtThumb({
  src,
  alt = "",
  className = "",
  size = "md",
  edgePx,
}: CoverArtThumbProps) {
  const url = typeof src === "string" ? src.trim() : "";
  const px = edgePx != null && edgePx > 0 ? Math.round(edgePx) : SIZE_PX[size];
  const dim = { width: px, height: px, minWidth: px, minHeight: px };
  const box = `shrink-0 overflow-hidden rounded-xl ${className}`;

  if (url) {
    return (
      <img
        src={url}
        alt={alt}
        width={px}
        height={px}
        style={dim}
        className={`${box} object-cover bg-surface-2`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <div
      style={dim}
      className={`${box} flex items-center justify-center bg-gradient-to-br from-accent/35 via-accent-soft/50 to-selected/25 text-accent/70`}
      aria-hidden={alt ? undefined : true}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      <PlaceholderMark className="h-[45%] w-[45%] opacity-80" />
    </div>
  );
}

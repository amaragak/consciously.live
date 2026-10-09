/** Square cover thumb for library cards + now-playing strip. */

import { useEffect, useState } from "react";

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
  player: 56,
} as const;

const GREY_SLOT = "bg-muted/35";

/**
 * Photoreal cover when available; neutral grey slot while loading or when
 * missing/broken (no decorative placeholder art).
 *
 * Eager load: the app scrolls inside `<main overflow-y-auto>`, and native
 * `loading="lazy"` often never fetches images in that nested scrollport.
 *
 * When a URL arrives, keep the grey underneath and fade the image in once
 * decoded so library rows that were open during generation feel smooth.
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
  const dim = {
    width: px,
    height: px,
    minWidth: px,
    minHeight: px,
    flexShrink: 0,
  };
  const box = `shrink-0 overflow-hidden rounded-xl ${className}`;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const broken = Boolean(url) && failedUrl === url;
  const shown = Boolean(url) && !broken && loadedUrl === url;

  useEffect(() => {
    if (!url) setLoadedUrl(null);
  }, [url]);

  if (!url || broken) {
    return (
      <div
        style={dim}
        className={`${box} ${GREY_SLOT}`}
        aria-hidden={alt ? undefined : true}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
      />
    );
  }

  return (
    <div
      style={dim}
      className={`relative ${box}`}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      <div
        aria-hidden
        className={`absolute inset-0 ${GREY_SLOT} transition-opacity duration-500 ease-out ${
          shown ? "opacity-0" : "opacity-100"
        }`}
      />
      <img
        src={url}
        alt={alt}
        width={px}
        height={px}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        loading="eager"
        decoding="async"
        onLoad={() => setLoadedUrl(url)}
        onError={() => setFailedUrl(url)}
      />
    </div>
  );
}

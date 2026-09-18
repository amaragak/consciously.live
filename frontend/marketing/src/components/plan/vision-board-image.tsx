"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  src: string;
  alt?: string;
  className?: string;
  /** Classes for the square frame (aspect + radius usually live here). */
  frameClassName?: string;
  imgClassName?: string;
  objectPosition?: string;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLImageElement>;
  onDragEnd?: React.DragEventHandler<HTMLImageElement>;
};

/**
 * Square vision-board image: pulsing placeholder stays under the image;
 * only the photo fades in on top (square never disappears).
 */
export function VisionBoardImage({
  src,
  alt = "",
  className = "",
  frameClassName = "relative aspect-square overflow-hidden",
  imgClassName = "absolute inset-0 h-full w-full object-cover",
  objectPosition,
  draggable,
  onDragStart,
  onDragEnd,
}: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Keep placeholder until opacity transition finishes so the square never blanks. */
  const [showPlaceholder, setShowPlaceholder] = useState(true);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setShowPlaceholder(true);
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      setLoaded(true);
    }
  }, [src]);

  // Fallback if transitionend doesn't fire (cached decode / reduced motion).
  useEffect(() => {
    if (!loaded) return;
    const t = window.setTimeout(() => setShowPlaceholder(false), 520);
    return () => window.clearTimeout(t);
  }, [loaded]);

  return (
    <div className={`${frameClassName} ${className}`.trim()}>
      {showPlaceholder && !failed ? (
        <div
          className="vision-board-tile-skeleton absolute inset-0"
          aria-hidden
        />
      ) : null}
      {!failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={draggable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onLoad={() => setLoaded(true)}
          onTransitionEnd={(e) => {
            if (e.propertyName !== "opacity") return;
            if (loaded) setShowPlaceholder(false);
          }}
          onError={() => {
            setFailed(true);
            setLoaded(false);
            setShowPlaceholder(false);
          }}
          className={`${imgClassName} transition-opacity duration-500 ease-out ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
          style={objectPosition ? { objectPosition } : undefined}
        />
      ) : (
        <div
          className="absolute inset-0 bg-[#E4DFD6] dark:bg-muted/40"
          aria-hidden
        />
      )}
    </div>
  );
}

/** Pulsing square while a tile URL is still resolving (no `src` yet). */
export function VisionBoardImageSkeleton({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`vision-board-tile-skeleton aspect-square ${className}`.trim()}
      aria-hidden
    />
  );
}

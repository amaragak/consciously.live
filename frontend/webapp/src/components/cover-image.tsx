import { useLayoutEffect, useRef, useState } from "react";

/**
 * Full-bleed cover with a same-size shimmer until the image decodes.
 * Parent should size the slot (absolute inset or fixed height).
 */
export function CoverImage({
  src,
  alt = "",
  className = "",
  imgClassName = "absolute inset-0 h-full w-full object-cover",
}: {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    setReady(false);
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) setReady(true);
  }, [src]);

  return (
    <span
      className={`relative block overflow-hidden bg-accent-soft/40 ${className}`.trim()}
      aria-busy={!ready}
    >
      {!ready ? (
        <span className="mm-skeleton absolute inset-0 block" aria-hidden />
      ) : null}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        decoding="async"
        className={`${imgClassName} transition-opacity duration-200 ${
          ready ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
      />
    </span>
  );
}

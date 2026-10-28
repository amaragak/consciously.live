/** Decorative cover plane when no cover image is stored. */
export function ListenCoverArt({
  title,
  coverImageUrl,
  className = "",
}: {
  title: string;
  coverImageUrl: string | null;
  className?: string;
}) {
  if (coverImageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverImageUrl}
        alt=""
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  const hue =
    Array.from(title).reduce((n, ch) => n + ch.charCodeAt(0), 0) % 360;
  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(180deg, hsl(${hue} 28% 18%) 0%, hsl(${(hue + 40) % 360} 32% 38%) 62%, #D6E1EF 100%)`,
      }}
      aria-hidden
    >
      <span
        className="absolute left-[35%] top-[40%] aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle,#D9B87C 0 38%,rgba(217,184,124,.35) 39% 56%,rgba(217,184,124,0) 72%)",
        }}
      />
    </div>
  );
}

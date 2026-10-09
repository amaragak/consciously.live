export function FavoriteHeartButton({
  pressed,
  label,
  onToggle,
  size = "sm",
  iconSize,
  boxClassName,
}: {
  pressed: boolean;
  label: string;
  onToggle: () => void;
  size?: "sm" | "md";
  /** Override the heart glyph size in px. */
  iconSize?: number;
  /** Override the hit-area box classes (default per `size`). */
  boxClassName?: string;
}) {
  const box =
    boxClassName ??
    (size === "md" ? "h-10 w-10 rounded-xl" : "h-8 w-8 rounded-lg");
  const icon = iconSize ?? (size === "md" ? 20 : 16);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={pressed ? `Unfavourite ${label}` : `Favourite ${label}`}
      title={pressed ? "Unfavourite" : "Favourite"}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      className={`flex ${box} shrink-0 cursor-pointer items-center justify-center ${
        pressed ? "text-accent-link" : "text-muted hover:text-foreground"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width={icon}
        height={icon}
        fill={pressed ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}

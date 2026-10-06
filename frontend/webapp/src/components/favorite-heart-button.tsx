export function FavoriteHeartButton({
  pressed,
  label,
  onToggle,
}: {
  pressed: boolean;
  label: string;
  onToggle: () => void;
}) {
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
      className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg ${
        pressed ? "text-accent-link" : "text-muted hover:text-foreground"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
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

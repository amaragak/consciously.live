/** Shared disclosure chevron — same mark as mixer channel / sound folder selects. */
export function SelectChevron({
  open = false,
  /** Face right (e.g. collapsed submenu) instead of down. */
  direction = "down",
  className = "",
}: {
  open?: boolean;
  direction?: "down" | "right";
  className?: string;
}) {
  const rotate =
    direction === "right"
      ? open
        ? ""
        : "-rotate-90"
      : open
        ? "rotate-180"
        : "";
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${rotate} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

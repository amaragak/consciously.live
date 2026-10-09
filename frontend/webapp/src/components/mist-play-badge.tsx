import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";

/** Mist circular play/pause — pause bars match play triangle size. */
export function MistPlayBadge({
  playing,
  size = "md",
}: {
  playing: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const box =
    size === "lg"
      ? "h-10 w-10"
      : size === "sm"
        ? "h-7 w-7"
        : "h-7 w-7 md:h-8 md:w-8";
  const icon =
    size === "lg" ? "h-4 w-4" : size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span
      className={`flex ${box} items-center justify-center rounded-full accent-fill-gradient text-on-accent shadow-[0_1px_4px_rgb(15_27_45_/_0.2)]`}
      style={PRIMARY_ACCENT_FILL_STYLE}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className={icon} fill="currentColor">
        {playing ? (
          <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
        ) : (
          <path d="M8 5v14l11-7L8 5z" />
        )}
      </svg>
    </span>
  );
}

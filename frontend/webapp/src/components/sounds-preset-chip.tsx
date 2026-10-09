import type { CSSProperties } from "react";
import { FactoryIcon } from "@/components/factory-icons";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";

/** Primary play / pause circle at an explicit px size (Sounds page only). */
export function SoundsPlayCircle({
  playing,
  size,
  iconSize,
}: {
  playing: boolean;
  size: number;
  iconSize?: number;
}) {
  const icon = iconSize ?? Math.round(size * 0.38);
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full accent-fill-gradient text-on-accent shadow-[0_1px_4px_rgb(15_27_45_/_0.2)]"
      style={{ ...PRIMARY_ACCENT_FILL_STYLE, width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width={icon} height={icon} fill="currentColor">
        {playing ? (
          <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
        ) : (
          <path d="M8 5v14l11-7L8 5z" />
        )}
      </svg>
    </span>
  );
}

/** Icon tile used by chips and popover rows. */
export function SoundsMixTile({
  iconId,
  iconBg,
  iconColor,
  size,
  radius,
  iconSize,
}: {
  iconId: string;
  iconBg?: string;
  iconColor?: string;
  size: number;
  radius: number;
  iconSize: number;
}) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    ...(iconBg ? { backgroundColor: iconBg } : {}),
    ...(iconColor ? { color: iconColor } : {}),
  };
  return (
    <span
      className="flex shrink-0 items-center justify-center bg-accent-soft text-accent-link"
      style={style}
      aria-hidden
    >
      <FactoryIcon id={iconId} size={iconSize} />
    </span>
  );
}

/**
 * Sounds-page preset chip: 40px (desktop, with preview play) / 34px (mobile,
 * tap to load, no play). Not shared with Create.
 */
export function SoundsPresetChip({
  name,
  iconId,
  iconBg,
  iconColor,
  loaded,
  previewing,
  variant,
  onSelect,
  onPreview,
  inert = false,
}: {
  name: string;
  iconId: string;
  iconBg?: string;
  iconColor?: string;
  loaded: boolean;
  previewing: boolean;
  variant: "desktop" | "mobile";
  onSelect: () => void;
  onPreview: () => void;
  /** Used by the off-screen measuring layer. */
  inert?: boolean;
}) {
  const desktop = variant === "desktop";
  return (
    <div
      role="button"
      tabIndex={inert ? -1 : 0}
      aria-current={loaded ? "true" : undefined}
      aria-hidden={inert || undefined}
      data-sounds-chip
      onClick={inert ? undefined : onSelect}
      onKeyDown={(e) => {
        if (inert || e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`box-border inline-flex shrink-0 cursor-pointer items-center rounded-full ${
        desktop ? "h-10 gap-2 px-1.5" : "h-[34px] gap-2 pl-1.5 pr-3"
      } ${
        loaded
          ? "border-[1.5px] border-accent bg-accent-soft"
          : "border border-border bg-card hover:border-accent/40"
      }`}
    >
      <SoundsMixTile
        iconId={iconId}
        iconBg={iconBg}
        iconColor={iconColor}
        size={desktop ? 28 : 22}
        radius={desktop ? 8 : 6}
        iconSize={desktop ? 16 : 13}
      />
      <span className="whitespace-nowrap text-[13px] font-semibold text-foreground">
        {name}
      </span>
      {desktop ? (
        <button
          type="button"
          tabIndex={inert ? -1 : 0}
          aria-label={previewing ? `Stop preview of ${name}` : `Preview ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onPreview();
          }}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-full"
        >
          <SoundsPlayCircle playing={previewing} size={26} iconSize={10} />
        </button>
      ) : null}
    </div>
  );
}

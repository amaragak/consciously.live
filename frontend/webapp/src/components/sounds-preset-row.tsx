import type { CSSProperties, ReactNode } from "react";
import { FavoriteHeartButton } from "@/components/favorite-heart-button";
import { MistPlayBadge } from "@/components/mist-play-badge";

/**
 * Sounds-page preset / mix row (new component — the shared FactoryPresetRow
 * stays as-is for Create and admin).
 */
export function SoundsPresetRow({
  name,
  description,
  tile,
  tileStyle,
  selected,
  previewing,
  favorite,
  onSelect,
  onPreview,
  onToggleFavorite,
}: {
  name: string;
  description?: string;
  tile: ReactNode;
  tileStyle?: CSSProperties;
  selected: boolean;
  previewing: boolean;
  favorite: boolean;
  onSelect: () => void;
  onPreview: () => void;
  onToggleFavorite: () => void;
}) {
  const desc = description?.trim();
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2.5 ${
        selected
          ? "bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]"
          : "hover:bg-accent-soft/40"
      }`}
    >
      <span
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-link"
        style={tileStyle}
        aria-hidden
      >
        {tile}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold text-foreground">
          {name}
        </span>
        {desc ? (
          <span className="block truncate text-xs text-muted">{desc}</span>
        ) : null}
      </span>
      <FavoriteHeartButton
        pressed={favorite}
        label={name}
        onToggle={onToggleFavorite}
      />
      <button
        type="button"
        aria-label={previewing ? `Stop preview of ${name}` : `Preview ${name}`}
        onClick={(e) => {
          e.stopPropagation();
          onPreview();
        }}
        className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full"
      >
        <MistPlayBadge playing={previewing} size="sm" />
      </button>
    </div>
  );
}


import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BackgroundAudioItem } from "@/lib/medimade-api";
import { createAudioPulseDelayMs } from "@/lib/create-audio-pulse";
import { prettySubcategoryLabel, soundDisplayName } from "@/lib/sound-taxonomy";

type SoundscapePickerProps = {
  items: BackgroundAudioItem[];
  value: string;
  onChange: (key: string) => void;
  /** Null while the media base URL is unknown, which disables previews. */
  previewUrl: (key: string) => string | null;
  playingKey: string | null;
  onTogglePreview: (key: string) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Single column layout (e.g. library / Focus mix flyout). */
  compact?: boolean;
  /** Create › Audio soundscape chrome (category pills + warm cards). */
  variant?: "default" | "create";
  /**
   * When false, cards stay clickable even if `previewUrl` is null
   * (e.g. Focus plays via the app strip instead of in-panel preview).
   */
  requirePreviewUrl?: boolean;
};

function PlayPauseIcon({
  playing,
  size = 18,
}: {
  playing: boolean;
  size?: number;
}) {
  return playing ? (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Durations are not in the catalog, so each card asks the CDN for metadata once
 * and the answers are shared across re-renders.
 */
function useDurations(
  items: BackgroundAudioItem[],
  previewUrl: (key: string) => string | null,
) {
  const [durations, setDurations] = useState<Record<string, number>>({});
  const askedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const probes: HTMLAudioElement[] = [];
    for (const item of items) {
      if (askedRef.current.has(item.key)) continue;
      const url = previewUrl(item.key);
      if (!url) continue;
      askedRef.current.add(item.key);
      const probe = new Audio();
      probe.preload = "metadata";
      probe.src = url;
      probe.addEventListener("loadedmetadata", () => {
        if (!Number.isFinite(probe.duration)) return;
        setDurations((prev) => ({ ...prev, [item.key]: probe.duration }));
      });
      probes.push(probe);
    }
    return () => {
      for (const p of probes) p.removeAttribute("src");
    };
  }, [items, previewUrl]);

  return durations;
}

export function SoundscapePicker({
  items,
  value,
  onChange,
  previewUrl,
  playingKey,
  onTogglePreview,
  disabled,
  loading,
  compact,
  variant = "default",
  requirePreviewUrl = true,
}: SoundscapePickerProps) {
  const durations = useDurations(items, previewUrl);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const selectedItemRef = useRef<HTMLLIElement | null>(null);
  const isCreate = variant === "create";

  const categories = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.subcategory) ids.add(item.subcategory);
    }
    return [...ids].sort((a, b) =>
      prettySubcategoryLabel(a).localeCompare(prettySubcategoryLabel(b)),
    );
  }, [items]);

  const sorted = useMemo(() => {
    const list = [...items].sort((a, b) => a.name.localeCompare(b.name));
    if (!isCreate || categoryFilter === "all") return list;
    return list.filter((item) => item.subcategory === categoryFilter);
  }, [items, isCreate, categoryFilter]);

  const pulseDelay = useMemo(
    () => (value ? createAudioPulseDelayMs() : undefined),
    [value],
  );
  // Keep a pre-selected soundscape visible if the category filter would hide it.
  useEffect(() => {
    if (!isCreate || !value || categoryFilter === "all") return;
    const selected = items.find((item) => item.key === value);
    if (!selected) return;
    if (selected.subcategory !== categoryFilter) {
      setCategoryFilter("all");
    }
  }, [isCreate, value, categoryFilter, items]);

  useLayoutEffect(() => {
    if (!value) return;
    const el = selectedItemRef.current;
    if (!el) return;
    el.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "nearest",
    });
  }, [value, sorted.length, categoryFilter]);

  if (loading) {
    return (
      <p className="px-1 py-6 text-sm text-muted">Loading soundscapes…</p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="px-1 py-6 text-sm text-muted">
        No soundscapes yet. Use Build your own to mix your own bed.
      </p>
    );
  }

  if (isCreate) {
    const listBody =
      sorted.length === 0 ? (
        <p className="px-1 py-6 text-sm text-muted">
          No soundscapes in this category.
        </p>
      ) : (
        <ul
          className={
            compact
              ? "grid grid-cols-1 items-start gap-2"
              : "grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3"
          }
        >
          {sorted.map((item) => {
            const selected = item.key === value;
            const playing = playingKey === item.key;
            const title = soundDisplayName(item.name);
            const pack = item.subcategory
              ? prettySubcategoryLabel(item.subcategory)
              : "";
            const canPreview = Boolean(previewUrl(item.key));
            const canSelect = !requirePreviewUrl || canPreview;
            return (
              <li
                key={item.key}
                ref={selected ? selectedItemRef : undefined}
              >
                <button
                  type="button"
                  disabled={disabled || !canSelect}
                  aria-pressed={selected}
                  aria-label={
                    playing
                      ? `Pause and keep ${title} selected`
                      : `Select and play ${title}`
                  }
                  onClick={() => {
                    if (value !== item.key) onChange(item.key);
                    onTogglePreview(item.key);
                  }}
                  style={
                    selected && pulseDelay
                      ? { animationDelay: pulseDelay }
                      : undefined
                  }
                  className={`flex w-full min-w-0 max-w-full items-center overflow-hidden rounded-[6px] p-0 text-left transition-[border-color,border-width,background-color] disabled:cursor-not-allowed disabled:opacity-60 ${
                    selected
                      ? "create-audio-selected-pulse border-[3px] border-accent-button bg-card"
                      : "border-2 border-[color-mix(in_srgb,var(--foreground)_16%,transparent)] bg-card shadow-[0_2px_10px_rgb(28_25_23_/_0.14),0_1px_3px_rgb(28_25_23_/_0.1)]"
                  }`}
                >
                  <span className="relative isolate block h-20 w-20 shrink-0 grow-0 basis-20 overflow-hidden bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] sm:h-[5.25rem] sm:w-[5.25rem] sm:basis-[5.25rem]">
                    {item.coverImageThumbUrl || item.coverImageUrl ? (
                      <img
                        src={
                          item.coverImageThumbUrl || item.coverImageUrl || ""
                        }
                        alt=""
                        loading={isCreate ? "eager" : "lazy"}
                        fetchPriority={isCreate ? "high" : undefined}
                        decoding="async"
                        width={84}
                        height={84}
                        className={`pointer-events-none absolute inset-0 h-full w-full max-h-full max-w-full object-cover object-center ${
                          selected
                            ? "[filter:brightness(1.1)_contrast(0.86)]"
                            : "[filter:brightness(1.14)_contrast(0.62)_saturate(0.12)]"
                        }`}
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium uppercase tracking-wide text-muted">
                        No cover
                      </span>
                    )}
                    <span
                      className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center"
                      aria-hidden
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full shadow-[0_1px_4px_rgb(15_27_45_/_0.18)] backdrop-blur-[2px] ${
                          selected
                            ? "bg-accent-button text-on-accent"
                            : "bg-[color-mix(in_srgb,var(--accent-button)_48%,transparent)] text-[color-mix(in_srgb,var(--on-accent)_72%,transparent)]"
                        }`}
                      >
                        <PlayPauseIcon playing={playing} size={16} />
                      </span>
                    </span>
                  </span>
                  <span className="flex min-h-20 min-w-0 flex-1 items-center px-3 py-2.5 sm:min-h-[5.25rem] sm:px-4 sm:py-3.5">
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate font-display text-[15px] text-foreground ${
                          selected ? "font-semibold" : "font-normal"
                        }`}
                      >
                        {title}
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                        {pack ? (
                          <span className="rounded-[8px] bg-accent-soft/50 px-1.5 py-0.5 text-accent-link">
                            {pack}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="shrink-0 tabular-nums">
                          {formatDuration(durations[item.key] ?? null)}
                        </span>
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      );

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {categories.length > 0 ? (
          <div className="mb-2 mt-0 flex shrink-0 flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              aria-pressed={categoryFilter === "all"}
              onClick={() => setCategoryFilter("all")}
              className={`shrink-0 cursor-pointer rounded-[20px] border-2 px-3 py-1.5 text-sm transition-colors ${
                categoryFilter === "all"
                  ? "border-accent bg-accent-soft/40 text-foreground"
                  : "border-border bg-card text-foreground hover:border-accent/40"
              }`}
            >
              All
            </button>
            {categories.map((id) => {
              const active = categoryFilter === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryFilter(id)}
                  className={`shrink-0 cursor-pointer rounded-[20px] border-2 px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-accent bg-accent-soft/40 text-foreground"
                      : "border-border bg-card text-foreground hover:border-accent/40"
                  }`}
                >
                  {prettySubcategoryLabel(id)}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="create-audio-well min-h-0 flex-1 overflow-y-auto rounded-xl p-2.5 pb-2">
          {listBody}
        </div>
      </div>
    );
  }

  return (
    <div>
      <ul
        className={
          compact
            ? "grid grid-cols-1 items-start gap-2"
            : "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {sorted.map((item) => {
          const selected = item.key === value;
          const playing = playingKey === item.key;
          const title = soundDisplayName(item.name);
          const pack = item.subcategory
            ? prettySubcategoryLabel(item.subcategory)
            : "";
          return (
            <li key={item.key} ref={selected ? selectedItemRef : undefined}>
              <div
                className={`flex flex-col gap-2 rounded-2xl bg-card transition-colors ${
                  compact ? "p-2.5" : "p-4"
                } ${
                  selected
                    ? "create-audio-selected-pulse border-2 border-accent-button"
                    : "border border-[color-mix(in_srgb,var(--foreground)_16%,transparent)] shadow-sm"
                }`}
                style={
                  selected && pulseDelay
                    ? { animationDelay: pulseDelay }
                    : undefined
                }
              >
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={disabled || !previewUrl(item.key)}
                    onClick={() => onTogglePreview(item.key)}
                    aria-label={playing ? `Pause ${title}` : `Play ${title}`}
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-background text-accent-link transition-colors hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <PlayPauseIcon playing={playing} />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(selected ? "" : item.key)}
                    aria-pressed={selected}
                    className="flex min-h-[2.6em] min-w-0 flex-1 cursor-pointer items-center text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span
                      className={`line-clamp-2 font-display text-[15px] leading-[1.3] text-foreground ${
                        selected ? "font-semibold" : "font-normal"
                      }`}
                    >
                      {title}
                    </span>
                  </button>
                </div>
                <div className="flex items-baseline justify-between gap-2 text-xs text-muted">
                  <span className="min-w-0 truncate">{pack}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatDuration(durations[item.key] ?? null)}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

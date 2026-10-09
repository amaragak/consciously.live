import type { ReactNode } from "react";
import { MistPlayBadge } from "@/components/mist-play-badge";
import { SoundsVerticalFader } from "@/components/sounds-vertical-fader";

function PowerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 2v10" />
      <path d="M18.4 6.6a8 8 0 1 1-12.8 0" />
    </svg>
  );
}

/** Sounds-page layer power switch (not shared with Create). */
export function SoundsPowerSwitch({
  checked,
  disabled,
  onCheckedChange,
  ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed ${
        checked
          ? "bg-accent text-on-accent"
          : "border border-border bg-card text-muted"
      }`}
    >
      <PowerIcon />
    </button>
  );
}

export function SoundsLayerStrip({
  label,
  soundSelect,
  gain,
  onGainChange,
  onLiveGainChange,
  enabled,
  onEnabledChange,
  hasSound,
  playing,
  onTogglePreview,
  playAriaLabel,
}: {
  label: string;
  soundSelect: ReactNode;
  gain: number;
  onGainChange: (gain: number) => void;
  onLiveGainChange?: (gain: number) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  hasSound: boolean;
  playing: boolean;
  onTogglePreview: () => void;
  playAriaLabel: string;
}) {
  const dimmed = !enabled || !hasSound;
  const valueLabel = !hasSound ? "–" : !enabled ? "Off" : `${Math.round(gain)}%`;

  return (
    <div className="flex min-w-[112px] flex-1 flex-col gap-2 rounded-[14px] border border-border bg-background px-3 pb-3 pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          {label}
        </span>
        <SoundsPowerSwitch
          checked={enabled && hasSound}
          disabled={!hasSound}
          onCheckedChange={onEnabledChange}
          ariaLabel={`${label} power`}
        />
      </div>
      {/* Keep full opacity on the strip chrome so preset switches don’t flash;
          only the fader/value/preview reflect dimmed state. */}
      <div className="flex flex-col gap-2">
        {soundSelect}
        <SoundsVerticalFader
          value={gain}
          onChange={onGainChange}
          onLiveChange={onLiveGainChange}
          dimmed={dimmed}
          disabled={!hasSound || !enabled}
          ariaLabel={`${label} volume`}
        />
        <p
          className={`text-center text-sm font-semibold tabular-nums ${
            dimmed ? "text-muted" : "text-foreground"
          }`}
        >
          {valueLabel}
        </p>
      </div>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onTogglePreview}
          disabled={dimmed}
          aria-label={playAriaLabel}
          className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MistPlayBadge playing={playing} size="sm" />
        </button>
      </div>
    </div>
  );
}

export function SoundsMasterStrip({
  layersOn,
  masterVolume,
  onMasterVolumeChange,
  onLiveMasterVolumeChange,
  playing,
  onTogglePlayAll,
  playDisabled,
}: {
  layersOn: number;
  masterVolume: number;
  onMasterVolumeChange: (gain: number) => void;
  onLiveMasterVolumeChange?: (gain: number) => void;
  playing: boolean;
  onTogglePlayAll: () => void;
  playDisabled?: boolean;
}) {
  return (
    <div className="flex w-[120px] shrink-0 flex-col gap-2 rounded-[14px] border border-accent/35 bg-accent-soft/40 px-3 pb-3 pt-2.5">
      <div className="flex h-7 items-center justify-center">
        <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          Master
        </span>
      </div>
      <p className="flex h-[38px] items-center justify-center text-center text-xs text-muted">
        {layersOn} layer{layersOn === 1 ? "" : "s"} on
      </p>
      <SoundsVerticalFader
        value={masterVolume}
        onChange={onMasterVolumeChange}
        onLiveChange={onLiveMasterVolumeChange}
        ariaLabel="Master volume"
      />
      <p className="text-center text-sm font-semibold tabular-nums text-foreground">
        {Math.round(masterVolume)}%
      </p>
      <div className="flex justify-center">
        <button
          type="button"
          onClick={onTogglePlayAll}
          disabled={playDisabled}
          aria-label={playing ? "Pause all" : "Play all"}
          className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MistPlayBadge playing={playing} size="sm" />
        </button>
      </div>
    </div>
  );
}

function layerValueLabel(hasSound: boolean, enabled: boolean, gain: number) {
  return !hasSound ? "–" : !enabled ? "Off" : `${Math.round(gain)}%`;
}

/**
 * Mobile (below `md`) layer row: label + preview + power, full-width select,
 * horizontal fader with a 40px value box. Rows are separated by hairlines.
 */
export function SoundsLayerRow({
  label,
  soundSelect,
  gain,
  onGainChange,
  onLiveGainChange,
  enabled,
  onEnabledChange,
  hasSound,
  playing,
  onTogglePreview,
  playAriaLabel,
}: {
  label: string;
  soundSelect: ReactNode;
  gain: number;
  onGainChange: (gain: number) => void;
  onLiveGainChange?: (gain: number) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  hasSound: boolean;
  playing: boolean;
  onTogglePreview: () => void;
  playAriaLabel: string;
}) {
  const dimmed = !enabled || !hasSound;
  return (
    <div className="flex flex-col gap-2.5 border-t border-border px-4 py-3.5 first:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          {label}
        </span>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onTogglePreview}
            disabled={dimmed}
            aria-label={playAriaLabel}
            className="flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MistPlayBadge playing={playing} size="sm" />
          </button>
          <SoundsPowerSwitch
            checked={enabled && hasSound}
            disabled={!hasSound}
            onCheckedChange={onEnabledChange}
            ariaLabel={`${label} power`}
          />
        </div>
      </div>
      {soundSelect}
      <div className="flex items-center gap-2">
        <SoundsVerticalFader
          orientation="horizontal"
          value={gain}
          onChange={onGainChange}
          onLiveChange={onLiveGainChange}
          dimmed={dimmed}
          disabled={!hasSound || !enabled}
          ariaLabel={`${label} volume`}
        />
        <span
          className={`w-10 shrink-0 text-right text-sm font-semibold tabular-nums ${
            dimmed ? "text-muted" : "text-foreground"
          }`}
        >
          {layerValueLabel(hasSound, enabled, gain)}
        </span>
      </div>
    </div>
  );
}

/** Mobile Master row: accent tint, light-accent top border, last in the list. */
export function SoundsMasterRow({
  layersOn,
  masterVolume,
  onMasterVolumeChange,
  onLiveMasterVolumeChange,
}: {
  layersOn: number;
  masterVolume: number;
  onMasterVolumeChange: (gain: number) => void;
  onLiveMasterVolumeChange?: (gain: number) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-accent/35 bg-accent-soft/40 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          Master
        </span>
        <span className="text-xs text-muted">
          {layersOn} layer{layersOn === 1 ? "" : "s"} on
        </span>
      </div>
      <div className="flex items-center gap-2">
        <SoundsVerticalFader
          orientation="horizontal"
          value={masterVolume}
          onChange={onMasterVolumeChange}
          onLiveChange={onLiveMasterVolumeChange}
          ariaLabel="Master volume"
        />
        <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
          {Math.round(masterVolume)}%
        </span>
      </div>
    </div>
  );
}

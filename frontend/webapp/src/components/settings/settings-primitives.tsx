import type { ReactNode } from "react";
import {
  SETTINGS_STATUS,
  settingsStatusLabel,
  settingsStatusTitle,
  type SettingsKey,
  type SettingsStatus,
} from "@/lib/settings-status";

export function SettingsSwitch({
  checked,
  onCheckedChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange?: (next: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  const inactive = disabled || !onCheckedChange;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={inactive ? true : undefined}
      disabled={inactive}
      aria-label={ariaLabel}
      onClick={() => {
        if (inactive) return;
        onCheckedChange(!checked);
      }}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-accent-button" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export function SettingsSegmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange?: (value: T) => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  const inactive = disabled || !onChange;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex shrink-0 flex-wrap justify-end gap-0.5 rounded-xl border border-border bg-background p-0.5"
    >
      {options.map((opt) => {
        const pressed = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={pressed}
            disabled={inactive}
            onClick={() => {
              if (inactive || pressed) return;
              onChange(opt.value);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:text-base ${
              pressed
                ? "bg-card text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsStatusMarker({ status }: { status: SettingsStatus }) {
  if (status === "wired") return null;
  const label = settingsStatusLabel(status);
  return (
    <span
      title={settingsStatusTitle(status)}
      className="inline-flex shrink-0 rounded-full border border-border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wider text-muted"
    >
      {label}
    </span>
  );
}

export function SettingsRow({
  settingsKey,
  title,
  helper,
  control,
  showMarker = true,
}: {
  settingsKey?: SettingsKey;
  title: string;
  helper: ReactNode;
  control: ReactNode;
  showMarker?: boolean;
}) {
  const status = settingsKey ? SETTINGS_STATUS[settingsKey] : "wired";
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-4 first:border-t-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold text-foreground">{title}</p>
          {showMarker && settingsKey ? (
            <SettingsStatusMarker status={status} />
          ) : null}
        </div>
        <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted">
          {helper}
        </p>
      </div>
      <div className="flex shrink-0 items-center justify-end sm:pt-0.5">
        {control}
      </div>
    </div>
  );
}

export function SettingsCard({
  children,
  id,
}: {
  children: ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      {children}
    </div>
  );
}

export function SettingsSectionHeader({
  id,
  title,
  lead,
}: {
  id: string;
  title: string;
  lead: string;
}) {
  return (
    <header className="space-y-1">
      <h2
        id={id}
        className="font-display text-2xl font-medium tracking-tight text-foreground"
      >
        {title}
      </h2>
      <p className="text-base leading-relaxed text-muted">{lead}</p>
    </header>
  );
}

export function settingsRowDisabled(key: SettingsKey): boolean {
  return SETTINGS_STATUS[key] !== "wired";
}

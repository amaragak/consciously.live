import { useId, useState, type KeyboardEvent } from "react";
import type { RaiseLevel } from "@/lib/manifesto-story-llm";
import { RAISE_LEVELS, RAISE_LEVEL_AIM } from "@/lib/manifesto-story-llm";

const LABELS: Record<RaiseLevel, string> = {
  ambitious: "Ambitious",
  audacious: "Audacious",
  delusional: "Delusional",
};

const SUN_INNER: Record<RaiseLevel, string> = {
  ambitious: `<defs><radialGradient id="__GD__" cx="0.38" cy="0.34" r="0.75"><stop offset="0" stop-color="color-mix(in srgb, var(--accent) 42%, white)"/><stop offset="1" stop-color="var(--accent)"/></radialGradient><radialGradient id="__GW__"><stop offset="0.35" stop-color="var(--accent)" stop-opacity="0.32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient></defs><g fill="var(--accent)" stroke="var(--accent)" stroke-width="0.6" stroke-linejoin="round"><path d="M33.70 15.80 L32.00 10.30 L30.30 15.80 Z"/><path d="M44.66 21.75 L47.34 16.66 L42.25 19.34 Z"/><path d="M48.20 33.70 L53.70 32.00 L48.20 30.30 Z"/><path d="M42.25 44.66 L47.34 47.34 L44.66 42.25 Z"/><path d="M30.30 48.20 L32.00 53.70 L33.70 48.20 Z"/><path d="M19.34 42.25 L16.66 47.34 L21.75 44.66 Z"/><path d="M15.80 30.30 L10.30 32.00 L15.80 33.70 Z"/><path d="M21.75 19.34 L16.66 16.66 L19.34 21.75 Z"/></g><circle cx="32" cy="32" r="14.0" fill="url(#__GD__)"/><g transform="translate(32 32) scale(1.120) translate(-32 -32)"><circle cx="28.4" cy="30.2" r="1.25" fill="var(--accent-link)"/><circle cx="35.6" cy="30.2" r="1.25" fill="var(--accent-link)"/><path d="M28.4 34.3 Q32 37.3 35.6 34.3" fill="none" stroke="var(--accent-link)" stroke-width="1.4" stroke-linecap="round"/></g>`,
  audacious: `<defs><radialGradient id="__GD__" cx="0.38" cy="0.34" r="0.75"><stop offset="0" stop-color="color-mix(in srgb, var(--accent) 42%, white)"/><stop offset="1" stop-color="var(--accent)"/></radialGradient><radialGradient id="__GW__"><stop offset="0.35" stop-color="var(--accent)" stop-opacity="0.32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient></defs><g fill="var(--accent)" stroke="var(--accent)" stroke-width="0.6" stroke-linejoin="round"><path d="M33.70 14.80 L32.00 6.30 L30.30 14.80 Z"/><path d="M45.36 21.04 L50.17 13.83 L42.96 18.64 Z"/><path d="M49.20 33.70 L57.70 32.00 L49.20 30.30 Z"/><path d="M42.96 45.36 L50.17 50.17 L45.36 42.96 Z"/><path d="M30.30 49.20 L32.00 57.70 L33.70 49.20 Z"/><path d="M18.64 42.96 L13.83 50.17 L21.04 45.36 Z"/><path d="M14.80 30.30 L6.30 32.00 L14.80 33.70 Z"/><path d="M21.04 18.64 L13.83 13.83 L18.64 21.04 Z"/><path d="M39.69 16.57 L39.81 13.15 L37.47 15.65 Z"/><path d="M48.35 26.53 L50.85 24.19 L47.43 24.31 Z"/><path d="M47.43 39.69 L50.85 39.81 L48.35 37.47 Z"/><path d="M37.47 48.35 L39.81 50.85 L39.69 47.43 Z"/><path d="M24.31 47.43 L24.19 50.85 L26.53 48.35 Z"/><path d="M15.65 37.47 L13.15 39.81 L16.57 39.69 Z"/><path d="M16.57 24.31 L13.15 24.19 L15.65 26.53 Z"/><path d="M26.53 15.65 L24.19 13.15 L24.31 16.57 Z"/></g><circle cx="32" cy="32" r="15.0" fill="url(#__GD__)"/><g transform="translate(32 32) scale(1.200) translate(-32 -32)"><path d="M26.8 30.8 Q28.4 28.7 30 30.8" fill="none" stroke="var(--accent-link)" stroke-width="1.4" stroke-linecap="round"/><path d="M34 30.8 Q35.6 28.7 37.2 30.8" fill="none" stroke="var(--accent-link)" stroke-width="1.4" stroke-linecap="round"/><path d="M27.6 33.6 H36.4 Q36 38.6 32 38.6 Q28 38.6 27.6 33.6 Z" fill="var(--accent-link)"/></g>`,
  delusional: `<defs><radialGradient id="__GD__" cx="0.38" cy="0.34" r="0.75"><stop offset="0" stop-color="color-mix(in srgb, var(--accent) 42%, white)"/><stop offset="1" stop-color="var(--accent)"/></radialGradient><radialGradient id="__GW__"><stop offset="0.35" stop-color="var(--accent)" stop-opacity="0.32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="32" r="31" fill="url(#__GW__)"/><g fill="var(--accent)" stroke="var(--accent)" stroke-width="0.6" stroke-linejoin="round"><path d="M33.50 13.80 L32.00 3.30 L30.50 13.80 Z"/><path d="M42.40 16.99 L46.35 7.15 L39.80 15.49 Z"/><path d="M48.51 24.20 L56.85 17.65 L47.01 21.60 Z"/><path d="M50.20 33.50 L60.70 32.00 L50.20 30.50 Z"/><path d="M47.01 42.40 L56.85 46.35 L48.51 39.80 Z"/><path d="M39.80 48.51 L46.35 56.85 L42.40 47.01 Z"/><path d="M30.50 50.20 L32.00 60.70 L33.50 50.20 Z"/><path d="M21.60 47.01 L17.65 56.85 L24.20 48.51 Z"/><path d="M15.49 39.80 L7.15 46.35 L16.99 42.40 Z"/><path d="M13.80 30.50 L3.30 32.00 L13.80 33.50 Z"/><path d="M16.99 21.60 L7.15 17.65 L15.49 24.20 Z"/><path d="M24.20 15.49 L17.65 7.15 L21.60 16.99 Z"/><path d="M37.87 14.73 L38.13 9.11 L35.55 14.11 Z"/><path d="M45.72 19.98 L48.76 15.24 L44.02 18.28 Z"/><path d="M49.89 28.45 L54.89 25.87 L49.27 26.13 Z"/><path d="M49.27 37.87 L54.89 38.13 L49.89 35.55 Z"/><path d="M44.02 45.72 L48.76 48.76 L45.72 44.02 Z"/><path d="M35.55 49.89 L38.13 54.89 L37.87 49.27 Z"/><path d="M26.13 49.27 L25.87 54.89 L28.45 49.89 Z"/><path d="M18.28 44.02 L15.24 48.76 L19.98 45.72 Z"/><path d="M14.11 35.55 L9.11 38.13 L14.73 37.87 Z"/><path d="M14.73 26.13 L9.11 25.87 L14.11 28.45 Z"/><path d="M19.98 18.28 L15.24 15.24 L18.28 19.98 Z"/><path d="M28.45 14.11 L25.87 9.11 L26.13 14.73 Z"/></g><circle cx="32" cy="32" r="16.0" fill="url(#__GD__)"/><g transform="translate(32 32) scale(1.280) translate(-32 -32)"><path d="M27.7 27.200000000000003 L28.419999999999998 28.880000000000003 L30.099999999999998 29.6 L28.419999999999998 30.32 L27.7 32.0 L26.98 30.32 L25.3 29.6 L26.98 28.880000000000003 Z" fill="var(--accent-link)"/><path d="M36.3 27.200000000000003 L37.019999999999996 28.880000000000003 L38.699999999999996 29.6 L37.019999999999996 30.32 L36.3 32.0 L35.58 30.32 L33.9 29.6 L35.58 28.880000000000003 Z" fill="var(--accent-link)"/><path d="M26.6 33.2 H37.4 Q37 39.8 32 39.8 Q27 39.8 26.6 33.2 Z" fill="var(--accent-link)"/><path d="M29.4 38.4 Q32 36.4 34.6 38.4 Q32 40 29.4 38.4 Z" fill="var(--gold)"/></g>`,
};

const LINE_LABELS: Record<RaiseLevel, string> = {
  ambitious: "Ambitious",
  audacious: "Audacious",
  delusional: "Delusional",
};

/** Three suns for one finding. The big dial is unchanged. */
export function RaiseLineDial({
  level,
  onChange,
  mobile = false,
}: {
  level: RaiseLevel;
  onChange: (level: RaiseLevel) => void;
  mobile?: boolean;
}) {
  const btn = mobile ? 30 : 26;
  const sun = mobile ? 24 : 22;
  return (
    <span
      role="radiogroup"
      aria-label="Level for this line"
      className="inline-flex shrink-0 gap-px rounded-full bg-muted p-0.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {RAISE_LEVELS.map((id) => {
        const on = id === level;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={LINE_LABELS[id]}
            onClick={() => onChange(id)}
            className={`inline-flex cursor-pointer items-center justify-center rounded-full border-0 ${
              on
                ? "gap-0.5 bg-card pl-0.5 pr-1.5 shadow-[0_1px_3px_rgba(15,27,45,0.18)]"
                : "bg-transparent p-0"
            }`}
            style={on ? { height: btn } : { width: btn, height: btn }}
          >
            <SunFace level={id} size={sun} dimmed={!on} />
            {on ? (
              <span className="pr-0.5 text-[11px] font-semibold leading-none text-foreground">
                {LINE_LABELS[id]}
              </span>
            ) : null}
          </button>
        );
      })}
    </span>
  );
}

export function SunFace({
  level,
  size = 36,
  dimmed = false,
}: {
  level: RaiseLevel;
  size?: number;
  dimmed?: boolean;
}) {
  const uid = useId().replace(/:/g, "");
  const gd = `gd-${uid}`;
  const gw = `gw-${uid}`;
  const html = SUN_INNER[level]
    .replaceAll("__GD__", gd)
    .replaceAll("__GW__", gw);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      style={{ opacity: dimmed ? 0.45 : 1 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function RaiseLevelDial({
  level,
  onChange,
  sunSize = 36,
  natural = false,
}: {
  level: RaiseLevel;
  onChange: (level: RaiseLevel) => void;
  sunSize?: number;
  /** Size to its labels from `lg` up, instead of stretching across the row. */
  natural?: boolean;
}) {
  const [pop, setPop] = useState<RaiseLevel | null>(null);
  const selected = RAISE_LEVELS.indexOf(level);

  function pick(next: RaiseLevel) {
    if (next === level) return;
    setPop(next);
    onChange(next);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = RAISE_LEVELS.indexOf(level);
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = RAISE_LEVELS[i + delta];
    if (next) pick(next);
  }

  return (
    <div
      role="radiogroup"
      aria-label="How far to push"
      onKeyDown={onKeyDown}
      className={`flex gap-0.5 rounded-[15px] bg-border p-[3px] ${
        natural ? "w-full lg:w-max lg:shrink-0" : ""
      }`}
    >
      <style>{`@keyframes raise-sun-in{from{transform:scale(.85)}to{transform:scale(1)}}`}</style>
      {RAISE_LEVELS.map((id, i) => {
        const on = id === level;
        const below = i < selected;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => pick(id)}
            className={`flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl px-1 pb-[7px] pt-2 ${
              natural ? "lg:flex-none lg:px-3" : ""
            } ${
              on
                ? "bg-card text-foreground shadow-[0_1px_4px_color-mix(in_srgb,var(--foreground)_16%,transparent)]"
                : below
                  ? "text-muted"
                  : "text-foreground/75"
            }`}
          >
            <span
              className={
                on && pop === id
                  ? "motion-safe:animate-[raise-sun-in_200ms_ease-out]"
                  : "inline-flex"
              }
            >
              <SunFace level={id} size={sunSize} dimmed={below} />
            </span>
            <span className="whitespace-nowrap text-xs font-semibold">{LABELS[id]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AmbitionAimBar({
  ambition,
  level,
  title,
}: {
  ambition: number;
  level: RaiseLevel;
  title: string;
}) {
  const you = Math.min(100, Math.max(0, Math.round(ambition * 100)));
  const aim = RAISE_LEVEL_AIM[level];
  const left = Math.min(you, aim);
  const width = Math.abs(aim - you);
  const overlap = width <= 12;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span
          className="font-display text-xl text-foreground"
          style={{ fontVariationSettings: "'opsz' 144" }}
        >
          {title}
        </span>
        <span className="text-xs text-muted">Ambition</span>
      </div>
      <div className={overlap ? "relative mt-5" : "relative"}>
        <div className="relative h-[6px] rounded-[3px]" style={{
          backgroundImage: "linear-gradient(90deg, var(--border), color-mix(in srgb, var(--gold) 70%, white), var(--accent))",
        }}>
          {overlap ? (
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-accent-link"
              style={{ left: `${aim}%`, bottom: "calc(100% + 10px)" }}
            >
              Aim
            </span>
          ) : null}
          {width > 0 && !overlap ? (
            <span
              aria-hidden
              className="absolute top-1/2 h-0.5 -translate-y-1/2"
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundImage:
                  "repeating-linear-gradient(90deg, var(--accent-link) 0 4px, transparent 4px 7px)",
              }}
            />
          ) : null}
          <span
            aria-hidden
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-link bg-card"
            style={{ left: `${you}%` }}
          />
          <span
            aria-hidden
            className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent transition-[left] duration-[250ms] ease-out"
            style={{
              left: `${aim}%`,
              boxShadow: "0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent)",
            }}
          />
        </div>
        <div className="relative mt-1.5 h-[14px] text-[11px]">
          <span
            className="absolute -translate-x-1/2 text-muted"
            style={{ left: `${you}%` }}
          >
            You
          </span>
          {overlap ? null : (
            <span
              className="absolute -translate-x-1/2 font-semibold text-accent-link transition-[left] duration-[250ms] ease-out"
              style={{ left: `${aim}%` }}
            >
              Aim
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

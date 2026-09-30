"use client";

import { useEffect, useState } from "react";
import {
  COLOR_SCHEME_CHANGED_EVENT,
  applyColorScheme,
  getDefaultColorScheme,
  getStoredColorScheme,
  isDarkColorScheme,
  setColorScheme,
  type ColorScheme,
} from "../theme/color-scheme";

type ColorSchemePickerProps = {
  className?: string;
  /** @deprecated Compact/menu variants are a single icon toggle now. */
  compact?: boolean;
  /** Header chrome uses nav-muted; sidebar/home keep softer surfaces. */
  variant?: "header" | "sidebar" | "home-v2";
  /** @deprecated Menu direction ignored — toggle has no menu. */
  menu?: "down" | "up" | "end";
  /** @deprecated Light/dark only; options are ignored. */
  options?: ReadonlyArray<{ id: ColorScheme; label: string }>;
};

/**
 * Light ↔ dark appearance toggle (sun / moon). Hybrid and v2 remain valid
 * stored values but map to the light side of the toggle. On Next marketing,
 * the light side is hybrid (cream header); on the SPA it is light.
 */
export function ColorSchemePicker({
  className = "",
  variant = "header",
}: ColorSchemePickerProps) {
  const [scheme, setScheme] = useState<ColorScheme>("light");

  useEffect(() => {
    applyColorScheme(getStoredColorScheme());
    const sync = () => setScheme(getStoredColorScheme());
    sync();
    window.addEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
  }, []);

  const dark = isDarkColorScheme(scheme);

  function toggle() {
    const next: ColorScheme = dark ? getDefaultColorScheme() : "dark";
    setColorScheme(next);
    setScheme(next);
  }

  const triggerClass =
    variant === "header"
      ? "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-nav-muted transition-colors hover:bg-nav-active hover:text-nav-foreground"
      : variant === "home-v2"
        ? "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--hv2-hero-divider)] text-[var(--hv2-hero-nav)] transition-colors hover:border-[rgb(var(--hv2-gold-rgb)/0.55)] hover:text-[var(--hv2-gold)]"
        : "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-nav-active hover:text-foreground";

  return (
    <button
      type="button"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={toggle}
      className={`${triggerClass} ${className}`.trim()}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** Generic sun (not the brand mark). */
function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

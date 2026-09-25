"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLOR_SCHEME_CHANGED_EVENT,
  COLOR_SCHEME_OPTIONS,
  applyColorScheme,
  getStoredColorScheme,
  parseColorScheme,
  setColorScheme,
  type ColorScheme,
} from "../theme/color-scheme";

type ColorSchemePickerProps = {
  className?: string;
  /** Narrow rail — icon trigger, menu opens to the right. */
  compact?: boolean;
  /** Sidebar chrome is quieter than the marketing header. */
  variant?: "header" | "sidebar" | "home-v2";
  /** Sidebar footers open upward so the menu is not clipped. */
  menu?: "down" | "up" | "end";
  /** Override the option list (e.g. homepage v2: Light / Dark / V2). */
  options?: ReadonlyArray<{ id: ColorScheme; label: string }>;
};

export function ColorSchemePicker({
  className = "",
  compact = false,
  variant = "header",
  menu = "down",
  options = COLOR_SCHEME_OPTIONS,
}: ColorSchemePickerProps) {
  const [scheme, setScheme] = useState<ColorScheme>("light");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyColorScheme(getStoredColorScheme());
    const sync = () => setScheme(getStoredColorScheme());
    sync();
    window.addEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    options.find((o) => o.id === scheme) ??
    COLOR_SCHEME_OPTIONS.find((o) => o.id === scheme) ??
    options[0] ??
    COLOR_SCHEME_OPTIONS[0]!;

  function choose(next: ColorScheme) {
    setColorScheme(next);
    setScheme(next);
    setOpen(false);
  }

  const menuPos =
    menu === "up"
      ? "bottom-full right-0 mb-1"
      : menu === "end"
        ? "left-full bottom-0 ml-1"
        : "top-full right-0 mt-1";

  const triggerClass = compact
    ? "inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-nav-active hover:text-foreground"
    : variant === "sidebar"
      ? "inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm text-muted transition-colors hover:bg-nav-active hover:text-foreground"
      : variant === "home-v2"
        ? "inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-[var(--hv2-hero-divider)] px-2.5 text-sm text-[var(--hv2-hero-nav)] transition-colors hover:border-[rgb(var(--hv2-gold-rgb)/0.55)] hover:text-[var(--hv2-gold)]"
        : "inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-marketing-nav-chrome px-2.5 text-sm text-nav-muted transition-[background-color,color,border-color] duration-150 ease-out hover:bg-nav-active hover:text-nav-foreground";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Appearance: ${current.label}`}
        title={
          current.id === "hybrid"
            ? "Hybrid — light UI with dark patterned surfaces"
            : current.id === "v2"
              ? "V2 — navy / ivory / gold palette"
              : `Appearance: ${current.label}`
        }
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
      >
        {compact ? (
          <SchemeGlyph scheme={scheme} />
        ) : (
          <>
            <span>{current.label}</span>
            <Chevron open={open} />
          </>
        )}
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Appearance"
          className={`absolute z-[120] min-w-[7.5rem] rounded-lg border border-border bg-card py-1 shadow-[0_8px_24px_color-mix(in_srgb,var(--overlay)_16%,transparent)] ${menuPos}`}
        >
          {options.map((opt) => {
            const selected = opt.id === scheme;
            return (
              <li key={opt.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => choose(opt.id)}
                  className={`flex w-full cursor-pointer items-center px-3 py-1.5 text-left text-sm ${
                    selected
                      ? "bg-nav-active font-medium text-foreground"
                      : "text-foreground hover:bg-nav-active"
                  }`}
                >
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function SchemeGlyph({ scheme }: { scheme: ColorScheme }) {
  const parsed = parseColorScheme(scheme) ?? "light";
  if (parsed === "dark") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  if (parsed === "hybrid" || parsed === "v2") {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      aria-hidden
      className={`transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

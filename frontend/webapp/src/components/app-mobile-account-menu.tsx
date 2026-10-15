"use client";

import {
  COLOR_SCHEME_CHANGED_EVENT,
  getDefaultColorScheme,
  getStoredColorScheme,
  isDarkColorScheme,
  setColorScheme,
  type ColorScheme,
} from "@consciously/common";
import { LogOut, Settings, Shield } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@/lib/spa-nav";
import { clearMedimadeSession } from "@/lib/auth-session";

export function AppMobileAccountMenu({
  accountLabel,
  showAdmin,
}: {
  accountLabel: string;
  showAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scheme, setScheme] = useState<ColorScheme>("light");
  const rootRef = useRef<HTMLDivElement>(null);
  const initial = (accountLabel.trim()[0] || "G").toUpperCase();
  const dark = isDarkColorScheme(scheme);

  useEffect(() => {
    const sync = () => setScheme(getStoredColorScheme());
    sync();
    window.addEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COLOR_SCHEME_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div ref={rootRef} className="relative md:hidden">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${accountLabel}`}
        title={accountLabel}
        onClick={() => setOpen((v) => !v)}
        className={`header-gold-sunlit-fill flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-semibold text-on-accent transition-[box-shadow,opacity] hover:opacity-90 ${
          open ? "ring-2 ring-accent ring-offset-2 ring-offset-nav" : ""
        }`}
      >
        {initial}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[145] md:hidden">
              <button
                type="button"
                aria-label="Close account menu"
                className="absolute inset-0 bg-overlay/35"
                onClick={() => setOpen(false)}
              />
              <div
                role="menu"
                aria-label="Account"
                className="absolute right-3 top-[calc(3.5rem+6px)] w-[min(calc(100vw-1.5rem),20rem)] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-[0_12px_32px_rgb(15_27_45_/_0.16)]"
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="header-gold-sunlit-fill flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-on-accent">
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {accountLabel}
                    </p>
                    <p className="text-xs text-muted">Signed in</p>
                  </div>
                  <Link
                    href="/settings/account"
                    onClick={() => setOpen(false)}
                    className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-accent-link transition-opacity hover:opacity-80"
                  >
                    Pro
                  </Link>
                </div>

                <div className="flex h-[46px] items-center justify-between gap-3 px-4">
                  <span className="text-sm text-foreground">Appearance</span>
                  <div className="inline-flex rounded-full border border-border p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const next = getDefaultColorScheme();
                        setColorScheme(next);
                        setScheme(next);
                      }}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                        !dark
                          ? "bg-selected text-on-selected"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setColorScheme("dark");
                        setScheme("dark");
                      }}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                        dark
                          ? "bg-selected text-on-selected"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      Dark
                    </button>
                  </div>
                </div>

                <Link
                  href="/settings/account"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex h-[46px] items-center gap-3 px-4 text-sm text-foreground transition-colors hover:bg-accent-soft"
                >
                  <Settings className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} />
                  Settings
                </Link>
                {showAdmin ? (
                  <Link
                    href="/admin"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex h-[46px] items-center gap-3 px-4 text-sm text-foreground transition-colors hover:bg-accent-soft"
                  >
                    <Shield className="size-[18px] shrink-0 text-muted" strokeWidth={1.75} />
                    Admin
                  </Link>
                ) : null}

                <div className="my-1 border-t border-border" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    clearMedimadeSession();
                  }}
                  className="flex h-[46px] w-full cursor-pointer items-center gap-3 px-4 text-left text-sm text-muted transition-colors hover:bg-accent-soft hover:text-foreground"
                >
                  <LogOut className="size-[18px] shrink-0" strokeWidth={1.75} />
                  Sign out
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

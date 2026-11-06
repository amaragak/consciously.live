"use client";

import {
  COLOR_SCHEME_CHANGED_EVENT,
  getDefaultColorScheme,
  getStoredColorScheme,
  isDarkColorScheme,
  setColorScheme,
  type ColorScheme,
} from "@consciously/common";
import {
  Bell,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SelectChevron } from "@/components/select-chevron";
import { Link } from "@/lib/spa-nav";
import { clearMedimadeSession } from "@/lib/auth-session";
import {
  APP_NOTIFICATIONS_CHANGED_EVENT,
  loadAppNotifications,
  unreadAppNotificationCount,
} from "@/lib/app-notifications";
import { toggleAssistantChatPanel } from "@/lib/assistant-chat-launch";
import { useMvpFlags } from "@/lib/mvp-flags";

function MenuIconTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-link">
      {children}
    </span>
  );
}

export function AppMobileAccountMenu({
  accountLabel,
  showAdmin,
}: {
  accountLabel: string;
  showAdmin: boolean;
}) {
  const chatOn = useMvpFlags().chat;
  const [open, setOpen] = useState(false);
  const [scheme, setScheme] = useState<ColorScheme>("light");
  const [unread, setUnread] = useState(0);
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
    const sync = () =>
      setUnread(unreadAppNotificationCount(loadAppNotifications()));
    sync();
    window.addEventListener(APP_NOTIFICATIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(APP_NOTIFICATIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
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
    <div ref={rootRef} className="relative ml-0.5 md:hidden">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Account: ${accountLabel}, ${unread} unread notifications`
            : `Account: ${accountLabel}`
        }
        title={accountLabel}
        onClick={() => setOpen((v) => !v)}
        className={`app-mobile-account-trigger header-gold-sunlit-fill relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-xs font-semibold text-on-accent transition-[box-shadow,opacity] hover:opacity-90 ${
          open ? "ring-2 ring-accent ring-offset-2 ring-offset-card" : ""
        }`}
      >
        {initial}
        {unread > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-danger ring-2 ring-card"
            aria-hidden
          />
        ) : null}
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
                className="absolute right-[14px] top-[calc(var(--app-header-h)+4px)] w-[min(calc(100vw-1.75rem),18.5rem)] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-[0_12px_32px_rgb(15_27_45_/_0.16)]"
              >
                <Link
                  href="/settings/account"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-accent-soft/40"
                >
                  <span className="header-gold-sunlit-fill flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-on-accent">
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {accountLabel}
                    </p>
                    <p className="text-xs text-muted">Profile and account</p>
                  </div>
                </Link>

                <div className="border-t border-border px-1.5 py-1.5">
                  <Link
                    href="/notifications"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex h-11 items-center gap-3 rounded-xl px-2 text-sm text-foreground transition-colors hover:bg-accent-soft/40"
                  >
                    <MenuIconTile>
                      <Bell className="size-[16px]" strokeWidth={1.85} />
                    </MenuIconTile>
                    <span className="min-w-0 flex-1 font-medium">
                      Notifications
                    </span>
                    {unread > 0 ? (
                      <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-[11px] font-semibold text-white">
                        {unread > 9 ? "9+" : unread} new
                      </span>
                    ) : (
                      <SelectChevron direction="right" />
                    )}
                  </Link>

                  {chatOn ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        toggleAssistantChatPanel();
                      }}
                      className="flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-2 text-left text-sm text-foreground transition-colors hover:bg-accent-soft/40"
                    >
                      <MenuIconTile>
                        <MessageSquare
                          className="size-[16px]"
                          strokeWidth={1.85}
                        />
                      </MenuIconTile>
                      <span className="min-w-0 flex-1 font-medium">Chat</span>
                      <SelectChevron direction="right" />
                    </button>
                  ) : null}

                  <Link
                    href="/settings/account"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex h-11 items-center gap-3 rounded-xl px-2 text-sm text-foreground transition-colors hover:bg-accent-soft/40"
                  >
                    <MenuIconTile>
                      <Settings className="size-[16px]" strokeWidth={1.85} />
                    </MenuIconTile>
                    <span className="min-w-0 flex-1 font-medium">Settings</span>
                    <SelectChevron direction="right" />
                  </Link>

                  {showAdmin ? (
                    <Link
                      href="/admin"
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="flex h-11 items-center gap-3 rounded-xl px-2 text-sm text-foreground transition-colors hover:bg-accent-soft/40"
                    >
                      <MenuIconTile>
                        <Shield className="size-[16px]" strokeWidth={1.85} />
                      </MenuIconTile>
                      <span className="min-w-0 flex-1 font-medium">Admin</span>
                      <SelectChevron direction="right" />
                    </Link>
                  ) : null}
                </div>

                <div className="flex h-[46px] items-center justify-between gap-3 border-t border-border px-4">
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

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    clearMedimadeSession();
                  }}
                  className="flex h-[46px] w-full cursor-pointer items-center gap-3 border-t border-border px-4 text-left text-sm text-muted transition-colors hover:bg-accent-soft hover:text-foreground"
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

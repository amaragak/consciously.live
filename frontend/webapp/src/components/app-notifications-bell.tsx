"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  APP_NOTIFICATIONS_CHANGED_EVENT,
  clearAppNotifications,
  dismissAppNotification,
  loadAppNotifications,
  markAllAppNotificationsRead,
  markAppNotificationRead,
  unreadAppNotificationCount,
  type AppNotification,
} from "@/lib/app-notifications";
import {
  PENDING_LIBRARY_GENERATIONS_CHANGED_EVENT,
  loadPendingGenerations,
} from "@/lib/pending-library-generations";
import {
  ensurePendingMeditationJobPoller,
  startPendingMeditationJobPoller,
  stopPendingMeditationJobPoller,
} from "@/lib/poll-pending-meditation-jobs";

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Top-bar notification bell: unread badge + dropdown inbox.
 * Also keeps the pending-meditation job poller alive.
 */
export function AppNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => {
      setItems(loadAppNotifications());
      setPendingCount(
        loadPendingGenerations().filter((p) => p.status !== "failed").length,
      );
      ensurePendingMeditationJobPoller();
    };
    sync();
    startPendingMeditationJobPoller();
    window.addEventListener(APP_NOTIFICATIONS_CHANGED_EVENT, sync);
    window.addEventListener(PENDING_LIBRARY_GENERATIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(APP_NOTIFICATIONS_CHANGED_EVENT, sync);
      window.removeEventListener(
        PENDING_LIBRARY_GENERATIONS_CHANGED_EVENT,
        sync,
      );
      window.removeEventListener("storage", sync);
      if (loadPendingGenerations().length === 0) {
        stopPendingMeditationJobPoller();
      }
    };
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

  const unread = unreadAppNotificationCount(items);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label={
          unread > 0
            ? `Notifications, ${unread} unread`
            : pendingCount > 0
              ? `Notifications, ${pendingCount} generating`
              : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-accent-soft/40 hover:text-foreground"
      >
        <Bell aria-hidden className="size-[18px]" strokeWidth={1.75} />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-on-accent">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : pendingCount > 0 ? (
          <span
            className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent"
            aria-hidden
          />
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-[140] mt-1.5 w-[min(calc(100vw-1.5rem),20rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
            <p className="text-sm font-semibold text-foreground">
              Notifications
            </p>
            <div className="flex items-center gap-2">
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => markAllAppNotificationsRead()}
                  className="cursor-pointer text-[11px] font-medium text-accent-link hover:underline"
                >
                  Mark all read
                </button>
              ) : null}
              {items.length > 0 ? (
                <button
                  type="button"
                  onClick={() => clearAppNotifications()}
                  className="cursor-pointer text-[11px] text-muted hover:text-foreground"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          {pendingCount > 0 ? (
            <p className="border-b border-border/70 bg-accent-soft/25 px-3.5 py-2 text-xs text-muted">
              {pendingCount === 1
                ? "1 meditation is still generating…"
                : `${pendingCount} meditations are still generating…`}
            </p>
          ) : null}

          {items.length === 0 ? (
            <p className="px-3.5 py-6 text-center text-sm text-muted">
              No notifications yet
            </p>
          ) : (
            <ul className="max-h-[min(60vh,22rem)] overflow-y-auto">
              {items.map((n) => {
                const inner = (
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-sm leading-snug ${
                          n.read
                            ? "font-medium text-muted"
                            : "font-semibold text-foreground"
                        }`}
                      >
                        {n.title}
                      </p>
                      {!n.read ? (
                        <span
                          className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-muted/80">
                      {formatWhen(n.createdAt)}
                    </p>
                  </>
                );

                return (
                  <li
                    key={n.id}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <div className="flex items-stretch gap-1">
                      {n.href ? (
                        <Link
                          href={n.href}
                          role="menuitem"
                          onClick={() => {
                            markAppNotificationRead(n.id);
                            setOpen(false);
                          }}
                          className="min-w-0 flex-1 px-3.5 py-2.5 text-left transition-colors hover:bg-accent-soft/30"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => markAppNotificationRead(n.id)}
                          className="min-w-0 flex-1 cursor-pointer px-3.5 py-2.5 text-left transition-colors hover:bg-accent-soft/30"
                        >
                          {inner}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => dismissAppNotification(n.id)}
                        className="shrink-0 cursor-pointer px-2.5 text-xs text-muted hover:text-foreground"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

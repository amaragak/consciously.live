"use client";

import { Bell, ScrollText, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/spa-nav";
import {
  APP_NOTIFICATIONS_CHANGED_EVENT,
  loadAppNotifications,
  markAllAppNotificationsRead,
  markAppNotificationRead,
  type AppNotification,
  type AppNotificationKind,
} from "@/lib/app-notifications";

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = Date.now();
    const diff = Math.max(0, now - d.getTime());
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24 && startOfLocalDay(d) === startOfLocalDay(new Date())) {
      return `${hours}h ago`;
    }
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function sectionForKind(kind: AppNotificationKind): string {
  if (kind === "story_reminder") return "Manifest";
  return "Meditate";
}

function IconForKind({ kind }: { kind: AppNotificationKind }) {
  if (kind === "meditation_failed") {
    return <TriangleAlert className="size-[16px]" strokeWidth={1.85} />;
  }
  if (kind === "story_reminder") {
    return <ScrollText className="size-[16px]" strokeWidth={1.85} />;
  }
  if (kind === "meditation_ready") {
    return <Sparkles className="size-[16px]" strokeWidth={1.85} />;
  }
  return <Bell className="size-[16px]" strokeWidth={1.85} />;
}

function NotificationRow({
  item,
  divider,
}: {
  item: AppNotification;
  divider: boolean;
}) {
  const section = sectionForKind(item.kind);
  const when = formatRelativeTime(item.createdAt);
  const message = item.body?.trim() || item.title;
  const meta = `${section}${when ? ` · ${when}` : ""}`;

  const inner = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent-link">
        <IconForKind kind={item.kind} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[14px] leading-snug text-foreground ${
            item.read ? "font-medium" : "font-semibold"
          }`}
        >
          {message}
        </span>
        <span className="mt-0.5 block text-[12px] text-muted">{meta}</span>
      </span>
      {!item.read ? (
        <span
          className="mt-1.5 size-2 shrink-0 rounded-full bg-danger"
          aria-hidden
        />
      ) : null}
    </>
  );

  const rowClass = `flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent-soft/30 ${
    divider ? "border-t border-border" : ""
  }`;

  if (item.href) {
    return (
      <Link
        href={item.href}
        onClick={() => markAppNotificationRead(item.id)}
        className={rowClass}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => markAppNotificationRead(item.id)}
      className={`cursor-pointer ${rowClass}`}
    >
      {inner}
    </button>
  );
}

function Group({
  label,
  items,
  showMarkAll,
}: {
  label: string;
  items: AppNotification[];
  showMarkAll?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          {label}
        </h2>
        {showMarkAll ? (
          <button
            type="button"
            onClick={() => markAllAppNotificationsRead()}
            className="cursor-pointer text-[13px] font-semibold text-accent-link transition-opacity hover:opacity-80"
          >
            Mark all as read
          </button>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {items.map((item, i) => (
          <NotificationRow key={item.id} item={item} divider={i > 0} />
        ))}
      </div>
    </section>
  );
}

export function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    const sync = () => setItems(loadAppNotifications());
    sync();
    window.addEventListener(APP_NOTIFICATIONS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(APP_NOTIFICATIONS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const { today, earlier, unread } = useMemo(() => {
    const start = startOfLocalDay(new Date());
    const todayItems: AppNotification[] = [];
    const earlierItems: AppNotification[] = [];
    for (const n of items) {
      const t = new Date(n.createdAt).getTime();
      if (!Number.isNaN(t) && t >= start) todayItems.push(n);
      else earlierItems.push(n);
    }
    return {
      today: todayItems,
      earlier: earlierItems,
      unread: items.some((n) => !n.read),
    };
  }, [items]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          No notifications yet
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <Group label="Today" items={today} showMarkAll={unread} />
          <Group
            label="Earlier"
            items={earlier}
            showMarkAll={unread && today.length === 0}
          />
        </div>
      )}
    </div>
  );
}

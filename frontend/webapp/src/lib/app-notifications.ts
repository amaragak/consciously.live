/**
 * In-app notification inbox (top-bar bell). No browser Notification API.
 */

export type AppNotification = {
  id: string;
  kind: "meditation_ready" | "meditation_failed";
  title: string;
  body?: string;
  href?: string;
  createdAt: string;
  read: boolean;
};

export const APP_NOTIFICATIONS_LS_KEY = "mm_app_notifications_v1";
export const APP_NOTIFICATIONS_CHANGED_EVENT = "mm-app-notifications-changed";

function notifyChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(APP_NOTIFICATIONS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function loadAppNotifications(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(APP_NOTIFICATIONS_LS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .filter((x): x is AppNotification => {
        if (!x || typeof x !== "object") return false;
        const o = x as Record<string, unknown>;
        return (
          typeof o.id === "string" &&
          typeof o.title === "string" &&
          typeof o.createdAt === "string" &&
          typeof o.read === "boolean" &&
          (o.kind === "meditation_ready" || o.kind === "meditation_failed")
        );
      })
      .slice(0, 40);
  } catch {
    return [];
  }
}

export function saveAppNotifications(next: AppNotification[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      APP_NOTIFICATIONS_LS_KEY,
      JSON.stringify(next.slice(0, 40)),
    );
    notifyChanged();
  } catch {
    /* ignore */
  }
}

export function unreadAppNotificationCount(
  items: AppNotification[] = loadAppNotifications(),
): number {
  return items.filter((n) => !n.read).length;
}

/** Upsert a notification (keeps unread if already unread, or re-opens as unread). */
export function upsertAppNotification(
  entry: Omit<AppNotification, "read" | "createdAt"> & {
    createdAt?: string;
    read?: boolean;
  },
): void {
  const id = entry.id.trim();
  if (!id) return;
  const prev = loadAppNotifications();
  const existing = prev.find((n) => n.id === id);
  const row: AppNotification = {
    id,
    kind: entry.kind,
    title: entry.title.trim() || "Notification",
    ...(entry.body?.trim() ? { body: entry.body.trim() } : {}),
    ...(entry.href?.trim() ? { href: entry.href.trim() } : {}),
    createdAt: entry.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
    read: entry.read ?? false,
  };
  const next = [row, ...prev.filter((n) => n.id !== id)];
  saveAppNotifications(next);
}

export function markAppNotificationRead(id: string): void {
  const next = loadAppNotifications().map((n) =>
    n.id === id ? { ...n, read: true } : n,
  );
  saveAppNotifications(next);
}

export function markAllAppNotificationsRead(): void {
  const next = loadAppNotifications().map((n) => ({ ...n, read: true }));
  saveAppNotifications(next);
}

export function dismissAppNotification(id: string): void {
  saveAppNotifications(loadAppNotifications().filter((n) => n.id !== id));
}

export function clearAppNotifications(): void {
  saveAppNotifications([]);
}

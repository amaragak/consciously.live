/**
 * Server-side helpers for Consciously Listen public pages.
 */

export type ListenPublicItem = {
  slug: string;
  username: string | null;
  pathSlug: string | null;
  href: string | null;
  kind: "meditation" | "story";
  title: string;
  description: string;
  shownAs: string | null;
  showBrief: boolean;
  brief: string | null;
  listed: boolean;
  isExample: boolean;
  style: string | null;
  durationSec: number | null;
  audioUrl: string | null;
  coverImageUrl: string | null;
  storyText: string | null;
};

function apiBase(): string | null {
  const u = process.env.NEXT_PUBLIC_MEDIMADE_API_URL?.trim().replace(/\/$/, "");
  return u || null;
}

function parseItem(raw: unknown): ListenPublicItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const slug = typeof o.slug === "string" ? o.slug.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!slug || !title) return null;
  const username =
    typeof o.username === "string" && o.username.trim()
      ? o.username.trim().toLowerCase()
      : null;
  const pathSlug =
    typeof o.pathSlug === "string" && o.pathSlug.trim()
      ? o.pathSlug.trim()
      : null;
  const href =
    typeof o.href === "string" && o.href.trim()
      ? o.href.trim()
      : username && pathSlug
        ? `/listen/${encodeURIComponent(username)}/${encodeURIComponent(pathSlug)}`
        : slug
          ? `/listen/${encodeURIComponent(slug)}`
          : null;
  return {
    slug,
    username,
    pathSlug,
    href,
    kind: o.kind === "story" ? "story" : "meditation",
    title,
    description:
      typeof o.description === "string" ? o.description.trim() : "",
    shownAs:
      typeof o.shownAs === "string" && o.shownAs.trim()
        ? o.shownAs.trim()
        : null,
    showBrief: o.showBrief === true,
    brief:
      typeof o.brief === "string" && o.brief.trim() ? o.brief.trim() : null,
    listed: o.listed === true,
    isExample: o.isExample === true,
    style: typeof o.style === "string" && o.style.trim() ? o.style.trim() : null,
    durationSec:
      typeof o.durationSec === "number" && Number.isFinite(o.durationSec)
        ? o.durationSec
        : null,
    audioUrl:
      typeof o.audioUrl === "string" && o.audioUrl.trim()
        ? o.audioUrl.trim()
        : null,
    coverImageUrl:
      typeof o.coverImageUrl === "string" && o.coverImageUrl.trim()
        ? o.coverImageUrl.trim()
        : null,
    storyText:
      typeof o.storyText === "string" && o.storyText.trim()
        ? o.storyText.trim()
        : null,
  };
}

export function listenItemHref(item: ListenPublicItem): string {
  return item.href || `/listen/${encodeURIComponent(item.slug)}`;
}

export async function fetchListenIndex(): Promise<{
  meditations: ListenPublicItem[];
  stories: ListenPublicItem[];
}> {
  const base = apiBase();
  if (!base) return { meditations: [], stories: [] };
  try {
    const res = await fetch(`${base}/public/listen`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return { meditations: [], stories: [] };
    const data = (await res.json()) as {
      meditations?: unknown[];
      stories?: unknown[];
    };
    return {
      meditations: (data.meditations ?? [])
        .map(parseItem)
        .filter((x): x is ListenPublicItem => Boolean(x)),
      stories: (data.stories ?? [])
        .map(parseItem)
        .filter((x): x is ListenPublicItem => Boolean(x)),
    };
  } catch {
    return { meditations: [], stories: [] };
  }
}

export type ListenSlugResult =
  | { status: "ok"; item: ListenPublicItem; more: ListenPublicItem[] }
  | { status: "redirect"; redirectTo: string }
  | { status: "revoked" }
  | { status: "missing" };

export async function fetchListenBySlug(
  slug: string,
): Promise<ListenSlugResult> {
  const base = apiBase();
  if (!base || !slug) return { status: "missing" };
  try {
    const res = await fetch(
      `${base}/public/listen/${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } },
    );
    if (res.status === 410) return { status: "revoked" };
    if (!res.ok) return { status: "missing" };
    const data = (await res.json()) as {
      status?: string;
      redirectTo?: string;
      item?: unknown;
      more?: unknown[];
      username?: string;
      displayName?: string;
      meditations?: unknown[];
      stories?: unknown[];
    };
    if (data.status === "redirect" && typeof data.redirectTo === "string") {
      return { status: "redirect", redirectTo: data.redirectTo };
    }
    // User page payload (listed items) — not a single item.
    if (Array.isArray(data.meditations) || Array.isArray(data.stories)) {
      return { status: "missing" };
    }
    const item = parseItem(data.item);
    if (!item) return { status: "missing" };
    return {
      status: "ok",
      item,
      more: (data.more ?? [])
        .map(parseItem)
        .filter((x): x is ListenPublicItem => Boolean(x)),
    };
  } catch {
    return { status: "missing" };
  }
}

export type ListenUserPageResult =
  | {
      status: "ok";
      username: string;
      displayName: string;
      meditations: ListenPublicItem[];
      stories: ListenPublicItem[];
    }
  | { status: "redirect"; redirectTo: string }
  | { status: "missing" };

export async function fetchListenUserPage(
  username: string,
): Promise<ListenUserPageResult> {
  const base = apiBase();
  if (!base || !username) return { status: "missing" };
  try {
    const res = await fetch(
      `${base}/public/listen/${encodeURIComponent(username)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return { status: "missing" };
    const data = (await res.json()) as {
      status?: string;
      redirectTo?: string;
      username?: string;
      displayName?: string;
      meditations?: unknown[];
      stories?: unknown[];
      item?: unknown;
    };
    if (data.status === "redirect" && typeof data.redirectTo === "string") {
      return { status: "redirect", redirectTo: data.redirectTo };
    }
    if (data.item && !Array.isArray(data.meditations)) {
      // Legacy single-item response — caller should redirect via fetchListenBySlug.
      return { status: "missing" };
    }
    const meditations = (data.meditations ?? [])
      .map(parseItem)
      .filter((x): x is ListenPublicItem => Boolean(x));
    const stories = (data.stories ?? [])
      .map(parseItem)
      .filter((x): x is ListenPublicItem => Boolean(x));
    if (!meditations.length && !stories.length) return { status: "missing" };
    return {
      status: "ok",
      username:
        typeof data.username === "string" && data.username.trim()
          ? data.username.trim()
          : username,
      displayName:
        typeof data.displayName === "string" && data.displayName.trim()
          ? data.displayName.trim()
          : username,
      meditations,
      stories,
    };
  } catch {
    return { status: "missing" };
  }
}

export async function fetchListenByPath(
  username: string,
  pathKey: string,
): Promise<ListenSlugResult> {
  const base = apiBase();
  if (!base || !username || !pathKey) return { status: "missing" };
  try {
    const res = await fetch(
      `${base}/public/listen/${encodeURIComponent(username)}/${encodeURIComponent(pathKey)}`,
      { next: { revalidate: 60 } },
    );
    if (res.status === 410) return { status: "revoked" };
    if (!res.ok) return { status: "missing" };
    const data = (await res.json()) as {
      status?: string;
      redirectTo?: string;
      item?: unknown;
      more?: unknown[];
    };
    if (data.status === "redirect" && typeof data.redirectTo === "string") {
      return { status: "redirect", redirectTo: data.redirectTo };
    }
    const item = parseItem(data.item);
    if (!item) return { status: "missing" };
    return {
      status: "ok",
      item,
      more: (data.more ?? [])
        .map(parseItem)
        .filter((x): x is ListenPublicItem => Boolean(x)),
    };
  } catch {
    return { status: "missing" };
  }
}

export function formatListenDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "";
  const m = Math.max(1, Math.round(sec / 60));
  return `${m} min`;
}

export function formatListenClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

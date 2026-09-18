/**
 * Server-side public meditation helpers for marketing SSR pages.
 */

export type PublicMeditationSummary = {
  id: string;
  title: string;
  description: string;
  durationSec: number | null;
  audioUrl: string | null;
  shareToken?: string | null;
};

function apiBase(): string | null {
  const u = process.env.NEXT_PUBLIC_MEDIMADE_API_URL?.trim().replace(/\/$/, "");
  return u || null;
}

export async function fetchSharedMeditationByToken(
  token: string,
): Promise<PublicMeditationSummary | null> {
  const base = apiBase();
  if (!base || !token) return null;
  try {
    const res = await fetch(
      `${base}/public/meditations/by-token/${encodeURIComponent(token)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      id: token,
      title:
        (typeof data.title === "string" && data.title.trim()) || "Meditation",
      description:
        (typeof data.description === "string" && data.description.trim()) || "",
      durationSec:
        typeof data.durationSec === "number" && Number.isFinite(data.durationSec)
          ? data.durationSec
          : null,
      audioUrl:
        typeof data.audioUrl === "string" && data.audioUrl.trim()
          ? data.audioUrl.trim()
          : null,
      shareToken: token,
    };
  } catch {
    return null;
  }
}

export async function fetchPublicMeditationById(
  id: string,
): Promise<PublicMeditationSummary | null> {
  const base = apiBase();
  if (!base || !id) return null;
  try {
    const res = await fetch(
      `${base}/public/meditations/by-id/${encodeURIComponent(id)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      id,
      title:
        (typeof data.title === "string" && data.title.trim()) || "Meditation",
      description:
        (typeof data.description === "string" && data.description.trim()) || "",
      durationSec:
        typeof data.durationSec === "number" && Number.isFinite(data.durationSec)
          ? data.durationSec
          : null,
      audioUrl:
        typeof data.audioUrl === "string" && data.audioUrl.trim()
          ? data.audioUrl.trim()
          : null,
      shareToken:
        typeof data.shareToken === "string" && data.shareToken.trim()
          ? data.shareToken.trim()
          : null,
    };
  } catch {
    return null;
  }
}

export type CommunityBrowseItem = {
  id: string;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  speakerName: string | null;
};

export async function fetchCommunityBrowseItems(): Promise<
  CommunityBrowseItem[]
> {
  const base = apiBase();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/library/meditations?community=1`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: unknown[] };
    const items = Array.isArray(data.items) ? data.items : [];
    const out: CommunityBrowseItem[] = [];
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : "";
      if (!id) continue;
      out.push({
        id,
        title:
          (typeof o.title === "string" && o.title.trim()) || "Meditation",
        description:
          typeof o.description === "string" && o.description.trim()
            ? o.description.trim()
            : null,
        durationSeconds:
          typeof o.durationSeconds === "number" &&
          Number.isFinite(o.durationSeconds)
            ? o.durationSeconds
            : null,
        speakerName:
          typeof o.speakerName === "string" && o.speakerName.trim()
            ? o.speakerName.trim()
            : null,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function formatDurationSec(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

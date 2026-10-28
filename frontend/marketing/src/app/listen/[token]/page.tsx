import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ListenLinkOff,
  ListenShareClient,
} from "@/components/listen/listen-share-client";
import {
  fetchListenBySlug,
  type ListenPublicItem,
} from "@/lib/public-listen";
import { fetchSharedMeditationByToken } from "@/lib/public-meditations";

type Props = { params: Promise<{ token: string }> };

function looksLikeOpaqueToken(value: string): boolean {
  // Legacy share tokens are base64url from randomBytes (16–64 chars).
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token: raw } = await params;
  const slugOrToken = decodeURIComponent(raw || "").trim();
  if (!slugOrToken) return { title: "Listen", robots: { index: false } };

  const bySlug = await fetchListenBySlug(slugOrToken);
  if (bySlug.status === "ok") {
    const item = bySlug.item;
    const desc =
      item.description ||
      "Listen to a shared guided meditation on Consciously.";
    return {
      title: `${item.title}`,
      description: desc,
      openGraph: {
        title: `${item.title} · Consciously`,
        description: desc,
        type: "website",
        url: `https://consciously.live/listen/${encodeURIComponent(item.slug)}`,
        ...(item.coverImageUrl
          ? { images: [{ url: item.coverImageUrl }] }
          : {}),
      },
      twitter: {
        card: item.coverImageUrl ? "summary_large_image" : "summary",
        title: `${item.title} · Consciously`,
        description: desc,
      },
      robots: item.listed
        ? { index: true, follow: true }
        : { index: false, follow: false },
    };
  }
  if (bySlug.status === "revoked") {
    return {
      title: "Link unavailable",
      robots: { index: false, follow: false },
    };
  }

  if (looksLikeOpaqueToken(slugOrToken)) {
    const legacy = await fetchSharedMeditationByToken(slugOrToken);
    if (legacy) {
      return {
        title: legacy.title,
        description: legacy.description || undefined,
        robots: { index: false, follow: false },
      };
    }
  }

  return { title: "Not found", robots: { index: false } };
}

export default async function ListenSharePage({ params }: Props) {
  const { token: raw } = await params;
  const slugOrToken = decodeURIComponent(raw || "").trim();
  if (!slugOrToken) notFound();

  const bySlug = await fetchListenBySlug(slugOrToken);
  if (bySlug.status === "revoked") {
    return <ListenLinkOff />;
  }
  if (bySlug.status === "ok") {
    return <ListenShareClient item={bySlug.item} more={bySlug.more} />;
  }

  // Legacy opaque token → prefer redirect to slug when Listen share exists.
  if (looksLikeOpaqueToken(slugOrToken)) {
    const legacy = await fetchSharedMeditationByToken(slugOrToken);
    if (!legacy) notFound();
    const listenSlug =
      typeof (legacy as { listenSlug?: unknown }).listenSlug === "string"
        ? String((legacy as { listenSlug?: string }).listenSlug).trim()
        : "";
    // fetchSharedMeditationByToken may not yet surface listenSlug — re-check API shape.
    if (listenSlug) {
      permanentRedirect(`/listen/${encodeURIComponent(listenSlug)}`);
    }
    // Fall back: render a minimal Listen item from the legacy payload.
    const item: ListenPublicItem = {
      slug: slugOrToken,
      kind: "meditation",
      title: legacy.title,
      description: legacy.description,
      shownAs: null,
      showBrief: false,
      brief: null,
      listed: false,
      isExample: false,
      style: null,
      durationSec: legacy.durationSec,
      audioUrl: legacy.audioUrl,
      coverImageUrl: null,
      storyText: null,
    };
    return <ListenShareClient item={item} more={[]} />;
  }

  notFound();
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ListenLinkOff,
  ListenShareClient,
} from "@/components/listen/listen-share-client";
import { ListenIndexClient } from "@/components/listen/listen-index-client";
import {
  fetchListenBySlug,
  fetchListenUserPage,
  listenItemHref,
  type ListenPublicItem,
} from "@/lib/public-listen";
import { fetchSharedMeditationByToken } from "@/lib/public-meditations";

type Props = { params: Promise<{ username: string }> };

function looksLikeOpaqueToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(value);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username: raw } = await params;
  const key = decodeURIComponent(raw || "").trim();
  if (!key) return { title: "Listen", robots: { index: false } };

  const userPage = await fetchListenUserPage(key);
  if (userPage.status === "ok") {
    return {
      title: userPage.displayName,
      description: `Listen to ${userPage.displayName}'s listed meditations and Stories on Consciously.`,
      openGraph: {
        title: `${userPage.displayName} · Listen · Consciously`,
        url: `https://consciously.live/listen/${encodeURIComponent(userPage.username)}`,
        type: "website",
      },
    };
  }

  const bySlug = await fetchListenBySlug(key);
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
        url: `https://consciously.live${listenItemHref(item)}`,
        ...(item.coverImageUrl
          ? { images: [{ url: item.coverImageUrl }] }
          : {}),
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

  return { title: "Not found", robots: { index: false } };
}

export default async function ListenUsernamePage({ params }: Props) {
  const { username: raw } = await params;
  const key = decodeURIComponent(raw || "").trim();
  if (!key) notFound();

  const userPage = await fetchListenUserPage(key);
  if (userPage.status === "redirect") {
    permanentRedirect(userPage.redirectTo);
  }
  if (userPage.status === "ok") {
    const isHouse = userPage.username === "consciously";
    return (
      <Suspense fallback={null}>
        <ListenIndexClient
          meditations={userPage.meditations}
          stories={userPage.stories}
          headline={userPage.displayName}
          subhead={
            isHouse
              ? "Examples made by Consciously. Press play — no account needed."
              : `Listed meditations and Stories from ${userPage.displayName}.`
          }
        />
      </Suspense>
    );
  }

  const bySlug = await fetchListenBySlug(key);
  if (bySlug.status === "redirect") {
    permanentRedirect(bySlug.redirectTo);
  }
  if (bySlug.status === "revoked") {
    return <ListenLinkOff />;
  }
  if (bySlug.status === "ok") {
    const href = listenItemHref(bySlug.item);
    if (href !== `/listen/${encodeURIComponent(key)}`) {
      permanentRedirect(href);
    }
    return <ListenShareClient item={bySlug.item} more={bySlug.more} />;
  }

  if (looksLikeOpaqueToken(key)) {
    const legacy = await fetchSharedMeditationByToken(key);
    if (!legacy) notFound();
    const listenSlug =
      typeof (legacy as { listenSlug?: unknown }).listenSlug === "string"
        ? String((legacy as { listenSlug?: string }).listenSlug).trim()
        : "";
    if (listenSlug) {
      permanentRedirect(`/listen/${encodeURIComponent(listenSlug)}`);
    }
    const item: ListenPublicItem = {
      slug: key,
      username: null,
      pathSlug: null,
      href: null,
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

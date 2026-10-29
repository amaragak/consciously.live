import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ListenLinkOff,
  ListenShareClient,
} from "@/components/listen/listen-share-client";
import {
  fetchListenByPath,
  listenItemHref,
} from "@/lib/public-listen";

type Props = {
  params: Promise<{ username: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username: uRaw, slug: sRaw } = await params;
  const username = decodeURIComponent(uRaw || "").trim();
  const pathKey = decodeURIComponent(sRaw || "").trim();
  if (!username || !pathKey) {
    return { title: "Listen", robots: { index: false } };
  }

  const result = await fetchListenByPath(username, pathKey);
  if (result.status === "ok") {
    const item = result.item;
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
  if (result.status === "revoked") {
    return {
      title: "Link unavailable",
      robots: { index: false, follow: false },
    };
  }
  return { title: "Not found", robots: { index: false } };
}

export default async function ListenPathPage({ params }: Props) {
  const { username: uRaw, slug: sRaw } = await params;
  const username = decodeURIComponent(uRaw || "").trim();
  const pathKey = decodeURIComponent(sRaw || "").trim();
  if (!username || !pathKey) notFound();

  const result = await fetchListenByPath(username, pathKey);
  if (result.status === "redirect") {
    permanentRedirect(result.redirectTo);
  }
  if (result.status === "revoked") {
    return <ListenLinkOff />;
  }
  if (result.status === "ok") {
    return <ListenShareClient item={result.item} more={result.more} />;
  }
  notFound();
}

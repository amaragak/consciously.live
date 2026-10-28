import type { Metadata } from "next";
import { Suspense } from "react";
import { ListenIndexClient } from "@/components/listen/listen-index-client";
import { fetchListenIndex } from "@/lib/public-listen";

export const metadata: Metadata = {
  title: "Listen",
  description:
    "Meditations and Stories made with Consciously. Press play — no account needed.",
  openGraph: {
    title: "Listen · Consciously",
    description:
      "Meditations and Stories made with Consciously. Press play — no account needed.",
    type: "website",
    url: "https://consciously.live/listen",
  },
};

export default async function ListenIndexPage() {
  const { meditations, stories } = await fetchListenIndex();
  return (
    <Suspense fallback={null}>
      <ListenIndexClient meditations={meditations} stories={stories} />
    </Suspense>
  );
}

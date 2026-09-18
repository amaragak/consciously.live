import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicMeditationPlayer } from "@/components/public-meditation-player";
import {
  fetchSharedMeditationByToken,
  formatDurationSec,
} from "@/lib/public-meditations";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const item = await fetchSharedMeditationByToken(token);
  if (!item) {
    return { title: "Shared meditation", robots: { index: false } };
  }
  const desc =
    item.description ||
    "Listen to a shared guided meditation on Consciously.";
  return {
    title: item.title,
    description: desc,
    openGraph: {
      title: item.title,
      description: desc,
      type: "website",
      url: `https://consciously.live/listen/${encodeURIComponent(token)}`,
    },
    twitter: {
      card: "summary",
      title: item.title,
      description: desc,
    },
    robots: { index: false, follow: false },
  };
}

export default async function ListenByTokenPage({ params }: Props) {
  const { token } = await params;
  const item = await fetchSharedMeditationByToken(token);
  if (!item) notFound();

  return (
    <PublicMeditationPlayer
      title={item.title}
      description={item.description || undefined}
      audioUrl={item.audioUrl}
      durationLabel={formatDurationSec(item.durationSec)}
    />
  );
}

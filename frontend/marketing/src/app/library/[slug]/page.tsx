import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicMeditationPlayer } from "@/components/public-meditation-player";
import {
  fetchPublicMeditationById,
  formatDurationSec,
} from "@/lib/public-meditations";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await fetchPublicMeditationById(slug);
  if (!item) {
    return { title: "Meditation", robots: { index: false } };
  }
  const desc =
    item.description ||
    "Listen to this community meditation on Consciously.";
  return {
    title: item.title,
    description: desc,
    openGraph: {
      title: item.title,
      description: desc,
      type: "website",
      url: `https://consciously.live/library/${encodeURIComponent(slug)}`,
    },
    twitter: {
      card: "summary",
      title: item.title,
      description: desc,
    },
  };
}

export default async function CommunityLibraryDetailPage({ params }: Props) {
  const { slug } = await params;
  const item = await fetchPublicMeditationById(slug);
  if (!item) notFound();

  return (
    <div>
      <PublicMeditationPlayer
        title={item.title}
        description={item.description || undefined}
        audioUrl={item.audioUrl}
        durationLabel={formatDurationSec(item.durationSec)}
      />
      <p className="mx-auto max-w-lg px-4 pb-12 text-center text-sm text-muted">
        <Link href="/library" className="text-accent-link underline-offset-2 hover:underline">
          ← Community library
        </Link>
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import {
  fetchCommunityBrowseItems,
  formatDurationSec,
} from "@/lib/public-meditations";

export const metadata: Metadata = {
  title: "Community library",
  description:
    "Browse publicly shared guided meditations from the Consciously community.",
  openGraph: {
    title: "Community library · Consciously",
    description:
      "Browse publicly shared guided meditations from the Consciously community.",
    type: "website",
    url: "https://consciously.live/library",
  },
};

export default async function CommunityLibraryPage() {
  const items = await fetchCommunityBrowseItems();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-16">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted">
        Consciously
      </p>
      <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        Community library
      </h1>
      <p className="mt-3 max-w-xl text-base text-muted">
        Public meditations shared by creators. Open any title to listen.
      </p>

      {items.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          No public meditations yet. Check back soon.
        </p>
      ) : (
        <ul className="mt-10 divide-y divide-border border-y border-border">
          {items.map((item) => {
            const dur = formatDurationSec(item.durationSeconds);
            return (
              <li key={item.id}>
                <Link
                  href={`/library/${encodeURIComponent(item.id)}`}
                  className="block py-4 transition-colors hover:bg-muted/20"
                >
                  <span className="font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-x-3 text-sm text-muted">
                    {item.speakerName ? <span>{item.speakerName}</span> : null}
                    {dur ? <span>{dur}</span> : null}
                  </span>
                  {item.description ? (
                    <span className="mt-1 line-clamp-2 block text-sm text-foreground/75">
                      {item.description}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

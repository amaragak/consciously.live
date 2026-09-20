import { ReadPostCard } from "@/components/read-post-card";
import { fetchPublishedBlogIndex } from "@/lib/public-blog";

export const metadata = {
  title: "Read",
  description:
    "Notes on living consciously — practice, product, and the craft of attention.",
};

/** Cached until admin purge (`POST /api/revalidate-blog`). Dev uses `no-store` in `public-blog`. */
export const revalidate = false;

export default async function ReadIndexPage() {
  const { posts, indexSummary, authorPhotoUrl, authorPhotoEnabled } =
    await fetchPublishedBlogIndex();
  const showPhoto = authorPhotoEnabled && Boolean(authorPhotoUrl);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-stretch">
        <div className="w-full min-w-0 max-w-xl shrink-0">
          <h1 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">
            <span className="text-foreground">consciously</span>{" "}
            <span className="italic text-accent-link">Read</span>
          </h1>
          {indexSummary ? (
            <p className="mt-3 whitespace-pre-line text-lg leading-relaxed text-muted">
              {indexSummary}
            </p>
          ) : null}
        </div>
        {showPhoto ? (
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
            <img
              key={authorPhotoUrl!}
              src={authorPhotoUrl!}
              alt="Alex"
              width={192}
              height={192}
              className="size-36 rounded-full object-cover shadow-[0_0_0_4px_color-mix(in_srgb,var(--muted)_55%,var(--border)),0_8px_16px_rgba(0,0,0,0.14),0_22px_48px_rgba(0,0,0,0.2)] dark:shadow-[0_0_0_4px_color-mix(in_srgb,var(--muted)_55%,var(--border)),0_8px_16px_rgba(0,0,0,0.35),0_22px_48px_rgba(0,0,0,0.55)] sm:size-48"
            />
          </div>
        ) : null}
      </div>

      {posts.length === 0 ? (
        <p className="mt-12 text-sm text-muted">
          No posts yet — check back soon.
        </p>
      ) : (
        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {posts.map((post) => (
            <li key={post.id}>
              <ReadPostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

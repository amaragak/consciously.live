import "@/components/home-v2/home-v2.css";
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
    <div className="home-v2 home-v2-field h-full">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-6 sm:py-16">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-stretch">
          <div className="w-full min-w-0 flex-1">
            <h1 className="home-v2-display text-4xl font-[350] tracking-tight text-[var(--hv2-hero-fg)] sm:text-5xl">
              Welcome to the blog!
            </h1>
            {indexSummary ? (
              <p className="mt-3 whitespace-pre-line text-lg leading-relaxed text-[var(--hv2-hero-muted)]">
                {indexSummary}
              </p>
            ) : null}
          </div>
          {showPhoto ? (
            <div className="flex min-h-0 min-w-0 shrink-0 items-center justify-center sm:pl-4">
              <img
                key={authorPhotoUrl!}
                src={authorPhotoUrl!}
                alt="Alex"
                width={192}
                height={192}
                className="size-36 rounded-full object-cover shadow-[var(--hv2-hero-elev)] sm:size-48"
              />
            </div>
          ) : null}
        </div>

        {posts.length === 0 ? (
          <p className="mt-12 text-sm text-[var(--hv2-hero-nav-muted)]">
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
    </div>
  );
}

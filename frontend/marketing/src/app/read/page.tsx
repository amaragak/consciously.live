import Link from "next/link";
import {
  fetchPublishedBlogIndex,
  formatBlogDate,
} from "@/lib/public-blog";

export const metadata = {
  title: "Read",
  description:
    "Notes on living consciously — practice, product, and the craft of attention.",
};

export const revalidate = 0;

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
            <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-muted">
              {indexSummary}
            </p>
          ) : null}
        </div>
        {showPhoto ? (
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
            <img
              src={authorPhotoUrl!}
              alt="Alex"
              width={160}
              height={160}
              className="size-28 rounded-full object-cover sm:size-36"
            />
          </div>
        ) : null}
      </div>

      {posts.length === 0 ? (
        <p className="mt-12 text-sm text-muted">
          No posts yet — check back soon.
        </p>
      ) : (
        <ul className="mt-12 flex flex-col gap-8 border-t border-border pt-8">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/read/${encodeURIComponent(post.slug)}`}
                className="group block"
              >
                <p className="text-xs text-muted">
                  {formatBlogDate(post.publishedAt || post.updatedAt)}
                </p>
                <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-foreground transition-opacity group-hover:opacity-80">
                  {post.title}
                </h2>
                {post.excerpt || post.subheader ? (
                  <p className="mt-2 text-[15px] leading-relaxed text-muted">
                    {post.excerpt || post.subheader}
                  </p>
                ) : null}
                <span className="mt-3 inline-block text-sm font-medium text-accent-link">
                  Continue →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

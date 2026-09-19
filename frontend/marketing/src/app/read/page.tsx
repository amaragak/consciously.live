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

export const revalidate = 60;

export default async function ReadIndexPage() {
  const { posts, indexSummary } = await fetchPublishedBlogIndex();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-marketing-eyebrow">
        Read
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
        Writing
      </h1>
      {indexSummary ? (
        <p className="mt-3 max-w-xl whitespace-pre-line text-base leading-relaxed text-muted">
          {indexSummary}
        </p>
      ) : null}

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

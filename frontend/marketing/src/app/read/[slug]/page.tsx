import Link from "next/link";
import { notFound } from "next/navigation";
import { ReadBody } from "@/components/blog-markdown";
import { ReadNarrationButton } from "@/components/read-narration-button";
import { ReadPostTags } from "@/components/read-post-tags";
import { ReadSeriesLabel } from "@/components/read-series-label";
import {
  fetchPublishedBlogPost,
  fetchPublishedBlogPosts,
  formatBlogDate,
} from "@/lib/public-blog";

/** Cached until admin purge (`POST /api/revalidate-blog`). Dev uses `no-store` in `public-blog`. */
export const revalidate = false;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const posts = await fetchPublishedBlogPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const post = await fetchPublishedBlogPost(slug);
  if (!post) return { title: "Post" };
  return {
    title: post.title,
    description: post.subheader || undefined,
  };
}

export default async function ReadPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await fetchPublishedBlogPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto w-full max-w-[1200px] px-5 py-12 md:px-6 sm:py-16">
      <Link
        href="/read"
        className="text-sm font-medium text-[var(--hv2-hero-nav)] transition-colors hover:text-[var(--hv2-gold)]"
      >
        ← Read
      </Link>
      <div className="mt-8 flex items-baseline justify-between gap-4">
        <p className="m-0 shrink-0 text-sm font-medium uppercase tracking-wide text-[#c3d2e8]">
          {post.category}
        </p>
        <ReadSeriesLabel
          series={post.series}
          part={post.part}
          size="lg"
          className="m-0 text-right text-accent-link"
        />
      </div>
      <div
        className="mt-2 flex flex-wrap items-start justify-between gap-3"
      >
        <h1 className="home-v2-display text-4xl font-[350] tracking-tight text-[var(--hv2-hero-fg)] sm:text-5xl">
          {post.title}
        </h1>
        {post.audioUrl ? (
          <ReadNarrationButton src={post.audioUrl} title={post.title} />
        ) : null}
      </div>
      {post.subheader ? (
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-[var(--hv2-hero-muted)] sm:text-lg">
          {post.subheader}
        </p>
      ) : null}
      <ReadPostTags tags={post.tags} />
      <p className="mt-3 text-xs text-[var(--hv2-hero-nav-muted)]">
        {formatBlogDate(post.publishedAt || post.updatedAt)}
      </p>
      <div
        id="read-article-body"
        className="mt-6 w-full max-w-[680px] text-[var(--hv2-hero-fg)]"
      >
        {post.hasBody ? (
          <ReadBody source={post.body} />
        ) : (
          <p className="text-base italic leading-relaxed text-[var(--hv2-hero-muted)] sm:text-lg">
            Coming soon...
          </p>
        )}
      </div>
    </article>
  );
}

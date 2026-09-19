import Link from "next/link";
import { notFound } from "next/navigation";
import { ReadBody } from "@/components/blog-markdown";
import { ReadingProgress } from "@/components/reading-progress";
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
    description: post.excerpt || post.subheader || undefined,
  };
}

export default async function ReadPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await fetchPublishedBlogPost(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <ReadingProgress containerId="read-article-body" />
      <Link
        href="/read"
        className="text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        ← Read
      </Link>
      <div className="mt-8">
        <ReadSeriesLabel series={post.series} part={post.part} />
        <p className={`${post.series || post.part != null ? "mt-2" : ""} text-xs text-muted`}>
          {formatBlogDate(post.publishedAt || post.updatedAt)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-display text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
          {post.title}
        </h1>
        {post.audioUrl ? <ReadNarrationButton src={post.audioUrl} /> : null}
      </div>
      {post.subheader ? (
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted sm:text-lg">
          {post.subheader}
        </p>
      ) : null}
      {post.excerpt ? (
        <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-muted sm:text-base">
          {post.excerpt}
        </p>
      ) : null}
      <ReadPostTags tags={post.tags} />
      <div id="read-article-body" className="mt-6">
        {post.hasBody ? (
          <ReadBody source={post.body} />
        ) : (
          <p className="text-base italic leading-relaxed text-muted sm:text-lg">
            Coming soon...
          </p>
        )}
      </div>
    </article>
  );
}

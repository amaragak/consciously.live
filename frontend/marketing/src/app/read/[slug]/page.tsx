import Link from "next/link";
import { notFound } from "next/navigation";
import { ReadBody } from "@/components/blog-markdown";
import { ReadingProgress } from "@/components/reading-progress";
import { ReadPostTags } from "@/components/read-post-tags";
import {
  fetchPublishedBlogPost,
  fetchPublishedBlogPosts,
  formatBlogDate,
} from "@/lib/public-blog";

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
      <p className="mt-8 text-xs text-muted">
        {formatBlogDate(post.publishedAt || post.updatedAt)}
      </p>
      <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-foreground sm:text-5xl">
        {post.title}
      </h1>
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
        <ReadBody source={post.body} />
      </div>
    </article>
  );
}

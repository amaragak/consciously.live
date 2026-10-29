import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReadBody } from "@/components/blog-markdown";
import { ListenBriefBand } from "@/components/listen/listen-brief-band";
import { ReadListenEmbed } from "@/components/read-listen-embed";
import {
  fetchPublishedBlogPost,
  fetchPublishedBlogPosts,
  formatBlogMetaLine,
  pickReadNext,
  type PublicBlogPostSummary,
} from "@/lib/public-blog";
import { fetchListenBySlug } from "@/lib/public-listen";

/** Cached until admin purge (`POST /api/revalidate-blog`). Dev uses `no-store` in `public-blog`. */
export const revalidate = false;

const FOUNDER_PHOTO = "/new-home/founder-alex.jpg";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const posts = await fetchPublishedBlogPosts();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchPublishedBlogPost(slug);
  if (!post) return { title: "Post" };
  const description = post.subheader || undefined;
  return {
    title: post.title,
    description,
    openGraph: {
      title: post.title,
      description,
      type: "article",
      url: `https://consciously.live/read/${encodeURIComponent(post.slug)}`,
      ...(post.coverImageUrl
        ? { images: [{ url: post.coverImageUrl, width: 1200, height: 675 }] }
        : {}),
    },
    twitter: {
      card: post.coverImageUrl ? "summary_large_image" : "summary",
      title: post.title,
      description,
      ...(post.coverImageUrl ? { images: [post.coverImageUrl] } : {}),
    },
  };
}

function CoverFallback({ title }: { title: string }) {
  return (
    <div
      className="flex aspect-[16/9] w-full items-end rounded-2xl bg-[color-mix(in_srgb,var(--hv2-sticky-bg)_12%,#E8DFD0)] p-5"
      aria-hidden
    >
      <span className="line-clamp-2 font-display text-[1.125rem] leading-snug text-[var(--hv2-ink)]/70">
        {title}
      </span>
    </div>
  );
}

function ReadNextCard({ post }: { post: PublicBlogPostSummary }) {
  return (
    <Link
      href={`/read/${encodeURIComponent(post.slug)}`}
      className="group block min-w-0"
    >
      <div className="overflow-hidden rounded-xl">
        {post.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <CoverFallback title={post.title} />
        )}
      </div>
      <h3 className="home-v2-display mt-3 m-0 text-[1.0625rem] font-normal leading-snug tracking-[-0.2px] text-[var(--hv2-ink)] transition-colors group-hover:text-[var(--hv2-tan-text)]">
        {post.title}
      </h3>
      <p className="m-0 mt-1.5 text-[13px] text-[var(--hv2-body)]/80">
        {formatBlogMetaLine(post, { includeCategory: true })}
      </p>
    </Link>
  );
}

export default async function ReadPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await fetchPublishedBlogPost(slug);
  if (!post) notFound();

  const all = await fetchPublishedBlogPosts();
  const readNext = pickReadNext(post, all, 3);

  let listenItem = null;
  if (post.listenSlug) {
    const result = await fetchListenBySlug(post.listenSlug);
    if (result.status === "ok") listenItem = result.item;
  }

  const meta = formatBlogMetaLine(post, {
    includeCategory: false,
    includeSeries: true,
  });

  return (
    <div className="home-v2 min-h-full bg-[var(--hv2-page)] text-[var(--hv2-ink)]">
      <article className="px-5 pb-4 pt-10 md:px-6 md:pt-14">
        <div className="mx-auto w-full max-w-[1100px]">
          {/* Reading column ~slightly under cover (900) so edges nearly align. */}
          <div className="mx-auto w-full max-w-[860px]">
            <Link
              href="/read"
              className="inline-flex items-center gap-1 text-[14.5px] font-medium text-[var(--hv2-body)] transition-colors hover:text-[var(--hv2-tan-text)]"
            >
              <span aria-hidden>‹</span> All essays
            </Link>
            <h1 className="home-v2-display m-0 mt-6 text-[2rem] font-normal leading-[1.15] tracking-[-0.6px] text-[var(--hv2-ink)] md:text-[2.75rem]">
              {post.title}
            </h1>
            {post.subheader ? (
              <p className="m-0 mt-3 text-[17px] leading-relaxed text-[var(--hv2-body)] md:text-[18.5px]">
                {post.subheader}
              </p>
            ) : null}
            <div className="mt-5 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={FOUNDER_PHOTO}
                alt=""
                width={40}
                height={40}
                className="size-10 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="m-0 text-[14.5px] font-semibold text-[var(--hv2-ink)]">
                  Alex Maragakis
                </p>
                <p className="m-0 text-[13px] text-[var(--hv2-body)]/80">
                  {meta}
                </p>
              </div>
            </div>
          </div>

          {post.coverImageUrl ? (
            <div className="mx-auto mt-8 w-full max-w-[900px] overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.coverImageUrl}
                alt=""
                className="aspect-[16/9] w-full object-cover"
              />
            </div>
          ) : null}

          <div
            id="read-article-body"
            className="mx-auto mt-8 w-full max-w-[860px] text-[var(--hv2-ink)] [&_.read-prose_p]:text-[18.5px] [&_.read-prose_p]:leading-[1.7] [&_.read-prose_a]:text-[var(--hv2-tan-text)] [&_.read-prose_a]:underline [&_.read-prose_a]:underline-offset-2"
          >
            <ReadBody source={post.body} />
          </div>

          {listenItem ? (
            <div className="mx-auto mt-12 w-full max-w-[860px]">
              <ReadListenEmbed
                item={listenItem}
                cardLabel={post.listenCardLabel}
              />
            </div>
          ) : null}
        </div>
      </article>

      <ListenBriefBand
        headline="Make a meditation from your own words."
        body="A few words about what you need is enough. Consciously writes a guided meditation for you."
      />

      {readNext.length > 0 ? (
        <section className="px-5 py-14 md:px-6 md:py-16">
          <div className="mx-auto w-full max-w-[1100px]">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="home-v2-display m-0 text-[1.5rem] font-normal tracking-[-0.3px] md:text-[1.75rem]">
                Read next
              </h2>
              <Link
                href="/read"
                className="text-[14.5px] font-medium text-[var(--hv2-tan-text)] transition-colors hover:text-[var(--hv2-ink)]"
              >
                All essays ›
              </Link>
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {readNext.map((p) => (
                <ReadNextCard key={p.id} post={p} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

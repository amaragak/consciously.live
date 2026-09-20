import Link from "next/link";
import { ReadNarrationButton } from "@/components/read-narration-button";
import { ReadPostTags } from "@/components/read-post-tags";
import { ReadSeriesLabel } from "@/components/read-series-label";
import {
  formatBlogDate,
  type PublicBlogPostSummary,
} from "@/lib/public-blog";

export function ReadPostCard({ post }: { post: PublicBlogPostSummary }) {
  const blurb = post.excerpt || post.subheader;

  return (
    <article
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-1 hover:border-accent/40 hover:bg-accent-soft/25 hover:shadow-[0_14px_36px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/20 dark:hover:shadow-[0_14px_36px_rgba(0,0,0,0.45)] sm:p-6"
    >
      <Link
        href={`/read/${encodeURIComponent(post.slug)}`}
        className="absolute inset-0 z-0 rounded-2xl"
        aria-label={post.title}
      />
      <div className="relative z-[1] flex h-full flex-col pointer-events-none">
        <div className="flex items-start justify-between gap-3">
          <ReadSeriesLabel series={post.series} part={post.part} />
          {post.audioUrl ? (
            <span className="pointer-events-auto shrink-0">
              <ReadNarrationButton src={post.audioUrl} title={post.title} />
            </span>
          ) : null}
        </div>
        <h2
          className="mt-2 font-display text-xl font-medium tracking-tight text-foreground transition-colors duration-200 group-hover:text-accent-link sm:text-2xl"
        >
          {post.title}
        </h2>
        {blurb ? (
          <p
            className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-muted"
          >
            {blurb}
          </p>
        ) : null}
        <ReadPostTags tags={post.tags} className="mt-3" />
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <p className="text-xs text-muted">
            {formatBlogDate(post.publishedAt || post.updatedAt)}
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-accent-link">
            {post.hasBody ? "Continue" : "Coming soon"}
            <span
              aria-hidden
              className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
            >
              →
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

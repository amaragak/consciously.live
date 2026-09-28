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
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[color:var(--hv2-field-card-border)] bg-[color:var(--hv2-field-card-bg)] p-5 shadow-[var(--hv2-field-card-shadow)] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-1 hover:border-accent/40 hover:bg-[color:var(--hv2-field-card-hover)] hover:shadow-[var(--hv2-field-card-hover-shadow)] focus-within:border-accent/40 focus-within:ring-2 focus-within:ring-accent/20 sm:p-6"
    >
      <Link
        href={`/read/${encodeURIComponent(post.slug)}`}
        className="absolute inset-0 z-0 rounded-2xl"
        aria-label={post.title}
      />
      <div className="relative z-[1] flex h-full flex-col pointer-events-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--hv2-field-card-label)]">
              {post.category}
            </p>
            <ReadSeriesLabel
              series={post.series}
              part={post.part}
              className="mt-1 text-[color:var(--hv2-field-card-muted)]"
            />
          </div>
          {post.audioUrl ? (
            <span className="pointer-events-auto shrink-0">
              <ReadNarrationButton src={post.audioUrl} title={post.title} />
            </span>
          ) : null}
        </div>
        <h2
          className="mt-2 font-display text-xl font-medium tracking-tight text-[color:var(--hv2-field-card-fg)] transition-colors duration-200 group-hover:text-[color:var(--hv2-field-card-link)] sm:text-2xl"
        >
          {post.title}
        </h2>
        {blurb ? (
          <p
            className="mt-2 line-clamp-3 text-[15px] leading-relaxed text-[color:var(--hv2-field-card-muted)]"
          >
            {blurb}
          </p>
        ) : null}
        <ReadPostTags tags={post.tags} className="mt-3" />
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <p className="text-xs text-[color:var(--hv2-field-card-muted)]">
            {formatBlogDate(post.publishedAt || post.updatedAt)}
          </p>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--hv2-field-card-link)]">
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

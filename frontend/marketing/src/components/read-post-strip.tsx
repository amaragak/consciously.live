import Link from "next/link";
import type { PublicBlogPostSummary } from "@/lib/public-blog";

/** Compact horizontal row for Pinned / My picks — not a card. */
export function ReadPostStrip({ post }: { post: PublicBlogPostSummary }) {
  const blurb = (post.excerpt || post.subheader).trim();

  return (
    <Link
      href={`/read/${encodeURIComponent(post.slug)}`}
      className="group flex min-h-[3.25rem] items-center gap-4 rounded-xl border border-[color:var(--hv2-field-card-border)] bg-[color:var(--hv2-field-card-bg)] px-4 py-2.5 transition-[border-color,background-color] duration-200 hover:border-accent/40 hover:bg-[color:var(--hv2-field-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 sm:min-h-[3.5rem] sm:gap-5 sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="font-display text-[1.05rem] font-medium tracking-tight text-[color:var(--hv2-field-card-fg)] transition-colors group-hover:text-[color:var(--hv2-field-card-link)] sm:text-lg">
            {post.title}
          </h3>
          <span className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--hv2-field-card-label)]">
            {post.category}
          </span>
        </div>
        {blurb ? (
          <p className="mt-0.5 line-clamp-1 text-[13px] leading-snug text-[color:var(--hv2-field-card-muted)]">
            {blurb}
          </p>
        ) : null}
      </div>
      <span className="shrink-0 text-sm font-medium text-[color:var(--hv2-field-card-link)]">
        {post.hasBody ? "Continue" : "Soon"}
        <span
          aria-hidden
          className="ml-1 inline-block transition-transform duration-200 group-hover:translate-x-0.5"
        >
          →
        </span>
      </span>
    </Link>
  );
}

export function ReadPostStripSection({
  title,
  posts,
}: {
  title: string;
  posts: PublicBlogPostSummary[];
}) {
  if (posts.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-display text-sm font-medium uppercase tracking-[0.14em] text-[color:var(--header-gold,var(--hv2-field-card-label))]">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {posts.map((post) => (
          <li key={post.id}>
            <ReadPostStrip post={post} />
          </li>
        ))}
      </ul>
    </section>
  );
}

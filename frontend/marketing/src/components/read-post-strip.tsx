import Link from "next/link";
import type { PublicBlogPostSummary } from "@/lib/public-blog";

/** Compact horizontal row for the Read index list. */
export function ReadPostStrip({
  post,
  showAlexPick = false,
}: {
  post: PublicBlogPostSummary;
  showAlexPick?: boolean;
}) {
  const blurb = post.subheader.trim();

  return (
    <Link
      href={`/read/${encodeURIComponent(post.slug)}`}
      className="group flex min-h-[3.75rem] items-center gap-4 rounded-xl border border-[color:var(--hv2-field-card-border)] bg-[color:var(--hv2-field-card-bg)] px-4 py-3 transition-[border-color,background-color] duration-200 hover:border-accent/40 hover:bg-[color:var(--hv2-field-card-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 sm:min-h-[4.25rem] sm:gap-5 sm:px-5 sm:py-3.5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h3 className="font-display text-lg font-medium tracking-tight text-[color:var(--hv2-field-card-fg)] transition-colors group-hover:text-[color:var(--hv2-field-card-link)] sm:text-xl">
            {post.title}
          </h3>
          <span className="text-[13px] font-medium uppercase tracking-wide text-[color:var(--hv2-field-card-label)]">
            {post.category}
          </span>
        </div>
        {blurb ? (
          <p className="mt-1 line-clamp-1 text-[15px] leading-snug text-[color:var(--hv2-field-card-muted)] sm:text-base">
            {blurb}
          </p>
        ) : null}
      </div>
      {showAlexPick ? (
        <span className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--hv2-gold)_45%,transparent)] bg-[color-mix(in_srgb,var(--hv2-gold)_14%,transparent)] px-2.5 py-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hv2-gold)]">
          Alex&apos;s Pick
        </span>
      ) : null}
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
      <h2 className="mb-3 font-display text-base font-medium uppercase tracking-[0.14em] text-[color:var(--header-gold,var(--hv2-field-card-label))]">
        {title}
      </h2>
      <ul className="flex flex-col gap-2">
        {posts.map((post) => (
          <li key={post.id}>
            <ReadPostStrip
              post={post}
              showAlexPick={post.pinned || post.topPicks}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

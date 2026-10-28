"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BLOG_PUBLIC_CATEGORIES,
  type BlogPublicCategory,
} from "@/lib/blog-categories";
import {
  formatBlogMetaLine,
  type PublicBlogPostSummary,
} from "@/lib/public-blog";

type CategoryFilter = "All" | BlogPublicCategory;

function parseCategory(raw: string | null): CategoryFilter {
  if (
    raw &&
    (BLOG_PUBLIC_CATEGORIES as readonly string[]).includes(raw)
  ) {
    return raw as BlogPublicCategory;
  }
  return "All";
}

function compareNewest(
  a: PublicBlogPostSummary,
  b: PublicBlogPostSummary,
): number {
  const aT = a.publishedAt || a.updatedAt || "";
  const bT = b.publishedAt || b.updatedAt || "";
  return bT.localeCompare(aT);
}

function CoverFallback({ title }: { title: string }) {
  return (
    <div
      className="flex aspect-[16/9] w-full items-end bg-[color-mix(in_srgb,var(--hv2-sticky-bg)_12%,#E8DFD0)] p-3"
      aria-hidden
    >
      <span className="line-clamp-2 font-display text-[13px] leading-snug text-[var(--hv2-ink)]/70">
        {title}
      </span>
    </div>
  );
}

export function ReadPostIndex({ posts }: { posts: PublicBlogPostSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category = parseCategory(searchParams.get("category"));

  const startHere = useMemo(() => {
    // Start here = pinned + Our picks (topPicks) + explicit startHere; pinned first.
    const eligible = posts.filter(
      (p) => p.startHere || p.pinned || p.topPicks,
    );
    return eligible
      .slice()
      .sort((a, b) => {
        const band = (p: PublicBlogPostSummary) => (p.pinned ? 0 : 1);
        const d = band(a) - band(b);
        if (d !== 0) return d;
        return compareNewest(a, b);
      })
      .slice(0, 3);
  }, [posts]);

  const filtered = useMemo(() => {
    return posts
      .filter((p) => {
        if (category === "All") return true;
        return p.category === category;
      })
      .slice()
      .sort(compareNewest);
  }, [posts, category]);

  function setCategory(next: CategoryFilter) {
    const q = new URLSearchParams(searchParams.toString());
    if (next === "All") q.delete("category");
    else q.set("category", next);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="px-5 pb-4 pt-8 md:px-6 md:pt-10">
      <div className="mx-auto w-full max-w-[1100px]">
        {startHere.length > 0 ? (
          <section className="mb-12">
            <h2 className="home-v2-display m-0 text-[1.5rem] font-normal tracking-[-0.3px] md:text-[1.75rem]">
              Start here
            </h2>
            <div className="-mx-5 mt-5 flex gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
              {startHere.map((post) => (
                <Link
                  key={post.id}
                  href={`/read/${encodeURIComponent(post.slug)}`}
                  className="group w-[min(78vw,280px)] shrink-0 md:w-auto"
                >
                  <div className="overflow-hidden rounded-xl">
                    {post.coverImageUrl ? (
                      <img
                        src={post.coverImageUrl}
                        alt=""
                        className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <CoverFallback title={post.title} />
                    )}
                  </div>
                  <h3 className="home-v2-display mt-3 m-0 text-[1.125rem] font-normal leading-snug tracking-[-0.2px] text-[var(--hv2-ink)] transition-colors group-hover:text-[var(--hv2-tan-text)] md:text-[1.25rem]">
                    {post.title}
                  </h3>
                  {post.subheader ? (
                    <p className="m-0 mt-1 line-clamp-2 text-[14.5px] leading-snug text-[var(--hv2-body)]">
                      {post.subheader}
                    </p>
                  ) : null}
                  <p className="m-0 mt-2 text-[13px] text-[var(--hv2-body)]/80">
                    {formatBlogMetaLine(post, { includeCategory: true })}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <h2 className="home-v2-display m-0 text-[1.5rem] font-normal tracking-[-0.3px] md:text-[1.75rem]">
              All essays
            </h2>
            {/* Search field commented out for now per Read pack.
            <label>…</label>
            */}
            <div
              role="group"
              aria-label="Category"
              className="-mx-5 flex max-w-full gap-2 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0 md:pb-0"
            >
              {(["All", ...BLOG_PUBLIC_CATEGORIES] as const).map((c) => {
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCategory(c)}
                    className={`inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full px-[16px] text-[13.5px] transition-colors ${
                      active
                        ? "bg-[var(--hv2-sticky-bg)] font-semibold text-[var(--hv2-ivory)]"
                        : "border border-[rgba(62,52,66,.12)] bg-[#FFFBF3] text-[var(--hv2-body)] hover:border-[rgba(62,52,66,.24)]"
                    }`}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="mt-8 text-[15px] text-[var(--hv2-body)]">
              {posts.length === 0
                ? "No posts yet — check back soon."
                : "No essays in that category yet."}
            </p>
          ) : (
            <ul className="mt-6 overflow-hidden rounded-2xl border border-[rgba(62,52,66,.1)] bg-[#FFFBF3]">
              {filtered.map((post, i) => (
                <li key={post.id}>
                  <Link
                    href={`/read/${encodeURIComponent(post.slug)}`}
                    className={`group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[rgba(62,52,66,.04)] md:px-6 md:py-5 ${
                      i > 0 ? "border-t border-[rgba(62,52,66,.1)]" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="home-v2-display m-0 text-[1.125rem] font-normal leading-snug tracking-[-0.2px] text-[var(--hv2-ink)] transition-colors group-hover:text-[var(--hv2-tan-text)] md:text-[1.25rem]">
                        {post.title}
                      </h3>
                      {post.subheader ? (
                        <p className="m-0 mt-1 line-clamp-2 text-[14.5px] leading-snug text-[var(--hv2-body)] md:line-clamp-1">
                          {post.subheader}
                        </p>
                      ) : null}
                      <p className="m-0 mt-2 text-[13px] text-[var(--hv2-body)]/80">
                        <span className="md:hidden">
                          {formatBlogMetaLine(post, {
                            includeCategory: false,
                          })}
                        </span>
                        <span className="hidden md:inline">
                          {formatBlogMetaLine(post, {
                            includeCategory: true,
                          })}
                        </span>
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className="shrink-0 text-[var(--hv2-body)]/50 transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--hv2-tan-text)]"
                    >
                      ›
                    </span>
                    {/* Alex's pick badge — replaced by Start here section.
                    {post.pinned || post.topPicks ? (
                      <span>Alex&apos;s Pick</span>
                    ) : null}
                    */}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

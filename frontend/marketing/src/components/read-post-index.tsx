"use client";

import { useMemo, useState } from "react";
import { ReadPostCard } from "@/components/read-post-card";
import {
  BLOG_CATEGORIES,
  type BlogCategory,
} from "@/lib/blog-categories";
import type { PublicBlogPostSummary } from "@/lib/public-blog";

type CategoryFilter = "All" | BlogCategory;

function matchesQuery(post: PublicBlogPostSummary, q: string): boolean {
  if (!q) return true;
  const hay = `${post.title} ${post.tags.join(" ")}`.toLowerCase();
  return hay.includes(q);
}

/** Content first, then most recently updated — mirrors backend sort. */
function comparePosts(
  a: PublicBlogPostSummary,
  b: PublicBlogPostSummary,
): number {
  const aHas = a.hasBody ? 0 : 1;
  const bHas = b.hasBody ? 0 : 1;
  if (aHas !== bHas) return aHas - bHas;
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
}

export function ReadPostIndex({ posts }: { posts: PublicBlogPostSummary[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter((p) => {
        if (category !== "All" && p.category !== category) return false;
        return matchesQuery(p, q);
      })
      .slice()
      .sort(comparePosts);
  }, [posts, query, category]);

  return (
    <div className="mt-10">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <label className="relative min-w-[min(100%,14rem)] flex-1 basis-[14rem]">
          <span className="sr-only">Search posts</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title or tags…"
            className="h-11 w-full rounded-[12px] border border-[color:var(--hv2-field-card-border)] bg-[color:var(--hv2-field-card-bg)] px-3.5 text-[15px] text-[color:var(--hv2-field-card-fg)] outline-none placeholder:text-[color:var(--hv2-field-card-muted)] focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
          />
        </label>
        <div
          role="group"
          aria-label="Category"
          className="flex max-w-full flex-wrap items-center gap-1.5"
        >
          {(["All", ...BLOG_CATEGORIES] as const).map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c)}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[color:var(--hv2-field-card-link)] text-[color:var(--hv2-on-gold,#1a2330)]"
                    : "border border-[color:var(--hv2-field-card-border)] bg-[color:var(--hv2-field-card-bg)] text-[color:var(--hv2-field-card-muted)] hover:border-accent/40 hover:text-[color:var(--hv2-field-card-fg)]"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 text-sm text-[color:var(--hv2-field-card-muted)]">
          {posts.length === 0
            ? "No posts yet — check back soon."
            : "No posts match that search."}
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
          {filtered.map((post) => (
            <li key={post.id}>
              <ReadPostCard post={post} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

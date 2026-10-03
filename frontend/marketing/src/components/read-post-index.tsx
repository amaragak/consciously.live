"use client";

import { useMemo, useState } from "react";
import { ReadPostStrip } from "@/components/read-post-strip";
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

function matchesFilters(
  post: PublicBlogPostSummary,
  category: CategoryFilter,
  q: string,
): boolean {
  if (category !== "All" && post.category !== category) return false;
  return matchesQuery(post, q);
}

/** Most recently updated first (index already excludes empty bodies). */
function comparePosts(
  a: PublicBlogPostSummary,
  b: PublicBlogPostSummary,
): number {
  return (b.updatedAt || "").localeCompare(a.updatedAt || "");
}

/**
 * Unified list order: pinned → My picks (topPicks, not pinned) → the rest.
 * Within each band, most recently updated first.
 */
function compareListOrder(
  a: PublicBlogPostSummary,
  b: PublicBlogPostSummary,
): number {
  const band = (p: PublicBlogPostSummary) =>
    p.pinned ? 0 : p.topPicks ? 1 : 2;
  const d = band(a) - band(b);
  if (d !== 0) return d;
  return comparePosts(a, b);
}

export function ReadPostIndex({ posts }: { posts: PublicBlogPostSummary[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts
      .filter((p) => matchesFilters(p, category, q))
      .slice()
      .sort(compareListOrder);
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
            className="h-12 w-full rounded-[12px] border border-[color:var(--hv2-field-card-border)] bg-[color:var(--hv2-field-card-bg)] px-4 text-base text-[color:var(--hv2-field-card-fg)] outline-none placeholder:text-[color:var(--hv2-field-card-muted)] focus:border-accent/50 focus:ring-2 focus:ring-accent/20 sm:text-[17px]"
          />
        </label>
        <div
          role="group"
          aria-label="Category"
          className="flex max-w-full flex-wrap items-center gap-2"
        >
          {(["All", ...BLOG_CATEGORIES] as const).map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(c)}
                className={`cursor-pointer rounded-full px-4 py-2 text-[15px] font-medium transition-colors ${
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
        <p className="mt-10 text-base text-[color:var(--hv2-field-card-muted)] sm:text-[17px]">
          {posts.length === 0
            ? "No posts yet — check back soon."
            : "No posts match that search."}
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {filtered.map((post) => (
            <li key={post.id}>
              <ReadPostStrip
                post={post}
                showAlexPick={post.pinned || post.topPicks}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

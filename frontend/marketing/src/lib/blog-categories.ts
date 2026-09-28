/** Fixed Read categories — keep in sync with backend `_shared/blog.ts`. */

export const BLOG_CATEGORIES = [
  "Philosophy & Spirituality",
  "Meditation & Psychedelics",
  "Travel & Pilgrimage",
  "Other",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const DEFAULT_BLOG_CATEGORY: BlogCategory = "Other";

/** Legacy labels still stored on older posts. */
const BLOG_CATEGORY_ALIASES: Record<string, BlogCategory> = {
  Backpacking: "Travel & Pilgrimage",
  Philosophy: "Philosophy & Spirituality",
};

export function normalizeBlogCategory(raw: unknown): BlogCategory {
  if (typeof raw !== "string") return DEFAULT_BLOG_CATEGORY;
  const t = raw.trim();
  if ((BLOG_CATEGORIES as readonly string[]).includes(t)) {
    return t as BlogCategory;
  }
  return BLOG_CATEGORY_ALIASES[t] ?? DEFAULT_BLOG_CATEGORY;
}

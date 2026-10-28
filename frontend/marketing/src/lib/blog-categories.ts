/** Fixed Read categories — keep in sync with backend `_shared/blog.ts`. */

export const BLOG_CATEGORIES = [
  "Philosophy & Spirituality",
  "Meditation & Psychedelics",
  "Travel & Pilgrimage",
  /** @deprecated Kept for stored posts; not shown on public chips. */
  "Other",
] as const;

/** Categories shown on the public /read filter. */
export const BLOG_PUBLIC_CATEGORIES = [
  "Philosophy & Spirituality",
  "Meditation & Psychedelics",
  "Travel & Pilgrimage",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
export type BlogPublicCategory = (typeof BLOG_PUBLIC_CATEGORIES)[number];

export const DEFAULT_BLOG_CATEGORY: BlogCategory = "Philosophy & Spirituality";

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

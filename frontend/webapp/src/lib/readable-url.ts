/**
 * Readable browser URLs for personal content. Stable IDs stay in storage;
 * these helpers only shape the address bar.
 */

const SLUG_MAX = 60;

/** Lowercase hyphenated slug; cut ~60 chars on a word boundary. */
export function slugifyLabel(raw: string, max = SLUG_MAX): string {
  const base = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!base) return "";
  if (base.length <= max) return base;
  const cut = base.slice(0, max);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen >= 12 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, "");
}

/** 8-char lowercase alphanumeric id for untitled items (generated once). */
export function newUntitledSlugId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  return out;
}

export function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

/** YYYY-MM-DD from ISO or date-only string. */
export function dateKeyFromIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = Date.parse(t);
  if (!Number.isFinite(d)) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Journal entry path segment: `2026-10-29-morning-pages` or `2026-10-29`.
 * `urlSlug` is persisted when first assigned so renames can redirect.
 */
export function journalEntryPathSlug(entry: {
  entryDate?: string;
  createdAt?: string;
  title?: string;
  urlSlug?: string | null;
}): string {
  if (entry.urlSlug?.trim()) return entry.urlSlug.trim();
  const date =
    dateKeyFromIso(entry.entryDate) ||
    dateKeyFromIso(entry.createdAt) ||
    new Date().toISOString().slice(0, 10);
  const titleSlug = slugifyLabel(entry.title?.trim() || "");
  return titleSlug ? `${date}-${titleSlug}` : date;
}

export function gratitudeEntryPathSlug(entry: {
  entryDate?: string;
  createdAt?: string;
  urlSlug?: string | null;
}): string {
  if (entry.urlSlug?.trim()) return entry.urlSlug.trim();
  return (
    dateKeyFromIso(entry.entryDate) ||
    dateKeyFromIso(entry.createdAt) ||
    new Date().toISOString().slice(0, 10)
  );
}

/** Unique slug among siblings; adds -2, -3 on clash. */
export function uniquifySlug(
  base: string,
  taken: Set<string>,
  self?: string | null,
): string {
  const b = base || "item";
  if ((!taken.has(b) || self === b) && b) return b;
  for (let i = 2; i < 200; i += 1) {
    const candidate = `${b}-${i}`;
    if (!taken.has(candidate) || self === candidate) return candidate;
  }
  return `${b}-${newUntitledSlugId()}`;
}

export function contentTitleSlug(
  title: string | null | undefined,
  existing?: string | null,
): string {
  if (existing?.trim()) return existing.trim();
  const s = slugifyLabel(title?.trim() || "");
  return s || newUntitledSlugId();
}

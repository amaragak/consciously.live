/**
 * Insights v8 — source refs + quote verification (keep in sync with backend).
 */

export type InsightSourceRef = {
  entryId: string;
  quote?: string;
};

/** Normalize for fuzzy quote matching (whitespace, case, quotes, light punct). */
export function normalizeForQuoteMatch(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B\u201C\u201D\u201E\u201F'"]/g, "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\S\n]+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function findQuoteInEntry(
  entryText: string,
  quote: string,
): string | null {
  const q = quote.trim();
  if (!q || q.split(/\s+/).length > 30) return null;
  const normEntry = normalizeForQuoteMatch(entryText);
  const normQuote = normalizeForQuoteMatch(q);
  if (!normQuote || !normEntry.includes(normQuote)) return null;

  const escaped = q
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+")
    .replace(/['\u2018\u2019]/g, "['‘’]")
    .replace(/["\u201C\u201D]/g, '["“”]');
  try {
    const re = new RegExp(escaped, "i");
    const m = entryText.match(re);
    if (m?.[0]) return m[0].replace(/\s+/g, " ").trim();
  } catch {
    /* fall through */
  }
  return q.replace(/\s+/g, " ").trim();
}

/** Highlight snippet with quote marked; a few words of context either side. */
export function quoteWithContext(
  entryText: string,
  quote: string,
  contextWords = 6,
): { before: string; match: string; after: string } | null {
  const matched = findQuoteInEntry(entryText, quote);
  if (!matched) return null;
  const idx = entryText.toLowerCase().indexOf(matched.toLowerCase());
  if (idx < 0) {
    return { before: "…", match: matched, after: "…" };
  }
  const beforeRaw = entryText.slice(0, idx);
  const afterRaw = entryText.slice(idx + matched.length);
  const beforeWords = beforeRaw.trim().split(/\s+/).filter(Boolean);
  const afterWords = afterRaw.trim().split(/\s+/).filter(Boolean);
  const before =
    (beforeWords.length > contextWords ? "…" : "") +
    beforeWords.slice(-contextWords).join(" ");
  const after =
    afterWords.slice(0, contextWords).join(" ") +
    (afterWords.length > contextWords ? "…" : "");
  return {
    before: before ? `${before} ` : "",
    match: matched,
    after: after ? ` ${after}` : "",
  };
}

export type LetterBodyPart = {
  text: string;
  sources?: InsightSourceRef[];
};

export function flattenLetterParts(parts: LetterBodyPart[]): string {
  return parts.map((p) => p.text).join("");
}

export function parseSourceRefList(raw: unknown): InsightSourceRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: InsightSourceRef[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const entryId =
      typeof (row as { entryId?: unknown }).entryId === "string"
        ? (row as { entryId: string }).entryId.trim()
        : typeof (row as { entry_id?: unknown }).entry_id === "string"
          ? (row as { entry_id: string }).entry_id.trim()
          : "";
    if (!entryId) continue;
    const quote =
      typeof (row as { quote?: unknown }).quote === "string"
        ? (row as { quote: string }).quote.trim()
        : "";
    out.push(quote ? { entryId, quote } : { entryId });
    if (out.length >= 5) break;
  }
  return out.length > 0 ? out : undefined;
}

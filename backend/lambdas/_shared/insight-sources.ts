/**
 * Insights v8 — source refs + quote verification (keep FE copy in sync).
 */

export type InsightSourceRef = {
  entryId: string;
  /** Verbatim passage from the entry (≤ ~25 words). Omitted if unverified. */
  quote?: string;
};

export type InsightSourceEntryText = {
  id: string;
  text: string;
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

/**
 * Find the original slice in `entryText` that matches `quote` under
 * normalizeForQuoteMatch. Returns null if not found.
 */
export function findQuoteInEntry(
  entryText: string,
  quote: string,
): string | null {
  const q = quote.trim();
  if (!q || q.split(/\s+/).length > 30) return null;
  const normEntry = normalizeForQuoteMatch(entryText);
  const normQuote = normalizeForQuoteMatch(q);
  if (!normQuote || !normEntry.includes(normQuote)) return null;

  // Map normalized match back roughly: search with flexible whitespace in original.
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
  // Fallback: return the provided quote trimmed (verified via normalize).
  return q.replace(/\s+/g, " ").trim();
}

export function verifyInsightSource(
  raw: unknown,
  entriesById: Map<string, string>,
): InsightSourceRef | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const entryId =
    typeof o.entryId === "string"
      ? o.entryId.trim()
      : typeof o.entry_id === "string"
        ? o.entry_id.trim()
        : "";
  if (!entryId || !entriesById.has(entryId)) return null;
  const entryText = entriesById.get(entryId) ?? "";
  const quoteRaw =
    typeof o.quote === "string"
      ? o.quote.trim()
      : typeof o.example === "string"
        ? o.example.trim()
        : "";
  if (!quoteRaw) return { entryId };
  const matched = findQuoteInEntry(entryText, quoteRaw);
  if (!matched) return { entryId };
  return { entryId, quote: matched };
}

export function verifyInsightSources(
  raw: unknown,
  entriesById: Map<string, string>,
  max = 3,
): InsightSourceRef[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: InsightSourceRef[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const ref = verifyInsightSource(row, entriesById);
    if (!ref) continue;
    const key = `${ref.entryId}::${ref.quote ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
    if (out.length >= max) break;
  }
  return out.length > 0 ? out : undefined;
}

/** Legacy entryIds / examples → verified sources. */
export function sourcesFromLegacy(params: {
  entryIds?: unknown;
  examples?: unknown;
  entriesById: Map<string, string>;
  max?: number;
}): InsightSourceRef[] | undefined {
  const max = params.max ?? 3;
  const fromSources = verifyInsightSources(
    // Prefer explicit sources if somehow passed
    undefined,
    params.entriesById,
    max,
  );
  if (fromSources) return fromSources;

  const ids: string[] = [];
  if (Array.isArray(params.entryIds)) {
    for (const id of params.entryIds) {
      if (typeof id === "string" && id.trim()) ids.push(id.trim());
    }
  }
  const examples: string[] = [];
  if (Array.isArray(params.examples)) {
    for (const ex of params.examples) {
      if (typeof ex === "string" && ex.trim()) examples.push(ex.trim());
    }
  }

  const out: InsightSourceRef[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(ids.length, examples.length) && out.length < max; i++) {
    const entryId = ids[i];
    const quote = examples[i];
    if (entryId && params.entriesById.has(entryId)) {
      if (quote) {
        const matched = findQuoteInEntry(
          params.entriesById.get(entryId) ?? "",
          quote,
        );
        const key = `${entryId}::${matched ?? ""}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push(matched ? { entryId, quote: matched } : { entryId });
        }
      } else if (!seen.has(entryId)) {
        seen.add(entryId);
        out.push({ entryId });
      }
    } else if (quote) {
      // Try to locate quote in any known entry
      for (const [id, text] of params.entriesById) {
        const matched = findQuoteInEntry(text, quote);
        if (matched) {
          const key = `${id}::${matched}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ entryId: id, quote: matched });
          }
          break;
        }
      }
    }
  }
  // Also attach remaining ids without quotes
  for (const entryId of ids) {
    if (out.length >= max) break;
    if (!params.entriesById.has(entryId)) continue;
    if (out.some((s) => s.entryId === entryId)) continue;
    out.push({ entryId });
  }
  return out.length > 0 ? out : undefined;
}

export type LetterBodyPart = {
  text: string;
  sources?: InsightSourceRef[];
};

export function flattenLetterParts(parts: LetterBodyPart[]): string {
  return parts.map((p) => p.text).join("");
}

export function verifyLetterBodyParts(
  raw: unknown,
  entriesById: Map<string, string>,
): LetterBodyPart[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: LetterBodyPart[] = [];
  let sourcedInSentence = 0;
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const text =
      typeof (row as { text?: unknown }).text === "string"
        ? (row as { text: string }).text
        : "";
    if (!text) continue;
    let sources = verifyInsightSources(
      (row as { sources?: unknown }).sources,
      entriesById,
      2,
    );
    // At most one sourced span per sentence — track by sentence terminators
    if (sources && sourcedInSentence >= 1) {
      sources = undefined;
    }
    if (sources) sourcedInSentence += 1;
    if (/[.!?]\s*$/.test(text) || text.includes(". ")) {
      sourcedInSentence = 0;
    }
    out.push({ text, ...(sources ? { sources } : {}) });
  }
  return out.length > 0 ? out : undefined;
}

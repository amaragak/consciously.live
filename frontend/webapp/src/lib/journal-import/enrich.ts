import { dateFromJournalText, parseIsoOrNull } from "@/lib/journal-import/dates";
import type { JournalImportDraft } from "@/lib/journal-import/types";
import { enrichJournalImportText } from "@/lib/medimade-api";

/**
 * Ask Haiku for an entry date + short title from body text.
 * File/mtime dates are never used — content only (model, then regex fallback).
 */
export async function applyHaikuDateAndTitle(
  draft: JournalImportDraft,
): Promise<JournalImportDraft> {
  const body = draft.body.trim();
  if (!body) {
    return {
      ...draft,
      created_at: null,
      date_uncertain: true,
      source_metadata: {
        ...draft.source_metadata,
        date_source: "none",
      },
    };
  }

  let modelDate: string | null = null;
  let modelTitle: string | null = null;
  try {
    const enrich = await enrichJournalImportText(body);
    modelDate = enrich.date
      ? parseIsoOrNull(`${enrich.date}T12:00:00Z`)
      : null;
    modelTitle = enrich.title?.trim() || null;
  } catch {
    /* fall through to regex */
  }

  const fromParsed = dateFromJournalText(body);
  const created_at = modelDate ?? fromParsed;
  const title =
    modelTitle ||
    (typeof draft.title === "string" && draft.title.trim()
      ? draft.title.trim()
      : null);

  return {
    ...draft,
    title,
    created_at,
    date_uncertain: !created_at,
    source_metadata: {
      ...draft.source_metadata,
      ...(created_at
        ? {
            date_source: modelDate
              ? "haiku"
              : fromParsed
                ? "content"
                : "none",
          }
        : { date_source: "none" }),
      ...(modelTitle ? { title_source: "haiku" } : {}),
    },
  };
}

export async function applyHaikuDateAndTitleAll(
  drafts: JournalImportDraft[],
): Promise<JournalImportDraft[]> {
  const out: JournalImportDraft[] = [];
  for (const d of drafts) {
    out.push(await applyHaikuDateAndTitle(d));
  }
  return out;
}

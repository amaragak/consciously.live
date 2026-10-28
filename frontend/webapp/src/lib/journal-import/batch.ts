/**
 * Process a mixed drop of journal files — detect format, parse, accumulate drafts.
 */

import {
  detectImportFile,
  refineDetectedLabel,
  type DetectedImportKind,
} from "@/lib/journal-import/detect";
import { parseDayOneImport } from "@/lib/journal-import/parsers/day-one";
import { parseHandwrittenPhotoImport } from "@/lib/journal-import/parsers/handwritten-photo";
import { parseMarkdownImport } from "@/lib/journal-import/parsers/markdown";
import { parsePdfPagesImport } from "@/lib/journal-import/parsers/pdf-pages";
import type { JournalImportDraft } from "@/lib/journal-import/types";

export type ImportFileStatus = "queued" | "reading" | "ready" | "error";

export type ImportFileCard = {
  id: string;
  file: File;
  kind: DetectedImportKind;
  label: string;
  status: ImportFileStatus;
  error: string | null;
  previewUrl: string | null;
  draftCount: number;
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `impf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeImportFileCard(file: File): ImportFileCard {
  const detected = detectImportFile(file);
  let previewUrl: string | null = null;
  if (detected.kind === "handwritten_photo") {
    try {
      previewUrl = URL.createObjectURL(file);
    } catch {
      previewUrl = null;
    }
  }
  return {
    id: newId(),
    file,
    kind: detected.kind,
    label: detected.label,
    status: detected.kind === "unsupported" ? "error" : "queued",
    error:
      detected.kind === "unsupported"
        ? "This file type isn’t supported yet."
        : null,
    previewUrl,
    draftCount: 0,
  };
}

export function revokeImportFileCard(card: ImportFileCard): void {
  if (card.previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(card.previewUrl);
  }
}

async function parseOne(
  card: ImportFileCard,
  onLabel: (label: string) => void,
): Promise<{ drafts: JournalImportDraft[]; label: string }> {
  const { file, kind } = card;
  if (kind === "unsupported") {
    throw new Error(card.error || "Unsupported file.");
  }
  if (kind === "handwritten_photo") {
    onLabel("Reading handwriting…");
    const drafts = await parseHandwrittenPhotoImport([{ files: [file] }]);
    return {
      drafts,
      label: refineDetectedLabel("handwritten_photo", {}),
    };
  }
  if (kind === "pdf") {
    const result = await parsePdfPagesImport(file, onLabel);
    return {
      drafts: result.drafts,
      label: refineDetectedLabel("pdf", { pdfMode: result.mode }),
    };
  }
  if (kind === "text") {
    onLabel("Reading text…");
    // .docx isn’t parsed yet — surface a clear error.
    if (/\.docx$/i.test(file.name)) {
      throw new Error("Word .docx isn’t supported yet — export as .txt or .md.");
    }
    const drafts = await parseMarkdownImport([file]);
    if (!drafts.length) throw new Error("No text found in that file.");
    return { drafts, label: refineDetectedLabel("text", {}) };
  }
  if (kind === "day_one") {
    onLabel("Reading Day One…");
    // Zip of .md/.txt (not Day One) — fall back to markdown parser.
    if (/\.zip$/i.test(file.name)) {
      try {
        const drafts = await parseDayOneImport([file]);
        return {
          drafts,
          label: refineDetectedLabel("day_one", { entryCount: drafts.length }),
        };
      } catch (dayOneErr) {
        try {
          const drafts = await parseMarkdownImport([file]);
          if (drafts.length) {
            return {
              drafts,
              label: `Text files · ${drafts.length} ${drafts.length === 1 ? "entry" : "entries"}`,
            };
          }
        } catch {
          /* */
        }
        throw dayOneErr;
      }
    }
    const drafts = await parseDayOneImport([file]);
    return {
      drafts,
      label: refineDetectedLabel("day_one", { entryCount: drafts.length }),
    };
  }
  if (kind === "csv") {
    throw new Error(
      "CSV imports still need column matching — use Entries ⋯ → Import in the classic flow, or export as text.",
    );
  }
  throw new Error("Unsupported file.");
}

export type BatchProgress = {
  cards: ImportFileCard[];
  drafts: JournalImportDraft[];
  readingIndex: number;
  readingTotal: number;
};

/**
 * Read queued cards one by one. Calls `onUpdate` after each file so Review can
 * open on what’s ready while the rest continue.
 */
export async function processImportBatch(
  cards: ImportFileCard[],
  onUpdate: (state: BatchProgress) => void,
  signal?: { cancelled: boolean },
): Promise<BatchProgress> {
  const next = cards.map((c) => ({ ...c }));
  const drafts: JournalImportDraft[] = [];
  const queue = next.filter((c) => c.status === "queued");
  const readingTotal = queue.length;

  for (let i = 0; i < queue.length; i++) {
    if (signal?.cancelled) break;
    const card = queue[i]!;
    const idx = next.findIndex((c) => c.id === card.id);
    if (idx < 0) continue;
    next[idx] = { ...next[idx]!, status: "reading", error: null };
    onUpdate({
      cards: next.map((c) => ({ ...c })),
      drafts: drafts.slice(),
      readingIndex: i + 1,
      readingTotal,
    });
    try {
      const result = await parseOne(next[idx]!, () => {
        /* progress label reserved for future per-file UI */
      });
      if (signal?.cancelled) break;
      drafts.push(...result.drafts);
      next[idx] = {
        ...next[idx]!,
        status: "ready",
        label: result.label,
        draftCount: result.drafts.length,
        error: null,
      };
    } catch (e) {
      next[idx] = {
        ...next[idx]!,
        status: "error",
        error: e instanceof Error ? e.message : "Couldn’t read that file.",
        draftCount: 0,
      };
    }
    onUpdate({
      cards: next.map((c) => ({ ...c })),
      drafts: drafts.slice(),
      readingIndex: i + 1,
      readingTotal,
    });
  }

  return {
    cards: next,
    drafts,
    readingIndex: readingTotal,
    readingTotal,
  };
}

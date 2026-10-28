/**
 * Typed vs scanned PDF import — page text when present, otherwise OCR page images.
 */

import { parseIsoOrNull } from "@/lib/journal-import/dates";
import { parseHandwrittenPhotoImport } from "@/lib/journal-import/parsers/handwritten-photo";
import type { JournalImportDraft } from "@/lib/journal-import/types";

export type PdfPagesParseResult = {
  drafts: JournalImportDraft[];
  mode: "typed" | "scanned";
};

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  return pdfjs;
}

function fileMtimeIso(file: File): string | null {
  if (!Number.isFinite(file.lastModified)) return null;
  return new Date(file.lastModified).toISOString();
}

async function pageTexts(
  file: File,
): Promise<{ texts: string[]; pageCount: number }> {
  const pdfjs = await loadPdfjs();
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const texts: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items ?? []) as Array<{ str?: string }>;
      const text = items
        .map((it) => (typeof it.str === "string" ? it.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      texts.push(text);
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }
  return { texts, pageCount: texts.length };
}

async function renderPdfPagesToFiles(file: File): Promise<File[]> {
  const pdfjs = await loadPdfjs();
  const buf = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const out: File[] = [];
  try {
    const max = Math.min(doc.numPages, 40);
    for (let p = 1; p <= max; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({
        canvasContext: ctx,
        viewport,
        canvas,
      } as Parameters<typeof page.render>[0]).promise;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.85),
      );
      if (!blob) continue;
      const base = file.name.replace(/\.pdf$/i, "") || "page";
      out.push(
        new File([blob], `${base}-p${p}.jpg`, {
          type: "image/jpeg",
          lastModified: file.lastModified,
        }),
      );
    }
  } finally {
    await doc.destroy().catch(() => undefined);
  }
  return out;
}

function typedDraftsFromPages(
  file: File,
  texts: string[],
): JournalImportDraft[] {
  const mtime = fileMtimeIso(file);
  const nonEmpty = texts
    .map((t, i) => ({ t: t.trim(), page: i + 1 }))
    .filter((x) => x.t.length > 0);
  if (!nonEmpty.length) return [];

  // One entry per page when pages look like separate notes; else one combined.
  const avg = nonEmpty.reduce((s, x) => s + x.t.length, 0) / nonEmpty.length;
  if (nonEmpty.length > 1 && avg < 1200) {
    return nonEmpty.map(({ t, page }) => {
      const first = t.split(/\n|(?<=[.?!])\s+/)[0]?.trim() ?? null;
      return {
        title: first && first.length < 80 ? first : `Page ${page}`,
        body: t,
        created_at: mtime,
        date_uncertain: true,
        source: "pdf_annotations" as const,
        source_metadata: {
          filename: file.name,
          page,
          pdf_mode: "typed",
          date_source: mtime ? "file_mtime" : "none",
        },
        media_refs: [],
      };
    });
  }

  const body = nonEmpty.map((x) => x.t).join("\n\n");
  const first = body.split(/\n|(?<=[.?!])\s+/)[0]?.trim() ?? null;
  return [
    {
      title: first && first.length < 80 ? first : file.name.replace(/\.pdf$/i, ""),
      body,
      created_at: mtime,
      date_uncertain: !parseIsoOrNull(mtime),
      source: "pdf_annotations",
      source_metadata: {
        filename: file.name,
        pdf_mode: "typed",
        date_source: mtime ? "file_mtime" : "none",
      },
      media_refs: [],
    },
  ];
}

export async function parsePdfPagesImport(
  file: File,
  onProgress?: (label: string) => void,
): Promise<PdfPagesParseResult> {
  onProgress?.("Reading PDF text…");
  const { texts } = await pageTexts(file);
  const textChars = texts.reduce((s, t) => s + t.trim().length, 0);
  const pagesWithText = texts.filter((t) => t.trim().length >= 40).length;
  const looksTyped =
    textChars >= 120 && pagesWithText >= Math.max(1, Math.ceil(texts.length * 0.4));

  if (looksTyped) {
    const drafts = typedDraftsFromPages(file, texts);
    if (drafts.length) return { drafts, mode: "typed" };
  }

  onProgress?.("Reading scanned pages…");
  const images = await renderPdfPagesToFiles(file);
  if (!images.length) {
    throw new Error(`Couldn’t read “${file.name}” as a typed or scanned PDF.`);
  }
  const drafts = await parseHandwrittenPhotoImport(
    images.map((f) => ({ files: [f] })),
  );
  return {
    drafts: drafts.map((d) => ({
      ...d,
      source: "handwritten_photo",
      source_metadata: {
        ...d.source_metadata,
        filename: file.name,
        pdf_mode: "scanned",
      },
    })),
    mode: "scanned",
  };
}

import { parseCsvTableFromFile } from "@/lib/journal-import/parsers/csv";
import { parseDayOneImport } from "@/lib/journal-import/parsers/day-one";
import { parseMarkdownImport } from "@/lib/journal-import/parsers/markdown";
import { parsePdfAnnotationImport } from "@/lib/journal-import/parsers/pdf-annotations";
import type { CsvTable, JournalImportDraft, JournalImportSource } from "@/lib/journal-import/types";

export type ImportKind =
  | "day_one"
  | "markdown"
  | "csv"
  | "pdf_annotations"
  | "handwritten_photo";

export type ImportSourceOption = {
  id: ImportKind;
  label: string;
  hint: string;
  accept: string;
  multiple: boolean;
  directory?: boolean;
};

export const JOURNAL_IMPORT_SOURCES: ImportSourceOption[] = [
  {
    id: "day_one",
    label: "Day One",
    hint: "Its export .zip — entries, dates, tags and photos.",
    accept: ".zip,.json",
    multiple: false,
  },
  {
    id: "pdf_annotations",
    label: "PDF",
    hint: "Typed PDFs read as text; scanned pages read like handwriting.",
    accept: ".pdf,application/pdf",
    multiple: true,
  },
  {
    id: "markdown",
    label: "Text files",
    hint: ".txt, .md or .docx — one file per entry, or split by dated sections.",
    accept: ".md,.markdown,.txt,.text,.docx,.zip",
    multiple: true,
    directory: true,
  },
  {
    id: "handwritten_photo",
    label: "Photos of handwritten pages",
    hint: "Several at once. On mobile you can use the camera.",
    accept: "image/jpeg,image/png,image/heic,image/heif,.jpg,.jpeg,.png,.heic,.heif",
    multiple: true,
  },
  {
    id: "csv",
    label: "CSV",
    hint: "A spreadsheet export. You’ll match columns next.",
    accept: ".csv,.txt",
    multiple: false,
  },
];

export async function runImportParser(
  kind: ImportKind,
  files: File[],
): Promise<{ drafts?: JournalImportDraft[]; csv?: CsvTable; pdfDatesMissing?: boolean }> {
  if (kind === "markdown") {
    return { drafts: await parseMarkdownImport(files) };
  }
  if (kind === "day_one") {
    return { drafts: await parseDayOneImport(files) };
  }
  if (kind === "csv") {
    if (!files[0]) throw new Error("Choose a CSV file.");
    return { csv: await parseCsvTableFromFile(files[0]) };
  }
  if (kind === "pdf_annotations") {
    const r = await parsePdfAnnotationImport(files);
    return { drafts: r.drafts, pdfDatesMissing: !r.datesFound };
  }
  throw new Error("Unknown import kind.");
}

export function sourceLabel(source: JournalImportSource): string {
  if (source === "day_one") return "Day One";
  if (source === "csv") return "CSV";
  if (source === "plaintext") return "Text";
  if (source === "pdf_annotations") return "PDF";
  if (source === "handwritten_photo") return "Handwritten";
  return "Markdown";
}

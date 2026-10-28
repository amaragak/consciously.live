/**
 * Guess journal-import format from a file’s name / type (no source picker).
 */

export type DetectedImportKind =
  | "day_one"
  | "pdf"
  | "text"
  | "handwritten_photo"
  | "csv"
  | "unsupported";

export type DetectedImportFile = {
  kind: DetectedImportKind;
  /** Short label under the thumbnail, e.g. "Handwritten page". */
  label: string;
};

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m?.[1]?.toLowerCase() ?? "";
}

export function detectImportFile(file: File): DetectedImportFile {
  const name = file.name || "file";
  const ext = extOf(name);
  const type = (file.type || "").toLowerCase();

  if (
    type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "heic", "heif", "webp", "gif"].includes(ext)
  ) {
    return { kind: "handwritten_photo", label: "Handwritten page" };
  }

  if (type === "application/pdf" || ext === "pdf") {
    return { kind: "pdf", label: "PDF" };
  }

  if (ext === "csv" || type === "text/csv") {
    return { kind: "csv", label: "CSV" };
  }

  if (
    ext === "zip" ||
    type === "application/zip" ||
    type === "application/x-zip-compressed"
  ) {
    // Day One export zip (or a zip of text pages — refined while reading).
    return { kind: "day_one", label: "Day One" };
  }

  if (ext === "json" || type === "application/json") {
    return { kind: "day_one", label: "Day One" };
  }

  if (
    ["md", "markdown", "txt", "text", "docx"].includes(ext) ||
    type.startsWith("text/") ||
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return { kind: "text", label: "Text file" };
  }

  return { kind: "unsupported", label: "Unsupported" };
}

export function refineDetectedLabel(
  kind: DetectedImportKind,
  opts: {
    entryCount?: number;
    pdfMode?: "typed" | "scanned";
  },
): string {
  if (kind === "day_one" && opts.entryCount != null) {
    const n = opts.entryCount;
    return `Day One · ${n} ${n === 1 ? "entry" : "entries"}`;
  }
  if (kind === "pdf") {
    if (opts.pdfMode === "scanned") return "Scanned PDF";
    if (opts.pdfMode === "typed") return "Typed PDF";
    return "PDF";
  }
  if (kind === "handwritten_photo") return "Handwritten page";
  if (kind === "text") return "Text file";
  if (kind === "csv") return "CSV";
  return "Unsupported";
}

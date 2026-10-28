import {
  headingTitleAndBody,
  splitYamlFrontmatter,
  parseIsoOrNull,
} from "@/lib/journal-import/dates";
import { applyHaikuDateAndTitle } from "@/lib/journal-import/enrich";
import type { JournalImportDraft } from "@/lib/journal-import/types";
import { readZipArchive } from "@/lib/zip-store";

const TEXT_EXT = /\.(md|markdown|txt|text)$/i;

function isTextName(name: string): boolean {
  return TEXT_EXT.test(name);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function draftFromMarkdownFile(opts: {
  name: string;
  text: string;
}): JournalImportDraft {
  const fm = splitYamlFrontmatter(opts.text);
  const headed = headingTitleAndBody(fm.rest);
  const title = fm.title?.trim() || headed.title || null;
  const fromFm = parseIsoOrNull(fm.date ?? null);
  return {
    title: title?.trim() ? title.trim() : null,
    body: headed.body,
    // Frontmatter date is authored metadata; never file mtime / filename.
    created_at: fromFm,
    date_uncertain: !fromFm,
    source:
      isTextName(opts.name) && /\.txt$/i.test(opts.name)
        ? "plaintext"
        : "markdown",
    source_metadata: {
      filename: opts.name,
      ...(fm.tags?.length ? { tags: fm.tags } : {}),
      date_source: fromFm ? "frontmatter" : "none",
    },
    media_refs: [],
  };
}

export async function parseMarkdownImport(files: File[]): Promise<JournalImportDraft[]> {
  const drafts: JournalImportDraft[] = [];
  for (const file of files) {
    const name = file.webkitRelativePath || file.name;
    const lower = name.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zip = await readZipArchive(await file.arrayBuffer());
      for (const z of zip) {
        if (!isTextName(z.name) || z.name.startsWith("__MACOSX/")) continue;
        drafts.push(
          draftFromMarkdownFile({
            name: z.name,
            text: decodeUtf8(z.bytes),
          }),
        );
      }
      continue;
    }
    if (!isTextName(name)) continue;
    drafts.push(
      draftFromMarkdownFile({
        name,
        text: await file.text(),
      }),
    );
  }
  if (!drafts.length) {
    throw new Error("No markdown or text files found in what you chose.");
  }

  const out: JournalImportDraft[] = [];
  for (const d of drafts) {
    if (d.created_at && d.title?.trim()) {
      out.push(d);
      continue;
    }
    const enriched = await applyHaikuDateAndTitle(d);
    if (d.created_at) {
      out.push({
        ...enriched,
        created_at: d.created_at,
        date_uncertain: false,
        source_metadata: {
          ...enriched.source_metadata,
          date_source: "frontmatter",
        },
      });
    } else {
      out.push(enriched);
    }
  }
  return out;
}

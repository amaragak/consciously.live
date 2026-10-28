export function parseIsoOrNull(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const direct = Date.parse(s);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (ymd) {
    const d = new Date(Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function utcNoonIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < 1600 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt.toISOString();
}

function stripOrdinal(day: string): number {
  return Number(day.replace(/(?:st|nd|rd|th)$/i, ""));
}

/**
 * Best-effort date from journal body text (letterheads, diary lines, etc.).
 * Prefers dates near the start of the text. Returns ISO or null.
 */
export function dateFromJournalText(text: string): string | null {
  const sample = text.replace(/\r\n/g, "\n").trim().slice(0, 1200);
  if (!sample) return null;

  const candidates: { iso: string; score: number }[] = [];

  const push = (iso: string | null, index: number, bonus = 0) => {
    if (!iso) return;
    // Prefer earlier mentions (letterheads / diary headers).
    const score = bonus + Math.max(0, 800 - index);
    candidates.push({ iso, score });
  };

  // 21st February 1908 · February 21, 1908 · 21 Feb 1908
  // Allow OCR junk between day and month (e.g. 21' February).
  const monthNames = Object.keys(MONTHS).join("|");
  const named = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?['’"]?\\s+(${monthNames})[,.]?\\s+(\\d{4})\\b` +
      `|\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?[,.]?\\s+(\\d{4})\\b`,
    "gi",
  );
  for (const m of sample.matchAll(named)) {
    if (m[1] && m[2] && m[3]) {
      const day = stripOrdinal(m[1]);
      const month = MONTHS[m[2].toLowerCase()];
      const year = Number(m[3]);
      if (month) push(utcNoonIso(year, month, day), m.index ?? 0, 40);
    } else if (m[4] && m[5] && m[6]) {
      const month = MONTHS[m[4].toLowerCase()];
      const day = stripOrdinal(m[5]);
      const year = Number(m[6]);
      if (month) push(utcNoonIso(year, month, day), m.index ?? 0, 40);
    }
  }

  // 21/02/1908 · 21-02-1908 · 1908-02-21
  const numeric = new RegExp(
    `\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b` +
      `|\\b(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})\\b`,
    "g",
  );
  for (const m of sample.matchAll(numeric)) {
    if (m[1] && m[2] && m[3]) {
      push(utcNoonIso(Number(m[1]), Number(m[2]), Number(m[3])), m.index ?? 0, 20);
    } else if (m[4] && m[5] && m[6]) {
      const a = Number(m[4]);
      const b = Number(m[5]);
      const y = Number(m[6]);
      // Prefer D/M/Y when day > 12; else assume D/M/Y (UK-style, matches product locale).
      if (a > 12) push(utcNoonIso(y, b, a), m.index ?? 0, 10);
      else if (b > 12) push(utcNoonIso(y, a, b), m.index ?? 0, 10);
      else push(utcNoonIso(y, b, a), m.index ?? 0, 5);
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.iso;
}

/** Dates in names like `2026-04-12.md` or `2026-04-12-lost-necklace.md`. */
export function dateFromFilename(name: string): string | null {
  const base = name.replace(/^.*[/\\]/, "");
  const m =
    /(\d{4})[-_.](\d{2})[-_.](\d{2})/.exec(base) ??
    /^(\d{4})(\d{2})(\d{2})(?:\D|$)/.exec(base);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function titleFromFilename(name: string): string {
  const base = name.replace(/^.*[/\\]/, "").replace(/\.[^.]+$/, "");
  const withoutDate = base.replace(
    /^\d{4}[-_.]?\d{2}[-_.]?\d{2}[-_.]?/,
    "",
  );
  const t = (withoutDate || base)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || "Untitled entry";
}

export function headingTitleAndBody(md: string): { title: string | null; body: string } {
  const text = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const m = /^#\s+(.+)$/m.exec(text);
  if (!m) return { title: null, body: text.trim() };
  const title = m[1].trim();
  const body = text.replace(m[0], "").trim();
  return { title: title || null, body };
}

export type YamlFrontmatter = {
  date?: string;
  title?: string;
  tags?: string[];
  rest: string;
};

export function splitYamlFrontmatter(md: string): YamlFrontmatter {
  const text = md.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) return { rest: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { rest: text };
  const block = text.slice(3, end).trim();
  const rest = text.slice(end + 4).replace(/^\n/, "");
  const out: YamlFrontmatter = { rest };
  for (const line of block.split("\n")) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim().replace(/^['"]|['"]$/g, "");
    if (key === "date" || key === "created" || key === "created_at") out.date = val;
    if (key === "title") out.title = val;
    if (key === "tags") {
      out.tags = val
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((t) => t.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    }
  }
  return out;
}

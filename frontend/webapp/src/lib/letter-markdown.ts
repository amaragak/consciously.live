/**
 * Display-time letter helpers: coerce structured JSON (incl. bodyParts) to
 * markdown, and guarantee preamble + closing when a stored letter jumps
 * greeting → ### headers with no opening/landing.
 */

const LETTER_DEFAULT_HEADINGS = [
  "What stood out",
  "What shifted",
  "Carry forward",
] as const;

const DEFAULT_PREAMBLE =
  "I've been sitting with what you wrote — thank you for putting this week into words.";
const DEFAULT_CLOSING = "Keep going. I'm in your corner.";

function splitSentences(text: string): string[] {
  return (
    text
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

type Section = { heading: string; body: string };

function extractJsonObjectFromText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("{") && t.endsWith("}")) return t;
  const start = t.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < t.length; i += 1) {
    const ch = t[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return t.slice(start, i + 1).trim();
      if (depth < 0) return null;
    }
  }
  return null;
}

function sectionBodyFromRow(row: object): string {
  const direct =
    typeof (row as { body?: unknown }).body === "string"
      ? (row as { body: string }).body.trim()
      : "";
  if (direct) return direct;

  const parts =
    (row as { bodyParts?: unknown }).bodyParts ??
    (row as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0) return "";

  return parts
    .map((p) => {
      if (typeof p === "string") return p;
      if (
        p &&
        typeof p === "object" &&
        typeof (p as { text?: unknown }).text === "string"
      ) {
        return (p as { text: string }).text;
      }
      return "";
    })
    .join("")
    .trim();
}

function textFromLetterField(value: unknown): string | undefined {
  if (typeof value === "string") {
    const t = value.trim();
    return t || undefined;
  }
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const joined = value
    .map((p) => {
      if (typeof p === "string") return p;
      if (
        p &&
        typeof p === "object" &&
        typeof (p as { text?: unknown }).text === "string"
      ) {
        return (p as { text: string }).text;
      }
      return "";
    })
    .join("")
    .trim();
  return joined || undefined;
}

function letterSectionsToMarkdown(params: {
  greeting: string;
  preamble?: string;
  sections: Section[];
  closing?: string;
}): string {
  const sections = params.sections.map((s) => ({
    heading: s.heading,
    body: (s.body ?? "").replace(/\s+/g, " ").trim(),
  }));
  let preamble = (params.preamble ?? "").replace(/\s+/g, " ").trim();
  let closing = (params.closing ?? "").replace(/\s+/g, " ").trim();

  if (!preamble) {
    const first = sections[0];
    if (first) {
      const parts = splitSentences(first.body);
      if (parts.length >= 2) {
        preamble = parts[0]!;
        sections[0] = { ...first, body: parts.slice(1).join(" ") };
      } else {
        preamble = DEFAULT_PREAMBLE;
      }
    } else {
      preamble = DEFAULT_PREAMBLE;
    }
  }

  if (!closing) {
    const lastIdx = sections.length - 1;
    const last = sections[lastIdx];
    if (last) {
      const parts = splitSentences(last.body);
      if (parts.length >= 2) {
        closing = parts[parts.length - 1]!;
        sections[lastIdx] = {
          ...last,
          body: parts.slice(0, -1).join(" "),
        };
      } else {
        closing = DEFAULT_CLOSING;
      }
    } else {
      closing = DEFAULT_CLOSING;
    }
  }

  const lines: string[] = [params.greeting.trim() || "Dear [[NAME]],", ""];
  lines.push(preamble, "");
  for (const section of sections) {
    const heading = section.heading.replace(/^#+\s*/, "").trim() || "Note";
    if (!section.body) continue;
    lines.push(`### ${heading}`, section.body, "");
  }
  lines.push(closing);
  return lines.join("\n").trim();
}

/**
 * Turn stored letter JSON (incl. bodyParts) into markdown.
 * Also recovers mangled storage where a greeting was prepended to raw JSON.
 * Leaves already-markdown letters unchanged.
 */
export function coerceLetterMarkdown(raw: string): string {
  let t = raw.trim();
  if (!t || /^NONE$/i.test(t)) return "";
  t = t
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const jsonRaw = extractJsonObjectFromText(t) ?? (t.startsWith("{") ? t : null);
  if (!jsonRaw) return t;

  try {
    const parsed = JSON.parse(jsonRaw) as {
      greeting?: unknown;
      preamble?: unknown;
      closing?: unknown;
      sections?: unknown;
      body?: unknown;
      letterMarkdown?: unknown;
    };
    if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
      const sections: Section[] = [];
      for (let i = 0; i < parsed.sections.length && sections.length < 3; i++) {
        const row = parsed.sections[i];
        if (!row || typeof row !== "object") continue;
        const heading =
          typeof (row as { heading?: unknown }).heading === "string"
            ? (row as { heading: string }).heading.trim()
            : (LETTER_DEFAULT_HEADINGS[sections.length] ??
              `Part ${sections.length + 1}`);
        const body = sectionBodyFromRow(row as object);
        if (!body) continue;
        sections.push({
          heading:
            heading || LETTER_DEFAULT_HEADINGS[sections.length] || "Note",
          body,
        });
      }
      if (sections.length > 0) {
        const greeting =
          typeof parsed.greeting === "string" && parsed.greeting.trim()
            ? parsed.greeting.trim().includes("[[NAME]]")
              ? parsed.greeting.trim()
              : "Dear [[NAME]],"
            : "Dear [[NAME]],";
        return letterSectionsToMarkdown({
          greeting,
          preamble: textFromLetterField(parsed.preamble),
          sections,
          closing: textFromLetterField(parsed.closing),
        });
      }
    }
    if (
      typeof parsed.letterMarkdown === "string" &&
      parsed.letterMarkdown.trim()
    ) {
      return parsed.letterMarkdown.trim();
    }
    if (typeof parsed.body === "string" && parsed.body.trim()) {
      return parsed.body.trim();
    }
  } catch {
    /* leave as-is */
  }
  return t;
}

function parseLetterSections(md: string): {
  greeting: string;
  preamble: string;
  sections: Section[];
} | null {
  const text = md.replace(/\r\n/g, "\n").trim();
  if (!/^#{1,6}\s+\S+/m.test(text)) return null;

  const greetMatch = text.match(/^(Dear[^\n]*,)\s*/i);
  if (!greetMatch) return null;
  const greeting = greetMatch[1]!;
  const rest = text.slice(greetMatch[0].length).replace(/^\n+/, "");

  const firstHeading = rest.search(/^#{1,6}\s+/m);
  if (firstHeading < 0) return null;

  const preamble = rest.slice(0, firstHeading).trim();
  const sectionBlock = rest.slice(firstHeading);
  const lines = sectionBlock.split("\n");

  const sections: Section[] = [];
  let i = 0;
  while (i < lines.length) {
    const hm = lines[i]!.match(/^(#{1,6})\s+(.+)$/);
    if (!hm) {
      i += 1;
      continue;
    }
    const heading = hm[2]!.trim();
    i += 1;
    const bodyLines: string[] = [];
    while (i < lines.length && !/^(#{1,6})\s+/.test(lines[i]!)) {
      bodyLines.push(lines[i]!);
      i += 1;
    }
    const body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
    if (body) sections.push({ heading, body });
  }

  if (sections.length === 0) return null;
  return { greeting, preamble, sections };
}

/**
 * Ensure preamble before first ### and a closing after the last section.
 * Peels a sentence from the nearest section when missing; else uses a default.
 */
export function frameLetterMarkdown(md: string): string {
  const parsed = parseLetterSections(md);
  if (!parsed) return md;

  const sections = parsed.sections.map((s) => ({ ...s }));
  let preamble = parsed.preamble;
  let closing = "";

  const needsPreamble = !preamble;
  // Closing is considered missing when we had no preamble (greeting→heading jump)
  // or when there was no trailing prose after sections (always for this parser).
  const needsClosing = needsPreamble || true;

  if (needsPreamble) {
    const first = sections[0]!;
    const parts = splitSentences(first.body);
    if (parts.length >= 2) {
      preamble = parts[0]!;
      sections[0] = { ...first, body: parts.slice(1).join(" ") };
    } else {
      preamble = DEFAULT_PREAMBLE;
    }
  }

  if (needsClosing) {
    // Only rewrite closing when preamble was also missing (classic broken letter),
    // or when preamble existed but we still want a landing — for letters that
    // already had preamble+full shape, avoid mutating. Detect "already framed":
    if (parsed.preamble) {
      return md.replace(/^(#{1,6}\s+[^\n]+)\n{2,}/gm, "$1\n");
    }
    const lastIdx = sections.length - 1;
    const last = sections[lastIdx]!;
    const parts = splitSentences(last.body);
    if (parts.length >= 2) {
      closing = parts[parts.length - 1]!;
      sections[lastIdx] = {
        ...last,
        body: parts.slice(0, -1).join(" "),
      };
    } else {
      closing = DEFAULT_CLOSING;
    }
  }

  const lines: string[] = [parsed.greeting, "", preamble, ""];
  for (const s of sections) {
    if (!s.body) continue;
    lines.push(`### ${s.heading}`, s.body, "");
  }
  if (closing) lines.push(closing);
  return lines.join("\n").trim();
}

/**
 * Normalize weekly letter model output into markdown with ### headers and **bold**.
 * Always includes a preamble before sections and a closing after them.
 */

const LETTER_DEFAULT_HEADINGS = [
  "What stood out",
  "What shifted",
  "Carry forward",
] as const;

/** Soft per-section ceiling so coerce never silently guts a full letter. */
const SECTION_BODY_WORD_SOFT_MAX = 90;

const DEFAULT_PREAMBLE =
  "I've been sitting with what you wrote — thank you for putting this week into words.";
const DEFAULT_CLOSING =
  "Keep going. I'm in your corner.";

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

/** Bold the first short phrase if the model omitted **…**. */
export function ensureLetterBodyHasBold(body: string): string {
  if (/\*\*[^*]+\*\*/.test(body)) return body;
  const m = body.match(/^((?:You\s+)?)(\S+(?:\s+\S+){0,3})/);
  if (!m || !m[2] || m[2].length < 3) return body;
  return `${m[1]}**${m[2]}**${body.slice(m[0].length)}`;
}

function trimLetterBodyWords(body: string, maxWords: number): string {
  const words = body.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return body.trim();
  return `${words.slice(0, maxWords).join(" ").replace(/[,:;]+$/, "")}.`;
}

function asPlainParagraph(text: string | undefined | null): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Flatten `body` string or `bodyParts` / `parts` arrays into one section body. */
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

/** Preamble/closing may be a string or an array of `{ text }` parts. */
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

function splitSentences(text: string): string[] {
  return (
    text
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? []
  );
}

/**
 * Guarantee a warm opening and landing — peel a sentence from section bodies
 * when the model omitted preamble/closing, else use a short default.
 */
export function ensurePreambleAndClosing(params: {
  preamble?: string;
  closing?: string;
  sections: Array<{ heading: string; body: string }>;
}): {
  preamble: string;
  closing: string;
  sections: Array<{ heading: string; body: string }>;
} {
  const sections = params.sections.map((s) => ({
    heading: s.heading,
    body: asPlainParagraph(s.body),
  }));
  let preamble = asPlainParagraph(params.preamble);
  let closing = asPlainParagraph(params.closing);

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

  return { preamble, closing, sections };
}

export function letterSectionsToMarkdown(params: {
  greeting: string;
  preamble?: string;
  sections: Array<{ heading: string; body: string }>;
  closing?: string;
  /** When false, keep full section bodies (structured JSON). Default trims prose. */
  softTrimBodies?: boolean;
}): string {
  const framed = ensurePreambleAndClosing({
    preamble: params.preamble,
    closing: params.closing,
    sections: params.sections,
  });
  const softTrim = params.softTrimBodies !== false;
  const lines: string[] = [params.greeting.trim() || "Dear [[NAME]],", ""];
  lines.push(framed.preamble, "");
  for (const section of framed.sections) {
    const heading = section.heading.replace(/^#+\s*/, "").trim() || "Note";
    const rawBody = softTrim
      ? trimLetterBodyWords(section.body, SECTION_BODY_WORD_SOFT_MAX)
      : section.body.trim();
    const body = ensureLetterBodyHasBold(rawBody);
    if (!body) continue;
    // Heading sits directly on its body (no blank line between).
    lines.push(`### ${heading}`, body, "");
  }
  lines.push(framed.closing);
  return lines.join("\n").trim();
}

function splitProseIntoSections(text: string, maxSections: number): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (paras.length >= 2) return paras.slice(0, maxSections);
  const single = paras[0] ?? text.replace(/\s+/g, " ").trim();
  if (!single) return [];
  const sentences = splitSentences(single);
  if (sentences.length <= maxSections) return sentences;
  const chunkSize = Math.ceil(sentences.length / maxSections);
  const out: string[] = [];
  for (
    let i = 0;
    i < sentences.length && out.length < maxSections;
    i += chunkSize
  ) {
    out.push(sentences.slice(i, i + chunkSize).join(" ").trim());
  }
  return out.filter(Boolean);
}

/** Parse markdown letters that already use ### section headers. */
function parseAtxLetter(md: string): {
  greeting: string;
  preamble?: string;
  sections: Array<{ heading: string; body: string }>;
  closing?: string;
} | null {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && !lines[i]!.trim()) i += 1;
  if (i >= lines.length) return null;

  let greeting = "Dear [[NAME]],";
  const first = lines[i]!.trim();
  if (/^Dear\s+/i.test(first) || /^\[\[NAME\]\],?$/i.test(first)) {
    greeting = first.includes("[[NAME]]")
      ? first.replace(/^Dear\s+[^,]+,/i, "Dear [[NAME]],")
      : "Dear [[NAME]],";
    if (/^Dear\s+/i.test(first)) greeting = "Dear [[NAME]],";
    i += 1;
  } else if (/^[A-Za-z][A-Za-z'-]{0,30},$/.test(first)) {
    greeting = "Dear [[NAME]],";
    i += 1;
  }

  const blocks: Array<{ type: "text" | "heading"; text: string }> = [];
  while (i < lines.length) {
    const line = lines[i]!;
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) {
      blocks.push({ type: "heading", text: hm[2]!.trim() });
      i += 1;
      const bodyLines: string[] = [];
      while (i < lines.length && !/^(#{1,6})\s+/.test(lines[i]!)) {
        bodyLines.push(lines[i]!);
        i += 1;
      }
      const body = bodyLines.join("\n").replace(/\s+/g, " ").trim();
      if (body) blocks.push({ type: "text", text: body });
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const textLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,6})\s+/.test(lines[i]!)
    ) {
      textLines.push(lines[i]!);
      i += 1;
    }
    const text = textLines.join(" ").replace(/\s+/g, " ").trim();
    if (text) blocks.push({ type: "text", text });
  }

  const sections: Array<{ heading: string; body: string }> = [];
  let preamble: string | undefined;
  let closing: string | undefined;
  let pendingHeading: string | null = null;
  let sawHeading = false;

  for (const block of blocks) {
    if (block.type === "heading") {
      pendingHeading = block.text;
      sawHeading = true;
      continue;
    }
    if (!sawHeading && !pendingHeading) {
      preamble = preamble ? `${preamble} ${block.text}` : block.text;
      continue;
    }
    if (pendingHeading) {
      sections.push({ heading: pendingHeading, body: block.text });
      pendingHeading = null;
      continue;
    }
    // Trailing prose after sections → closing
    closing = closing ? `${closing} ${block.text}` : block.text;
  }

  if (sections.length === 0) return null;
  return { greeting, preamble, sections, closing };
}

/**
 * Turn model LETTER output into markdown with ### headers and **bold**.
 * Accepts structured JSON (preferred) or plain prose (forced into sections).
 * Always ends with a preamble before sections and a closing after.
 */
export function coerceLetterMarkdown(raw: string): string {
  let t = raw.trim();
  if (!t || /^NONE$/i.test(t)) return "";
  t = t
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const jsonRaw = extractJsonObjectFromText(t) ?? (t.startsWith("{") ? t : null);
  if (jsonRaw) {
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
        const sections: Array<{ heading: string; body: string }> = [];
        for (
          let i = 0;
          i < parsed.sections.length && sections.length < 3;
          i++
        ) {
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
              heading ||
              LETTER_DEFAULT_HEADINGS[sections.length] ||
              "Note",
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
          const preamble = textFromLetterField(parsed.preamble);
          const closing = textFromLetterField(parsed.closing);
          return letterSectionsToMarkdown({
            greeting,
            preamble,
            sections,
            closing,
            softTrimBodies: false,
          });
        }
      }
      if (
        typeof parsed.letterMarkdown === "string" &&
        parsed.letterMarkdown.trim()
      ) {
        t = parsed.letterMarkdown.trim();
      } else if (typeof parsed.body === "string" && parsed.body.trim()) {
        t = parsed.body.trim();
      }
    } catch {
      /* fall through to prose / markdown handling */
    }
  }

  // Already has ATX headers — re-parse and re-frame so preamble/closing exist.
  if (/^#{1,6}\s+\S+/m.test(t)) {
    const parsed = parseAtxLetter(t);
    if (parsed) {
      return letterSectionsToMarkdown(parsed);
    }
    let md = t;
    if (!/^Dear\s+/im.test(md) && !md.includes("[[NAME]]")) {
      md = `Dear [[NAME]],\n\n${md}`;
    } else {
      md = md.replace(/^Dear\s+[^,\n]+,/i, "Dear [[NAME]],");
      md = md.replace(/^[A-Z][a-z]{1,30},\s*\n/, "Dear [[NAME]],\n");
    }
    md = md.replace(/^(#{1,6}\s+[^\n]+)\n{2,}/gm, "$1\n");
    // Inject defaults when greeting jumps straight to a heading / no closing.
    if (/^Dear[^\n]*\n+#{1,6}\s+/m.test(md)) {
      md = md.replace(
        /^(Dear[^\n]*\n+)/,
        `$1${DEFAULT_PREAMBLE}\n\n`,
      );
    }
    if (/^#{1,6}\s+[^\n]+\n[^\n#]+$/m.test(md) && !/\n\n[^\n#].+$/.test(md)) {
      md = `${md.trim()}\n\n${DEFAULT_CLOSING}`;
    }
    if (!/\*\*[^*]+\*\*/.test(md)) {
      md = md
        .split("\n")
        .map((line) => {
          if (/^#{1,6}\s+/.test(line) || !line.trim()) return line;
          return ensureLetterBodyHasBold(line);
        })
        .join("\n");
    }
    return md.trim();
  }

  // Plain prose → preamble + sections + closing when we have enough chunks.
  let body = t;
  const greet = body.match(
    /^(Dear\s+(?:\[\[NAME\]\]|[^\n,]+),|[A-Za-z][A-Za-z'-]{0,30},)\s*/i,
  );
  if (greet) body = body.slice(greet[0].length).trim();
  const chunks = splitProseIntoSections(body, 5);
  if (chunks.length === 0) {
    return letterSectionsToMarkdown({
      greeting: "Dear [[NAME]],",
      sections: [
        {
          heading: LETTER_DEFAULT_HEADINGS[0],
          body: "This period was quiet on the page — I'm still here with you.",
        },
      ],
    });
  }

  let preamble: string | undefined;
  let closing: string | undefined;
  let sectionChunks = chunks;
  if (chunks.length >= 4) {
    preamble = chunks[0];
    closing = chunks[chunks.length - 1];
    sectionChunks = chunks.slice(1, -1).slice(0, 3);
  } else if (chunks.length === 3) {
    preamble = chunks[0];
    sectionChunks = chunks.slice(1);
  }

  const sections = sectionChunks.map((chunk, i) => ({
    heading: LETTER_DEFAULT_HEADINGS[i] ?? `Part ${i + 1}`,
    body: chunk,
  }));
  return letterSectionsToMarkdown({
    greeting: "Dear [[NAME]],",
    preamble,
    sections,
    closing,
  });
}

/**
 * Insights page headline from the model — not a truncated letter sentence.
 * Strips cut-off dashes/ellipses and caps length.
 */
export function normalizeInsightTitle(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let t = raw.replace(/\s+/g, " ").trim();
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  t = t.replace(/[\s]*([—–\-−…]+|\.{2,})$/u, "").trim();
  t = t.replace(/[,:;]+$/u, "").trim();
  if (t.length > 90) {
    t = t.slice(0, 90).replace(/\s+\S*$/, "").trim();
    t = t.replace(/[\s]*([—–\-−…]+|\.{2,}|[,:;])$/u, "").trim();
  }
  if (t.length < 8) return undefined;
  return t;
}

/** Pull `title` from LETTER JSON before it is coerced to markdown. */
export function extractLetterTitleFromModelOutput(
  raw: string,
): string | undefined {
  let t = raw.trim();
  if (!t || /^NONE$/i.test(t)) return undefined;
  t = t
    .replace(/^```(?:json|markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const jsonRaw = extractJsonObjectFromText(t) ?? (t.startsWith("{") ? t : null);
  if (!jsonRaw) return undefined;
  try {
    const parsed = JSON.parse(jsonRaw) as { title?: unknown };
    return normalizeInsightTitle(parsed.title);
  } catch {
    return undefined;
  }
}

/**
 * Drop the opening salutation ("Dear Alex,", "Dear [[NAME]],", …) so TTS
 * does not speak personal names (pronunciation failures).
 */
export function stripLetterGreetingForNarration(md: string): string {
  const text = md.replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && !lines[i]!.trim()) i += 1;
  if (i >= lines.length) return "";
  const first = lines[i]!.trim();
  const isGreeting =
    /^Dear\s+/i.test(first) ||
    /^\[\[NAME\]\],?$/i.test(first) ||
    /^[A-Za-z][A-Za-z'-]{0,40},$/.test(first);
  if (!isGreeting) return text;
  i += 1;
  while (i < lines.length && !lines[i]!.trim()) i += 1;
  return lines.slice(i).join("\n").trim();
}

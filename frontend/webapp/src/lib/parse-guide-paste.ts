/**
 * Pure parser for admin "Paste guide" blocks.
 * Format: === GUIDE === … === END === with header keys and section markers.
 */

export type GuidePasteStep = {
  order: number;
  title: string;
  text: string;
};

export type GuidePasteGuide = {
  slug: string;
  title: string;
  category: string;
  readMinutes: number;
  order: number;
  /**
   * Cover image URL from `image:`.
   * `null` means the paste left `image:` blank — leave the current cover unchanged.
   */
  image: string | null;
  draft: boolean;
  keyIdea: string;
  tryThisTitle: string;
  tryThisSteps: GuidePasteStep[];
  ctaTitle: string;
  ctaBody: string;
  ctaLabel: string;
  /** BODY section markdown, preserved exactly (aside from \r\n normalisation). */
  body: string;
  /** 1-based line of the guide's === GUIDE === marker. */
  startLine: number;
};

export type GuidePasteIssue = {
  line: number;
  message: string;
};

export type GuidePasteOk = {
  guides: GuidePasteGuide[];
  warnings: GuidePasteIssue[];
};

export type GuidePasteErr = {
  errors: GuidePasteIssue[];
};

const GUIDE_START = /^\s*===\s*GUIDE\s*===\s*$/i;
const GUIDE_END = /^\s*===\s*END\s*===\s*$/i;
const SECTION_MARKERS = [
  "KEY IDEA",
  "TRY THIS",
  "CTA",
  "BODY",
] as const;
type SectionName = (typeof SECTION_MARKERS)[number];

const HEADER_KEYS = new Set([
  "slug",
  "title",
  "category",
  "read_minutes",
  "order",
  "image",
  "draft",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STEP_RE = /^(\d+)\.\s+(.+)$/;

function sectionMarker(name: SectionName): RegExp {
  const escaped = name.replace(/\s+/g, "\\s+");
  return new RegExp(`^\\s*---\\s*${escaped}\\s*---\\s*$`, "i");
}

const SECTION_RES: { name: SectionName; re: RegExp }[] = SECTION_MARKERS.map(
  (name) => ({ name, re: sectionMarker(name) }),
);

function matchSection(line: string): SectionName | null {
  for (const { name, re } of SECTION_RES) {
    if (re.test(line)) return name;
  }
  return null;
}

type RawGuide = {
  startLine: number;
  endLine: number;
  missingEnd: boolean;
  lines: { text: string; line: number }[];
};

function extractRawGuides(
  lines: { text: string; line: number }[],
): { guides: RawGuide[]; leadErrors: GuidePasteIssue[] } {
  const leadErrors: GuidePasteIssue[] = [];
  const guides: RawGuide[] = [];
  let i = 0;

  while (i < lines.length && !lines[i]!.text.trim()) i += 1;

  while (i < lines.length) {
    const row = lines[i]!;
    if (!GUIDE_START.test(row.text)) {
      leadErrors.push({
        line: row.line,
        message: "Expected === GUIDE === to start a guide",
      });
      i += 1;
      continue;
    }
    const startLine = row.line;
    i += 1;
    const content: { text: string; line: number }[] = [];
    let closed = false;
    let endLine = startLine;
    while (i < lines.length) {
      const cur = lines[i]!;
      if (GUIDE_END.test(cur.text)) {
        endLine = cur.line;
        closed = true;
        i += 1;
        break;
      }
      if (GUIDE_START.test(cur.text)) {
        break;
      }
      content.push(cur);
      endLine = cur.line;
      i += 1;
    }
    guides.push({
      startLine,
      endLine,
      missingEnd: !closed,
      lines: content,
    });
    while (i < lines.length && !lines[i]!.text.trim()) i += 1;
  }

  return { guides, leadErrors };
}

function parseHeaderValue(
  key: string,
  value: string,
  line: number,
  errors: GuidePasteIssue[],
): string | number | boolean | null {
  if (key === "slug") {
    const v = value.trim();
    if (!v) {
      errors.push({ line, message: "Missing slug" });
      return "";
    }
    if (!SLUG_RE.test(v)) {
      errors.push({
        line,
        message:
          "Slug must be lowercase letters, digits, and hyphens only",
      });
    }
    return v;
  }
  if (key === "title" || key === "category") {
    return value.trim();
  }
  if (key === "read_minutes" || key === "order") {
    const t = value.trim();
    if (!t || !/^-?\d+(\.\d+)?$/.test(t) || Number.isNaN(Number(t))) {
      errors.push({
        line,
        message: `${key} must be a number`,
      });
      return 0;
    }
    return Number(t);
  }
  if (key === "image") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  // draft
  const t = value.trim().toLowerCase();
  if (t !== "true" && t !== "false") {
    errors.push({ line, message: "draft must be true or false" });
    return false;
  }
  return t === "true";
}

function parseTryThis(
  sectionLines: { text: string; line: number }[],
  errors: GuidePasteIssue[],
): { title: string; steps: GuidePasteStep[] } {
  let title = "";
  const steps: GuidePasteStep[] = [];
  let sawTitle = false;
  for (const row of sectionLines) {
    const t = row.text.trimEnd();
    if (!t.trim()) continue;
    const titleMatch = /^\s*title:\s*(.*)$/i.exec(t);
    if (titleMatch && !sawTitle && steps.length === 0) {
      title = titleMatch[1] ?? "";
      sawTitle = true;
      continue;
    }
    const stepMatch = STEP_RE.exec(t.trim());
    if (!stepMatch) {
      errors.push({
        line: row.line,
        message: "TRY THIS step must look like: N. Step title | Step text",
      });
      continue;
    }
    const order = Number(stepMatch[1]);
    const rest = stepMatch[2]!;
    const pipe = rest.indexOf("|");
    if (pipe < 0) {
      errors.push({
        line: row.line,
        message: "TRY THIS step must look like: N. Step title | Step text",
      });
      continue;
    }
    steps.push({
      order,
      title: rest.slice(0, pipe).trim(),
      text: rest.slice(pipe + 1).trim(),
    });
  }
  return { title, steps };
}

function parseCta(
  sectionLines: { text: string; line: number }[],
  sectionStartLine: number,
  errors: GuidePasteIssue[],
): { title: string; body: string; label: string } {
  let title: string | undefined;
  let body: string | undefined;
  let label: string | undefined;
  for (const row of sectionLines) {
    const t = row.text.trimEnd();
    if (!t.trim()) continue;
    const m = /^\s*(title|body|label):\s*(.*)$/i.exec(t);
    if (!m) {
      errors.push({
        line: row.line,
        message: "CTA lines must be title:, body:, or label:",
      });
      continue;
    }
    const key = m[1]!.toLowerCase();
    const val = m[2] ?? "";
    if (key === "title") title = val;
    else if (key === "body") body = val;
    else label = val;
  }
  if (title === undefined || !String(title).trim()) {
    errors.push({ line: sectionStartLine, message: "CTA is missing title" });
  }
  if (body === undefined || !String(body).trim()) {
    errors.push({ line: sectionStartLine, message: "CTA is missing body" });
  }
  if (label === undefined || !String(label).trim()) {
    errors.push({ line: sectionStartLine, message: "CTA is missing label" });
  }
  return {
    title: (title ?? "").trim(),
    body: (body ?? "").trim(),
    label: (label ?? "").trim(),
  };
}

function parseOneGuide(raw: RawGuide): {
  guide?: GuidePasteGuide;
  errors: GuidePasteIssue[];
  warnings: GuidePasteIssue[];
} {
  const errors: GuidePasteIssue[] = [];
  const warnings: GuidePasteIssue[] = [];

  if (raw.missingEnd) {
    warnings.push({
      line: raw.endLine,
      message: "Missing === END ===; treated end of paste as end of guide",
    });
  }

  const headers: Record<string, unknown> = {};
  let headerDone = false;
  const sections = new Map<
    SectionName,
    { startLine: number; lines: { text: string; line: number }[] }
  >();
  let current: SectionName | null = null;

  for (const row of raw.lines) {
    if (!headerDone) {
      const sec = matchSection(row.text);
      if (sec) {
        headerDone = true;
        current = sec;
        sections.set(sec, { startLine: row.line, lines: [] });
        continue;
      }
      if (!row.text.trim()) continue;
      const hm = /^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(row.text);
      if (!hm) {
        errors.push({
          line: row.line,
          message: "Expected header key: value or a section marker",
        });
        continue;
      }
      const key = hm[1]!.toLowerCase();
      const value = hm[2] ?? "";
      if (!HEADER_KEYS.has(key)) {
        warnings.push({
          line: row.line,
          message: `Unknown header key “${key}” ignored`,
        });
        continue;
      }
      headers[key] = parseHeaderValue(key, value, row.line, errors);
      continue;
    }

    const sec = matchSection(row.text);
    if (sec) {
      current = sec;
      if (!sections.has(sec)) {
        sections.set(sec, { startLine: row.line, lines: [] });
      }
      continue;
    }
    if (current) {
      sections.get(current)!.lines.push(row);
    }
  }

  if (!("slug" in headers) || headers.slug === "") {
    if (!errors.some((e) => e.message === "Missing slug")) {
      errors.push({ line: raw.startLine, message: "Missing slug" });
    }
  }
  if (!("title" in headers) || String(headers.title ?? "").trim() === "") {
    errors.push({ line: raw.startLine, message: "Missing title" });
  }
  if (!("category" in headers) || String(headers.category ?? "").trim() === "") {
    errors.push({ line: raw.startLine, message: "Missing category" });
  }

  for (const name of SECTION_MARKERS) {
    if (!sections.has(name)) {
      errors.push({
        line: raw.startLine,
        message: `Missing ${name} section`,
      });
    }
  }

  const keySec = sections.get("KEY IDEA");
  const keyIdea = keySec
    ? keySec.lines
        .map((l) => l.text.trimEnd())
        .join("\n")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" ")
    : "";
  if (keySec && !keyIdea.trim()) {
    errors.push({
      line: keySec.startLine,
      message: "KEY IDEA section is empty",
    });
  }

  const trySec = sections.get("TRY THIS");
  const tryParsed = trySec
    ? parseTryThis(trySec.lines, errors)
    : { title: "", steps: [] as GuidePasteStep[] };

  const ctaSec = sections.get("CTA");
  const cta = ctaSec
    ? parseCta(ctaSec.lines, ctaSec.startLine, errors)
    : { title: "", body: "", label: "" };

  const bodySec = sections.get("BODY");
  let body = "";
  if (bodySec) {
    const ls = bodySec.lines.map((l) => l.text.trimEnd());
    let start = 0;
    while (start < ls.length && ls[start] === "") start += 1;
    let end = ls.length;
    while (end > start && ls[end - 1] === "") end -= 1;
    body = ls.slice(start, end).join("\n");
    if (!body.trim()) {
      errors.push({
        line: bodySec.startLine,
        message: "Missing BODY section",
      });
    }
  }

  if (errors.length) return { errors, warnings };

  return {
    guide: {
      slug: String(headers.slug ?? ""),
      title: String(headers.title ?? ""),
      category: String(headers.category ?? ""),
      readMinutes: Number(headers.read_minutes ?? 0),
      order: Number(headers.order ?? 0),
      image: "image" in headers ? (headers.image as string | null) : null,
      draft: Boolean(headers.draft),
      keyIdea,
      tryThisTitle: tryParsed.title,
      tryThisSteps: tryParsed.steps,
      ctaTitle: cta.title,
      ctaBody: cta.body,
      ctaLabel: cta.label,
      body,
      startLine: raw.startLine,
    },
    errors: [],
    warnings,
  };
}

/**
 * Parse one or more pasted guides.
 * Returns `{ guides, warnings }` on success, or `{ errors }` if any guide fails.
 */
export function parseGuidePaste(input: string): GuidePasteOk | GuidePasteErr {
  const normalised = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalised.split("\n").map((text, idx) => ({
    text: text.replace(/[ \t]+$/g, ""),
    line: idx + 1,
  }));

  if (!lines.some((l) => l.text.trim())) {
    return { errors: [{ line: 1, message: "Paste is empty" }] };
  }

  const { guides: rawGuides, leadErrors } = extractRawGuides(lines);
  if (rawGuides.length === 0) {
    return {
      errors: leadErrors.length
        ? leadErrors
        : [
            {
              line: 1,
              message: "No === GUIDE === … === END === block found",
            },
          ],
    };
  }

  const allErrors: GuidePasteIssue[] = [...leadErrors];
  const allWarnings: GuidePasteIssue[] = [];
  const guides: GuidePasteGuide[] = [];

  for (const raw of rawGuides) {
    const parsed = parseOneGuide(raw);
    allWarnings.push(...parsed.warnings);
    if (parsed.errors.length) allErrors.push(...parsed.errors);
    else if (parsed.guide) guides.push(parsed.guide);
  }

  if (allErrors.length) return { errors: allErrors };
  return { guides, warnings: allWarnings };
}

/** Strip a leading "Try this ·" so :::try label matches the reader. */
export function tryThisFenceLabel(tryThisTitle: string): string {
  const t = tryThisTitle.trim();
  const stripped = t.replace(/^try\s+this\s*[·•\-–—|:]\s*/i, "").trim();
  return stripped || t;
}

/**
 * Compose markdown body for the guide model: BODY, then :::key, then :::try.
 * KEY IDEA / TRY THIS have no separate DB fields — they live as body shortcodes.
 */
export function composeGuideBodyFromPaste(g: GuidePasteGuide): string {
  const parts: string[] = [];
  if (g.body.trim()) parts.push(g.body);

  if (g.keyIdea.trim()) {
    parts.push(`:::key\n${g.keyIdea.trim()}\n:::`);
  }

  const label = tryThisFenceLabel(g.tryThisTitle);
  const steps = [...g.tryThisSteps]
    .sort((a, b) => a.order - b.order)
    .map((s) => `${s.order}. **${s.title}** — ${s.text}`)
    .join("\n");
  const fenceOpen = label ? `:::try ${label}` : ":::try";
  parts.push(`${fenceOpen}\n${steps}\n:::`);

  return parts.join("\n\n");
}

/** First line = card title, further lines = description (practiceBrief). */
export function composePracticeBriefFromPaste(g: GuidePasteGuide): string {
  const title = g.ctaTitle.trim();
  const body = g.ctaBody.trim();
  if (title && body) return `${title}\n${body}`;
  return title || body;
}

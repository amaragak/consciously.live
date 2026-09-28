/**
 * Normalize weekly letter model output into markdown with ### headers and **bold**.
 */

const LETTER_DEFAULT_HEADINGS = [
  "What stood out",
  "What shifted",
  "Carry forward",
] as const;

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

export function letterSectionsToMarkdown(params: {
  greeting: string;
  sections: Array<{ heading: string; body: string }>;
}): string {
  const lines: string[] = [params.greeting.trim() || "Dear [[NAME]],", ""];
  for (const section of params.sections) {
    const heading = section.heading.replace(/^#+\s*/, "").trim() || "Note";
    const body = ensureLetterBodyHasBold(
      trimLetterBodyWords(section.body.replace(/\s+/g, " ").trim(), 55),
    );
    if (!body) continue;
    lines.push(`### ${heading}`, "", body, "");
  }
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
  const sentences =
    single
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [single];
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

/**
 * Turn model LETTER output into markdown with ### headers and **bold**.
 * Accepts structured JSON (preferred) or plain prose (forced into sections).
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
          const body =
            typeof (row as { body?: unknown }).body === "string"
              ? (row as { body: string }).body.trim()
              : "";
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
          return letterSectionsToMarkdown({ greeting, sections });
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

  // Already has ATX headers — normalize greeting + ensure some bold.
  if (/^#{1,6}\s+\S+/m.test(t)) {
    let md = t;
    if (!/^Dear\s+/im.test(md) && !md.includes("[[NAME]]")) {
      md = `Dear [[NAME]],\n\n${md}`;
    } else {
      md = md.replace(/^Dear\s+[^,\n]+,/i, "Dear [[NAME]],");
      md = md.replace(/^[A-Z][a-z]{1,30},\s*\n/, "Dear [[NAME]],\n");
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

  // Plain prose → forced sections with headers + bold.
  let body = t;
  const greet = body.match(
    /^(Dear\s+(?:\[\[NAME\]\]|[^\n,]+),|[A-Za-z][A-Za-z'-]{0,30},)\s*/i,
  );
  if (greet) body = body.slice(greet[0].length).trim();
  const chunks = splitProseIntoSections(body, 3);
  if (chunks.length === 0) return "Dear [[NAME]],";
  const sections = chunks.map((chunk, i) => ({
    heading: LETTER_DEFAULT_HEADINGS[i] ?? `Part ${i + 1}`,
    body: chunk,
  }));
  return letterSectionsToMarkdown({
    greeting: "Dear [[NAME]],",
    sections,
  });
}

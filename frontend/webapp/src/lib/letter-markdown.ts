/**
 * Display-time framing for weekly letters: guarantee preamble + closing
 * when a stored letter jumps greeting → ### headers with no opening/landing.
 */

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

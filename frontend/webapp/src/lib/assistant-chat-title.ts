/**
 * Chat thread titles — provisional local derive + Haiku summary (Claude-style).
 */

export const ASSISTANT_CHAT_TITLE_SYSTEM = [
  "You name chat conversation threads.",
  "Given the user's first message, reply with ONLY a short title.",
  "Rules:",
  "- 3 to 7 words",
  "- Capture the topic or intent; do not copy the message verbatim",
  "- No quotation marks, no emoji, no trailing punctuation",
  "- Prefer a concise noun phrase (e.g. \"Morning anxiety before meeting\")",
  "- Output the title alone — nothing else",
].join("\n");

const MAX_TITLE_CHARS = 60;

/** Clean model / fallback title text for storage and UI. */
export function sanitizeAssistantChatTitle(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  t = (t.split(/\r?\n/)[0] ?? "").trim();
  t = t.replace(/\s+/g, " ");
  t = t.replace(/[.!?…]+$/g, "").trim();
  if (!t) return "";
  if (t.length <= MAX_TITLE_CHARS) return t;
  const clipped = t.slice(0, MAX_TITLE_CHARS - 1);
  const atWord = clipped.replace(/\s+\S*$/, "").trimEnd();
  return `${(atWord || clipped).trimEnd()}`;
}

/**
 * Instant placeholder while a smart title loads — not a verbatim dump of a long message.
 * Prefer the first clause / sentence, then word-bound clip.
 */
export function deriveAssistantChatTitleProvisional(text: string): string {
  let t = text.trim().replace(/\s+/g, " ");
  if (!t) return "New chat";
  // First sentence-ish chunk
  const clause = t.split(/(?<=[.!?])\s+|:\s+| — |\s+-\s+/)[0]?.trim() || t;
  t = clause.length >= 12 && clause.length <= 80 ? clause : t;
  if (t.length <= MAX_TITLE_CHARS) return t;
  const clipped = t.slice(0, MAX_TITLE_CHARS - 1);
  const atWord = clipped.replace(/\s+\S*$/, "").trimEnd();
  return `${(atWord || clipped).trimEnd()}…`;
}

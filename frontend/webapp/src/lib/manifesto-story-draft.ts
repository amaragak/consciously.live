/**
 * Manifesto Story draft model: paragraphs, section breaks, and prompt labels.
 * Labels are editor-only — stripped from word count, LLM, and narration.
 */

import { STORY_SECTION_BREAK } from "@/lib/manifesto-story";

const LABEL_RE = /^§L§([^§]+)§([01])§([^§]*)§$/;

export type StoryDraftLabel = {
  kind: "label";
  promptId: string;
  text: string;
  collapsed: boolean;
};

export type StoryDraftText = {
  kind: "text";
  text: string;
};

export type StoryDraftBreak = {
  kind: "break";
};

export type StoryDraftNode = StoryDraftLabel | StoryDraftText | StoryDraftBreak;

export const STORY_OPENER_PROMPT_ID = "start-here";
export const STORY_OPENER_PROMPT_TEXT =
  "Everything worked out, and then some. What does your life look like now?";
export const STORY_OPENER_PLACEHOLDER =
  "Start with the big picture. The details can come later.";
export const STORY_ANSWER_PLACEHOLDER = "Write your answer…";

function encodeLabel(n: StoryDraftLabel): string {
  return `§L§${n.promptId}§${n.collapsed ? "1" : "0"}§${encodeURIComponent(n.text)}§`;
}

function parseLabelLine(line: string): StoryDraftLabel | null {
  const m = LABEL_RE.exec(line.trim());
  if (!m) return null;
  let text = m[3] ?? "";
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep raw */
  }
  return {
    kind: "label",
    promptId: m[1]!,
    text,
    collapsed: m[2] === "1",
  };
}

/** Parse a stored draft string into nodes (migrates plain text). */
export function parseStoryDraft(draft: string): StoryDraftNode[] {
  if (!draft) return [];
  const parts = draft.split(STORY_SECTION_BREAK);
  const nodes: StoryDraftNode[] = [];
  for (let pi = 0; pi < parts.length; pi++) {
    if (pi > 0) nodes.push({ kind: "break" });
    let chunk = parts[pi]!;
    if (pi > 0) chunk = chunk.replace(/^\n{1,2}/, "");
    if (pi < parts.length - 1) chunk = chunk.replace(/\n{1,2}$/, "");
    const lines = chunk.split("\n");
    let buf: string[] = [];
    const flush = () => {
      if (buf.length === 0) return;
      const text = buf.join("\n");
      buf = [];
      // Keep empty text nodes only if they're the sole content under a label
      nodes.push({ kind: "text", text });
    };
    for (const line of lines) {
      const label = parseLabelLine(line);
      if (label) {
        flush();
        nodes.push(label);
      } else {
        buf.push(line);
      }
    }
    flush();
  }
  // Drop leading empty text before first real content (except after labels)
  return nodes;
}

export function serializeStoryDraft(nodes: readonly StoryDraftNode[]): string {
  const parts: string[] = [];
  let chunk: string[] = [];
  const flushChunk = () => {
    if (chunk.length === 0 && parts.length === 0) return;
    parts.push(chunk.join("\n"));
    chunk = [];
  };
  for (const n of nodes) {
    if (n.kind === "break") {
      flushChunk();
      continue;
    }
    if (n.kind === "label") {
      chunk.push(encodeLabel(n));
    } else {
      chunk.push(n.text);
    }
  }
  flushChunk();
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  return parts.join(`\n\n${STORY_SECTION_BREAK}\n\n`);
}

/** Story body only — no labels, breaks → blank lines. */
export function storyDraftPlainText(draft: string): string {
  return parseStoryDraft(draft)
    .filter((n): n is StoryDraftText => n.kind === "text")
    .map((n) => n.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/** First-person slices for Prepare for narration — one per prompt label (+ opening). */
export type DraftComposeSection = {
  promptId: string | null;
  promptText: string;
  text: string;
};

/** Life-area dream meta for Raise — keep suggestions inside that area. */
export type RaiseLifeAreaMeta = {
  id: string;
  title: string;
  /** The dream / first thought. */
  dream: string;
  /** Vision — what it looks like when true. */
  vision: string;
  /** What the area actually is. */
  description?: string;
};

/** `area-achieved:dream_…` → dream id. */
export function areaRefIdFromPromptId(
  promptId: string | null | undefined,
): string | null {
  if (!promptId || !promptId.startsWith("area-")) return null;
  const i = promptId.lastIndexOf(":");
  if (i < 0) return null;
  const id = promptId.slice(i + 1).trim();
  return id || null;
}

/** `value-look:value_…` → value id. */
export function valueRefIdFromPromptId(
  promptId: string | null | undefined,
): string | null {
  if (!promptId || !promptId.startsWith("value-")) return null;
  const i = promptId.lastIndexOf(":");
  if (i < 0) return null;
  const id = promptId.slice(i + 1).trim();
  return id || null;
}

function clipRaiseMeta(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Soft values preamble for Raise — influence, don’t dominate. */
export function formatRaiseValuesBlock(
  values: readonly string[] | undefined,
): string {
  const list = (values ?? [])
    .map((v) => clipRaiseMeta(v, 80))
    .filter(Boolean)
    .slice(0, 20);
  if (list.length === 0) return "";
  return (
    "Writer's values (soft influence — colour tone and larger rewrites; " +
    "do NOT centre every suggestion on these or force-mention them):\n" +
    list.map((v) => `- ${v}`).join("\n") +
    "\n\n"
  );
}

/**
 * Draft for Raise the ceiling: each answer under its prompt so the model
 * keeps morning/morning, known-for/known-for, etc. Life-area prompts also
 * get dream + vision meta. Optional values list soft-guides rewrites.
 */
export function annotateDraftWithPrompts(
  draft: string,
  opts?: {
    lifeAreas?: readonly RaiseLifeAreaMeta[];
    /** Ideate value labels (text only). */
    values?: readonly string[];
    /** id → text for value-bucket prompts. */
    valuesById?: ReadonlyMap<string, string> | Record<string, string>;
  },
): string {
  const byId = new Map(
    (opts?.lifeAreas ?? []).map((a) => [a.id, a] as const),
  );
  const valuesById = (() => {
    if (!opts?.valuesById) return new Map<string, string>();
    if (opts.valuesById instanceof Map) return opts.valuesById;
    return new Map(Object.entries(opts.valuesById));
  })();
  const sections = draftSectionsForCompose(draft);
  const body =
    sections.length === 0
      ? parseStoryDraft(draft)
          .filter((n): n is StoryDraftText => n.kind === "text")
          .map((n) => n.text.trim())
          .filter(Boolean)
          .join("\n\n")
      : sections
          .map((s) => {
            const answer = s.text.trim();
            if (!answer) return "";
            const cue = s.promptText.trim()
              ? `[Prompt: ${s.promptText.trim()}]\n`
              : "";
            const area = (() => {
              const refId = areaRefIdFromPromptId(s.promptId);
              return refId ? byId.get(refId) : undefined;
            })();
            let meta = "";
            if (area) {
              meta += `[Life area: ${area.title.trim() || "Untitled"}]\n`;
              const dream = clipRaiseMeta(area.dream, 360);
              const vision = clipRaiseMeta(area.vision, 360);
              const description = clipRaiseMeta(area.description ?? "", 300);
              if (description) meta += `What it is: ${description}\n`;
              if (dream) meta += `Dream: ${dream}\n`;
              if (vision) meta += `What it looks like: ${vision}\n`;
            }
            const valueRef = valueRefIdFromPromptId(s.promptId);
            const valueText = valueRef ? valuesById.get(valueRef) : undefined;
            if (valueText?.trim()) {
              meta += `[Value: ${clipRaiseMeta(valueText, 80)}]\n`;
            }
            return `${cue}${meta}${answer}`;
          })
          .filter(Boolean)
          .join("\n\n");
  return `${formatRaiseValuesBlock(opts?.values)}${body}`;
}

export function draftSectionsForCompose(draft: string): DraftComposeSection[] {
  const nodes = parseStoryDraft(draft);
  const out: DraftComposeSection[] = [];
  let cur: DraftComposeSection = {
    promptId: null,
    promptText: "",
    text: "",
  };
  const flush = () => {
    const text = cur.text.replace(/\n{3,}/g, "\n\n").trim();
    if (!text) return;
    out.push({ ...cur, text });
  };
  for (const n of nodes) {
    if (n.kind === "label") {
      flush();
      cur = { promptId: n.promptId, promptText: n.text, text: "" };
      continue;
    }
    if (n.kind === "break") {
      if (cur.text.trim()) cur.text += "\n\n";
      continue;
    }
    if (!n.text) continue;
    cur.text = cur.text ? `${cur.text}\n\n${n.text}` : n.text;
  }
  flush();
  return out;
}

export function promptsDoneFromDraft(draft: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const n of parseStoryDraft(draft)) {
    if (n.kind !== "label") continue;
    if (seen.has(n.promptId)) continue;
    seen.add(n.promptId);
    ids.push(n.promptId);
  }
  return ids;
}

export function draftHasPromptLabel(draft: string, promptId: string): boolean {
  return parseStoryDraft(draft).some(
    (n) => n.kind === "label" && n.promptId === promptId,
  );
}

/** Words under a label (until next label/break/end). */
export function wordsOwnedByLabel(
  nodes: readonly StoryDraftNode[],
  labelIndex: number,
): number {
  let words = 0;
  for (let i = labelIndex + 1; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (n.kind === "label" || n.kind === "break") break;
    const t = n.text.trim();
    if (!t) continue;
    words += t.split(/\s+/).filter(Boolean).length;
  }
  return words;
}

/** Text under the label containing `nodeIndex` (or last ~300 words). */
export function textForGoBigger(
  nodes: readonly StoryDraftNode[],
  focusNodeIndex: number | null,
): string {
  if (focusNodeIndex != null && focusNodeIndex >= 0) {
    let labelIdx = -1;
    for (let i = focusNodeIndex; i >= 0; i--) {
      if (nodes[i]!.kind === "label") {
        labelIdx = i;
        break;
      }
      if (nodes[i]!.kind === "break") break;
    }
    if (labelIdx >= 0) {
      const parts: string[] = [];
      for (let i = labelIdx + 1; i < nodes.length; i++) {
        const n = nodes[i]!;
        if (n.kind === "label" || n.kind === "break") break;
        if (n.text.trim()) parts.push(n.text);
      }
      const joined = parts.join("\n\n").trim();
      if (joined) return joined.slice(-1200);
    }
  }
  const all = nodes
    .filter((n): n is StoryDraftText => n.kind === "text")
    .map((n) => n.text)
    .join("\n\n");
  return all.trim().slice(-1200);
}

export function seededOpenerDraft(): string {
  return serializeStoryDraft([
    {
      kind: "label",
      promptId: STORY_OPENER_PROMPT_ID,
      text: STORY_OPENER_PROMPT_TEXT,
      collapsed: false,
    },
    { kind: "text", text: "" },
  ]);
}

/**
 * Insert a prompt label after the paragraph containing the cursor, or at end.
 * `cursorNodeIndex` = text node index in `nodes`; `cursorOffset` within that text.
 */
export function insertPromptLabel(
  nodes: readonly StoryDraftNode[],
  opts: {
    promptId: string;
    text: string;
    cursorNodeIndex: number | null;
    cursorOffset: number;
  },
): { nodes: StoryDraftNode[]; focusNodeIndex: number } {
  const existing = nodes.findIndex(
    (n) => n.kind === "label" && n.promptId === opts.promptId,
  );
  if (existing >= 0) {
    const next = nodes.map((n, i) =>
      i === existing && n.kind === "label"
        ? { ...n, collapsed: false }
        : n,
    );
    return { nodes: next, focusNodeIndex: existing };
  }

  const label: StoryDraftLabel = {
    kind: "label",
    promptId: opts.promptId,
    text: opts.text,
    collapsed: false,
  };
  const empty: StoryDraftText = { kind: "text", text: "" };

  // Nothing before the label → insert at the top (no leading blank paragraphs).
  const hasContent = nodes.some(
    (n) =>
      n.kind === "label" ||
      n.kind === "break" ||
      (n.kind === "text" && n.text.trim().length > 0),
  );
  if (!hasContent) {
    return { nodes: [label, empty], focusNodeIndex: 1 };
  }

  const copy = nodes.slice();

  if (
    opts.cursorNodeIndex != null &&
    opts.cursorNodeIndex >= 0 &&
    opts.cursorNodeIndex < copy.length &&
    copy[opts.cursorNodeIndex]!.kind === "text"
  ) {
    const ti = opts.cursorNodeIndex;
    const node = copy[ti] as StoryDraftText;
    const off = Math.max(0, Math.min(opts.cursorOffset, node.text.length));
    // Split after the paragraph containing the cursor
    const before = node.text.slice(0, off);
    const paraEnd = before.lastIndexOf("\n\n");
    const splitAt =
      paraEnd >= 0 ? paraEnd + 2 : before.length > 0 ? before.length : 0;
    const head = node.text.slice(0, splitAt).replace(/\n+$/, "");
    const tail = node.text.slice(splitAt).replace(/^\n+/, "");
    const splice: StoryDraftNode[] = [];
    // Only keep text before the label when there is actual content.
    if (head.length > 0) {
      splice.push({ kind: "text", text: head });
    }
    splice.push(label, empty);
    if (tail.length > 0) {
      splice.push({ kind: "text", text: tail });
    }
    copy.splice(ti, 1, ...splice);
    let focusNodeIndex = ti;
    for (let i = ti; i < copy.length; i++) {
      if (
        copy[i]!.kind === "label" &&
        (copy[i] as StoryDraftLabel).promptId === opts.promptId
      ) {
        focusNodeIndex = i + 1;
        break;
      }
    }
    return { nodes: copy, focusNodeIndex };
  }

  copy.push(label, empty);
  return { nodes: copy, focusNodeIndex: copy.length - 1 };
}

export function removePromptLabel(
  nodes: readonly StoryDraftNode[],
  labelIndex: number,
): StoryDraftNode[] {
  if (nodes[labelIndex]?.kind !== "label") return nodes.slice();
  const next = nodes.slice();
  next.splice(labelIndex, 1);
  // Merge adjacent text nodes
  return mergeAdjacentText(next);
}

export function toggleLabelCollapsed(
  nodes: readonly StoryDraftNode[],
  labelIndex: number,
): StoryDraftNode[] {
  return nodes.map((n, i) =>
    i === labelIndex && n.kind === "label"
      ? { ...n, collapsed: !n.collapsed }
      : n,
  );
}

function mergeAdjacentText(nodes: StoryDraftNode[]): StoryDraftNode[] {
  const out: StoryDraftNode[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.kind === "text" && last?.kind === "text") {
      out[out.length - 1] = {
        kind: "text",
        text: `${last.text}\n\n${n.text}`.replace(/\n{3,}/g, "\n\n"),
      };
    } else {
      out.push(n);
    }
  }
  return out;
}

/** Whether a text node is hidden because a preceding collapsed label owns it. */
export function isTextHiddenByCollapse(
  nodes: readonly StoryDraftNode[],
  textIndex: number,
): boolean {
  for (let i = textIndex - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (n.kind === "break") return false;
    if (n.kind === "label") return n.collapsed;
  }
  return false;
}

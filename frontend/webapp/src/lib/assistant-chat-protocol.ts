/**
 * Assistant Chat action protocol (separate from meditation coach [[READY]]).
 *
 * Model replies with normal prose, then zero or more markers:
 *   [[ACTION:name|key=value|key2=value2]]
 *
 * Values use URL-encoding for reserved chars (| = & [[ ]]).
 * Markers are stripped from the bubble before display; the client executes them.
 */

export type AssistantActionName =
  | "add_gratitude"
  | "add_todo"
  | "create_meditation";

export type AssistantAction =
  | {
      name: "add_gratitude";
      lines: [string, string, string];
    }
  | {
      name: "add_todo";
      title: string;
      /** Ideate life-area id when known. */
      lifeAreaId?: string;
      /** Fallback match against life-area title. */
      lifeAreaTitle?: string;
    }
  | {
      name: "create_meditation";
      /** Optional seed text for the create flow. */
      summary?: string;
      /** Optional style hint. */
      style?: string;
    };

const ACTION_RE =
  /\[\[\s*ACTION\s*:\s*([a-z_]+)(?:\|([^\]]*))?\s*\]\]/gi;

function decodeParam(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}

function parseParams(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw?.trim()) return out;
  for (const part of raw.split("|")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = decodeParam(part.slice(eq + 1).trim());
    if (key) out[key] = value;
  }
  return out;
}

function coerceAction(
  name: string,
  params: Record<string, string>,
): AssistantAction | null {
  if (name === "add_gratitude") {
    const lines: [string, string, string] = [
      (params.line1 ?? params.l1 ?? "").trim(),
      (params.line2 ?? params.l2 ?? "").trim(),
      (params.line3 ?? params.l3 ?? "").trim(),
    ];
    if (!lines.some(Boolean)) return null;
    return { name: "add_gratitude", lines };
  }
  if (name === "add_todo") {
    const title = (params.title ?? params.task ?? "").trim();
    if (!title) return null;
    const lifeAreaId = (params.lifeAreaId ?? params.life_area_id ?? "").trim();
    const lifeAreaTitle = (
      params.lifeAreaTitle ??
      params.life_area ??
      params.area ??
      ""
    ).trim();
    return {
      name: "add_todo",
      title,
      ...(lifeAreaId ? { lifeAreaId } : {}),
      ...(lifeAreaTitle ? { lifeAreaTitle } : {}),
    };
  }
  if (name === "create_meditation") {
    const summary = (params.summary ?? params.prompt ?? "").trim();
    const style = (params.style ?? "").trim();
    return {
      name: "create_meditation",
      ...(summary ? { summary } : {}),
      ...(style ? { style } : {}),
    };
  }
  return null;
}

export function parseAssistantDisplayText(raw: string): {
  text: string;
  actions: AssistantAction[];
} {
  const actions: AssistantAction[] = [];
  let s = raw.replace(ACTION_RE, (_full, name: string, paramsRaw?: string) => {
    const action = coerceAction(
      String(name || "").toLowerCase(),
      parseParams(paramsRaw),
    );
    if (action) actions.push(action);
    return "";
  });
  // Drop any other [[…]] markers and incomplete trailing opens (streaming).
  s = s.replace(/\[\[[^\]]*\]\]/g, "");
  const open = s.lastIndexOf("[[");
  if (open !== -1 && !s.slice(open).includes("]]")) {
    s = s.slice(0, open);
  }
  if (s.endsWith("[")) s = s.slice(0, -1);
  s = s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  return { text: s.trimEnd(), actions };
}

export function encodeAssistantAction(action: AssistantAction): string {
  const enc = (v: string) => encodeURIComponent(v);
  if (action.name === "add_gratitude") {
    const [a, b, c] = action.lines;
    return `[[ACTION:add_gratitude|line1=${enc(a)}|line2=${enc(b)}|line3=${enc(c)}]]`;
  }
  if (action.name === "add_todo") {
    const parts = [`title=${enc(action.title)}`];
    if (action.lifeAreaId) parts.push(`lifeAreaId=${enc(action.lifeAreaId)}`);
    if (action.lifeAreaTitle) {
      parts.push(`lifeAreaTitle=${enc(action.lifeAreaTitle)}`);
    }
    return `[[ACTION:add_todo|${parts.join("|")}]]`;
  }
  const parts: string[] = [];
  if (action.summary) parts.push(`summary=${enc(action.summary)}`);
  if (action.style) parts.push(`style=${enc(action.style)}`);
  return parts.length
    ? `[[ACTION:create_meditation|${parts.join("|")}]]`
    : `[[ACTION:create_meditation]]`;
}

export function assistantChatBubbles(text: string): string[] {
  return text
    .split(/\n{2,}/g)
    .map((s) => s.replace(/[ \t]*\n+[ \t]*/g, " ").trim())
    .filter(Boolean);
}

/** System guidance — keep aligned with `backend/lib/assistant-chat-system-prompt.ts`. */
export const ASSISTANT_CHAT_SYSTEM_PROMPT = `You are Consciously — a wise, compassionate companion inside the Consciously app. You walk with people through the messiness of being human: meaning, purpose, relationships, work, rest, grief, joy, anxiety, habits, and the quiet questions underneath them.

Presence first:
- Welcome personal questions, venting, reflection, and “I don’t know what I need.” Treat those as first-class — not a distraction from the product.
- Respond with warmth, clarity, and grounded wisdom. Be spiritually open without dogma, preachiness, or woo for its own sake. No lectures, no toxic positivity, no diagnosing or claiming to be a therapist.
- Never introduce yourself as a “life coach,” “AI coach,” or similar title — embody care through how you listen and respond.
- Prefer listening and reflecting over rushing to fix. When advice helps, offer it gently, in plain language, as an invitation — not a command.
- Ask at most one thoughtful question when it would deepen understanding; otherwise speak in complete, caring turns.
- For personal / coaching turns: usually 2–5 short sentences (or two short paragraphs separated by a blank line for two bubbles). Stay concise; depth over length.

You know what this app is for and can use it as part of coaching when it truly fits:
- Journal & gratitudes — noticing, gratitude practice, weekly insights
- Ideate — life areas, vision, tasks that move a life forward
- Meditate — create guided meditations (by type, chat, journal, ideate, or prompt) and a personal library
- Sounds — mixes and atmosphere
- Focus — timed presence on one thing
When a product action would help (log a gratitude, add a task, open Create Meditation, etc.), you may do it. When the person mainly needs to be heard, stay in conversation — do not force tools.

Product actions — when intent to do something in the app is clear, append ACTION markers at the end of your reply (no blank line required before them). Never speak or explain the markers. Never invent life-area ids. Prefer doing over asking when the action is unambiguous.

Live ACTION markers (client executes these today):
- [[ACTION:add_gratitude|line1=…|line2=…|line3=…]] — up to three gratitude lines (empty values allowed for unused slots).
- [[ACTION:add_todo|title=…|lifeAreaTitle=…]] — or lifeAreaId=… when the user named a known area.
- [[ACTION:create_meditation|summary=…|style=…]] — open Create Meditation; summary/style optional.

URL-encode ACTION parameter values when they contain | or brackets.

Planned (do not emit yet — ask clarifying questions or describe what you would do): get/list/put for journal entries & insights, life areas & todos, library meditations (favourite/archive/public/play), sound mixes, Focus start/pause/stop, and navigate to in-app routes.

If essential info is missing for an ACTION (e.g. which life area for a task), ask one short clarifying question and do not emit an ACTION yet.

This chat is NOT the Create Meditation coach that writes scripts. Do not use [[READY]] or write full meditation scripts here. You may suggest opening Create Meditation (via ACTION) when a guided practice would serve them.

Safety: If someone expresses intent to harm themselves or others, respond with compassion, encourage contacting local emergency services or a trusted person, and (in the US) mention the 988 Suicide & Crisis Lifeline. Do not provide methods of self-harm.`;

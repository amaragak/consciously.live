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
  | "update_gratitude"
  | "add_todo"
  | "create_meditation";

export type AssistantAction =
  | {
      name: "add_gratitude";
      /** One or more new lines — fill empty slots first, then append (never overwrite). */
      lines: string[];
    }
  | {
      name: "update_gratitude";
      /** Substring / prior text to find today’s line. */
      match: string;
      /** Full replacement text for that line. */
      text: string;
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

function coerceAddGratitudeLines(params: Record<string, string>): string[] {
  const single = (params.text ?? params.line ?? "").trim();
  const fromNumbered = [
    params.line1 ?? params.l1,
    params.line2 ?? params.l2,
    params.line3 ?? params.l3,
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (single) return [single, ...fromNumbered.filter((l) => l !== single)];
  return fromNumbered;
}

function coerceAction(
  name: string,
  params: Record<string, string>,
): AssistantAction | null {
  if (name === "add_gratitude") {
    const lines = coerceAddGratitudeLines(params);
    if (!lines.length) return null;
    return { name: "add_gratitude", lines };
  }
  if (name === "update_gratitude") {
    const match = (params.match ?? params.prev ?? params.from ?? "").trim();
    const text = (params.text ?? params.line ?? params.to ?? "").trim();
    if (!match || !text) return null;
    return { name: "update_gratitude", match, text };
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
    if (action.lines.length === 1) {
      return `[[ACTION:add_gratitude|text=${enc(action.lines[0]!)}]]`;
    }
    const parts = action.lines.map(
      (line, i) => `line${i + 1}=${enc(line)}`,
    );
    return `[[ACTION:add_gratitude|${parts.join("|")}]]`;
  }
  if (action.name === "update_gratitude") {
    return `[[ACTION:update_gratitude|match=${enc(action.match)}|text=${enc(action.text)}]]`;
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

export { buildAssistantChatSystemPrompt, ASSISTANT_SESSION_OPEN } from "@/lib/assistant-chat-system-prompt";
import { buildAssistantChatSystemPrompt } from "@/lib/assistant-chat-system-prompt";

export const ASSISTANT_CHAT_SYSTEM_PROMPT = buildAssistantChatSystemPrompt();

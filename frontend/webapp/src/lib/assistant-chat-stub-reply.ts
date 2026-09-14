import {
  ASSISTANT_CHAT_SYSTEM_PROMPT,
  encodeAssistantAction,
  type AssistantAction,
} from "@/lib/assistant-chat-protocol";

export { ASSISTANT_CHAT_SYSTEM_PROMPT };

/**
 * Deterministic stub for `/api/assistant-chat` when no Lambda URL / API key is set.
 * Recognizes a few clear intents and emits ACTION markers the client can execute.
 */
export function buildAssistantStubReply(userText: string): string {
  const t = userText.trim();
  const lower = t.toLowerCase();

  // Gratitude: "grateful for …", "add gratitude …", "gratitude: …"
  const gratitudeMatch =
    t.match(
      /(?:add\s+)?gratitude(?:\s*(?:for|:))?\s+(.+)/i,
    ) ||
    t.match(/i(?:'m| am)?\s+grateful\s+for\s+(.+)/i) ||
    t.match(/thankful\s+for\s+(.+)/i);
  if (gratitudeMatch?.[1]) {
    const line = gratitudeMatch[1].replace(/[.!?]+$/, "").trim();
    if (line) {
      const action: AssistantAction = {
        name: "add_gratitude",
        lines: [line, "", ""],
      };
      return (
        `I've added that to today's gratitudes.` +
        encodeAssistantAction(action)
      );
    }
  }

  // Todo: "add task to Health: Call Sam" / "add todo for Work — email"
  const todoAreaColon = t.match(
    /(?:add\s+)?(?:a\s+)?(?:task|todo|to-do)\s+(?:to|for)\s+(.+?)\s*[:\-–—]\s*(.+)/i,
  );
  if (todoAreaColon) {
    const lifeAreaTitle = todoAreaColon[1].trim();
    const title = todoAreaColon[2].trim();
    if (title && lifeAreaTitle) {
      const action: AssistantAction = {
        name: "add_todo",
        title,
        lifeAreaTitle,
      };
      return (
        `I'll add “${title}” under ${lifeAreaTitle}.` +
        encodeAssistantAction(action)
      );
    }
  }

  // Todo: "add task Call Sam to Health"
  const todoTitleThenArea = t.match(
    /(?:add\s+)?(?:a\s+)?(?:task|todo|to-do)\s+(.+?)\s+(?:to|in|for)\s+(.+)/i,
  );
  if (todoTitleThenArea) {
    const title = todoTitleThenArea[1].trim();
    const lifeAreaTitle = todoTitleThenArea[2].trim().replace(/[.!?]+$/, "");
    if (title && lifeAreaTitle && !/gratitude|meditat/i.test(title)) {
      const action: AssistantAction = {
        name: "add_todo",
        title,
        lifeAreaTitle,
      };
      return (
        `I'll add “${title}” under ${lifeAreaTitle}.` +
        encodeAssistantAction(action)
      );
    }
  }

  const todoLoose = t.match(
    /(?:add\s+)?(?:a\s+)?(?:task|todo|to-do)\s*[:\-–—]?\s+(.+)/i,
  );
  if (todoLoose?.[1] && !/gratitude|meditat/i.test(lower)) {
    return `Which life area should I add “${todoLoose[1].trim()}” to? Reply with the area name.`;
  }

  // Meditation create
  if (
    /\b(create|start|make|build)\b.{0,24}\bmeditat/i.test(t) ||
    /\bmeditat(?:ion|e)\b.{0,24}\b(create|start|make|build)\b/i.test(t) ||
    lower === "create a meditation" ||
    lower === "new meditation"
  ) {
    const summary = t
      .replace(
        /^(?:please\s+)?(?:can you\s+)?(?:create|start|make|build)\s+(?:a\s+|an\s+)?meditation(?:\s+(?:about|for|on))?\s*/i,
        "",
      )
      .trim();
    const action: AssistantAction = {
      name: "create_meditation",
      ...(summary && summary.length > 2 && !/^please\.?$/i.test(summary)
        ? { summary }
        : {}),
    };
    return (
      `I can open Create Meditation for you — tap the link when you're ready.` +
      encodeAssistantAction(action)
    );
  }

  if (/^(hi|hello|hey)\b/i.test(t) || lower.length < 3) {
    return (
      "Hi — I'm here with you.\n\n" +
      "Share what's on your mind, or ask for help with a gratitude, a task, or starting a meditation."
    );
  }

  // Soft coaching stub when no product intent matched (no Claude key / Lambda).
  if (
    /\b(feel|feeling|anxious|stress|lonely|lost|purpose|meaning|relationship|grief|scared|overwhelmed|stuck|tired|sad|angry|worried)\b/i.test(
      t,
    )
  ) {
    return (
      "Thank you for naming that — it matters that you said it out loud.\n\n" +
      "I'm with you. What feels most true about this right now: the body, the story in your head, or what you wish were different?"
    );
  }

  return (
    "I'm listening. Tell me more about what's going on — or if you'd rather do something in the app, I can help with gratitudes, life-area tasks, or starting a meditation."
  );
}

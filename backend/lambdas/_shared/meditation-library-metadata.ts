/**
 * Library card title / type / description via Claude (create + dev re-derive).
 */

import { parseAnthropicMessageUsage } from "./anthropic-pricing";
import {
  type KnownMeditationType,
  inferPresetTypeFromScriptHeuristic,
  knownMeditationTypesJsonArrayBlock,
  normalizeMeditationType,
} from "./meditation-types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function parseMetadataJsonFromAnthropicText(responseText: string): {
  title: string;
  meditationType: string;
  description: string;
} {
  let parsedApi: { content?: Array<{ type?: string; text?: string }> };
  try {
    parsedApi = JSON.parse(responseText);
  } catch {
    throw new Error("Invalid JSON from Anthropic (metadata transport)");
  }

  let raw =
    parsedApi.content?.find((c) => c?.type === "text")?.text?.trim() ?? "";
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  let obj: { title?: unknown; meditationType?: unknown; description?: unknown };
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("Metadata assistant payload was not JSON");
  }

  const title =
    typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim().slice(0, 120)
      : "";
  const meditationType =
    typeof obj.meditationType === "string" && obj.meditationType.trim()
      ? obj.meditationType.trim().slice(0, 80)
      : "";

  let descriptionRaw = "";
  if (typeof obj.description === "string") {
    descriptionRaw = obj.description.trim();
  }
  descriptionRaw = descriptionRaw.replace(/\s+/g, " ");
  if (descriptionRaw.length > 300) {
    descriptionRaw = descriptionRaw.slice(0, 300).trim();
  }

  return { title, meditationType, description: descriptionRaw };
}

async function callAnthropicMetadataJson(params: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
}): Promise<{
  responseText: string;
  usage: { input_tokens: number; output_tokens: number } | null;
}> {
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: 512,
      system: params.system,
      messages: [{ role: "user", content: params.user }],
    }),
  });

  const responseText = await upstream.text();
  if (!upstream.ok) {
    throw new Error(
      `Anthropic metadata failed: ${responseText.slice(0, 500)}`,
    );
  }
  return {
    responseText,
    usage: parseAnthropicMessageUsage(responseText),
  };
}

/** Prefer clean creator intent over `packageOneShotPrompt` wrapper text in the transcript. */
export function transcriptForLibraryMetadata(
  transcript: string,
  createIntent?: string | null,
): string {
  const intent = (createIntent ?? "").trim();
  if (intent) {
    return `User: ${intent}`.slice(0, 2500);
  }
  const t = transcript.trim();
  if (!t) return "";
  if (/one-shot request/i.test(t)) {
    const unwrapped = unwrapOneShotPackaging(t.replace(/^User:\s*/i, ""));
    return unwrapped ? `User: ${unwrapped}`.slice(0, 2500) : t.slice(0, 2500);
  }

  // By Program chats open on session 1 (e.g. Root). Prefer the script brief +
  // recent answers so title/description are not stuck on the opening only.
  const briefMatch = t.match(/### By Program — script brief[\s\S]*/i);
  if (briefMatch && typeof briefMatch.index === "number") {
    const brief = briefMatch[0].slice(0, 1400);
    const before = t.slice(0, briefMatch.index).trim();
    const recent = before.length > 1800 ? before.slice(-1800) : before;
    return `${recent}\n\n${brief}`.slice(0, 4000);
  }

  // Long free-form chats: prefer the end (answers) over the opener.
  if (t.length > 2800) return t.slice(-2800);
  return t.slice(0, 2800);
}

/** Head + middle + tail so multi-part scripts are not judged by the opening alone. */
export function scriptPreviewForLibraryMetadata(
  script: string,
  maxChars = 2800,
): string {
  const t = script.trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  const head = Math.floor(maxChars * 0.4);
  const mid = Math.floor(maxChars * 0.2);
  const tail = Math.max(200, maxChars - head - mid - 20);
  const midStart = Math.max(0, Math.floor((t.length - mid) / 2));
  return [
    t.slice(0, head).trim(),
    "…",
    t.slice(midStart, midStart + mid).trim(),
    "…",
    t.slice(-tail).trim(),
  ].join("\n");
}

/** Unwrap `packageOneShotPrompt` packaging to the user's actual request. */
export function unwrapOneShotPackaging(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const req = t.match(/\bRequest:\s*\n?([\s\S]+)/i);
  if (req?.[1]?.trim()) {
    return req[1].replace(/\s+/g, " ").trim();
  }
  if (!/one-shot request/i.test(t)) return t.replace(/\s+/g, " ").trim();
  return t
    .replace(
      /^Please write a complete guided meditation script from this one-shot request\.\s*/i,
      "",
    )
    .replace(/^Use a calm, warm tone[^.]*\.\s*/i, "")
    .replace(/^Interpret the request generously[^.]*\.\s*/i, "")
    .replace(/^do not ask clarifying questions\.\s*/i, "")
    .replace(/^Request:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeOneShotPackaging(text: string): boolean {
  return /one-shot request|Please write a complete guided meditation script/i.test(
    text,
  );
}

export function scrubLibraryFacingCopy(text: string): string {
  return text
    .replace(
      /Please write a complete guided meditation script from this one-shot request\.?/gi,
      "",
    )
    .replace(/Use a calm, warm tone suitable for spoken guidance\.?/gi, "")
    .replace(/Interpret the request generously[^.]*\.?/gi, "")
    .replace(/do not ask clarifying questions\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function deriveLibraryMetadataFromClaude(params: {
  apiKey: string;
  model: string;
  meditationStyle: string;
  transcript: string;
  scriptPreview: string;
  /** Journal / free-form: no real style label — type must be inferred from chat + script only. */
  journalMode: boolean;
  /** Raw creator intent when known (one-shot request, etc.). */
  createIntent?: string | null;
}): Promise<{
  title: string;
  meditationType: string;
  description: string;
  claudeUsage: { input_tokens: number; output_tokens: number } | null;
}> {
  const scriptPreview = scriptPreviewForLibraryMetadata(params.scriptPreview);
  const allowedJson = knownMeditationTypesJsonArrayBlock();
  const planningContext = transcriptForLibraryMetadata(
    params.transcript,
    params.createIntent,
  );

  const system = [
    "You output exactly one JSON object and nothing else: keys title, meditationType, description.",
    'Field "meditationType" MUST be identical to one string in the ALLOWED_MEDITATION_TYPES JSON array from the user message — copy it character-for-character (including spaces and hyphens).',
    "Pick the **single best-matching** category for this meditation; if several fit, choose the strongest overall fit.",
    "Never invent labels: no synonyms or paraphrases (e.g. not Mindfulness, Zen, Guided meditation, Calm, General).",
    "Title: ~10 words, evocative, listener-facing — same quality as a published meditation card. Description: what the listener will experience across the whole practice.",
    "If the practice weaves multiple themes, centers, sessions, or phases, title and description MUST reflect the full journey — never name only the opening section (e.g. do not title a full chakra journey as a Root-only piece).",
    "Never invent themes (grief, heartbreak, etc.) that are not supported by the script or chat.",
    "Never quote or paraphrase system/instructions (e.g. “Please write a complete guided meditation script”, “one-shot request”).",
    "No markdown code fences.",
  ].join(" ");

  const modeBlock = params.journalMode
    ? [
        "### Task",
        "The creator used journal / free-form / prompt mode. Ignore placeholder style labels like “General”.",
        "Read the chat + script, then choose the **single best-matching** meditationType from ALLOWED_MEDITATION_TYPES only (verbatim copy).",
        "Invent a proper library title from the practice itself (script + creator intent) — do not reuse the raw user prompt as the title.",
      ].join("\n")
    : [
        "### Task",
        `Creator style label (tone/context only): ${params.meditationStyle.trim() || "(none)"}.`,
        "Choose the **single best-matching** meditationType from ALLOWED_MEDITATION_TYPES for what the script actually does (verbatim copy).",
        "If the style label exactly matches one allowed string and the script fits it, you may use that same string.",
      ].join("\n");

  const userMain = [
    "### ALLOWED_MEDITATION_TYPES",
    "You MUST set JSON key meditationType to EXACTLY one of these strings (copy from the array below, unchanged):",
    allowedJson,
    "",
    modeBlock,
    "",
    "### Planning / chat context",
    planningContext || "(none)",
    "",
    "### Spoken script (excerpts — beginning, middle, end; judge the WHOLE practice)",
    scriptPreview || "(empty)",
    "",
    'Return: {"title":"~10 words, evocative","meditationType":"<one allowed string exactly>","description":"200-300 characters, one line, what the listener will experience"}',
  ].join("\n");

  const { responseText, usage } = await callAnthropicMetadataJson({
    apiKey: params.apiKey,
    model: params.model,
    system,
    user: userMain,
  });

  let { title, meditationType, description } =
    parseMetadataJsonFromAnthropicText(responseText);
  title = scrubLibraryFacingCopy(title);
  description = scrubLibraryFacingCopy(description);

  if (description.length < 200) {
    throw new Error("Missing or too-short description in metadata JSON");
  }
  if (!title || !meditationType) {
    throw new Error("Missing title or meditationType in metadata JSON");
  }
  if (
    looksLikeOneShotPackaging(title) ||
    looksLikeOneShotPackaging(description)
  ) {
    throw new Error("Metadata still contains one-shot packaging copy");
  }

  const normalizedFromLlm = normalizeMeditationType(meditationType);
  const normalizedType: KnownMeditationType =
    normalizedFromLlm ??
    inferPresetTypeFromScriptHeuristic(params.scriptPreview) ??
    "Reflection";

  return {
    title,
    meditationType: normalizedType,
    description,
    claudeUsage: usage,
  };
}

export function fallbackLibraryMetadata(params: {
  meditationStyle: string;
  transcript: string;
  scriptPreview: string;
  journalMode: boolean;
  createIntent?: string | null;
}): {
  title: string;
  meditationType: KnownMeditationType;
  description: string;
} {
  const rawStyle = params.meditationStyle.trim();
  const style =
    rawStyle && rawStyle.toLowerCase() !== "general" ? rawStyle : "";

  const firstUserBlock = (() => {
    const cleaned = transcriptForLibraryMetadata(
      params.transcript,
      params.createIntent,
    );
    const m = cleaned.match(
      /(?:^|\n)User:\s*([\s\S]*?)(?=\n(?:User|Guide|Assistant):|\s*$)/i,
    );
    return (m?.[1] ?? "").trim();
  })();
  const moodSnippet = firstUserBlock
    .replace(/\s+/g, " ")
    .replace(/[“”"]/g, "")
    .trim();
  const shortMood =
    moodSnippet.length > 0 && !looksLikeOneShotPackaging(moodSnippet)
      ? moodSnippet.slice(0, 80).replace(/\s+$/g, "")
      : "";

  const fromScript =
    params.journalMode || !style
      ? inferPresetTypeFromScriptHeuristic(params.scriptPreview)
      : null;

  const meditationType: KnownMeditationType =
    style && normalizeMeditationType(style)
      ? (normalizeMeditationType(style) as KnownMeditationType)
      : fromScript ?? "Reflection";

  const title = style
    ? `${style} · session`
    : shortMood
      ? `Journal · ${shortMood}`
      : "Guided meditation";

  const base = style
    ? `A ${style} session with gentle guidance to help you soften tension, steady your breath, and reconnect with calm. Expect slow pacing, soothing reminders, and a grounded end-state you can carry into your day.`
    : shortMood
      ? `A gentle guided session shaped around your check-in: ${shortMood}. Expect slow pacing, supportive reminders, and an easy landing that helps you feel more grounded by the end.`
      : "A guided meditation designed to calm your mind and support relaxation. Expect gentle pacing, slow breath cues, and reassuring prompts that help you release tension and return to the present moment.";

  let description = base.replace(/\s+/g, " ").trim();
  if (description.length > 300) description = description.slice(0, 300).trim();
  if (description.length < 200) {
    description = `${description} Let the experience settle in. Breathe, notice, and relax.`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  }

  return { title, meditationType, description };
}

/**
 * When the creator didn't pick a style, a short Haiku call may infer one so
 * the matching writer's guide can still be attached (high confidence only).
 */
import {
  CLAUDE_HAIKU_55_MODEL_ID,
  coerceClaudeModel,
  parseAnthropicMessageUsage,
  withClaudeThinkingOff,
} from "./anthropic-pricing";
import { recordClaudeUsage, type AiUsageSource } from "./ai-usage";
import {
  KNOWN_MEDITATION_TYPES,
  normalizeMeditationType,
  type KnownMeditationType,
} from "./meditation-types";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const STYLE_INFER_SYSTEM = [
  "Decide whether this meditation request clearly asks for one of these styles:",
  "body scan, visualization, breath-led, manifestation, affirmation loop, story,",
  "reflection, sleep, loving-kindness, anxiety relief, movement meditation, open awareness.",
  'Only pick one if the request itself points to it (e.g. "help me fall asleep" → sleep,',
  '"walk me through my body" → body scan). If it\'s general, mixed or unclear, answer none.',
  'Reply with JSON only: {"style": "<one of the styles or none>", "confidence": "high" | "low", "reason": "<a few words>"}.',
].join(" ");

export type StyleInferResult = {
  /** Canonical KnownMeditationType label, or null when none / low / failed. */
  style: KnownMeditationType | null;
  /** Raw style string from the model (may be "none"). */
  rawStyle: string;
  confidence: "high" | "low" | null;
  reason: string;
  /** True when a guide should be attached (style set + high confidence). */
  useGuide: boolean;
  modelId: string;
  ms: number;
  failed: boolean;
};

function extractJsonObject(raw: string): unknown {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fence ? fence[1]!.trim() : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseStyleInferReply(raw: string): {
  rawStyle: string;
  confidence: "high" | "low" | null;
  reason: string;
  style: KnownMeditationType | null;
} {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    return { rawStyle: "none", confidence: null, reason: "", style: null };
  }
  const o = parsed as Record<string, unknown>;
  const rawStyle =
    typeof o.style === "string" ? o.style.trim().toLowerCase() : "none";
  const confidence =
    o.confidence === "high" || o.confidence === "low" ? o.confidence : null;
  const reason = typeof o.reason === "string" ? o.reason.trim() : "";
  if (!rawStyle || rawStyle === "none") {
    return { rawStyle: "none", confidence, reason, style: null };
  }
  const style = normalizeMeditationType(rawStyle);
  return { rawStyle, confidence, reason, style };
}

/**
 * Infer a Meditate style from the brief / create chat only.
 * On failure or invalid JSON, returns useGuide: false (carry on with no guide).
 */
export async function inferMeditationStyle(params: {
  apiKey: string;
  /** Admin setting; defaults to current Haiku. */
  modelId?: string;
  /** Brief + create-flow chat only — no attached journal/goals context. */
  transcript: string;
  usageSource?: AiUsageSource;
}): Promise<StyleInferResult> {
  const modelId =
    coerceClaudeModel(params.modelId) || CLAUDE_HAIKU_55_MODEL_ID;
  const transcript = params.transcript.trim() || "(No messages yet.)";
  const t0 = Date.now();
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(
        withClaudeThinkingOff({
          model: modelId,
          max_tokens: 256,
          system: STYLE_INFER_SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                "### Create-flow chat / brief",
                transcript,
                "",
                "Reply with JSON only.",
              ].join("\n"),
            },
          ],
        }),
      ),
    });
    const responseText = await upstream.text();
    if (!upstream.ok) {
      console.warn("style infer failed", {
        status: upstream.status,
        body: responseText.slice(0, 500),
      });
      return {
        style: null,
        rawStyle: "none",
        confidence: null,
        reason: "request failed",
        useGuide: false,
        modelId,
        ms: Date.now() - t0,
        failed: true,
      };
    }
    const parsed = JSON.parse(responseText) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text =
      parsed.content?.find((c) => c?.type === "text")?.text?.trim() ?? "";
    const usage = parseAnthropicMessageUsage(responseText);
    if (usage) {
      void recordClaudeUsage({
        model: modelId,
        feature: "meditation-script",
        source: params.usageSource ?? "system",
        reason: "style-infer",
        usage,
      });
    }
    const result = parseStyleInferReply(text);
    const useGuide =
      result.style != null &&
      result.confidence === "high" &&
      KNOWN_MEDITATION_TYPES.includes(result.style);
    return {
      ...result,
      useGuide,
      modelId,
      ms: Date.now() - t0,
      failed: false,
    };
  } catch (e) {
    console.warn("style infer error", e);
    return {
      style: null,
      rawStyle: "none",
      confidence: null,
      reason: e instanceof Error ? e.message : "error",
      useGuide: false,
      modelId,
      ms: Date.now() - t0,
      failed: true,
    };
  }
}

/** True when the creator locked a concrete style (skip infer). */
export function creatorSelectedMeditationStyle(
  meditationStyle: string | null | undefined,
): boolean {
  const t = (meditationStyle ?? "").trim();
  if (!t) return false;
  if (t.toLowerCase() === "general") return false;
  return true;
}

export type StyleGuideAttachment = {
  /**
   * Style label passed as `styleGuideStyle` to the prompt builder when the
   * creator did not pick one (inferred only). Null when none / low confidence.
   */
  styleGuideStyle: KnownMeditationType | null;
  /**
   * Style that ends up in the guide block: creator pick (if it has a guide),
   * else inferred high-confidence style. Null → no writer's guide in the prompt.
   */
  guideStyle: KnownMeditationType | null;
  /** True when the writer's guide markdown is included in the system prompt. */
  guideAttached: boolean;
  source: "creator" | "inferred" | "none";
  infer: StyleInferResult | null;
};

/**
 * Same rules as production create (`generate-meditation-audio`):
 * - Journal → no guide
 * - Creator picked a concrete style → guide for that style if one exists
 * - Otherwise Haiku-infer; attach only on high-confidence known style
 */
export async function resolveStyleGuideAttachment(params: {
  apiKey: string;
  styleInferModelId?: string;
  transcript: string;
  /** Creator-selected style from the create UI (empty / general → infer). */
  meditationStyle?: string | null;
  journalMode?: boolean;
  usageSource?: AiUsageSource;
}): Promise<StyleGuideAttachment> {
  if (params.journalMode) {
    return {
      styleGuideStyle: null,
      guideStyle: null,
      guideAttached: false,
      source: "none",
      infer: null,
    };
  }
  if (creatorSelectedMeditationStyle(params.meditationStyle)) {
    const guideStyle = normalizeMeditationType(params.meditationStyle ?? "");
    return {
      styleGuideStyle: null,
      guideStyle,
      guideAttached: guideStyle != null,
      source: "creator",
      infer: null,
    };
  }
  const infer = await inferMeditationStyle({
    apiKey: params.apiKey,
    modelId: params.styleInferModelId,
    transcript: params.transcript,
    usageSource: params.usageSource,
  });
  const style = infer.useGuide ? infer.style : null;
  return {
    styleGuideStyle: style,
    guideStyle: style,
    guideAttached: style != null,
    source: style ? "inferred" : "none",
    infer,
  };
}

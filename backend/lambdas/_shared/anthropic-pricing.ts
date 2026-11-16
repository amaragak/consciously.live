/**
 * Claude API billing (Messages): **input tokens** (system + full messages on each request)
 * and **output tokens** (completion). Rates are list prices for the model id we deploy.
 *
 * Verify current numbers: https://platform.claude.com/docs/en/about-claude/pricing
 * (Haiku 5.5 listed at $0.10 / $0.50 per MTok for prompts ≤100k as of Oct 2026;
 *  Sonnet 5.5 at $2 / $10.)
 */

/** Current default Haiku for new requests. */
export const CLAUDE_HAIKU_55_MODEL_ID = "claude-haiku-5-5";
/** Current default Sonnet for new requests. */
export const CLAUDE_SONNET_55_MODEL_ID = "claude-sonnet-5-5";

/**
 * @deprecated Prefer {@link CLAUDE_HAIKU_55_MODEL_ID}. Same id — kept so existing
 * imports keep requesting the current default Haiku.
 */
export const CLAUDE_HAIKU_45_MODEL_ID = CLAUDE_HAIKU_55_MODEL_ID;
/**
 * @deprecated Prefer {@link CLAUDE_SONNET_55_MODEL_ID}. Same id — kept so existing
 * imports keep requesting the current default Sonnet.
 */
export const CLAUDE_SONNET_45_MODEL_ID = CLAUDE_SONNET_55_MODEL_ID;

/** Legacy Sonnet (still active) — kept for historical usage rows / Script Lab history. */
export const CLAUDE_SONNET_46_MODEL_ID = "claude-sonnet-4-6";
/** Legacy Haiku dated snapshot — historical usage / old Script Lab stages. */
export const CLAUDE_HAIKU_45_DATED_MODEL_ID = "claude-haiku-4-5-20251001";
/** Legacy Haiku alias string as stored on older usage rows. */
export const CLAUDE_HAIKU_45_LEGACY_MODEL_ID = "claude-haiku-4-5";
/** Legacy Sonnet 4.5 (deprecated upstream) — historical usage rows only. */
export const CLAUDE_SONNET_45_LEGACY_MODEL_ID = "claude-sonnet-4-5";

export const CLAUDE_HAIKU_55_USD_PER_INPUT_TOKEN = 0.1 / 1_000_000;
export const CLAUDE_HAIKU_55_USD_PER_OUTPUT_TOKEN = 0.5 / 1_000_000;
/** @deprecated Same as current Haiku 5.5 list rates. */
export const CLAUDE_HAIKU_45_USD_PER_INPUT_TOKEN = CLAUDE_HAIKU_55_USD_PER_INPUT_TOKEN;
/** @deprecated Same as current Haiku 5.5 list rates. */
export const CLAUDE_HAIKU_45_USD_PER_OUTPUT_TOKEN = CLAUDE_HAIKU_55_USD_PER_OUTPUT_TOKEN;

/** Models the create flow may request. Unknown ids fall back to Haiku 5.5. */
export const CLAUDE_MODEL_RATES: Record<
  string,
  { usdPerInputToken: number; usdPerOutputToken: number; label: string }
> = {
  [CLAUDE_HAIKU_55_MODEL_ID]: {
    usdPerInputToken: CLAUDE_HAIKU_55_USD_PER_INPUT_TOKEN,
    usdPerOutputToken: CLAUDE_HAIKU_55_USD_PER_OUTPUT_TOKEN,
    label: "Haiku 5.5",
  },
  [CLAUDE_SONNET_55_MODEL_ID]: {
    usdPerInputToken: 2 / 1_000_000,
    usdPerOutputToken: 10 / 1_000_000,
    label: "Sonnet 5.5",
  },
  // Legacy — price historical rows correctly
  [CLAUDE_HAIKU_45_LEGACY_MODEL_ID]: {
    usdPerInputToken: 1 / 1_000_000,
    usdPerOutputToken: 5 / 1_000_000,
    label: "Haiku 4.5",
  },
  [CLAUDE_HAIKU_45_DATED_MODEL_ID]: {
    usdPerInputToken: 1 / 1_000_000,
    usdPerOutputToken: 5 / 1_000_000,
    label: "Haiku 4.5",
  },
  [CLAUDE_SONNET_45_LEGACY_MODEL_ID]: {
    usdPerInputToken: 3 / 1_000_000,
    usdPerOutputToken: 15 / 1_000_000,
    label: "Sonnet 4.5",
  },
  [CLAUDE_SONNET_46_MODEL_ID]: {
    usdPerInputToken: 3 / 1_000_000,
    usdPerOutputToken: 15 / 1_000_000,
    label: "Sonnet 4.6",
  },
};

export function isSupportedClaudeModel(model: unknown): model is string {
  return typeof model === "string" && model in CLAUDE_MODEL_RATES;
}

/** Coerces a requested model id to one we price and support. */
export function coerceClaudeModel(model: unknown): string {
  return isSupportedClaudeModel(model) ? model : CLAUDE_HAIKU_55_MODEL_ID;
}

/** Force Haiku family for word-fix (never request Sonnet even if style-infer was pointed at it). */
export function coerceHaikuModel(model: unknown): string {
  const priced = claudeModelForPricing(model);
  if (priced.includes("haiku")) return priced;
  return CLAUDE_HAIKU_55_MODEL_ID;
}

/**
 * Map a requested or API-returned model id to a rate table key.
 * Dated snapshots (e.g. claude-haiku-5-5-YYYYMMDD) resolve to the family default.
 */
export function claudeModelForPricing(model: unknown): string {
  if (isSupportedClaudeModel(model)) return model;
  const id = typeof model === "string" ? model.trim().toLowerCase() : "";
  if (!id) return CLAUDE_HAIKU_55_MODEL_ID;
  if (id.includes("sonnet-5-5") || id.includes("sonnet-4-5")) {
    return id.includes("sonnet-5-5")
      ? CLAUDE_SONNET_55_MODEL_ID
      : CLAUDE_SONNET_45_LEGACY_MODEL_ID;
  }
  if (id.includes("sonnet-4-6")) return CLAUDE_SONNET_46_MODEL_ID;
  if (id.includes("haiku-5-5")) return CLAUDE_HAIKU_55_MODEL_ID;
  if (id.includes("haiku-4-5")) return CLAUDE_HAIKU_45_LEGACY_MODEL_ID;
  if (id.includes("sonnet")) return CLAUDE_SONNET_55_MODEL_ID;
  if (id.includes("haiku")) return CLAUDE_HAIKU_55_MODEL_ID;
  return CLAUDE_HAIKU_55_MODEL_ID;
}

/** Model id from a Messages API JSON body (`model` field), if present. */
export function parseAnthropicMessageModel(jsonText: string): string | null {
  try {
    const o = JSON.parse(jsonText) as { model?: unknown };
    return typeof o.model === "string" && o.model.trim()
      ? o.model.trim()
      : null;
  } catch {
    return null;
  }
}

function isClaudeSonnet55(model: string): boolean {
  return model.trim().toLowerCase().includes("sonnet-5-5");
}

function isClaudeHaikuOrSonnet55(model: string): boolean {
  const id = model.trim().toLowerCase();
  return id.includes("haiku-5-5") || id.includes("sonnet-5-5");
}

/**
 * Match Claude 4.5 / 4.6 defaults: no adaptive / up-front thinking.
 * Haiku 5.5 and Sonnet 5.5 turn adaptive thinking on when `thinking` is omitted.
 *
 * - Haiku 5.5: `disabled`
 * - Sonnet 5.5: rejects `disabled`; `between_tools` turns off up-front thinking
 * - Older models: `disabled` keeps thinking off
 */
export function claudeThinkingOffForModel(model: string): {
  thinking: { type: "disabled" } | { type: "between_tools" };
} {
  if (isClaudeSonnet55(model)) {
    return { thinking: { type: "between_tools" } };
  }
  return { thinking: { type: "disabled" } };
}

/**
 * Merge thinking-off (+ drop 5.5-rejected sampling params) into a Messages body.
 * Preserves an explicit non-conflicting `thinking` field.
 */
export function withClaudeThinkingOff(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const model =
    typeof body.model === "string" ? body.model : CLAUDE_HAIKU_55_MODEL_ID;
  const next: Record<string, unknown> = { ...body };
  const existing = next.thinking as { type?: string } | undefined;
  if (existing == null) {
    Object.assign(next, claudeThinkingOffForModel(model));
  } else if (isClaudeSonnet55(model) && existing.type === "disabled") {
    // Sonnet 5.5 rejects `disabled`.
    next.thinking = { type: "between_tools" };
  }
  // Haiku/Sonnet 5.5 reject temperature / top_p / top_k on every request.
  if (isClaudeHaikuOrSonnet55(model)) {
    delete next.temperature;
    delete next.top_p;
    delete next.top_k;
  }
  return next;
}

export function claudeUsdFromTokens(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return 0;
  const rate =
    CLAUDE_MODEL_RATES[model] ?? CLAUDE_MODEL_RATES[CLAUDE_HAIKU_55_MODEL_ID];
  return (
    Math.max(0, inputTokens) * rate.usdPerInputToken +
    Math.max(0, outputTokens) * rate.usdPerOutputToken
  );
}

export function claudeHaiku45UsdFromTokens(
  inputTokens: number,
  outputTokens: number,
): number {
  return claudeUsdFromTokens(CLAUDE_HAIKU_55_MODEL_ID, inputTokens, outputTokens);
}

export type AnthropicMessageUsage = {
  input_tokens: number;
  /** Completion tokens billed (includes thinking when the API folds them in). */
  output_tokens: number;
  /**
   * Thinking / reasoning tokens when reported or inferred from thinking
   * content blocks. Billed at the output rate; often already counted inside
   * `output_tokens`.
   */
  thinking_tokens?: number;
  /** Tokens written into the prompt cache (billed at write rate). */
  cache_creation_input_tokens?: number;
  /** Tokens read from the prompt cache (billed at read rate). */
  cache_read_input_tokens?: number;
  /** 5-minute ephemeral cache writes (when API reports the breakdown). */
  cache_creation_5m_input_tokens?: number;
  /** 1-hour ephemeral cache writes (when API reports the breakdown). */
  cache_creation_1h_input_tokens?: number;
};

/** Parse `usage` from a non-streaming `/v1/messages` JSON body. */
export function parseAnthropicMessageUsage(
  jsonText: string,
): AnthropicMessageUsage | null {
  try {
    const o = JSON.parse(jsonText) as {
      content?: Array<{
        type?: string;
        thinking?: string;
        text?: string;
      }>;
      usage?: {
        input_tokens?: unknown;
        output_tokens?: unknown;
        thinking_tokens?: unknown;
        cache_creation_input_tokens?: unknown;
        cache_read_input_tokens?: unknown;
        cache_creation?: {
          ephemeral_5m_input_tokens?: unknown;
          ephemeral_1h_input_tokens?: unknown;
        };
      };
    };
    const u = o.usage;
    if (!u) return null;
    const it = u.input_tokens;
    const ot = u.output_tokens;
    if (typeof it !== "number" || typeof ot !== "number") return null;
    if (!Number.isFinite(it) || !Number.isFinite(ot)) return null;
    const cacheWrite =
      typeof u.cache_creation_input_tokens === "number" &&
      Number.isFinite(u.cache_creation_input_tokens)
        ? u.cache_creation_input_tokens
        : 0;
    const cacheRead =
      typeof u.cache_read_input_tokens === "number" &&
      Number.isFinite(u.cache_read_input_tokens)
        ? u.cache_read_input_tokens
        : 0;
    const c5 =
      typeof u.cache_creation?.ephemeral_5m_input_tokens === "number" &&
      Number.isFinite(u.cache_creation.ephemeral_5m_input_tokens)
        ? u.cache_creation.ephemeral_5m_input_tokens
        : 0;
    const c1h =
      typeof u.cache_creation?.ephemeral_1h_input_tokens === "number" &&
      Number.isFinite(u.cache_creation.ephemeral_1h_input_tokens)
        ? u.cache_creation.ephemeral_1h_input_tokens
        : 0;
    let thinking = 0;
    if (
      typeof u.thinking_tokens === "number" &&
      Number.isFinite(u.thinking_tokens)
    ) {
      thinking = Math.max(0, u.thinking_tokens);
    } else if (Array.isArray(o.content)) {
      // Approx when the API returns thinking blocks but no separate usage field.
      let chars = 0;
      for (const block of o.content) {
        if (block?.type === "thinking" && typeof block.thinking === "string") {
          chars += block.thinking.length;
        }
      }
      if (chars > 0) thinking = Math.max(1, Math.round(chars / 4));
    }
    return {
      input_tokens: it,
      output_tokens: ot,
      thinking_tokens: thinking,
      cache_creation_input_tokens: cacheWrite,
      cache_read_input_tokens: cacheRead,
      cache_creation_5m_input_tokens: c5,
      cache_creation_1h_input_tokens: c1h,
    };
  } catch {
    return null;
  }
}

/** Merge usage from several Claude calls (plan + sections). */
export function mergeAnthropicMessageUsage(
  parts: Array<AnthropicMessageUsage | null | undefined>,
): AnthropicMessageUsage | null {
  let any = false;
  const out: AnthropicMessageUsage = {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_5m_input_tokens: 0,
    cache_creation_1h_input_tokens: 0,
  };
  for (const u of parts) {
    if (!u) continue;
    any = true;
    out.input_tokens += u.input_tokens;
    out.output_tokens += u.output_tokens;
    out.thinking_tokens =
      (out.thinking_tokens ?? 0) + (u.thinking_tokens ?? 0);
    out.cache_creation_input_tokens =
      (out.cache_creation_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0);
    out.cache_read_input_tokens =
      (out.cache_read_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    out.cache_creation_5m_input_tokens =
      (out.cache_creation_5m_input_tokens ?? 0) +
      (u.cache_creation_5m_input_tokens ?? 0);
    out.cache_creation_1h_input_tokens =
      (out.cache_creation_1h_input_tokens ?? 0) +
      (u.cache_creation_1h_input_tokens ?? 0);
  }
  return any ? out : null;
}

/**
 * Cache write multipliers vs base input (Anthropic list pricing).
 * 5m write = 1.25×, 1h write = 2×, cache read = 0.1×.
 */
export function claudeUsdFromUsage(
  model: string,
  usage: AnthropicMessageUsage,
): number {
  const priced = claudeModelForPricing(model);
  const rate =
    CLAUDE_MODEL_RATES[priced] ?? CLAUDE_MODEL_RATES[CLAUDE_HAIKU_55_MODEL_ID];
  const baseIn = rate.usdPerInputToken;
  const out = Math.max(0, usage.output_tokens) * rate.usdPerOutputToken;
  const uncached = Math.max(0, usage.input_tokens) * baseIn;
  const read = Math.max(0, usage.cache_read_input_tokens ?? 0) * baseIn * 0.1;
  const write5 = Math.max(0, usage.cache_creation_5m_input_tokens ?? 0) * baseIn * 1.25;
  const write1h = Math.max(0, usage.cache_creation_1h_input_tokens ?? 0) * baseIn * 2;
  const writeOther = Math.max(
    0,
    (usage.cache_creation_input_tokens ?? 0) -
      (usage.cache_creation_5m_input_tokens ?? 0) -
      (usage.cache_creation_1h_input_tokens ?? 0),
  );
  // When the API omits the 5m/1h split, treat remaining writes as 5m (1.25×).
  const writeFallback = writeOther * baseIn * 1.25;
  return uncached + read + write5 + write1h + writeFallback + out;
}

/** Lowest effort for Sonnet 5.5 section / fix writes. */
export function withClaudeEffortLow(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const model =
    typeof body.model === "string" ? body.model : CLAUDE_HAIKU_55_MODEL_ID;
  if (!isClaudeSonnet55(model)) return body;
  const existing = body.output_config as { effort?: string } | undefined;
  return {
    ...body,
    output_config: {
      ...(existing && typeof existing === "object" ? existing : {}),
      effort: "low",
    },
  };
}

const COUNT_TOKENS_URL = "https://api.anthropic.com/v1/messages/count_tokens";

/**
 * Official input-token count for a Messages-shaped payload (no completion).
 * Free; does not spend model tokens.
 */
export async function anthropicCountMessageInputTokens(params: {
  apiKey: string;
  model: string;
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<number | null> {
  const res = await fetch(COUNT_TOKENS_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: params.model,
      ...(params.system ? { system: params.system } : {}),
      messages: params.messages,
    }),
  });
  const text = await res.text();
  if (!res.ok) return null;
  try {
    const o = JSON.parse(text) as { input_tokens?: unknown };
    if (typeof o.input_tokens !== "number" || !Number.isFinite(o.input_tokens)) {
      return null;
    }
    return o.input_tokens;
  } catch {
    return null;
  }
}

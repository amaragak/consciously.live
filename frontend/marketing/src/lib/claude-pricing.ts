/**
 * Claude Messages API: billed per **input token** (system + messages on each request)
 * and **output token** (assistant completion). Align with `backend/lambdas/_shared/anthropic-pricing.ts`.
 *
 * @see https://platform.claude.com/docs/en/about-claude/pricing
 */

export const CLAUDE_HAIKU_55_MODEL_ID = "claude-haiku-5-5";
export const CLAUDE_SONNET_55_MODEL_ID = "claude-sonnet-5-5";

/** @deprecated Prefer {@link CLAUDE_HAIKU_55_MODEL_ID}. Same id. */
export const CLAUDE_HAIKU_45_MODEL_ID = CLAUDE_HAIKU_55_MODEL_ID;
/** @deprecated Prefer {@link CLAUDE_SONNET_55_MODEL_ID}. Same id. */
export const CLAUDE_SONNET_45_MODEL_ID = CLAUDE_SONNET_55_MODEL_ID;

/** Script Lab pipeline stages. */
export const SCRIPT_LAB_SONNET_MODEL = CLAUDE_SONNET_55_MODEL_ID;
export const SCRIPT_LAB_HAIKU_MODEL = CLAUDE_HAIKU_55_MODEL_ID;

export const CLAUDE_HAIKU_55_USD_PER_INPUT_TOKEN = 0.1 / 1_000_000;
export const CLAUDE_HAIKU_55_USD_PER_OUTPUT_TOKEN = 0.5 / 1_000_000;
/** @deprecated Same as current Haiku 5.5 list rates. */
export const CLAUDE_HAIKU_45_USD_PER_INPUT_TOKEN = CLAUDE_HAIKU_55_USD_PER_INPUT_TOKEN;
/** @deprecated Same as current Haiku 5.5 list rates. */
export const CLAUDE_HAIKU_45_USD_PER_OUTPUT_TOKEN =
  CLAUDE_HAIKU_55_USD_PER_OUTPUT_TOKEN;

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
  "claude-haiku-4-5": {
    usdPerInputToken: 1 / 1_000_000,
    usdPerOutputToken: 5 / 1_000_000,
    label: "Haiku 4.5",
  },
  "claude-haiku-4-5-20251001": {
    usdPerInputToken: 1 / 1_000_000,
    usdPerOutputToken: 5 / 1_000_000,
    label: "Haiku 4.5",
  },
  "claude-sonnet-4-5": {
    usdPerInputToken: 3 / 1_000_000,
    usdPerOutputToken: 15 / 1_000_000,
    label: "Sonnet 4.5",
  },
  "claude-sonnet-4-6": {
    usdPerInputToken: 3 / 1_000_000,
    usdPerOutputToken: 15 / 1_000_000,
    label: "Sonnet 4.6",
  },
};

export function claudeModelLabel(model: string | null | undefined): string {
  if (!model) return "Claude";
  return CLAUDE_MODEL_RATES[model]?.label ?? model;
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
 * Keep in sync with `backend/lambdas/_shared/anthropic-pricing.ts`.
 */
export function claudeThinkingOffForModel(model: string): {
  thinking: { type: "disabled" } | { type: "between_tools" };
} {
  if (isClaudeSonnet55(model)) {
    return { thinking: { type: "between_tools" } };
  }
  return { thinking: { type: "disabled" } };
}

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
    next.thinking = { type: "between_tools" };
  }
  if (isClaudeHaikuOrSonnet55(model)) {
    delete next.temperature;
    delete next.top_p;
    delete next.top_k;
  }
  return next;
}

/** Per-million rates for display, e.g. "$0.10 / $0.50 per MTok". */
export function claudeRatesPerMillion(model: string | null | undefined): {
  input: number;
  output: number;
} {
  const rate =
    (model ? CLAUDE_MODEL_RATES[model] : undefined) ??
    CLAUDE_MODEL_RATES[CLAUDE_HAIKU_55_MODEL_ID];
  return {
    input: rate.usdPerInputToken * 1_000_000,
    output: rate.usdPerOutputToken * 1_000_000,
  };
}

export function claudeUsdFromTokens(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
): number {
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return 0;
  const rate =
    (model ? CLAUDE_MODEL_RATES[model] : undefined) ??
    CLAUDE_MODEL_RATES[CLAUDE_HAIKU_55_MODEL_ID];
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

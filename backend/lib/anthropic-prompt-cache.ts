/**
 * Anthropic Messages helpers for prompt caching.
 *
 * Uses:
 * - Explicit `cache_control` on the system text block (stable instructions)
 * - Top-level `cache_control` so multi-turn conversation prefixes cache automatically
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 */

export type AnthropicCacheControl = {
  type: "ephemeral";
  ttl?: "5m" | "1h";
};

export type AnthropicSystemTextBlock = {
  type: "text";
  text: string;
  cache_control?: AnthropicCacheControl;
};

export type AnthropicChatTurn = {
  role: "user" | "assistant";
  content: string;
};

/** Default ephemeral cache (5m TTL, refreshed on hits). */
export const ANTHROPIC_EPHEMERAL_CACHE: AnthropicCacheControl = {
  type: "ephemeral",
};

/**
 * Build a Messages API body with prompt caching enabled for a multi-turn chat.
 * System instructions are an explicit cache breakpoint; top-level cache_control
 * advances the breakpoint as the conversation grows.
 */
export function buildCachedMessagesRequestBody(params: {
  model: string;
  system: string;
  /** Uncached add-on (e.g. life-area snapshot). Base `system` stays cacheable. */
  systemSupplement?: string;
  messages: AnthropicChatTurn[];
  maxTokens: number;
  stream?: boolean;
  /** Override TTL for both breakpoints (default 5m). */
  cacheTtl?: "5m" | "1h";
}): Record<string, unknown> {
  const cache: AnthropicCacheControl = params.cacheTtl
    ? { type: "ephemeral", ttl: params.cacheTtl }
    : ANTHROPIC_EPHEMERAL_CACHE;

  const system: AnthropicSystemTextBlock[] = [
    {
      type: "text",
      text: params.system,
      cache_control: cache,
    },
  ];
  const supplement = params.systemSupplement?.trim();
  if (supplement) {
    system.push({
      type: "text",
      text: supplement.slice(0, 48_000),
    });
  }

  return {
    model: params.model,
    max_tokens: params.maxTokens,
    stream: params.stream !== false,
    // Automatic caching for growing message history (multi-turn).
    cache_control: cache,
    system,
    messages: params.messages,
  };
}

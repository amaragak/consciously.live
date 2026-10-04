/**
 * Client / Next-route mirror of `backend/lib/anthropic-prompt-cache.ts`.
 * Keep in sync — used when `/api/assistant-chat` calls Anthropic directly.
 */

export type AnthropicCacheControl = {
  type: "ephemeral";
  ttl?: "5m" | "1h";
};

export const ANTHROPIC_EPHEMERAL_CACHE: AnthropicCacheControl = {
  type: "ephemeral",
};

export function buildCachedMessagesRequestBody(params: {
  model: string;
  system: string;
  /** Stable extra system block also cached (must stay identical for hits). */
  systemCachedExtra?: string;
  /** Uncached add-on (e.g. life-area snapshot / Start overrides). */
  systemSupplement?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  stream?: boolean;
  cacheTtl?: "5m" | "1h";
}): Record<string, unknown> {
  const cache: AnthropicCacheControl = params.cacheTtl
    ? { type: "ephemeral", ttl: params.cacheTtl }
    : ANTHROPIC_EPHEMERAL_CACHE;

  const system: Array<{
    type: "text";
    text: string;
    cache_control?: AnthropicCacheControl;
  }> = [
    {
      type: "text",
      text: params.system,
      cache_control: cache,
    },
  ];
  const cachedExtra = params.systemCachedExtra?.trim();
  if (cachedExtra) {
    system.push({
      type: "text",
      text: cachedExtra.slice(0, 48_000),
      cache_control: cache,
    });
  }
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
    cache_control: cache,
    system,
    messages: params.messages,
  };
}

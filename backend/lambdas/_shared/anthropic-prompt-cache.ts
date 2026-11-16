/**
 * Anthropic Messages helpers for prompt caching.
 *
 * Uses:
 * - Explicit `cache_control` on the system text block (stable instructions)
 * - Top-level `cache_control` so multi-turn conversation prefixes cache automatically
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 */
import { withClaudeThinkingOff } from "./anthropic-pricing";

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
  /**
   * Stable extra system block also cached (e.g. Create Start → Shape initial
   * context). Must stay byte-identical across turns for cache hits.
   */
  systemCachedExtra?: string;
  /** Uncached add-on (e.g. Start edits after returning, life-area snapshot). */
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

  return withClaudeThinkingOff({
    model: params.model,
    max_tokens: params.maxTokens,
    stream: params.stream !== false,
    // Automatic caching for growing message history (multi-turn).
    cache_control: cache,
    system,
    messages: params.messages,
  });
}

/**
 * Script generation cache layout:
 *
 * **Checkpoint 1 (system, 5m):** rules + delivery + style guide + brief/chat.
 *   Plan call writes it; every later call of that meditation reads it.
 *
 * **Checkpoint 2 (user block, 5m, section writes only):** plan JSON + shared
 *   section-writing rules. First section call writes it; remaining sections
 *   start after it finishes and read it.
 *
 * **Uncached:** plan task, or the short per-section task only.
 */
export function buildScriptGenerationCachedBody(params: {
  model: string;
  maxTokens: number;
  /** System rules + delivery + style guide. */
  systemStable: string;
  /** Brief / chat — shared across section calls for one meditation. */
  meditationContext: string;
  /**
   * Section path: plan JSON + shared section rules — cached as checkpoint 2.
   * Plan / single: leave empty (nothing after checkpoint 1 except the task).
   */
  meditationContextExtra?: string;
  /**
   * When true (section writes), cache `meditationContextExtra` as checkpoint 2.
   * When false/omit, extra is folded into the uncached task (legacy / unused).
   */
  cacheExtra?: boolean;
  /**
   * When true, omit `cache_control` on the system block (one-shot callers like
   * time-based that never read the cache — avoid paying the 1.25× write).
   */
  noCache?: boolean;
  /** Call-specific instruction (plan / write section / single script). */
  taskContent: string;
  /**
   * When true, attach `output_config.effort: "low"` (section / fix).
   * Prefer `effort` when setting medium/high; `effort` wins if both set.
   */
  effortLow?: boolean;
  /** Explicit effort for Sonnet adaptive thinking (time-based uses medium). */
  effort?: "low" | "medium" | "high";
}): Record<string, unknown> {
  const cache5m: AnthropicCacheControl = { type: "ephemeral", ttl: "5m" };
  const noCache = params.noCache === true;

  // --- Prior layouts (kept for reference) ---
  // Dual system+context breakpoints with plan also cached (raced on parallel).
  // Then: one system checkpoint; plan+task fully uncached on every section.
  // --- end prior ---

  const sharedPrefix = [params.systemStable.trim(), params.meditationContext.trim()]
    .filter(Boolean)
    .join("\n\n");

  const extra = params.meditationContextExtra?.trim() || "";
  const task = params.taskContent.trim() || "(no task)";
  const cacheExtra = params.cacheExtra === true && extra.length > 0;

  let messages: Array<{ role: "user"; content: unknown }>;
  if (cacheExtra && !noCache) {
    // Checkpoint 2: plan + shared section rules (identical on every section).
    messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: extra,
            cache_control: cache5m,
          },
          {
            type: "text",
            text: task,
          },
        ],
      },
    ];
  } else {
    // Plan / single / noCache: entire user message uncached.
    const uncachedTail = [extra, task].filter(Boolean).join("\n\n");
    messages = [
      {
        role: "user",
        content: uncachedTail,
      },
    ];
  }

  const systemBlock: AnthropicSystemTextBlock = noCache
    ? { type: "text", text: sharedPrefix }
    : { type: "text", text: sharedPrefix, cache_control: cache5m };

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens,
    system: [systemBlock],
    messages,
  };
  const effort =
    params.effort ?? (params.effortLow ? ("low" as const) : undefined);
  if (effort) {
    body.output_config = { effort };
  }
  return withClaudeThinkingOff(body);
}

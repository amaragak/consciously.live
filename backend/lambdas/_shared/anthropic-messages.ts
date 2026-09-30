/**
 * Central Anthropic Messages client — every Claude call should go through here
 * so usage is metered into the AI usage ledger.
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { coerceClaudeModel } from "./anthropic-pricing";
import { recordClaudeUsage } from "./ai-usage";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const secrets = new SecretsManagerClient({});
let cachedClaudeKey: string | undefined;

export async function getClaudeApiKey(): Promise<string> {
  if (cachedClaudeKey) return cachedClaudeKey;
  const inline = process.env.CLAUDE_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  if (inline) {
    cachedClaudeKey = inline;
    return cachedClaudeKey;
  }
  const arn = process.env.CLAUDE_SECRET_ARN?.trim();
  if (!arn) throw new Error("CLAUDE_SECRET_ARN is not set");
  const out = await secrets.send(new GetSecretValueCommand({ SecretId: arn }));
  const s = out.SecretString?.trim();
  if (!s) throw new Error("Claude API key secret is empty");
  cachedClaudeKey = s;
  return cachedClaudeKey;
}

export type AnthropicMessageContent =
  | string
  | Array<Record<string, unknown>>;

export type CallAnthropicMessagesParams = {
  /** App feature tag for the usage ledger. */
  feature: string;
  model?: string;
  maxTokens: number;
  temperature?: number;
  system?: string | Array<Record<string, unknown>>;
  messages: Array<{ role: "user" | "assistant"; content: AnthropicMessageContent }>;
  apiKey?: string;
  userId?: string | null;
  /** Extra Anthropic request fields (tools, thinking, etc.). */
  extra?: Record<string, unknown>;
};

export type CallAnthropicMessagesResult = {
  ok: boolean;
  status: number;
  rawText: string;
  text: string;
  usage: { input_tokens: number; output_tokens: number } | null;
  model: string;
};

function extractText(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return (parsed.content ?? [])
      .filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text!.trim())
      .join("\n")
      .trim();
  } catch {
    return "";
  }
}

function extractUsage(
  rawText: string,
): { input_tokens: number; output_tokens: number } | null {
  try {
    const o = JSON.parse(rawText) as {
      usage?: { input_tokens?: unknown; output_tokens?: unknown };
    };
    const inn = o.usage?.input_tokens;
    const out = o.usage?.output_tokens;
    if (typeof inn !== "number" || typeof out !== "number") return null;
    if (!Number.isFinite(inn) || !Number.isFinite(out)) return null;
    return { input_tokens: inn, output_tokens: out };
  } catch {
    return null;
  }
}

/**
 * POST /v1/messages and record usage on success.
 */
export async function callAnthropicMessages(
  params: CallAnthropicMessagesParams,
): Promise<CallAnthropicMessagesResult> {
  const model = coerceClaudeModel(params.model);
  const apiKey = params.apiKey ?? (await getClaudeApiKey());
  const body: Record<string, unknown> = {
    model,
    max_tokens: params.maxTokens,
    messages: params.messages,
    ...(params.system != null ? { system: params.system } : {}),
    ...(typeof params.temperature === "number"
      ? { temperature: params.temperature }
      : {}),
    ...(params.extra ?? {}),
  };

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const rawText = await res.text();
  const usage = extractUsage(rawText);
  if (res.ok && usage) {
    await recordClaudeUsage({
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      feature: params.feature,
      userId: params.userId,
    });
  }
  return {
    ok: res.ok,
    status: res.status,
    rawText,
    text: extractText(rawText),
    usage,
    model,
  };
}

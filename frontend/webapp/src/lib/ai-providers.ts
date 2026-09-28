/** Who processes AI data — keep in sync with real call sites. */

export type AiProviderInfo = {
  id: string;
  name: string;
  summary: string;
};

export const AI_PROVIDERS: readonly AiProviderInfo[] = [
  {
    id: "anthropic",
    name: "Anthropic (Claude)",
    summary:
      "Writes your meditation scripts, Chat replies and weekly insights.",
  },
  {
    id: "fish",
    name: "Fish Audio",
    summary:
      "Turns meditation scripts into voice. Receives the script only, never your journal.",
  },
] as const;

/**
 * Config flag for the "never used to train" claim + privacy policy link.
 * Off until legal confirms the copy.
 */
export const SHOW_AI_TRAINING_CLAIM = false;

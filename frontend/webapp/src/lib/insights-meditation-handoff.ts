import { createMeditationHref } from "@/lib/create-meditation-path";
import { patchCreateSession } from "@/lib/create-session-storage";

/** Session key so Create → from-prompt can prefill when no create session exists yet. */
export const INSIGHTS_MEDITATION_PROMPT_KEY = "mm_insights_meditation_prompt_v1";

export function writeInsightsMeditationPrompt(prompt: string): void {
  if (typeof window === "undefined") return;
  const trimmed = prompt.trim();
  if (!trimmed) {
    try {
      sessionStorage.removeItem(INSIGHTS_MEDITATION_PROMPT_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    sessionStorage.setItem(INSIGHTS_MEDITATION_PROMPT_KEY, trimmed);
  } catch {
    /* ignore */
  }
  patchCreateSession({
    oneShotPrompt: trimmed,
    pendingModeChoice: "oneShot",
    creationPath: "oneShot",
    phase: "promptPick",
  });
}

export function consumeInsightsMeditationPrompt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(INSIGHTS_MEDITATION_PROMPT_KEY);
    if (raw != null) sessionStorage.removeItem(INSIGHTS_MEDITATION_PROMPT_KEY);
    const trimmed = raw?.trim() ?? "";
    return trimmed || null;
  } catch {
    return null;
  }
}

export function insightsCreateMeditationHref(): string {
  return createMeditationHref({ path: "oneShot" });
}

export function buildInsightsMeditationPrompt(params: {
  letterPlain?: string;
  emotions?: Array<{ name: string; score: number }>;
  weekLabel: string;
  wins?: string[];
  thought?: string;
}): string {
  const top = (params.emotions ?? [])
    .slice(0, 2)
    .map((e) => e.name.trim())
    .filter(Boolean);
  const emotionBit =
    top.length === 0
      ? ""
      : top.length === 1
        ? ` Focus on easing into ${top[0].toLowerCase()}.`
        : ` Focus on easing ${top[0].toLowerCase()} and trusting ${top[1].toLowerCase()}.`;
  const excerpt = (params.letterPlain ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 480);
  const thought = params.thought?.trim().replace(/\s+/g, " ");
  const wins = (params.wins ?? [])
    .map((w) => w.trim())
    .filter(Boolean)
    .slice(0, 3);
  const fromLetter = excerpt ? `\n\nFrom my letter:\n${excerpt}` : "";
  const fromThought = thought
    ? `\n\nA thought that keeps coming back: "${thought}".`
    : "";
  const fromWins =
    wins.length > 0
      ? `\n\nWins from this week: ${wins.join("; ")}.`
      : "";
  return [
    `A gentle guided meditation shaped by my weekly journal insights (${params.weekLabel}).`,
    emotionBit.trim(),
    fromLetter,
    fromThought,
    fromWins,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+\n/g, "\n")
    .trim();
}

/** Prefill Create for a recurring thought from Insights. */
export function buildRecurringThoughtMeditationPrompt(params: {
  thought: string;
  weekLabel: string;
}): string {
  const thought = params.thought.trim().replace(/\s+/g, " ");
  return [
    `A gentle guided meditation to ease the thought "${thought}" that keeps coming back (${params.weekLabel}).`,
    "Help me hold it lightly, breathe space around it, and remember I don't have to believe every story my mind repeats.",
  ].join(" ");
}

import { localDateKey } from "@/lib/journal-storage";

/** Journal chips. A chip opens a new entry with this line as the title. */
export const JOURNAL_OVERVIEW_PROMPTS = [
  "What's weighing on you?",
  "What went well today?",
  "What are you avoiding?",
  "What do you need to say out loud?",
  "Where did your mind go today?",
  "What would make tomorrow easier?",
  "What are you grateful you got through?",
  "What's one thing you keep replaying?",
  "What felt heavier than it needed to?",
  "Who were you with, and how did that feel?",
  "What did your body notice?",
  "What are you hoping for this week?",
  "What would you tell a friend in your place?",
  "What's unfinished from yesterday?",
  "What surprised you today?",
  "What do you want to let go of?",
  "What's one small win?",
  "What are you protecting yourself from?",
] as const;

/** Meditate chips. A chip opens Create with this line as the brief. */
export const MEDITATE_OVERVIEW_PROMPTS = [
  "Calm before my big pitch",
  "Confidence for launch day",
  "Deeper sleep",
  "A quiet ten minutes before the day starts",
  "Let the shoulders drop",
  "Come back after a hard conversation",
  "Steady nerves before you speak",
  "Sleep when the mind won't stop",
  "A short reset between meetings",
  "Kindness toward yourself today",
  "Grounded before a difficult talk",
  "Ease into the evening",
  "Focus for one important task",
  "Release the day before bed",
  "Courage for a conversation you've been putting off",
  "Soft attention when you feel scattered",
  "A pause when everything feels loud",
  "Warmth after a long day",
] as const;

/** Three prompts, stable for the local calendar day. */
export function promptsForDay(
  pool: readonly string[],
  count = 3,
  dayKey = localDateKey(),
): string[] {
  const ranked = pool.map((prompt, index) => {
    let hash = 2166136261;
    const key = `${dayKey}:${index}`;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return { prompt, hash: hash >>> 0 };
  });
  ranked.sort((a, b) => a.hash - b.hash || a.prompt.localeCompare(b.prompt));
  return ranked.slice(0, count).map((row) => row.prompt);
}

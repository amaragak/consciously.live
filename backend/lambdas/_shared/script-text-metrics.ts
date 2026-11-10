/** Spoken-word and syllable metrics for script duration budgeting. */

export type TextContentMetrics = {
  wordCount: number;
  syllableCount: number;
};

const WORD_RE = /[a-z0-9']+/gi;

/** Spoken words, punctuation-insensitive. Hyphenated forms count as separate words. */
export function spokenWords(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

/** Count spoken words in prose (punctuation-insensitive). */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return spokenWords(trimmed).length;
}

/**
 * Approximate English syllable count (consistent heuristic, not phonetic).
 * Based on vowel-group counting with common silent-ending adjustments.
 */
export function estimateSyllableCount(text: string): number {
  const words = (text.toLowerCase().match(WORD_RE) ?? []).map((w) =>
    w.replace(/[^a-z0-9']/g, ""),
  );
  let total = 0;
  for (const word of words) {
    if (!word) continue;
    total += syllablesInWord(word);
  }
  return total;
}

function syllablesInWord(word: string): number {
  if (word.length <= 3) return 1;

  let w = word;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  w = w.replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return groups && groups.length > 0 ? groups.length : 1;
}

export function textContentMetrics(text: string): TextContentMetrics {
  return {
    wordCount: countWords(text),
    syllableCount: estimateSyllableCount(text),
  };
}

export function averageTextMetrics(
  samples: TextContentMetrics[],
): TextContentMetrics | null {
  if (samples.length === 0) return null;
  const wordCount =
    samples.reduce((sum, s) => sum + s.wordCount, 0) / samples.length;
  const syllableCount =
    samples.reduce((sum, s) => sum + s.syllableCount, 0) / samples.length;
  return {
    wordCount: Math.round(wordCount * 10) / 10,
    syllableCount: Math.round(syllableCount * 10) / 10,
  };
}

/** Drop trailing sentences until the spoken script is within the word cap. */
export function trimScriptToWordCap(script: string, maxWords: number): string {
  if (maxWords <= 0 || countWords(script) <= maxWords) return script;
  const parts = script.split(/(?<=[.!?])\s+/);
  while (parts.length > 1 && countWords(parts.join(" ")) > maxWords) {
    parts.pop();
  }
  const joined = parts.join(" ").trim();
  return countWords(joined) > 0 ? joined : script;
}

/** Active speech seconds from word count at wpm × speechSpeed. */
export function speechSecondsFromWordCount(
  wordCount: number,
  speechSpeed: number,
  wpmActive = 140,
): number {
  const speed = speechSpeed > 0 ? speechSpeed : 1;
  const wpm = wpmActive * speed;
  if (wordCount <= 0 || wpm <= 0) return 0;
  return (wordCount / wpm) * 60;
}

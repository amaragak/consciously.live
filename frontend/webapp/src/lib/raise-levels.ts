/**
 * Per-level raise suggestions. Each level is its own rewrite of the same span.
 * Empty strings on every level mean "delete this span", which is the same at
 * every level on purpose.
 */

export type RaiseLevel = "ambitious" | "audacious" | "delusional";

export type RaiseSuggestions = Record<RaiseLevel, string>;

export const RAISE_LEVELS: RaiseLevel[] = [
  "ambitious",
  "audacious",
  "delusional",
];

export function blankCopiedRaiseLevels(s: RaiseSuggestions): RaiseSuggestions {
  const ambitious = s.ambitious.trim();
  const audacious = s.audacious.trim();
  const delusional = s.delusional.trim();
  if (!ambitious && !audacious && !delusional) {
    return { ambitious: "", audacious: "", delusional: "" };
  }
  const nextAudacious = audacious && audacious !== ambitious ? audacious : "";
  const nextDelusional =
    delusional && delusional !== ambitious && delusional !== nextAudacious
      ? delusional
      : "";
  return {
    ambitious,
    audacious: nextAudacious,
    delusional: nextDelusional,
  };
}

export function suggestionsDiffer(s: RaiseSuggestions): boolean {
  const ambitious = s.ambitious.trim();
  const audacious = s.audacious.trim();
  const delusional = s.delusional.trim();
  if (!ambitious && !audacious && !delusional) return true;
  return Boolean(ambitious) && ambitious !== audacious && audacious !== delusional && ambitious !== delusional;
}

type OfflineHit = {
  start: number;
  end: number;
  quote: string;
  type: "hedging" | "future" | "small" | "settling" | "doubt" | "negative";
  suggestions: RaiseSuggestions;
};

const OFFLINE_PATTERNS: Array<{
  re: RegExp;
  type: OfflineHit["type"];
  suggestions: RaiseSuggestions;
}> = [
  {
    re: /\bI think\b/i,
    type: "hedging",
    suggestions: {
      ambitious: "I know",
      audacious: "I know for certain",
      delusional: "I have always known",
    },
  },
  {
    re: /\bI hope\b/i,
    type: "hedging",
    suggestions: {
      ambitious: "I have",
      audacious: "I already have",
      delusional: "I have more than I ever pictured",
    },
  },
  {
    re: /\bmaybe\b/i,
    type: "hedging",
    suggestions: {
      ambitious: "definitely",
      audacious: "without question",
      delusional: "as a matter of record",
    },
  },
  {
    re: /\btry to\b/i,
    type: "hedging",
    suggestions: {
      ambitious: "do",
      audacious: "do with ease",
      delusional: "do at a level few people reach",
    },
  },
  {
    re: /\bsomeday\b/i,
    type: "future",
    suggestions: {
      ambitious: "now",
      audacious: "every day",
      delusional: "as the defining fact of my life",
    },
  },
  {
    re: /\bI will\b/i,
    type: "future",
    suggestions: {
      ambitious: "I",
      audacious: "I already",
      delusional: "I am known for how I",
    },
  },
  {
    re: /\bI'm going to\b/i,
    type: "future",
    suggestions: {
      ambitious: "I",
      audacious: "I already",
      delusional: "I am famous for how I",
    },
  },
  {
    re: /\blike me\b/i,
    type: "small",
    suggestions: {
      ambitious: "love me",
      audacious: "adore me",
      delusional: "feel changed by knowing me",
    },
  },
  {
    re: /\blikes me\b/i,
    type: "small",
    suggestions: {
      ambitious: "loves me",
      audacious: "adores me",
      delusional: "feels changed by knowing me",
    },
  },
  {
    re: /\blike them\b/i,
    type: "small",
    suggestions: {
      ambitious: "love them",
      audacious: "adore them",
      delusional: "feel changed by them",
    },
  },
  {
    re: /\blike him\b/i,
    type: "small",
    suggestions: {
      ambitious: "love him",
      audacious: "adore him",
      delusional: "feel changed by him",
    },
  },
  {
    re: /\blike her\b/i,
    type: "small",
    suggestions: {
      ambitious: "love her",
      audacious: "adore her",
      delusional: "feel changed by her",
    },
  },
  {
    re: /\bI like\b/i,
    type: "small",
    suggestions: {
      ambitious: "I love",
      audacious: "I adore",
      delusional: "I am devoted to",
    },
  },
  {
    re: /\s+again\b/i,
    type: "doubt",
    suggestions: { ambitious: "", audacious: "", delusional: "" },
  },
  {
    re: /\s+finally\b/i,
    type: "doubt",
    suggestions: { ambitious: "", audacious: "", delusional: "" },
  },
  {
    re: /\s+this time\b/i,
    type: "doubt",
    suggestions: { ambitious: "", audacious: "", delusional: "" },
  },
];

/** Local hedge hits. Each rewrite level is a different string, except deletions. */
export function offlineRaiseSpans(text: string): OfflineHit[] {
  const hits: OfflineHit[] = [];
  for (const pattern of OFFLINE_PATTERNS) {
    if (hits.length >= 8) break;
    const match = pattern.re.exec(text);
    if (!match || match.index == null) continue;
    const quote = match[0];
    const start = match.index;
    const end = start + quote.length;
    if (hits.some((hit) => !(end <= hit.start || start >= hit.end))) continue;
    hits.push({
      start,
      end,
      quote,
      type: pattern.type,
      suggestions: pattern.suggestions,
    });
  }
  return hits;
}

/** Three suggestion lists for one input. Used by the level test and the offline raise. */
export function offlineRaiseLevelSets(
  text: string,
): Record<RaiseLevel, string[]> {
  const hits = offlineRaiseSpans(text);
  return {
    ambitious: hits.map((hit) => hit.suggestions.ambitious),
    audacious: hits.map((hit) => hit.suggestions.audacious),
    delusional: hits.map((hit) => hit.suggestions.delusional),
  };
}

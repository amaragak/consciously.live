/**
 * Heuristic talk analysis for onboarding coverage bars + structured extract.
 * Offline-first; no network required.
 */

import {
  COVERAGE_MARK,
  type OnboardingTalkCoverageKey,
} from "@/lib/onboarding-state";

export type TalkScores = Record<OnboardingTalkCoverageKey, number>;

export type ExtractedArea = {
  title: string;
  dream: string;
  goal: string;
};

export type TalkExtract = {
  areas: ExtractedArea[];
  values: string[];
  blockers: string[];
  healHints: string[];
  scores: TalkScores;
};

const GOAL_WORDS =
  /\b(want|goal|dream|hope|build|grow|become|achieve|ambition|plan|create|start|finish|move|career|family|health|relationship|money|business|home|travel|write|learn|launch)\b/i;
const VALUE_WORDS =
  /\b(matter|value|important|care|love|honesty|freedom|family|health|kindness|integrity|faith|peace|courage|loyalty|respect|connection|presence)\b/i;
const BLOCKER_WORDS =
  /\b(block|stuck|hard|afraid|fear|doubt|procrastinat|overwhelm|anxiety|money|time|habit|people|can't|cannot|won't|stop|holding|obstacle|resistance|in the way)\b/i;
const HEAL_WORDS =
  /\b(hurt|grief|heartbreak|regret|resent|trauma|pain|loss|mourning|healing|wound)\b/i;

const AREA_HINTS: { re: RegExp; title: string }[] = [
  { re: /\b(career|work|job|business|company)\b/i, title: "Career" },
  { re: /\b(health|fitness|body|energy|sleep)\b/i, title: "Health" },
  {
    re: /\b(family|kids|children|partner|marriage|relationship)\b/i,
    title: "Relationships",
  },
  { re: /\b(money|finance|wealth|saving|debt)\b/i, title: "Money" },
  { re: /\b(home|house|apartment|move)\b/i, title: "Home" },
  { re: /\b(creativ|art|music|write|writing|book)\b/i, title: "Creativity" },
  { re: /\b(spirit|faith|meditat|mindful)\b/i, title: "Inner life" },
  { re: /\b(friend|community|social)\b/i, title: "Community" },
];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function scoreBucket(text: string, re: RegExp): number {
  const t = text.trim();
  if (!t) return 0;
  const words = t.split(/\s+/).filter(Boolean).length;
  const hits = (t.match(new RegExp(re.source, "gi")) ?? []).length;
  if (hits === 0 && words < 8) return 0;
  if (hits === 0) return words >= 40 ? 0.15 : 0.05;
  const density = hits / Math.max(8, words / 12);
  return clamp01(0.25 + density * 0.45 + Math.min(0.3, words / 120));
}

export function scoreTalkCoverage(text: string): TalkScores {
  const t = text.trim();
  if (!t) return { goals: 0, values: 0, blockers: 0 };
  return {
    goals: scoreBucket(t, GOAL_WORDS),
    values: scoreBucket(t, VALUE_WORDS),
    blockers: scoreBucket(t, BLOCKER_WORDS),
  };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8);
}

function titleCaseArea(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "Life";
  return t.charAt(0).toUpperCase() + t.slice(1).slice(0, 47);
}

function pickLines(text: string, re: RegExp, max: number): string[] {
  const out: string[] = [];
  for (const s of splitSentences(text)) {
    if (!re.test(s)) continue;
    const clean = s.replace(/^[-•*\d.)\s]+/, "").trim();
    if (clean.length < 4) continue;
    if (out.some((x) => x.toLowerCase() === clean.toLowerCase())) continue;
    out.push(clean.slice(0, 160));
    if (out.length >= max) break;
  }
  return out;
}

export function extractFromTalk(text: string): TalkExtract {
  const t = text.trim();
  const scores = scoreTalkCoverage(t);
  if (!t) {
    return { areas: [], values: [], blockers: [], healHints: [], scores };
  }

  const areas: ExtractedArea[] = [];
  for (const hint of AREA_HINTS) {
    if (!hint.re.test(t)) continue;
    const sentences = splitSentences(t).filter((s) => hint.re.test(s));
    const dream =
      sentences.find((s) => GOAL_WORDS.test(s)) ??
      sentences[0] ??
      `A fuller ${hint.title.toLowerCase()}.`;
    const goal =
      sentences.find((s) => /\b(want|will|plan|start|build)\b/i.test(s)) ??
      dream;
    areas.push({
      title: hint.title,
      dream: dream.slice(0, 280),
      goal: goal.slice(0, 120),
    });
    if (areas.length >= 3) break;
  }

  if (areas.length === 0) {
    const first = splitSentences(t)[0] ?? t.slice(0, 120);
    areas.push({
      title: "The life I want",
      dream: first.slice(0, 280),
      goal: "Take one clear next step this week",
    });
  }

  let values = pickLines(t, VALUE_WORDS, 5).map((s) => {
    const m = s.match(
      /\b(honesty|freedom|family|health|kindness|integrity|faith|peace|courage|loyalty|respect|connection|presence|love)\b/i,
    );
    if (m) return titleCaseArea(m[1]!);
    return s.length > 48 ? `${s.slice(0, 45)}…` : s;
  });
  if (values.length === 0 && scores.values >= 0.2) {
    values = ["Presence", "Honesty"];
  }

  const blockers = pickLines(t, BLOCKER_WORDS, 4);
  const healHints = pickLines(t, HEAL_WORDS, 3);

  return { areas, values, blockers, healHints, scores };
}

export function shortBars(
  scores: TalkScores,
): OnboardingTalkCoverageKey[] {
  const order: OnboardingTalkCoverageKey[] = ["blockers", "values", "goals"];
  return order.filter((k) => scores[k] < COVERAGE_MARK);
}

export function coverageSummaryLine(scores: TalkScores): string {
  const parts: string[] = [];
  const label = (k: OnboardingTalkCoverageKey) =>
    k === "goals" ? "goals" : k === "values" ? "values" : "what gets in the way";

  const covered = (["goals", "values", "blockers"] as const).filter(
    (k) => scores[k] >= COVERAGE_MARK,
  );
  const little = (["goals", "values", "blockers"] as const).filter(
    (k) => scores[k] >= 0.2 && scores[k] < COVERAGE_MARK,
  );
  const none = (["goals", "values", "blockers"] as const).filter(
    (k) => scores[k] < 0.2,
  );

  if (covered.length === 3) {
    return "You covered everything I need. I'll sort it into your Manifest now.";
  }
  if (covered.length) {
    parts.push(
      `You covered your ${covered.map(label).join(" and ")} well.`,
    );
  }
  if (little.length) {
    parts.push(
      `I've only a little on your ${little.map(label).join(" and ")}`,
    );
  }
  if (none.length) {
    parts.push(
      `${little.length ? "and nothing" : "Nothing"} yet on ${none.map(label).join(" and ")}`,
    );
  }
  const ask = shortBars(scores).length;
  if (ask > 0) {
    parts.push(
      `so I'll ask ${ask === 1 ? "one quick question" : `${ask} quick questions`}.`,
    );
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function mergeTalkScores(
  base: TalkScores,
  addition: string,
): TalkScores {
  const add = scoreTalkCoverage(addition);
  return {
    goals: clamp01(Math.max(base.goals, add.goals) + add.goals * 0.15),
    values: clamp01(Math.max(base.values, add.values) + add.values * 0.15),
    blockers: clamp01(
      Math.max(base.blockers, add.blockers) + add.blockers * 0.15,
    ),
  };
}

export function draftManifestoFromExtract(
  extract: TalkExtract,
  extraText?: string,
): string {
  const values = extract.values.slice(0, 3);
  const dream =
    extract.areas[0]?.dream?.trim() ||
    (extraText ?? "").trim().split(/(?<=[.!?])\s+/)[0] ||
    "";
  if (values.length && dream) {
    return `I live by ${values.join(", ").toLowerCase()}, and I move toward ${dream.charAt(0).toLowerCase()}${dream.slice(1)}`.replace(
      /\.+$/,
      "",
    ) + ".";
  }
  if (values.length) {
    return `I choose a life guided by ${values.join(", ").toLowerCase()}.`;
  }
  if (dream) {
    return `I am building the life where ${dream.charAt(0).toLowerCase()}${dream.slice(1)}`.replace(
      /\.+$/,
      "",
    ) + ".";
  }
  return "I live with intention, and I keep moving toward the life I want.";
}

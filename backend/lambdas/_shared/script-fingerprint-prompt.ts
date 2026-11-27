/**
 * Create · compact delivery fingerprint for the single Sonnet call: the style's
 * usual opening / closing moves, delivery strength and voice, and which phrase
 * families to use, keep rare or avoid. Pure; no I/O.
 */
import type {
  FingerprintMoveShare,
  FingerprintPhraseFamily,
  StyleFingerprint,
} from "./preprompts/harvester-datasets";
import { meditationTypeForHarvesterKey } from "./preprompts/preprompt-registry";

const MAX_MARKER = 5;
const MAX_GENERIC = 4;
const MAX_FOREIGN = 6;

export const MOVE_LABELS: Record<string, string> = {
  welcome: "welcome",
  posture: "posture",
  eyes_closed_or_soft_gaze: "eyes closed or soft gaze",
  settling_breaths: "settling breaths",
  body_arrival: "body arrival",
  intention_or_purpose: "intention or purpose",
  permission_or_acceptance: "permission or acceptance line",
  overview: "overview of what's coming",
  deepen_once_more: "deepen once more",
  return_attention: "return of attention to the body or room",
  movement: "movement (fingers, toes, stretch)",
  eyes_open: "eyes open",
  gratitude: "gratitude",
  carry_into_day: "carry it into your day",
  affirmation_or_intention: "affirmation or intention restated",
  other: "other",
};

export function moveLabel(move: string): string {
  return MOVE_LABELS[move] ?? move.replace(/_/g, " ");
}

const RATING_WORDS: Record<string, [string, string, string, string, string]> = {
  directiveness: [
    "very permissive",
    "permissive",
    "between permissive and assertive",
    "assertive",
    "very assertive",
  ],
  energy: ["very soothing", "soothing", "even", "lively", "energising"],
  certainty: [
    "very tentative about outcomes",
    "tentative about outcomes",
    "moderately certain about outcomes",
    "confident about outcomes",
    "fully certain about outcomes",
  ],
  warmth: ["cool", "neutral warmth", "warm", "very warm", "intensely warm"],
  formality: ["very casual", "casual", "plain", "formal", "very formal"],
};

function ratingWord(key: string, median: number | undefined): string | null {
  if (typeof median !== "number" || !Number.isFinite(median)) return null;
  const words = RATING_WORDS[key];
  if (!words) return null;
  const i = Math.min(4, Math.max(0, Math.round(median) - 1));
  return `${words[i]} (${key} ${Math.round(median * 10) / 10}/5)`;
}

const TENSE_LABELS: Record<string, string> = {
  present: "present tense",
  future: "future tense",
  as_if_true: '"as if already true"',
  mixed: "mixed tense",
};

const PERSON_LABELS: Record<string, string> = {
  you: '"you"',
  we: '"we"',
  i: '"I" statements for the listener',
  mixed: "mixed person",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function topEntry(rec: Record<string, number> | undefined): [string, number] | null {
  const e = Object.entries(rec ?? {}).filter(([, v]) => typeof v === "number");
  if (!e.length) return null;
  return e.sort((a, b) => b[1] - a[1])[0]!;
}

function shareOf(moves: FingerprintMoveShare[] | undefined, move: string): number | null {
  return moves?.find((m) => m.move === move)?.share ?? null;
}

function orderLine(
  order: string[] | undefined,
  moves: FingerprintMoveShare[] | undefined,
): string | null {
  const list = (order ?? []).filter((m) => m !== "other");
  if (!list.length) return null;
  return list
    .map((m) => {
      const s = shareOf(moves, m);
      return s != null ? `${moveLabel(m)} (${pct(s)})` : moveLabel(m);
    })
    .join(" → ");
}

function familyLine(f: FingerprintPhraseFamily, withOwner: boolean): string {
  const ex = (f.examples ?? []).slice(0, 2).map((e) => `"${e}"`);
  const owner =
    withOwner && f.belongs_to?.length
      ? ` [belongs to ${f.belongs_to
          .map((s) => meditationTypeForHarvesterKey(s) ?? s)
          .join(", ")}]`
      : "";
  return `- ${f.name}${ex.length ? `, e.g. ${ex.join(", ")}` : ""}${owner}`;
}

function byRate(list: FingerprintPhraseFamily[] | undefined): FingerprintPhraseFamily[] {
  return [...(list ?? [])].sort(
    (a, b) => (b.prevalence ?? 0) - (a.prevalence ?? 0) || (b.rate_per_1k ?? 0) - (a.rate_per_1k ?? 0),
  );
}

function byOtherRate(list: FingerprintPhraseFamily[] | undefined): FingerprintPhraseFamily[] {
  return [...(list ?? [])].sort(
    (a, b) => (b.other_prevalence ?? 0) - (a.other_prevalence ?? 0),
  );
}

/** Compact "What listeners expect" block for the script call; null without a fingerprint. */
export function formatFingerprintForPrompt(
  fp: StyleFingerprint | null | undefined,
  meditationType: string,
): string | null {
  if (!fp) return null;
  const n = fp.videos?.annotated;
  const lines: string[] = [
    `### What listeners expect from a ${meditationType} meditation${n ? ` (from ${n} popular sessions)` : ""}`,
    `Write this meditation the standard, expected way for ${meditationType} unless the user's request says otherwise. Use the expected moves below as defaults, in their usual order, inside the skeleton's opening and closing passages, while keeping every line's wording fresh. The user's brief and chat override this; the skeleton still sets structure, word targets and pauses.`,
  ];

  const open = orderLine(fp.opening?.usual_order, fp.opening?.moves);
  if (open) lines.push(`Opening, usual order (share of sessions): ${open}`);
  const close = orderLine(fp.closing?.usual_order, fp.closing?.moves);
  if (close) lines.push(`Closing, usual order (share of sessions): ${close}`);

  const d = fp.delivery ?? {};
  const ratings = (["directiveness", "energy", "certainty", "warmth", "formality"] as const)
    .map((k) => ratingWord(k, d[k]?.median))
    .filter((s): s is string => !!s);
  if (ratings.length) lines.push(`Delivery: ${ratings.join("; ")}.`);

  const voice: string[] = [];
  const person = topEntry(fp.voice?.person);
  if (person) voice.push(`mostly ${PERSON_LABELS[person[0]] ?? person[0]} (${pct(person[1])})`);
  const iStatements = fp.voice?.listener_i_statements;
  if (typeof iStatements === "number" && iStatements >= 0.2) {
    voice.push(`"I" statements for the listener to repeat in ${pct(iStatements)}`);
  }
  const tense = topEntry(fp.voice?.tense);
  if (tense) voice.push(`${TENSE_LABELS[tense[0]] ?? tense[0]} (${pct(tense[1])})`);
  const q = topEntry(fp.voice?.question_rate);
  if (q) voice.push(`questions: ${q[0]}`);
  const rep = topEntry(fp.repetition?.level);
  if (rep) {
    const lr = fp.repetition?.listener_repeats;
    voice.push(
      `repetition: ${rep[0]}${typeof lr === "number" && lr > 0 ? `, listener repeats lines in ${pct(lr)}` : ""}`,
    );
  }
  if (voice.length) lines.push(`Voice: ${voice.join("; ")}.`);

  const marker = byRate(fp.families?.marker).slice(0, MAX_MARKER);
  if (marker.length) {
    lines.push("Phrasing that fits this style (say these ideas in your own words):");
    lines.push(...marker.map((f) => familyLine(f, false)));
  }
  const generic = byRate(fp.families?.generic).slice(0, MAX_GENERIC);
  if (generic.length) {
    lines.push("Keep rare (common to every style; overused):");
    lines.push(...generic.map((f) => familyLine(f, false)));
  }
  const foreign = byOtherRate(fp.families?.foreign).slice(0, MAX_FOREIGN);
  if (foreign.length) {
    lines.push("Avoid in this style (belongs to other styles):");
    lines.push(...foreign.map((f) => familyLine(f, true)));
  }
  return lines.join("\n");
}

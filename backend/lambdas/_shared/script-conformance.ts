/**
 * Create · conformance score (code only, no model call). Scores a written
 * skeleton script against the style's delivery fingerprint and its skeleton:
 *   - phrasing: foreign phrase families used; generic families over-used
 *   - moves: expected opening / closing moves present (keyword patterns per move)
 *   - structure: blocks, passages (split at extendable pauses) and role cues
 *   - words: total and per-block words against the skeleton's targets
 * Recorded with the generation; never blocks or rewrites the script.
 */
import type {
  FingerprintMoveShare,
  FingerprintPhraseFamily,
  StyleFingerprint,
} from "./preprompts/harvester-datasets";
import { countSpokenWords } from "./meditation-length-fit";
import {
  SKELETON_EXTENDABLE_MIN_SECONDS,
  type SkeletonPlan,
} from "./script-skeleton-plan";

/** A move is "expected" when at least this share of the style's sessions use it. */
const EXPECTED_MOVE_SHARE = 0.5;
/** No move reaches EXPECTED_MOVE_SHARE: expect the most common one if at least this common. */
const FALLBACK_MOVE_SHARE = 0.3;
/** Generic family counts as over-used above this × the style's own rate (and ≥ 2 hits). */
const GENERIC_OVERUSE_FACTOR = 1.5;
/** Opening / closing region when the plan's phase blocks are too short. */
const EDGE_REGION_SHARE = 0.15;
const EDGE_REGION_MIN_WORDS = 60;
/** Word ratio fully inside / scoring zero at. */
const WORDS_OK = 0.15;
const WORDS_ZERO = 0.5;
const BLOCK_WORDS_OK = 0.25;
const MAX_LISTED_PHRASES = 5;
/** Shorter harvested n-grams ("know that you") are too common to attribute to a family. */
const MIN_MATCH_PHRASE_WORDS = 4;
const MIN_EXAMPLE_WORDS = 3;

const WEIGHTS = {
  phrasing: 35,
  moves: 30,
  structure: 20,
  words: 15,
} as const;

const MOVE_PATTERNS: Record<string, RegExp> = {
  // Opening
  welcome:
    /\b(welcome|hello|hi there|glad you(?:'re| are) here|thank you for (?:joining|being here|taking)|let'?s begin|this is (?:a|your) (?:time|moment|practice|meditation))\b/i,
  posture:
    /\b(sit(?:ting)?|seated|lie|lying|posture|spine|upright|comfortable (?:position|seat)|find a (?:position|comfortable)|cushion|chair|on your back)\b/i,
  eyes_closed_or_soft_gaze:
    /\b(close your eyes|closing your eyes|eyes (?:gently )?clos|soft(?:en)?(?: your)? gaze|lower your gaze|let your eyes)/i,
  settling_breaths:
    /\b(deep breath|breathe in|breathing in|inhale|exhale|breathe out|few (?:slow |deep )?breaths|long(?:,)? slow breath|slow breath)/i,
  body_arrival:
    /\b(feel (?:your|the) (?:body|weight|ground|floor|seat|chair|bed)|contact with|supported|heaviness|notice (?:your|the) body|arriv(?:e|ing)|land(?:ing)? here)\b/i,
  intention_or_purpose:
    /\b(intention|purpose|in this (?:practice|meditation|session)|today we|this (?:practice|meditation|session) (?:is|will|invites)|set an? intention)\b/i,
  permission_or_acceptance:
    /\b(nothing (?:you need )?to (?:fix|change|do|achieve)|no (?:need to|right or wrong|wrong way)|just as (?:it|you) (?:is|are)|exactly as (?:it|you) (?:is|are)|allow(?:ing)? (?:whatever|things|it to be)|it'?s (?:ok|okay|fine) (?:if|to)|let (?:it|things) be)\b/i,
  overview:
    /\b(we(?:'ll| will) (?:begin|start|move|explore|spend|be)|we are going to|in the next (?:few )?minutes|over the next|first,? we|then we(?:'ll| will))\b/i,
  // Closing
  deepen_once_more:
    /\b(one (?:more|last|final) (?:deep |slow |full )?breath|deeper (?:still|now)|deepen|once more|one last time)\b/i,
  return_attention:
    /\b(come back|coming back|return(?:ing)? (?:to|your)|bring (?:your )?(?:attention|awareness|focus) back|the room|your surroundings|sounds around you|aware of (?:the|your) (?:room|body|space|surroundings))\b/i,
  movement:
    /\b(wiggle|move your (?:fingers|toes|hands|body)|stretch|gentle movement|roll your (?:shoulders|neck))\b/i,
  eyes_open: /\b(open your eyes|eyes open|opening your eyes|let your eyes (?:gently )?open|blink)\b/i,
  gratitude: /\b(thank|grateful|gratitude|appreciat)/i,
  carry_into_day:
    /\b(carry (?:this|it|that)|take (?:this|it|that) with you|into your day|rest of (?:your|the) day|throughout (?:your|the) day|day ahead|whenever you need|any time you need)\b/i,
  affirmation_or_intention:
    /\b(i am|i have|i choose|i allow|i trust|i deserve|remember that|your intention|repeat (?:after|to yourself|silently))\b/i,
};

/** Roles with a checkable cue; instruction / story / other are not checked. */
const ROLE_PATTERNS: Record<string, RegExp> = {
  settle:
    /\b(settle|settling|arriv|comfortable|position|sit|lie|lying|close your eyes|let your eyes|welcome|here|still)/i,
  breath: /\b(breath|breathe|breathing|inhale|exhale)/i,
  body: /\b(body|shoulders?|jaw|chest|belly|abdomen|hands?|feet|legs?|arms?|neck|face|forehead|back|spine|toes|fingers|hips?|sensations?|muscles?|head)\b/i,
  imagery:
    /\b(imagine|picture|visuali[sz]e|see yourself|envision|light|colou?r|path|place|scene|landscape|sky|water|garden|forest|ocean)\b/i,
  affirmation: /\b(i am|i have|i can|i choose|i allow|i trust|i deserve|i welcome|you are|you have)\b/i,
  "reflection prompt": /\?|\b(ask yourself|what would|what if|wonder|consider|reflect|notice what)\b/i,
  "self-practice handover":
    /\b(on your own|in your own time|for the next|continue|stay with|keep (?:resting|breathing|noticing|returning)|rest here|in (?:the )?silence|silently|let (?:it|this|yourself))\b/i,
  return:
    /\b(return|come back|coming back|bring (?:your )?(?:attention|awareness)|the room|surroundings|wiggle|eyes|aware)\b/i,
  close:
    /\b(thank|grateful|gratitude|when you(?:'re| are) ready|carry|today|day|open your eyes|eyes open|rest|sleep|drift)\b/i,
};

export type ConformanceFamilyHit = {
  id: string;
  name: string;
  hits: number;
  phrases: string[];
  belongsTo?: string[];
  per1k?: number;
  stylePer1k?: number;
  overused?: boolean;
};

export type ConformanceMoves = {
  expected: string[];
  present: string[];
  missing: string[];
};

export type ConformanceRecord = {
  version: 1;
  style: string;
  /** Delivery fingerprints dataset version (0 = none imported; phrasing / moves not scored). */
  fingerprintVersion: number;
  /** 0–100; weighted over the components that could be scored. */
  score: number;
  components: {
    phrasing: number | null;
    moves: number | null;
    structure: number;
    words: number;
  };
  foreign: { families: number; hits: number; list: ConformanceFamilyHit[] };
  generic: {
    families: number;
    hits: number;
    overused: number;
    list: ConformanceFamilyHit[];
  };
  marker: { families: number; hits: number };
  moves: { opening: ConformanceMoves; closing: ConformanceMoves } | null;
  structure: {
    plannedBlocks: number;
    writtenBlocks: number;
    plannedPassages: number;
    plannedGroups: number;
    writtenGroups: number;
    groupMatchShare: number;
    roleChecks: number;
    roleCueShare: number;
    roleMisses: Array<{ block: number; roles: string[] }>;
  };
  words: {
    target: number;
    written: number;
    ratio: number;
    blocksWithinTolerance: number;
    blocks: Array<{ block: number; target: number; written: number }>;
  };
};

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function stripMarkers(s: string): string {
  return s.replace(/<\s*x?\s*\d+(?:\.\d+)?\s*>/gi, " ");
}

/** Lower-case words only; apostrophes dropped so "you're" = "youre". Padded with spaces. */
function normForMatch(s: string): string {
  const t = stripMarkers(s)
    .toLowerCase()
    .replace(/[’‘`']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return ` ${t} `;
}

function countOccurrences(hay: string, needle: string): number {
  if (needle.trim() === "") return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = hay.indexOf(needle, i + needle.length - 1);
  }
  return n;
}

function familyHits(
  norm: string,
  f: FingerprintPhraseFamily,
): { hits: number; phrases: string[] } {
  const seen = new Set<string>();
  let hits = 0;
  const phrases: string[] = [];
  const candidates = [
    ...(f.match_phrases ?? []).map((p) => [p, MIN_MATCH_PHRASE_WORDS] as const),
    ...(f.examples ?? []).map((p) => [p, MIN_EXAMPLE_WORDS] as const),
  ];
  for (const [raw, minWords] of candidates) {
    const p = normForMatch(raw);
    if (p.trim().split(" ").length < minWords || seen.has(p)) continue;
    seen.add(p);
    const c = countOccurrences(norm, p);
    if (c > 0) {
      hits += c;
      if (phrases.length < MAX_LISTED_PHRASES) phrases.push(p.trim());
    }
  }
  return { hits, phrases };
}

function expectedMoves(moves: FingerprintMoveShare[] | undefined): string[] {
  const list = (moves ?? []).filter((m) => m.move !== "other" && MOVE_PATTERNS[m.move]);
  const exp = list.filter((m) => m.share >= EXPECTED_MOVE_SHARE).map((m) => m.move);
  if (exp.length) return exp;
  const top = [...list].sort((a, b) => b.share - a.share)[0];
  return top && top.share >= FALLBACK_MOVE_SHARE ? [top.move] : [];
}

function checkMoves(region: string, expected: string[]): ConformanceMoves {
  const present = expected.filter((m) => MOVE_PATTERNS[m]!.test(region));
  return {
    expected,
    present,
    missing: expected.filter((m) => !present.includes(m)),
  };
}

type WrittenBlock = { index: number; text: string };

/** Split the as-written script on `## block N` headers (no headers = one block). */
function splitBlocks(script: string): WrittenBlock[] {
  const text = (script ?? "").replace(/\r\n/g, "\n");
  const re = /^##\s*block\s+(\d+)\b[^\n]*$/gim;
  const hits: Array<{ n: number; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    hits.push({ n: Number(m[1]), start: m.index, end: m.index + m[0].length });
  }
  if (!hits.length) {
    return [{ index: 1, text: text.replace(/^##[^\n]*$/gm, " ").trim() }];
  }
  return hits.map((h, i) => ({
    index: h.n,
    text: text.slice(h.end, hits[i + 1]?.start ?? text.length).trim(),
  }));
}

/** Written passages: split at extendable `<x N>` markers; empty pieces dropped. */
function splitGroups(blockText: string): string[] {
  return blockText
    .split(/<\s*x\s*\d+(?:\.\d+)?\s*>/i)
    .map((s) => s.trim())
    .filter((s) => countSpokenWords(s) > 0);
}

function firstWords(s: string, n: number): string {
  return stripMarkers(s).split(/\s+/).filter(Boolean).slice(0, n).join(" ");
}

function lastWords(s: string, n: number): string {
  const w = stripMarkers(s).split(/\s+/).filter(Boolean);
  return w.slice(Math.max(0, w.length - n)).join(" ");
}

function wordRatioScore(ratio: number): number {
  const off = Math.abs(ratio - 1);
  if (off <= WORDS_OK) return 1;
  if (off >= WORDS_ZERO) return 0;
  return 1 - (off - WORDS_OK) / (WORDS_ZERO - WORDS_OK);
}

export function scoreScriptConformance(params: {
  /** Script as Sonnet wrote it, with `## block` headers and pause markers. */
  scriptWithHeaders: string;
  plan: SkeletonPlan;
  style: string;
  fingerprint: StyleFingerprint | null | undefined;
  fingerprintVersion: number;
}): ConformanceRecord {
  const { plan } = params;
  const fp = params.fingerprint ?? null;
  const written = splitBlocks(params.scriptWithHeaders);
  const fullText = written.map((b) => b.text).join("\n");
  const totalWords = countSpokenWords(fullText);
  const norm = normForMatch(fullText);

  // ─── Phrasing ───
  const foreignList: ConformanceFamilyHit[] = [];
  const genericList: ConformanceFamilyHit[] = [];
  let markerFamilies = 0;
  let markerHits = 0;
  if (fp) {
    for (const f of fp.families?.foreign ?? []) {
      const h = familyHits(norm, f);
      if (h.hits > 0) {
        foreignList.push({
          id: f.id,
          name: f.name,
          hits: h.hits,
          phrases: h.phrases,
          ...(f.belongs_to?.length ? { belongsTo: f.belongs_to } : {}),
        });
      }
    }
    for (const f of fp.families?.generic ?? []) {
      const h = familyHits(norm, f);
      if (h.hits > 0) {
        const per1k = (h.hits * 1000) / Math.max(1, totalWords);
        const stylePer1k = f.rate_per_1k ?? 0;
        genericList.push({
          id: f.id,
          name: f.name,
          hits: h.hits,
          phrases: h.phrases,
          per1k: round3(per1k),
          stylePer1k,
          overused: h.hits >= 2 && per1k > stylePer1k * GENERIC_OVERUSE_FACTOR,
        });
      }
    }
    for (const f of fp.families?.marker ?? []) {
      const h = familyHits(norm, f);
      if (h.hits > 0) {
        markerFamilies += 1;
        markerHits += h.hits;
      }
    }
  }
  const overused = genericList.filter((g) => g.overused).length;
  const phrasing = fp
    ? (25 * Math.max(0, 1 - foreignList.length / 3) +
        10 * Math.max(0, 1 - overused / 4)) /
      35
    : null;

  // ─── Moves ───
  const byIndex = new Map(written.map((b) => [b.index, b.text]));
  const phaseText = (phase: string) =>
    plan.blocks
      .filter((b) => b.phase === phase)
      .map((b) => byIndex.get(b.index) ?? "")
      .join("\n");
  const edgeWords = Math.max(EDGE_REGION_MIN_WORDS, Math.round(totalWords * EDGE_REGION_SHARE));
  const openingPhase = phaseText("opening");
  const closingPhase = phaseText("closing");
  const openingRegion =
    countSpokenWords(openingPhase) >= EDGE_REGION_MIN_WORDS
      ? openingPhase
      : firstWords(fullText, edgeWords);
  const closingRegion =
    countSpokenWords(closingPhase) >= EDGE_REGION_MIN_WORDS
      ? closingPhase
      : lastWords(fullText, edgeWords);
  let moves: ConformanceRecord["moves"] = null;
  let movesScore: number | null = null;
  if (fp) {
    moves = {
      opening: checkMoves(openingRegion, expectedMoves(fp.opening?.moves)),
      closing: checkMoves(closingRegion, expectedMoves(fp.closing?.moves)),
    };
    const exp = moves.opening.expected.length + moves.closing.expected.length;
    const got = moves.opening.present.length + moves.closing.present.length;
    movesScore = exp > 0 ? got / exp : null;
  }

  // ─── Structure + words ───
  const byN = new Map(plan.passages.map((p) => [p.n, p]));
  let plannedGroups = 0;
  let writtenGroups = 0;
  let groupMatches = 0;
  let roleChecks = 0;
  let roleHits = 0;
  const roleMisses: Array<{ block: number; roles: string[] }> = [];
  const blockWords: ConformanceRecord["words"]["blocks"] = [];
  for (const b of plan.blocks) {
    const text = byIndex.get(b.index) ?? "";
    // Planned passages grouped at extendable pauses (the only boundaries the text marks).
    const groups: string[][] = [[]];
    for (let n = b.firstPassage; n <= b.lastPassage; n++) {
      const p = byN.get(n);
      if (!p) continue;
      groups[groups.length - 1]!.push(p.role);
      if (p.pauseAfter >= SKELETON_EXTENDABLE_MIN_SECONDS && n < b.lastPassage) {
        groups.push([]);
      }
    }
    const planned = groups.filter((g) => g.length);
    const pieces = splitGroups(text);
    plannedGroups += planned.length;
    writtenGroups += pieces.length;
    const aligned = pieces.length === planned.length;
    if (aligned) groupMatches += planned.length;
    const missed: string[] = [];
    planned.forEach((roles, gi) => {
      const hay = aligned ? pieces[gi]! : text;
      for (const role of new Set(roles)) {
        const re = ROLE_PATTERNS[role];
        if (!re) continue;
        roleChecks += 1;
        if (re.test(stripMarkers(hay))) roleHits += 1;
        else missed.push(role);
      }
    });
    if (missed.length) roleMisses.push({ block: b.index, roles: [...new Set(missed)] });
    blockWords.push({ block: b.index, target: b.words, written: countSpokenWords(text) });
  }
  const plannedIdx = new Set(plan.blocks.map((b) => b.index));
  const writtenIdx = new Set(written.map((b) => b.index));
  const blocksMatch =
    plannedIdx.size === writtenIdx.size && [...plannedIdx].every((i) => writtenIdx.has(i));
  const groupMatchShare = plannedGroups > 0 ? groupMatches / plannedGroups : 0;
  const roleCueShare = roleChecks > 0 ? roleHits / roleChecks : 1;
  const structure =
    0.3 * (blocksMatch ? 1 : 0) + 0.35 * groupMatchShare + 0.35 * roleCueShare;

  const ratio = totalWords / Math.max(1, plan.totalWords);
  const blocksWithin = blockWords.filter(
    (b) => Math.abs(b.written / Math.max(1, b.target) - 1) <= BLOCK_WORDS_OK,
  ).length;
  const words =
    0.6 * wordRatioScore(ratio) + 0.4 * (blockWords.length ? blocksWithin / blockWords.length : 0);

  // ─── Score ───
  const parts: Array<[number | null, number]> = [
    [phrasing, WEIGHTS.phrasing],
    [movesScore, WEIGHTS.moves],
    [structure, WEIGHTS.structure],
    [words, WEIGHTS.words],
  ];
  const used = parts.filter(([v]) => v != null) as Array<[number, number]>;
  const wsum = used.reduce((s, [, w]) => s + w, 0);
  const score = wsum > 0 ? Math.round((used.reduce((s, [v, w]) => s + v * w, 0) / wsum) * 100) : 0;

  return {
    version: 1,
    style: params.style,
    fingerprintVersion: params.fingerprintVersion,
    score,
    components: {
      phrasing: phrasing == null ? null : round3(phrasing),
      moves: movesScore == null ? null : round3(movesScore),
      structure: round3(structure),
      words: round3(words),
    },
    foreign: {
      families: foreignList.length,
      hits: foreignList.reduce((s, f) => s + f.hits, 0),
      list: foreignList,
    },
    generic: {
      families: genericList.length,
      hits: genericList.reduce((s, f) => s + f.hits, 0),
      overused,
      list: genericList,
    },
    marker: { families: markerFamilies, hits: markerHits },
    moves,
    structure: {
      plannedBlocks: plan.blocks.length,
      writtenBlocks: written.length,
      plannedPassages: plan.passages.length,
      plannedGroups,
      writtenGroups,
      groupMatchShare: round3(groupMatchShare),
      roleChecks,
      roleCueShare: round3(roleCueShare),
      roleMisses,
    },
    words: {
      target: plan.totalWords,
      written: totalWords,
      ratio: round3(ratio),
      blocksWithinTolerance: blocksWithin,
      blocks: blockWords,
    },
  };
}

/**
 * Silence-fit + Haiku: after Sonnet, optionally rewrite off-budget phases with
 * Haiku (parallel, thinking off). Keeps original phase when checks fail.
 */
import {
  claudeUsdFromUsage,
  coerceHaikuModel,
  parseAnthropicMessageModel,
  parseAnthropicMessageUsage,
  withClaudeThinkingOff,
} from "./anthropic-pricing";
import { recordClaudeUsage, type AiUsageSource } from "./ai-usage";
import { countSpokenWords } from "./meditation-length-fit";
import {
  countSpokenSentences,
  joinTimeBasedPhases,
  splitTimeBasedPhases,
  type TimeBasedCallUsage,
  type TimeBasedPhaseBlock,
} from "./script-time-based-generate";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const HAIKU_TIMEOUT_MS = 45_000;

const PAUSE_MARKER_RE =
  /<(?:x\s*\d+(?:\.\d+)?|xs|s|m|l|xl|o)\s*>|\[\[PAUSE[^\]]*\]\]/gi;

export type HaikuPhaseRejectReason =
  | "pause_markers"
  | "wrong_direction"
  | "insufficient_progress"
  | "missing_or_malformed"
  | "call_failed"
  | "timeout";

export type HaikuPhaseFixResult = {
  phaseIndex: number;
  phaseName: string;
  attempted: boolean;
  accepted: boolean;
  rejectReason: HaikuPhaseRejectReason | null;
  wordsBefore: number;
  /** Word count of Haiku's rewrite (even when rejected). */
  wordsAfter: number;
  wordTarget: number;
  /** Header word count before any budget scaling (words mode). */
  headerWords?: number | null;
  /** Haiku reply body (headers stripped when possible); for rejected-phase preview. */
  haikuText: string | null;
};

export type SilenceHaikuWordFixResult = {
  scriptWithHeaders: string;
  scriptAsWritten: string;
  haikuRan: boolean;
  wordsBeforeHaiku: number;
  wordsAfterHaiku: number;
  wordBudget: number;
  phasesFixed: number;
  phasesRejected: number;
  phaseResults: HaikuPhaseFixResult[];
  usages: TimeBasedCallUsage[];
  haikuUsd: number;
};

function pauseMarkersInOrder(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(PAUSE_MARKER_RE.source, PAUSE_MARKER_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[0].toLowerCase().replace(/\s+/g, " ").trim());
  }
  return out;
}

function markersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function firstSpokenLine(body: string): string {
  const line =
    (body ?? "")
      .split(/\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  return line.slice(0, 240);
}

function lastSpokenLine(body: string): string {
  const lines = (body ?? "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return (lines[lines.length - 1] ?? "").slice(0, 240);
}

function extractPhaseFromHaikuReply(
  reply: string,
  original: TimeBasedPhaseBlock,
): TimeBasedPhaseBlock | null {
  const text = (reply ?? "").replace(/^\uFEFF/, "").trim();
  if (!text) return null;
  const parts = splitTimeBasedPhases(text);
  if (parts.length === 1 && parts[0]) {
    const p = parts[0];
    return {
      ...original,
      body: p.body.trim() || p.headerLine ? p.body.trim() : text,
      headerLine: original.headerLine || p.headerLine,
    };
  }
  const named = parts.find(
    (p) =>
      p.name.toLowerCase() === original.name.toLowerCase() ||
      (original.headerLine &&
        p.headerLine &&
        p.headerLine.includes(original.name)),
  );
  if (named) {
    return {
      ...original,
      body: named.body.trim(),
      headerLine: original.headerLine || named.headerLine,
    };
  }
  // Fallback: strip any header lines and treat remainder as body.
  const stripped = text
    .replace(/^##[^\n]*\n+/gm, "")
    .trim();
  if (!stripped) return null;
  return { ...original, body: stripped };
}

/** Keep Haiku only if word count moved toward the target. */
function progressOk(params: {
  before: number;
  after: number;
  target: number;
}): boolean {
  const { before, after, target } = params;
  if (!(target > 0)) return false;
  const need = target - before;
  if (need === 0) return after === before;
  const moved = after - before;
  // Must move toward the target.
  if (need > 0 && moved <= 0) return false;
  if (need < 0 && moved >= 0) return false;
  return true;
  // Was (v1/v2): also required at least a third of the way toward the target.
  // const needAbs = Math.abs(need);
  // const movedAbs = Math.abs(moved);
  // return movedAbs >= needAbs / 3 - 0.01;
}

async function haikuPhaseCall(params: {
  apiKey: string;
  model: string;
  phase: TimeBasedPhaseBlock;
  words: number;
  wordTarget: number;
  prevLine: string;
  nextLine: string;
  source?: AiUsageSource;
}): Promise<{ text: string; usage: TimeBasedCallUsage | null }> {
  const delta = params.wordTarget - params.words;
  const sentenceCount = countSpokenSentences(params.phase.body);
  const wps =
    sentenceCount > 0 && params.words > 0
      ? params.words / sentenceCount
      : 12;
  const absDelta = Math.abs(delta);
  const sentenceChangeLo = Math.floor(absDelta / wps);
  const sentenceChangeHi = Math.ceil(absDelta / wps);
  const more = delta > 0 ? " more" : "";
  const sentenceHint =
    absDelta <= 0
      ? ""
      : sentenceChangeLo === sentenceChangeHi
        ? ` (about ${sentenceChangeLo}${more} sentence${sentenceChangeLo === 1 ? "" : "s"})`
        : ` (about ${sentenceChangeLo}–${sentenceChangeHi}${more} sentence${sentenceChangeHi === 1 ? "" : "s"})`;
  // Was:
  // const changeLine =
  //   delta < 0
  //     ? `Current: ${params.words} words. Target: ${params.wordTarget} words. Remove about ${Math.abs(delta)} words.`
  //     : delta > 0
  //       ? `Current: ${params.words} words. Target: ${params.wordTarget} words. Add about ${delta} words.`
  //       : `Current: ${params.words} words. Target: ${params.wordTarget} words. Keep about the same length.`;
  const changeLine =
    delta < 0
      ? `Current: ${params.words} words. Target: ${params.wordTarget} words. Remove about ${absDelta} words${sentenceHint}.`
      : delta > 0
        ? `Current: ${params.words} words. Target: ${params.wordTarget} words. Add about ${delta} words${sentenceHint}.`
        : `Current: ${params.words} words. Target: ${params.wordTarget} words. Keep about the same length.`;

  // Was (pre-loosen):
  // const system = [
  //   "You are adjusting the length of one part of a meditation script. Rewrite it to about the target number of spoken words.",
  //   "When shortening: cut. …",
  //   "When lengthening: spell out more fully… Don't add new topics…",
  //   "Keep the same meaning, order, tone and details…",
  //   "Keep every pause marker (`<N>` and `<x N>`) exactly as written…",
  // ].join("\n");
  // Was (loosen v1): lengthening line ended with "You may add `<N>` pauses between new sentences."
  // and pause line was "Keep every existing pause marker … in the same order. When shortening…"
  const system = [
    "You are adjusting the length of one part of a meditation script. Rewrite it to about the target number of spoken words.",
    "When shortening: cut. Remove lines that repeat or restate something already said, drop secondary details and extra examples, and merge sentences that make the same point. Losing whole lines is expected. Keep the lines that carry the main instruction and the personal details.",
    "When lengthening: say what's already there more fully and more slowly. Describe the sensation or feeling being pointed to in more detail, gently repeat or rephrase a key instruction the way a guide would, add a short invitation to notice or rest, and add linking phrases between lines. Stay with the same topics and images; don't introduce new ones.",
    "Hit the target word count. Being within 10% of it matters more than keeping every line.",
    "Keep the same order and tone.",
    "Keep every existing pause marker (`<N>` and `<x N>`) unchanged and in the same order. When shortening, keep each one next to the sentence it follows. When lengthening, you may add pauses between new sentences, but only short ones (about 1–2 seconds).",
    "Keep names, places and personal details exactly as written.",
    "Return only the rewritten part, under its original header, in the same format. Nothing else.",
  ].join("\n");

  // Was:
  // const userParts = [
  //   changeLine,
  //   `Current spoken words: ${params.words}`,
  //   `Target spoken words: ${params.wordTarget}`,
  // ];
  const userParts = [changeLine];
  if (params.prevLine) {
    userParts.push(
      `Context only (do not edit) — last line of previous phase:\n${params.prevLine}`,
    );
  }
  if (params.nextLine) {
    userParts.push(
      `Context only (do not edit) — first line of next phase:\n${params.nextLine}`,
    );
  }
  const phaseBlock = params.phase.headerLine
    ? `${params.phase.headerLine}\n${params.phase.body}`
    : params.phase.body;
  userParts.push(`Phase to rewrite:\n${phaseBlock}`);

  const body = withClaudeThinkingOff({
    model: params.model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userParts.join("\n\n") }],
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HAIKU_TIMEOUT_MS);
  try {
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await upstream.text();
    if (!upstream.ok) {
      throw new Error(
        `Haiku phase fix failed: ${responseText.slice(0, 800)}`,
      );
    }
    let parsed: { content?: Array<{ type?: string; text?: string }> };
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error("Invalid Haiku response");
    }
    const text =
      parsed.content?.find((c) => c?.type === "text")?.text?.trim() ?? "";
    if (!text) throw new Error("Empty Haiku response");

    const rawUsage = parseAnthropicMessageUsage(responseText);
    const responseModel =
      parseAnthropicMessageModel(responseText) || params.model;
    let usage: TimeBasedCallUsage | null = null;
    if (rawUsage) {
      // Price at the API-returned model (Haiku rates), not the Sonnet script model.
      const usd = claudeUsdFromUsage(responseModel, rawUsage);
      usage = {
        label: `haiku-phase-${params.phase.name || "x"}`,
        model: responseModel,
        requestedModel: params.model,
        input_tokens: rawUsage.input_tokens,
        output_tokens: rawUsage.output_tokens,
        cache_creation_input_tokens:
          rawUsage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: rawUsage.cache_read_input_tokens ?? 0,
        usd: Math.round(usd * 1e6) / 1e6,
      };
      void recordClaudeUsage({
        model: responseModel,
        feature: "meditation-script",
        source: params.source ?? "user",
        reason: "script-silence-haiku-phase",
        usage: rawUsage,
      });
    }
    return { text, usage };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Optionally fix off-budget phases with parallel Haiku calls, then return the
 * rewritten script (or the original if Haiku is not needed / all rejected).
 */
export async function applySilenceHaikuWordFix(params: {
  apiKey: string;
  /** Existing style-infer / Haiku model setting — do not hard-code. */
  haikuModelId: string;
  scriptWithHeaders: string;
  /**
   * Silence-fit + Haiku: phase target = headerSentences × WPS.
   * Silence-fit · words + Haiku: unused when phaseTargetSource is header_words.
   */
  wordsPerSentence?: number;
  /** Total word budget for the script. */
  wordBudget: number;
  scriptTriggerPct: number;
  phaseTriggerPct: number;
  /**
   * sentences_wps (default): header sentences × WPS.
   * header_words: phase header `~W words`, scaled so targets sum to wordBudget.
   */
  phaseTargetSource?: "sentences_wps" | "header_words";
  /**
   * When streaming phases (incomplete script), skip the whole-script trigger and
   * use phaseTrigger alone. Targets scale with budget ÷ phases written so far.
   */
  streamingPartial?: boolean;
  /**
   * When true (default), Haiku phase fixes run via Promise.all.
   * When false, phases are fixed one-after-another (serial / original timing).
   */
  haikuParallel?: boolean;
  source?: AiUsageSource;
}): Promise<SilenceHaikuWordFixResult> {
  const scriptAsWritten = params.scriptWithHeaders;
  const phases = splitTimeBasedPhases(scriptAsWritten);
  const wps = Math.max(1, params.wordsPerSentence ?? 12);
  const useHeaderWords = params.phaseTargetSource === "header_words";
  const phaseWords = phases.map((p) => countSpokenWords(p.body));
  const wordsBefore = phaseWords.reduce((a, b) => a + b, 0);
  const wordBudget = Math.max(1, Math.round(params.wordBudget));
  const scriptTrig = Math.max(0, params.scriptTriggerPct);
  const phaseTrig = Math.max(0, params.phaseTriggerPct);

  const rawHeaderWords = phases.map((p) =>
    Math.max(0, Math.round(p.headerWords || 0)),
  );
  const headerSum = rawHeaderWords.reduce((a, b) => a + b, 0);
  // Scale header word targets so they sum to the word budget (words+Haiku).
  // When streaming incomplete: budget ÷ phases so far (even split if no headers).
  let phaseTargets: number[] = phases.map((p, i) => {
    if (useHeaderWords) {
      const h = rawHeaderWords[i] ?? 0;
      if (headerSum > 0) {
        return Math.max(1, Math.round((h / headerSum) * wordBudget));
      }
      return Math.max(1, Math.round(wordBudget / Math.max(1, phases.length)));
    }
    return Math.round((p.headerSentences || 0) * wps);
  });
  if (useHeaderWords && phaseTargets.length) {
    // Fix rounding drift so targets sum exactly to wordBudget.
    const sum = phaseTargets.reduce((a, b) => a + b, 0);
    const drift = wordBudget - sum;
    if (drift !== 0) {
      const last = phaseTargets.length - 1;
      phaseTargets[last] = Math.max(1, (phaseTargets[last] ?? 1) + drift);
    }
  }

  const empty = (): SilenceHaikuWordFixResult => ({
    scriptWithHeaders: scriptAsWritten,
    scriptAsWritten,
    haikuRan: false,
    wordsBeforeHaiku: wordsBefore,
    wordsAfterHaiku: wordsBefore,
    wordBudget,
    phasesFixed: 0,
    phasesRejected: 0,
    phaseResults: phases.map((p, i) => ({
      phaseIndex: i,
      phaseName: p.name,
      attempted: false,
      accepted: false,
      rejectReason: null,
      wordsBefore: phaseWords[i] ?? 0,
      wordsAfter: phaseWords[i] ?? 0,
      wordTarget: phaseTargets[i] ?? 0,
      headerWords: useHeaderWords ? rawHeaderWords[i] ?? 0 : null,
      haikuText: null,
    })),
    usages: [],
    haikuUsd: 0,
  });

  if (!(wordBudget > 0) || phases.length === 0) return empty();

  const overallMiss = (wordsBefore - wordBudget) / wordBudget;
  // Streaming: whole-script check isn't available — phase trigger alone.
  if (
    !params.streamingPartial &&
    Math.abs(overallMiss) <= scriptTrig + 1e-9
  ) {
    return empty();
  }
  const lengthening = params.streamingPartial
    ? overallMiss < 0
    : overallMiss < 0;

  const toFix: number[] = [];
  for (let i = 0; i < phases.length; i++) {
    const target = phaseTargets[i] ?? 0;
    if (!(target > 0)) continue;
    const words = phaseWords[i] ?? 0;
    const miss = (words - target) / target;
    if (Math.abs(miss) <= phaseTrig + 1e-9) continue;
    // Same direction as overall miss (when we have a script-level signal).
    if (!params.streamingPartial) {
      if (lengthening && miss >= 0) continue;
      if (!lengthening && miss <= 0) continue;
    }
    toFix.push(i);
  }

  if (!toFix.length) return empty();

  const model = coerceHaikuModel(params.haikuModelId);
  const nextPhases = phases.map((p) => ({ ...p }));
  const phaseResults: HaikuPhaseFixResult[] = phases.map((p, i) => ({
    phaseIndex: i,
    phaseName: p.name,
    attempted: false,
    accepted: false,
    rejectReason: null,
    wordsBefore: phaseWords[i] ?? 0,
    wordsAfter: phaseWords[i] ?? 0,
    wordTarget: phaseTargets[i] ?? 0,
    headerWords: useHeaderWords ? rawHeaderWords[i] ?? 0 : null,
    haikuText: null,
  }));
  const usages: TimeBasedCallUsage[] = [];
  const parallel = params.haikuParallel !== false;

  const fixOne = async (i: number) => {
    const phase = phases[i]!;
    const words = phaseWords[i] ?? 0;
    const wordTarget = phaseTargets[i] ?? 0;
    const row = phaseResults[i]!;
    row.attempted = true;
    row.wordTarget = wordTarget;
    const prevLine = i > 0 ? lastSpokenLine(phases[i - 1]!.body) : "";
    const nextLine =
      i < phases.length - 1 ? firstSpokenLine(phases[i + 1]!.body) : "";
    try {
      const { text, usage } = await haikuPhaseCall({
        apiKey: params.apiKey,
        model,
        phase,
        words,
        wordTarget,
        prevLine,
        nextLine,
        source: params.source,
      });
      if (usage) usages.push(usage);
      const rewritten = extractPhaseFromHaikuReply(text, phase);
      if (!rewritten || !rewritten.body.trim()) {
        row.rejectReason = "missing_or_malformed";
        row.haikuText = text.slice(0, 4000) || null;
        return;
      }
      // Was: reject when pause markers differed (v1/v2).
      // if (
      //   !markersEqual(
      //     pauseMarkersInOrder(phase.body),
      //     pauseMarkersInOrder(rewritten.body),
      //   )
      // ) {
      //   row.rejectReason = "pause_markers";
      //   return;
      // }
      void pauseMarkersInOrder;
      void markersEqual;
      const after = countSpokenWords(rewritten.body);
      row.wordsAfter = after;
      row.haikuText = rewritten.body.slice(0, 4000);
      if (!progressOk({ before: words, after, target: wordTarget })) {
        row.rejectReason = "wrong_direction";
        // Was: also "insufficient_progress" when moved < 1/3 of the way.
        return;
      }
      nextPhases[i] = rewritten;
      row.accepted = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      row.rejectReason =
        /abort|timeout/i.test(msg) ? "timeout" : "call_failed";
      console.warn("silence-haiku phase fix skipped", phase.name, msg);
    }
  };

  if (parallel) {
    await Promise.all(toFix.map((i) => fixOne(i)));
  } else {
    for (const i of toFix) {
      await fixOne(i);
    }
  }

  const scriptWithHeaders = joinTimeBasedPhases(nextPhases);
  const wordsAfter = nextPhases.reduce(
    (s, p) => s + countSpokenWords(p.body),
    0,
  );
  const phasesFixed = phaseResults.filter((r) => r.accepted).length;
  const phasesRejected = phaseResults.filter(
    (r) => r.attempted && !r.accepted,
  ).length;
  const haikuUsd =
    Math.round(usages.reduce((s, u) => s + (u.usd || 0), 0) * 1e6) / 1e6;

  return {
    scriptWithHeaders,
    scriptAsWritten,
    haikuRan: true,
    wordsBeforeHaiku: wordsBefore,
    wordsAfterHaiku: wordsAfter,
    wordBudget,
    phasesFixed,
    phasesRejected,
    phaseResults,
    usages,
    haikuUsd,
  };
}

/**
 * Time-based single-call script generation.
 *
 * Default-effort Claude call writes the script phase-by-phase under headers
 * (`## name · ~N min · ~M sentences`). Backend strips headers before TTS,
 * fits length by stretching **extendable** pauses (`<x N>`) only, and may
 * make one continue or trim call targeting the phase furthest under/over
 * its header minutes.
 */
import {
  claudeUsdFromUsage,
  parseAnthropicMessageUsage,
} from "./anthropic-pricing";
import { buildScriptGenerationCachedBody } from "./anthropic-prompt-cache";
import { recordClaudeUsage, type AiUsageSource } from "./ai-usage";
import {
  spaceRangeFor,
  spaceRangeMidSilence,
  type DeliveryId,
  type DeliveryProfiles,
  type SpaceRange,
} from "./delivery-profiles";
import {
  countSpokenWords,
  fitLongPauseScale,
  PRE_AUDIO_SCALE_MAX,
  PRE_AUDIO_SCALE_MIN,
} from "./meditation-length-fit";
import {
  pauseTotalsFromTokens,
  scaleExtendableTokens,
  scriptFromTimePauseTokens,
  scriptWithExtendableMarkers,
  stripLeadingPauseTokens,
  tokenizeTimeBasedScript,
} from "./script-time-based-pauses";
import { summarizeOrdinaryPauseMarkers } from "./script-pause-bands";
import {
  buildTimeBasedScriptPrompt,
  timeBasedSentencesPerMinute,
} from "./script-time-based-prompt";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/** @deprecated Replaced by extendable `<x N>` pauses — kept for log compat. */
export const TIME_FLEXIBLE_PAUSE_MIN_SECONDS = 8;

/** @deprecated Replaced by `## name · ~N min · ~M sentences` headers. */
export const TIME_PHASE_MARKER_RE =
  /\[\[\s*phase\s*:\s*([^\]]+?)\s*\]\]/gi;

/**
 * Phase header at the start of a line:
 * `## arriving · ~2 min · ~9 sentences`
 */
export const TIME_PHASE_HEADER_RE =
  /^##\s+(.+?)\s*[·|•\-–—]\s*~?\s*(\d+(?:\.\d+)?)\s*min(?:ute)?s?\s*[·|•\-–—]\s*~?\s*(\d+)\s*sentences?\s*$/gim;

/**
 * Word-budget phase header (Silence-fit · words), e.g.
 * `## arriving · ~2 min · ~120 words`
 */
export const TIME_PHASE_WORDS_HEADER_RE =
  /^##\s+(.+?)\s*[·|•\-–—]\s*~?\s*(\d+(?:\.\d+)?)\s*min(?:ute)?s?\s*[·|•\-–—]\s*~?\s*(\d+)\s*words?\s*$/gim;

export type TimeBasedCallUsage = {
  label: string;
  /** Model used for pricing (prefer API response id when available). */
  model: string;
  /** Model id requested in the Messages body (may differ from API response). */
  requestedModel?: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  usd: number;
};

export type TimeBasedPhaseStat = {
  name: string;
  headerMinutes: number;
  headerSentences: number;
  /** Silence-fit · words: header word target (0 when sentence headers). */
  headerWords?: number;
  actualSentences: number;
  words: number;
  speechSeconds: number;
  pauseSeconds: number;
  totalSeconds: number;
  deltaSeconds: number;
};

export type TimeBasedOutsideReason = "too_short" | "too_long" | null;

export type TimeLengthPhaseAccuracy = TimeBasedPhaseStat & {
  extendableSecondsBefore: number;
  extendableSecondsAfter: number;
};

/** Snapshot for Accuracy · Length accuracy table (stored on cost cells). */
export type TimeLengthAccuracy = {
  targetSeconds: number;
  predictedSecondsBefore: number;
  predictedSecondsAfter: number;
  speechSeconds: number;
  silenceShareAfter: number;
  spaceRangeMin: number;
  spaceRangeMax: number;
  words: number;
  roughSpeechWords: number;
  extendableCount: number;
  extendableSecondsBefore: number;
  extendableSecondsAfter: number;
  ordinaryPauseCount: number;
  ordinaryPauseAverageSeconds: number | null;
  ordinaryPauseLongestSeconds: number;
  namedMarkersUsed: number;
  outsideTolerance: boolean;
  outsideReason: TimeBasedOutsideReason;
  /** Plain-English cause when outside; null when within tolerance. */
  why: string | null;
  lengthTolerancePct: number;
  /** Total sentence budget given in the prompt. */
  sentenceBudget: number;
  /** Sum of phase header sentence counts. */
  headerSentenceTotal: number;
  /** Sum of actual spoken sentences. */
  writtenSentenceTotal: number;
  phases: TimeLengthPhaseAccuracy[];
};

export type TimeBasedGenerateResult = {
  script: string;
  /** @deprecated Outline removed — headers live on phases. Kept empty for compat. */
  outline: string;
  /** Phase names from headers (compat with old phaseMarkers). */
  phaseMarkers: string[];
  /** Script with phase headers (for logs); TTS uses `script`. */
  scriptWithHeaders: string;
  phases: TimeBasedPhaseStat[];
  lengthAccuracy: TimeLengthAccuracy;
  sentencesPerMinute: number;
  scriptTimeSeconds: number;
  speechSecondsBefore: number;
  pauseSecondsBefore: number;
  speechSecondsAfter: number;
  pauseSecondsAfter: number;
  silenceShareAfter: number;
  /** @deprecated One-call mode never continues. Always false. */
  continued: boolean;
  /** @deprecated One-call mode never trims via Claude. Always false. */
  trimmed: boolean;
  /** Extendable-pause fit could not land within length tolerance. */
  outsideTolerance: boolean;
  outsideReason: TimeBasedOutsideReason;
  predictedSecondsAfter: number;
  usages: TimeBasedCallUsage[];
};

function fmtClockSec(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Plain reason when extendable-pause fit cannot land within tolerance. */
export function explainTimeOutsideTolerance(params: {
  outsideReason: TimeBasedOutsideReason;
  targetSeconds: number;
  speechSeconds: number;
  predictedSecondsAfter: number;
  silenceShareAfter: number;
  spaceRange: SpaceRange;
  extendableCount: number;
  extendableSecondsBefore: number;
  scale: number;
  scaleMin: number;
  scaleMax: number;
}): string | null {
  if (!params.outsideReason) return null;

  if (params.speechSeconds > params.targetSeconds) {
    return "Too many words";
  }
  if (params.outsideReason === "too_short") {
    if (params.extendableCount <= 0 || params.extendableSecondsBefore <= 0) {
      return "No long pauses to stretch";
    }
    if (
      params.silenceShareAfter >= params.spaceRange.max - 0.001 ||
      params.scale >= params.scaleMax - 0.001
    ) {
      return "Long pauses at maximum";
    }
    return "Too few words";
  }
  // too_long
  if (params.extendableCount <= 0 || params.extendableSecondsBefore <= 0) {
    return "No long pauses to cut";
  }
  if (
    params.scale <= params.scaleMin + 0.001 ||
    params.silenceShareAfter <= params.spaceRange.min + 0.001
  ) {
    return "Long pauses at minimum";
  }
  return "Too many words";
}

export type TimeBasedPhaseBlock = {
  name: string;
  headerMinutes: number;
  headerSentences: number;
  /** Silence-fit · words headers; 0 when using sentence headers. */
  headerWords: number;
  headerLine: string;
  body: string;
};

/** Count spoken sentences (rough: split on . ! ?). */
export function countSpokenSentences(text: string): number {
  const plain = (text ?? "")
    .replace(/\[\[PAUSE[^\]]*\]\]/gi, " ")
    .replace(/<x\s*\d+(?:\.\d+)?\s*>/gi, " ")
    .replace(/<(?:xs|s|m|l|xl|o)\s*>/gi, " ")
    .replace(/#+\s*/g, " ")
    .trim();
  if (!plain) return 0;
  const parts = plain
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /[a-zA-Z]/.test(s));
  return parts.length;
}

/**
 * Split a time-based script into phase blocks by `## …` headers.
 * Text before the first header (if any) is treated as an unnamed prelude.
 */
export function splitTimeBasedPhases(raw: string): TimeBasedPhaseBlock[] {
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const sentenceRe = new RegExp(
    TIME_PHASE_HEADER_RE.source,
    TIME_PHASE_HEADER_RE.flags,
  );
  const wordsRe = new RegExp(
    TIME_PHASE_WORDS_HEADER_RE.source,
    TIME_PHASE_WORDS_HEADER_RE.flags,
  );
  const hits: Array<{
    index: number;
    end: number;
    name: string;
    minutes: number;
    sentences: number;
    words: number;
    headerLine: string;
  }> = [];
  let m: RegExpExecArray | null;
  while ((m = sentenceRe.exec(text)) !== null) {
    hits.push({
      index: m.index,
      end: m.index + m[0].length,
      name: (m[1] ?? "").trim(),
      minutes: parseFloat(m[2] ?? ""),
      sentences: Math.round(parseFloat(m[3] ?? "")),
      words: 0,
      headerLine: m[0].trim(),
    });
  }
  while ((m = wordsRe.exec(text)) !== null) {
    hits.push({
      index: m.index,
      end: m.index + m[0].length,
      name: (m[1] ?? "").trim(),
      minutes: parseFloat(m[2] ?? ""),
      sentences: 0,
      words: Math.round(parseFloat(m[3] ?? "")),
      headerLine: m[0].trim(),
    });
  }
  hits.sort((a, b) => a.index - b.index);
  // Drop overlaps (prefer earlier match).
  const cleaned: typeof hits = [];
  for (const h of hits) {
    const last = cleaned[cleaned.length - 1];
    if (last && h.index < last.end) continue;
    cleaned.push(h);
  }

  if (!cleaned.length) {
    return [
      {
        name: "script",
        headerMinutes: 0,
        headerSentences: 0,
        headerWords: 0,
        headerLine: "",
        body: text,
      },
    ];
  }

  const phases: TimeBasedPhaseBlock[] = [];
  if (cleaned[0]!.index > 0) {
    const prelude = text.slice(0, cleaned[0]!.index).trim();
    if (prelude) {
      phases.push({
        name: "prelude",
        headerMinutes: 0,
        headerSentences: 0,
        headerWords: 0,
        headerLine: "",
        body: prelude,
      });
    }
  }
  for (let i = 0; i < cleaned.length; i++) {
    const h = cleaned[i]!;
    const next = cleaned[i + 1];
    const body = text.slice(h.end, next ? next.index : text.length).trim();
    phases.push({
      name: h.name || `phase-${i + 1}`,
      headerMinutes: Number.isFinite(h.minutes) ? h.minutes : 0,
      headerSentences: Number.isFinite(h.sentences) ? h.sentences : 0,
      headerWords: Number.isFinite(h.words) ? h.words : 0,
      headerLine: h.headerLine,
      body,
    });
  }
  return phases;
}

export function joinTimeBasedPhases(phases: TimeBasedPhaseBlock[]): string {
  return phases
    .map((p) => {
      if (p.headerLine) return `${p.headerLine}\n${p.body}`.trim();
      return p.body.trim();
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/** Strip phase headers (and legacy [[phase: …]] markers) before TTS. */
export function stripPhaseHeaders(script: string): string {
  if (!script) return "";
  let out = script.replace(TIME_PHASE_HEADER_RE, " ");
  out = out.replace(TIME_PHASE_WORDS_HEADER_RE, " ");
  // Legacy markers — commented path still available via stripPhaseMarkers.
  out = out.replace(TIME_PHASE_MARKER_RE, " ");
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split model output into outline + script.
 * @deprecated Replaced by phase headers — kept commented-in for reference.
 */
export function parseTimeBasedOutput(raw: string): {
  outline: string;
  scriptWithMarkers: string;
  phaseMarkers: string[];
} {
  const text = (raw ?? "").trim();
  if (!text) return { outline: "", scriptWithMarkers: "", phaseMarkers: [] };

  // New path: whole text is the script with headers; no separate outline.
  const phases = splitTimeBasedPhases(text);
  if (phases.some((p) => p.headerLine)) {
    return {
      outline: "",
      scriptWithMarkers: text,
      phaseMarkers: phases.filter((p) => p.headerLine).map((p) => p.name),
    };
  }

  // Legacy outline + [[phase: …]] fallback.
  const phaseHits: string[] = [];
  const re = new RegExp(TIME_PHASE_MARKER_RE.source, TIME_PHASE_MARKER_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    phaseHits.push((m[1] ?? "").trim());
  }

  const firstPhase = text.search(TIME_PHASE_MARKER_RE);
  const scriptHeader = text.search(/\n\s*(?:SCRIPT|Script)\s*\n/i);
  let cut = -1;
  if (firstPhase >= 0 && scriptHeader >= 0) {
    cut = Math.min(firstPhase, scriptHeader);
  } else if (firstPhase >= 0) {
    cut = firstPhase;
  } else if (scriptHeader >= 0) {
    cut = scriptHeader;
  }

  let outline = "";
  let body = text;
  if (cut > 0) {
    outline = text.slice(0, cut).trim();
    body = text.slice(cut).trim();
    body = body.replace(/^(?:SCRIPT|Script)\s*\n+/i, "").trim();
  } else {
    const blank = text.search(/\n\s*\n/);
    if (blank > 0 && blank < 800) {
      outline = text.slice(0, blank).trim();
      body = text.slice(blank).trim();
    }
  }

  return {
    outline,
    scriptWithMarkers: body,
    phaseMarkers: phaseHits,
  };
}

/** @deprecated Use stripPhaseHeaders. */
export function stripPhaseMarkers(script: string): string {
  return stripPhaseHeaders(script);
}

/** Remove any pause before the first spoken words. */
export function stripLeadingPauses(script: string): string {
  if (!script) return "";
  // Keep headers: strip pauses only from spoken bodies.
  const phases = splitTimeBasedPhases(script);
  if (phases.some((p) => p.headerLine)) {
    const next = phases.map((p) => {
      const tokens = stripLeadingPauseTokens(tokenizeTimeBasedScript(p.body));
      return { ...p, body: scriptWithExtendableMarkers(tokens) };
    });
    return joinTimeBasedPhases(next);
  }
  const tokens = stripLeadingPauseTokens(tokenizeTimeBasedScript(script));
  return scriptWithExtendableMarkers(tokens);
}

export function measureTimeBasedPhases(params: {
  scriptWithHeaders: string;
  effectiveWpm: number;
}): TimeBasedPhaseStat[] {
  const phases = splitTimeBasedPhases(params.scriptWithHeaders);
  const wpm = Math.max(1, params.effectiveWpm);
  return phases
    .filter((p) => p.headerLine || p.body.trim())
    .map((p) => {
      const tokens = tokenizeTimeBasedScript(p.body);
      const totals = pauseTotalsFromTokens(tokens);
      const plain = scriptFromTimePauseTokens(tokens);
      const words = countSpokenWords(plain);
      const speechSeconds = (words / wpm) * 60;
      const pauseSeconds = totals.ordinarySeconds + totals.extendableSeconds;
      const totalSeconds = speechSeconds + pauseSeconds;
      const headerSeconds = Math.max(0, p.headerMinutes) * 60;
      return {
        name: p.name,
        headerMinutes: p.headerMinutes,
        headerSentences: p.headerSentences,
        headerWords: p.headerWords || 0,
        actualSentences: countSpokenSentences(p.body),
        words,
        speechSeconds: Math.round(speechSeconds * 10) / 10,
        pauseSeconds: Math.round(pauseSeconds * 10) / 10,
        totalSeconds: Math.round(totalSeconds * 10) / 10,
        deltaSeconds: Math.round((totalSeconds - headerSeconds) * 10) / 10,
      };
    });
}

export function predictTimeBasedLength(params: {
  script: string;
  effectiveWpm: number;
}): {
  words: number;
  speechSeconds: number;
  ordinaryPauseSeconds: number;
  extendablePauseSeconds: number;
  /** @deprecated alias of ordinaryPauseSeconds */
  fixedPauseSeconds: number;
  /** @deprecated alias of extendablePauseSeconds */
  flexiblePauseSeconds: number;
  predictedSeconds: number;
  ordinaryCount: number;
  extendableCount: number;
} {
  const stripped = stripPhaseHeaders(params.script);
  const tokens = tokenizeTimeBasedScript(stripped);
  const totals = pauseTotalsFromTokens(tokens);
  const plain = scriptFromTimePauseTokens(tokens);
  const words = countSpokenWords(plain);
  const speechSeconds = (words / Math.max(1, params.effectiveWpm)) * 60;
  const predictedSeconds =
    speechSeconds + totals.ordinarySeconds + totals.extendableSeconds;
  return {
    words,
    speechSeconds,
    ordinaryPauseSeconds: totals.ordinarySeconds,
    extendablePauseSeconds: totals.extendableSeconds,
    fixedPauseSeconds: totals.ordinarySeconds,
    flexiblePauseSeconds: totals.extendableSeconds,
    predictedSeconds,
    ordinaryCount: totals.ordinaryCount,
    extendableCount: totals.extendableCount,
  };
}

/**
 * Scale **only** extendable pauses to hit targetSeconds when possible.
 * Ordinary pauses stay exactly as written. Converts extendable → [[PAUSE Ns]]
 * in the returned script. Headers must already be stripped.
 */
export function fitExtendablePauses(params: {
  script: string;
  effectiveWpm: number;
  targetSeconds: number;
  spaceRange: SpaceRange;
  lengthTolerancePct?: number;
  scaleMin?: number;
  scaleMax?: number;
}): {
  script: string;
  scale: number;
  speechSeconds: number;
  pauseSeconds: number;
  silenceShare: number;
  predictedSeconds: number;
  canHit: boolean;
  needsContinue: boolean;
  needsTrim: boolean;
  ordinaryBefore: { count: number; seconds: number };
  extendableBefore: { count: number; seconds: number };
  ordinaryAfter: { count: number; seconds: number };
  extendableAfter: { count: number; seconds: number };
} {
  const tokens0 = stripLeadingPauseTokens(
    tokenizeTimeBasedScript(stripPhaseHeaders(params.script)),
  );
  const beforeTotals = pauseTotalsFromTokens(tokens0);
  const plain = scriptFromTimePauseTokens(tokens0);
  const words = countSpokenWords(plain);
  const speechSeconds = (words / Math.max(1, params.effectiveWpm)) * 60;

  const scaleMin = params.scaleMin ?? PRE_AUDIO_SCALE_MIN;
  const scaleMax = params.scaleMax ?? PRE_AUDIO_SCALE_MAX;
  const tol = (params.lengthTolerancePct ?? 10) / 100;

  const ordinaryBefore = {
    count: beforeTotals.ordinaryCount,
    seconds: beforeTotals.ordinarySeconds,
  };
  const extendableBefore = {
    count: beforeTotals.extendableCount,
    seconds: beforeTotals.extendableSeconds,
  };

  if (speechSeconds > params.targetSeconds * (1 + tol)) {
    const pauseSeconds =
      beforeTotals.ordinarySeconds + beforeTotals.extendableSeconds;
    const predictedSeconds = speechSeconds + pauseSeconds;
    return {
      script: scriptFromTimePauseTokens(tokens0),
      scale: 1,
      speechSeconds,
      pauseSeconds,
      silenceShare: predictedSeconds > 0 ? pauseSeconds / predictedSeconds : 0,
      predictedSeconds,
      canHit: false,
      needsContinue: false,
      needsTrim: true,
      ordinaryBefore,
      extendableBefore,
      ordinaryAfter: ordinaryBefore,
      extendableAfter: extendableBefore,
    };
  }

  if (beforeTotals.extendableSeconds <= 0) {
    const pauseSeconds = beforeTotals.ordinarySeconds;
    const predictedSeconds = speechSeconds + pauseSeconds;
    const silenceShare =
      predictedSeconds > 0 ? pauseSeconds / predictedSeconds : 0;
    const within =
      Math.abs(predictedSeconds - params.targetSeconds) /
        Math.max(1, params.targetSeconds) <=
      tol;
    return {
      script: scriptFromTimePauseTokens(tokens0),
      scale: 1,
      speechSeconds,
      pauseSeconds,
      silenceShare,
      predictedSeconds,
      canHit: within,
      needsContinue: !within && speechSeconds < params.targetSeconds,
      needsTrim: false,
      ordinaryBefore,
      extendableBefore,
      ordinaryAfter: ordinaryBefore,
      extendableAfter: extendableBefore,
    };
  }

  let scale = fitLongPauseScale({
    speechSeconds,
    fixedPauseSeconds: beforeTotals.ordinarySeconds,
    longPauseSeconds: beforeTotals.extendableSeconds,
    targetSeconds: params.targetSeconds,
    min: scaleMin,
    max: scaleMax,
  });

  let pauseAfter =
    beforeTotals.ordinarySeconds + beforeTotals.extendableSeconds * scale;
  let totalAfter = speechSeconds + pauseAfter;
  let silenceShare = totalAfter > 0 ? pauseAfter / totalAfter : 0;

  let needsContinue = false;
  if (silenceShare > params.spaceRange.max + 0.001) {
    const maxPause =
      (params.spaceRange.max / Math.max(1e-6, 1 - params.spaceRange.max)) *
      speechSeconds;
    const extBudget = Math.max(0, maxPause - beforeTotals.ordinarySeconds);
    scale = Math.min(scale, extBudget / beforeTotals.extendableSeconds);
    needsContinue = true;
  }
  if (silenceShare < params.spaceRange.min - 0.001 && !needsContinue) {
    const minPause =
      (params.spaceRange.min / Math.max(1e-6, 1 - params.spaceRange.min)) *
      speechSeconds;
    const extBudget = Math.max(0, minPause - beforeTotals.ordinarySeconds);
    scale = Math.max(scale, extBudget / beforeTotals.extendableSeconds);
  }

  scale = Math.min(scaleMax, Math.max(scaleMin, scale));
  const scaled = scaleExtendableTokens(tokens0, scale);
  const afterTotals = pauseTotalsFromTokens(scaled);
  pauseAfter = afterTotals.ordinarySeconds + afterTotals.extendableSeconds;
  const predictedSeconds = speechSeconds + pauseAfter;
  silenceShare = predictedSeconds > 0 ? pauseAfter / predictedSeconds : 0;
  const canHit =
    Math.abs(predictedSeconds - params.targetSeconds) /
      Math.max(1, params.targetSeconds) <=
    tol;

  if (!canHit && !needsContinue) {
    if (speechSeconds < params.targetSeconds * (1 - params.spaceRange.max)) {
      needsContinue = true;
    }
  }

  return {
    script: scriptFromTimePauseTokens(scaled),
    scale,
    speechSeconds,
    pauseSeconds: pauseAfter,
    silenceShare,
    predictedSeconds,
    canHit,
    needsContinue,
    needsTrim: false,
    ordinaryBefore,
    extendableBefore,
    ordinaryAfter: {
      count: afterTotals.ordinaryCount,
      seconds: afterTotals.ordinarySeconds,
    },
    extendableAfter: {
      count: afterTotals.extendableCount,
      seconds: afterTotals.extendableSeconds,
    },
  };
}

/** @deprecated Use fitExtendablePauses. */
export const fitFlexiblePauses = fitExtendablePauses;

function buildTimeBasedPrompt(params: {
  transcript: string;
  meditationStyle?: string;
  styleGuideStyle?: string;
  delivery: DeliveryId;
  profiles: DeliveryProfiles;
  scriptTimeSeconds: number;
  roughSpeechWords: number;
  spaceRange: SpaceRange;
  sentencesPerMinute: number;
  totalSentenceBudget: number;
  journalMode?: boolean;
}) {
  return buildTimeBasedScriptPrompt(params);
}

async function anthropicTextCall(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  label: string;
  source?: AiUsageSource;
  reason: string;
}): Promise<{ text: string; usage: TimeBasedCallUsage | null }> {
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(params.body),
  });
  const responseText = await upstream.text();
  if (!upstream.ok) {
    throw new Error(
      `Anthropic ${params.label} failed: ${responseText.slice(0, 2000)}`,
    );
  }
  let parsed: { content?: Array<{ type?: string; text?: string }> };
  try {
    parsed = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid Anthropic response (${params.label})`);
  }
  const text =
    parsed.content?.find((c) => c?.type === "text")?.text?.trim() ?? "";
  if (!text) throw new Error(`Empty Anthropic response (${params.label})`);

  const rawUsage = parseAnthropicMessageUsage(responseText);
  let usage: TimeBasedCallUsage | null = null;
  if (rawUsage) {
    const usd = claudeUsdFromUsage(params.model, rawUsage);
    usage = {
      label: params.label,
      model: params.model,
      input_tokens: rawUsage.input_tokens,
      output_tokens: rawUsage.output_tokens,
      cache_creation_input_tokens: rawUsage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: rawUsage.cache_read_input_tokens ?? 0,
      usd: Math.round(usd * 1e6) / 1e6,
    };
    console.log(JSON.stringify({ tag: "script-gen-usage", ...usage }));
    void recordClaudeUsage({
      model: params.model,
      feature: "meditation-script",
      source: params.source ?? "user",
      reason: params.reason,
      usage: rawUsage,
    });
  }
  return { text, usage };
}

function normalizeScriptWithHeaders(raw: string): string {
  const parsed = parseTimeBasedOutput(raw);
  const withHeaders = stripLeadingPauses(
    parsed.scriptWithMarkers || raw,
  );
  return withHeaders;
}

/*
 * Removed by consciously-time-mode-one-call.zip — time-based is exactly one
 * Claude call; length is fit only via extendable pauses.
 *
 * async function continueShortPhases(...) { ... time-continue ... }
 * async function trimOverPhases(...) { ... time-trim ... }
 */

/**
 * Generate a time-based script and fit it to scriptTimeSeconds.
 * Exactly one Claude Messages call (plus API-error retries only).
 */
export async function generateTimeBasedScript(params: {
  apiKey: string;
  model: string;
  /** Haiku (or style-infer model) for trim. */
  trimModel: string;
  transcript: string;
  meditationStyle?: string;
  styleGuideStyle?: string;
  delivery: DeliveryId;
  profiles: DeliveryProfiles;
  /** Script stem target seconds (requested − lead/title/fade). */
  scriptTimeSeconds: number;
  effectiveWpm: number;
  lengthTolerancePct: number;
  /** Measured words/sentence for this pacing; default 12. */
  wordsPerSentence?: number;
  journalMode?: boolean;
  source?: AiUsageSource;
}): Promise<TimeBasedGenerateResult> {
  const spaceRange = spaceRangeFor(params.profiles, params.delivery);
  const midSilence = spaceRangeMidSilence(spaceRange);
  const midSpeech = 1 - midSilence;
  const roughSpeechWords = Math.max(
    40,
    Math.round(
      (params.scriptTimeSeconds / 60) * midSpeech * params.effectiveWpm,
    ),
  );
  const sentencesPerMinute = timeBasedSentencesPerMinute({
    effectiveWpm: params.effectiveWpm,
    midSilenceShare: midSilence,
    wordsPerSentence: params.wordsPerSentence,
  });
  const scriptMinutes = params.scriptTimeSeconds / 60;
  const totalSentenceBudget = Math.max(
    1,
    Math.round(scriptMinutes * sentencesPerMinute),
  );

  const prompt = buildTimeBasedPrompt({
    transcript: params.transcript,
    meditationStyle: params.meditationStyle,
    styleGuideStyle: params.styleGuideStyle,
    delivery: params.delivery,
    profiles: params.profiles,
    scriptTimeSeconds: params.scriptTimeSeconds,
    roughSpeechWords,
    spaceRange,
    sentencesPerMinute,
    totalSentenceBudget,
    journalMode: params.journalMode,
  });

  const usages: TimeBasedCallUsage[] = [];
  const first = await anthropicTextCall({
    apiKey: params.apiKey,
    model: params.model,
    label: "time-write",
    reason: "script-time-write",
    source: params.source,
    body: buildScriptGenerationCachedBody({
      model: params.model,
      maxTokens: prompt.maxTokens,
      systemStable: prompt.systemStable,
      meditationContext: prompt.meditationContext,
      taskContent: prompt.taskContent,
      // One call — nothing reads a 5m cache write.
      noCache: true,
    }),
  });
  if (first.usage) usages.push(first.usage);

  const scriptWithHeaders = normalizeScriptWithHeaders(first.text);
  let phases = measureTimeBasedPhases({
    scriptWithHeaders,
    effectiveWpm: params.effectiveWpm,
  });

  const before = predictTimeBasedLength({
    script: scriptWithHeaders,
    effectiveWpm: params.effectiveWpm,
  });

  // One Claude call only — no continue / trim. Fit via extendable pauses.
  // Was: if (fit.needsTrim) await trimOverPhases(...); else if (fit.needsContinue) await continueShortPhases(...);
  const fit = fitExtendablePauses({
    script: scriptWithHeaders,
    effectiveWpm: params.effectiveWpm,
    targetSeconds: params.scriptTimeSeconds,
    spaceRange,
    lengthTolerancePct: params.lengthTolerancePct,
  });

  let outsideReason: TimeBasedOutsideReason = null;
  if (!fit.canHit) {
    outsideReason =
      fit.predictedSeconds > params.scriptTimeSeconds
        ? "too_long"
        : "too_short";
  } else if (fit.needsTrim) {
    outsideReason = "too_long";
  } else if (fit.needsContinue) {
    outsideReason = "too_short";
  }
  const outsideTolerance = outsideReason != null;

  // Final TTS script: headers stripped; extendable pauses already converted.
  const script = fit.script;
  phases = measureTimeBasedPhases({
    scriptWithHeaders,
    effectiveWpm: params.effectiveWpm,
  });

  const phaseBlocks = splitTimeBasedPhases(scriptWithHeaders);
  const lengthPhases: TimeLengthPhaseAccuracy[] = phases.map((p, i) => {
    const body = phaseBlocks[i]?.body ?? "";
    const totals = pauseTotalsFromTokens(tokenizeTimeBasedScript(body));
    const extBefore = totals.extendableSeconds;
    const extAfter = Math.max(0, extBefore * fit.scale);
    return {
      ...p,
      extendableSecondsBefore: Math.round(extBefore * 10) / 10,
      extendableSecondsAfter: Math.round(extAfter * 10) / 10,
    };
  });

  const why = explainTimeOutsideTolerance({
    outsideReason,
    targetSeconds: params.scriptTimeSeconds,
    speechSeconds: fit.speechSeconds,
    predictedSecondsAfter: fit.predictedSeconds,
    silenceShareAfter: fit.silenceShare,
    spaceRange,
    extendableCount: before.extendableCount,
    extendableSecondsBefore: before.extendablePauseSeconds,
    scale: fit.scale,
    scaleMin: PRE_AUDIO_SCALE_MIN,
    scaleMax: PRE_AUDIO_SCALE_MAX,
  });

  const headerSentenceTotal = lengthPhases.reduce(
    (sum, p) => sum + (p.headerSentences || 0),
    0,
  );
  const writtenSentenceTotal = lengthPhases.reduce(
    (sum, p) => sum + (p.actualSentences || 0),
    0,
  );

  const ordinaryAsWritten = summarizeOrdinaryPauseMarkers(scriptWithHeaders);
  const lengthAccuracy: TimeLengthAccuracy = {
    targetSeconds: Math.round(params.scriptTimeSeconds),
    predictedSecondsBefore: Math.round(before.predictedSeconds * 10) / 10,
    predictedSecondsAfter: Math.round(fit.predictedSeconds * 10) / 10,
    speechSeconds: Math.round(fit.speechSeconds * 10) / 10,
    silenceShareAfter: Math.round(fit.silenceShare * 1000) / 1000,
    spaceRangeMin: spaceRange.min,
    spaceRangeMax: spaceRange.max,
    words: before.words,
    roughSpeechWords,
    extendableCount: before.extendableCount,
    extendableSecondsBefore:
      Math.round(before.extendablePauseSeconds * 10) / 10,
    extendableSecondsAfter: Math.round(fit.extendableAfter.seconds * 10) / 10,
    ordinaryPauseCount: ordinaryAsWritten.count,
    ordinaryPauseAverageSeconds: ordinaryAsWritten.averageSeconds,
    ordinaryPauseLongestSeconds: ordinaryAsWritten.longestSeconds,
    namedMarkersUsed: ordinaryAsWritten.namedMarkersUsed,
    outsideTolerance,
    outsideReason,
    why,
    lengthTolerancePct: params.lengthTolerancePct,
    sentenceBudget: totalSentenceBudget,
    headerSentenceTotal,
    writtenSentenceTotal,
    phases: lengthPhases,
  };

  console.log(
    JSON.stringify({
      tag: "script-time-based",
      sentencesPerMinute,
      lengthAccuracy,
      phases: lengthPhases,
      scriptTimeSeconds: params.scriptTimeSeconds,
      speechSecondsBefore: Math.round(before.speechSeconds * 10) / 10,
      pauseSecondsBefore:
        Math.round(
          (before.ordinaryPauseSeconds + before.extendablePauseSeconds) * 10,
        ) / 10,
      ordinaryPausesBefore: {
        count: before.ordinaryCount,
        seconds: Math.round(before.ordinaryPauseSeconds * 10) / 10,
      },
      extendablePausesBefore: {
        count: before.extendableCount,
        seconds: Math.round(before.extendablePauseSeconds * 10) / 10,
      },
      ordinaryPausesAfter: {
        count: fit.ordinaryAfter.count,
        seconds: Math.round(fit.ordinaryAfter.seconds * 10) / 10,
      },
      extendablePausesAfter: {
        count: fit.extendableAfter.count,
        seconds: Math.round(fit.extendableAfter.seconds * 10) / 10,
      },
      speechSecondsAfter: Math.round(fit.speechSeconds * 10) / 10,
      pauseSecondsAfter: Math.round(fit.pauseSeconds * 10) / 10,
      silenceShareAfter: Math.round(fit.silenceShare * 1000) / 1000,
      predictedSecondsAfter: Math.round(fit.predictedSeconds * 10) / 10,
      outsideTolerance,
      outsideReason,
      why,
      continued: false,
      trimmed: false,
      scale: Math.round(fit.scale * 1000) / 1000,
      roughSpeechWords,
      spaceRange,
      usages,
      callCount: usages.length,
    }),
  );

  return {
    script,
    outline: "",
    phaseMarkers: phases.filter((p) => p.headerMinutes > 0).map((p) => p.name),
    scriptWithHeaders,
    phases,
    lengthAccuracy,
    sentencesPerMinute,
    scriptTimeSeconds: params.scriptTimeSeconds,
    speechSecondsBefore: before.speechSeconds,
    pauseSecondsBefore:
      before.ordinaryPauseSeconds + before.extendablePauseSeconds,
    speechSecondsAfter: fit.speechSeconds,
    pauseSecondsAfter: fit.pauseSeconds,
    silenceShareAfter: fit.silenceShare,
    continued: false,
    trimmed: false,
    outsideTolerance,
    outsideReason,
    predictedSecondsAfter: fit.predictedSeconds,
    usages,
  };
}

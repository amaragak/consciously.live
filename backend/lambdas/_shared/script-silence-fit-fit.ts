/**
 * Silence-fit length fitting (app only, after one Claude call).
 *
 * Pause model: ordinary markers = short pauses; `<x N>` = long pauses the fit
 * resizes. Prediction-based fit only — TTS long pauses come from the fitted
 * script markers (sent with / inside the TTS request), so we cannot re-fit from
 * real audio durations after synthesis. If the pipeline later inserts long
 * silence as separate audio between segments, re-run this fit once real speech
 * durations are known.
 */
import { countSpokenWords } from "./meditation-length-fit";
import {
  pauseTotalsFromTokens,
  scriptFromTimePauseTokens,
  scriptWithExtendableMarkers,
  stripLeadingPauseTokens,
  tokenizeTimeBasedScript,
  type TimePauseToken,
} from "./script-time-based-pauses";
import { stripPhaseHeaders } from "./script-time-based-generate";

/** Stop fitting once predicted length is within this of the target. */
const FIT_AIM_PCT = 2;

export type SilenceFitStep =
  | "none"
  | "long_pauses"
  | "short_pauses"
  | "extra_music"
  | "outside";

export type SilenceFitWhy =
  | "Too many words"
  | "Too few words"
  | "Too few long pauses"
  | "Long pauses at maximum"
  | "Long pauses at minimum"
  | null;

export type SilenceFitResult = {
  scriptAsWritten: string;
  /** TTS script (headers stripped, pauses converted). */
  script: string;
  scriptWithHeadersAfter: string;
  scriptWithHeadersBefore: string;
  speechSeconds: number;
  speechShare: number;
  words: number;
  predictedSecondsBefore: number;
  predictedSecondsAfter: number;
  shortPauseSecondsBefore: number;
  shortPauseSecondsAfter: number;
  longPauseCount: number;
  longPauseSecondsBefore: number;
  longPauseSecondsAfter: number;
  longestLongPauseAfter: number;
  extraClosingMusicSeconds: number;
  fitStep: SilenceFitStep;
  outsideTolerance: boolean;
  why: SilenceFitWhy;
  longPauseScales: number[];
  shortPauseScale: number;
};

function withinPct(predicted: number, target: number, pct: number): boolean {
  return Math.abs(predicted - target) / Math.max(1, target) <= pct / 100;
}

function applyShortPauseScale(
  tokens: TimePauseToken[],
  scale: number,
): TimePauseToken[] {
  return tokens.map((t) => {
    if (t.kind !== "ordinary") return t;
    return {
      ...t,
      seconds: Math.max(0.2, Math.round(t.seconds * scale * 10) / 10),
    };
  });
}

function redistributeLongPauses(params: {
  tokens: TimePauseToken[];
  neededLongSeconds: number;
  shortest: number;
  longest: number;
}): {
  tokens: TimePauseToken[];
  scales: number[];
  total: number;
  longestAfter: number;
} {
  const tokens = params.tokens.map((t) => ({ ...t }));
  const idxs: number[] = [];
  const suggested: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.kind === "extendable") {
      idxs.push(i);
      suggested.push(Math.max(0.2, t.seconds));
    }
  }
  if (idxs.length === 0) {
    return { tokens, scales: [], total: 0, longestAfter: 0 };
  }
  const sumSug = suggested.reduce((a, b) => a + b, 0) || idxs.length;
  const assigned = suggested.map(
    (s) =>
      Math.min(
        params.longest,
        Math.max(params.shortest, (s / sumSug) * params.neededLongSeconds),
      ),
  );
  let total = assigned.reduce((a, b) => a + b, 0);
  let remaining = params.neededLongSeconds - total;
  if (remaining > 0.05) {
    for (let pass = 0; pass < 8 && remaining > 0.05; pass++) {
      const open = assigned
        .map((v, i) => ({ i, room: params.longest - v }))
        .filter((x) => x.room > 0.05);
      if (!open.length) break;
      const each = remaining / open.length;
      for (const o of open) {
        const add = Math.min(o.room, each);
        assigned[o.i]! += add;
        remaining -= add;
      }
    }
  } else if (remaining < -0.05) {
    let excess = -remaining;
    for (let pass = 0; pass < 8 && excess > 0.05; pass++) {
      const open = assigned
        .map((v, i) => ({ i, room: v - params.shortest }))
        .filter((x) => x.room > 0.05);
      if (!open.length) break;
      const each = excess / open.length;
      for (const o of open) {
        const sub = Math.min(o.room, each);
        assigned[o.i]! -= sub;
        excess -= sub;
      }
    }
  }

  const scales: number[] = [];
  let longestAfter = 0;
  total = 0;
  for (let i = 0; i < idxs.length; i++) {
    const sec = Math.round(assigned[i]! * 10) / 10;
    const idx = idxs[i]!;
    const before = suggested[i]!;
    tokens[idx] = { kind: "extendable", seconds: sec };
    scales.push(before > 0 ? sec / before : 1);
    longestAfter = Math.max(longestAfter, sec);
    total += sec;
  }
  return { tokens, scales, total, longestAfter };
}

function whyLongPausesNotEnough(params: {
  speechSeconds: number;
  target: number;
  speechShare: number;
  speakingBandMin: number;
  speakingBandMax: number;
  longCount: number;
  longAfter: number;
  shortest: number;
  longest: number;
}): SilenceFitWhy {
  if (params.speechSeconds > params.target) return "Too many words";
  if (params.longCount <= 0) return "Too few long pauses";
  if (params.speechShare > params.speakingBandMax + 0.001) {
    return "Too many words";
  }
  if (params.longAfter >= params.longCount * params.longest - 0.5) {
    return "Long pauses at maximum";
  }
  if (params.longAfter <= params.longCount * params.shortest + 0.5) {
    return "Long pauses at minimum";
  }
  if (params.speechShare < params.speakingBandMin - 0.001) {
    return "Too few words";
  }
  return "Too few words";
}

export function fitSilenceFitScript(params: {
  scriptWithHeaders: string;
  effectiveWpm: number;
  targetSeconds: number;
  lengthTolerancePct: number;
  speakingBandMin: number;
  speakingBandMax: number;
  shortestLongPauseSeconds: number;
  longestSingleSilenceSeconds: number;
  shortPauseAdjustLimit: number;
  extraClosingMusicSeconds: number;
}): SilenceFitResult {
  const scriptWithHeadersBefore = params.scriptWithHeaders;
  const tokens0 = stripLeadingPauseTokens(
    tokenizeTimeBasedScript(params.scriptWithHeaders),
  );
  const beforeTotals = pauseTotalsFromTokens(tokens0);
  const plain = scriptFromTimePauseTokens(tokens0);
  const spokenPlain = stripPhaseHeaders(plain);
  const words = countSpokenWords(spokenPlain);
  // Speech time from actual spoken words ÷ effective WPM (not a band setting).
  const speechSeconds = (words / Math.max(1, params.effectiveWpm)) * 60;
  const speechShare =
    params.targetSeconds > 0 ? speechSeconds / params.targetSeconds : 0;

  const shortBefore = beforeTotals.ordinarySeconds;
  const longBefore = beforeTotals.extendableSeconds;
  const longCount = beforeTotals.extendableCount;
  const predictedBefore = speechSeconds + shortBefore + longBefore;

  let tokens: TimePauseToken[] = tokens0.map((t) => ({ ...t }));
  let shortAfter = shortBefore;
  let longAfter = longBefore;
  let longestLong = 0;
  let shortScale = 1;
  let longScales: number[] = [];
  let extraMusic = 0;
  let fitStep: SilenceFitStep = "none";
  let why: SilenceFitWhy = null;

  const target = params.targetSeconds;
  const shortest = params.shortestLongPauseSeconds;
  const longest = params.longestSingleSilenceSeconds;
  const predicted = () => speechSeconds + shortAfter + longAfter + extraMusic;
  const onTarget = () => withinPct(predicted(), target, FIT_AIM_PCT);

  longestLong = longCount
    ? Math.max(
        ...tokens
          .filter((t) => t.kind === "extendable")
          .map((t) => (t as { seconds: number }).seconds),
        0,
      )
    : 0;

  // Always aim for the target. "None" only when already within ±2%.
  // Was: skip fitting when within lengthTolerancePct.
  if (!onTarget()) {
    const neededLong = Math.max(0, target - speechSeconds - shortBefore);
    if (longCount > 0) {
      const red = redistributeLongPauses({
        tokens,
        neededLongSeconds: neededLong,
        shortest,
        longest,
      });
      tokens = red.tokens;
      longScales = red.scales;
      longAfter = red.total;
      longestLong = red.longestAfter;
      shortAfter = pauseTotalsFromTokens(tokens).ordinarySeconds;
      fitStep = "long_pauses";
    } else {
      why = "Too few long pauses";
      fitStep = "outside";
    }

    if (fitStep !== "outside" && !onTarget()) {
      why = whyLongPausesNotEnough({
        speechSeconds,
        target,
        speechShare,
        speakingBandMin: params.speakingBandMin,
        speakingBandMax: params.speakingBandMax,
        longCount,
        longAfter,
        shortest,
        longest,
      });
      const need = target - speechSeconds - longAfter;
      if (shortBefore > 0.05) {
        const rawScale = need / shortBefore;
        const lim = params.shortPauseAdjustLimit;
        shortScale = Math.min(1 + lim, Math.max(1 - lim, rawScale));
        tokens = applyShortPauseScale(tokens, shortScale);
        const tot = pauseTotalsFromTokens(tokens);
        shortAfter = tot.ordinarySeconds;
        longAfter = tot.extendableSeconds;
        fitStep = "short_pauses";
      }
    }

    if (fitStep !== "outside" && !onTarget()) {
      const still = predicted();
      if (still < target - 0.05 && params.extraClosingMusicSeconds > 0) {
        // Closing-music lengthening not wired for silence-fit yet — skip.
        // Was: extraMusic = Math.min(params.extraClosingMusicSeconds, target - still);
        // fitStep = "extra_music";
        extraMusic = 0;
        void params.extraClosingMusicSeconds;
      }
    }

    if (!onTarget()) {
      fitStep = "outside";
      if (!why) {
        why = whyLongPausesNotEnough({
          speechSeconds,
          target,
          speechShare,
          speakingBandMin: params.speakingBandMin,
          speakingBandMax: params.speakingBandMax,
          longCount,
          longAfter,
          shortest,
          longest,
        });
      }
    }
  }

  const scriptWithHeadersAfter = scriptWithExtendableMarkers(tokens);
  const script = stripPhaseHeaders(scriptFromTimePauseTokens(tokens));
  const predictedAfter = predicted();
  // Flag vs length tolerance; fit always aimed at target (±2% stop).
  const outsideTolerance = !withinPct(
    predictedAfter,
    target,
    params.lengthTolerancePct,
  );
  // Why stays when we needed more than long pauses (short / outside), even if
  // eventually within length tolerance.
  const keepWhy =
    fitStep === "short_pauses" ||
    fitStep === "extra_music" ||
    fitStep === "outside";

  return {
    scriptAsWritten: stripPhaseHeaders(scriptWithHeadersBefore),
    script,
    scriptWithHeadersAfter,
    scriptWithHeadersBefore,
    speechSeconds: Math.round(speechSeconds * 10) / 10,
    // Keep enough precision for nearest-1% display (not 10% buckets).
    speechShare: Math.round(speechShare * 10000) / 10000,
    words,
    predictedSecondsBefore: Math.round(predictedBefore * 10) / 10,
    predictedSecondsAfter: Math.round(predictedAfter * 10) / 10,
    shortPauseSecondsBefore: Math.round(shortBefore * 10) / 10,
    shortPauseSecondsAfter: Math.round(shortAfter * 10) / 10,
    longPauseCount: longCount,
    longPauseSecondsBefore: Math.round(longBefore * 10) / 10,
    longPauseSecondsAfter: Math.round(longAfter * 10) / 10,
    longestLongPauseAfter: Math.round(longestLong * 10) / 10,
    extraClosingMusicSeconds: Math.round(extraMusic * 10) / 10,
    fitStep,
    outsideTolerance,
    why: keepWhy ? why : null,
    longPauseScales: longScales,
    shortPauseScale: shortScale,
  };
}

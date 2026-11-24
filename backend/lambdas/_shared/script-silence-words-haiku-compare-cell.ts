/**
 * One Silence-fit · words + Haiku compare pair: shared Sonnet write, then
 * stream/parallel Haiku vs gated/serial Haiku on the same script — each path
 * also runs create's Fish PCM + FX OLA so Total = wall clock to audio-ready.
 *
 * Stream: kick synthesizeFishPcmFxOla per phase as it closes, stitch PCM, one AAC.
 * Gated: after Haiku, one full-script synthesizeFishPcmFxOla (+ AAC).
 * Pauses = PCM zeros on the dry timeline (same as create) — not ffmpeg silence.
 */
import { getClaudeApiKey } from "./anthropic-messages";
import type { AnthropicMessageUsage } from "./anthropic-pricing";
import {
  coerceDeliveryProfiles,
  defaultDeliveryProfiles,
  sessionAroundFromProfiles,
} from "./delivery-profiles";
import {
  aroundScriptSeconds,
  TITLE_INTRO_SPEECH_SECONDS,
} from "./meditation-length-fit";
import { CALIBRATION_MEDIAN_WPM } from "./script-calibration-batch";
import { coerceScriptGenerationSettings } from "./script-generation-settings";
import {
  generateSilenceWordsHaikuScript,
  type SilenceWordsHaikuAccuracy,
  type SilenceWordsHaikuGenerateResult,
} from "./script-silence-words-haiku-generate";
import type { SilenceFitOptionId } from "./script-silence-fit-settings";
import type { TimeBasedCallUsage } from "./script-time-based-generate";
import {
  awaitPhasePcmJobsAndAssemble,
  kickPhasePcmJob,
  loadCompareTtsContext,
  synthesizeComparePcm,
  type ComparePcmJobResult,
} from "./script-tts-assemble";
import { loadDeliveryProfileRecord } from "./voice-calibration-store";

export class CompareStopError extends Error {
  constructor() {
    super("Compare run stopped");
    this.name = "CompareStopError";
  }
}

const PAUSE_RENDER_SCALE = 1.12;

function transcriptFromBrief(brief: string): string {
  return `User: ${brief.trim()}`;
}

function emptyUsage(): AnthropicMessageUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_5m_input_tokens: 0,
    cache_creation_1h_input_tokens: 0,
  };
}

function aggregateUsages(usages: TimeBasedCallUsage[]): AnthropicMessageUsage {
  const usage = emptyUsage();
  for (const u of usages) {
    usage.input_tokens += u.input_tokens;
    usage.output_tokens += u.output_tokens;
    usage.cache_creation_input_tokens =
      (usage.cache_creation_input_tokens ?? 0) +
      (u.cache_creation_input_tokens ?? 0);
    usage.cache_read_input_tokens =
      (usage.cache_read_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  }
  return usage;
}

export type SilenceWordsHaikuCompareModeId = "stream" | "gated";

export type SilenceWordsHaikuCompareModeResult = {
  mode: SilenceWordsHaikuCompareModeId;
  streamingPartial: boolean;
  haikuParallel: boolean;
  accuracy: SilenceWordsHaikuAccuracy;
  scriptText: string;
  scriptAsWritten: string;
  scriptAfterHaiku: string;
  wordBudget: number;
  /** Haiku + silence-fit wall time (ms). */
  haikuMs: number;
  /**
   * Wall clock start→audio ready for this product path.
   * Stream overlaps TTS with remaining Sonnet/Haiku; gated is sequential.
   */
  totalMs: number;
  /** Script-only wall (Sonnet+Haiku+fit), before TTS assemble finishes. */
  scriptMs: number;
  /** Sum of Fish TTS API time across phases / one call (not wall). */
  ttsMs: number;
  /** Stitch + AAC after phase jobs (stream) or encode inside gated OLA. */
  assembleMs: number;
  /** Phase audio jobs kicked (stream) or 1 (gated). */
  ttsPhases: number;
  audioBytes: number;
  ttsVoiceId: string | null;
  haikuUsd: number;
  claudeUsd: number;
  phasesAttempted: number;
  phasesFixed: number;
  phasesRejected: number;
  haikuRan: boolean;
  usage: AnthropicMessageUsage;
  usages: TimeBasedCallUsage[];
};

export type SilenceWordsHaikuComparePair = {
  option: SilenceFitOptionId;
  minutes: number;
  briefIndex: number;
  brief: string;
  path: "silence_words_haiku_compare";
  sonnetMs: number;
  scriptAsWritten: string;
  wordBudget: number;
  ttsVoiceId?: string;
  ttsVoiceName?: string;
  stream: SilenceWordsHaikuCompareModeResult;
  gated: SilenceWordsHaikuCompareModeResult;
  error?: string;
};

function modeFromGenerated(params: {
  mode: SilenceWordsHaikuCompareModeId;
  streamingPartial: boolean;
  haikuParallel: boolean;
  generated: SilenceWordsHaikuGenerateResult;
  sonnetMs: number;
  haikuMs: number;
  /** Wall clock start→audio ready (may overlap Sonnet|Haiku|TTS). */
  totalMs: number;
  scriptMs: number;
  ttsMs: number;
  assembleMs: number;
  ttsPhases: number;
  audioBytes: number;
  ttsVoiceId: string | null;
  sonnetUsages: TimeBasedCallUsage[];
}): SilenceWordsHaikuCompareModeResult {
  const haikuOnlyUsages = params.generated.haiku.usages;
  const modeUsages = [...params.sonnetUsages, ...haikuOnlyUsages];
  const claudeUsd =
    Math.round(
      modeUsages.reduce((s, u) => s + (u.usd || 0), 0) * 1e6,
    ) / 1e6;
  const haikuUsd =
    Math.round(
      (params.generated.haiku.haikuUsd ||
        haikuOnlyUsages.reduce((s, u) => s + (u.usd || 0), 0)) *
        1e6,
    ) / 1e6;
  const phasesAttempted = params.generated.haiku.phaseResults.filter(
    (r) => r.attempted,
  ).length;
  return {
    mode: params.mode,
    streamingPartial: params.streamingPartial,
    haikuParallel: params.haikuParallel,
    accuracy: params.generated.accuracy,
    scriptText: params.generated.script,
    scriptAsWritten: params.generated.scriptAsWritten,
    scriptAfterHaiku: params.generated.scriptAfterHaiku,
    wordBudget: params.generated.wordBudget,
    haikuMs: params.haikuMs,
    totalMs: params.totalMs,
    scriptMs: params.scriptMs,
    ttsMs: params.ttsMs,
    assembleMs: params.assembleMs,
    ttsPhases: params.ttsPhases,
    audioBytes: params.audioBytes,
    ttsVoiceId: params.ttsVoiceId,
    haikuUsd,
    claudeUsd,
    phasesAttempted,
    phasesFixed: params.generated.haiku.phasesFixed,
    phasesRejected: params.generated.haiku.phasesRejected,
    haikuRan: params.generated.haiku.haikuRan,
    usage: aggregateUsages(modeUsages),
    usages: modeUsages,
  };
}

export async function runSilenceWordsHaikuComparePair(params: {
  modelId: string;
  option: SilenceFitOptionId;
  minutes: number;
  briefIndex: number;
  brief: string;
  /** When true, abort between major stages (Stop button). */
  checkStop?: () => Promise<boolean>;
}): Promise<SilenceWordsHaikuComparePair> {
  const throwIfStopped = async () => {
    if (params.checkStop && (await params.checkStop())) {
      throw new CompareStopError();
    }
  };
  const apiKey = await getClaudeApiKey();
  let profiles = defaultDeliveryProfiles();
  let sg = coerceScriptGenerationSettings(undefined);
  try {
    const rec = await loadDeliveryProfileRecord();
    profiles = coerceDeliveryProfiles(rec.profiles);
    sg = coerceScriptGenerationSettings(rec.scriptGeneration);
  } catch {
    /* defaults */
  }
  const around = sessionAroundFromProfiles(profiles);
  const aroundTotal = aroundScriptSeconds({
    around,
    titleSpeechSeconds: TITLE_INTRO_SPEECH_SECONDS,
    pauseScale: PAUSE_RENDER_SCALE,
  });
  const scriptTimeSeconds = Math.max(30, params.minutes * 60 - aroundTotal);
  const base = {
    apiKey,
    model: params.modelId,
    haikuModelId: sg.styleInferModelId,
    transcript: transcriptFromBrief(params.brief),
    option: params.option,
    minutes: params.minutes,
    profiles,
    silenceWordsHaiku: sg.silenceWordsHaiku,
    scriptTimeSeconds,
    effectiveWpm: CALIBRATION_MEDIAN_WPM,
    lengthTolerancePct: profiles.shared.lengthTolerancePct ?? 10,
    source: "admin" as const,
  };

  const started = Date.now();
  try {
    const ttsCtx = await loadCompareTtsContext();
    const phaseTtsJobs = new Map<number, Promise<ComparePcmJobResult>>();
    const pcmCommon = {
      apiKey: ttsCtx.apiKey,
      voiceId: ttsCtx.voice.voiceId,
      speechifyRate: ttsCtx.voice.speechifyRate,
      pauseBands: ttsCtx.pauseBands,
      pauseScale: ttsCtx.pauseScale,
      bucket: ttsCtx.bucket,
      voiceFxDial: ttsCtx.voiceFxDial,
    };

    await throwIfStopped();
    // Stream: Sonnet SSE + Haiku as phases close + Speechify PCM+FX OLA per phase.
    // totalMs = wall start → PCM stitch + AAC (create stream assemble).
    const streamGen = await generateSilenceWordsHaikuScript({
      ...base,
      streamingPartial: true,
      haikuParallel: true,
      onPhaseReady: ({ phaseIndex, ttsBody }) => {
        kickPhasePcmJob({
          jobs: phaseTtsJobs,
          phaseIndex,
          script: ttsBody,
          ...pcmCommon,
        });
      },
    });
    const sonnetMs = streamGen.timing.sonnetMs;
    const sonnetUsages = streamGen.usages.filter((u) =>
      /silence-words-haiku-write/.test(u.label),
    );
    const scriptAsWritten = streamGen.scriptAsWritten;
    const streamScriptMs = streamGen.timing.totalMs;

    await throwIfStopped();
    if (phaseTtsJobs.size === 0 && streamGen.script.trim()) {
      kickPhasePcmJob({
        jobs: phaseTtsJobs,
        phaseIndex: 0,
        script: streamGen.script,
        ...pcmCommon,
      });
    }
    const streamAudio = await awaitPhasePcmJobsAndAssemble({
      jobs: phaseTtsJobs,
    });
    const streamTotalMs = Date.now() - started;
    void streamAudio.audio.byteLength;

    await throwIfStopped();
    // Gated: same Sonnet script → serial Haiku if needed → one full-script OLA.
    const gatedScriptStarted = Date.now();
    const gatedGen = await generateSilenceWordsHaikuScript({
      ...base,
      scriptAsWrittenOverride: scriptAsWritten,
      priorUsages: sonnetUsages,
      streamingPartial: false,
      haikuParallel: false,
    });
    const gatedHaikuMs = gatedGen.timing.haikuMs;
    const gatedScriptMs = Date.now() - gatedScriptStarted;
    await throwIfStopped();
    const gatedTtsStarted = Date.now();
    const gatedTts = await synthesizeComparePcm({
      ...pcmCommon,
      script: gatedGen.script,
      encodeAac: true,
      applyFx: true,
    });
    const gatedTtsWallMs = Date.now() - gatedTtsStarted;
    void gatedTts.deliveryAac.byteLength;
    const gatedTotalMs = sonnetMs + gatedHaikuMs + gatedTtsWallMs;

    return {
      option: params.option,
      minutes: params.minutes,
      briefIndex: params.briefIndex,
      brief: params.brief,
      path: "silence_words_haiku_compare",
      sonnetMs,
      scriptAsWritten,
      wordBudget: streamGen.wordBudget,
      ttsVoiceId: ttsCtx.voice.voiceId,
      ttsVoiceName: ttsCtx.voice.name,
      stream: modeFromGenerated({
        mode: "stream",
        streamingPartial: true,
        haikuParallel: true,
        generated: streamGen,
        sonnetMs,
        haikuMs: streamGen.timing.haikuMs,
        totalMs: streamTotalMs,
        scriptMs: streamScriptMs,
        ttsMs: streamAudio.ttsMsSum,
        assembleMs: streamAudio.assembleMs,
        ttsPhases: streamAudio.phaseCount,
        audioBytes: streamAudio.audio.byteLength,
        ttsVoiceId: ttsCtx.voice.voiceId,
        sonnetUsages,
      }),
      gated: modeFromGenerated({
        mode: "gated",
        streamingPartial: false,
        haikuParallel: false,
        generated: gatedGen,
        sonnetMs,
        haikuMs: gatedHaikuMs,
        totalMs: gatedTotalMs,
        scriptMs: gatedScriptMs,
        ttsMs: gatedTts.ttsMs,
        assembleMs: Math.max(0, gatedTtsWallMs - gatedTts.ttsMs),
        ttsPhases: 1,
        audioBytes: gatedTts.deliveryAac.byteLength,
        ttsVoiceId: ttsCtx.voice.voiceId,
        sonnetUsages,
      }),
    };
  } catch (e) {
    if (e instanceof CompareStopError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    const emptyAcc = {
      targetSeconds: Math.round(scriptTimeSeconds),
      speakingBandMin: 0,
      speakingBandMax: 1,
      speechSeconds: 0,
      speechShare: 0,
      speechShareSonnet: 0,
      words: 0,
      wordBudget: 0,
      headerWordTotal: 0,
      wordsWritten: 0,
      wordsVsBudgetPct: 0,
      wordsVsBudgetSonnetPct: 0,
      effectiveWpm: CALIBRATION_MEDIAN_WPM,
      predictedSecondsBefore: 0,
      predictedSecondsAfter: 0,
      estimatedTotalAudioSeconds: 0,
      shortPauseSecondsBefore: 0,
      shortPauseSecondsAfter: 0,
      longPauseCount: 0,
      longPauseSecondsBefore: 0,
      longPauseSecondsAfter: 0,
      longestLongPauseAfter: 0,
      ordinaryPauseCount: 0,
      ordinaryPauseAverageSeconds: null,
      ordinaryPauseLongestSeconds: 0,
      extendablePauseCount: 0,
      extendablePauseTotalSeconds: 0,
      namedMarkersUsed: 0,
      extraClosingMusicSeconds: 0,
      fitStep: "none",
      outsideTolerance: true,
      why: null,
      insideSpeakingBand: false,
      lengthTolerancePct: profiles.shared.lengthTolerancePct ?? 10,
      phases: [],
      scriptWithHeadersBefore: "",
      scriptWithHeadersAfter: "",
      haikuRan: false,
      wordsBeforeHaiku: 0,
      wordsAfterHaiku: 0,
      phasesFixed: 0,
      phasesRejected: 0,
      phaseResults: [],
      haikuUsd: 0,
      scriptAsWritten: "",
      scriptAfterHaiku: "",
    } satisfies SilenceWordsHaikuAccuracy;
    const emptyMode = (
      mode: SilenceWordsHaikuCompareModeId,
      streamingPartial: boolean,
      haikuParallel: boolean,
    ): SilenceWordsHaikuCompareModeResult => ({
      mode,
      streamingPartial,
      haikuParallel,
      accuracy: emptyAcc,
      scriptText: "",
      scriptAsWritten: "",
      scriptAfterHaiku: "",
      wordBudget: 0,
      haikuMs: 0,
      totalMs: Date.now() - started,
      scriptMs: 0,
      ttsMs: 0,
      assembleMs: 0,
      ttsPhases: 0,
      audioBytes: 0,
      ttsVoiceId: null,
      haikuUsd: 0,
      claudeUsd: 0,
      phasesAttempted: 0,
      phasesFixed: 0,
      phasesRejected: 0,
      haikuRan: false,
      usage: emptyUsage(),
      usages: [],
    });
    return {
      option: params.option,
      minutes: params.minutes,
      briefIndex: params.briefIndex,
      brief: params.brief,
      path: "silence_words_haiku_compare",
      sonnetMs: Date.now() - started,
      scriptAsWritten: "",
      wordBudget: 0,
      stream: emptyMode("stream", true, true),
      gated: emptyMode("gated", false, false),
      error: msg.slice(0, 240),
    };
  }
}

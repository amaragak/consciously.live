/**
 * Admin › Script generation · Length preview.
 * Generates a script (no default TTS) and predicts total session length
 * per voice: script part + parts around the script.
 */
import { getClaudeApiKey } from "./anthropic-messages";
import {
  defaultDeliveryProfiles,
  sessionAroundFromProfiles,
  spaceRangeFor,
  spaceRangeMidSilence,
  type DeliveryId,
} from "./delivery-profiles";
import {
  aroundScriptSeconds,
  countSpokenWords,
  lengthPctVsRequested,
  loadVoicePaceTable,
  predictTotalSessionSeconds,
  productionSlowing,
  resolveVoicePace,
  TITLE_INTRO_SPEECH_SECONDS,
  titleIntroPauseSecondsWritten,
  titleSpeechSecondsFromWords,
  type SessionAroundScript,
} from "./meditation-length-fit";
import {
  CALIBRATION_MEDIAN_WPM,
  type CalibrationCellResult,
} from "./script-calibration-batch";
import {
  predictScriptPartSeconds,
  runSectionedScriptCell,
  runSingleCallScriptCell,
} from "./script-single-call-compare";
import {
  correctionForModel,
  scriptWriteModeFor,
  singleCallCorrectionForModel,
  wordsPerSentenceForDelivery,
  type ScriptGenerationSettings,
  type ScriptWriteMode,
} from "./script-generation-settings";
import { sumPauseMarkerSeconds } from "./script-pause-bands";
import { generateTimeBasedScript } from "./script-time-based-generate";
import { runSilenceFitScriptCell } from "./script-silence-fit-cost-cell";
import { runSilenceHaikuScriptCell } from "./script-silence-haiku-cost-cell";
import { runSilenceWordsScriptCell } from "./script-silence-words-cost-cell";
import { runSilenceWordsHaikuScriptCell } from "./script-silence-words-haiku-cost-cell";
import { silenceFitOptionFromDelivery } from "./script-silence-fit-settings";
import { listVoiceSpeakers } from "./voice-admin";
import { FIXED_SPEECH_PREVIEW_SPEED } from "./speaker-sample-speed";

const PAUSE_RENDER_SCALE = 1.12;

export type LengthPreviewVoiceRow = {
  modelId: string;
  name: string;
  brand: string;
  effectiveWpm: number;
  scriptPartSeconds: number;
  predictedTotalSeconds: number;
  pctVsRequested: number;
  within10: boolean;
};

export type LengthPreviewResult = {
  delivery: DeliveryId;
  minutes: number;
  mode: ScriptWriteMode;
  brief: string;
  modelId: string;
  cell: CalibrationCellResult;
  around: SessionAroundScript & {
    titleSpeechSeconds: number;
    titlePauseRendered: number;
    aroundTotalSeconds: number;
  };
  targetWords: number;
  writtenWords: number;
  plannedPauseSeconds: number;
  writtenPauseSeconds: number;
  pauseScale: number;
  scriptTargetSeconds: number;
  voices: LengthPreviewVoiceRow[];
  medianPctVsRequested: number;
  /** Time-based mode outline (stripped before TTS; deprecated). */
  outline?: string;
  /** Time-based script with phase headers (admin preview; TTS uses cell.scriptText). */
  scriptWithHeaders?: string;
  /** Time-based phase header vs actual. */
  timePhases?: Array<{
    name: string;
    headerMinutes: number;
    headerSentences: number;
    actualSentences: number;
    words: number;
    speechSeconds: number;
    pauseSeconds: number;
  }>;
};

export async function runLengthPreview(params: {
  settings: ScriptGenerationSettings;
  modelId: string;
  delivery: DeliveryId;
  minutes: number;
  mode?: ScriptWriteMode;
  brief: string;
  title?: string;
}): Promise<LengthPreviewResult> {
  const profiles = defaultDeliveryProfiles();
  const around = sessionAroundFromProfiles(profiles);
  const mode =
    params.mode ??
    scriptWriteModeFor(params.settings, params.delivery, params.minutes);
  const seeded = correctionForModel(
    params.settings,
    params.modelId,
    params.settings.scriptModelId,
  );
  const sectioned = seeded.correction;
  const single = singleCallCorrectionForModel(seeded.settings, params.modelId);

  let outline: string | undefined;
  let scriptWithHeaders: string | undefined;
  let timePhases: LengthPreviewResult["timePhases"];
  let cell: CalibrationCellResult;
  if (mode === "time") {
    const apiKey = await getClaudeApiKey();
    const aroundTotalPreview = aroundScriptSeconds({
      around,
      titleSpeechSeconds: TITLE_INTRO_SPEECH_SECONDS,
      pauseScale: PAUSE_RENDER_SCALE,
    });
    const scriptTimeSeconds = Math.max(
      30,
      params.minutes * 60 - aroundTotalPreview,
    );
    const generated = await generateTimeBasedScript({
      apiKey,
      model: params.modelId,
      trimModel: params.settings.styleInferModelId || params.modelId,
      transcript: `User: ${params.brief.trim()}`,
      delivery: params.delivery,
      profiles,
      scriptTimeSeconds,
      effectiveWpm: CALIBRATION_MEDIAN_WPM,
      lengthTolerancePct: profiles.shared.lengthTolerancePct,
      wordsPerSentence: wordsPerSentenceForDelivery(
        params.settings,
        params.delivery,
      ),
      source: "admin",
    });
    outline = generated.outline;
    scriptWithHeaders = generated.scriptWithHeaders;
    timePhases = generated.phases.map((p) => ({
      name: p.name,
      headerMinutes: p.headerMinutes,
      headerSentences: p.headerSentences,
      actualSentences: p.actualSentences,
      words: p.words,
      speechSeconds: p.speechSeconds,
      pauseSeconds: p.pauseSeconds,
    }));
    const writtenWords = countSpokenWords(generated.script);
    const writtenPauseSeconds = sumPauseMarkerSeconds(generated.script);
    cell = {
      delivery: params.delivery,
      minutes: params.minutes,
      briefIndex: 0,
      brief: params.brief,
      path: "time",
      sections: [],
      targetWords: Math.round(
        (scriptTimeSeconds / 60) *
          (1 - spaceRangeMidSilence(spaceRangeFor(profiles, params.delivery))) *
          CALIBRATION_MEDIAN_WPM,
      ),
      writtenWords,
      plannedPauseSeconds: generated.pauseSecondsAfter,
      writtenPauseSeconds,
      scriptText: generated.script,
      outline: generated.outline,
      timePhases: generated.phases,
      timeOutsideTolerance: generated.outsideTolerance,
      timeOutsideReason: generated.outsideReason,
      timeLengthAccuracy: generated.lengthAccuracy,
      planMs: 0,
      writeMs: 0,
    };
  } else if (mode === "single") {
    cell = await runSingleCallScriptCell({
      modelId: params.modelId,
      delivery: params.delivery,
      minutes: params.minutes,
      briefIndex: 0,
      brief: params.brief,
      correction: single,
    });
  } else if (
    mode === "silence" ||
    mode === "silence_haiku" ||
    mode === "silence_words" ||
    mode === "silence_words_haiku"
  ) {
    const option = silenceFitOptionFromDelivery(params.delivery);
    cell =
      mode === "silence_words_haiku"
        ? await runSilenceWordsHaikuScriptCell({
            modelId: params.modelId,
            option,
            minutes: params.minutes,
            briefIndex: 0,
            brief: params.brief,
          })
        : mode === "silence_words"
        ? await runSilenceWordsScriptCell({
            modelId: params.modelId,
            option,
            minutes: params.minutes,
            briefIndex: 0,
            brief: params.brief,
          })
        : mode === "silence_haiku"
          ? await runSilenceHaikuScriptCell({
              modelId: params.modelId,
              option,
              minutes: params.minutes,
              briefIndex: 0,
              brief: params.brief,
            })
          : await runSilenceFitScriptCell({
              modelId: params.modelId,
              option,
              minutes: params.minutes,
              briefIndex: 0,
              brief: params.brief,
            });
    if (cell.scriptTextAsWritten || cell.scriptTextAfterHaiku) {
      scriptWithHeaders =
        cell.silenceWordsHaikuAccuracy?.scriptWithHeadersAfter ||
        cell.silenceWordsAccuracy?.scriptWithHeadersAfter ||
        cell.silenceHaikuAccuracy?.scriptWithHeadersAfter ||
        cell.silenceFitAccuracy?.scriptWithHeadersAfter ||
        cell.scriptText;
    }
    if (cell.timePhases?.length) {
      timePhases = cell.timePhases.map((p) => ({
        name: p.name,
        headerMinutes: p.headerMinutes,
        headerSentences: p.headerSentences,
        actualSentences: p.actualSentences,
        words: p.words,
        speechSeconds: p.speechSeconds,
        pauseSeconds: p.pauseSeconds,
      }));
    }
  } else {
    cell = await runSectionedScriptCell({
      modelId: params.modelId,
      delivery: params.delivery,
      minutes: params.minutes,
      briefIndex: 0,
      brief: params.brief,
      correction: sectioned,
    });
  }

  const titleWords = countSpokenWords(params.title?.trim() || "A short practice.");
  const titleSpeech = titleSpeechSecondsFromWords(
    titleWords,
    CALIBRATION_MEDIAN_WPM,
  );
  const titlePauseWritten = titleIntroPauseSecondsWritten(around);
  const aroundTotal = aroundScriptSeconds({
    around,
    titleSpeechSeconds: titleSpeech,
    pauseScale: PAUSE_RENDER_SCALE,
  });
  const requested = params.minutes * 60;
  const scriptTargetSeconds = Math.max(30, requested - aroundTotal);

  const paceTable = await loadVoicePaceTable();
  const speakers = await listVoiceSpeakers();
  const voices: LengthPreviewVoiceRow[] = [];
  for (const s of speakers) {
    if (s.hidden) continue;
    const brand = s.brand === "speechify" ? "speechify" : "fish";
    const slowing = productionSlowing({
      brand,
      speechifyRatePct: brand === "speechify" ? -20 : null,
      fishSpeed: brand === "fish" ? FIXED_SPEECH_PREVIEW_SPEED : null,
    });
    const pace = resolveVoicePace({
      entry: paceTable.get(s.modelId),
      slowing,
      fallbackWpm: CALIBRATION_MEDIAN_WPM,
    });
    const scriptPart = predictScriptPartSeconds({
      writtenWords: cell.writtenWords,
      writtenPauseSeconds: cell.writtenPauseSeconds,
      effectiveWpm: pace.effectiveWpm,
      pauseScale: PAUSE_RENDER_SCALE,
    });
    // Title speech re-estimated per voice.
    const titleSec = titleSpeechSecondsFromWords(titleWords, pace.effectiveWpm);
    const aroundForVoice = aroundScriptSeconds({
      around,
      titleSpeechSeconds: titleSec,
      pauseScale: PAUSE_RENDER_SCALE,
    });
    const predictedTotal = predictTotalSessionSeconds({
      scriptPartSeconds: scriptPart,
      aroundTotalSeconds: aroundForVoice,
    });
    const pctVsRequested = lengthPctVsRequested(predictedTotal, params.minutes);
    voices.push({
      modelId: s.modelId,
      name: s.name,
      brand,
      effectiveWpm: Math.round(pace.effectiveWpm * 10) / 10,
      scriptPartSeconds: Math.round(scriptPart),
      predictedTotalSeconds: Math.round(predictedTotal),
      pctVsRequested,
      within10: Math.abs(pctVsRequested) <= 10,
    });
  }
  voices.sort((a, b) => a.name.localeCompare(b.name));
  const medianPct =
    voices.length > 0
      ? voices.map((v) => v.pctVsRequested).sort((a, b) => a - b)[
          Math.floor(voices.length / 2)
        ]!
      : lengthPctVsRequested(
          predictTotalSessionSeconds({
            scriptPartSeconds: predictScriptPartSeconds({
              writtenWords: cell.writtenWords,
              writtenPauseSeconds: cell.writtenPauseSeconds,
              effectiveWpm: CALIBRATION_MEDIAN_WPM,
            }),
            aroundTotalSeconds: aroundTotal,
          }),
          params.minutes,
        );

  return {
    delivery: params.delivery,
    minutes: params.minutes,
    mode,
    brief: params.brief,
    modelId: params.modelId,
    cell,
    around: {
      ...around,
      titleSpeechSeconds: Math.round(titleSpeech * 10) / 10,
      titlePauseRendered:
        Math.round(titlePauseWritten * PAUSE_RENDER_SCALE * 10) / 10,
      aroundTotalSeconds: Math.round(aroundTotal),
    },
    targetWords: cell.targetWords,
    writtenWords: cell.writtenWords,
    plannedPauseSeconds: cell.plannedPauseSeconds,
    writtenPauseSeconds: cell.writtenPauseSeconds,
    pauseScale: PAUSE_RENDER_SCALE,
    scriptTargetSeconds: Math.round(scriptTargetSeconds),
    voices,
    medianPctVsRequested: medianPct,
    ...(outline ? { outline } : {}),
    ...(scriptWithHeaders ? { scriptWithHeaders } : {}),
    ...(timePhases?.length ? { timePhases } : {}),
  };
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

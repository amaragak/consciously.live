/**
 * One Silence-fit · words + Haiku option × length × brief cost/accuracy cell.
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
  countSpokenWords,
  TITLE_INTRO_SPEECH_SECONDS,
} from "./meditation-length-fit";
import {
  CALIBRATION_MEDIAN_WPM,
  type CalibrationCellResult,
} from "./script-calibration-batch";
import { coerceScriptGenerationSettings } from "./script-generation-settings";
import {
  cacheRoleFromUsage,
  type ScriptGenCallUsage,
} from "./script-section-generate";
import { sumPauseMarkerSeconds } from "./script-pause-bands";
import { generateSilenceWordsHaikuScript } from "./script-silence-words-haiku-generate";
import {
  silenceFitOptionFromDelivery,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";
import type { TimeBasedCallUsage } from "./script-time-based-generate";
import { loadDeliveryProfileRecord } from "./voice-calibration-store";

const PAUSE_RENDER_SCALE = 1.12;

function transcriptFromBrief(brief: string): string {
  return `User: ${brief.trim()}`;
}

function aggregateUsages(
  usages: TimeBasedCallUsage[],
): { usage: AnthropicMessageUsage; calls: ScriptGenCallUsage[] } {
  const usage: AnthropicMessageUsage = {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_5m_input_tokens: 0,
    cache_creation_1h_input_tokens: 0,
  };
  const calls: ScriptGenCallUsage[] = [];
  for (const u of usages) {
    const callUsage: AnthropicMessageUsage = {
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      thinking_tokens: 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens,
    };
    usage.input_tokens += callUsage.input_tokens;
    usage.output_tokens += callUsage.output_tokens;
    usage.cache_creation_input_tokens =
      (usage.cache_creation_input_tokens ?? 0) +
      (callUsage.cache_creation_input_tokens ?? 0);
    usage.cache_read_input_tokens =
      (usage.cache_read_input_tokens ?? 0) +
      (callUsage.cache_read_input_tokens ?? 0);
    calls.push({
      label: u.label,
      model: u.model,
      ms: 0,
      usage: callUsage,
      cacheRole: cacheRoleFromUsage(callUsage),
    });
  }
  return { usage, calls };
}

export async function runSilenceWordsHaikuScriptCell(params: {
  modelId: string;
  option: SilenceFitOptionId;
  minutes: number;
  briefIndex: number;
  brief: string;
}): Promise<CalibrationCellResult> {
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

  const started = Date.now();
  try {
    const generated = await generateSilenceWordsHaikuScript({
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
      lengthTolerancePct: profiles.shared.lengthTolerancePct,
      source: "admin",
    });
    const { usage, calls } = aggregateUsages(generated.usages);
    const writtenWords = countSpokenWords(generated.script);
    const writtenPauseSeconds = sumPauseMarkerSeconds(generated.script);
    return {
      delivery:
        params.option === "guided_casual"
          ? "casual"
          : params.option === "open_sits"
            ? "open_sits"
            : "guided",
      minutes: params.minutes,
      briefIndex: params.briefIndex,
      brief: params.brief,
      path: "silence_words_haiku",
      silenceFitOption: params.option,
      sections: [],
      targetWords: generated.wordBudget,
      writtenWords,
      plannedPauseSeconds: Math.round(generated.fit.longPauseSecondsAfter),
      writtenPauseSeconds: Math.round(writtenPauseSeconds),
      scriptText: generated.script,
      scriptTextAsWritten: generated.scriptAsWritten,
      scriptTextAfterHaiku: generated.scriptAfterHaiku,
      outline: "",
      timePhases: generated.phases,
      silenceWordsHaikuAccuracy: generated.accuracy,
      planMs: 0,
      writeMs: Date.now() - started,
      usage,
      calls,
      guideAttached: false,
      guideStyle: null,
      guideSource: "none",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      delivery:
        params.option === "guided_casual"
          ? "casual"
          : params.option === "open_sits"
            ? "open_sits"
            : "guided",
      minutes: params.minutes,
      briefIndex: params.briefIndex,
      brief: params.brief,
      path: "silence_words_haiku",
      silenceFitOption: params.option,
      sections: [],
      targetWords: 0,
      writtenWords: 0,
      plannedPauseSeconds: 0,
      writtenPauseSeconds: 0,
      scriptText: "",
      planMs: 0,
      writeMs: Date.now() - started,
      error: msg.slice(0, 240),
    };
  }
}

export function silenceWordsHaikuOptionFromCreateDelivery(
  delivery: "casual" | "guided" | "open_sits",
): SilenceFitOptionId {
  return silenceFitOptionFromDelivery(delivery);
}

/**
 * One delivery × length × brief cell for time-based cost measurement.
 * Stores the same CalibrationCellResult shape so script-gen cost tables work.
 */
import { getClaudeApiKey } from "./anthropic-messages";
import type { AnthropicMessageUsage } from "./anthropic-pricing";
import { CLAUDE_HAIKU_55_MODEL_ID } from "./anthropic-pricing";
import {
  coerceDeliveryProfiles,
  defaultDeliveryProfiles,
  sessionAroundFromProfiles,
  spaceRangeFor,
  spaceRangeMidSilence,
  type DeliveryId,
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
import { wordsPerSentenceForDelivery } from "./script-generation-settings";
import {
  cacheRoleFromUsage,
  type ScriptGenCallUsage,
} from "./script-section-generate";
import { sumPauseMarkerSeconds } from "./script-pause-bands";
import {
  generateTimeBasedScript,
  type TimeBasedCallUsage,
} from "./script-time-based-generate";
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

export async function runTimeBasedScriptCell(params: {
  modelId: string;
  delivery: DeliveryId;
  minutes: number;
  briefIndex: number;
  brief: string;
  trimModelId?: string;
}): Promise<CalibrationCellResult> {
  const apiKey = await getClaudeApiKey();
  let profiles = defaultDeliveryProfiles();
  let wordsPerSentence: number | undefined;
  try {
    const rec = await loadDeliveryProfileRecord();
    profiles = coerceDeliveryProfiles(rec.profiles);
    wordsPerSentence = wordsPerSentenceForDelivery(
      rec.scriptGeneration,
      params.delivery,
    );
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
  const space = spaceRangeFor(profiles, params.delivery);
  const midSpeech = 1 - spaceRangeMidSilence(space);
  const roughWords = Math.round(
    (scriptTimeSeconds / 60) * midSpeech * CALIBRATION_MEDIAN_WPM,
  );

  const started = Date.now();
  try {
    const generated = await generateTimeBasedScript({
      apiKey,
      model: params.modelId,
      trimModel: params.trimModelId || CLAUDE_HAIKU_55_MODEL_ID,
      transcript: transcriptFromBrief(params.brief),
      delivery: params.delivery,
      profiles,
      scriptTimeSeconds,
      effectiveWpm: CALIBRATION_MEDIAN_WPM,
      lengthTolerancePct: profiles.shared.lengthTolerancePct,
      wordsPerSentence,
      source: "admin",
    });
    const { usage, calls } = aggregateUsages(generated.usages);
    const writtenWords = countSpokenWords(generated.script);
    const writtenPauseSeconds = sumPauseMarkerSeconds(generated.script);
    return {
      delivery: params.delivery,
      minutes: params.minutes,
      briefIndex: params.briefIndex,
      brief: params.brief,
      path: "time",
      sections: [],
      targetWords: Math.max(1, roughWords),
      writtenWords,
      plannedPauseSeconds: Math.round(generated.pauseSecondsAfter),
      writtenPauseSeconds: Math.round(writtenPauseSeconds),
      scriptText: generated.script,
      outline: generated.outline,
      timePhases: generated.phases,
      timeOutsideTolerance: generated.outsideTolerance,
      timeOutsideReason: generated.outsideReason,
      timeLengthAccuracy: generated.lengthAccuracy,
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
      delivery: params.delivery,
      minutes: params.minutes,
      briefIndex: params.briefIndex,
      brief: params.brief,
      path: "time",
      sections: [],
      targetWords: Math.max(1, roughWords),
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

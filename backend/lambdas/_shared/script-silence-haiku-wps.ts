/**
 * Measured words-per-sentence for Silence-fit + Haiku options.
 */
import type { CalibrationCellResult } from "./script-calibration-batch";
import {
  defaultSilenceFitModeSettings,
  SILENCE_FIT_OPTIONS,
  type SilenceFitModeSettings,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";
import type { SilenceHaikuModeSettings } from "./script-silence-haiku-settings";
import { countSpokenSentences } from "./script-time-based-generate";
import {
  loadDeliveryProfileRecord,
  loadSilenceHaikuCalibrationCells,
  saveDeliveryProfileRecord,
} from "./voice-calibration-store";

export function computeSilenceHaikuWordsPerSentence(
  cells: CalibrationCellResult[],
): SilenceFitModeSettings["wordsPerSentenceByOption"] {
  const out = defaultSilenceFitModeSettings().wordsPerSentenceByOption;
  for (const option of SILENCE_FIT_OPTIONS) {
    let words = 0;
    let sentences = 0;
    let scriptCount = 0;
    for (const c of cells) {
      const opt = (c.silenceFitOption ?? null) as SilenceFitOptionId | null;
      if (opt !== option || c.error || !c.scriptText?.trim()) continue;
      const w =
        typeof c.writtenWords === "number" && c.writtenWords > 0
          ? c.writtenWords
          : 0;
      let s = 0;
      if (c.timePhases?.length) {
        s = c.timePhases.reduce(
          (sum, p) => sum + (p.actualSentences || 0),
          0,
        );
      }
      if (s <= 0) {
        s = countSpokenSentences(
          c.scriptTextAfterHaiku || c.scriptTextAsWritten || c.scriptText,
        );
      }
      if (w <= 0 || s <= 0) continue;
      words += w;
      sentences += s;
      scriptCount += 1;
    }
    if (scriptCount > 0 && sentences > 0) {
      out[option] = {
        wordsPerSentence: Math.round((words / sentences) * 10) / 10,
        scriptCount,
      };
    }
  }
  return out;
}

export async function refreshSilenceHaikuWordsPerSentenceFromCells(
  modelId: string,
): Promise<SilenceFitModeSettings["wordsPerSentenceByOption"]> {
  const cells = await loadSilenceHaikuCalibrationCells(modelId);
  const measured = computeSilenceHaikuWordsPerSentence(cells);
  const prev = await loadDeliveryProfileRecord();
  const silenceHaiku: SilenceHaikuModeSettings = {
    ...prev.scriptGeneration.silenceHaiku,
    wordsPerSentenceByOption: measured,
  };
  await saveDeliveryProfileRecord({
    profiles: prev.profiles,
    scriptGeneration: {
      ...prev.scriptGeneration,
      silenceHaiku,
    },
    by: "silence-haiku-wps",
    note: "Recalculated silence-haiku words/sentence from cost cells",
  });
  return measured;
}

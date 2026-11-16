/**
 * Measured words-per-sentence for Silence-fit options.
 */
import type { CalibrationCellResult } from "./script-calibration-batch";
import {
  defaultSilenceFitModeSettings,
  SILENCE_FIT_OPTIONS,
  type SilenceFitModeSettings,
  type SilenceFitOptionId,
} from "./script-silence-fit-settings";
import { countSpokenSentences } from "./script-time-based-generate";
import {
  loadDeliveryProfileRecord,
  loadSilenceFitCalibrationCells,
  saveDeliveryProfileRecord,
} from "./voice-calibration-store";

export function computeSilenceFitWordsPerSentence(
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
      if (s <= 0) s = countSpokenSentences(c.scriptTextAsWritten || c.scriptText);
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

export async function refreshSilenceFitWordsPerSentenceFromCells(
  modelId: string,
): Promise<SilenceFitModeSettings["wordsPerSentenceByOption"]> {
  const cells = await loadSilenceFitCalibrationCells(modelId);
  const measured = computeSilenceFitWordsPerSentence(cells);
  const prev = await loadDeliveryProfileRecord();
  const silenceFit: SilenceFitModeSettings = {
    ...prev.scriptGeneration.silenceFit,
    wordsPerSentenceByOption: measured,
  };
  await saveDeliveryProfileRecord({
    profiles: prev.profiles,
    scriptGeneration: {
      ...prev.scriptGeneration,
      silenceFit,
    },
    by: "silence-wps",
    note: "Recalculated silence-fit words/sentence from cost cells",
  });
  return measured;
}

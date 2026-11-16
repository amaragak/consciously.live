/**
 * Measured words-per-sentence for time-based mode, from stored cost cells.
 */
import type { CalibrationCellResult } from "./script-calibration-batch";
import {
  defaultTimeWordsPerSentenceByDelivery,
  wordsPerSentenceForDelivery,
  type ScriptGenerationSettings,
} from "./script-generation-settings";
import { countSpokenSentences } from "./script-time-based-generate";
import {
  loadDeliveryProfileRecord,
  loadTimeBasedCalibrationCells,
  saveDeliveryProfileRecord,
} from "./voice-calibration-store";

export function computeTimeWordsPerSentenceByDelivery(
  cells: CalibrationCellResult[],
): ScriptGenerationSettings["timeWordsPerSentenceByDelivery"] {
  const out = defaultTimeWordsPerSentenceByDelivery();
  for (const delivery of ["casual", "guided", "open_sits"] as const) {
    let words = 0;
    let sentences = 0;
    let scriptCount = 0;
    for (const c of cells) {
      if (c.delivery !== delivery || c.error || !c.scriptText?.trim()) continue;
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
        s = countSpokenSentences(c.scriptText);
      }
      if (w <= 0 || s <= 0) continue;
      words += w;
      sentences += s;
      scriptCount += 1;
    }
    if (scriptCount > 0 && sentences > 0) {
      out[delivery] = {
        wordsPerSentence: Math.round((words / sentences) * 10) / 10,
        scriptCount,
      };
    }
  }
  return out;
}

/** Recalculate from all stored time cells for modelId and persist on settings. */
export async function refreshTimeWordsPerSentenceFromCells(
  modelId: string,
): Promise<ScriptGenerationSettings["timeWordsPerSentenceByDelivery"]> {
  const cells = await loadTimeBasedCalibrationCells(modelId);
  const measured = computeTimeWordsPerSentenceByDelivery(cells);
  const prev = await loadDeliveryProfileRecord();
  const next: ScriptGenerationSettings = {
    ...prev.scriptGeneration,
    timeWordsPerSentenceByDelivery: measured,
  };
  await saveDeliveryProfileRecord({
    profiles: prev.profiles,
    scriptGeneration: next,
    by: "time-wps",
    note: "Recalculated time-based words/sentence from cost cells",
  });
  return measured;
}

export { wordsPerSentenceForDelivery };

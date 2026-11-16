/**
 * Canonical list of script-generation modes (admin + production).
 * Significant pipeline changes become a new mode, not a mutation of an old one.
 */
import type { ScriptWriteMode } from "./script-generation-settings";

export type ScriptGenerationModeInfo = {
  id: ScriptWriteMode;
  name: string;
  description: string;
  /** e.g. "1 Sonnet" or "1 Sonnet + Haiku per missed phase" */
  calls: string;
  /** ISO date the mode was added (YYYY-MM-DD). */
  added: string;
};

export const SCRIPT_GENERATION_MODES: readonly ScriptGenerationModeInfo[] = [
  {
    id: "sections",
    name: "Sectioned",
    description: "Plan then write sections with word/pause factors.",
    calls: "Plan + N section writes (Sonnet)",
    added: "2025-01-01",
  },
  {
    id: "single",
    name: "Single call (legacy)",
    description: "One-shot script with word/pause targets and factors.",
    calls: "1 Sonnet",
    added: "2025-01-01",
  },
  {
    id: "time",
    name: "Time-based",
    description: "One Claude write; length via flexible silences.",
    calls: "1 Sonnet",
    added: "2026-10-01",
  },
  {
    id: "silence",
    name: "Silence-fit",
    description: "One Claude write; app fits silence to target length.",
    calls: "1 Sonnet",
    added: "2026-11-11",
  },
  {
    id: "silence_haiku",
    name: "Silence-fit + Haiku",
    description:
      "Silence-fit plus a Haiku word fix on phases that miss their budget.",
    calls: "1 Sonnet + Haiku per missed phase",
    added: "2026-11-13",
  },
  {
    id: "silence_words",
    name: "Silence-fit · words",
    description:
      "Silence-fit with word targets per phase instead of sentences",
    calls: "1 Sonnet",
    added: "2026-11-13",
  },
  {
    id: "silence_words_haiku",
    name: "Silence-fit · words + Haiku",
    description:
      "Silence-fit · words with a Haiku word fix on phases that miss",
    calls: "1 Sonnet + Haiku per missed phase",
    added: "2026-11-13",
  },
] as const;

export function scriptGenerationModeInfo(
  id: ScriptWriteMode,
): ScriptGenerationModeInfo {
  return (
    SCRIPT_GENERATION_MODES.find((m) => m.id === id) ??
    SCRIPT_GENERATION_MODES[0]!
  );
}

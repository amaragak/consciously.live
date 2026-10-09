/**
 * Source of truth for Claude preprompts shown in Admin › Pre-prompts.
 * Built from the same builders/constants production uses. Edited only in code;
 * deploy seeds Dynamo (read-only in the app).
 */

import { buildSystemPrompt as buildJournalInsightsSystemPrompt } from "../journal-insights";
import { buildSystemPrompt as buildJournalWeeklySystemPrompt } from "../journal-weekly-reflection";
import { visionBoardPolishSystemPrompt } from "../vision-generate";
import { buildAssistantChatSystemPrompt } from "./assistant-chat-system-prompt";
import { ASSISTANT_CHAT_TITLE_SYSTEM } from "./assistant-chat-title-system";
import { buildClaudeCoachSystemPrompt } from "./claude-coach-system-prompt";
import {
  buildMeditationScriptGenerationPrompt,
  GENDER_NEUTRAL_SCRIPT_RULES,
} from "./meditation-script-generate-prompt";
import { libraryMetadataSystemPrompt } from "./meditation-library-metadata";
import { programDayDescriptionSystemPrompt } from "./program-day-description";
import { SCRIPT_PAUSE_PROMPT_RULES } from "./script-pause-bands";
import {
  buildPassOnePrompt,
  buildPassTwoPrompt,
} from "./script-lab-generate-v2";
import {
  reviewSystemPrompt as scriptLabV3ReviewSystemPrompt,
  scriptLabV3ClassifySystemPrompt,
  scriptLabV3Pass1SystemPrompt,
} from "./script-lab-generate-v3";
import { soundCategorySuggestSystemPrompt } from "./sound-category-suggest";
import { SPEAKER_PORTRAIT_STYLE_PREPROMPT } from "./speaker-portrait";

export type ClaudePrepromptKind =
  | "system"
  | "user"
  | "both"
  | "fragment";

export type ClaudePrepromptEntry = {
  id: string;
  title: string;
  feature: string;
  kind: ClaudePrepromptKind;
  sourcePath: string;
  /** Prompt text exactly as built for a canonical/default variant. */
  text: string;
  sortOrder: number;
};

function sectioned(system: string, user: string): string {
  return `### SYSTEM\n${system}\n\n### USER\n${user}`;
}

/**
 * Snapshot of every Claude system/pre-prompt we ship.
 * Dynamic prompts are rendered with stable defaults so the text matches
 * what production would send for that common path.
 */
export function buildClaudePrepromptCatalog(): ClaudePrepromptEntry[] {
  const coachDefault = buildClaudeCoachSystemPrompt({
    meditationStyle: "Anxiety relief",
    journalMode: false,
    targetMinutes: 5,
  });
  const coachProgram = buildClaudeCoachSystemPrompt({
    meditationStyle: "Body scan",
    journalMode: false,
    targetMinutes: 5,
    fromProgram: true,
  });
  const coachJournal = buildClaudeCoachSystemPrompt({
    meditationStyle: "",
    journalMode: true,
    targetMinutes: 5,
  });

  const scriptDefault = buildMeditationScriptGenerationPrompt({
    transcript: "(creator ↔ guide conversation)",
    meditationStyle: "Anxiety relief",
    journalMode: false,
    targetMinutes: 5,
    speechSpeed: 1,
    includeSegmentPlaceholders: false,
  });
  const scriptLabBeats = buildMeditationScriptGenerationPrompt({
    transcript: "(creator ↔ guide conversation)",
    meditationStyle: "Anxiety relief",
    journalMode: false,
    targetMinutes: 5,
    speechSpeed: 1,
    includeSegmentPlaceholders: true,
    segmentTags: [],
  });

  const v2p1 = buildPassOnePrompt({
    transcript: "(creator ↔ guide conversation)",
    meditationStyle: "Anxiety relief",
    journalMode: false,
    targetMinutes: 5,
    catalog: "(segment tag catalog)",
    requireFocusAnchor: false,
    defaultFocusDepth: "medium",
  });
  const v2p2 = buildPassTwoPrompt({
    meditationStyle: "Anxiety relief",
    journalMode: false,
    transcript: "(creator ↔ guide conversation)",
    renderedSkeleton: [],
    focusDepth: "medium",
  });

  const weeklyFull = buildJournalWeeklySystemPrompt(
    {
      letter: true,
      patterns: { felt: true, moved: true, wins: true, thought: true },
    },
    "this week",
  );

  let order = 0;
  const next = () => ++order;

  return [
    {
      id: "coach-chat-system",
      title: "Create Meditation — coach chat (By Type)",
      feature: "Create › coach chat",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/claude-coach-system-prompt.ts",
      text: coachDefault,
      sortOrder: next(),
    },
    {
      id: "coach-chat-system-journal",
      title: "Create Meditation — coach chat (journal / free-form)",
      feature: "Create › coach chat",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/claude-coach-system-prompt.ts",
      text: coachJournal,
      sortOrder: next(),
    },
    {
      id: "coach-chat-system-by-program",
      title: "Create Meditation — coach chat (By Program)",
      feature: "Create › By Program",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/claude-coach-system-prompt.ts",
      text: coachProgram,
      sortOrder: next(),
    },
    {
      id: "meditation-script-generate",
      title: "Meditation script generation (spoken prose)",
      feature: "Create › generate script / audio worker",
      kind: "both",
      sourcePath: "backend/lambdas/_shared/meditation-script-generate-prompt.ts",
      text: sectioned(scriptDefault.system, scriptDefault.userContent),
      sortOrder: next(),
    },
    {
      id: "meditation-script-generate-script-lab-beats",
      title: "Meditation script generation (Script Lab structured beats)",
      feature: "Script Lab V1 / beat tool output",
      kind: "both",
      sourcePath: "backend/lambdas/_shared/meditation-script-generate-prompt.ts",
      text: sectioned(scriptLabBeats.system, scriptLabBeats.userContent),
      sortOrder: next(),
    },
    {
      id: "gender-neutral-script-rules",
      title: "Gender-neutral script rules (fragment)",
      feature: "Injected into coach + script prompts",
      kind: "fragment",
      sourcePath: "backend/lambdas/_shared/meditation-script-generate-prompt.ts",
      text: GENDER_NEUTRAL_SCRIPT_RULES,
      sortOrder: next(),
    },
    {
      id: "script-pause-prompt-rules",
      title: "Pause marker rules (fragment)",
      feature: "Injected into script generation",
      kind: "fragment",
      sourcePath: "backend/lambdas/_shared/script-pause-bands.ts",
      text: SCRIPT_PAUSE_PROMPT_RULES,
      sortOrder: next(),
    },
    {
      id: "assistant-chat-system",
      title: "In-app Assistant chat",
      feature: "Chat › Consciously companion",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/assistant-chat-system-prompt.ts",
      text: buildAssistantChatSystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "assistant-chat-title",
      title: "Assistant thread title",
      feature: "Chat › Haiku title",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/assistant-chat-title-system.ts",
      text: ASSISTANT_CHAT_TITLE_SYSTEM,
      sortOrder: next(),
    },
    {
      id: "library-metadata-system",
      title: "Library card title / type / description",
      feature: "Meditation library metadata",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/meditation-library-metadata.ts",
      text: libraryMetadataSystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "program-day-description-system",
      title: "Program day description (~50 words)",
      feature: "Admin › Programs",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/program-day-description.ts",
      text: programDayDescriptionSystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "sound-category-suggest-system",
      title: "Sound category / name suggest",
      feature: "Admin › Sounds",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/sound-category-suggest.ts",
      text: soundCategorySuggestSystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "journal-insights-system",
      title: "Journal rolling topic insights",
      feature: "Journal › Insights",
      kind: "system",
      sourcePath: "backend/lambdas/journal-insights.ts",
      text: buildJournalInsightsSystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "journal-weekly-reflection-system",
      title: "Journal weekly reflection (letter + patterns)",
      feature: "Journal › Weekly letter",
      kind: "system",
      sourcePath: "backend/lambdas/journal-weekly-reflection.ts",
      text: weeklyFull,
      sortOrder: next(),
    },
    {
      id: "vision-board-polish-system",
      title: "Vision board scene prompt polish",
      feature: "Manifest › Vision board",
      kind: "system",
      sourcePath: "backend/lambdas/vision-generate.ts",
      text: visionBoardPolishSystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "script-lab-v2-pass1",
      title: "Script Lab V2 — pass 1 skeleton",
      feature: "Script Lab V2",
      kind: "both",
      sourcePath: "backend/lambdas/_shared/script-lab-generate-v2.ts",
      text: sectioned(v2p1.system, v2p1.userContent),
      sortOrder: next(),
    },
    {
      id: "script-lab-v2-pass2",
      title: "Script Lab V2 — pass 2 fill",
      feature: "Script Lab V2",
      kind: "both",
      sourcePath: "backend/lambdas/_shared/script-lab-generate-v2.ts",
      text: sectioned(v2p2.system, v2p2.userContent),
      sortOrder: next(),
    },
    {
      id: "script-lab-v3-pass1-system",
      title: "Script Lab V3 — pass 1 continuous prose",
      feature: "Script Lab V3",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/script-lab-generate-v3.ts",
      text: scriptLabV3Pass1SystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "script-lab-v3-classify-system",
      title: "Script Lab V3 — chunk personalization classify",
      feature: "Script Lab V3",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/script-lab-generate-v3.ts",
      text: scriptLabV3ClassifySystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "script-lab-v3-review-system",
      title: "Script Lab V3 — substitute / promote review",
      feature: "Script Lab V3",
      kind: "system",
      sourcePath: "backend/lambdas/_shared/script-lab-generate-v3.ts",
      text: scriptLabV3ReviewSystemPrompt(),
      sortOrder: next(),
    },
    {
      id: "speaker-portrait-style",
      title: "Speaker portrait style (Speechify card)",
      feature: "Admin › Voice",
      kind: "fragment",
      sourcePath: "backend/lambdas/_shared/speaker-portrait.ts",
      text: SPEAKER_PORTRAIT_STYLE_PREPROMPT,
      sortOrder: next(),
    },
  ];
}

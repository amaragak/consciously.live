/**
 * Plan → write sections (parallel or sequential) → optional targeted fix.
 */
import {
  withClaudeThinkingOff,
  CLAUDE_HAIKU_55_MODEL_ID,
  coerceClaudeModel,
  parseAnthropicMessageUsage,
} from "./anthropic-pricing";
import { getClaudeApiKey } from "./anthropic-messages";
import { recordClaudeUsage } from "./ai-usage";
import {
  buildMeditationScriptGenerationPrompt,
  buildSectionFixPrompt,
} from "./meditation-script-generate-prompt";
import {
  extractPlanJson,
  furthestSectionFixes,
  joinSectionTexts,
  measurePlannedSections,
  parseScriptPlan,
  replaceSections,
  rescaleScriptPlan,
  sessionTotals,
  type PlannedSection,
  type ScriptSectionPlan,
  type ScriptSectionText,
  type SectionFix,
  type SectionMeasure,
  type SessionTotals,
} from "./script-sections";
import type { ScriptPauseBand } from "./script-pause-bands";
import type { DeliveryId } from "./delivery-profiles";
import {
  applyCorrectionToPauseSeconds,
  applyCorrectionToWords,
  factorsFor,
  type ScriptTargetCorrection,
} from "./script-target-correction";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

type Usage = { input_tokens: number; output_tokens: number } | null;

async function claudeText(params: {
  apiKey: string;
  model: string;
  system: string;
  userContent: string;
  maxTokens?: number;
}): Promise<{ text: string; usage: Usage; ms: number }> {
  const t0 = Date.now();
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(
      withClaudeThinkingOff({
        model: params.model,
        max_tokens: params.maxTokens ?? 8192,
        system: params.system,
        messages: [{ role: "user", content: params.userContent }],
      }),
    ),
  });
  const responseText = await upstream.text();
  if (!upstream.ok) {
    throw new Error(`Anthropic failed: ${responseText.slice(0, 2000)}`);
  }
  const parsed = JSON.parse(responseText) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = parsed.content?.find((c) => c?.type === "text")?.text?.trim() ?? "";
  if (!text) throw new Error("Empty Anthropic response");
  const usage = parseAnthropicMessageUsage(responseText);
  if (usage) {
    void recordClaudeUsage({
      model: params.model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      feature: "meditation-script",
    });
  }
  return { text, usage, ms: Date.now() - t0 };
}

export type SharedScriptPromptParams = {
  transcript: string;
  meditationStyle: string;
  journalMode: boolean;
  targetMinutes: number;
  speechSpeed: number;
  longerBreaks?: boolean;
  deliveryStyle?: "casual" | "guided" | "open_sits";
  pacing?: { wpm: number; speechShare: number; bandFraction?: number };
  pauseRules?: string;
  lengthFit?: {
    effectiveWpm: number;
    silenceSharePct: number;
    words?: number;
    pauseSecondsWritten?: number;
    pauseBands?: Record<ScriptPauseBand, number>;
  };
};

function basePrompt(
  shared: SharedScriptPromptParams,
  task: NonNullable<Parameters<typeof buildMeditationScriptGenerationPrompt>[0]["task"]>,
) {
  return buildMeditationScriptGenerationPrompt({
    ...shared,
    meditationStyle: shared.meditationStyle?.trim() ?? "",
    includeSegmentPlaceholders: false,
    longerBreaks: shared.longerBreaks === true,
    task,
  });
}

export async function planScriptSections(params: {
  apiKey: string;
  model: string;
  shared: SharedScriptPromptParams;
  totals: SessionTotals;
  wordCap: number;
  wordMin: number;
}): Promise<{ plan: ScriptSectionPlan; usage: Usage; ms: number; retried: boolean }> {
  const model = coerceClaudeModel(params.model) || params.model || CLAUDE_HAIKU_55_MODEL_ID;
  const wordMin = Math.max(0, params.wordMin || 0);
  const run = async () => {
    const prompt = basePrompt(params.shared, {
      kind: "plan",
      totals: params.totals,
      wordCap: params.wordCap,
      wordMin,
    });
    return claudeText({
      apiKey: params.apiKey,
      model,
      system: prompt.system,
      userContent: prompt.userContent,
      maxTokens: 4096,
    });
  };
  let retried = false;
  let res = await run();
  let parsed = parseScriptPlan(extractPlanJson(res.text), {
    wordCap: params.wordCap,
    wordMin,
  });
  if (!parsed) {
    retried = true;
    res = await run();
    parsed = parseScriptPlan(extractPlanJson(res.text), {
      wordCap: params.wordCap,
      wordMin,
    });
  }
  if (!parsed) throw new Error("Script plan invalid after retry");
  const plan = rescaleScriptPlan(parsed, params.totals, params.wordCap, wordMin);
  return { plan, usage: res.usage, ms: res.ms, retried };
}

async function writeOneSection(params: {
  apiKey: string;
  model: string;
  shared: SharedScriptPromptParams;
  plan: ScriptSectionPlan;
  section: PlannedSection;
  index: number;
  priorText?: string;
  /** v9: send corrected word/pause targets to the model. */
  promptSection?: PlannedSection;
}): Promise<{ section: ScriptSectionText; usage: Usage; ms: number }> {
  const prompt = basePrompt(params.shared, {
    kind: "section",
    section: params.promptSection ?? params.section,
    plan: params.plan,
    isFirst: params.index === 0,
    isLast: params.index === params.plan.sections.length - 1,
    priorText: params.priorText,
  });
  const res = await claudeText({
    apiKey: params.apiKey,
    model: params.model,
    system: prompt.system,
    userContent: prompt.userContent,
  });
  return {
    section: { id: params.section.name, text: res.text },
    usage: res.usage,
    ms: res.ms,
  };
}

export async function writeScriptSections(params: {
  apiKey: string;
  model: string;
  shared: SharedScriptPromptParams;
  plan: ScriptSectionPlan;
  /** When true, write one after another with prior text. */
  inOrder: boolean;
  /**
   * Length×delivery factors (word + pause). When set with delivery + minutes,
   * every section's prompt targets are multiplied by those factors.
   * v9 first/last/middle/single buckets superseded.
   */
  correction?: ScriptTargetCorrection;
  delivery?: DeliveryId;
  /** Session length minutes (5|10|20); required with correction. */
  minutes?: number;
}): Promise<{
  sections: ScriptSectionText[];
  usage: Usage;
  ms: number;
}> {
  const model = coerceClaudeModel(params.model) || params.model;
  let input = 0;
  let output = 0;
  const addUsage = (u: Usage) => {
    if (!u) return;
    input += u.input_tokens;
    output += u.output_tokens;
  };
  const promptSection = (section: PlannedSection, _index: number): PlannedSection => {
    if (
      !params.correction ||
      !params.delivery ||
      params.minutes == null ||
      !Number.isFinite(params.minutes)
    ) {
      return section;
    }
    const f = factorsFor(params.correction, params.delivery, params.minutes);
    return {
      ...section,
      words: applyCorrectionToWords(section.words, f.words),
      pauseSeconds: applyCorrectionToPauseSeconds(section.pauseSeconds, f.pauses),
    };
  };
  const t0 = Date.now();
  let sections: ScriptSectionText[];
  if (params.inOrder) {
    sections = [];
    let prior = "";
    for (let i = 0; i < params.plan.sections.length; i++) {
      const section = params.plan.sections[i]!;
      const row = await writeOneSection({
        apiKey: params.apiKey,
        model,
        shared: params.shared,
        plan: params.plan,
        section,
        promptSection: promptSection(section, i),
        index: i,
        priorText: prior || undefined,
      });
      addUsage(row.usage);
      sections.push(row.section);
      prior = joinSectionTexts(sections);
    }
  } else {
    const rows = await Promise.all(
      params.plan.sections.map((section, index) =>
        writeOneSection({
          apiKey: params.apiKey,
          model,
          shared: params.shared,
          plan: params.plan,
          section,
          promptSection: promptSection(section, index),
          index,
        }),
      ),
    );
    for (const row of rows) addUsage(row.usage);
    sections = rows.map((r) => r.section);
  }
  return {
    sections,
    usage: input || output ? { input_tokens: input, output_tokens: output } : null,
    ms: Date.now() - t0,
  };
}

function parseFixedSections(raw: string, expectedIds: string[]): ScriptSectionText[] {
  const text = raw.trim();
  const header = /^###\s*Section:\s*(.+)$/gim;
  const matches = [...text.matchAll(header)];
  if (matches.length) {
    return matches.map((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
      return { id: m[1]!.trim().toLowerCase().replace(/\s+/g, "-"), text: text.slice(start, end).trim() };
    });
  }
  if (expectedIds.length === 1) {
    return [{ id: expectedIds[0]!, text }];
  }
  return [];
}

export async function fixFurthestSections(params: {
  apiKey: string;
  model: string;
  sections: ScriptSectionText[];
  fixes: SectionFix[];
}): Promise<{ sections: ScriptSectionText[]; usage: Usage; ms: number }> {
  const { system, userContent } = buildSectionFixPrompt({
    sections: params.sections,
    fixes: params.fixes,
  });
  const res = await claudeText({
    apiKey: params.apiKey,
    model: coerceClaudeModel(params.model) || params.model,
    system,
    userContent,
  });
  const returned = parseFixedSections(
    res.text,
    params.fixes.map((f) => f.id),
  );
  return {
    sections: replaceSections(params.sections, returned),
    usage: res.usage,
    ms: res.ms,
  };
}

export {
  sessionTotals,
  measurePlannedSections,
  furthestSectionFixes,
  joinSectionTexts,
  getClaudeApiKey,
};
export type { SessionTotals, ScriptSectionPlan, ScriptSectionText, SectionMeasure, SectionFix };

/**
 * Plan → write sections (parallel or sequential) → optional targeted fix.
 */
import {
  CLAUDE_HAIKU_55_MODEL_ID,
  coerceClaudeModel,
  parseAnthropicMessageUsage,
  claudeUsdFromUsage,
  type AnthropicMessageUsage,
} from "./anthropic-pricing";
import { buildScriptGenerationCachedBody } from "./anthropic-prompt-cache";
import { getClaudeApiKey } from "./anthropic-messages";
import { recordClaudeUsage, type AiUsageSource } from "./ai-usage";
import {
  buildMeditationScriptGenerationPrompt,
  buildSectionFixPrompt,
} from "./meditation-script-generate-prompt";
import {
  applySectionPausesFromWords,
  extractPlanJson,
  furthestSectionFixes,
  joinSectionTexts,
  measurePlannedSections,
  minSectionsForWords,
  parseScriptPlan,
  planObeysSectionCaps,
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
import { expandShortPauseMarkers } from "./script-pause-short";
import type { DeliveryId } from "./delivery-profiles";
import {
  applyCorrectionToPauseSeconds,
  applyCorrectionToWords,
  factorsFor,
  type ScriptTargetCorrection,
} from "./script-target-correction";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

type Usage = AnthropicMessageUsage | null;

/** One Messages call inside a sectioned (or single) script generation. */
export type ScriptGenCallUsage = {
  label: string;
  model: string;
  ms: number;
  usage: AnthropicMessageUsage | null;
  /**
   * How this call interacted with the single shared 5m checkpoint:
   * wrote | read | none (inferred from usage when present).
   */
  cacheRole: "wrote" | "read" | "none" | "unknown";
};

export function cacheRoleFromUsage(
  usage: Usage,
): ScriptGenCallUsage["cacheRole"] {
  if (!usage) return "unknown";
  const w = usage.cache_creation_input_tokens ?? 0;
  const r = usage.cache_read_input_tokens ?? 0;
  if (w > 0 && r === 0) return "wrote";
  if (r > 0 && w === 0) return "read";
  if (w > 0 && r > 0) return "wrote"; // rare mixed
  return "none";
}

function logScriptCallUsage(params: {
  label: string;
  model: string;
  usage: Usage;
  ms: number;
  effortLow?: boolean;
}) {
  const u = params.usage;
  if (!u) {
    console.log(
      JSON.stringify({
        tag: "script-gen-usage",
        label: params.label,
        model: params.model,
        ms: params.ms,
        effortLow: params.effortLow === true,
        usage: null,
      }),
    );
    return;
  }
  const usd = claudeUsdFromUsage(params.model, u);
  console.log(
    JSON.stringify({
      tag: "script-gen-usage",
      label: params.label,
      model: params.model,
      ms: params.ms,
      effortLow: params.effortLow === true,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      thinking_tokens: u.thinking_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_5m_input_tokens: u.cache_creation_5m_input_tokens ?? 0,
      cache_creation_1h_input_tokens: u.cache_creation_1h_input_tokens ?? 0,
      usd: Math.round(usd * 1e6) / 1e6,
    }),
  );
}

async function claudeText(params: {
  apiKey: string;
  model: string;
  systemStable: string;
  meditationContext: string;
  meditationContextExtra?: string;
  /** Cache meditationContextExtra as checkpoint 2 (section writes). */
  cacheExtra?: boolean;
  taskContent: string;
  maxTokens?: number;
  /** Section / fix: lowest effort. Plan / single: omit. */
  effortLow?: boolean;
  label: string;
  source?: AiUsageSource;
  reason?: string;
  userId?: string | null;
}): Promise<{ text: string; usage: Usage; ms: number }> {
  const t0 = Date.now();
  const body = buildScriptGenerationCachedBody({
    model: params.model,
    maxTokens: params.maxTokens ?? 8192,
    systemStable: params.systemStable,
    meditationContext: params.meditationContext,
    meditationContextExtra: params.meditationContextExtra,
    cacheExtra: params.cacheExtra === true,
    taskContent: params.taskContent,
    effortLow: params.effortLow,
  });
  // Legacy single-block system (replaced by dual-cache layout in buildScriptGenerationCachedBody):
  // withClaudeThinkingOff({
  //   model: params.model,
  //   max_tokens: params.maxTokens ?? 8192,
  //   system: [{ type: "text", text: params.system, cache_control: { type: "ephemeral" } }],
  //   messages: [{ role: "user", content: params.userContent }],
  // })
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
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
  logScriptCallUsage({
    label: params.label,
    model: params.model,
    usage,
    ms: Date.now() - t0,
    effortLow: params.effortLow,
  });
  if (usage) {
    void recordClaudeUsage({
      model: params.model,
      feature: "meditation-script",
      source: params.source ?? "system",
      reason: params.reason ?? params.label,
      userId: params.userId,
      usage,
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
  /** Silence share + Casual longest pause for the style-guide pacing line. */
  styleGuideContext?: {
    silenceShare: number;
    longestPauseSeconds: number;
  };
  /** Inferred (or chosen) style used only for attaching a writer's guide. */
  styleGuideStyle?: string;
  /** Metering: who/why (defaults to system / label). */
  usageSource?: AiUsageSource;
  usageReasonPrefix?: string;
  userId?: string | null;
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
    styleGuideStyle: shared.styleGuideStyle,
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
  /** Median effective WPM for deriving section pauses from words. */
  medianWpm: number;
  /** Middle-section silence share. */
  silenceShare: number;
  firstSilenceShare?: number;
  lastSilenceShare?: number;
  maxSectionMinutes?: number;
}): Promise<{
  plan: ScriptSectionPlan;
  usage: Usage;
  ms: number;
  retried: boolean;
  calls: ScriptGenCallUsage[];
}> {
  const model = coerceClaudeModel(params.model) || params.model || CLAUDE_HAIKU_55_MODEL_ID;
  const wordMin = Math.max(0, params.wordMin || 0);
  const wordCap = Math.max(1, params.wordCap);
  const minSections = minSectionsForWords(params.totals.totalWords, wordCap);
  const caps = { wordCap, wordMin, minSections };
  const run = async () => {
    const prompt = basePrompt(params.shared, {
      kind: "plan",
      totals: params.totals,
      wordCap,
      wordMin,
      minSections,
      maxSectionMinutes: params.maxSectionMinutes,
    });
    const prefix = params.shared.usageReasonPrefix?.trim();
    return claudeText({
      apiKey: params.apiKey,
      model,
      systemStable: prompt.systemStable,
      meditationContext: prompt.meditationContext,
      meditationContextExtra: prompt.meditationContextExtra || undefined,
      taskContent: prompt.taskContent,
      maxTokens: 4096,
      // Plan keeps default effort (no effortLow).
      label: "plan",
      source: params.shared.usageSource ?? "system",
      reason: prefix ? `${prefix}:plan` : "script-plan",
      userId: params.shared.userId,
    });
  };
  let retried = false;
  let res = await run();
  let parsed = parseScriptPlan(extractPlanJson(res.text), {
    wordCap,
    wordMin,
  });
  if (!parsed || !planObeysSectionCaps(parsed, caps)) {
    retried = true;
    res = await run();
    parsed = parseScriptPlan(extractPlanJson(res.text), {
      wordCap,
      wordMin,
    });
  }
  if (!parsed) throw new Error("Script plan invalid after retry");
  // Rescale words to session totals / caps, then set pauses from words × silence share.
  const rescaled = rescaleScriptPlan(parsed, params.totals, wordCap, wordMin);
  const withPauses = applySectionPausesFromWords(rescaled.sections, {
    medianWpm: params.medianWpm,
    silenceShare: params.silenceShare,
    firstSilenceShare: params.firstSilenceShare,
    lastSilenceShare: params.lastSilenceShare,
  });
  const plan: ScriptSectionPlan = {
    sections: withPauses,
    totalWords: withPauses.reduce((a, s) => a + s.words, 0),
    totalPauseSeconds: withPauses.reduce((a, s) => a + s.pauseSeconds, 0),
  };
  const calls: ScriptGenCallUsage[] = [
    {
      label: retried ? "plan(retry)" : "plan",
      model,
      ms: res.ms,
      usage: res.usage,
      cacheRole: cacheRoleFromUsage(res.usage),
    },
  ];
  return { plan, usage: res.usage, ms: res.ms, retried, calls };
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
}): Promise<{
  section: ScriptSectionText;
  usage: Usage;
  ms: number;
  call: ScriptGenCallUsage;
}> {
  const prompt = basePrompt(params.shared, {
    kind: "section",
    section: params.promptSection ?? params.section,
    plan: params.plan,
    isFirst: params.index === 0,
    isLast: params.index === params.plan.sections.length - 1,
    priorText: params.priorText,
  });
  const prefix = params.shared.usageReasonPrefix?.trim();
  const label = `section:${params.section.name}`;
  const res = await claudeText({
    apiKey: params.apiKey,
    model: params.model,
    systemStable: prompt.systemStable,
    meditationContext: prompt.meditationContext,
    meditationContextExtra: prompt.meditationContextExtra || undefined,
    // Checkpoint 2: plan JSON + shared section rules (first section writes).
    cacheExtra: true,
    taskContent: prompt.taskContent,
    effortLow: true,
    label,
    source: params.shared.usageSource ?? "system",
    reason: prefix
      ? `${prefix}:section:${params.section.name}`
      : `script-section:${params.section.name}`,
    userId: params.shared.userId,
  });
  return {
    section: {
      id: params.section.name,
      text: expandShortPauseMarkers(res.text),
    },
    usage: res.usage,
    ms: res.ms,
    call: {
      label,
      model: params.model,
      ms: res.ms,
      usage: res.usage,
      cacheRole: cacheRoleFromUsage(res.usage),
    },
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
  calls: ScriptGenCallUsage[];
}> {
  const model = coerceClaudeModel(params.model) || params.model;
  let input = 0;
  let output = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  const calls: ScriptGenCallUsage[] = [];
  const addUsage = (u: Usage) => {
    if (!u) return;
    input += u.input_tokens;
    output += u.output_tokens;
    cacheWrite += u.cache_creation_input_tokens ?? 0;
    cacheRead += u.cache_read_input_tokens ?? 0;
  };
  const promptSection = (section: PlannedSection, index: number): PlannedSection => {
    if (
      !params.correction ||
      !params.delivery ||
      params.minutes == null ||
      !Number.isFinite(params.minutes)
    ) {
      return section;
    }
    const f = factorsFor(params.correction, params.delivery, params.minutes);
    const n = params.plan.sections.length;
    const edge = n <= 2 || index === 0 || index === n - 1;
    return {
      ...section,
      words: applyCorrectionToWords(section.words, f.words),
      // Own-silence: edge sections have no pause target — don't correct pauses.
      pauseSeconds: edge
        ? section.pauseSeconds
        : applyCorrectionToPauseSeconds(section.pauseSeconds, f.pauses),
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
      calls.push(row.call);
      sections.push(row.section);
      prior = joinSectionTexts(sections);
    }
  } else {
    // First section alone writes checkpoint 2 (plan + shared section rules).
    // Remaining sections run in parallel and should cache-read it.
    // Previous: all sections parallel immediately (each raced to write checkpoint 2).
    const first = params.plan.sections[0];
    if (!first) {
      sections = [];
    } else {
      const firstRow = await writeOneSection({
        apiKey: params.apiKey,
        model,
        shared: params.shared,
        plan: params.plan,
        section: first,
        promptSection: promptSection(first, 0),
        index: 0,
      });
      addUsage(firstRow.usage);
      calls.push(firstRow.call);
      const rest = params.plan.sections.slice(1);
      const restRows =
        rest.length > 0
          ? await Promise.all(
              rest.map((section, i) =>
                writeOneSection({
                  apiKey: params.apiKey,
                  model,
                  shared: params.shared,
                  plan: params.plan,
                  section,
                  promptSection: promptSection(section, i + 1),
                  index: i + 1,
                }),
              ),
            )
          : [];
      for (const row of restRows) {
        addUsage(row.usage);
        calls.push(row.call);
      }
      sections = [firstRow.section, ...restRows.map((r) => r.section)];
    }
  }
  const usage: Usage =
    input || output || cacheWrite || cacheRead
      ? {
          input_tokens: input,
          output_tokens: output,
          cache_creation_input_tokens: cacheWrite,
          cache_read_input_tokens: cacheRead,
          cache_creation_5m_input_tokens: cacheWrite,
          cache_creation_1h_input_tokens: 0,
        }
      : null;
  if (usage) {
    console.log(
      JSON.stringify({
        tag: "script-gen-usage",
        label: "sections-total",
        model,
        ms: Date.now() - t0,
        ...usage,
        usd: Math.round(claudeUsdFromUsage(model, usage) * 1e6) / 1e6,
      }),
    );
  }
  return {
    sections,
    usage,
    ms: Date.now() - t0,
    calls,
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
      return {
        id: m[1]!.trim().toLowerCase().replace(/\s+/g, "-"),
        text: expandShortPauseMarkers(text.slice(start, end).trim()),
      };
    });
  }
  if (expectedIds.length === 1) {
    return [{ id: expectedIds[0]!, text: expandShortPauseMarkers(text) }];
  }
  return [];
}

export async function fixFurthestSections(params: {
  apiKey: string;
  model: string;
  sections: ScriptSectionText[];
  fixes: SectionFix[];
  usageSource?: AiUsageSource;
  usageReasonPrefix?: string;
  userId?: string | null;
}): Promise<{
  sections: ScriptSectionText[];
  usage: Usage;
  ms: number;
  calls: ScriptGenCallUsage[];
}> {
  const { system, userContent } = buildSectionFixPrompt({
    sections: params.sections,
    fixes: params.fixes,
  });
  const prefix = params.usageReasonPrefix?.trim();
  const model = coerceClaudeModel(params.model) || params.model;
  const res = await claudeText({
    apiKey: params.apiKey,
    model,
    systemStable: system,
    meditationContext: "### Sections to revise\n(see task)",
    taskContent: userContent,
    effortLow: true,
    label: "section-fix",
    source: params.usageSource ?? "system",
    reason: prefix ? `${prefix}:section-fix` : "script-section-fix",
    userId: params.userId,
  });
  const returned = parseFixedSections(
    res.text,
    params.fixes.map((f) => f.id),
  );
  return {
    sections: replaceSections(params.sections, returned),
    usage: res.usage,
    ms: res.ms,
    calls: [
      {
        label: "section-fix",
        model,
        ms: res.ms,
        usage: res.usage,
        cacheRole: cacheRoleFromUsage(res.usage),
      },
    ],
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

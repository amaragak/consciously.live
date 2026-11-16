/**
 * Script-generation cost rows for Admin › Delivery profiles.
 * Measured averages come from calibration cells that recorded Claude usage;
 * estimates fill gaps when no measured usage exists yet.
 */
import {
  CLAUDE_SONNET_55_MODEL_ID,
  claudeUsdFromUsage,
  type AnthropicMessageUsage,
} from "./anthropic-pricing";
import { SPEECHIFY_USD_PER_MILLION_CHARS } from "./ai-provider-pricing";
import {
  FIXED_CHARS_PER_WORD,
  type DeliveryId,
} from "./delivery-profiles";
import { buildMeditationScriptGenerationPrompt } from "./meditation-script-generate-prompt";
import { styleGuideMarkdownFor } from "./style-guide-for-prompt";
import type { CalibrationCellResult } from "./script-calibration-batch";
import type { ScriptGenCallUsage } from "./script-section-generate";
import { stripPauseMarkers } from "./script-pause-bands";

export const SCRIPT_COST_MINUTES = [5, 10, 20] as const;
export const SCRIPT_COST_DELIVERIES: DeliveryId[] = [
  "casual",
  "guided",
  "open_sits",
];

/** Whether the writer's style guide was in the system / pre-prompt. */
export type StyleGuideInPrompt = "yes" | "no" | "mixed";

export type ScriptGenCostRow = {
  delivery: DeliveryId;
  minutes: number;
  /** How the numbers were produced. */
  source: "measured" | "estimate";
  scripts: number;
  /** Uncached + new input tokens billed as base input. */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** Thinking / reasoning tokens (0 when between_tools + effort low). */
  thinkingTokens: number;
  /**
   * Text completion tokens. When thinking was folded into `output_tokens`,
   * this is max(0, output − thinking).
   */
  outputTokens: number;
  /** Total billed output tokens (text + thinking when folded together). */
  billedOutputTokens: number;
  /** Claude script-gen USD (list rates, incl. cache when usage has it). */
  usd: number;
  modelId: string;
  /**
   * Whether a writer's style guide was included in the pre-prompt.
   * Measured: aggregated from cells. Estimate: mirrors the sample brief used.
   */
  guideAttached: StyleGuideInPrompt;
  /** When all measured cells (or the estimate) share one guide style. */
  guideStyle?: string | null;
  /**
   * Average spoken character count (pause markers stripped) — matches what we
   * roughly send to Speechify before SSML break tags.
   */
  avgChars: number;
  /** Approx Speechify TTS USD at Starter overage (~$10 / 1M chars). */
  speechifyUsd: number;
  /**
   * Average per-call breakdown for one meditation (plan / sections / fix).
   * Measured: mean across cells that stored `calls`. Estimate: synthetic.
   */
  calls?: ScriptGenCostCallRow[];
  /**
   * Per-script breakdown for expandable Costs rows (measured only).
   * Each script's `usd` should sum its call USD and match that script's
   * contribution to the row average.
   */
  scriptDetails?: ScriptGenCostScriptDetail[];
  /**
   * Silence-fit + Haiku: average Haiku USD per script (0 when Haiku did not run).
   * Already included in `usd` (Claude total).
   */
  haikuUsd?: number;
  /** Silence-fit + Haiku: % of scripts in the cell where Haiku ran. */
  haikuRunPct?: number | null;
};

export type ScriptGenCostCallRow = {
  label: string;
  model: string;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  /** wrote | read | none | unknown — shared 5m checkpoint. */
  cacheRole: "wrote" | "read" | "none" | "unknown";
  /** USD for this call at its own model rates (list). */
  usd?: number;
};

/** One script inside a measured cost cell (for expandable Costs rows). */
export type ScriptGenCostScriptDetail = {
  briefIndex: number;
  brief: string;
  /** Claude USD for this script (sum of call USD at each model's rates). */
  usd: number;
  calls: ScriptGenCostCallRow[];
};

function callRowFromUsage(
  label: string,
  modelId: string,
  usage: AnthropicMessageUsage,
  cacheRole: ScriptGenCostCallRow["cacheRole"],
): ScriptGenCostCallRow {
  const thinking = Math.max(0, usage.thinking_tokens ?? 0);
  const billed = Math.max(0, usage.output_tokens);
  const usd = claudeUsdFromUsage(modelId, usage);
  return {
    label,
    model: modelId,
    inputTokens: Math.round(usage.input_tokens),
    cacheWriteTokens: Math.round(usage.cache_creation_input_tokens ?? 0),
    cacheReadTokens: Math.round(usage.cache_read_input_tokens ?? 0),
    outputTokens: Math.round(Math.max(0, billed - thinking)),
    thinkingTokens: Math.round(thinking),
    cacheRole,
    usd: Math.round(usd * 1e6) / 1e6,
  };
}

/**
 * Claude USD for one calibration cell: price each call at its own model.
 * Falls back to pricing the aggregate usage at `fallbackModelId` when no calls.
 */
export function usdFromCell(
  cell: CalibrationCellResult,
  fallbackModelId: string,
): number {
  const calls = cell.calls ?? [];
  if (calls.length) {
    let sum = 0;
    let any = false;
    for (const call of calls) {
      if (!call.usage) continue;
      any = true;
      sum += claudeUsdFromUsage(call.model || fallbackModelId, call.usage);
    }
    if (any) return Math.round(sum * 1e6) / 1e6;
  }
  const u = usageFromCell(cell);
  if (!u) return 0;
  return Math.round(claudeUsdFromUsage(fallbackModelId, u) * 1e6) / 1e6;
}

function callRowsFromCell(
  cell: CalibrationCellResult,
  fallbackModelId: string,
): ScriptGenCostCallRow[] {
  const out: ScriptGenCostCallRow[] = [];
  for (const call of cell.calls ?? []) {
    if (!call.usage) continue;
    out.push(
      callRowFromUsage(
        call.label,
        call.model || fallbackModelId,
        call.usage,
        call.cacheRole ?? "unknown",
      ),
    );
  }
  return out;
}

function scriptDetailsFromCells(
  cells: CalibrationCellResult[],
  modelId: string,
): ScriptGenCostScriptDetail[] {
  return cells
    .slice()
    .sort((a, b) => a.briefIndex - b.briefIndex)
    .map((c) => {
      const calls = callRowsFromCell(c, modelId);
      const usd =
        calls.length > 0
          ? Math.round(
              calls.reduce((s, call) => s + (call.usd ?? 0), 0) * 1e6,
            ) / 1e6
          : usdFromCell(c, modelId);
      return {
        briefIndex: c.briefIndex,
        brief: (c.brief ?? "").slice(0, 240),
        usd,
        calls,
      };
    });
}

/** Spoken UTF-16 length after stripping pause markers (Speechify-ish). */
export function spokenCharCount(scriptText: string | null | undefined): number {
  return stripPauseMarkers(scriptText ?? "").length;
}

export function speechifyUsdFromChars(chars: number): number {
  const n = Math.max(0, chars);
  return Math.round((n / 1_000_000) * SPEECHIFY_USD_PER_MILLION_CHARS * 1e6) / 1e6;
}

function approxTokens(text: string): number {
  return Math.max(0, Math.round((text ?? "").length / 4));
}

function emptyUsage(): AnthropicMessageUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    thinking_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_5m_input_tokens: 0,
    cache_creation_1h_input_tokens: 0,
  };
}

export function usageFromCell(
  cell: CalibrationCellResult,
): AnthropicMessageUsage | null {
  const u = cell.usage;
  if (!u) return null;
  if (
    !(u.input_tokens > 0 || u.output_tokens > 0 || (u.thinking_tokens ?? 0) > 0)
  ) {
    return null;
  }
  return u;
}

function guideAggFromCells(cells: CalibrationCellResult[]): {
  guideAttached: StyleGuideInPrompt;
  guideStyle: string | null;
} {
  if (!cells.length) return { guideAttached: "no", guideStyle: null };
  const attached = cells.map((c) => c.guideAttached === true);
  const yes = attached.filter(Boolean).length;
  const no = attached.length - yes;
  let guideAttached: StyleGuideInPrompt;
  if (yes === 0) guideAttached = "no";
  else if (no === 0) guideAttached = "yes";
  else guideAttached = "mixed";
  const styles = [
    ...new Set(
      cells
        .map((c) => (c.guideStyle ?? "").trim())
        .filter(Boolean),
    ),
  ];
  return {
    guideAttached,
    guideStyle: styles.length === 1 ? styles[0]! : null,
  };
}

export function costRowFromUsage(params: {
  delivery: DeliveryId;
  minutes: number;
  modelId: string;
  usage: AnthropicMessageUsage;
  scripts: number;
  source: "measured" | "estimate";
  guideAttached: StyleGuideInPrompt;
  guideStyle?: string | null;
  avgChars: number;
}): ScriptGenCostRow {
  const thinking = Math.max(0, params.usage.thinking_tokens ?? 0);
  const billedOut = Math.max(0, params.usage.output_tokens);
  // Prefer text-only when we know thinking was counted inside output.
  const textOut = Math.max(0, billedOut - thinking);
  const usd = claudeUsdFromUsage(params.modelId, params.usage);
  const avgChars = Math.max(0, Math.round(params.avgChars));
  return {
    delivery: params.delivery,
    minutes: params.minutes,
    source: params.source,
    scripts: params.scripts,
    inputTokens: Math.round(params.usage.input_tokens),
    cacheReadTokens: Math.round(params.usage.cache_read_input_tokens ?? 0),
    cacheWriteTokens: Math.round(params.usage.cache_creation_input_tokens ?? 0),
    thinkingTokens: Math.round(thinking),
    outputTokens: Math.round(textOut),
    billedOutputTokens: Math.round(billedOut),
    usd: Math.round(usd * 1e6) / 1e6,
    modelId: params.modelId,
    guideAttached: params.guideAttached,
    guideStyle: params.guideStyle ?? null,
    avgChars,
    speechifyUsd: speechifyUsdFromChars(avgChars),
  };
}

/** Average per-call rows across cells that stored `calls`. */
function averageCallBreakdown(
  cells: CalibrationCellResult[],
  modelId: string,
): ScriptGenCostCallRow[] | undefined {
  const withCalls = cells.filter((c) => (c.calls?.length ?? 0) > 0);
  if (!withCalls.length) return undefined;
  // Align by label; unknown labels kept as-is. Prefer plan first, then section:*, then fix.
  const sums = new Map<
    string,
    {
      n: number;
      input: number;
      cacheW: number;
      cacheR: number;
      out: number;
      think: number;
      wrote: number;
      read: number;
      model: string;
      usd: number;
    }
  >();
  for (const c of withCalls) {
    for (const call of c.calls ?? []) {
      const u = call.usage;
      if (!u) continue;
      const model = call.model || modelId;
      const cur = sums.get(call.label) ?? {
        n: 0,
        input: 0,
        cacheW: 0,
        cacheR: 0,
        out: 0,
        think: 0,
        wrote: 0,
        read: 0,
        model,
        usd: 0,
      };
      const think = u.thinking_tokens ?? 0;
      cur.n += 1;
      cur.input += u.input_tokens;
      cur.cacheW += u.cache_creation_input_tokens ?? 0;
      cur.cacheR += u.cache_read_input_tokens ?? 0;
      cur.out += Math.max(0, u.output_tokens - think);
      cur.think += think;
      cur.usd += claudeUsdFromUsage(model, u);
      if (call.cacheRole === "wrote") cur.wrote += 1;
      if (call.cacheRole === "read") cur.read += 1;
      sums.set(call.label, cur);
    }
  }
  const rows: ScriptGenCostCallRow[] = [...sums.entries()].map(([label, s]) => {
    let cacheRole: ScriptGenCostCallRow["cacheRole"] = "unknown";
    if (s.wrote > s.read) cacheRole = "wrote";
    else if (s.read > s.wrote) cacheRole = "read";
    else if (s.wrote === 0 && s.read === 0) cacheRole = "none";
    return {
      label,
      model: s.model,
      inputTokens: Math.round(s.input / s.n),
      cacheWriteTokens: Math.round(s.cacheW / s.n),
      cacheReadTokens: Math.round(s.cacheR / s.n),
      outputTokens: Math.round(s.out / s.n),
      thinkingTokens: Math.round(s.think / s.n),
      cacheRole,
      usd: Math.round((s.usd / s.n) * 1e6) / 1e6,
    };
  });
  rows.sort((a, b) => {
    const rank = (l: string) =>
      l.startsWith("plan")
        ? 0
        : l.startsWith("section:")
          ? 1
          : l.startsWith("haiku") || l.includes("fix")
            ? 2
            : 3;
    const d = rank(a.label) - rank(b.label);
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });
  return rows;
}

/** Average measured cost per delivery × minutes from calibration cells. */
export function measuredScriptGenCostRows(
  cells: CalibrationCellResult[],
  modelId: string,
): ScriptGenCostRow[] {
  const rows: ScriptGenCostRow[] = [];
  for (const delivery of SCRIPT_COST_DELIVERIES) {
    for (const minutes of SCRIPT_COST_MINUTES) {
      const group = cells.filter(
        (c) =>
          c.delivery === delivery &&
          c.minutes === minutes &&
          !c.error &&
          usageFromCell(c),
      );
      if (!group.length) continue;
      const sum = emptyUsage();
      for (const c of group) {
        const u = usageFromCell(c)!;
        sum.input_tokens += u.input_tokens;
        sum.output_tokens += u.output_tokens;
        sum.thinking_tokens =
          (sum.thinking_tokens ?? 0) + (u.thinking_tokens ?? 0);
        sum.cache_creation_input_tokens =
          (sum.cache_creation_input_tokens ?? 0) +
          (u.cache_creation_input_tokens ?? 0);
        sum.cache_read_input_tokens =
          (sum.cache_read_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
        sum.cache_creation_5m_input_tokens =
          (sum.cache_creation_5m_input_tokens ?? 0) +
          (u.cache_creation_5m_input_tokens ?? 0);
        sum.cache_creation_1h_input_tokens =
          (sum.cache_creation_1h_input_tokens ?? 0) +
          (u.cache_creation_1h_input_tokens ?? 0);
      }
      const n = group.length;
      const avg: AnthropicMessageUsage = {
        input_tokens: sum.input_tokens / n,
        output_tokens: sum.output_tokens / n,
        thinking_tokens: (sum.thinking_tokens ?? 0) / n,
        cache_creation_input_tokens: (sum.cache_creation_input_tokens ?? 0) / n,
        cache_read_input_tokens: (sum.cache_read_input_tokens ?? 0) / n,
        cache_creation_5m_input_tokens:
          (sum.cache_creation_5m_input_tokens ?? 0) / n,
        cache_creation_1h_input_tokens:
          (sum.cache_creation_1h_input_tokens ?? 0) / n,
      };
      const guide = guideAggFromCells(group);
      const charLens = group
        .map((c) => spokenCharCount(c.scriptText))
        .filter((n) => n > 0);
      const avgChars = charLens.length
        ? charLens.reduce((a, b) => a + b, 0) / charLens.length
        : Math.round(
            (group.reduce((a, c) => a + (c.writtenWords || c.targetWords || 0), 0) /
              n) *
              FIXED_CHARS_PER_WORD,
          );
      const row = costRowFromUsage({
        delivery,
        minutes,
        modelId,
        usage: avg,
        scripts: n,
        source: "measured",
        guideAttached: guide.guideAttached,
        guideStyle: guide.guideStyle,
        avgChars,
      });
      // Price each cell's calls at their own model rates, then average.
      // (Aggregated tokens priced at Sonnet would overstate Haiku word-fix.)
      const scriptDetails = scriptDetailsFromCells(group, modelId);
      const pricedUsdAvg =
        scriptDetails.length > 0
          ? Math.round(
              (scriptDetails.reduce((s, d) => s + d.usd, 0) /
                scriptDetails.length) *
                1e6,
            ) / 1e6
          : row.usd;
      const haikuSnaps = group
        .map(
          (c) =>
            c.silenceHaikuAccuracy ?? c.silenceWordsHaikuAccuracy ?? null,
        )
        .filter(Boolean);
      const haikuUsdAvg = haikuSnaps.length
        ? Math.round(
            (haikuSnaps.reduce((s, a) => s + (a!.haikuUsd || 0), 0) /
              haikuSnaps.length) *
              1e6,
          ) / 1e6
        : undefined;
      const haikuRanCount = haikuSnaps.filter((a) => a!.haikuRan).length;
      const haikuRunPct =
        haikuSnaps.length > 0
          ? Math.round((haikuRanCount / haikuSnaps.length) * 1000) / 10
          : null;
      rows.push({
        ...row,
        usd: pricedUsdAvg,
        calls: averageCallBreakdown(group, modelId),
        scriptDetails,
        ...(haikuSnaps.length
          ? { haikuUsd: haikuUsdAvg ?? 0, haikuRunPct }
          : {}),
      });
    }
  }
  return rows;
}

/**
 * Offline estimate for one delivery × length (sections path, cold cache).
 * Uses ≈chars/4 — good enough for the admin table until a calibration run
 * records real usage.
 *
 * Parity with production: only attaches a writer's guide when
 * `styleGuideStyle` is a known type (same as high-confidence infer / creator
 * pick). Default sample brief is general → no guide.
 */
export function estimateScriptGenCost(params: {
  delivery: DeliveryId;
  minutes: number;
  modelId?: string;
  /** Spoken word target for the length. */
  targetWords: number;
  pauseSeconds: number;
  silenceShare: number;
  longestPauseSeconds: number;
  /**
   * Style whose writer's guide is included (production: inferred or creator).
   * Empty / unknown → no guide in the pre-prompt.
   */
  styleGuideStyle?: string | null;
}): ScriptGenCostRow {
  const modelId = params.modelId?.trim() || CLAUDE_SONNET_55_MODEL_ID;
  const minutes = params.minutes;
  const totals = {
    totalWords: params.targetWords,
    totalPauseSeconds: params.pauseSeconds,
    bodySeconds: minutes * 60,
  };
  // Typical section count ≈ ceil(words / 200) with a floor of 2 for ≥5 min.
  const sectionCount = Math.max(
    minutes <= 5 ? 2 : 3,
    Math.ceil(params.targetWords / 200),
  );
  const transcript =
    "User: I want a calm practice after a hard day at work; help me settle and breathe.\nGuide: Of course — we can do a short settling and then breath.";

  const guideMarkdown = styleGuideMarkdownFor(params.styleGuideStyle);
  const guideAttached: StyleGuideInPrompt = guideMarkdown ? "yes" : "no";
  const guideStyle = guideMarkdown
    ? (params.styleGuideStyle?.trim() || null)
    : null;

  const planPrompt = buildMeditationScriptGenerationPrompt({
    transcript,
    meditationStyle: "",
    journalMode: false,
    targetMinutes: minutes,
    speechSpeed: 1,
    includeSegmentPlaceholders: false,
    deliveryStyle: params.delivery,
    styleGuideContext: {
      silenceShare: params.silenceShare,
      longestPauseSeconds: params.longestPauseSeconds,
    },
    styleGuideStyle: guideStyle ?? undefined,
    lengthFit: {
      effectiveWpm: 130,
      silenceSharePct: params.silenceShare * 100,
      words: params.targetWords,
      pauseSecondsWritten: params.pauseSeconds,
    },
    task: {
      kind: "plan",
      totals,
      wordCap: 220,
      wordMin: 40,
      minSections: sectionCount,
      maxSectionMinutes: 3,
    },
  });

  const systemTok = approxTokens(planPrompt.systemStable);
  const contextTok = approxTokens(planPrompt.meditationContext);
  const planTaskTok = approxTokens(planPrompt.taskContent);
  // Compact plan (short keys, field caps, no "p") + shared section rules → cp2.
  const planJsonTok = Math.round(40 + sectionCount * 35);
  const sharedSectionRulesTok = 120;
  const cp2Tok = planJsonTok + sharedSectionRulesTok;
  // Short uncached section task: name + word range + pause + role (~<150 tok).
  const sectionTaskTok = 40;
  const sharedTok = systemTok + contextTok;

  // Plan writes cp1. First section writes cp2; remaining sections read cp1+cp2.
  // Uncached = plan task + short section task × N.
  const inputUncached = planTaskTok + sectionCount * sectionTaskTok;
  const cacheWrite5m = sharedTok + cp2Tok;
  const cacheWrite = cacheWrite5m;
  const cacheRead =
    sectionCount * sharedTok + Math.max(0, sectionCount - 1) * cp2Tok;

  // Output: tighter plan (~400 tok @ 10 min) + script + short pause markers.
  const pauseMarkers = Math.round(
    Math.max(8, params.pauseSeconds / 4),
  );
  const scriptOut = Math.round(params.targetWords * 1.15 + pauseMarkers * 2.5);
  const planOut = Math.round(80 + sectionCount * 55);
  const billedOutput = planOut + scriptOut;
  // Sections use effort:low + between_tools → near-zero thinking; plan may think a little.
  const thinking = Math.round(80 + minutes * 4);

  const usage: AnthropicMessageUsage = {
    input_tokens: inputUncached,
    output_tokens: billedOutput + thinking,
    thinking_tokens: thinking,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: cacheRead,
    cache_creation_5m_input_tokens: cacheWrite5m,
    cache_creation_1h_input_tokens: 0,
  };

  const avgChars = Math.round(params.targetWords * FIXED_CHARS_PER_WORD);
  const wordsPerSection = Math.round(params.targetWords / sectionCount);
  const calls: ScriptGenCostCallRow[] = [
    callRowFromUsage(
      "plan",
      modelId,
      {
        input_tokens: planTaskTok,
        output_tokens: planOut + Math.round(thinking * 0.7),
        thinking_tokens: Math.round(thinking * 0.7),
        cache_creation_input_tokens: sharedTok,
        cache_read_input_tokens: 0,
      },
      "wrote",
    ),
    ...Array.from({ length: sectionCount }, (_, i) =>
      callRowFromUsage(
        `section:${i + 1}`,
        modelId,
        {
          input_tokens: sectionTaskTok,
          output_tokens: Math.round(
            wordsPerSection * 1.15 + (pauseMarkers / sectionCount) * 2.5,
          ),
          thinking_tokens: Math.round((thinking * 0.3) / sectionCount),
          cache_creation_input_tokens: i === 0 ? cp2Tok : 0,
          cache_read_input_tokens: sharedTok + (i === 0 ? 0 : cp2Tok),
        },
        i === 0 ? "wrote" : "read",
      ),
    ),
  ];
  const row = costRowFromUsage({
    delivery: params.delivery,
    minutes,
    modelId,
    usage,
    scripts: 0,
    source: "estimate",
    guideAttached,
    guideStyle,
    avgChars,
  });
  return { ...row, calls };
}

export function estimateAllScriptGenCosts(params: {
  modelId: string;
  silenceShareByDelivery: Record<DeliveryId, number>;
  longestPauseSeconds: number;
  wordsFor: (delivery: DeliveryId, minutes: number) => {
    words: number;
    pauseSeconds: number;
  };
  /** Optional; omit / empty → estimate assumes no writer's guide (general brief). */
  styleGuideStyle?: string | null;
}): ScriptGenCostRow[] {
  const rows: ScriptGenCostRow[] = [];
  for (const delivery of SCRIPT_COST_DELIVERIES) {
    for (const minutes of SCRIPT_COST_MINUTES) {
      const { words, pauseSeconds } = params.wordsFor(delivery, minutes);
      rows.push(
        estimateScriptGenCost({
          delivery,
          minutes,
          modelId: params.modelId,
          targetWords: words,
          pauseSeconds,
          silenceShare: params.silenceShareByDelivery[delivery],
          longestPauseSeconds: params.longestPauseSeconds,
          styleGuideStyle: params.styleGuideStyle,
        }),
      );
    }
  }
  return rows;
}

/**
 * Offline estimate for single-call script gen (one Messages call, cold 5m cache).
 */
export function estimateSingleCallScriptGenCost(params: {
  delivery: DeliveryId;
  minutes: number;
  modelId?: string;
  targetWords: number;
  pauseSeconds: number;
  silenceShare: number;
  longestPauseSeconds: number;
  styleGuideStyle?: string | null;
}): ScriptGenCostRow {
  const modelId = params.modelId?.trim() || CLAUDE_SONNET_55_MODEL_ID;
  const minutes = params.minutes;
  const transcript =
    "User: I want a calm practice after a hard day at work; help me settle and breathe.\nGuide: Of course — we can do a short settling and then breath.";

  const guideMarkdown = styleGuideMarkdownFor(params.styleGuideStyle);
  const guideAttached: StyleGuideInPrompt = guideMarkdown ? "yes" : "no";
  const guideStyle = guideMarkdown
    ? (params.styleGuideStyle?.trim() || null)
    : null;

  const prompt = buildMeditationScriptGenerationPrompt({
    transcript,
    meditationStyle: "",
    journalMode: false,
    targetMinutes: minutes,
    speechSpeed: 1,
    includeSegmentPlaceholders: false,
    deliveryStyle: params.delivery,
    styleGuideContext: {
      silenceShare: params.silenceShare,
      longestPauseSeconds: params.longestPauseSeconds,
    },
    styleGuideStyle: guideStyle ?? undefined,
    lengthFit: {
      effectiveWpm: 130,
      silenceSharePct: params.silenceShare * 100,
      words: params.targetWords,
      pauseSecondsWritten: params.pauseSeconds,
    },
  });

  const systemTok = approxTokens(prompt.systemStable);
  const contextTok = approxTokens(prompt.meditationContext);
  const taskTok = approxTokens(prompt.taskContent);

  // One cold call: write 5m system + 5m context; uncached = task.
  const inputUncached = taskTok;
  const cacheWrite5m = systemTok + contextTok;
  const cacheRead = 0;

  const pauseMarkers = Math.round(Math.max(8, params.pauseSeconds / 4));
  const scriptOut = Math.round(params.targetWords * 1.15 + pauseMarkers * 2.5);
  // Single-call keeps default effort — more thinking than section writes.
  const thinking = Math.round(200 + minutes * 40);
  const billedOutput = scriptOut + thinking;

  const usage: AnthropicMessageUsage = {
    input_tokens: inputUncached,
    output_tokens: billedOutput,
    thinking_tokens: thinking,
    cache_creation_input_tokens: cacheWrite5m,
    cache_read_input_tokens: cacheRead,
    cache_creation_5m_input_tokens: cacheWrite5m,
    cache_creation_1h_input_tokens: 0,
  };

  return costRowFromUsage({
    delivery: params.delivery,
    minutes,
    modelId,
    usage,
    scripts: 0,
    source: "estimate",
    guideAttached,
    guideStyle,
    avgChars: Math.round(params.targetWords * FIXED_CHARS_PER_WORD),
  });
}

export function estimateAllSingleCallScriptGenCosts(params: {
  modelId: string;
  silenceShareByDelivery: Record<DeliveryId, number>;
  longestPauseSeconds: number;
  wordsFor: (delivery: DeliveryId, minutes: number) => {
    words: number;
    pauseSeconds: number;
  };
  styleGuideStyle?: string | null;
}): ScriptGenCostRow[] {
  const rows: ScriptGenCostRow[] = [];
  for (const delivery of SCRIPT_COST_DELIVERIES) {
    for (const minutes of SCRIPT_COST_MINUTES) {
      const { words, pauseSeconds } = params.wordsFor(delivery, minutes);
      rows.push(
        estimateSingleCallScriptGenCost({
          delivery,
          minutes,
          modelId: params.modelId,
          targetWords: words,
          pauseSeconds,
          silenceShare: params.silenceShareByDelivery[delivery],
          longestPauseSeconds: params.longestPauseSeconds,
          styleGuideStyle: params.styleGuideStyle,
        }),
      );
    }
  }
  return rows;
}

/** Prefer measured rows; fill missing delivery×minutes with estimates. */
export function mergeMeasuredWithEstimates(
  measured: ScriptGenCostRow[],
  estimates: ScriptGenCostRow[],
): ScriptGenCostRow[] {
  const key = (r: ScriptGenCostRow) => `${r.delivery}:${r.minutes}`;
  const map = new Map(estimates.map((r) => [key(r), r]));
  for (const m of measured) {
    const prev = map.get(key(m));
    map.set(key(m), {
      ...m,
      // Older measured cells lack call breakdown — keep estimate calls until re-run.
      calls: m.calls?.length ? m.calls : prev?.calls,
      scriptDetails: m.scriptDetails?.length
        ? m.scriptDetails
        : prev?.scriptDetails,
    });
  }
  return SCRIPT_COST_DELIVERIES.flatMap((delivery) =>
    SCRIPT_COST_MINUTES.map(
      (minutes) =>
        map.get(`${delivery}:${minutes}`) ??
        estimates.find(
          (e) => e.delivery === delivery && e.minutes === minutes,
        )!,
    ),
  ).filter(Boolean);
}

/**
 * When cells have scripts but no stored Claude usage (older single-call runs),
 * still overlay real avg spoken chars / TTS ≈ onto estimate rows.
 */
export function overlayAvgCharsFromCells(
  rows: ScriptGenCostRow[],
  cells: CalibrationCellResult[],
): ScriptGenCostRow[] {
  return rows.map((row) => {
    if (row.source === "measured" && row.avgChars > 0) return row;
    const group = cells.filter(
      (c) =>
        c.delivery === row.delivery &&
        c.minutes === row.minutes &&
        !c.error &&
        spokenCharCount(c.scriptText) > 0,
    );
    if (!group.length) return row;
    const avgChars =
      group.reduce((a, c) => a + spokenCharCount(c.scriptText), 0) /
      group.length;
    const n = Math.round(avgChars);
    return {
      ...row,
      avgChars: n,
      speechifyUsd: speechifyUsdFromChars(n),
    };
  });
}

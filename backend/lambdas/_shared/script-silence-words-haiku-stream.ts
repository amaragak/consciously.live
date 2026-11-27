/**
 * Stream Sonnet silence-words script and Haiku-fix each phase as soon as it
 * closes (next ## header arrives or stream ends). Wall-clock total overlaps
 * Sonnet remaining output with Haiku on earlier phases.
 */
import {
  claudeUsdFromUsage,
  coerceHaikuModel,
  parseAnthropicMessageModel,
  parseAnthropicMessageUsage,
} from "./anthropic-pricing";
import { buildScriptGenerationCachedBody } from "./anthropic-prompt-cache";
import { recordClaudeUsage, type AiUsageSource } from "./ai-usage";
import { countSpokenWords } from "./meditation-length-fit";
import { clampAskSonnetPct } from "./script-silence-haiku-settings";
import {
  applySilenceHaikuWordFix,
  type HaikuPhaseFixResult,
  type SilenceHaikuWordFixResult,
} from "./script-silence-haiku-word-fix";
import {
  joinTimeBasedPhases,
  splitTimeBasedPhases,
  type TimeBasedCallUsage,
  type TimeBasedPhaseBlock,
} from "./script-time-based-generate";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type SilenceWordsHaikuStreamTiming = {
  /** Wall clock: Sonnet stream start → stream end. */
  sonnetMs: number;
  /**
   * Wall clock: first Haiku kickoff → last Haiku settle (may overlap Sonnet).
   * 0 when Haiku never ran.
   */
  haikuMs: number;
  /** Wall clock: Sonnet start → all Haiku done. */
  totalMs: number;
};

export type SilenceWordsHaikuPhaseReady = {
  phaseIndex: number;
  phase: TimeBasedPhaseBlock;
  /** Header-stripped body ready for TTS (post-Haiku when fixed). */
  ttsBody: string;
};

async function streamAnthropicText(params: {
  apiKey: string;
  model: string;
  body: Record<string, unknown>;
  label: string;
  source?: AiUsageSource;
  reason: string;
  onDelta?: (fullText: string) => void;
}): Promise<{ text: string; usage: TimeBasedCallUsage | null }> {
  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...params.body, stream: true }),
  });
  if (!upstream.ok || !upstream.body) {
    const responseText = await upstream.text();
    throw new Error(
      `Anthropic ${params.label} stream failed: ${responseText.slice(0, 2000)}`,
    );
  }

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreate = 0;
  let cacheRead = 0;
  let responseModel = params.model;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const json = line.replace(/^data:\s*/, "").trim();
        if (!json || json === "[DONE]") continue;
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(json) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (data.type === "message_start") {
          const msg = data.message as Record<string, unknown> | undefined;
          if (typeof msg?.model === "string" && msg.model.trim()) {
            responseModel = msg.model.trim();
          }
          const usage = msg?.usage as Record<string, unknown> | undefined;
          if (typeof usage?.input_tokens === "number") {
            inputTokens = usage.input_tokens;
          }
          if (typeof usage?.cache_creation_input_tokens === "number") {
            cacheCreate = usage.cache_creation_input_tokens;
          }
          if (typeof usage?.cache_read_input_tokens === "number") {
            cacheRead = usage.cache_read_input_tokens;
          }
        }
        if (data.type === "message_delta") {
          const usage = data.usage as Record<string, unknown> | undefined;
          if (typeof usage?.output_tokens === "number") {
            outputTokens = usage.output_tokens;
          }
        }
        if (data.type === "content_block_delta") {
          const delta = data.delta as Record<string, unknown> | undefined;
          if (
            delta?.type === "text_delta" &&
            typeof delta.text === "string" &&
            delta.text.length > 0
          ) {
            text += delta.text;
            params.onDelta?.(text);
          }
        }
        if (data.type === "error") {
          const err = data.error as Record<string, unknown> | undefined;
          const msg =
            typeof err?.message === "string"
              ? err.message
              : "Anthropic stream error";
          throw new Error(msg);
        }
      }
    }
  }

  const rawUsage = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    thinking_tokens: 0,
    cache_creation_input_tokens: cacheCreate,
    cache_read_input_tokens: cacheRead,
  };
  const usd = claudeUsdFromUsage(responseModel, rawUsage);
  const usage: TimeBasedCallUsage = {
    label: params.label,
    model: responseModel,
    requestedModel: params.model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_creation_input_tokens: cacheCreate,
    cache_read_input_tokens: cacheRead,
    usd: Math.round(usd * 1e6) / 1e6,
  };
  void recordClaudeUsage({
    model: responseModel,
    feature: "meditation-script",
    source: params.source ?? "user",
    reason: params.reason,
    usage: rawUsage,
  });
  // Keep parse helpers referenced for parity with non-stream path.
  void parseAnthropicMessageUsage;
  void parseAnthropicMessageModel;
  return { text: text.trim(), usage };
}

/**
 * How many phases are closed (safe to Haiku). While streaming, the last open
 * phase is still receiving tokens.
 */
export function closedPhaseCount(
  partialText: string,
  streamDone: boolean,
): number {
  const phases = splitTimeBasedPhases(partialText);
  if (!phases.length) return 0;
  if (streamDone) return phases.length;
  return Math.max(0, phases.length - 1);
}

export async function streamSilenceWordsSonnetWithProgressiveHaiku(params: {
  apiKey: string;
  model: string;
  haikuModelId: string;
  systemStable: string;
  meditationContext: string;
  taskContent: string;
  maxTokens: number;
  wordBudget: number;
  scriptTriggerPct: number;
  phaseTriggerPct: number;
  /**
   * Option×length "Ask Sonnet for" fraction. Streaming Haiku targets are
   * header words ÷ (1 + ask%) so phases aim at the real budget, not the
   * inflated Sonnet ask. Gated mode scales to wordBudget instead.
   */
  askSonnetPct?: number;
  /** When true, stream phases to TTS without a Haiku word-fix pass. */
  skipHaiku?: boolean;
  source?: AiUsageSource;
  onPhaseReady?: (phase: SilenceWordsHaikuPhaseReady) => void | Promise<void>;
}): Promise<{
  scriptAsWritten: string;
  haiku: SilenceHaikuWordFixResult;
  usages: TimeBasedCallUsage[];
  timing: SilenceWordsHaikuStreamTiming;
}> {
  const t0 = Date.now();
  let sonnetEndedAt = 0;
  let haikuStartedAt: number | null = null;
  let haikuEndedAt: number | null = null;

  const kicked = new Set<number>();
  const haikuJobs = new Map<number, Promise<void>>();
  let latestText = "";
  let workingPhases: TimeBasedPhaseBlock[] = [];
  const phaseResults: HaikuPhaseFixResult[] = [];
  const haikuUsages: TimeBasedCallUsage[] = [];
  let phasesFixed = 0;
  let phasesRejected = 0;

  const kickClosedPhases = (streamDone: boolean) => {
    latestText = latestText.replace(/^\uFEFF/, "").trim();
    workingPhases = splitTimeBasedPhases(latestText);
    const closed = closedPhaseCount(latestText, streamDone);
    for (let i = 0; i < closed; i++) {
      if (kicked.has(i)) continue;
      kicked.add(i);
      const phase = workingPhases[i]!;
      const words = countSpokenWords(phase.body);
      const headerWords = Math.max(0, Math.round(phase.headerWords || 0));
      // Was: use Sonnet header words directly (inflated by Ask Sonnet %).
      // const headerTarget = Math.max(1, Math.round(phase.headerWords || 0));
      // const wordTarget =
      //   headerTarget > 0
      //     ? headerTarget
      //     : Math.max(1, Math.round(params.wordBudget / Math.max(1, closed)));
      // Real phase target: undo the prompt-only Ask Sonnet bump.
      const askFactor = 1 + clampAskSonnetPct(params.askSonnetPct ?? 0, 0);
      const wordTarget =
        headerWords > 0
          ? Math.max(1, Math.round(headerWords / askFactor))
          : Math.max(1, Math.round(params.wordBudget / Math.max(1, closed)));
      const miss = (words - wordTarget) / wordTarget;
      const row: HaikuPhaseFixResult = {
        phaseIndex: i,
        phaseName: phase.name,
        attempted: false,
        accepted: false,
        rejectReason: null,
        wordsBefore: words,
        wordsAfter: words,
        wordTarget,
        headerWords: headerWords > 0 ? headerWords : null,
        haikuText: null,
      };
      while (phaseResults.length <= i) {
        phaseResults.push({
          phaseIndex: phaseResults.length,
          phaseName: workingPhases[phaseResults.length]?.name ?? `phase-${phaseResults.length}`,
          attempted: false,
          accepted: false,
          rejectReason: null,
          wordsBefore: 0,
          wordsAfter: 0,
          wordTarget: 0,
          headerWords: null,
          haikuText: null,
        });
      }
      phaseResults[i] = row;

      // Create open sits: one Sonnet only — fire TTS as soon as the phase closes.
      if (params.skipHaiku === true) {
        void Promise.resolve(
          params.onPhaseReady?.({
            phaseIndex: i,
            phase,
            ttsBody: phase.body,
          }),
        );
        continue;
      }

      if (Math.abs(miss) <= params.phaseTriggerPct + 1e-9) {
        void Promise.resolve(
          params.onPhaseReady?.({
            phaseIndex: i,
            phase,
            ttsBody: phase.body,
          }),
        );
        continue;
      }

      if (haikuStartedAt == null) haikuStartedAt = Date.now();
      const job = (async () => {
        // One-phase script so Haiku runs immediately without waiting for later
        // phases (header word target = this phase's budget share for now).
        const batch = await applySilenceHaikuWordFix({
          apiKey: params.apiKey,
          haikuModelId: params.haikuModelId,
          scriptWithHeaders: joinTimeBasedPhases([phase]),
          wordBudget: wordTarget,
          scriptTriggerPct: params.scriptTriggerPct,
          phaseTriggerPct: params.phaseTriggerPct,
          phaseTargetSource: "header_words",
          streamingPartial: true,
          haikuParallel: true,
          source: params.source,
        });
        for (const u of batch.usages) haikuUsages.push(u);
        const fixed = batch.phaseResults[0];
        if (fixed) {
          phaseResults[i] = { ...fixed, phaseIndex: i, phaseName: phase.name };
          if (fixed.accepted) {
            phasesFixed += 1;
            const parts = splitTimeBasedPhases(batch.scriptWithHeaders);
            if (parts[0]) {
              workingPhases[i] = {
                ...phase,
                body: parts[0].body,
              };
            }
          } else if (fixed.attempted) {
            phasesRejected += 1;
          }
        }
        haikuEndedAt = Date.now();
        const readyPhase = workingPhases[i]!;
        await params.onPhaseReady?.({
          phaseIndex: i,
          phase: readyPhase,
          ttsBody: readyPhase.body,
        });
      })().catch((e) => {
        console.warn(
          "stream haiku phase failed",
          phase.name,
          e instanceof Error ? e.message : e,
        );
        haikuEndedAt = Date.now();
        void Promise.resolve(
          params.onPhaseReady?.({
            phaseIndex: i,
            phase,
            ttsBody: phase.body,
          }),
        );
      });
      haikuJobs.set(i, job);
    }
  };

  const body = buildScriptGenerationCachedBody({
    model: params.model,
    maxTokens: params.maxTokens,
    systemStable: params.systemStable,
    meditationContext: params.meditationContext,
    taskContent: params.taskContent,
    noCache: true,
    effort: "medium",
  });

  const streamed = await streamAnthropicText({
    apiKey: params.apiKey,
    model: params.model,
    label: "silence-words-haiku-write",
    reason: "script-silence-words-haiku-write",
    source: params.source,
    body,
    onDelta: (full) => {
      latestText = full;
      kickClosedPhases(false);
    },
  });
  sonnetEndedAt = Date.now();
  latestText = streamed.text.replace(/^\uFEFF/, "").trim();
  kickClosedPhases(true);
  await Promise.all([...haikuJobs.values()]);
  if (haikuJobs.size && haikuEndedAt == null) haikuEndedAt = Date.now();

  const scriptAsWritten = latestText;
  const asWrittenPhases = splitTimeBasedPhases(scriptAsWritten);
  // Ensure workingPhases covers full script; fill any never-kicked phases.
  for (let i = 0; i < asWrittenPhases.length; i++) {
    if (!workingPhases[i]) workingPhases[i] = asWrittenPhases[i]!;
    if (!kicked.has(i)) {
      kicked.add(i);
      const phase = workingPhases[i]!;
      await params.onPhaseReady?.({
        phaseIndex: i,
        phase,
        ttsBody: phase.body,
      });
    }
  }
  workingPhases = workingPhases.slice(0, asWrittenPhases.length);

  const wordsBefore = asWrittenPhases.reduce(
    (s, p) => s + countSpokenWords(p.body),
    0,
  );
  const wordsAfter = workingPhases.reduce(
    (s, p) => s + countSpokenWords(p.body),
    0,
  );
  const haikuRan = phasesFixed > 0 || phasesRejected > 0 || haikuUsages.length > 0;
  const haikuUsd =
    Math.round(haikuUsages.reduce((s, u) => s + (u.usd || 0), 0) * 1e6) / 1e6;

  // Align phaseResults length to final phase count.
  while (phaseResults.length < workingPhases.length) {
    const i = phaseResults.length;
    const p = workingPhases[i]!;
    const w = countSpokenWords(p.body);
    phaseResults.push({
      phaseIndex: i,
      phaseName: p.name,
      attempted: false,
      accepted: false,
      rejectReason: null,
      wordsBefore: w,
      wordsAfter: w,
      wordTarget: Math.max(1, Math.round(p.headerWords || 0)),
      headerWords: p.headerWords || null,
      haikuText: null,
    });
  }

  const haiku: SilenceHaikuWordFixResult = {
    scriptWithHeaders: joinTimeBasedPhases(workingPhases),
    scriptAsWritten,
    haikuRan,
    wordsBeforeHaiku: wordsBefore,
    wordsAfterHaiku: wordsAfter,
    wordBudget: params.wordBudget,
    phasesFixed,
    phasesRejected,
    phaseResults: phaseResults.slice(0, workingPhases.length),
    usages: haikuUsages,
    haikuUsd,
  };

  void coerceHaikuModel;
  const usages = streamed.usage ? [streamed.usage, ...haikuUsages] : [...haikuUsages];
  const timing: SilenceWordsHaikuStreamTiming = {
    sonnetMs: Math.max(0, sonnetEndedAt - t0),
    haikuMs:
      haikuStartedAt != null && haikuEndedAt != null
        ? Math.max(0, haikuEndedAt - haikuStartedAt)
        : 0,
    totalMs: Math.max(0, Date.now() - t0),
  };

  return { scriptAsWritten, haiku, usages, timing };
}

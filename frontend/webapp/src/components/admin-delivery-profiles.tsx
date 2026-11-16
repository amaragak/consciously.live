import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  listAdminVoice,
  postAdminVoice,
  type AdminDeliveryLengthStats,
  type AdminSectionStatsRow,
} from "@/lib/medimade-api";
import {
  coerceDeliveryProfiles,
  defaultDeliveryProfiles,
  previewDelivery,
  speechShareFor,
  silenceShareFor,
  type DeliveryId,
  type DeliveryProfiles,
} from "@/lib/delivery-profiles";
import {
  coerceScriptTargetCorrection,
  defaultScriptTargetCorrection,
  type ScriptTargetCorrection,
} from "@/lib/script-target-correction";
import {
  activeCalibrationBriefs,
  CALIBRATION_BRIEF_COUNT,
  claudeModelLabel,
  coerceCalibrationBriefCount,
  coerceScriptGenerationSettings,
  DEFAULT_CALIBRATION_BRIEFS,
  defaultScriptGenerationSettings,
  modelHasFactors,
  modelHasSingleCallFactors,
  SCRIPT_GENERATION_MODES,
  scriptWriteModeLabel,
  type ScriptGenerationSettings,
  type ScriptWriteMode,
} from "@/lib/script-generation-settings";
import { claudeRatesPerMillion } from "@/lib/claude-pricing";

type AdminScriptTab =
  | "settings"
  | "calibrate"
  | "costs"
  | "accuracy"
  | "preview";

const ADMIN_SCRIPT_TABS: readonly AdminScriptTab[] = [
  "settings",
  "calibrate",
  "costs",
  "accuracy",
  "preview",
] as const;

const ADMIN_SCRIPT_MODES: readonly ScriptWriteMode[] = [
  "sections",
  "single",
  "time",
  "silence",
  "silence_haiku",
  "silence_words",
  "silence_words_haiku",
] as const;

function parseAdminScriptTab(raw: string | null): AdminScriptTab | null {
  return raw && (ADMIN_SCRIPT_TABS as readonly string[]).includes(raw)
    ? (raw as AdminScriptTab)
    : null;
}

function parseAdminScriptMode(raw: string | null): ScriptWriteMode | null {
  return raw && (ADMIN_SCRIPT_MODES as readonly string[]).includes(raw)
    ? (raw as ScriptWriteMode)
    : null;
}

type ScriptGenCostCallRow = {
  label: string;
  model: string;
  inputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cacheRole: "wrote" | "read" | "none" | "unknown";
  usd?: number;
};

type ScriptGenCostScriptDetail = {
  briefIndex: number;
  brief: string;
  usd: number;
  calls: ScriptGenCostCallRow[];
};

type ScriptGenCostRow = {
  delivery: "casual" | "guided" | "open_sits";
  minutes: number;
  source: "measured" | "estimate";
  scripts: number;
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  thinkingTokens: number;
  outputTokens: number;
  billedOutputTokens: number;
  usd: number;
  modelId: string;
  /** Whether a writer's style guide was in the system / pre-prompt. */
  guideAttached?: "yes" | "no" | "mixed";
  guideStyle?: string | null;
  /** Avg spoken chars (pauses stripped). Measured from calibration scripts. */
  avgChars?: number;
  /** Approx Speechify TTS at ~$10 / 1M chars. */
  speechifyUsd?: number;
  /** Per-call breakdown (plan / sections / fix). */
  calls?: ScriptGenCostCallRow[];
  /** Per-script breakdown for expandable Costs rows. */
  scriptDetails?: ScriptGenCostScriptDetail[];
  /** Silence-fit + Haiku: avg Haiku USD (included in usd). */
  haikuUsd?: number;
  /** Silence-fit + Haiku: % of scripts where Haiku ran. */
  haikuRunPct?: number | null;
};

function fmtGuide(row: ScriptGenCostRow): string {
  const g = row.guideAttached ?? "no";
  if (g === "mixed") return "mixed";
  if (g === "yes") {
    return row.guideStyle?.trim() ? `yes · ${row.guideStyle}` : "yes";
  }
  return "no";
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1 ? 3 : 4;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function fmtTok(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString();
}

/** Human label for a cost call (write / word fix: phase / plan / section). */
function fmtCostCallLabel(label: string): string {
  const raw = (label ?? "").trim();
  if (!raw) return "call";
  const haikuPhase = /^haiku-phase-(.+)$/i.exec(raw);
  if (haikuPhase) return `word fix: ${haikuPhase[1]}`;
  if (/(^|[-_])write$/i.test(raw) || /write$/i.test(raw)) return "write";
  if (/^plan\b/i.test(raw)) return "plan";
  const section = /^section:(.+)$/i.exec(raw);
  if (section) return `section: ${section[1]}`;
  if (/fix/i.test(raw)) return raw.replace(/^.*fix[:\s-]*/i, "fix: ") || raw;
  return raw;
}

function CostCallTable({
  calls,
  emptyHint,
}: {
  calls: ScriptGenCostCallRow[];
  emptyHint?: string;
}) {
  if (!calls.length) {
    return (
      <p className="text-muted">
        {emptyHint ?? "No per-call breakdown for this script."}
      </p>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-muted">
          <th className="py-1 pr-2 text-left font-medium">Call</th>
          <th className="py-1 pr-2 text-left font-medium">Model</th>
          <th className="py-1 pr-2 text-right font-medium">Input</th>
          <th className="py-1 pr-2 text-right font-medium">Cache R</th>
          <th className="py-1 pr-2 text-right font-medium">Cache W</th>
          <th className="py-1 pr-2 text-right font-medium">Out</th>
          <th className="py-1 pr-2 text-right font-medium">Think</th>
          <th className="py-1 text-right font-medium">Cost</th>
        </tr>
      </thead>
      <tbody>
        {calls.map((c, i) => (
          <tr key={`${c.label}-${i}`}>
            <td className="py-0.5 pr-2 text-foreground">
              {fmtCostCallLabel(c.label)}
            </td>
            <td className="py-0.5 pr-2 text-muted">{c.model || "—"}</td>
            <td className="py-0.5 pr-2 text-right tabular-nums">
              {fmtTok(c.inputTokens)}
            </td>
            <td className="py-0.5 pr-2 text-right tabular-nums">
              {fmtTok(c.cacheReadTokens)}
            </td>
            <td className="py-0.5 pr-2 text-right tabular-nums">
              {fmtTok(c.cacheWriteTokens)}
            </td>
            <td className="py-0.5 pr-2 text-right tabular-nums">
              {fmtTok(c.outputTokens)}
            </td>
            <td className="py-0.5 pr-2 text-right tabular-nums">
              {fmtTok(c.thinkingTokens)}
            </td>
            <td className="py-0.5 text-right tabular-nums">
              {fmtUsd(c.usd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CostRowExpandPanel({
  row,
  colSpan,
}: {
  row: ScriptGenCostRow;
  colSpan: number;
}) {
  const details = row.scriptDetails?.length ? row.scriptDetails : null;
  const avgCalls = row.calls?.length ? row.calls : [];
  return (
    <tr className="border-b border-border/40">
      <td colSpan={colSpan} className="bg-muted/10 px-3 py-2">
        {details ? (
          <div className="space-y-3">
            {details.map((s) => (
              <div
                key={`script-${s.briefIndex}`}
                className="rounded-lg border border-border/50 px-2 py-2"
              >
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">
                    Script {s.briefIndex + 1}
                    {s.brief?.trim() ? (
                      <span className="ml-2 font-normal text-muted">
                        {s.brief.trim().slice(0, 100)}
                        {s.brief.trim().length > 100 ? "…" : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-foreground">
                    Total {fmtUsd(s.usd)}
                  </span>
                </div>
                <CostCallTable calls={s.calls ?? []} />
              </div>
            ))}
          </div>
        ) : avgCalls.length ? (
          <div>
            <p className="mb-1 text-xs text-muted">
              Averaged calls (re-run costs after deploy for per-script detail).
            </p>
            <CostCallTable calls={avgCalls} />
          </div>
        ) : (
          <p className="text-muted">
            No per-call breakdown yet — re-run costs after deploy to capture
            call-level usage.
          </p>
        )}
      </td>
    </tr>
  );
}

function num(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block text-sm text-foreground">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(num(e.target.value, value))}
        className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
      />
    </label>
  );
}

const DELIVERY_LABEL = { casual: "Casual", guided: "Guided", open_sits: "Open sits" } as const;

function fmtPct(n: number | null | undefined, signed = false): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const r = Math.round(n);
  if (!signed) return `${r}%`;
  if (r === 0) return "0%";
  return r > 0 ? `+${r}%` : `−${Math.abs(r)}%`;
}

function fmtClock(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function silenceFitStepLabel(step: string | null | undefined): string {
  if (step === "long_pauses") return "Long pauses";
  if (step === "short_pauses") return "Short pauses";
  if (step === "extra_music") return "Extra music";
  if (step === "outside") return "Outside";
  if (step === "none") return "None";
  if (step === "mixed") return "mixed";
  return step?.trim() || "—";
}

type SilenceFamilyMode =
  | "silence"
  | "silence_haiku"
  | "silence_words"
  | "silence_words_haiku";

type SilenceAccuracyRow = {
  option: string;
  label: string;
  minutes: number;
  scripts: number;
  speechShare: number | null;
  /** Speech share from Sonnet words alone (Haiku modes). */
  speechShareSonnet?: number | null;
  speakingBandMin: number;
  speakingBandMax: number;
  beforeFitPct: number | null;
  afterFitPct: number | null;
  wordsVsBudgetPct?: number | null;
  /** Words vs budget from Sonnet alone (Haiku modes). */
  wordsVsBudgetSonnetPct?: number | null;
  wordsVsBudgetSonnetMin?: number | null;
  wordsVsBudgetSonnetMax?: number | null;
  wordsSonnetUnderCount?: number | null;
  haikuRanCount?: number;
  haikuPhasesFixedAvg?: number | null;
  estimatedTotalAudioSeconds: number | null;
  fitStep: string | null;
  why: string | null;
  scriptsDetail?: Array<{
    briefIndex: number;
    brief?: string;
    speechShare?: number;
    speechShareSonnet?: number;
    wordsVsBudgetSonnetPct?: number;
    speakingBandMin?: number;
    speakingBandMax?: number;
    targetSeconds?: number;
    predictedSecondsBefore?: number;
    predictedSecondsAfter?: number;
    estimatedTotalAudioSeconds?: number;
    fitStep?: string | null;
    why?: string | null;
    outsideTolerance?: boolean;
    insideSpeakingBand?: boolean;
    speechSeconds?: number;
    effectiveWpm?: number;
    words?: number;
    wordsBudget?: number | null;
    wordBudget?: number | null;
    headerWords?: number | null;
    sentenceBudget?: number | null;
    headerSentenceTotal?: number | null;
    writtenSentenceTotal?: number | null;
    wordsPerSentence?: number | null;
    wordsPerSentenceActual?: number | null;
    phaseCount?: number;
    phases?: Array<{ headerMinutes?: number; headerWords?: number; words?: number }>;
    headerMinutes?: number;
    longPauseCount?: number;
    longPauseSecondsBefore?: number;
    longPauseSecondsAfter?: number;
    shortPauseSecondsBefore?: number;
    ordinaryPauseCount?: number;
    ordinaryPauseAverageSeconds?: number | null;
    ordinaryPauseLongestSeconds?: number;
    extendablePauseCount?: number;
    extendablePauseTotalSeconds?: number;
    namedMarkersUsed?: number;
    chars?: number | null;
    claudeUsd?: number | null;
    briefWords?: number | null;
    haikuRan?: boolean;
    wordsBeforeHaiku?: number;
    wordsAfterHaiku?: number;
    wordsVsBudgetPct?: number;
    phasesFixed?: number;
    phasesRejected?: number;
    haikuUsd?: number;
    fixCallsModel?: string | null;
    fixCallsInputTokensTotal?: number | null;
    fixCallsCount?: number | null;
    phaseResults?: Array<{
      phaseIndex: number;
      phaseName: string;
      attempted: boolean;
      accepted: boolean;
      rejectReason: string | null;
      wordsBefore: number;
      wordsAfter: number;
      wordTarget: number;
      haikuText?: string | null;
    }>;
    scriptTextAsWritten?: string;
    scriptTextAfterHaiku?: string;
    scriptText?: string;
    scriptWithHeadersBefore?: string;
    scriptWithHeadersAfter?: string;
  }>;
};

type SilenceAccuracySummary = {
  scripts: number;
  withinTolerance: number;
  insideSpeakingBand: number;
  avgMissAfterPct: number | null;
  largestMissAfterPct?: number | null;
  haikuRanCount?: number;
};

type SilenceModeBucket = {
  costs: ScriptGenCostRow[];
  accuracy: SilenceAccuracyRow[];
  summary: SilenceAccuracySummary | null;
  progress: string | null;
  running: boolean;
};

function emptySilenceBucket(): SilenceModeBucket {
  return {
    costs: [],
    accuracy: [],
    summary: null,
    progress: null,
    running: false,
  };
}

function isSilenceFamilyMode(mode: ScriptWriteMode): mode is SilenceFamilyMode {
  return (
    mode === "silence" ||
    mode === "silence_haiku" ||
    mode === "silence_words" ||
    mode === "silence_words_haiku"
  );
}

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadTextFile(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function pctVsTarget(
  value: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (
    typeof value !== "number" ||
    typeof target !== "number" ||
    !Number.isFinite(value) ||
    !Number.isFinite(target) ||
    target <= 0
  ) {
    return null;
  }
  return ((value - target) / target) * 100;
}

function fmtClockVsTarget(
  value: number | null | undefined,
  target: number | null | undefined,
): string {
  const clock = fmtClock(value);
  if (clock === "—") return "—";
  const pct = pctVsTarget(value, target);
  if (pct == null) return clock;
  return `${clock} · ${fmtPct(pct, true)}`;
}

/** Short Why phrases for the Accuracy table (maps older long strings too). */
function shortLengthWhy(why: string | null | undefined): string {
  if (!why?.trim()) return "";
  const raw = why.trim();
  const known = [
    "No long pauses to cut",
    "No long pauses to stretch",
    "Long pauses at minimum",
    "Long pauses at maximum",
    "Too many words",
    "Too few words",
  ];
  if (known.includes(raw)) return raw;
  const w = raw.toLowerCase();
  if (w.includes("too many words") || w.includes("speech alone")) {
    return "Too many words";
  }
  if (w.includes("not enough") && w.includes("stretch")) {
    return "No long pauses to stretch";
  }
  if (
    (w.includes("no extendable") || w.includes("ordinary silence")) &&
    (w.includes("shorten") || w.includes("cut"))
  ) {
    return "No long pauses to cut";
  }
  if (w.includes("maximum") || w.includes("above range max")) {
    return "Long pauses at maximum";
  }
  if (w.includes("minimum") || w.includes("below range min")) {
    return "Long pauses at minimum";
  }
  if (w.includes("stretch") || w.includes("too few")) {
    return "Too few words";
  }
  if (w.includes("shrink") || w.includes("cut")) {
    return "No long pauses to cut";
  }
  return raw.split(/\s+/).slice(0, 5).join(" ");
}

type TimeLengthAccuracyPhase = {
  name: string;
  headerMinutes: number;
  headerSentences: number;
  actualSentences: number;
  words: number;
  speechSeconds: number;
  pauseSeconds: number;
  totalSeconds: number;
  extendableSecondsBefore: number;
  extendableSecondsAfter: number;
};

type TimeLengthAccuracyScriptDetail = {
  briefIndex: number;
  brief?: string;
  targetSeconds?: number;
  predictedSecondsBefore?: number;
  predictedSecondsAfter?: number;
  speechSeconds?: number;
  silenceShareAfter?: number;
  words?: number;
  roughSpeechWords?: number;
  extendableCount?: number;
  extendableSecondsBefore?: number;
  extendableSecondsAfter?: number;
  ordinaryPauseCount?: number;
  ordinaryPauseAverageSeconds?: number | null;
  ordinaryPauseLongestSeconds?: number;
  namedMarkersUsed?: number;
  outsideTolerance?: boolean;
  why?: string | null;
  sentenceBudget?: number;
  headerSentenceTotal?: number;
  writtenSentenceTotal?: number;
  phases?: TimeLengthAccuracyPhase[];
};

type TimeLengthAccuracyRow = {
  delivery: "casual" | "guided" | "open_sits";
  minutes: number;
  scripts: number;
  targetSeconds: number | null;
  predictedSecondsBefore: number | null;
  predictedSecondsAfter: number | null;
  speechSeconds: number | null;
  silenceShareAfter: number | null;
  spaceRangeMin: number | null;
  spaceRangeMax: number | null;
  words: number | null;
  roughSpeechWords: number | null;
  extendableCount: number | null;
  extendableSecondsBefore: number | null;
  extendableSecondsAfter: number | null;
  outsideCount: number;
  outsidePct: number | null;
  lengthTolerancePct: number;
  why: string | null;
  scriptsDetail: TimeLengthAccuracyScriptDetail[];
};

const pctOf = (share: number) => Math.round(share * 100);
const shareOf = (pct: number) => Math.min(0.95, Math.max(0, pct / 100));

export function AdminDeliveryProfiles() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [profiles, setProfiles] = useState<DeliveryProfiles>(defaultDeliveryProfiles);
  const [scriptGeneration, setScriptGeneration] = useState<ScriptGenerationSettings>(
    defaultScriptGenerationSettings,
  );
  const [targetCorrection, setTargetCorrection] = useState<ScriptTargetCorrection>(
    defaultScriptTargetCorrection,
  );
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calibrating, setCalibrating] = useState(false);
  const [rejudgingFidelity, setRejudgingFidelity] = useState(false);
  const [checking, setChecking] = useState(false);
  const [factorsError, setFactorsError] = useState<string | null>(null);
  const [calibrateProgress, setCalibrateProgress] = useState<string | null>(null);
  const [calibrationSummary, setCalibrationSummary] = useState<
    Array<{
      delivery: string;
      minutes: number;
      scripts: number;
      wordsPct: number | null;
      pausesPct: number | null;
      wordFactor: number;
      pauseFactor: number;
      sampleCount: number;
    }>
  >([]);
  const [factorSpread, setFactorSpread] = useState<
    Array<{
      delivery: string;
      minutes: number;
      scripts: number;
      pooledWordFactor: number;
      pooledPauseFactor: number;
      wordMin: number | null;
      wordMedian: number | null;
      wordMax: number | null;
      pauseMin: number | null;
      pauseMedian: number | null;
      pauseMax: number | null;
    }>
  >([]);
  const [scriptFactors, setScriptFactors] = useState<
    Array<{
      delivery: string;
      minutes: number;
      briefIndex: number;
      brief: string;
      path: string;
      targetWords: number;
      writtenWords: number;
      wordFactor: number | null;
      pauseFactor: number | null;
    }>
  >([]);
  const [showScriptFactors, setShowScriptFactors] = useState(false);
  const [sectionBreakdown, setSectionBreakdown] = useState<
    Array<{
      delivery: string;
      minutes: number;
      briefIndex: number;
      brief: string;
      path: string;
      sectionCount: number;
      sections: Array<{
        name: string;
        topic: string;
        targetWords: number;
        writtenWords: number;
        plannedPauseSeconds: number;
        writtenPauseSeconds: number;
      }>;
    }>
  >([]);
  const [showSectionBreakdown, setShowSectionBreakdown] = useState(false);
  const [expandedSectionScripts, setExpandedSectionScripts] = useState<
    Set<string>
  >(() => new Set());
  const [diversions, setDiversions] = useState<
    Array<{
      delivery: string;
      minutes: number;
      briefIndex: number;
      brief: string;
      notes: string;
      divertedSections: string[];
    }>
  >([]);
  const [checkRows, setCheckRows] = useState<
    Array<{
      delivery: string;
      minutes: number;
      voice: string;
      path: string;
      sections: number;
      firstWordsPct: number;
      finalWordsPct: number;
      pausesPct: number;
      fixed: string[];
      pauseScalePct: number;
      finalLengthPct: number;
    }>
  >([]);
  const [lastBatchAt, setLastBatchAt] = useState<string | null>(null);
  const [resumeHint, setResumeHint] = useState<string | null>(null);
  const [singleCalibrating, setSingleCalibrating] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [singleProgress, setSingleProgress] = useState<string | null>(null);
  const [compareProgress, setCompareProgress] = useState<string | null>(null);
  const [singleError, setSingleError] = useState<string | null>(null);
  const [singleSummary, setSingleSummary] = useState<
    Array<{
      delivery: string;
      minutes: number;
      scripts: number;
      wordsPct: number | null;
      pausesPct: number | null;
      wordFactor: number;
      pauseFactor: number;
      sampleCount: number;
    }>
  >([]);
  const [singleFactorSpread, setSingleFactorSpread] = useState<
    typeof factorSpread
  >([]);
  const [singleScriptFactors, setSingleScriptFactors] = useState<
    typeof scriptFactors
  >([]);
  const [showSingleScriptFactors, setShowSingleScriptFactors] = useState(false);
  const [compareTable, setCompareTable] = useState<{
    rows: Array<{
      delivery: DeliveryId;
      minutes: number;
      singleWordsAvg: string;
      singleWordsRange: string;
      sectionedWordsAvg: string;
      sectionedWordsRange: string;
      singlePausesAvg: string;
      sectionedPausesAvg: string;
      singlePredictedTotal?: string;
      sectionedPredictedTotal?: string;
      singleWithin10: number;
      sectionedWithin10: number;
      of: number;
    }>;
    singleWithin10Share: number;
    sectionedWithin10Share: number;
    singleAvgAbsLength: number;
    sectionedAvgAbsLength: number;
  } | null>(null);
  const [comparePairs, setComparePairs] = useState<
    Array<{
      delivery: DeliveryId;
      minutes: number;
      briefIndex: number;
      brief: string;
      single: { scriptText: string; wordsPct: number; pausesPct: number; lengthPct: number };
      sectioned: { scriptText: string; wordsPct: number; pausesPct: number; lengthPct: number };
    }>
  >([]);
  const [openScript, setOpenScript] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewDeliveryId, setPreviewDeliveryId] =
    useState<DeliveryId>("guided");
  const [previewMinutes, setPreviewMinutes] = useState<5 | 10 | 20>(10);
  const [previewMode, setPreviewMode] = useState<ScriptWriteMode | "auto">("auto");
  const [previewBrief, setPreviewBrief] = useState("");
  const [previewResult, setPreviewResult] = useState<{
    scriptText: string;
    mode: ScriptWriteMode;
    targetWords: number;
    writtenWords: number;
    plannedPauseSeconds: number;
    writtenPauseSeconds: number;
    pauseScale: number;
    scriptTargetSeconds: number;
    outline?: string;
    scriptWithHeaders?: string;
    timePhases?: Array<{
      name: string;
      headerMinutes: number;
      headerSentences: number;
      actualSentences: number;
      words: number;
      speechSeconds: number;
      pauseSeconds: number;
    }>;
    around: {
      leadInSeconds: number;
      fadeOutSeconds: number;
      titleSpeechSeconds: number;
      titlePauseRendered: number;
      aroundTotalSeconds: number;
    };
    clocks: Record<string, string>;
    voices: Array<{
      name: string;
      effectiveWpm: number;
      scriptPartSeconds: number;
      predictedTotalSeconds: number;
      pctVsRequested: number;
      within10: boolean;
    }>;
    medianPctVsRequested: number;
  } | null>(null);
  const [timeSentenceAccuracy, setTimeSentenceAccuracy] = useState<
    Array<{
      delivery: "casual" | "guided" | "open_sits";
      minutes: number;
      scripts: number;
      phases: number;
      avgHeaderSentences: number | null;
      avgActualSentences: number | null;
      avgActualVsHeaderPct: number | null;
    }>
  >([]);
  const [timeLengthTolerance, setTimeLengthTolerance] = useState<
    Array<{
      delivery: "casual" | "guided" | "open_sits";
      minutes: number;
      scripts: number;
      outsideCount: number;
      outsidePct: number | null;
      tooShort: number;
      tooLong: number;
    }>
  >([]);
  const [timeLengthAccuracy, setTimeLengthAccuracy] = useState<
    TimeLengthAccuracyRow[]
  >([]);
  const [expandedLengthAccuracyKey, setExpandedLengthAccuracyKey] = useState<
    string | null
  >(null);
  const [previewAvgError, setPreviewAvgError] = useState<number | null>(null);
  const [lengthStats, setLengthStats] = useState<
    Partial<Record<"casual" | "guided" | "open_sits", AdminDeliveryLengthStats>>
  >({});
  const [sectionStats, setSectionStats] = useState<AdminSectionStatsRow[]>([]);
  const [scriptGenCosts, setScriptGenCosts] = useState<ScriptGenCostRow[]>([]);
  const [scriptGenCostsSingle, setScriptGenCostsSingle] = useState<
    ScriptGenCostRow[]
  >([]);
  const [scriptGenCostsTime, setScriptGenCostsTime] = useState<
    ScriptGenCostRow[]
  >([]);
  const [silenceModeData, setSilenceModeData] = useState<
    Record<SilenceFamilyMode, SilenceModeBucket>
  >({
    silence: emptySilenceBucket(),
    silence_haiku: emptySilenceBucket(),
    silence_words: emptySilenceBucket(),
    silence_words_haiku: emptySilenceBucket(),
  });
  const [timeCostRunning, setTimeCostRunning] = useState(false);
  const [timeCostProgress, setTimeCostProgress] = useState<string | null>(null);
  const [expandedSilenceAccuracyKey, setExpandedSilenceAccuracyKey] = useState<
    string | null
  >(null);
  const [expandedHaikuRejectKey, setExpandedHaikuRejectKey] = useState<
    string | null
  >(null);

  function patchSilenceMode(
    mode: SilenceFamilyMode,
    patch: Partial<SilenceModeBucket>,
  ) {
    setSilenceModeData((prev) => ({
      ...prev,
      [mode]: { ...prev[mode], ...patch },
    }));
  }
  const [expandedCostKey, setExpandedCostKey] = useState<string | null>(null);
  const [adminTab, setAdminTab] = useState<AdminScriptTab>(
    () => parseAdminScriptTab(searchParams.get("tab")) ?? "settings",
  );
  const [modeFilter, setModeFilter] = useState<ScriptWriteMode | null>(
    () => parseAdminScriptMode(searchParams.get("mode")),
  );
  const [compareModes, setCompareModes] = useState(false);
  const [briefsOpen, setBriefsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listAdminVoice();
        if (cancelled) return;
        if (data.deliveryProfiles) {
          setProfiles(coerceDeliveryProfiles(data.deliveryProfiles));
        }
        if (data.scriptGeneration) {
          let sg = coerceScriptGenerationSettings(data.scriptGeneration);
          const urlModel = searchParams.get("model")?.trim();
          if (urlModel) {
            sg = {
              ...sg,
              scriptModelId: urlModel,
              scriptModelOptions: sg.scriptModelOptions.includes(urlModel)
                ? sg.scriptModelOptions
                : [...sg.scriptModelOptions, urlModel],
            };
          }
          setScriptGeneration(sg);
          setTargetCorrection(
            coerceScriptTargetCorrection(
              sg.targetCorrectionByModel[sg.scriptModelId] ?? data.targetCorrection,
            ),
          );
        } else if (data.targetCorrection) {
          setTargetCorrection(coerceScriptTargetCorrection(data.targetCorrection));
        }
        setLengthStats(data.lengthStats ?? {});
        setSectionStats(data.sectionStats ?? []);
        try {
          const sg0 = data.scriptGeneration
            ? coerceScriptGenerationSettings(data.scriptGeneration)
            : defaultScriptGenerationSettings();
          const batchRes = await postAdminVoice<{
            batch: { ranAt?: string; diversions?: typeof diversions } | null;
            diversions?: typeof diversions;
            summary?: typeof calibrationSummary;
            factorSpread?: typeof factorSpread;
            scriptFactors?: typeof scriptFactors;
            sectionBreakdown?: typeof sectionBreakdown;
            scriptGenCosts?: ScriptGenCostRow[];
            scriptGenCostsSingle?: ScriptGenCostRow[];
            scriptGenCostsTime?: ScriptGenCostRow[];
            completedCount?: number;
            total?: number;
            canResume?: boolean;
            needsFinalize?: boolean;
            run?: {
              status?: string;
              completedCount?: number;
              total?: number;
              currentLabel?: string | null;
            } | null;
          }>({
            action: "get-script-calibration-batch",
            modelId: sg0.scriptModelId,
          });
          if (!cancelled) {
            setLastBatchAt(batchRes.batch?.ranAt ?? null);
            setDiversions(
              batchRes.diversions ?? batchRes.batch?.diversions ?? [],
            );
            setCalibrationSummary(batchRes.summary ?? []);
            setFactorSpread(batchRes.factorSpread ?? []);
            setScriptFactors(batchRes.scriptFactors ?? []);
            setSectionBreakdown(batchRes.sectionBreakdown ?? []);
            setScriptGenCosts(batchRes.scriptGenCosts ?? []);
            if (batchRes.scriptGenCostsSingle?.length) {
              setScriptGenCostsSingle(batchRes.scriptGenCostsSingle);
            }
            if (batchRes.scriptGenCostsTime?.length) {
              setScriptGenCostsTime(batchRes.scriptGenCostsTime);
            }
            const run = batchRes.run;
            if (
              run?.status === "running" ||
              run?.status === "finalizing" ||
              run?.status === "stopping"
            ) {
              setResumeHint(
                run.currentLabel ||
                  `Running on server · ${run.completedCount ?? 0} of ${run.total ?? 90}`,
              );
              setCalibrateProgress(run.currentLabel || "Calibrating on server…");
              // Poll only — do not start a new run (would invalidate the worker token).
              void attachRunningCalibration(sg0.scriptModelId);
            } else if (batchRes.needsFinalize) {
              setResumeHint(
                `All ${batchRes.total ?? 90} scripts saved — click Resume calibration to finalize factors`,
              );
            } else if (batchRes.canResume || run?.status === "paused" || run?.status === "failed") {
              setResumeHint(
                `Resume available: ${batchRes.completedCount ?? run?.completedCount ?? 0} of ${batchRes.total ?? run?.total ?? 90} scripts saved`,
              );
            }
            try {
              const singleRes = await postAdminVoice<{
                summary?: typeof singleSummary;
                factorSpread?: typeof singleFactorSpread;
                scriptFactors?: typeof singleScriptFactors;
                scriptGenCostsSingle?: ScriptGenCostRow[];
              }>({
                action: "get-single-call-calibration",
                modelId: sg0.scriptModelId,
              });
              if (!cancelled) {
                setSingleSummary(singleRes.summary ?? []);
                setSingleFactorSpread(singleRes.factorSpread ?? []);
                setSingleScriptFactors(singleRes.scriptFactors ?? []);
                if (singleRes.scriptGenCostsSingle?.length) {
                  setScriptGenCostsSingle(singleRes.scriptGenCostsSingle);
                }
              }
            } catch {
              /* optional */
            }
            try {
              const timeRes = await postAdminVoice<{
                scriptGenCostsTime?: ScriptGenCostRow[];
                sentenceAccuracy?: typeof timeSentenceAccuracy;
                lengthToleranceAccuracy?: typeof timeLengthTolerance;
                lengthAccuracy?: TimeLengthAccuracyRow[];
              }>({
                action: "get-time-based-calibration",
                modelId: sg0.scriptModelId,
              });
              if (!cancelled) {
                if (timeRes.scriptGenCostsTime?.length) {
                  setScriptGenCostsTime(timeRes.scriptGenCostsTime);
                }
                setTimeSentenceAccuracy(timeRes.sentenceAccuracy ?? []);
                setTimeLengthTolerance(timeRes.lengthToleranceAccuracy ?? []);
                setTimeLengthAccuracy(timeRes.lengthAccuracy ?? []);
              }
            } catch {
              /* optional */
            }
            try {
              type SilenceSnap = {
                scriptGenCostsSilence?: ScriptGenCostRow[];
                scriptGenCostsSilenceHaiku?: ScriptGenCostRow[];
                scriptGenCostsSilenceWords?: ScriptGenCostRow[];
                scriptGenCostsSilenceWordsHaiku?: ScriptGenCostRow[];
                lengthAccuracy?: SilenceAccuracyRow[];
                summary?: SilenceAccuracySummary | null;
                run?: {
                  status?: string;
                  completedCount?: number;
                  total?: number;
                  currentLabel?: string | null;
                } | null;
              };
              const settled = await Promise.allSettled([
                postAdminVoice<SilenceSnap>({
                  action: "get-silence-fit-calibration",
                  modelId: sg0.scriptModelId,
                }),
                postAdminVoice<SilenceSnap>({
                  action: "get-silence-haiku-calibration",
                  modelId: sg0.scriptModelId,
                }),
                postAdminVoice<SilenceSnap>({
                  action: "get-silence-words-calibration",
                  modelId: sg0.scriptModelId,
                }),
                postAdminVoice<SilenceSnap>({
                  action: "get-silence-words-haiku-calibration",
                  modelId: sg0.scriptModelId,
                }),
              ]);
              const fitSnap =
                settled[0].status === "fulfilled" ? settled[0].value : null;
              const haikuSnap =
                settled[1].status === "fulfilled" ? settled[1].value : null;
              const wordsSnap =
                settled[2].status === "fulfilled" ? settled[2].value : null;
              const wordsHaikuSnap =
                settled[3].status === "fulfilled" ? settled[3].value : null;
              if (!cancelled) {
                const progressFor = (
                  snap: SilenceSnap,
                  costs: ScriptGenCostRow[] | undefined,
                  emptyLabel: string,
                ) => {
                  const run = snap.run;
                  if (run?.status === "running") {
                    return (
                      run.currentLabel ||
                      `Running on server · ${run.completedCount ?? 0} of ${run.total ?? 0}`
                    );
                  }
                  const rows =
                    costs?.filter((r) => r.source === "measured").length ?? 0;
                  const scripts = snap.summary?.scripts ?? 0;
                  if (rows > 0 || scripts > 0) {
                    return `Last run · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`;
                  }
                  return emptyLabel;
                };
                const empty = emptySilenceBucket();
                setSilenceModeData({
                  silence: fitSnap
                    ? {
                        costs: fitSnap.scriptGenCostsSilence ?? [],
                        accuracy: fitSnap.lengthAccuracy ?? [],
                        summary: fitSnap.summary ?? null,
                        progress: progressFor(
                          fitSnap,
                          fitSnap.scriptGenCostsSilence,
                          "No stored silence-fit run yet",
                        ),
                        running: fitSnap.run?.status === "running",
                      }
                    : {
                        ...empty,
                        progress: "No stored silence-fit run yet",
                      },
                  silence_haiku: haikuSnap
                    ? {
                        costs: haikuSnap.scriptGenCostsSilenceHaiku ?? [],
                        accuracy: haikuSnap.lengthAccuracy ?? [],
                        summary: haikuSnap.summary ?? null,
                        progress: progressFor(
                          haikuSnap,
                          haikuSnap.scriptGenCostsSilenceHaiku,
                          "No stored silence-fit + Haiku run yet",
                        ),
                        running: haikuSnap.run?.status === "running",
                      }
                    : {
                        ...empty,
                        progress: "No stored silence-fit + Haiku run yet",
                      },
                  silence_words: wordsSnap
                    ? {
                        costs: wordsSnap.scriptGenCostsSilenceWords ?? [],
                        accuracy: wordsSnap.lengthAccuracy ?? [],
                        summary: wordsSnap.summary ?? null,
                        progress: progressFor(
                          wordsSnap,
                          wordsSnap.scriptGenCostsSilenceWords,
                          "No stored silence-fit · words run yet",
                        ),
                        running: wordsSnap.run?.status === "running",
                      }
                    : {
                        ...empty,
                        progress: "No stored silence-fit · words run yet",
                      },
                  silence_words_haiku: wordsHaikuSnap
                    ? {
                        costs:
                          wordsHaikuSnap.scriptGenCostsSilenceWordsHaiku ?? [],
                        accuracy: wordsHaikuSnap.lengthAccuracy ?? [],
                        summary: wordsHaikuSnap.summary ?? null,
                        progress: progressFor(
                          wordsHaikuSnap,
                          wordsHaikuSnap.scriptGenCostsSilenceWordsHaiku,
                          "No stored silence-fit · words + Haiku run yet",
                        ),
                        running: wordsHaikuSnap.run?.status === "running",
                      }
                    : {
                        ...empty,
                        progress:
                          "No stored silence-fit · words + Haiku run yet",
                      },
                });
              }
            } catch {
              /* optional */
            }
            try {
              const cmpRes = await postAdminVoice<{
                table?: typeof compareTable;
                pairs?: typeof comparePairs;
              }>({
                action: "get-script-mode-comparison",
                modelId: sg0.scriptModelId,
              });
              if (!cancelled) {
                setCompareTable(cmpRes.table ?? null);
                setComparePairs(cmpRes.pairs ?? []);
              }
            } catch {
              /* optional */
            }
          }
        } catch {
          /* optional */
        }
        const when = data.deliveryProfileMeta?.updatedAt;
        if (when) {
          setMeta(
            `Last saved ${new Date(when).toLocaleString()}${
              data.deliveryProfileMeta?.updatedBy
                ? ` · ${data.deliveryProfileMeta.updatedBy}`
                : ""
            }`,
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load profiles");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // URL model/tab/mode are read once on mount; later changes sync via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep tab / view mode / script model in the URL so refresh restores the same page.
  useEffect(() => {
    if (loading) return;
    const mode =
      modeFilter ??
      coerceScriptGenerationSettings(scriptGeneration).scriptWriteMode;
    const model = scriptGeneration.scriptModelId?.trim() || "";
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        let changed = false;
        if (adminTab === "settings") {
          if (next.has("tab")) {
            next.delete("tab");
            changed = true;
          }
        } else if (next.get("tab") !== adminTab) {
          next.set("tab", adminTab);
          changed = true;
        }
        if (next.get("mode") !== mode) {
          next.set("mode", mode);
          changed = true;
        }
        if (model) {
          if (next.get("model") !== model) {
            next.set("model", model);
            changed = true;
          }
        } else if (next.has("model")) {
          next.delete("model");
          changed = true;
        }
        return changed ? next : prev;
      },
      { replace: true },
    );
  }, [
    loading,
    adminTab,
    modeFilter,
    scriptGeneration.scriptModelId,
    scriptGeneration.scriptWriteMode,
    setSearchParams,
  ]);

  const preview = useMemo(
    () =>
      (["casual", "guided", "open_sits"] as const).map((delivery) =>
        previewDelivery(coerceDeliveryProfiles(profiles), delivery, 10),
      ),
    [profiles],
  );

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const nextSg = coerceScriptGenerationSettings({
        ...scriptGeneration,
        targetCorrectionByModel: {
          ...scriptGeneration.targetCorrectionByModel,
          [scriptGeneration.scriptModelId]: targetCorrection,
        },
      });
      const saved = await postAdminVoice<{
        deliveryProfiles: DeliveryProfiles;
        targetCorrection?: ScriptTargetCorrection;
        scriptGeneration?: ScriptGenerationSettings;
        deliveryProfileMeta?: { updatedAt: string | null; updatedBy: string | null };
      }>({
        action: "save-delivery-profiles",
        profiles: coerceDeliveryProfiles(profiles),
        targetCorrection,
        scriptGeneration: nextSg,
      });
      setProfiles(coerceDeliveryProfiles(saved.deliveryProfiles));
      if (saved.scriptGeneration) {
        const sg = coerceScriptGenerationSettings(saved.scriptGeneration);
        setScriptGeneration(sg);
        setTargetCorrection(
          coerceScriptTargetCorrection(
            sg.targetCorrectionByModel[sg.scriptModelId] ?? saved.targetCorrection,
          ),
        );
      } else if (saved.targetCorrection) {
        setTargetCorrection(coerceScriptTargetCorrection(saved.targetCorrection));
      }
      const when = saved.deliveryProfileMeta?.updatedAt;
      setMeta(
        when
          ? `Last saved ${new Date(when).toLocaleString()}${
              saved.deliveryProfileMeta?.updatedBy
                ? ` · ${saved.deliveryProfileMeta.updatedBy}`
                : ""
            }`
          : "Saved",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  /** @param restart When true, wipe saved cells and run from script 1. */
  type CalibrationRunRow = {
    status?: string;
    completedCount?: number;
    total?: number;
    currentLabel?: string | null;
    error?: string | null;
    finishedAt?: string | null;
  };

  async function pollScriptCalibration(modelId: string) {
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    for (;;) {
      await sleep(4000);
      const snap = await postAdminVoice<{
        run: CalibrationRunRow | null;
        completedCount?: number;
        total?: number;
        summary?: typeof calibrationSummary;
        factorSpread?: typeof factorSpread;
        scriptFactors?: typeof scriptFactors;
        sectionBreakdown?: typeof sectionBreakdown;
        scriptGenCosts?: ScriptGenCostRow[];
        scriptGenCostsSingle?: ScriptGenCostRow[];
        diversions?: typeof diversions;
        batch?: { ranAt?: string } | null;
      }>({
        action: "get-script-calibration-batch",
        modelId,
      });
      const run = snap.run;
      const completed = run?.completedCount ?? snap.completedCount ?? 0;
      const total = run?.total ?? snap.total ?? 90;
      const label =
        run?.currentLabel || `${completed} of ${total} scripts saved`;
      setCalibrateProgress(label);
      setResumeHint(
        run?.status === "running" || run?.status === "finalizing"
          ? `Running on server · ${completed} of ${total}`
          : run?.status === "paused" || run?.status === "failed"
            ? `Paused · ${completed} of ${total} — click Resume`
            : null,
      );
      if (
        run?.status === "done" ||
        (run?.status !== "running" &&
          run?.status !== "finalizing" &&
          run?.status !== "stopping" &&
          completed >= total &&
          total > 0 &&
          (snap.summary?.length ?? 0) > 0)
      ) {
        setCalibrationSummary(snap.summary ?? []);
        setFactorSpread(snap.factorSpread ?? []);
        setScriptFactors(snap.scriptFactors ?? []);
        setSectionBreakdown(snap.sectionBreakdown ?? []);
        if (snap.scriptGenCosts?.length) setScriptGenCosts(snap.scriptGenCosts);
        if (snap.scriptGenCostsSingle?.length) {
          setScriptGenCostsSingle(snap.scriptGenCostsSingle);
        }
        setDiversions(snap.diversions ?? []);
        setLastBatchAt(
          snap.batch?.ranAt ?? run?.finishedAt ?? new Date().toISOString(),
        );
        setResumeHint(null);
        setCalibrateProgress(run?.currentLabel || "Done · factors saved");
        try {
          const data = await listAdminVoice();
          if (data.scriptGeneration) {
            const sg = coerceScriptGenerationSettings(data.scriptGeneration);
            setScriptGeneration(sg);
            setTargetCorrection(
              coerceScriptTargetCorrection(
                sg.targetCorrectionByModel[sg.scriptModelId] ??
                  data.targetCorrection,
              ),
            );
          } else if (data.targetCorrection) {
            setTargetCorrection(
              coerceScriptTargetCorrection(data.targetCorrection),
            );
          }
        } catch {
          /* */
        }
        return;
      }
      if (run?.status === "paused" || run?.status === "failed") {
        if (run.error) setFactorsError(run.error);
        setCalibrateProgress(label);
        return;
      }
      if (!run && completed >= total && total > 0) {
        setCalibrationSummary(snap.summary ?? []);
        setFactorSpread(snap.factorSpread ?? []);
        setScriptFactors(snap.scriptFactors ?? []);
        setSectionBreakdown(snap.sectionBreakdown ?? []);
        setDiversions(snap.diversions ?? []);
        setLastBatchAt(snap.batch?.ranAt ?? null);
        setResumeHint(null);
        setCalibrateProgress("Done");
        return;
      }
    }
  }

  /** Server-side run: kick worker, then poll until done / paused / failed. */
  async function runScriptCalibration(restart: boolean) {
    setCalibrating(true);
    setFactorsError(null);
    if (restart) {
      setCalibrationSummary([]);
      setDiversions([]);
      setFactorSpread([]);
      setScriptFactors([]);
      setSectionBreakdown([]);
      setLastBatchAt(null);
      setResumeHint(null);
    }
    const modelId = scriptGeneration.scriptModelId;
    try {
      setCalibrateProgress(
        restart
          ? "Starting fresh server-side calibration…"
          : "Starting / resuming server-side calibration…",
      );
      const briefCount = coerceCalibrationBriefCount(
        scriptGeneration.calibrationBriefCount,
        scriptGeneration.calibrationBriefs.length,
      );
      const started = await postAdminVoice<{ run: CalibrationRunRow }>({
        action: "start-script-calibration-run",
        modelId,
        restart,
        briefCount,
      });
      setCalibrateProgress(
        started.run?.currentLabel ||
          `${started.run?.completedCount ?? 0} of ${started.run?.total ?? briefCount * 9}…`,
      );
      await pollScriptCalibration(modelId);
    } catch (e) {
      setFactorsError(e instanceof Error ? e.message : "Calibration failed");
      setCalibrateProgress(null);
    } finally {
      setCalibrating(false);
    }
  }

  async function attachRunningCalibration(modelId: string) {
    setCalibrating(true);
    setFactorsError(null);
    try {
      await pollScriptCalibration(modelId);
    } catch (e) {
      setFactorsError(e instanceof Error ? e.message : "Calibration poll failed");
    } finally {
      setCalibrating(false);
    }
  }

  async function stopScriptCalibration() {
    const modelId = scriptGeneration.scriptModelId;
    try {
      setCalibrateProgress("Stopping…");
      await postAdminVoice({
        action: "stop-script-calibration-run",
        modelId,
      });
    } catch (e) {
      setFactorsError(e instanceof Error ? e.message : "Stop failed");
    }
  }

  /** Silence-fit batch: n briefs × 3 options × 3 lengths; costs + accuracy average. */
  async function runSilenceFitBatch() {
    patchSilenceMode("silence", { running: true });
    setError(null);
    const modelId = scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      scriptGeneration.calibrationBriefCount,
      scriptGeneration.calibrationBriefs.length || CALIBRATION_BRIEF_COUNT,
    );
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    try {
      patchSilenceMode("silence", {
        progress: `Starting silence-fit (n=${briefCount} · ${briefCount * 9} cells)…`,
      });
      const started = await postAdminVoice<{
        run?: {
          total?: number;
          currentLabel?: string | null;
        };
      }>({
        action: "start-silence-fit-costs",
        modelId,
        calibrationBriefCount: briefCount,
        restart: true,
      });
      setScriptGeneration((sg) => ({
        ...sg,
        calibrationBriefCount: briefCount,
      }));
      patchSilenceMode("silence", {
        progress:
          started.run?.currentLabel ||
          `Running on server · 0 of ${started.run?.total ?? briefCount * 9}`,
      });
      for (;;) {
        await sleep(4000);
        const snap = await postAdminVoice<{
          run?: {
            status?: string;
            completedCount?: number;
            total?: number;
            currentLabel?: string | null;
            error?: string | null;
          } | null;
          scriptGenCostsSilence?: ScriptGenCostRow[];
          lengthAccuracy?: SilenceAccuracyRow[];
          summary?: SilenceAccuracySummary | null;
        }>({
          action: "get-silence-fit-calibration",
          modelId,
        });
        const costs = snap.scriptGenCostsSilence ?? [];
        const run = snap.run;
        if (
          run?.status === "done" ||
          run?.status === "failed" ||
          run?.status === "paused"
        ) {
          if (run.status === "failed") {
            setError(run.error || "Silence-fit cost run failed");
            patchSilenceMode("silence", {
              costs,
              accuracy: snap.lengthAccuracy ?? [],
              summary: snap.summary ?? null,
              progress: run.error || "Silence-fit cost run failed",
              running: false,
            });
          } else {
            const rows =
              costs.filter((r) => r.source === "measured").length ?? 0;
            const scripts = snap.summary?.scripts ?? run.completedCount ?? 0;
            patchSilenceMode("silence", {
              costs,
              accuracy: snap.lengthAccuracy ?? [],
              summary: snap.summary ?? null,
              progress:
                run.status === "paused"
                  ? run.currentLabel ||
                    `Paused · ${run.completedCount ?? 0} of ${run.total ?? 0}`
                  : `Last run · n=${briefCount} · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`,
              running: false,
            });
          }
          break;
        }
        patchSilenceMode("silence", {
          costs,
          accuracy: snap.lengthAccuracy ?? [],
          summary: snap.summary ?? null,
          progress:
            run?.status === "stopping"
              ? run.currentLabel || "Stopping…"
              : run?.currentLabel ||
                `${run?.completedCount ?? 0} of ${run?.total ?? 0}`,
          running: true,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Silence-fit cost run failed",
      );
      patchSilenceMode("silence", { progress: null, running: false });
    } finally {
      patchSilenceMode("silence", { running: false });
    }
  }

  async function refreshSilenceFitStored() {
    try {
      const snap = await postAdminVoice<{
        scriptGenCostsSilence?: ScriptGenCostRow[];
        lengthAccuracy?: SilenceAccuracyRow[];
        summary?: SilenceAccuracySummary | null;
      }>({
        action: "get-silence-fit-calibration",
        modelId: scriptGeneration.scriptModelId,
      });
      const costs = snap.scriptGenCostsSilence ?? [];
      const nBrief =
        costs.find((r) => r.source === "measured")?.scripts ?? null;
      const rows = costs.filter((r) => r.source === "measured").length ?? 0;
      const scripts = snap.summary?.scripts ?? 0;
      patchSilenceMode("silence", {
        costs,
        accuracy: snap.lengthAccuracy ?? [],
        summary: snap.summary ?? null,
        progress:
          rows > 0
            ? `Last run${nBrief != null ? ` · n=${nBrief}` : ""} · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`
            : "No stored silence-fit run yet",
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load silence-fit results",
      );
    }
  }

  async function runTimeBasedBatch() {
    setTimeCostRunning(true);
    setError(null);
    const modelId = scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      scriptGeneration.calibrationBriefCount,
      scriptGeneration.calibrationBriefs.length || CALIBRATION_BRIEF_COUNT,
    );
    const sleep = (ms: number) =>
      new Promise<void>((r) => window.setTimeout(r, ms));
    try {
      setTimeCostProgress(
        `Starting time-based cost run (n=${briefCount})…`,
      );
      const started = await postAdminVoice<{
        run?: {
          status?: string;
          completedCount?: number;
          total?: number;
          currentLabel?: string | null;
        };
      }>({
        action: "start-time-based-costs",
        modelId,
        calibrationBriefCount: briefCount,
        restart: true,
      });
      setScriptGeneration((sg) => ({
        ...sg,
        calibrationBriefCount: briefCount,
      }));
      setTimeCostProgress(
        started.run?.currentLabel ||
          `Running on server · 0 of ${started.run?.total ?? 9 * briefCount}`,
      );
      for (;;) {
        await sleep(4000);
        const snap = await postAdminVoice<{
          run?: {
            status?: string;
            completedCount?: number;
            total?: number;
            currentLabel?: string | null;
            error?: string | null;
          } | null;
          scriptGenCostsTime?: ScriptGenCostRow[];
          sentenceAccuracy?: typeof timeSentenceAccuracy;
          lengthToleranceAccuracy?: typeof timeLengthTolerance;
          lengthAccuracy?: TimeLengthAccuracyRow[];
        }>({
          action: "get-time-based-calibration",
          modelId,
        });
        if (snap.scriptGenCostsTime?.length) {
          setScriptGenCostsTime(snap.scriptGenCostsTime);
        }
        if (snap.sentenceAccuracy) {
          setTimeSentenceAccuracy(snap.sentenceAccuracy);
        }
        if (snap.lengthToleranceAccuracy) {
          setTimeLengthTolerance(snap.lengthToleranceAccuracy);
        }
        if (snap.lengthAccuracy) {
          setTimeLengthAccuracy(snap.lengthAccuracy);
        }
        const run = snap.run;
        setTimeCostProgress(
          run?.status === "stopping"
            ? run.currentLabel || "Stopping…"
            : run?.currentLabel ||
                `${run?.completedCount ?? 0} of ${run?.total ?? 0}`,
        );
        if (
          run?.status === "done" ||
          run?.status === "failed" ||
          run?.status === "paused"
        ) {
          if (run.status === "failed") {
            setError(run.error || "Time-based cost run failed");
          } else {
            setTimeCostProgress(
              run.status === "paused"
                ? run.currentLabel ||
                    `Paused · ${run.completedCount ?? 0} of ${run.total ?? 0}`
                : run.currentLabel ||
                    `Done · n=${briefCount} · ${run.completedCount ?? 0} cells`,
            );
          }
          break;
        }
      }
      const data = await postAdminVoice<{
        scriptGenCosts?: ScriptGenCostRow[];
        scriptGenCostsSingle?: ScriptGenCostRow[];
        scriptGenCostsTime?: ScriptGenCostRow[];
        scriptGenCostsSilence?: ScriptGenCostRow[];
      }>({
        action: "get-script-gen-costs",
        modelId,
      });
      setScriptGenCosts(data.scriptGenCosts ?? []);
      setScriptGenCostsSingle(data.scriptGenCostsSingle ?? []);
      if (data.scriptGenCostsTime?.length) {
        setScriptGenCostsTime(data.scriptGenCostsTime);
      }
      if (data.scriptGenCostsSilence?.length) {
        patchSilenceMode("silence", { costs: data.scriptGenCostsSilence });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Time-based cost run failed",
      );
      setTimeCostProgress(null);
    } finally {
      setTimeCostRunning(false);
    }
  }

  async function runSingleCallBatch() {
    setSingleCalibrating(true);
    setSingleError(null);
    setError(null);
    setSingleSummary([]);
    setSingleFactorSpread([]);
    setSingleScriptFactors([]);
    const deliveries = ["casual", "guided", "open_sits"] as const;
    const minutes = [5, 10, 20] as const;
    const modelId = scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      scriptGeneration.calibrationBriefCount,
      scriptGeneration.calibrationBriefs.length || CALIBRATION_BRIEF_COUNT,
    );
    const total = deliveries.length * minutes.length * briefCount;
    const cellKey = (d: string, m: number, b: number) => `${d}|${m}|${b}`;
    try {
      await postAdminVoice({
        action: "save-delivery-profiles",
        scriptGeneration: {
          ...scriptGeneration,
          calibrationBriefCount: briefCount,
        },
      });
      setScriptGeneration((sg) => ({
        ...sg,
        calibrationBriefCount: briefCount,
      }));
      await postAdminVoice({
        action: "clear-single-call-calibration",
        modelId,
      });
      const done = new Set<string>();
      let n = 0;
      for (const delivery of deliveries) {
        for (const m of minutes) {
          for (let briefIndex = 0; briefIndex < briefCount; briefIndex++) {
            n += 1;
            const key = cellKey(delivery, m, briefIndex);
            if (done.has(key)) continue;
            setSingleProgress(
              `Single-call ${n} of ${total} (n=${briefCount}) · ${DELIVERY_LABEL[delivery]} · ${m} min · brief ${briefIndex + 1}`,
            );
            await postAdminVoice({
              action: "calibrate-single-call-cell",
              modelId,
              delivery,
              minutes: m,
              briefIndex,
            });
            done.add(key);
          }
        }
      }
      setSingleProgress("Saving single-call factors…");
      const finalized = await postAdminVoice<{
        scriptGeneration?: ScriptGenerationSettings;
        summary: typeof singleSummary;
        factorSpread?: typeof singleFactorSpread;
        scriptFactors?: typeof singleScriptFactors;
        failures: Array<{ error: string }>;
      }>({
        action: "calibrate-single-call-finalize",
        modelId,
      });
      if (finalized.scriptGeneration) {
        setScriptGeneration(
          coerceScriptGenerationSettings(finalized.scriptGeneration),
        );
      }
      setSingleSummary(finalized.summary ?? []);
      setSingleFactorSpread(finalized.factorSpread ?? []);
      setSingleScriptFactors(finalized.scriptFactors ?? []);
      setSingleProgress(
        `Done · n=${briefCount} · ${(finalized.failures ?? []).length} failed`,
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Single-call calibration failed";
      setSingleError(msg);
      setError(msg);
      setSingleProgress(null);
    } finally {
      setSingleCalibrating(false);
    }
  }

  function selectedMode(): ScriptWriteMode {
    return modeFilter ?? scriptGeneration.scriptWriteMode;
  }

  async function runSilenceHaikuBatch() {
    patchSilenceMode("silence_haiku", { running: true });
    setError(null);
    const modelId = scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      scriptGeneration.calibrationBriefCount,
      scriptGeneration.calibrationBriefs.length || CALIBRATION_BRIEF_COUNT,
    );
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    try {
      patchSilenceMode("silence_haiku", {
        progress: `Starting silence-fit + Haiku (n=${briefCount} · ${briefCount * 9} cells)…`,
      });
      const started = await postAdminVoice<{
        run?: {
          total?: number;
          currentLabel?: string | null;
        };
      }>({
        action: "start-silence-haiku-costs",
        modelId,
        calibrationBriefCount: briefCount,
        restart: true,
      });
      setScriptGeneration((sg) => ({
        ...sg,
        calibrationBriefCount: briefCount,
      }));
      patchSilenceMode("silence_haiku", {
        progress:
          started.run?.currentLabel ||
          `Running on server · 0 of ${started.run?.total ?? briefCount * 9}`,
      });
      for (;;) {
        await sleep(4000);
        const snap = await postAdminVoice<{
          run?: {
            status?: string;
            completedCount?: number;
            total?: number;
            currentLabel?: string | null;
            error?: string | null;
          } | null;
          scriptGenCostsSilenceHaiku?: ScriptGenCostRow[];
          lengthAccuracy?: SilenceAccuracyRow[];
          summary?: SilenceAccuracySummary | null;
        }>({
          action: "get-silence-haiku-calibration",
          modelId,
        });
        const costs = snap.scriptGenCostsSilenceHaiku ?? [];
        const run = snap.run;
        if (
          run?.status === "done" ||
          run?.status === "failed" ||
          run?.status === "paused"
        ) {
          if (run.status === "failed") {
            setError(run.error || "Silence-fit + Haiku cost run failed");
            patchSilenceMode("silence_haiku", {
              costs,
              accuracy: snap.lengthAccuracy ?? [],
              summary: snap.summary ?? null,
              progress: run.error || "Silence-fit + Haiku cost run failed",
              running: false,
            });
          } else {
            const rows =
              costs.filter((r) => r.source === "measured").length ?? 0;
            const scripts = snap.summary?.scripts ?? run.completedCount ?? 0;
            patchSilenceMode("silence_haiku", {
              costs,
              accuracy: snap.lengthAccuracy ?? [],
              summary: snap.summary ?? null,
              progress:
                run.status === "paused"
                  ? run.currentLabel ||
                    `Paused · ${run.completedCount ?? 0} of ${run.total ?? 0}`
                  : `Last run · n=${briefCount} · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`,
              running: false,
            });
          }
          break;
        }
        patchSilenceMode("silence_haiku", {
          costs,
          accuracy: snap.lengthAccuracy ?? [],
          summary: snap.summary ?? null,
          progress:
            run?.status === "stopping"
              ? run.currentLabel || "Stopping…"
              : run?.currentLabel ||
                `${run?.completedCount ?? 0} of ${run?.total ?? 0}`,
          running: true,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Silence-fit + Haiku cost run failed",
      );
      patchSilenceMode("silence_haiku", { progress: null, running: false });
    } finally {
      patchSilenceMode("silence_haiku", { running: false });
    }
  }

  async function refreshSilenceHaikuStored() {
    try {
      const snap = await postAdminVoice<{
        scriptGenCostsSilenceHaiku?: ScriptGenCostRow[];
        lengthAccuracy?: SilenceAccuracyRow[];
        summary?: SilenceAccuracySummary | null;
      }>({
        action: "get-silence-haiku-calibration",
        modelId: scriptGeneration.scriptModelId,
      });
      const costs = snap.scriptGenCostsSilenceHaiku ?? [];
      const nBrief =
        costs.find((r) => r.source === "measured")?.scripts ?? null;
      const rows = costs.filter((r) => r.source === "measured").length ?? 0;
      const scripts = snap.summary?.scripts ?? 0;
      patchSilenceMode("silence_haiku", {
        costs,
        accuracy: snap.lengthAccuracy ?? [],
        summary: snap.summary ?? null,
        progress:
          rows > 0
            ? `Last run${nBrief != null ? ` · n=${nBrief}` : ""} · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`
            : "No stored silence-fit + Haiku run yet",
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load silence-fit + Haiku results",
      );
    }
  }

  async function runSilenceWordsBatch() {
    patchSilenceMode("silence_words", { running: true });
    setError(null);
    const modelId = scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      scriptGeneration.calibrationBriefCount,
      scriptGeneration.calibrationBriefs.length || CALIBRATION_BRIEF_COUNT,
    );
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    try {
      patchSilenceMode("silence_words", {
        progress: `Starting silence-fit · words (n=${briefCount} · ${briefCount * 9} cells)…`,
      });
      const started = await postAdminVoice<{
        run?: { total?: number; currentLabel?: string | null };
      }>({
        action: "start-silence-words-costs",
        modelId,
        calibrationBriefCount: briefCount,
        restart: true,
      });
      setScriptGeneration((sg) => ({
        ...sg,
        calibrationBriefCount: briefCount,
      }));
      patchSilenceMode("silence_words", {
        progress:
          started.run?.currentLabel ||
          `Running on server · 0 of ${started.run?.total ?? briefCount * 9}`,
      });
      for (;;) {
        await sleep(4000);
        const snap = await postAdminVoice<{
          run?: {
            status?: string;
            completedCount?: number;
            total?: number;
            currentLabel?: string | null;
            error?: string | null;
          } | null;
          scriptGenCostsSilenceWords?: ScriptGenCostRow[];
          lengthAccuracy?: SilenceAccuracyRow[];
          summary?: SilenceAccuracySummary | null;
        }>({
          action: "get-silence-words-calibration",
          modelId,
        });
        const costs = snap.scriptGenCostsSilenceWords ?? [];
        const run = snap.run;
        if (
          run?.status === "done" ||
          run?.status === "failed" ||
          run?.status === "paused"
        ) {
          if (run.status === "failed") {
            setError(run.error || "Silence-fit · words cost run failed");
            patchSilenceMode("silence_words", {
              costs,
              accuracy: snap.lengthAccuracy ?? [],
              summary: snap.summary ?? null,
              progress: run.error || "Silence-fit · words cost run failed",
              running: false,
            });
          } else {
            const rows =
              costs.filter((r) => r.source === "measured").length ?? 0;
            const scripts = snap.summary?.scripts ?? run.completedCount ?? 0;
            patchSilenceMode("silence_words", {
              costs,
              accuracy: snap.lengthAccuracy ?? [],
              summary: snap.summary ?? null,
              progress:
                run.status === "paused"
                  ? run.currentLabel ||
                    `Paused · ${run.completedCount ?? 0} of ${run.total ?? 0}`
                  : `Last run · n=${briefCount} · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`,
              running: false,
            });
          }
          break;
        }
        patchSilenceMode("silence_words", {
          costs,
          accuracy: snap.lengthAccuracy ?? [],
          summary: snap.summary ?? null,
          progress:
            run?.status === "stopping"
              ? run.currentLabel || "Stopping…"
              : run?.currentLabel ||
                `${run?.completedCount ?? 0} of ${run?.total ?? 0}`,
          running: true,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Silence-fit · words cost run failed",
      );
      patchSilenceMode("silence_words", { progress: null, running: false });
    } finally {
      patchSilenceMode("silence_words", { running: false });
    }
  }

  async function refreshSilenceWordsStored() {
    try {
      const snap = await postAdminVoice<{
        scriptGenCostsSilenceWords?: ScriptGenCostRow[];
        lengthAccuracy?: SilenceAccuracyRow[];
        summary?: SilenceAccuracySummary | null;
      }>({
        action: "get-silence-words-calibration",
        modelId: scriptGeneration.scriptModelId,
      });
      const costs = snap.scriptGenCostsSilenceWords ?? [];
      const rows = costs.filter((r) => r.source === "measured").length ?? 0;
      const scripts = snap.summary?.scripts ?? 0;
      patchSilenceMode("silence_words", {
        costs,
        accuracy: snap.lengthAccuracy ?? [],
        summary: snap.summary ?? null,
        progress:
          rows > 0
            ? `Last run · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`
            : "No stored silence-fit · words run yet",
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load silence-fit · words results",
      );
    }
  }

  async function runSilenceWordsHaikuBatch() {
    patchSilenceMode("silence_words_haiku", { running: true });
    setError(null);
    const modelId = scriptGeneration.scriptModelId;
    const briefCount = coerceCalibrationBriefCount(
      scriptGeneration.calibrationBriefCount,
      scriptGeneration.calibrationBriefs.length || CALIBRATION_BRIEF_COUNT,
    );
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    try {
      patchSilenceMode("silence_words_haiku", {
        progress: `Starting silence-fit · words + Haiku (n=${briefCount} · ${briefCount * 9} cells)…`,
      });
      const started = await postAdminVoice<{
        run?: { total?: number; currentLabel?: string | null };
      }>({
        action: "start-silence-words-haiku-costs",
        modelId,
        calibrationBriefCount: briefCount,
        restart: true,
      });
      setScriptGeneration((sg) => ({
        ...sg,
        calibrationBriefCount: briefCount,
      }));
      patchSilenceMode("silence_words_haiku", {
        progress:
          started.run?.currentLabel ||
          `Running on server · 0 of ${started.run?.total ?? briefCount * 9}`,
      });
      for (;;) {
        await sleep(4000);
        const snap = await postAdminVoice<{
          run?: {
            status?: string;
            completedCount?: number;
            total?: number;
            currentLabel?: string | null;
            error?: string | null;
          } | null;
          scriptGenCostsSilenceWordsHaiku?: ScriptGenCostRow[];
          lengthAccuracy?: SilenceAccuracyRow[];
          summary?: SilenceAccuracySummary | null;
        }>({
          action: "get-silence-words-haiku-calibration",
          modelId,
        });
        const costs = snap.scriptGenCostsSilenceWordsHaiku ?? [];
        const run = snap.run;
        if (
          run?.status === "done" ||
          run?.status === "failed" ||
          run?.status === "paused"
        ) {
          if (run.status === "failed") {
            setError(run.error || "Silence-fit · words + Haiku cost run failed");
            patchSilenceMode("silence_words_haiku", {
              costs,
              accuracy: snap.lengthAccuracy ?? [],
              summary: snap.summary ?? null,
              progress: run.error || "Silence-fit · words + Haiku cost run failed",
              running: false,
            });
          } else {
            const rows =
              costs.filter((r) => r.source === "measured").length ?? 0;
            const scripts = snap.summary?.scripts ?? run.completedCount ?? 0;
            patchSilenceMode("silence_words_haiku", {
              costs,
              accuracy: snap.lengthAccuracy ?? [],
              summary: snap.summary ?? null,
              progress:
                run.status === "paused"
                  ? run.currentLabel ||
                    `Paused · ${run.completedCount ?? 0} of ${run.total ?? 0}`
                  : `Last run · n=${briefCount} · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`,
              running: false,
            });
          }
          break;
        }
        patchSilenceMode("silence_words_haiku", {
          costs,
          accuracy: snap.lengthAccuracy ?? [],
          summary: snap.summary ?? null,
          progress:
            run?.status === "stopping"
              ? run.currentLabel || "Stopping…"
              : run?.currentLabel ||
                `${run?.completedCount ?? 0} of ${run?.total ?? 0}`,
          running: true,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Silence-fit · words + Haiku cost run failed",
      );
      patchSilenceMode("silence_words_haiku", { progress: null, running: false });
    } finally {
      patchSilenceMode("silence_words_haiku", { running: false });
    }
  }

  async function refreshSilenceWordsHaikuStored() {
    try {
      const snap = await postAdminVoice<{
        scriptGenCostsSilenceWordsHaiku?: ScriptGenCostRow[];
        lengthAccuracy?: SilenceAccuracyRow[];
        summary?: SilenceAccuracySummary | null;
      }>({
        action: "get-silence-words-haiku-calibration",
        modelId: scriptGeneration.scriptModelId,
      });
      const costs = snap.scriptGenCostsSilenceWordsHaiku ?? [];
      const rows = costs.filter((r) => r.source === "measured").length ?? 0;
      const scripts = snap.summary?.scripts ?? 0;
      patchSilenceMode("silence_words_haiku", {
        costs,
        accuracy: snap.lengthAccuracy ?? [],
        summary: snap.summary ?? null,
        progress:
          rows > 0
            ? `Last run · ${scripts} script${scripts === 1 ? "" : "s"} · ${rows} cost row${rows === 1 ? "" : "s"} (averaged)`
            : "No stored silence-fit · words + Haiku run yet",
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Failed to load silence-fit · words + Haiku results",
      );
    }
  }

  async function runSelectedModeBatch() {
    const mode = selectedMode();
    if (mode === "silence_words_haiku") return runSilenceWordsHaikuBatch();
    if (mode === "silence_words") return runSilenceWordsBatch();
    if (mode === "silence_haiku") return runSilenceHaikuBatch();
    if (mode === "silence") return runSilenceFitBatch();
    if (mode === "time") return runTimeBasedBatch();
    if (mode === "single") return runSingleCallBatch();
    return runScriptCalibration(true);
  }

  /** Ask the server worker to stop after the current cell (keeps completed cells). */
  async function stopSelectedModeBatch() {
    const mode = selectedMode();
    const modelId = scriptGeneration.scriptModelId;
    const stopAction =
      mode === "silence_words_haiku"
        ? "stop-silence-words-haiku-costs"
        : mode === "silence_words"
          ? "stop-silence-words-costs"
          : mode === "silence_haiku"
            ? "stop-silence-haiku-costs"
            : mode === "silence"
              ? "stop-silence-fit-costs"
              : mode === "time"
                ? "stop-time-based-costs"
                : mode === "sections"
                  ? "stop-script-calibration-run"
                  : null;
    if (!stopAction) {
      setError("Stop is not available for this mode yet.");
      return;
    }
    try {
      if (isSilenceFamilyMode(mode)) {
        patchSilenceMode(mode, { progress: "Stopping…" });
      } else if (mode === "time") {
        setTimeCostProgress("Stopping…");
      } else if (mode === "sections") {
        setCalibrateProgress("Stopping…");
      }
      await postAdminVoice({ action: stopAction, modelId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stop failed");
    }
  }

  function downloadSilenceAccuracyReport() {
    const rows = silenceLengthAccuracy.filter((r) => r.scripts > 0);
    if (!rows.length) {
      setError("No silence-fit accuracy to download — run a batch first.");
      return;
    }
    const missPct = (
      predicted: number | null | undefined,
      target: number | null | undefined,
    ) => {
      if (
        typeof predicted !== "number" ||
        typeof target !== "number" ||
        !(target > 0)
      ) {
        return null;
      }
      return ((predicted - target) / target) * 100;
    };
    const mean1 = (nums: Array<number | null | undefined>) => {
      const xs = nums.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n),
      );
      if (!xs.length) return "";
      return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
    };
    const detailCols = (s: NonNullable<(typeof rows)[0]["scriptsDetail"]>[number]) => {
      const wordsBudget =
        typeof s.wordsBudget === "number"
          ? s.wordsBudget
          : typeof s.sentenceBudget === "number" &&
              typeof s.wordsPerSentence === "number" &&
              s.sentenceBudget > 0 &&
              s.wordsPerSentence > 0
            ? Math.round(s.sentenceBudget * s.wordsPerSentence)
            : null;
      const wpsActual =
        typeof s.wordsPerSentenceActual === "number"
          ? s.wordsPerSentenceActual
          : typeof s.words === "number" &&
              typeof s.writtenSentenceTotal === "number" &&
              s.writtenSentenceTotal > 0
            ? Math.round((s.words / s.writtenSentenceTotal) * 10) / 10
            : null;
      const phaseCount =
        typeof s.phaseCount === "number"
          ? s.phaseCount
          : Array.isArray(s.phases)
            ? s.phases.length
            : null;
      const headerMinutes =
        typeof s.headerMinutes === "number"
          ? s.headerMinutes
          : Array.isArray(s.phases)
            ? Math.round(
                s.phases.reduce((a, p) => a + (p.headerMinutes || 0), 0) * 10,
              ) / 10
            : null;
      return {
        target_script_seconds: s.targetSeconds ?? null,
        speech_seconds: s.speechSeconds ?? null,
        effective_wpm: s.effectiveWpm ?? null,
        words: s.words ?? null,
        words_budget: wordsBudget,
        sentence_budget: s.sentenceBudget ?? null,
        header_sentences: s.headerSentenceTotal ?? null,
        sentences_written: s.writtenSentenceTotal ?? null,
        words_per_sentence_used: s.wordsPerSentence ?? null,
        words_per_sentence_actual: wpsActual,
        phases: phaseCount,
        header_minutes: headerMinutes,
        long_pauses: s.longPauseCount ?? null,
        long_pause_seconds_before: s.longPauseSecondsBefore ?? null,
        long_pause_seconds_after: s.longPauseSecondsAfter ?? null,
        short_pause_seconds: s.shortPauseSecondsBefore ?? null,
        chars: s.chars ?? null,
        claude_usd: s.claudeUsd ?? null,
        brief_words: s.briefWords ?? null,
        words_before_haiku: s.wordsBeforeHaiku ?? null,
        words_after_haiku: s.wordsAfterHaiku ?? null,
        haiku_ran: s.haikuRan === true ? 1 : s.haikuRan === false ? 0 : null,
        haiku_phases_fixed: s.phasesFixed ?? null,
        haiku_phases_rejected: s.phasesRejected ?? null,
        haiku_usd: s.haikuUsd ?? null,
        fix_calls_model: s.fixCallsModel ?? null,
        fix_calls_input_tokens_total: s.fixCallsInputTokensTotal ?? null,
        fix_calls_count: s.fixCallsCount ?? null,
        word_budget:
          (s as { wordBudget?: number | null }).wordBudget ??
          s.wordsBudget ??
          null,
        header_words:
          (s as { headerWords?: number | null }).headerWords ?? null,
      };
    };
    const detailKeys = [
      "target_script_seconds",
      "speech_seconds",
      "effective_wpm",
      "words",
      "words_budget",
      "sentence_budget",
      "header_sentences",
      "sentences_written",
      "words_per_sentence_used",
      "words_per_sentence_actual",
      "phases",
      "header_minutes",
      "long_pauses",
      "long_pause_seconds_before",
      "long_pause_seconds_after",
      "short_pause_seconds",
      "chars",
      "claude_usd",
      "brief_words",
      "words_before_haiku",
      "words_after_haiku",
      "haiku_ran",
      "haiku_phases_fixed",
      "haiku_phases_rejected",
      "haiku_usd",
      "fix_calls_model",
      "fix_calls_input_tokens_total",
      "fix_calls_count",
      "word_budget",
      "header_words",
    ] as const;
    const header = [
      "kind",
      "option",
      "label",
      "minutes",
      "brief",
      "n",
      "speech_pct_sonnet",
      "speech_pct",
      "words_vs_budget_sonnet_pct",
      "words_vs_budget_pct",
      "band_min_pct",
      "band_max_pct",
      "before_fit_pct",
      "after_fit_pct",
      "est_audio",
      "est_audio_seconds",
      "fit_step",
      "why",
      ...detailKeys,
    ];
    const out: string[] = [header.join(",")];
    let avgCount = 0;
    let briefCount = 0;
    for (const r of rows) {
      avgCount += 1;
      const bandMin = Math.round(r.speakingBandMin * 100);
      const bandMax = Math.round(r.speakingBandMax * 100);
      const speechPct =
        typeof r.speechShare === "number"
          ? Math.round(r.speechShare * 100)
          : "";
      const speechSonnetPct =
        typeof r.speechShareSonnet === "number"
          ? Math.round(r.speechShareSonnet * 100)
          : speechPct;
      const wordsSonnetPct =
        typeof r.wordsVsBudgetSonnetPct === "number"
          ? Math.round(r.wordsVsBudgetSonnetPct * 10) / 10
          : "";
      const wordsAfterPct =
        typeof r.wordsVsBudgetPct === "number"
          ? Math.round(r.wordsVsBudgetPct * 10) / 10
          : "";
      const details = (r.scriptsDetail ?? []).map(detailCols);
      const avgDetail = detailKeys.map((k) =>
        mean1(details.map((d) => d[k])),
      );
      out.push(
        [
          csvCell("average"),
          csvCell(r.option),
          csvCell(r.label),
          csvCell(r.minutes),
          csvCell(""),
          csvCell(r.scripts),
          csvCell(speechSonnetPct),
          csvCell(speechPct),
          csvCell(wordsSonnetPct),
          csvCell(wordsAfterPct),
          csvCell(bandMin),
          csvCell(bandMax),
          csvCell(
            typeof r.beforeFitPct === "number"
              ? Math.round(r.beforeFitPct)
              : "",
          ),
          csvCell(
            typeof r.afterFitPct === "number" ? Math.round(r.afterFitPct) : "",
          ),
          csvCell(fmtClock(r.estimatedTotalAudioSeconds)),
          csvCell(
            typeof r.estimatedTotalAudioSeconds === "number"
              ? Math.round(r.estimatedTotalAudioSeconds)
              : "",
          ),
          csvCell(silenceFitStepLabel(r.fitStep)),
          csvCell(r.why?.trim() || ""),
          ...avgDetail.map((v) => csvCell(v)),
        ].join(","),
      );
      for (const s of r.scriptsDetail ?? []) {
        briefCount += 1;
        const beforePct = missPct(s.predictedSecondsBefore, s.targetSeconds);
        const afterPct = missPct(s.predictedSecondsAfter, s.targetSeconds);
        const estAudio =
          typeof s.estimatedTotalAudioSeconds === "number"
            ? s.estimatedTotalAudioSeconds
            : typeof s.predictedSecondsAfter === "number"
              ? s.predictedSecondsAfter + 30
              : null;
        const childSpeech =
          typeof s.speechShare === "number"
            ? Math.round(s.speechShare * 100)
            : "";
        const childSpeechSonnet =
          typeof s.speechShareSonnet === "number"
            ? Math.round(s.speechShareSonnet * 100)
            : childSpeech;
        const childWordsSonnet =
          typeof s.wordsVsBudgetSonnetPct === "number"
            ? Math.round(s.wordsVsBudgetSonnetPct * 10) / 10
            : "";
        const childWordsAfter =
          typeof s.wordsVsBudgetPct === "number"
            ? Math.round(s.wordsVsBudgetPct * 10) / 10
            : "";
        const d = detailCols(s);
        out.push(
          [
            csvCell("brief"),
            csvCell(r.option),
            csvCell(r.label),
            csvCell(r.minutes),
            csvCell(s.briefIndex + 1),
            csvCell(1),
            csvCell(childSpeechSonnet),
            csvCell(childSpeech),
            csvCell(childWordsSonnet),
            csvCell(childWordsAfter),
            csvCell(bandMin),
            csvCell(bandMax),
            csvCell(
              typeof beforePct === "number" ? Math.round(beforePct) : "",
            ),
            csvCell(typeof afterPct === "number" ? Math.round(afterPct) : ""),
            csvCell(fmtClock(estAudio)),
            csvCell(
              typeof estAudio === "number" ? Math.round(estAudio) : "",
            ),
            csvCell(silenceFitStepLabel(s.fitStep)),
            csvCell(s.why?.trim() || ""),
            ...detailKeys.map((k) => csvCell(d[k] ?? "")),
          ].join(","),
        );
      }
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const nHint =
      rows.reduce((m, r) => Math.max(m, r.scripts), 0) || 0;
    downloadTextFile(
      out.join("\n") + "\n",
      `silence-fit-accuracy-n${nHint}-${stamp}.csv`,
      "text/csv;charset=utf-8",
    );
    const downloadMode = selectedMode();
    if (isSilenceFamilyMode(downloadMode)) {
      patchSilenceMode(downloadMode, {
        progress: `Downloaded accuracy report · ${avgCount} averages + ${briefCount} briefs`,
      });
    }
  }

  async function refreshSelectedModeStored() {
    const mode = selectedMode();
    if (mode === "silence_words_haiku") return refreshSilenceWordsHaikuStored();
    if (mode === "silence_words") return refreshSilenceWordsStored();
    if (mode === "silence_haiku") return refreshSilenceHaikuStored();
    if (mode === "silence") return refreshSilenceFitStored();
    const modelId = scriptGeneration.scriptModelId;
    try {
      if (mode === "time") {
        const snap = await postAdminVoice<{
          scriptGenCostsTime?: ScriptGenCostRow[];
          sentenceAccuracy?: typeof timeSentenceAccuracy;
          lengthToleranceAccuracy?: typeof timeLengthTolerance;
          lengthAccuracy?: TimeLengthAccuracyRow[];
        }>({
          action: "get-time-based-calibration",
          modelId,
        });
        if (snap.scriptGenCostsTime?.length) {
          setScriptGenCostsTime(snap.scriptGenCostsTime);
        }
        setTimeSentenceAccuracy(snap.sentenceAccuracy ?? []);
        setTimeLengthTolerance(snap.lengthToleranceAccuracy ?? []);
        setTimeLengthAccuracy(snap.lengthAccuracy ?? []);
        setTimeCostProgress(
          snap.scriptGenCostsTime?.length
            ? `Last time-based run · ${snap.scriptGenCostsTime.length} cost rows`
            : "No stored time-based run yet",
        );
        return;
      }
      if (mode === "single") {
        const snap = await postAdminVoice<{
          summary?: typeof singleSummary;
          factorSpread?: typeof singleFactorSpread;
          scriptFactors?: typeof singleScriptFactors;
          scriptGenCostsSingle?: ScriptGenCostRow[];
        }>({
          action: "get-single-call-calibration",
          modelId,
        });
        setSingleSummary(snap.summary ?? []);
        setSingleFactorSpread(snap.factorSpread ?? []);
        setSingleScriptFactors(snap.scriptFactors ?? []);
        if (snap.scriptGenCostsSingle?.length) {
          setScriptGenCostsSingle(snap.scriptGenCostsSingle);
        }
        setSingleProgress(
          snap.summary?.length
            ? `Last single-call run · ${snap.summary.length} rows`
            : "No stored single-call run yet",
        );
        return;
      }
      const snap = await postAdminVoice<{
        diversions?: typeof diversions;
        summary?: typeof calibrationSummary;
        factorSpread?: typeof factorSpread;
        scriptFactors?: typeof scriptFactors;
        sectionBreakdown?: typeof sectionBreakdown;
        scriptGenCosts?: ScriptGenCostRow[];
        batch?: { ranAt?: string } | null;
      }>({
        action: "get-script-calibration-batch",
        modelId,
      });
      setDiversions(snap.diversions ?? []);
      setCalibrationSummary(snap.summary ?? []);
      setFactorSpread(snap.factorSpread ?? []);
      setScriptFactors(snap.scriptFactors ?? []);
      setSectionBreakdown(snap.sectionBreakdown ?? []);
      setScriptGenCosts(snap.scriptGenCosts ?? []);
      setLastBatchAt(snap.batch?.ranAt ?? null);
      setCalibrateProgress(
        snap.summary?.length
          ? `Last sectioned run · ${snap.summary.length} rows`
          : "No stored sectioned run yet",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load stored results",
      );
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2" aria-busy="true">
        {/* Loading delivery profiles… */}
        <span className="mm-placeholder block h-48 rounded-2xl" aria-hidden />
        <span className="mm-placeholder block h-48 rounded-2xl" aria-hidden />
      </div>
    );
  }

  // HMR / older API payloads can omit new fields — render from coerced shapes.
  const safeProfiles = coerceDeliveryProfiles(profiles);
  const safeScriptGeneration = coerceScriptGenerationSettings(scriptGeneration);

  // const share = (id: "casual" | "guided" | "open_sits") =>
  //   `${Math.round(speechShareFor(profiles, id) * 100)}% speech`;
  const share = (id: "casual" | "guided" | "open_sits") =>
    `${pctOf(silenceShareFor(safeProfiles, id))}% silence`;

  const activeModeFilter: ScriptWriteMode =
    modeFilter ?? safeScriptGeneration.scriptWriteMode;
  const isSilenceFamily = isSilenceFamilyMode(activeModeFilter);
  const isSilenceHaiku = activeModeFilter === "silence_haiku";
  const isSilenceWords = activeModeFilter === "silence_words";
  const isSilenceWordsHaiku = activeModeFilter === "silence_words_haiku";
  // Haiku columns / words budgets are shared across the haiku + words families.
  const showsHaikuCols = isSilenceHaiku || isSilenceWordsHaiku;
  const usesWordsBudget = isSilenceWords || isSilenceWordsHaiku;
  const silenceBagFor = (
    sg: ReturnType<typeof coerceScriptGenerationSettings>,
  ) =>
    isSilenceWordsHaiku
      ? sg.silenceWordsHaiku
      : isSilenceHaiku
        ? sg.silenceHaiku
        : isSilenceWords
          ? sg.silenceWords
          : sg.silenceFit;
  const haikuBagFor = (
    sg: ReturnType<typeof coerceScriptGenerationSettings>,
  ) => (isSilenceWordsHaiku ? sg.silenceWordsHaiku : sg.silenceHaiku);
  const silenceActive = isSilenceFamily
    ? silenceModeData[activeModeFilter]
    : emptySilenceBucket();
  const scriptGenCostsSilence = silenceActive.costs;
  const silenceLengthAccuracy = silenceActive.accuracy;
  const silenceAccuracySummary = silenceActive.summary;
  const silenceCostProgress = silenceActive.progress;
  const anySilenceFamilyRunning =
    silenceModeData.silence.running ||
    silenceModeData.silence_haiku.running ||
    silenceModeData.silence_words.running ||
    silenceModeData.silence_words_haiku.running;
  const selectedModeRunning =
    (isSilenceFamily && silenceActive.running) ||
    (activeModeFilter === "time" && timeCostRunning) ||
    (activeModeFilter === "sections" && calibrating) ||
    (activeModeFilter === "single" && singleCalibrating);
  const selectedModeCanStop =
    selectedModeRunning && activeModeFilter !== "single";
  const tabDesc: Record<AdminScriptTab, string> = {
    settings:
      "Production mode, models, pacing (silence share + range of space), and length tolerance.",
    calibrate:
      "Run calibration or check for the selected mode. Time-based has no factors — Run check only.",
    costs:
      "Claude + TTS cost per pacing × length for the selected mode. Compare modes for a side-by-side.",
    accuracy:
      "Length vs requested and words vs target from the latest calibration / check for the selected mode.",
    preview:
      "Generate a script (no audio) and see predicted length per voice; time-based shows phase headers.",
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Script generation</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Production write mode, pacing, calibration, costs, and length checks. Changes apply to
            new meditations only.
          </p>
          {meta ? <p className="mt-1 text-xs text-muted">{meta}</p> : null}
        </div>
        {adminTab === "settings" ? (
          <button
            type="button"
            disabled={saving}
            className="rounded-full bg-foreground px-3 py-1.5 text-sm text-background disabled:opacity-40"
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-foreground">{error}</p> : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-muted/30 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Mode</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Calls</th>
              <th className="px-3 py-2 font-medium">Added</th>
            </tr>
          </thead>
          <tbody>
            {SCRIPT_GENERATION_MODES.map((m) => (
              <tr
                key={m.id}
                className={
                  activeModeFilter === m.id
                    ? "bg-foreground/[0.04] text-foreground"
                    : "text-foreground/90"
                }
              >
                <td className="px-3 py-1.5 font-medium">{m.name}</td>
                <td className="px-3 py-1.5 text-muted">{m.description}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{m.calls}</td>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted">
                  {m.added}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-border pb-2">
        {(
          [
            ["settings", "Settings"],
            ["calibrate", "Calibrate"],
            ["costs", "Costs"],
            ["accuracy", "Accuracy"],
            ["preview", "Preview"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={
              adminTab === id
                ? "shrink-0 rounded-full bg-foreground px-3 py-1 text-sm text-background"
                : "shrink-0 rounded-full border border-border px-3 py-1 text-sm text-muted hover:text-foreground"
            }
            onClick={() => setAdminTab(id)}
          >
            {label}
          </button>
        ))}
        <select
          value={activeModeFilter}
          onChange={(e) =>
            setModeFilter(e.target.value as ScriptWriteMode)
          }
          title={`View/run mode · production is ${scriptWriteModeLabel(safeScriptGeneration.scriptWriteMode)}`}
          className="shrink-0 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
        >
          <option value="sections">Sectioned</option>
          <option value="single">Single call</option>
          <option value="time">Time-based</option>
          <option value="silence">Silence-fit</option>
          <option value="silence_haiku">Silence-fit + Haiku</option>
          <option value="silence_words">Silence-fit · words</option>
          <option value="silence_words_haiku">Silence-fit · words + Haiku</option>
        </select>
        <label className="flex shrink-0 items-center gap-1 text-xs text-muted">
          n
          <select
            value={coerceCalibrationBriefCount(
              scriptGeneration.calibrationBriefCount,
              scriptGeneration.calibrationBriefs.length ||
                CALIBRATION_BRIEF_COUNT,
            )}
            onChange={(e) => {
              const n = coerceCalibrationBriefCount(
                e.target.value,
                scriptGeneration.calibrationBriefs.length ||
                  CALIBRATION_BRIEF_COUNT,
              );
              setScriptGeneration((sg) => ({
                ...sg,
                calibrationBriefCount: n,
              }));
            }}
            title="Briefs per run (1…10)"
            className="rounded-lg border border-border bg-background px-1.5 py-1 text-sm text-foreground"
          >
            {Array.from(
              {
                length:
                  scriptGeneration.calibrationBriefs.length ||
                  CALIBRATION_BRIEF_COUNT,
              },
              (_, i) => i + 1,
            ).map((n) => (
              <option key={n} value={n}>
                {n} ({n * 9})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={
            anySilenceFamilyRunning ||
            timeCostRunning ||
            singleCalibrating ||
            comparing ||
            calibrating
          }
          className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
          onClick={() => {
            void refreshSelectedModeStored();
          }}
        >
          Refresh
        </button>
        <button
          type="button"
          disabled={
            anySilenceFamilyRunning ||
            timeCostRunning ||
            singleCalibrating ||
            comparing ||
            calibrating
          }
          className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-foreground disabled:opacity-50"
          onClick={() => {
            void runSelectedModeBatch();
          }}
        >
          {anySilenceFamilyRunning ||
          timeCostRunning ||
          singleCalibrating ||
          calibrating
            ? "Running…"
            : `Run ${
                activeModeFilter === "sections"
                  ? "sectioned"
                  : activeModeFilter === "single"
                    ? "single-call"
                    : activeModeFilter === "time"
                      ? "time-based"
                      : "silence-fit"
              } (n=${coerceCalibrationBriefCount(
                scriptGeneration.calibrationBriefCount,
                scriptGeneration.calibrationBriefs.length ||
                  CALIBRATION_BRIEF_COUNT,
              )})`}
        </button>
        <button
          type="button"
          disabled={!selectedModeCanStop}
          title="Stop after the current cell — completed cells stay saved"
          className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-foreground disabled:opacity-50"
          onClick={() => {
            void stopSelectedModeBatch();
          }}
        >
          Stop
        </button>
      </div>
      <p className="text-xs text-muted">{tabDesc[adminTab]}</p>
      {silenceCostProgress ||
      timeCostProgress ||
      singleProgress ||
      calibrateProgress ? (
        <p className="text-xs text-muted">
          {isSilenceFamily
            ? silenceCostProgress
            : activeModeFilter === "time"
              ? timeCostProgress
              : activeModeFilter === "single"
                ? singleProgress
                : calibrateProgress}
        </p>
      ) : null}

      {adminTab === "settings" ? (
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Casual · {share("casual")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div id="delivery-silence-casual">
              <Field
                label="Silence share (%) · sectioned / legacy"
                value={pctOf(safeProfiles.casual.silenceShare)}
                onChange={(n) =>
                  setProfiles((p) => ({
                    ...p,
                    casual: {
                      ...coerceDeliveryProfiles(p).casual,
                      silenceShare: shareOf(n),
                    },
                  }))
                }
              />
            </div>
            {/* Own-silence: first/last section silence settings removed. */}
            {/* Named-band / longest-pause cap retired — Claude chooses `<N>` seconds.
            <Field
              label="Longest pause (s)"
              value={safeProfiles.casual.longestPause}
              onChange={(n) =>
                setProfiles((p) => ({
                  ...p,
                  casual: { ...coerceDeliveryProfiles(p).casual, longestPause: n },
                }))
              }
            />
            */}
            <Field
              label="Range of space min (%) · time"
              value={pctOf(safeProfiles.casual.spaceRangeMin)}
              onChange={(n) =>
                setProfiles((p) => ({
                  ...p,
                  casual: {
                    ...coerceDeliveryProfiles(p).casual,
                    spaceRangeMin: shareOf(n),
                  },
                }))
              }
            />
            <Field
              label="Range of space max (%) · time"
              value={pctOf(safeProfiles.casual.spaceRangeMax)}
              onChange={(n) =>
                setProfiles((p) => ({
                  ...p,
                  casual: {
                    ...coerceDeliveryProfiles(p).casual,
                    spaceRangeMax: shareOf(n),
                  },
                }))
              }
            />
          </div>
          {activeModeFilter === "time" ? (
            <p className="mt-3 text-xs text-muted">
              Words / sentence (measured):{" "}
              <span className="tabular-nums text-foreground">
                {safeScriptGeneration.timeWordsPerSentenceByDelivery.casual
                  .wordsPerSentence}
              </span>
              {" · "}
              {safeScriptGeneration.timeWordsPerSentenceByDelivery.casual
                .scriptCount > 0
                ? `${safeScriptGeneration.timeWordsPerSentenceByDelivery.casual.scriptCount} script${
                    safeScriptGeneration.timeWordsPerSentenceByDelivery.casual
                      .scriptCount === 1
                      ? ""
                      : "s"
                  }`
                : "no data yet (using 12)"}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Guided · {share("guided")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div id="delivery-silence-guided">
              <Field
                label="Silence share (%) · sectioned / legacy"
                value={pctOf(safeProfiles.guided.silenceShare)}
                onChange={(n) =>
                  setProfiles((p) => ({
                    ...p,
                    guided: {
                      ...coerceDeliveryProfiles(p).guided,
                      silenceShare: shareOf(n),
                    },
                  }))
                }
              />
            </div>
            <Field
              label="Range of space min (%) · time"
              value={pctOf(safeProfiles.guided.spaceRangeMin)}
              onChange={(n) =>
                setProfiles((p) => ({
                  ...p,
                  guided: {
                    ...coerceDeliveryProfiles(p).guided,
                    spaceRangeMin: shareOf(n),
                  },
                }))
              }
            />
            <Field
              label="Range of space max (%) · time"
              value={pctOf(safeProfiles.guided.spaceRangeMax)}
              onChange={(n) =>
                setProfiles((p) => ({
                  ...p,
                  guided: {
                    ...coerceDeliveryProfiles(p).guided,
                    spaceRangeMax: shareOf(n),
                  },
                }))
              }
            />
            {/* Own-silence: first/last section silence settings removed. */}
          </div>
          {activeModeFilter === "time" ? (
            <p className="mt-3 text-xs text-muted">
              Words / sentence (measured):{" "}
              <span className="tabular-nums text-foreground">
                {safeScriptGeneration.timeWordsPerSentenceByDelivery.guided
                  .wordsPerSentence}
              </span>
              {" · "}
              {safeScriptGeneration.timeWordsPerSentenceByDelivery.guided
                .scriptCount > 0
                ? `${safeScriptGeneration.timeWordsPerSentenceByDelivery.guided.scriptCount} script${
                    safeScriptGeneration.timeWordsPerSentenceByDelivery.guided
                      .scriptCount === 1
                      ? ""
                      : "s"
                  }`
                : "no data yet (using 12)"}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Open sits · {share("open_sits")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div id="delivery-silence-open_sits">
              <Field
                label="Silence share (%) · sectioned / legacy"
                value={pctOf(safeProfiles.openSits.silenceShare)}
                onChange={(n) =>
                  setProfiles((p) => ({
                    ...p,
                    openSits: {
                      ...coerceDeliveryProfiles(p).openSits,
                      silenceShare: shareOf(n),
                    },
                  }))
                }
              />
            </div>
            <Field
              label="Range of space min (%) · time"
              value={pctOf(safeProfiles.openSits.spaceRangeMin)}
              onChange={(n) =>
                setProfiles((p) => ({
                  ...p,
                  openSits: {
                    ...coerceDeliveryProfiles(p).openSits,
                    spaceRangeMin: shareOf(n),
                  },
                }))
              }
            />
            <Field
              label="Range of space max (%) · time"
              value={pctOf(safeProfiles.openSits.spaceRangeMax)}
              onChange={(n) =>
                setProfiles((p) => ({
                  ...p,
                  openSits: {
                    ...coerceDeliveryProfiles(p).openSits,
                    spaceRangeMax: shareOf(n),
                  },
                }))
              }
            />
            {/* Own-silence: first/last section silence settings removed. */}
          </div>
          {activeModeFilter === "time" ? (
            <p className="mt-3 text-xs text-muted">
              Words / sentence (measured):{" "}
              <span className="tabular-nums text-foreground">
                {
                  safeScriptGeneration.timeWordsPerSentenceByDelivery.open_sits
                    .wordsPerSentence
                }
              </span>
              {" · "}
              {safeScriptGeneration.timeWordsPerSentenceByDelivery.open_sits
                .scriptCount > 0
                ? `${safeScriptGeneration.timeWordsPerSentenceByDelivery.open_sits.scriptCount} script${
                    safeScriptGeneration.timeWordsPerSentenceByDelivery
                      .open_sits.scriptCount === 1
                      ? ""
                      : "s"
                  }`
                : "no data yet (using 12)"}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Shared</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="Length tolerance (±%)"
              value={safeProfiles.shared.lengthTolerancePct}
              onChange={(n) =>
                setProfiles((p) => ({
                  ...p,
                  shared: {
                    ...coerceDeliveryProfiles(p).shared,
                    lengthTolerancePct: n,
                  },
                }))
              }
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            Silence share = sectioned / legacy point target. Range of space = time-based silence
            band. Length tolerance is the ±% check before and after audio.
          </p>
        </section>

        {isSilenceFamily ? (
          <section className="rounded-2xl border border-border p-4 lg:col-span-2">
            <h2 className="font-semibold text-foreground">
              {isSilenceWordsHaiku
                ? "Silence-fit · words + Haiku settings"
                : isSilenceHaiku
                ? "Silence-fit + Haiku settings"
                : isSilenceWords
                  ? "Silence-fit · words settings"
                  : "Silence-fit settings"}
            </h2>
            <p className="mt-1 text-xs text-muted">
              Speaking share comes from Delivery profiles silence share
              (speaking = 1 − silence), same at every length. Accuracy band =
              speaking share ±10 pts. Longest silence stays editable per option
              × length. Create-flow Casual → Casual; Guided → Guided; Open sits
              → Open sits.
              {isSilenceWordsHaiku
                ? " Own copy of Silence-fit · words settings plus Haiku word-fix triggers; budgets use words."
                : isSilenceHaiku
                ? " Own copy of Silence-fit settings plus Haiku word-fix triggers."
                : isSilenceWords
                  ? " Own copy of Silence-fit settings; budgets use words (no words/sentence)."
                  : ""}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Option</th>
                    <th className="py-2 pr-3 font-medium">Speaking share</th>
                    <th className="py-2 pr-3 font-medium">Accuracy band</th>
                    <th className="py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["guided_casual", "Casual", "casual"],
                      ["guided", "Guided", "guided"],
                      ["open_sits", "Open sits", "open_sits"],
                    ] as const
                  ).map(([opt, label, delivery]) => {
                    const share = speechShareFor(safeProfiles, delivery);
                    const bandMin = Math.round(
                      Math.max(0.05, share - 0.1) * 100,
                    );
                    const bandMax = Math.round(
                      Math.min(0.95, share + 0.1) * 100,
                    );
                    void opt;
                    return (
                      <tr
                        key={`speak-share-${delivery}`}
                        className="border-b border-border last:border-0"
                      >
                        <td className="py-2 pr-3 whitespace-nowrap">{label}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {Math.round(share * 100)}%
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-muted">
                          {bandMin}–{bandMax}%
                        </td>
                        <td className="py-2 text-xs text-muted">
                          Delivery profiles silence share (
                          <button
                            type="button"
                            className="underline hover:text-foreground"
                            onClick={() => {
                              const el = document.getElementById(
                                `delivery-silence-${delivery}`,
                              );
                              el?.scrollIntoView({
                                behavior: "smooth",
                                block: "center",
                              });
                            }}
                          >
                            edit above
                          </button>
                          )
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Was: editable Speech min/max % columns + Budget aims at middle of band. */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Option</th>
                    <th className="py-2 pr-3 font-medium">Length</th>
                    <th className="py-2 font-medium">Longest silence (s)</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ["guided_casual", "Casual"],
                      ["guided", "Guided"],
                      ["open_sits", "Open sits"],
                    ] as const
                  ).flatMap(([opt, label]) =>
                    (["5", "10", "20"] as const).map((len) => {
                      const silenceBag = silenceBagFor(safeScriptGeneration);
                      const cell = silenceBag.byOptionLength[opt][len];
                      const silenceBagOf = silenceBagFor;
                      return (
                        <tr
                          key={`${opt}-${len}`}
                          className="border-b border-border last:border-0"
                        >
                          <td className="py-2 pr-3 whitespace-nowrap">{label}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{len} min</td>
                          <td className="py-2">
                            <input
                              type="number"
                              className="w-24 rounded-lg border border-border bg-background px-2 py-1 tabular-nums"
                              value={cell.longestSingleSilenceSeconds}
                              onChange={(e) => {
                                const v = num(
                                  e.target.value,
                                  cell.longestSingleSilenceSeconds,
                                );
                                setScriptGeneration((sg) => {
                                  const next = coerceScriptGenerationSettings(sg);
                                  const bag = silenceBagOf(next);
                                  bag.byOptionLength[opt][len] = {
                                    ...bag.byOptionLength[opt][len],
                                    longestSingleSilenceSeconds: v,
                                  };
                                  return next;
                                });
                              }}
                            />
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["guided_casual", "Casual shortest long (s)"],
                  ["guided", "Guided shortest long (s)"],
                  ["open_sits", "Open sits shortest long (s)"],
                ] as const
              ).map(([opt, label]) => (
                <Field
                  key={opt}
                  label={label}
                  value={
                    silenceBagFor(safeScriptGeneration).shortestLongPauseByOption[opt]
                  }
                  onChange={(n) =>
                    setScriptGeneration((sg) => {
                      const next = coerceScriptGenerationSettings(sg);
                      const bag = silenceBagFor(next);
                      bag.shortestLongPauseByOption[opt] = n;
                      if (opt !== "guided_casual") {
                        bag.shortestLongPauseSeconds = n;
                      }
                      return next;
                    })
                  }
                />
              ))}
              <Field
                label="Short-pause adjust limit (%)"
                value={Math.round(
                  silenceBagFor(safeScriptGeneration).shortPauseAdjustLimit * 100,
                )}
                onChange={(n) =>
                  setScriptGeneration((sg) => {
                    const next = coerceScriptGenerationSettings(sg);
                    silenceBagFor(next).shortPauseAdjustLimit = shareOf(n);
                    return next;
                  })
                }
              />
              <Field
                label="Extra closing music (s)"
                value={
                  silenceBagFor(safeScriptGeneration).extraClosingMusicSeconds
                }
                onChange={(n) =>
                  setScriptGeneration((sg) => {
                    const next = coerceScriptGenerationSettings(sg);
                    silenceBagFor(next).extraClosingMusicSeconds = n;
                    return next;
                  })
                }
              />
            </div>
            {/* previous: isSilenceHaiku-only triggers (no stream checkbox) */}
            {showsHaikuCols ? (
              <>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field
                  label="Script trigger (±%)"
                  value={Math.round(
                    haikuBagFor(safeScriptGeneration).scriptTriggerPct * 100,
                  )}
                  onChange={(n) =>
                    setScriptGeneration((sg) => {
                      const next = coerceScriptGenerationSettings(sg);
                      haikuBagFor(next).scriptTriggerPct = shareOf(n);
                      return next;
                    })
                  }
                />
                <Field
                  label="Phase trigger (±%)"
                  value={Math.round(
                    haikuBagFor(safeScriptGeneration).phaseTriggerPct * 100,
                  )}
                  onChange={(n) =>
                    setScriptGeneration((sg) => {
                      const next = coerceScriptGenerationSettings(sg);
                      haikuBagFor(next).phaseTriggerPct = shareOf(n);
                      return next;
                    })
                  }
                />
                <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={
                      haikuBagFor(safeScriptGeneration).streamPhasesToTts ===
                      true
                    }
                    onChange={(e) =>
                      setScriptGeneration((sg) => {
                        const next = coerceScriptGenerationSettings(sg);
                        haikuBagFor(next).streamPhasesToTts = e.target.checked;
                        return next;
                      })
                    }
                  />
                  <span>
                    Stream phases to TTS
                    <span className="ml-1 text-xs text-muted">
                      (send finished phases to TTS before the full script is
                      done; whole-script Haiku trigger is skipped)
                    </span>
                  </span>
                </label>
              </div>
              <div className="mt-4 overflow-x-auto">
                <p className="mb-2 text-sm text-foreground">
                  Ask Sonnet for
                  <span className="ml-1 text-xs text-muted">
                    (−25% to +30%; prompt word budget only — Haiku and accuracy
                    still use the real budget)
                  </span>
                </p>
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="py-1.5 pr-3 font-medium">Option</th>
                      <th className="py-1.5 pr-3 font-medium">Length</th>
                      <th className="py-1.5 pr-3 font-medium">Ask Sonnet for</th>
                      <th className="py-1.5 font-medium">
                        Latest Words · Sonnet
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["guided_casual", "Casual"],
                        ["guided", "Guided"],
                        ["open_sits", "Open sits"],
                      ] as const
                    ).flatMap(([opt, label]) =>
                      (["5", "10", "20"] as const).map((len) => {
                        const bag = haikuBagFor(safeScriptGeneration);
                        const askPct =
                          bag.askSonnetPctByOptionLength?.[opt]?.[len] ?? 0;
                        const acc = silenceLengthAccuracy.find(
                          (r) =>
                            r.option === opt && r.minutes === Number(len),
                        );
                        const sonnetAvg =
                          typeof acc?.wordsVsBudgetSonnetPct === "number"
                            ? `${fmtPct(acc.wordsVsBudgetSonnetPct, true)} (n=${acc.scripts})`
                            : "—";
                        return (
                          <tr
                            key={`ask-sonnet-${opt}-${len}`}
                            className="border-b border-border last:border-0"
                          >
                            <td className="py-1.5 pr-3 whitespace-nowrap">
                              {label}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">
                              {len} min
                            </td>
                            <td className="py-1.5 pr-3">
                              <label className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min={-25}
                                  max={30}
                                  step={1}
                                  className="w-20 rounded-lg border border-border bg-background px-2 py-1 tabular-nums"
                                  value={Math.round(askPct * 100)}
                                  onChange={(e) => {
                                    const pct = Math.min(
                                      30,
                                      Math.max(
                                        -25,
                                        num(e.target.value, 0),
                                      ),
                                    );
                                    setScriptGeneration((sg) => {
                                      const next =
                                        coerceScriptGenerationSettings(sg);
                                      const h = haikuBagFor(next);
                                      if (!h.askSonnetPctByOptionLength) {
                                        h.askSonnetPctByOptionLength = {
                                          guided_casual: {
                                            "5": 0,
                                            "10": 0,
                                            "20": 0,
                                          },
                                          guided: {
                                            "5": 0,
                                            "10": 0,
                                            "20": 0,
                                          },
                                          open_sits: {
                                            "5": 0,
                                            "10": 0,
                                            "20": 0,
                                          },
                                        };
                                      }
                                      h.askSonnetPctByOptionLength[opt][len] =
                                        pct / 100;
                                      return next;
                                    });
                                  }}
                                />
                                <span className="text-muted">%</span>
                              </label>
                            </td>
                            <td className="py-1.5 tabular-nums text-xs text-muted">
                              {sonnetAvg}
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
              </>
            ) : null}
            {!usesWordsBudget ? (
              <div className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-3">
                {(
                  [
                    ["guided_casual", "Casual"],
                    ["guided", "Guided"],
                    ["open_sits", "Open sits"],
                  ] as const
                ).map(([opt, label]) => {
                  const bag = isSilenceHaiku
                    ? safeScriptGeneration.silenceHaiku
                    : safeScriptGeneration.silenceFit;
                  const row = bag.wordsPerSentenceByOption[opt];
                  return (
                    <p key={opt}>
                      {label} words/sentence:{" "}
                      <span className="tabular-nums text-foreground">
                        {row.wordsPerSentence}
                      </span>
                      {" · "}
                      {row.scriptCount > 0
                        ? `${row.scriptCount} script${row.scriptCount === 1 ? "" : "s"}`
                        : isSilenceHaiku
                          ? "no silence-haiku data yet"
                          : "no silence-fit data yet"}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted">
                Word budget = speaking minutes × effective WPM, rounded to the
                nearest 10. No words-per-sentence measurement in this mode.
              </p>
            )}
          </section>
        ) : null}

        <section className="rounded-2xl border border-border p-4 lg:col-span-2">
          <h2 className="font-semibold text-foreground">Production mode &amp; models</h2>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="block text-sm text-foreground">
              <span className="mb-1 block text-muted">Write mode</span>
              <select
                value={safeScriptGeneration.scriptWriteMode}
                onChange={(e) => {
                  const v = e.target.value as ScriptWriteMode;
                  setScriptGeneration((sg) => ({
                    ...coerceScriptGenerationSettings(sg),
                    scriptWriteMode: v,
                  }));
                  setModeFilter(v);
                }}
                className="rounded-xl border border-border bg-background px-2 py-1.5"
              >
                <option value="sections">Sectioned</option>
                <option value="single">Single call (legacy)</option>
                <option value="time">Time-based</option>
                <option value="silence">Silence-fit</option>
                <option value="silence_haiku">Silence-fit + Haiku</option>
                <option value="silence_words">Silence-fit · words</option>
                <option value="silence_words_haiku">
                  Silence-fit · words + Haiku
                </option>
              </select>
            </label>
            <label className="block text-sm text-foreground">
              <span className="mb-1 block text-muted">Script model</span>
              <select
                value={scriptGeneration.scriptModelId}
                onChange={(e) => {
                  const id = e.target.value;
                  setScriptGeneration((sg) => {
                    const next = { ...sg, scriptModelId: id };
                    const factors =
                      sg.targetCorrectionByModel[id] ??
                      sg.targetCorrectionByModel[sg.scriptModelId] ??
                      defaultScriptTargetCorrection();
                    setTargetCorrection(coerceScriptTargetCorrection(factors));
                    return {
                      ...next,
                      targetCorrectionByModel: {
                        ...sg.targetCorrectionByModel,
                        [id]: coerceScriptTargetCorrection(factors),
                      },
                    };
                  });
                }}
                className="rounded-xl border border-border bg-background px-2 py-1.5"
              >
                {safeScriptGeneration.scriptModelOptions.map((id) => (
                  <option key={id} value={id}>
                    {claudeModelLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-foreground">
              <span className="mb-1 block text-muted">Style infer / trim model</span>
              <select
                value={safeScriptGeneration.styleInferModelId}
                onChange={(e) => {
                  const id = e.target.value;
                  setScriptGeneration((sg) => ({
                    ...coerceScriptGenerationSettings(sg),
                    styleInferModelId: id,
                  }));
                }}
                className="rounded-xl border border-border bg-background px-2 py-1.5"
              >
                {safeScriptGeneration.scriptModelOptions.map((id) => (
                  <option key={id} value={id}>
                    {claudeModelLabel(id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-1"
                checked={safeScriptGeneration.userScriptFidelityCheck === true}
                onChange={(e) => {
                  const on = e.target.checked;
                  setScriptGeneration((sg) => ({
                    ...coerceScriptGenerationSettings(sg),
                    userScriptFidelityCheck: on,
                  }));
                }}
              />
              <span>
                Run brief-fidelity check on user scripts
                <span className="mt-0.5 block text-xs text-muted">
                  Off by default. Calibration always runs fidelity.
                </span>
              </span>
            </label>
          </div>
        </section>
      </div>
      ) : null}

      {adminTab === "costs" && activeModeFilter === "sections" ? (
      <section className="rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">
              Script generation cost · sections
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-muted">
              Cost per script for each length × delivery (plan + section writes). Claude
              USD at list rates
              {safeScriptGeneration.scriptModelId
                ? ` (${claudeModelLabel(safeScriptGeneration.scriptModelId)} · $${claudeRatesPerMillion(safeScriptGeneration.scriptModelId).input}/$${claudeRatesPerMillion(safeScriptGeneration.scriptModelId).output} per MTok)`
                : ""}
              . One 5m cache write on the shared prefix (rules + brief) from the plan call;
              sections read it. Click a row for the per-call breakdown. Chars / TTS ≈ from
              calibration scripts. Measured only — empty until you run sectioned calibration.
              Guide = writer&apos;s guide in the pre-prompt.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            onClick={() => {
              void (async () => {
                try {
                  const data = await postAdminVoice<{
                    scriptGenCosts?: ScriptGenCostRow[];
                    scriptGenCostsSingle?: ScriptGenCostRow[];
                    scriptGenCostsTime?: ScriptGenCostRow[];
                    scriptGenCostsSilence?: ScriptGenCostRow[];
                  }>({
                    action: "get-script-gen-costs",
                    modelId: scriptGeneration.scriptModelId,
                  });
                  setScriptGenCosts(data.scriptGenCosts ?? []);
                  setScriptGenCostsSingle(data.scriptGenCostsSingle ?? []);
                  setScriptGenCostsTime(data.scriptGenCostsTime ?? []);
                  patchSilenceMode("silence", { costs: data.scriptGenCostsSilence ?? [] });
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Failed to load script costs",
                  );
                }
              })();
            }}
          >
            Refresh costs
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Delivery</th>
                <th className="py-2 pr-3 font-medium">Length</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Guide</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Input</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Thinking</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Output</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Cache R/W</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Claude</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Avg chars</th>
                <th className="py-2 pr-3 font-medium tabular-nums">TTS ≈</th>
                <th className="py-2 font-medium tabular-nums">Total ≈</th>
              </tr>
            </thead>
            <tbody>
              {(scriptGenCosts.length
                ? scriptGenCosts
                : ([] as ScriptGenCostRow[])
              ).flatMap((row) => {
                const key = `sec-${row.delivery}-${row.minutes}`;
                const open = expandedCostKey === key;
                const main = (
                  <tr
                    key={key}
                    className="cursor-pointer border-b border-border/60 text-foreground hover:bg-muted/20"
                    onClick={() =>
                      setExpandedCostKey(open ? null : key)
                    }
                  >
                    <td className="py-2 pr-3">
                      <span className="mr-1 text-xs text-muted">
                        {open ? "▾" : "▸"}
                      </span>
                      {DELIVERY_LABEL[row.delivery]}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {row.source === "measured"
                        ? `this run · n=${row.scripts}`
                        : "estimate"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {fmtGuide(row)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {fmtTok(row.inputTokens)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {fmtTok(row.thinkingTokens)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {fmtTok(row.outputTokens)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                      {fmtTok(row.cacheReadTokens)}/
                      {fmtTok(row.cacheWriteTokens)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {fmtUsd(row.usd)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                      {fmtTok(row.avgChars)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                      {fmtUsd(row.speechifyUsd)}
                    </td>
                    <td className="py-2 tabular-nums font-medium">
                      {fmtUsd(
                        (row.usd ?? 0) +
                          (typeof row.speechifyUsd === "number"
                            ? row.speechifyUsd
                            : 0),
                      )}
                    </td>
                  </tr>
                );
                if (!open) return [main];
                return [
                  main,
                  <CostRowExpandPanel
                    key={`${key}-calls`}
                    row={row}
                    colSpan={12}
                  />,
                ];
              })}
              {!scriptGenCosts.length ? (
                <tr>
                  <td colSpan={12} className="py-3 text-sm text-muted">
                    No measured sectioned costs yet — run sectioned calibration.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {adminTab === "costs" && activeModeFilter === "single" ? (
      <section className="rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">
              Script generation cost · single call
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-muted">
              Same columns for one-shot script generation (no plan / section split). Measured
              from single-call calibration cells with stored usage; older cells without usage
              still contribute avg chars / TTS ≈. Empty until you run single-call calibration.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
            onClick={() => {
              void (async () => {
                try {
                  const data = await postAdminVoice<{
                    scriptGenCosts?: ScriptGenCostRow[];
                    scriptGenCostsSingle?: ScriptGenCostRow[];
                    scriptGenCostsTime?: ScriptGenCostRow[];
                    scriptGenCostsSilence?: ScriptGenCostRow[];
                  }>({
                    action: "get-script-gen-costs",
                    modelId: scriptGeneration.scriptModelId,
                  });
                  setScriptGenCosts(data.scriptGenCosts ?? []);
                  setScriptGenCostsSingle(data.scriptGenCostsSingle ?? []);
                  setScriptGenCostsTime(data.scriptGenCostsTime ?? []);
                  patchSilenceMode("silence", { costs: data.scriptGenCostsSilence ?? [] });
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Failed to load script costs",
                  );
                }
              })();
            }}
          >
            Refresh costs
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="py-2 pr-3 font-medium">Delivery</th>
                <th className="py-2 pr-3 font-medium">Length</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Guide</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Input</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Thinking</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Output</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Cache R/W</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Claude</th>
                <th className="py-2 pr-3 font-medium tabular-nums">Avg chars</th>
                <th className="py-2 pr-3 font-medium tabular-nums">TTS ≈</th>
                <th className="py-2 font-medium tabular-nums">Total ≈</th>
              </tr>
            </thead>
            <tbody>
              {(scriptGenCostsSingle.length
                ? scriptGenCostsSingle
                : ([] as ScriptGenCostRow[])
              ).flatMap((row) => {
                const key = `single-${row.delivery}-${row.minutes}`;
                const open = expandedCostKey === key;
                const main = (
                  <tr
                    key={key}
                    className="cursor-pointer border-b border-border/60 text-foreground hover:bg-muted/20"
                    onClick={() => setExpandedCostKey(open ? null : key)}
                  >
                    <td className="py-2 pr-3">
                      <span className="mr-1 text-xs text-muted">
                        {open ? "▾" : "▸"}
                      </span>
                      {DELIVERY_LABEL[row.delivery]}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {row.source === "measured"
                        ? `this run · n=${row.scripts}`
                        : "estimate"}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted">
                      {fmtGuide(row)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {fmtTok(row.inputTokens)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {fmtTok(row.thinkingTokens)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {fmtTok(row.outputTokens)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                      {fmtTok(row.cacheReadTokens)}/
                      {fmtTok(row.cacheWriteTokens)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{fmtUsd(row.usd)}</td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                      {fmtTok(row.avgChars)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                      {fmtUsd(row.speechifyUsd)}
                    </td>
                    <td className="py-2 tabular-nums font-medium">
                      {fmtUsd(
                        (row.usd ?? 0) +
                          (typeof row.speechifyUsd === "number"
                            ? row.speechifyUsd
                            : 0),
                      )}
                    </td>
                  </tr>
                );
                if (!open) return [main];
                return [
                  main,
                  <CostRowExpandPanel
                    key={`${key}-calls`}
                    row={row}
                    colSpan={12}
                  />,
                ];
              })}
              {!scriptGenCostsSingle.length ? (
                <tr>
                  <td colSpan={12} className="py-3 text-sm text-muted">
                    No measured single-call costs yet — run single-call calibration.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      ) : null}

      {adminTab === "costs" && activeModeFilter === "time" ? (
        <section className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">
                Script generation cost · time-based
              </h2>
              <p className="mt-1 max-w-3xl text-xs text-muted">
                Measured from time-based cost cells (same n briefs × 5/10/20 × delivery as
                single-call). One Claude write call only. Compare modes shows Claude $ next
                to sectioned and single.
              </p>
              {timeCostProgress ? (
                <p className="mt-1 text-xs text-muted">{timeCostProgress}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={compareModes}
                  onChange={(e) => setCompareModes(e.target.checked)}
                />
                Compare modes
              </label>
              <button
                type="button"
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
                onClick={() => {
                  void (async () => {
                    try {
                      const data = await postAdminVoice<{
                        scriptGenCosts?: ScriptGenCostRow[];
                        scriptGenCostsSingle?: ScriptGenCostRow[];
                        scriptGenCostsTime?: ScriptGenCostRow[];
                        scriptGenCostsSilence?: ScriptGenCostRow[];
                      }>({
                        action: "get-script-gen-costs",
                        modelId: scriptGeneration.scriptModelId,
                      });
                      setScriptGenCosts(data.scriptGenCosts ?? []);
                      setScriptGenCostsSingle(data.scriptGenCostsSingle ?? []);
                      setScriptGenCostsTime(data.scriptGenCostsTime ?? []);
                      patchSilenceMode("silence", { costs: data.scriptGenCostsSilence ?? [] });
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Failed to load script costs",
                      );
                    }
                  })();
                }}
              >
                Refresh costs
              </button>
              <button
                type="button"
                disabled={
                  timeCostRunning ||
                  singleCalibrating ||
                  comparing ||
                  calibrating
                }
                className="rounded-full border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
                onClick={() => {
                  void runTimeBasedBatch();
                }}
              >
                {timeCostRunning ? "Running on server…" : "Run time-based costs"}
              </button>
            </div>
          </div>
          {compareModes ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Delivery</th>
                    <th className="py-2 pr-3 font-medium">Length</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Sectioned</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Single</th>
                    <th className="py-2 font-medium tabular-nums">Time-based</th>
                  </tr>
                </thead>
                <tbody>
                  {(["casual", "guided", "open_sits"] as const).flatMap((d) =>
                    ([5, 10, 20] as const).map((m) => {
                      const sec = scriptGenCosts.find(
                        (r) => r.delivery === d && r.minutes === m,
                      );
                      const sing = scriptGenCostsSingle.find(
                        (r) => r.delivery === d && r.minutes === m,
                      );
                      const tim = scriptGenCostsTime.find(
                        (r) => r.delivery === d && r.minutes === m,
                      );
                      return (
                        <tr
                          key={`cmp-${d}-${m}`}
                          className="border-b border-border/60 text-foreground"
                        >
                          <td className="py-2 pr-3">{DELIVERY_LABEL[d]}</td>
                          <td className="py-2 pr-3">{m} min</td>
                          <td className="py-2 pr-3 tabular-nums">
                            {sec?.source === "measured" ? fmtUsd(sec.usd) : "—"}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {sing?.source === "measured" ? fmtUsd(sing.usd) : "—"}
                          </td>
                          <td className="py-2 tabular-nums">
                            {tim?.source === "measured" ? fmtUsd(tim.usd) : "—"}
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Delivery</th>
                    <th className="py-2 pr-3 font-medium">Length</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 pr-3 font-medium">Guide</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Input</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Thinking</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Output</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Cache R/W</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Claude</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">Avg chars</th>
                    <th className="py-2 pr-3 font-medium tabular-nums">TTS ≈</th>
                    <th className="py-2 font-medium tabular-nums">Total ≈</th>
                  </tr>
                </thead>
                <tbody>
                  {(scriptGenCostsTime.length
                    ? scriptGenCostsTime
                    : ([] as ScriptGenCostRow[])
                  ).flatMap((row) => {
                    const key = `time-${row.delivery}-${row.minutes}`;
                    const open = expandedCostKey === key;
                    const main = (
                      <tr
                        key={key}
                        className="cursor-pointer border-b border-border/60 text-foreground hover:bg-muted/20"
                        onClick={() =>
                          setExpandedCostKey(open ? null : key)
                        }
                      >
                        <td className="py-2 pr-3">
                          <span className="mr-1 text-xs text-muted">
                            {open ? "▾" : "▸"}
                          </span>
                          {DELIVERY_LABEL[row.delivery]}
                        </td>
                        <td className="py-2 pr-3">{row.minutes} min</td>
                        <td className="py-2 pr-3 text-xs text-muted">
                          {row.source === "measured"
                            ? `this run · n=${row.scripts}`
                            : "estimate"}
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted">
                          {fmtGuide(row)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {fmtTok(row.inputTokens)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {fmtTok(row.thinkingTokens)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {fmtTok(row.outputTokens)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                          {fmtTok(row.cacheReadTokens)}/
                          {fmtTok(row.cacheWriteTokens)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {fmtUsd(row.usd)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                          {fmtTok(row.avgChars)}
                        </td>
                        <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                          {fmtUsd(row.speechifyUsd)}
                        </td>
                        <td className="py-2 tabular-nums font-medium">
                          {fmtUsd(
                            (row.usd ?? 0) +
                              (typeof row.speechifyUsd === "number"
                                ? row.speechifyUsd
                                : 0),
                          )}
                        </td>
                      </tr>
                    );
                    if (!open) return [main];
                    return [
                      main,
                      <CostRowExpandPanel
                        key={`${key}-calls`}
                        row={row}
                        colSpan={12}
                      />,
                    ];
                  })}
                  {!scriptGenCostsTime.length ? (
                    <tr>
                      <td colSpan={12} className="py-3 text-sm text-muted">
                        No time-based cost rows yet. Click Run time-based costs (uses
                        current n briefs).
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {adminTab === "costs" && isSilenceFamily ? (
        <section className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">
                Script generation cost ·{" "}
                {isSilenceWordsHaiku
                  ? "silence-fit · words + Haiku"
                  : showsHaikuCols
                  ? "silence-fit + Haiku"
                  : usesWordsBudget
                    ? "silence-fit · words"
                    : "silence-fit"}
              </h2>
              <p className="mt-1 max-w-3xl text-xs text-muted">
                Averages from the last{" "}
                {isSilenceWordsHaiku
                  ? "silence-fit · words + Haiku"
                  : showsHaikuCols
                  ? "silence-fit + Haiku"
                  : usesWordsBudget
                    ? "silence-fit · words"
                    : "silence-fit"}{" "}
                run on the tab row (n briefs × Casual / Guided / Open sits ×
                5/10/20).
                {showsHaikuCols
                  ? " One Sonnet write plus Haiku on missed phases. Haiku cost is included in Claude total."
                  : " One Claude write call per cell."}{" "}
                Source n = briefs averaged into each row. Click a row for
                per-script calls.
              </p>
              {isSilenceWordsHaiku || showsHaikuCols ? (
                <p className="mt-1 max-w-3xl text-xs text-amber-700 dark:text-amber-300">
                  Cause: API returns Haiku for word-fix (~$0.0001/call at
                  Haiku rates), but accuracy/export priced the whole aggregate
                  (write + Haiku tokens) at Sonnet — about +$0.0025 per fix
                  call. claude_usd is now Sonnet write + Haiku-priced fixes.
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">Source</th>
                  <th className="py-2 pr-3 font-medium">Guide</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Input</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Thinking</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Output</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Cache R/W</th>
                  {showsHaikuCols ? (
                    <>
                      <th className="py-2 pr-3 font-medium tabular-nums">
                        Haiku
                      </th>
                      <th className="py-2 pr-3 font-medium tabular-nums">
                        Haiku runs
                      </th>
                    </>
                  ) : null}
                  <th className="py-2 pr-3 font-medium tabular-nums">Claude</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Avg chars</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">TTS ≈</th>
                  <th className="py-2 font-medium tabular-nums">Total ≈</th>
                </tr>
              </thead>
              <tbody>
                {scriptGenCostsSilence.filter((r) => r.source === "measured")
                  .length === 0 ? (
                  <tr>
                    <td
                      colSpan={showsHaikuCols ? 14 : 12}
                      className="py-3 text-sm text-muted"
                    >
                      No{" "}
                      {isSilenceWordsHaiku
                        ? "silence-fit · words + Haiku"
                        : showsHaikuCols
                        ? "silence-fit + Haiku"
                        : "silence-fit"}{" "}
                      costs yet — run the batch above.
                    </td>
                  </tr>
                ) : (
                  scriptGenCostsSilence
                    .filter((r) => r.source === "measured")
                    .flatMap((r) => {
                      const key = `sil-${activeModeFilter}-${r.delivery}-${r.minutes}`;
                      const open = expandedCostKey === key;
                      const colSpan = showsHaikuCols ? 14 : 12;
                      const main = (
                        <tr
                          key={key}
                          className="cursor-pointer border-b border-border/60 text-foreground hover:bg-muted/20"
                          onClick={() =>
                            setExpandedCostKey(open ? null : key)
                          }
                        >
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <span className="mr-1 text-xs text-muted">
                              {open ? "▾" : "▸"}
                            </span>
                            {DELIVERY_LABEL[r.delivery]}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {r.minutes} min
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted">
                            {`this run · n=${r.scripts}`}
                          </td>
                          <td className="py-2 pr-3 text-xs text-muted">
                            {fmtGuide(r)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {fmtTok(r.inputTokens)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {fmtTok(r.thinkingTokens)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {fmtTok(r.outputTokens)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                            {fmtTok(r.cacheReadTokens)}/
                            {fmtTok(r.cacheWriteTokens)}
                          </td>
                          {showsHaikuCols ? (
                            <>
                              <td className="py-2 pr-3 tabular-nums">
                                {fmtUsd(r.haikuUsd ?? 0)}
                              </td>
                              <td className="py-2 pr-3 tabular-nums">
                                {r.haikuRunPct != null
                                  ? `${r.haikuRunPct}%`
                                  : "—"}
                              </td>
                            </>
                          ) : null}
                          <td className="py-2 pr-3 tabular-nums">
                            {fmtUsd(r.usd)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                            {fmtTok(r.avgChars)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-xs text-muted">
                            {fmtUsd(r.speechifyUsd)}
                          </td>
                          <td className="py-2 tabular-nums font-medium">
                            {fmtUsd(
                              (r.usd ?? 0) +
                                (typeof r.speechifyUsd === "number"
                                  ? r.speechifyUsd
                                  : 0),
                            )}
                          </td>
                        </tr>
                      );
                      if (!open) return [main];
                      return [
                        main,
                        <CostRowExpandPanel
                          key={`${key}-calls`}
                          row={r}
                          colSpan={colSpan}
                        />,
                      ];
                    })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {adminTab === "calibrate" && activeModeFilter === "sections" ? (
            <section className="rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">
              Sectioned · calibration
            </h2>
            <p className="mt-1 text-xs text-muted">
              One word factor and one pause factor per length × delivery (5/10/20 × Casual /
              Guided / Open sits), stored per model. Run calibration uses n briefs × 9 cells
              (no audio). Tables and costs are per run — a new run clears the previous batch.
              Lower n while tweaking to cut cost. Default model: claude-sonnet-5-5.
            </p>
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
              Pause syntax changed: re-run calibration. Older results used named
              pause bands; new scripts use timed {"`<N>`"} only.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-sm text-foreground">
            <span className="mb-1 block text-muted">Briefs per run (n)</span>
            <select
              value={coerceCalibrationBriefCount(
                scriptGeneration.calibrationBriefCount,
                scriptGeneration.calibrationBriefs.length ||
                  CALIBRATION_BRIEF_COUNT,
              )}
              onChange={(e) => {
                const n = coerceCalibrationBriefCount(
                  e.target.value,
                  scriptGeneration.calibrationBriefs.length ||
                    CALIBRATION_BRIEF_COUNT,
                );
                setScriptGeneration((sg) => ({
                  ...sg,
                  calibrationBriefCount: n,
                }));
                setResumeHint(null);
              }}
              title="How many of the calibration briefs to use this run (1…10)"
              className="rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
            >
              {Array.from(
                {
                  length:
                    scriptGeneration.calibrationBriefs.length ||
                    CALIBRATION_BRIEF_COUNT,
                },
                (_, i) => i + 1,
              ).map((n) => (
                <option key={n} value={n}>
                  {n} ({n * 9} scripts)
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-foreground">
            <span className="mb-1 block text-muted">Script model</span>
            <select
              value={scriptGeneration.scriptModelId}
              onChange={(e) => {
                const id = e.target.value;
                setScriptGeneration((sg) => {
                  const next = { ...sg, scriptModelId: id };
                  const factors =
                    sg.targetCorrectionByModel[id] ??
                    sg.targetCorrectionByModel[sg.scriptModelId] ??
                    defaultScriptTargetCorrection();
                  setTargetCorrection(coerceScriptTargetCorrection(factors));
                  return {
                    ...next,
                    targetCorrectionByModel: {
                      ...sg.targetCorrectionByModel,
                      [id]: coerceScriptTargetCorrection(factors),
                    },
                  };
                });
                setCalibrationSummary([]);
                setFactorSpread([]);
                setScriptFactors([]);
                setSectionBreakdown([]);
                setScriptGenCosts([]);
                setScriptGenCostsSingle([]);
                setCheckRows([]);
                setDiversions([]);
                setLastBatchAt(null);
                void (async () => {
                  try {
                    const data = await postAdminVoice<{
                      batch: { ranAt?: string; diversions?: typeof diversions } | null;
                      diversions?: typeof diversions;
                      summary?: typeof calibrationSummary;
                      factorSpread?: typeof factorSpread;
                      scriptFactors?: typeof scriptFactors;
                      sectionBreakdown?: typeof sectionBreakdown;
                      scriptGenCosts?: ScriptGenCostRow[];
                      scriptGenCostsSingle?: ScriptGenCostRow[];
                    }>({
                      action: "get-script-calibration-batch",
                      modelId: id,
                    });
                    setLastBatchAt(data.batch?.ranAt ?? null);
                    setDiversions(
                      data.diversions ?? data.batch?.diversions ?? [],
                    );
                    setCalibrationSummary(data.summary ?? []);
                    setFactorSpread(data.factorSpread ?? []);
                    setScriptFactors(data.scriptFactors ?? []);
                    setSectionBreakdown(data.sectionBreakdown ?? []);
                    setScriptGenCosts(data.scriptGenCosts ?? []);
                    if (data.scriptGenCostsSingle?.length) {
                      setScriptGenCostsSingle(data.scriptGenCostsSingle);
                    }
                    try {
                      const singleRes = await postAdminVoice<{
                        summary?: typeof singleSummary;
                        factorSpread?: typeof singleFactorSpread;
                        scriptFactors?: typeof singleScriptFactors;
                        scriptGenCostsSingle?: ScriptGenCostRow[];
                      }>({
                        action: "get-single-call-calibration",
                        modelId: id,
                      });
                      setSingleSummary(singleRes.summary ?? []);
                      setSingleFactorSpread(singleRes.factorSpread ?? []);
                      setSingleScriptFactors(singleRes.scriptFactors ?? []);
                      if (singleRes.scriptGenCostsSingle?.length) {
                        setScriptGenCostsSingle(singleRes.scriptGenCostsSingle);
                      }
                    } catch {
                      setSingleSummary([]);
                      setSingleFactorSpread([]);
                      setSingleScriptFactors([]);
                    }
                    try {
                      const cmpRes = await postAdminVoice<{
                        table?: typeof compareTable;
                        pairs?: typeof comparePairs;
                      }>({
                        action: "get-script-mode-comparison",
                        modelId: id,
                      });
                      setCompareTable(cmpRes.table ?? null);
                      setComparePairs(cmpRes.pairs ?? []);
                    } catch {
                      setCompareTable(null);
                      setComparePairs([]);
                    }
                  } catch {
                    /* */
                  }
                })();
              }}
              className="rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
            >
              {scriptGeneration.scriptModelOptions.map((id) => (
                <option key={id} value={id}>
                  {claudeModelLabel(id)} ({id})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-foreground">
            <span className="mb-1 block text-muted">Style-infer model</span>
            <select
              value={
                scriptGeneration.styleInferModelId ||
                scriptGeneration.scriptModelOptions.find((id) =>
                  id.includes("haiku"),
                ) ||
                scriptGeneration.scriptModelOptions[0]
              }
              onChange={(e) => {
                const id = e.target.value;
                setScriptGeneration((sg) => ({ ...sg, styleInferModelId: id }));
              }}
              title="Used only when no style is chosen, to attach a writer's guide"
              className="rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
            >
              {scriptGeneration.scriptModelOptions.map((id) => (
                <option key={id} value={id}>
                  {claudeModelLabel(id)} ({id})
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={calibrating || checking}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => void runScriptCalibration(false)}
          >
            {calibrating
              ? "Calibrating…"
              : resumeHint
                ? "Resume calibration"
                : "Run calibration"}
          </button>
          <button
            type="button"
            disabled={calibrating || checking}
            title={`Wipe saved scripts and run all ${coerceCalibrationBriefCount(scriptGeneration.calibrationBriefCount, scriptGeneration.calibrationBriefs.length) * 9} from the start on the server`}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => void runScriptCalibration(true)}
          >
            Restart calibration
          </button>
          <button
            type="button"
            disabled={!calibrating || checking}
            title="Ask the server worker to stop after the current script"
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => void stopScriptCalibration()}
          >
            Stop
          </button>
          <button
            type="button"
            disabled={calibrating || checking}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setChecking(true);
                setFactorsError(null);
                setCheckRows([]);
                const deliveries = ["casual", "guided", "open_sits"] as const;
                const minutes = [5, 10, 20] as const;
                const voices = ["Beatrice", "Elijah", "Oliver"] as const;
                const rows: typeof checkRows = [];
                try {
                  for (const delivery of deliveries) {
                    for (const m of minutes) {
                      for (const voice of voices) {
                        setCalibrateProgress(
                          `Check · ${DELIVERY_LABEL[delivery]} · ${m} min · ${voice}`,
                        );
                        const saved = await postAdminVoice<{
                          result: (typeof checkRows)[number];
                        }>({
                          action: "check-script-factors-cell",
                          modelId: scriptGeneration.scriptModelId,
                          delivery,
                          minutes: m,
                          voice,
                        });
                        rows.push(saved.result);
                        setCheckRows([...rows]);
                      }
                    }
                  }
                  setCalibrateProgress("Check done");
                } catch (e) {
                  setFactorsError(e instanceof Error ? e.message : "Check failed");
                  setCalibrateProgress(null);
                } finally {
                  setChecking(false);
                }
              })();
            }}
          >
            {checking ? "Checking…" : "Run check"}
          </button>
          <button
            type="button"
            disabled={calibrating || checking || rejudgingFidelity || !lastBatchAt}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            title={
              lastBatchAt
                ? "Re-run Haiku fidelity on stored scripts (no regen)"
                : "Needs a stored calibration batch"
            }
            onClick={() => {
              void (async () => {
                setRejudgingFidelity(true);
                setFactorsError(null);
                let offset = 0;
                let judgedTotal = 0;
                let skippedTotal = 0;
                let cellCount = 0;
                try {
                  for (;;) {
                    setCalibrateProgress(
                      cellCount
                        ? `Re-checking diversions · ${Math.min(offset, cellCount)} of ${cellCount}…`
                        : "Re-checking diversions on stored scripts…",
                    );
                    const data = await postAdminVoice<{
                      done?: boolean;
                      nextOffset?: number;
                      diversions?: typeof diversions | null;
                      judged?: number;
                      skipped?: number;
                      cellCount?: number;
                    }>({
                      action: "rejudge-script-calibration-fidelity",
                      modelId: scriptGeneration.scriptModelId,
                      offset,
                      limit: 8,
                    });
                    cellCount = data.cellCount ?? cellCount;
                    judgedTotal += data.judged ?? 0;
                    skippedTotal += data.skipped ?? 0;
                    if (data.done) {
                      setDiversions(data.diversions ?? []);
                      const divN = data.diversions?.length ?? 0;
                      setCalibrateProgress(
                        `Diversions updated · ${divN} flagged · ${judgedTotal} judged · ${skippedTotal} skipped (${cellCount} cells)`,
                      );
                      break;
                    }
                    offset = data.nextOffset ?? offset + 8;
                    if (offset >= (data.cellCount ?? 0) && (data.cellCount ?? 0) > 0) {
                      // Safety: force a final empty chunk to persist diversions.
                      continue;
                    }
                  }
                } catch (e) {
                  setFactorsError(
                    e instanceof Error
                      ? e.message
                      : "Could not re-check diversions",
                  );
                  setCalibrateProgress(null);
                } finally {
                  setRejudgingFidelity(false);
                }
              })();
            }}
          >
            {rejudgingFidelity ? "Re-checking…" : "Re-check diversions"}
          </button>
          <button
            type="button"
            disabled={calibrating || checking || rejudgingFidelity}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setFactorsError(null);
                try {
                  const saved = await postAdminVoice<{
                    targetCorrection?: ScriptTargetCorrection;
                    scriptGeneration?: ScriptGenerationSettings;
                  }>({
                    action: "reset-target-correction",
                    modelId: scriptGeneration.scriptModelId,
                  });
                  if (saved.scriptGeneration) {
                    const sg = coerceScriptGenerationSettings(saved.scriptGeneration);
                    setScriptGeneration(sg);
                    setTargetCorrection(
                      coerceScriptTargetCorrection(
                        sg.targetCorrectionByModel[sg.scriptModelId] ??
                          defaultScriptTargetCorrection(),
                      ),
                    );
                  } else {
                    setTargetCorrection(
                      coerceScriptTargetCorrection(
                        saved.targetCorrection ?? defaultScriptTargetCorrection(),
                      ),
                    );
                  }
                  setCalibrationSummary([]);
                  setCheckRows([]);
                  setCalibrateProgress(null);
                } catch (e) {
                  setFactorsError(
                    e instanceof Error ? e.message : "Could not reset factors",
                  );
                }
              })();
            }}
          >
            Reset factors
          </button>
        </div>
        {factorsError ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">{factorsError}</p>
        ) : null}

        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <button
                type="button"
                className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                onClick={() => setBriefsOpen((o) => !o)}
              >
                {briefsOpen ? "▾" : "▸"}{" "}
                {scriptGeneration.calibrationBriefs.length} briefs ·{" "}
                {briefsOpen ? "Hide" : "Edit"}
              </button>
              {!briefsOpen ? (
                <p className="text-xs text-muted">
                  Collapsed by default. Used for every length × delivery calibration run.
                </p>
              ) : (
                <p className="text-xs text-muted">
                  Ten requests used for every length × delivery. Most name a style
                  so Haiku-infer can attach the matching writer&apos;s guide.
                </p>
              )}
            </div>
            {briefsOpen ? (
              <button
                type="button"
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
                onClick={() => {
                  setScriptGeneration((sg) => ({
                    ...sg,
                    calibrationBriefs: [...DEFAULT_CALIBRATION_BRIEFS],
                  }));
                }}
              >
                Reset briefs to defaults
              </button>
            ) : null}
          </div>
          {briefsOpen
            ? scriptGeneration.calibrationBriefs.map((brief, i) => (
            <label key={i} className="block text-sm text-foreground">
              <span className="mb-1 block text-muted">Brief {i + 1}</span>
              <textarea
                value={brief}
                rows={2}
                onChange={(e) => {
                  const v = e.target.value;
                  setScriptGeneration((sg) => {
                    const next = [...sg.calibrationBriefs];
                    next[i] = v;
                    return { ...sg, calibrationBriefs: next };
                  });
                }}
                className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
              />
            </label>
          ))
            : null}
        </div>

        {!modelHasFactors(scriptGeneration, scriptGeneration.scriptModelId) ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            This model has no calibrated factors yet — run calibration (stores scripts for
            re-run when you change model).
          </p>
        ) : null}
        {lastBatchAt ? (
          <p className="mt-2 text-xs text-muted">
            Last stored batch: {new Date(lastBatchAt).toLocaleString()}
          </p>
        ) : null}
        {resumeHint ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{resumeHint}</p>
        ) : null}
        {calibrateProgress ? (
          <p className="mt-2 text-xs text-muted">{calibrateProgress}</p>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Delivery</th>
                <th className="py-2 pr-3 font-medium">Length</th>
                <th className="py-2 pr-3 font-medium">Word factor</th>
                <th className="py-2 pr-3 font-medium">Pause factor</th>
                <th className="py-2 pr-3 font-medium">Scripts</th>
                <th className="py-2 pr-3 font-medium">Set</th>
              </tr>
            </thead>
            <tbody>
              {(["casual", "guided", "open_sits"] as const).flatMap((id) =>
                (["5", "10", "20"] as const).map((len) => {
                  const cell = targetCorrection[id][len];
                  return (
                    <tr
                      key={`${id}-${len}`}
                      className="border-b border-border last:border-0 text-foreground"
                    >
                      <td className="py-2 pr-3">{DELIVERY_LABEL[id]}</td>
                      <td className="py-2 pr-3">{len} min</td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          step="0.01"
                          value={cell.words}
                          onChange={(e) => {
                            const n = num(e.target.value, cell.words);
                            setTargetCorrection((c) => ({
                              ...c,
                              [id]: {
                                ...c[id],
                                [len]: { ...c[id][len], words: n },
                              },
                            }));
                          }}
                          className="w-20 rounded-lg border border-border bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="py-2 pr-3">
                        <input
                          type="number"
                          step="0.01"
                          value={cell.pauses}
                          onChange={(e) => {
                            const n = num(e.target.value, cell.pauses);
                            setTargetCorrection((c) => ({
                              ...c,
                              [id]: {
                                ...c[id],
                                [len]: { ...c[id][len], pauses: n },
                              },
                            }));
                          }}
                          className="w-20 rounded-lg border border-border bg-background px-1.5 py-1"
                        />
                      </td>
                      <td className="py-2 pr-3">{cell.sampleCount || "—"}</td>
                      <td className="py-2 pr-3 text-xs text-muted">
                        {cell.setAt ? new Date(cell.setAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
        </div>

        {lastBatchAt || diversions.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Brief diversions (includes awkward section joins)
            </h3>
            {diversions.length === 0 ? (
              <p className="mb-2 text-xs text-muted">
                None flagged yet for this model. Use Re-check diversions to re-judge
                stored scripts under the current rules.
              </p>
            ) : null}
            {diversions.length > 0 ? (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">Brief</th>
                  <th className="py-2 pr-3 font-medium">Notes</th>
                  <th className="py-2 pr-3 font-medium">Sections</th>
                </tr>
              </thead>
              <tbody>
                {diversions.map((row, i) => (
                  <tr
                    key={`${row.delivery}-${row.minutes}-${row.briefIndex}-${i}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">
                      {DELIVERY_LABEL[row.delivery as DeliveryId] ?? row.delivery}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3 max-w-[240px] text-xs">
                      {row.brief.slice(0, 120)}
                      {row.brief.length > 120 ? "…" : ""}
                    </td>
                    <td className="py-2 pr-3 text-xs">{row.notes || "—"}</td>
                    <td className="py-2 pr-3 text-xs">
                      {row.divertedSections?.length
                        ? row.divertedSections.join(", ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            ) : null}
          </div>
        ) : null}

        {calibrationSummary.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Calibration results (before factors)
            </h3>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">Words vs target</th>
                  <th className="py-2 pr-3 font-medium">Pauses vs plan</th>
                  <th className="py-2 pr-3 font-medium">Word factor</th>
                  <th className="py-2 pr-3 font-medium">Pause factor</th>
                </tr>
              </thead>
              <tbody>
                {calibrationSummary.map((row) => (
                  <tr
                    key={`${row.delivery}-${row.minutes}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">
                      {DELIVERY_LABEL[row.delivery as DeliveryId] ?? row.delivery}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3">{fmtPct(row.wordsPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.pausesPct, true)}</td>
                    <td className="py-2 pr-3">{row.wordFactor.toFixed(2)}</td>
                    <td className="py-2 pr-3">{row.pauseFactor.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {factorSpread.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-1 text-sm font-medium text-foreground">
              Word-factor spread by brief
            </h3>
            <p className="mb-2 text-xs text-muted">
              Pooled is what we save (Σ target ÷ Σ written). Min / median / max are
              per-script target÷written across the briefs for that cell (unclamped).
            </p>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">n</th>
                  <th className="py-2 pr-3 font-medium">Pooled</th>
                  <th className="py-2 pr-3 font-medium">Min</th>
                  <th className="py-2 pr-3 font-medium">Median</th>
                  <th className="py-2 pr-3 font-medium">Max</th>
                </tr>
              </thead>
              <tbody>
                {factorSpread
                  .filter((row) => row.scripts > 0)
                  .map((row) => (
                    <tr
                      key={`spread-${row.delivery}-${row.minutes}`}
                      className="border-b border-border last:border-0 text-foreground"
                    >
                      <td className="py-2 pr-3">
                        {DELIVERY_LABEL[row.delivery as DeliveryId] ?? row.delivery}
                      </td>
                      <td className="py-2 pr-3">{row.minutes} min</td>
                      <td className="py-2 pr-3">{row.scripts}</td>
                      <td className="py-2 pr-3">{row.pooledWordFactor.toFixed(2)}</td>
                      <td className="py-2 pr-3">
                        {row.wordMin != null ? row.wordMin.toFixed(2) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {row.wordMedian != null ? row.wordMedian.toFixed(2) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {row.wordMax != null ? row.wordMax.toFixed(2) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {scriptFactors.length > 0 ? (
              <div className="mt-2">
                <button
                  type="button"
                  className="text-xs text-muted underline"
                  onClick={() => setShowScriptFactors((v) => !v)}
                >
                  {showScriptFactors
                    ? "Hide per-brief factors"
                    : "Show per-brief factors"}
                </button>
                {showScriptFactors ? (
                  <table className="mt-2 w-full min-w-[800px] text-left text-sm">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-border">
                        <th className="py-2 pr-3 font-medium">Delivery</th>
                        <th className="py-2 pr-3 font-medium">Length</th>
                        <th className="py-2 pr-3 font-medium">Brief</th>
                        <th className="py-2 pr-3 font-medium">Written / target</th>
                        <th className="py-2 pr-3 font-medium">Word factor</th>
                        <th className="py-2 pr-3 font-medium">Pause factor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scriptFactors.map((row) => (
                        <tr
                          key={`sf-${row.delivery}-${row.minutes}-${row.briefIndex}`}
                          className="border-b border-border last:border-0 text-foreground"
                        >
                          <td className="py-2 pr-3">
                            {DELIVERY_LABEL[row.delivery as DeliveryId] ??
                              row.delivery}
                          </td>
                          <td className="py-2 pr-3">{row.minutes} min</td>
                          <td className="py-2 pr-3 max-w-[280px] text-xs">
                            #{row.briefIndex + 1}{" "}
                            {row.brief.slice(0, 80)}
                            {row.brief.length > 80 ? "…" : ""}
                          </td>
                          <td className="py-2 pr-3 text-xs">
                            {row.writtenWords} / {row.targetWords}
                          </td>
                          <td className="py-2 pr-3">
                            {row.wordFactor != null
                              ? row.wordFactor.toFixed(2)
                              : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {row.pauseFactor != null
                              ? row.pauseFactor.toFixed(2)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : null}
              </div>
            ) : null}
            {sectionBreakdown.length > 0 ? (
              <div className="mt-4">
                <button
                  type="button"
                  className="text-xs text-muted underline"
                  onClick={() => setShowSectionBreakdown((v) => !v)}
                >
                  {showSectionBreakdown
                    ? "Hide section breakdown"
                    : "Show section breakdown"}
                </button>
                {showSectionBreakdown ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted">
                      Per script: section count, written/target words, and plan
                      topic (intention) for each section.
                    </p>
                    <table className="w-full min-w-[800px] text-left text-sm">
                      <thead className="text-xs text-muted">
                        <tr className="border-b border-border">
                          <th className="py-2 pr-3 font-medium">Delivery</th>
                          <th className="py-2 pr-3 font-medium">Length</th>
                          <th className="py-2 pr-3 font-medium">Brief</th>
                          <th className="py-2 pr-3 font-medium">Sections</th>
                          <th className="py-2 pr-3 font-medium">Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sectionBreakdown.map((row) => {
                          const key = `${row.delivery}|${row.minutes}|${row.briefIndex}`;
                          const open = expandedSectionScripts.has(key);
                          return (
                            <tr
                              key={`sb-${key}`}
                              className="border-b border-border last:border-0 text-foreground align-top"
                            >
                              <td className="py-2 pr-3">
                                {DELIVERY_LABEL[row.delivery as DeliveryId] ??
                                  row.delivery}
                              </td>
                              <td className="py-2 pr-3">{row.minutes} min</td>
                              <td className="py-2 pr-3 max-w-[240px] text-xs">
                                #{row.briefIndex + 1}{" "}
                                {row.brief.slice(0, 70)}
                                {row.brief.length > 70 ? "…" : ""}
                              </td>
                              <td className="py-2 pr-3">{row.sectionCount}</td>
                              <td className="py-2 pr-3">
                                <button
                                  type="button"
                                  className="text-xs text-muted underline"
                                  onClick={() => {
                                    setExpandedSectionScripts((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(key)) next.delete(key);
                                      else next.add(key);
                                      return next;
                                    });
                                  }}
                                >
                                  {open ? "Hide" : "Show"} sections
                                </button>
                                {open ? (
                                  <table className="mt-2 w-full min-w-[560px] text-left text-xs">
                                    <thead className="text-muted">
                                      <tr className="border-b border-border">
                                        <th className="py-1 pr-2 font-medium">
                                          #
                                        </th>
                                        <th className="py-1 pr-2 font-medium">
                                          Name
                                        </th>
                                        <th className="py-1 pr-2 font-medium">
                                          Topic
                                        </th>
                                        <th className="py-1 pr-2 font-medium">
                                          Words
                                        </th>
                                        <th className="py-1 pr-2 font-medium">
                                          Pause (s)
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {row.sections.map((sec, si) => (
                                        <tr
                                          key={`${key}-sec-${si}`}
                                          className="border-b border-border/60 last:border-0"
                                        >
                                          <td className="py-1 pr-2">
                                            {si + 1}
                                          </td>
                                          <td className="py-1 pr-2">
                                            {sec.name}
                                          </td>
                                          <td className="py-1 pr-2 max-w-[280px]">
                                            {sec.topic || "—"}
                                          </td>
                                          <td className="py-1 pr-2 whitespace-nowrap">
                                            {sec.writtenWords} /{" "}
                                            {sec.targetWords}
                                          </td>
                                          <td className="py-1 pr-2 whitespace-nowrap">
                                            {sec.writtenPauseSeconds} /{" "}
                                            {sec.plannedPauseSeconds}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {checkRows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Run check (factors on)
            </h3>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">Voice</th>
                  <th className="py-2 pr-3 font-medium">Words</th>
                  <th className="py-2 pr-3 font-medium">Pauses</th>
                  <th className="py-2 pr-3 font-medium">Fix</th>
                  <th className="py-2 pr-3 font-medium">Pause scale</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                </tr>
              </thead>
              <tbody>
                {checkRows.map((row) => (
                  <tr
                    key={`${row.delivery}-${row.minutes}-${row.voice}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">
                      {DELIVERY_LABEL[row.delivery as DeliveryId] ?? row.delivery}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3">{row.voice}</td>
                    <td className="py-2 pr-3">{fmtPct(row.firstWordsPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.pausesPct, true)}</td>
                    <td className="py-2 pr-3">
                      {row.fixed?.length ? row.fixed.join(", ") : "—"}
                    </td>
                    <td className="py-2 pr-3">{row.pauseScalePct}%</td>
                    <td className="py-2 pr-3">{fmtPct(row.finalLengthPct, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      ) : null}

      {adminTab === "calibrate" && activeModeFilter === "time" ? (
        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">Time-based · no factors</h2>
          <p className="mt-1 text-sm text-muted">
            Time-based mode fits length with flexible silences in one Claude call. There are
            no word/pause correction factors to calibrate. Measure Claude $ under Costs →
            Time-based → Run time-based costs, then Compare modes.
          </p>
        </section>
      ) : null}

      {adminTab === "calibrate" && isSilenceFamily ? (
        <section className="rounded-2xl border border-border p-4">
          <h2 className="font-semibold text-foreground">
            {isSilenceWordsHaiku
              ? "Silence-fit · words + Haiku · no factors"
              : showsHaikuCols
              ? "Silence-fit + Haiku · no factors"
              : usesWordsBudget
                ? "Silence-fit · words · no factors"
                : "Silence-fit · no factors"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            One Claude call per cell; the app fits silence. No word/pause factors. Use{" "}
            <span className="text-foreground">n</span> /{" "}
            <span className="text-foreground">Run silence-fit</span> on the tab row
            above — it fills Costs and Accuracy (averages over n briefs). A new run
            clears the previous batch.
          </p>
        </section>
      ) : null}

      {adminTab === "calibrate" && activeModeFilter === "single" ? (
      <section className="rounded-2xl border border-border p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">Single-call comparison</h2>
            <p className="mt-1 text-xs text-muted">
              Uses the same n briefs as sectioned calibration. Each run clears the previous
              single-call batch (tables stay per-run). Then head-to-head vs sectioned.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <button
            type="button"
            disabled={singleCalibrating || comparing || calibrating}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void runSingleCallBatch();
            }}
          >
            {singleCalibrating ? "Calibrating…" : "Run single-call calibration"}
          </button>
          <button
            type="button"
            disabled={
              singleCalibrating ||
              comparing ||
              calibrating ||
              !modelHasFactors(
                safeScriptGeneration,
                safeScriptGeneration.scriptModelId,
              ) ||
              !modelHasSingleCallFactors(
                safeScriptGeneration,
                safeScriptGeneration.scriptModelId,
              )
            }
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setComparing(true);
                setSingleError(null);
                setCompareTable(null);
                setComparePairs([]);
                const deliveries = ["casual", "guided", "open_sits"] as const;
                const minutes = [5, 10, 20] as const;
                const briefs = activeCalibrationBriefs(scriptGeneration);
                const modelId = scriptGeneration.scriptModelId;
                const total = deliveries.length * minutes.length * briefs.length;
                const cellKey = (d: string, m: number, b: number) =>
                  `${d}|${m}|${b}`;
                try {
                  const progress = await postAdminVoice<{
                    completedKeys?: string[];
                  }>({
                    action: "get-script-mode-comparison",
                    modelId,
                  });
                  const done = new Set(
                    (progress.completedKeys ?? []).filter((k) => {
                      const parts = k.split("|");
                      const bi = Number(parts[2]);
                      return Number.isFinite(bi) && bi < briefs.length;
                    }),
                  );
                  let n = 0;
                  for (const delivery of deliveries) {
                    for (const m of minutes) {
                      for (let briefIndex = 0; briefIndex < briefs.length; briefIndex++) {
                        n += 1;
                        const key = cellKey(delivery, m, briefIndex);
                        if (done.has(key)) continue;
                        setCompareProgress(
                          `Compare ${n} of ${total} (n=${briefs.length}) · ${DELIVERY_LABEL[delivery]} · ${m} min · brief ${briefIndex + 1} (2 scripts)`,
                        );
                        await postAdminVoice({
                          action: "compare-script-modes-cell",
                          modelId,
                          delivery,
                          minutes: m,
                          briefIndex,
                        });
                        done.add(key);
                      }
                    }
                  }
                  setCompareProgress("Building table…");
                  const finalized = await postAdminVoice<{
                    table: NonNullable<typeof compareTable>;
                    pairs: typeof comparePairs;
                  }>({
                    action: "compare-script-modes-finalize",
                    modelId,
                  });
                  setCompareTable(finalized.table ?? null);
                  setComparePairs(finalized.pairs ?? []);
                  setCompareProgress("Comparison done");
                } catch (e) {
                  setSingleError(
                    e instanceof Error ? e.message : "Comparison failed",
                  );
                  setCompareProgress(null);
                } finally {
                  setComparing(false);
                }
              })();
            }}
          >
            {comparing ? "Comparing…" : "Run comparison"}
          </button>
          <button
            type="button"
            disabled={singleCalibrating || comparing}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setSingleError(null);
                try {
                  const saved = await postAdminVoice<{
                    scriptGeneration?: ScriptGenerationSettings;
                  }>({
                    action: "save-script-write-modes",
                    scriptWriteMode: scriptGeneration.scriptWriteMode,
                    userScriptFidelityCheck:
                      scriptGeneration.userScriptFidelityCheck === true,
                  });
                  if (saved.scriptGeneration) {
                    setScriptGeneration(
                      coerceScriptGenerationSettings(saved.scriptGeneration),
                    );
                  }
                } catch (e) {
                  setSingleError(
                    e instanceof Error ? e.message : "Could not save mode",
                  );
                }
              })();
            }}
          >
            Save mode
          </button>
        </div>
        {singleError ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">{singleError}</p>
        ) : null}
        {singleProgress ? (
          <p className="mt-2 text-xs text-muted">{singleProgress}</p>
        ) : null}
        {compareProgress ? (
          <p className="mt-2 text-xs text-muted">{compareProgress}</p>
        ) : null}
        {!modelHasSingleCallFactors(
          safeScriptGeneration,
          safeScriptGeneration.scriptModelId,
        ) ? (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Single-call factors not calibrated for this model yet.
          </p>
        ) : null}

        {/* Production mode moved to Settings tab.
        <div className="mt-4">
          <h3 className="text-sm font-medium text-foreground">Production mode</h3>
          ...
        </div>
        */}

        {singleSummary.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Single-call calibration (before factors)
            </h3>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium">Words vs target</th>
                  <th className="py-2 pr-3 font-medium">Pauses vs plan</th>
                  <th className="py-2 pr-3 font-medium">Word factor</th>
                  <th className="py-2 pr-3 font-medium">Pause factor</th>
                </tr>
              </thead>
              <tbody>
                {singleSummary.map((row) => (
                  <tr
                    key={`sc-${row.delivery}-${row.minutes}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">
                      {DELIVERY_LABEL[row.delivery as DeliveryId] ?? row.delivery}
                    </td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3">{fmtPct(row.wordsPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.pausesPct, true)}</td>
                    <td className="py-2 pr-3">{row.wordFactor.toFixed(2)}</td>
                    <td className="py-2 pr-3">{row.pauseFactor.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {singleFactorSpread.filter((r) => r.scripts > 0).length > 0 ? (
              <div className="mt-4">
                <h3 className="mb-1 text-sm font-medium text-foreground">
                  Single-call word-factor spread by brief
                </h3>
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Delivery</th>
                      <th className="py-2 pr-3 font-medium">Length</th>
                      <th className="py-2 pr-3 font-medium">n</th>
                      <th className="py-2 pr-3 font-medium">Pooled</th>
                      <th className="py-2 pr-3 font-medium">Min</th>
                      <th className="py-2 pr-3 font-medium">Median</th>
                      <th className="py-2 pr-3 font-medium">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {singleFactorSpread
                      .filter((row) => row.scripts > 0)
                      .map((row) => (
                        <tr
                          key={`sc-spread-${row.delivery}-${row.minutes}`}
                          className="border-b border-border last:border-0 text-foreground"
                        >
                          <td className="py-2 pr-3">
                            {DELIVERY_LABEL[row.delivery as DeliveryId] ??
                              row.delivery}
                          </td>
                          <td className="py-2 pr-3">{row.minutes} min</td>
                          <td className="py-2 pr-3">{row.scripts}</td>
                          <td className="py-2 pr-3">
                            {row.pooledWordFactor.toFixed(2)}
                          </td>
                          <td className="py-2 pr-3">
                            {row.wordMin != null ? row.wordMin.toFixed(2) : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {row.wordMedian != null
                              ? row.wordMedian.toFixed(2)
                              : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            {row.wordMax != null ? row.wordMax.toFixed(2) : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {singleScriptFactors.length > 0 ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="text-xs text-muted underline"
                      onClick={() => setShowSingleScriptFactors((v) => !v)}
                    >
                      {showSingleScriptFactors
                        ? "Hide per-brief factors"
                        : "Show per-brief factors"}
                    </button>
                    {showSingleScriptFactors ? (
                      <table className="mt-2 w-full min-w-[800px] text-left text-sm">
                        <thead className="text-xs text-muted">
                          <tr className="border-b border-border">
                            <th className="py-2 pr-3 font-medium">Delivery</th>
                            <th className="py-2 pr-3 font-medium">Length</th>
                            <th className="py-2 pr-3 font-medium">Brief</th>
                            <th className="py-2 pr-3 font-medium">
                              Written / target
                            </th>
                            <th className="py-2 pr-3 font-medium">Word factor</th>
                            <th className="py-2 pr-3 font-medium">
                              Pause factor
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {singleScriptFactors.map((row) => (
                            <tr
                              key={`sc-sf-${row.delivery}-${row.minutes}-${row.briefIndex}`}
                              className="border-b border-border last:border-0 text-foreground"
                            >
                              <td className="py-2 pr-3">
                                {DELIVERY_LABEL[row.delivery as DeliveryId] ??
                                  row.delivery}
                              </td>
                              <td className="py-2 pr-3">{row.minutes} min</td>
                              <td className="py-2 pr-3 max-w-[280px] text-xs">
                                #{row.briefIndex + 1} {row.brief.slice(0, 80)}
                                {row.brief.length > 80 ? "…" : ""}
                              </td>
                              <td className="py-2 pr-3 text-xs">
                                {row.writtenWords} / {row.targetWords}
                              </td>
                              <td className="py-2 pr-3">
                                {row.wordFactor != null
                                  ? row.wordFactor.toFixed(2)
                                  : "—"}
                              </td>
                              <td className="py-2 pr-3">
                                {row.pauseFactor != null
                                  ? row.pauseFactor.toFixed(2)
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {compareTable ? (
          <div className="mt-4 overflow-x-auto">
            <h3 className="mb-2 text-sm font-medium text-foreground">
              Head-to-head (factors on)
            </h3>
            <p className="mb-2 text-xs text-muted">
              Single call within ±10% length: {compareTable.singleWithin10Share}% · avg |Δ|
              {compareTable.singleAvgAbsLength}% · Sectioned:{" "}
              {compareTable.sectionedWithin10Share}% · avg |Δ|
              {compareTable.sectionedAvgAbsLength}%
            </p>
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Length · Delivery</th>
                  <th className="py-2 pr-3 font-medium">Single words</th>
                  <th className="py-2 pr-3 font-medium">Sectioned words</th>
                  <th className="py-2 pr-3 font-medium">Single pauses</th>
                  <th className="py-2 pr-3 font-medium">Sectioned pauses</th>
                  <th className="py-2 pr-3 font-medium">Single predicted total</th>
                  <th className="py-2 pr-3 font-medium">Sectioned predicted total</th>
                  <th className="py-2 pr-3 font-medium">Single ±10%</th>
                  <th className="py-2 pr-3 font-medium">Sectioned ±10%</th>
                </tr>
              </thead>
              <tbody>
                {compareTable.rows.map((row) => (
                  <tr
                    key={`cmp-${row.delivery}-${row.minutes}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">
                      {row.minutes} · {DELIVERY_LABEL[row.delivery]}
                    </td>
                    <td className="py-2 pr-3">
                      {row.singleWordsAvg} ({row.singleWordsRange})
                    </td>
                    <td className="py-2 pr-3">
                      {row.sectionedWordsAvg} ({row.sectionedWordsRange})
                    </td>
                    <td className="py-2 pr-3">{row.singlePausesAvg}</td>
                    <td className="py-2 pr-3">{row.sectionedPausesAvg}</td>
                    <td className="py-2 pr-3">
                      {row.singlePredictedTotal ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {row.sectionedPredictedTotal ?? "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {row.singleWithin10}/{row.of}
                    </td>
                    <td className="py-2 pr-3">
                      {row.sectionedWithin10}/{row.of}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {comparePairs.length > 0 ? (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-foreground">Open scripts</h3>
            <ul className="space-y-1 text-sm">
              {comparePairs.map((p) => (
                <li
                  key={`pair-${p.delivery}-${p.minutes}-${p.briefIndex}`}
                  className="flex flex-wrap gap-2 text-foreground"
                >
                  <span className="text-muted">
                    {DELIVERY_LABEL[p.delivery]} · {p.minutes} · brief {p.briefIndex + 1}
                  </span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setOpenScript({
                        title: `Single · ${DELIVERY_LABEL[p.delivery]} · ${p.minutes}m · brief ${p.briefIndex + 1}`,
                        text: p.single.scriptText,
                      })
                    }
                  >
                    Single ({fmtPct(p.single.wordsPct, true)} words,{" "}
                    {fmtPct(p.single.lengthPct, true)} length)
                  </button>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setOpenScript({
                        title: `Sectioned · ${DELIVERY_LABEL[p.delivery]} · ${p.minutes}m · brief ${p.briefIndex + 1}`,
                        text: p.sectioned.scriptText,
                      })
                    }
                  >
                    Sectioned ({fmtPct(p.sectioned.wordsPct, true)} words,{" "}
                    {fmtPct(p.sectioned.lengthPct, true)} length)
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {openScript ? (
          <div className="mt-4 rounded-xl border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-medium text-foreground">{openScript.title}</h4>
              <button
                type="button"
                className="text-xs text-muted underline"
                onClick={() => setOpenScript(null)}
              >
                Close
              </button>
            </div>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-foreground">
              {openScript.text}
            </pre>
          </div>
        ) : null}
      </section>
      ) : null}

      {adminTab === "preview" ? (
      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-foreground">Length preview</h2>
        <p className="mt-1 text-xs text-muted">
          Generate a script (no audio) and see predicted total length per voice, including
          lead-in, title, gap and fade-out. ±10% is vs the requested session length.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block text-sm text-foreground">
            <span className="mb-1 block text-muted">Delivery</span>
            <select
              value={previewDeliveryId}
              onChange={(e) =>
                setPreviewDeliveryId(e.target.value as DeliveryId)
              }
              className="rounded-xl border border-border bg-background px-2 py-1.5"
            >
              {(["casual", "guided", "open_sits"] as const).map((id) => (
                <option key={id} value={id}>
                  {DELIVERY_LABEL[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-foreground">
            <span className="mb-1 block text-muted">Length</span>
            <select
              value={previewMinutes}
              onChange={(e) =>
                setPreviewMinutes(Number(e.target.value) as 5 | 10 | 20)
              }
              className="rounded-xl border border-border bg-background px-2 py-1.5"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </label>
          <label className="block text-sm text-foreground">
            <span className="mb-1 block text-muted">Mode</span>
            <select
              value={previewMode}
              onChange={(e) =>
                setPreviewMode(e.target.value as ScriptWriteMode | "auto")
              }
              className="rounded-xl border border-border bg-background px-2 py-1.5"
            >
              <option value="auto">Production default</option>
              <option value="sections">Sectioned</option>
              <option value="single">Single call (legacy)</option>
              <option value="time">Time-based</option>
              <option value="silence">Silence-fit</option>
              <option value="silence_haiku">Silence-fit + Haiku</option>
              <option value="silence_words">Silence-fit · words</option>
              <option value="silence_words_haiku">
                Silence-fit · words + Haiku
              </option>
            </select>
          </label>
          <button
            type="button"
            disabled={previewBusy}
            className="rounded-xl border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setPreviewBusy(true);
                setPreviewError(null);
                try {
                  const brief =
                    previewBrief.trim() ||
                    scriptGeneration.comparisonBriefs[0] ||
                    scriptGeneration.calibrationBriefs[0] ||
                    "";
                  const data = await postAdminVoice<{
                    preview: NonNullable<typeof previewResult>;
                    avgAbsPredictionErrorPct: number | null;
                  }>({
                    action: "length-preview",
                    modelId: scriptGeneration.scriptModelId,
                    delivery: previewDeliveryId,
                    minutes: previewMinutes,
                    ...(previewMode === "auto" ? {} : { mode: previewMode }),
                    brief,
                  });
                  setPreviewResult(data.preview);
                  setPreviewAvgError(data.avgAbsPredictionErrorPct ?? null);
                } catch (e) {
                  setPreviewError(
                    e instanceof Error ? e.message : "Preview failed",
                  );
                } finally {
                  setPreviewBusy(false);
                }
              })();
            }}
          >
            {previewBusy ? "Generating…" : "Generate script"}
          </button>
        </div>
        <label className="mt-3 block text-sm text-foreground">
          <span className="mb-1 block text-muted">Brief (optional — defaults to a stored test brief)</span>
          <textarea
            value={previewBrief}
            rows={2}
            onChange={(e) => setPreviewBrief(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-2 py-1.5 text-foreground"
          />
        </label>
        {previewError ? (
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">{previewError}</p>
        ) : null}
        {previewAvgError != null ? (
          <p className="mt-2 text-xs text-muted">
            Average |prediction − actual| when audio was logged: {previewAvgError}%
          </p>
        ) : null}
        {previewResult ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-muted">
              Mode: {previewResult.mode} · words {previewResult.writtenWords}/
              {previewResult.targetWords} · pauses {previewResult.writtenPauseSeconds}/
              {previewResult.plannedPauseSeconds}s · pause scale{" "}
              {previewResult.pauseScale} · script target{" "}
              {previewResult.clocks?.scriptTarget ?? "—"} · around{" "}
              {previewResult.clocks?.aroundTotal ?? "—"} (lead{" "}
              {previewResult.clocks?.leadIn}, title speech{" "}
              {previewResult.clocks?.titleSpeech}, title pauses{" "}
              {previewResult.clocks?.titlePauses}, fade{" "}
              {previewResult.clocks?.fadeOut}) · median predicted{" "}
              {fmtPct(previewResult.medianPctVsRequested, true)}
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-border p-3 text-xs text-foreground">
              {previewResult.scriptWithHeaders || previewResult.scriptText}
            </pre>
            {previewResult.timePhases?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">Phase</th>
                      <th className="py-2 pr-3 font-medium tabular-nums">Header min</th>
                      <th className="py-2 pr-3 font-medium tabular-nums">Header sent.</th>
                      <th className="py-2 pr-3 font-medium tabular-nums">Actual sent.</th>
                      <th className="py-2 pr-3 font-medium tabular-nums">Words</th>
                      <th className="py-2 pr-3 font-medium tabular-nums">Speech</th>
                      <th className="py-2 font-medium tabular-nums">Pauses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewResult.timePhases.map((p) => (
                      <tr
                        key={`${p.name}-${p.headerMinutes}`}
                        className="border-b border-border last:border-0 text-foreground"
                      >
                        <td className="py-2 pr-3">{p.name}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.headerMinutes}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.headerSentences}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.actualSentences}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.words}</td>
                        <td className="py-2 pr-3 tabular-nums">{p.speechSeconds}s</td>
                        <td className="py-2 tabular-nums">{p.pauseSeconds}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Voice</th>
                    <th className="py-2 pr-3 font-medium">Effective WPM</th>
                    <th className="py-2 pr-3 font-medium">Script part</th>
                    <th className="py-2 pr-3 font-medium">Predicted total</th>
                    <th className="py-2 pr-3 font-medium">vs requested</th>
                  </tr>
                </thead>
                <tbody>
                  {previewResult.voices.map((v) => (
                    <tr
                      key={v.name}
                      className={`border-b border-border last:border-0 ${
                        v.within10
                          ? "text-foreground"
                          : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                      }`}
                    >
                      <td className="py-2 pr-3">{v.name}</td>
                      <td className="py-2 pr-3">{v.effectiveWpm}</td>
                      <td className="py-2 pr-3">
                        {Math.floor(v.scriptPartSeconds / 60)}:
                        {String(v.scriptPartSeconds % 60).padStart(2, "0")}
                      </td>
                      <td className="py-2 pr-3">
                        {Math.floor(v.predictedTotalSeconds / 60)}:
                        {String(v.predictedTotalSeconds % 60).padStart(2, "0")}
                      </td>
                      <td className="py-2 pr-3">
                        {fmtPct(v.pctVsRequested, true)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {adminTab === "accuracy" && isSilenceFamily ? (
        <section className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">
                Length accuracy ·{" "}
                {isSilenceWordsHaiku
                  ? "silence-fit · words + Haiku"
                  : showsHaikuCols
                  ? "silence-fit + Haiku"
                  : usesWordsBudget
                    ? "silence-fit · words"
                    : "silence-fit"}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {silenceAccuracySummary
                  ? `${silenceAccuracySummary.scripts} scripts · ${silenceAccuracySummary.withinTolerance} within tolerance · ${silenceAccuracySummary.insideSpeakingBand} in speaking band · avg miss ${fmtPct(silenceAccuracySummary.avgMissAfterPct)} · largest ${fmtPct(silenceAccuracySummary.largestMissAfterPct, true)}${
                      showsHaikuCols &&
                      typeof silenceAccuracySummary.haikuRanCount === "number"
                        ? ` · Haiku ran on ${silenceAccuracySummary.haikuRanCount} of ${silenceAccuracySummary.scripts} scripts`
                        : ""
                    }`
                  : `Use Run ${
                      isSilenceWordsHaiku
                        ? "silence-fit · words + Haiku"
                        : showsHaikuCols
                        ? "silence-fit + Haiku"
                        : usesWordsBudget
                          ? "silence-fit · words"
                          : "silence-fit"
                    } on the tab row above to fill this table.`}{" "}
                Rows average over n briefs — click a row to expand each brief.
                Est. audio = pause-fixed script (median Speechify WPM × −20%) + ~10s
                pre + 20s post music.
              </p>
            </div>
            <button
              type="button"
              disabled={
                silenceLengthAccuracy.filter((r) => r.scripts > 0).length === 0
              }
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
              onClick={() => downloadSilenceAccuracyReport()}
              title="CSV with 9 averages plus every per-brief child row"
            >
              Download report
            </button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Meditation
                  </th>
                  {showsHaikuCols ? (
                    <>
                      <th className="py-2 pr-3 font-medium whitespace-nowrap">
                        Speech · Sonnet
                      </th>
                      <th className="py-2 pr-3 font-medium whitespace-nowrap">
                        Speech · after Haiku
                      </th>
                      <th className="py-2 pr-3 font-medium whitespace-nowrap">
                        Words · Sonnet
                      </th>
                      <th className="py-2 pr-3 font-medium whitespace-nowrap">
                        Words · after Haiku
                      </th>
                    </>
                  ) : (
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">
                      Speech
                    </th>
                  )}
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Band
                  </th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Before fit
                  </th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    After fit
                  </th>
                  {!showsHaikuCols && usesWordsBudget ? (
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">
                      Words vs budget
                    </th>
                  ) : null}
                  {showsHaikuCols ? (
                    <th className="py-2 pr-3 font-medium whitespace-nowrap">
                      Haiku
                    </th>
                  ) : null}
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Est. audio
                  </th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Fit step
                  </th>
                  <th className="py-2 font-medium whitespace-nowrap">Why</th>
                </tr>
              </thead>
              <tbody>
                {silenceLengthAccuracy.filter((r) => r.scripts > 0).length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={
                        showsHaikuCols ? 12 : usesWordsBudget ? 9 : 8
                      }
                      className="py-3 text-sm text-muted"
                    >
                      No{" "}
                      {isSilenceWordsHaiku
                        ? "silence-fit · words + Haiku"
                        : showsHaikuCols
                        ? "silence-fit + Haiku"
                        : usesWordsBudget
                          ? "silence-fit · words"
                          : "silence-fit"}{" "}
                      accuracy yet.
                    </td>
                  </tr>
                ) : (
                  silenceLengthAccuracy
                    .filter((r) => r.scripts > 0)
                    .flatMap((r) => {
                      const key = `sil-acc-${r.option}-${r.minutes}`;
                      const open = expandedSilenceAccuracyKey === key;
                      const missPct = (
                        predicted: number | null | undefined,
                        target: number | null | undefined,
                      ) => {
                        if (
                          typeof predicted !== "number" ||
                          typeof target !== "number" ||
                          !(target > 0)
                        ) {
                          return null;
                        }
                        return ((predicted - target) / target) * 100;
                      };
                      const speechPct =
                        typeof r.speechShare === "number"
                          ? Math.round(r.speechShare * 100)
                          : null;
                      const speechSonnetPct =
                        typeof r.speechShareSonnet === "number"
                          ? Math.round(r.speechShareSonnet * 100)
                          : speechPct;
                      const outsideBand =
                        speechPct != null &&
                        (speechPct < Math.round(r.speakingBandMin * 100) ||
                          speechPct > Math.round(r.speakingBandMax * 100));
                      const outsideAfter =
                        r.afterFitPct != null &&
                        Math.abs(r.afterFitPct) >
                          safeProfiles.shared.lengthTolerancePct;
                      const wordsSonnetAvgLabel =
                        typeof r.wordsVsBudgetSonnetPct === "number"
                          ? fmtPct(r.wordsVsBudgetSonnetPct, true)
                          : "—";
                      const wordsSonnetRange =
                        showsHaikuCols &&
                        r.scripts > 1 &&
                        typeof r.wordsVsBudgetSonnetMin === "number" &&
                        typeof r.wordsVsBudgetSonnetMax === "number"
                          ? `${fmtPct(r.wordsVsBudgetSonnetMin, true)} to ${fmtPct(r.wordsVsBudgetSonnetMax, true)}`
                          : null;
                      const wordsSonnetUnder =
                        showsHaikuCols &&
                        r.scripts > 1 &&
                        typeof r.wordsSonnetUnderCount === "number"
                          ? `${r.wordsSonnetUnderCount} of ${r.scripts} under`
                          : null;
                      const main = (
                        <tr
                          key={key}
                          className="cursor-pointer border-b border-border text-foreground hover:bg-muted/20"
                          onClick={() =>
                            setExpandedSilenceAccuracyKey(open ? null : key)
                          }
                        >
                          <td className="py-2 pr-3 whitespace-nowrap">
                            <span className="mr-1 text-xs text-muted">
                              {open ? "▾" : "▸"}
                            </span>
                            {r.label} {r.minutes}
                            {r.scripts > 1 ? (
                              <span className="ml-1 text-xs text-muted">
                                · n={r.scripts}
                              </span>
                            ) : null}
                          </td>
                          {showsHaikuCols ? (
                            <>
                              <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                                {speechSonnetPct == null
                                  ? "—"
                                  : `${speechSonnetPct}%`}
                              </td>
                              <td
                                className={`py-2 pr-3 tabular-nums whitespace-nowrap ${
                                  outsideBand
                                    ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                                    : ""
                                }`}
                              >
                                {speechPct == null ? "—" : `${speechPct}%`}
                              </td>
                              <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                                <div>
                                  {wordsSonnetAvgLabel}
                                  {wordsSonnetRange
                                    ? ` (${wordsSonnetRange})`
                                    : ""}
                                </div>
                                {wordsSonnetUnder ? (
                                  <div className="text-[11px] text-muted">
                                    {wordsSonnetUnder}
                                  </div>
                                ) : null}
                              </td>
                              <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                                {fmtPct(r.wordsVsBudgetPct, true)}
                              </td>
                            </>
                          ) : (
                            <td
                              className={`py-2 pr-3 tabular-nums whitespace-nowrap ${
                                outsideBand
                                  ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                                  : ""
                              }`}
                            >
                              {speechPct == null ? "—" : `${speechPct}%`}
                            </td>
                          )}
                          <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                            {Math.round(r.speakingBandMin * 100)}–
                            {Math.round(r.speakingBandMax * 100)}%
                          </td>
                          <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                            {fmtPct(r.beforeFitPct, true)}
                          </td>
                          <td
                            className={`py-2 pr-3 tabular-nums whitespace-nowrap ${
                              outsideAfter
                                ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                                : ""
                            }`}
                          >
                            {fmtPct(r.afterFitPct, true)}
                          </td>
                          {!showsHaikuCols && usesWordsBudget ? (
                            <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                              {fmtPct(r.wordsVsBudgetPct, true)}
                            </td>
                          ) : null}
                          {showsHaikuCols ? (
                            <td className="py-2 pr-3 whitespace-nowrap text-xs">
                              {typeof r.haikuRanCount === "number" &&
                              r.scripts > 0
                                ? `${r.haikuRanCount} of ${r.scripts}`
                                : "—"}
                            </td>
                          ) : null}
                          <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                            {fmtClock(r.estimatedTotalAudioSeconds)}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {silenceFitStepLabel(r.fitStep)}
                          </td>
                          <td className="py-2 whitespace-nowrap text-xs">
                            {r.why?.trim() || ""}
                          </td>
                        </tr>
                      );
                      if (!open) return [main];
                      const details = r.scriptsDetail ?? [];
                      if (details.length === 0) {
                        return [
                          main,
                          <tr
                            key={`${key}-empty`}
                            className="border-b border-border"
                          >
                            <td
                              colSpan={
                                showsHaikuCols ? 12 : usesWordsBudget ? 9 : 8
                              }
                              className="bg-muted/10 px-3 py-2 text-xs text-muted"
                            >
                              No per-brief detail stored — re-run{" "}
                              {isSilenceWordsHaiku
                                ? "silence-fit · words + Haiku"
                                : showsHaikuCols
                                ? "silence-fit + Haiku"
                                : usesWordsBudget
                                  ? "silence-fit · words"
                                  : "silence-fit"}
                              .
                            </td>
                          </tr>,
                        ];
                      }
                      const bandMin = Math.round(r.speakingBandMin * 100);
                      const bandMax = Math.round(r.speakingBandMax * 100);
                      const children = details.map((s) => {
                        const childSpeechPct =
                          typeof s.speechShare === "number"
                            ? Math.round(s.speechShare * 100)
                            : null;
                        const childSpeechSonnetPct =
                          typeof s.speechShareSonnet === "number"
                            ? Math.round(s.speechShareSonnet * 100)
                            : childSpeechPct;
                        const childOutsideBand =
                          childSpeechPct != null &&
                          (childSpeechPct < bandMin ||
                            childSpeechPct > bandMax);
                        const beforePct = missPct(
                          s.predictedSecondsBefore,
                          s.targetSeconds,
                        );
                        const afterPct = missPct(
                          s.predictedSecondsAfter,
                          s.targetSeconds,
                        );
                        const childOutsideAfter =
                          afterPct != null &&
                          Math.abs(afterPct) >
                            safeProfiles.shared.lengthTolerancePct;
                        const estAudio =
                          typeof s.estimatedTotalAudioSeconds === "number"
                            ? s.estimatedTotalAudioSeconds
                            : typeof s.predictedSecondsAfter === "number"
                              ? s.predictedSecondsAfter + 30
                              : null;
                        return (
                          <tr
                            key={`${key}-b${s.briefIndex}`}
                            className="border-b border-border/60 bg-muted/10 text-foreground"
                          >
                            <td className="py-1.5 pr-3 pl-6 whitespace-nowrap text-xs text-muted">
                              Brief {s.briefIndex + 1}
                            </td>
                            {showsHaikuCols ? (
                              <>
                                <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs">
                                  {childSpeechSonnetPct == null
                                    ? "—"
                                    : `${childSpeechSonnetPct}%`}
                                </td>
                                <td
                                  className={`py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs ${
                                    childOutsideBand
                                      ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                                      : ""
                                  }`}
                                >
                                  {childSpeechPct == null
                                    ? "—"
                                    : `${childSpeechPct}%`}
                                </td>
                                <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs">
                                  {fmtPct(s.wordsVsBudgetSonnetPct, true)}
                                </td>
                                <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs">
                                  {fmtPct(s.wordsVsBudgetPct, true)}
                                </td>
                              </>
                            ) : (
                              <td
                                className={`py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs ${
                                  childOutsideBand
                                    ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                                    : ""
                                }`}
                              >
                                {childSpeechPct == null
                                  ? "—"
                                  : `${childSpeechPct}%`}
                              </td>
                            )}
                            <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs text-muted">
                              {bandMin}–{bandMax}%
                            </td>
                            <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs">
                              {fmtPct(beforePct, true)}
                            </td>
                            <td
                              className={`py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs ${
                                childOutsideAfter
                                  ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                                  : ""
                              }`}
                            >
                              {fmtPct(afterPct, true)}
                            </td>
                            {!showsHaikuCols && usesWordsBudget ? (
                              <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs">
                                {fmtPct(s.wordsVsBudgetPct, true)}
                              </td>
                            ) : null}
                            {showsHaikuCols ? (
                              <td className="py-1.5 pr-3 whitespace-nowrap text-xs">
                                {s.haikuRan
                                  ? `${s.phasesFixed ?? 0} of ${(s.phaseResults ?? []).filter((p) => p.attempted).length || "—"}`
                                  : "—"}
                              </td>
                            ) : null}
                            <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap text-xs">
                              {fmtClock(estAudio)}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap text-xs">
                              {silenceFitStepLabel(s.fitStep)}
                            </td>
                            <td className="py-1.5 text-xs text-muted">
                              {s.why?.trim() || ""}
                              {typeof s.ordinaryPauseCount === "number" ||
                              typeof s.extendablePauseCount === "number" ||
                              typeof s.namedMarkersUsed === "number" ? (
                                <div className="mt-1 text-[11px] text-muted">
                                  Ordinary pauses: {s.ordinaryPauseCount ?? "—"}
                                  {s.ordinaryPauseAverageSeconds != null
                                    ? ` (avg ${s.ordinaryPauseAverageSeconds}s`
                                    : ""}
                                  {s.ordinaryPauseLongestSeconds != null &&
                                  s.ordinaryPauseAverageSeconds != null
                                    ? `, longest ${s.ordinaryPauseLongestSeconds}s)`
                                    : s.ordinaryPauseAverageSeconds != null
                                      ? ")"
                                      : ""}
                                  {" · "}
                                  Extendable: {s.extendablePauseCount ?? "—"}
                                  {s.extendablePauseTotalSeconds != null
                                    ? ` (total ${s.extendablePauseTotalSeconds}s)`
                                    : ""}
                                  {" · "}
                                  Named markers used: {s.namedMarkersUsed ?? 0}
                                  {(s.namedMarkersUsed ?? 0) > 0
                                    ? " · named pauses"
                                    : ""}
                                </div>
                              ) : null}
                              {showsHaikuCols && s.haikuRan ? (
                                <div className="mt-1 space-y-1 text-[11px] text-muted">
                                  <div>
                                    total words {s.wordsBeforeHaiku ?? "—"}→
                                    {s.wordsAfterHaiku ?? "—"}
                                  </div>
                                  {(s.phaseResults ?? [])
                                    .filter((p) => p.attempted)
                                    .map((p) => {
                                      const rejectKey = `${key}-b${s.briefIndex}-p${p.phaseIndex}`;
                                      const showReject =
                                        expandedHaikuRejectKey === rejectKey;
                                      return (
                                        <div
                                          key={p.phaseIndex}
                                          className="border-t border-border/40 pt-1"
                                        >
                                          <div>
                                            {p.phaseName}: {p.wordsBefore}→
                                            {p.wordsAfter}→{p.wordTarget} ·{" "}
                                            {p.accepted
                                              ? "kept Haiku"
                                              : `rejected${
                                                  p.rejectReason
                                                    ? ` (${p.rejectReason})`
                                                    : ""
                                                }`}
                                          </div>
                                          {!p.accepted && p.haikuText ? (
                                            <>
                                              <button
                                                type="button"
                                                className="mt-0.5 text-[11px] text-foreground/80 underline-offset-2 hover:underline"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setExpandedHaikuRejectKey(
                                                    showReject
                                                      ? null
                                                      : rejectKey,
                                                  );
                                                }}
                                              >
                                                {showReject
                                                  ? "Hide Haiku text"
                                                  : "Show Haiku text"}
                                              </button>
                                              {showReject ? (
                                                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border/50 bg-background/80 p-2 text-[10px] text-foreground">
                                                  {p.haikuText}
                                                </pre>
                                              ) : null}
                                            </>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        );
                      });
                      return [main, ...children];
                    })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {adminTab === "accuracy" && activeModeFilter === "time" ? (
        <>
        {/* Outside length tolerance — counts only; replaced by Length accuracy · time-based
        <section className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">
                Outside length tolerance
              </h2>
              <p className="mt-1 text-xs text-muted">
                One Claude call only — if extendable pauses can&apos;t land within tolerance,
                the script is kept as-is. Rate from time-based cost cells.
              </p>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Scripts</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Outside</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Outside %</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Too short</th>
                  <th className="py-2 font-medium tabular-nums">Too long</th>
                </tr>
              </thead>
              <tbody>
                {timeLengthTolerance.filter((r) => r.scripts > 0).map((r) => (
                  <tr key={`tol-${r.delivery}-${r.minutes}`}>
                    <td className="py-2 pr-3">{DELIVERY_LABEL[r.delivery]}</td>
                    <td className="py-2 pr-3">{r.minutes} min</td>
                    <td className="py-2 pr-3 tabular-nums">{r.scripts}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.outsideCount}</td>
                    <td className="py-2 pr-3 tabular-nums">{fmtPct(r.outsidePct)}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.tooShort}</td>
                    <td className="py-2 tabular-nums">{r.tooLong}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        */}
        <section className="rounded-2xl border border-border p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground">
                Length accuracy · time-based
              </h2>
              <p className="mt-1 text-xs text-muted">
                {(() => {
                  const rows = timeLengthAccuracy.filter((r) => r.scripts > 0);
                  const ns = [...new Set(rows.map((r) => r.scripts))];
                  const nLabel =
                    ns.length === 1
                      ? `${ns[0]} script${ns[0] === 1 ? "" : "s"} per row`
                      : "Click a row for detail";
                  return `${nLabel}. Older cells without snapshots show —.`;
                })()}
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:text-foreground"
              onClick={() => {
                void (async () => {
                  try {
                    const timeRes = await postAdminVoice<{
                      sentenceAccuracy?: typeof timeSentenceAccuracy;
                      lengthToleranceAccuracy?: typeof timeLengthTolerance;
                      lengthAccuracy?: TimeLengthAccuracyRow[];
                    }>({
                      action: "get-time-based-calibration",
                      modelId: scriptGeneration.scriptModelId,
                    });
                    setTimeSentenceAccuracy(timeRes.sentenceAccuracy ?? []);
                    setTimeLengthTolerance(
                      timeRes.lengthToleranceAccuracy ?? [],
                    );
                    setTimeLengthAccuracy(timeRes.lengthAccuracy ?? []);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Failed to load time accuracy",
                    );
                  }
                })();
              }}
            >
              Refresh
            </button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Meditation
                  </th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Written
                  </th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    After fit
                  </th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Words vs guide
                  </th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Silence
                  </th>
                  <th className="py-2 pr-3 font-medium whitespace-nowrap">
                    Range
                  </th>
                  <th className="py-2 font-medium whitespace-nowrap">Why</th>
                </tr>
              </thead>
              <tbody>
                {timeLengthAccuracy.filter((r) => r.scripts > 0).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-3 text-sm text-muted">
                      No time-based length stats yet — run Costs → Time-based costs.
                    </td>
                  </tr>
                ) : (
                  timeLengthAccuracy
                    .filter((r) => r.scripts > 0)
                    .flatMap((r) => {
                      const key = `len-${r.delivery}-${r.minutes}`;
                      const open = expandedLengthAccuracyKey === key;
                      const writtenPct = pctVsTarget(
                        r.predictedSecondsBefore,
                        r.targetSeconds,
                      );
                      const afterPct = pctVsTarget(
                        r.predictedSecondsAfter,
                        r.targetSeconds,
                      );
                      const outsideAfter =
                        r.outsideCount > 0 ||
                        (afterPct != null &&
                          Math.abs(afterPct) > (r.lengthTolerancePct ?? 10));
                      const silencePct =
                        typeof r.silenceShareAfter === "number"
                          ? Math.round(r.silenceShareAfter * 100)
                          : null;
                      const rangeMin =
                        typeof r.spaceRangeMin === "number"
                          ? Math.round(r.spaceRangeMin * 100)
                          : null;
                      const rangeMax =
                        typeof r.spaceRangeMax === "number"
                          ? Math.round(r.spaceRangeMax * 100)
                          : null;
                      const wordsPct = pctVsTarget(
                        r.words,
                        r.roughSpeechWords,
                      );
                      const whyShort = shortLengthWhy(r.why);
                      const main = (
                        <tr
                          key={key}
                          className="border-b border-border text-foreground cursor-pointer"
                          onClick={() =>
                            setExpandedLengthAccuracyKey(open ? null : key)
                          }
                        >
                          <td className="py-2 pr-3 whitespace-nowrap">
                            {DELIVERY_LABEL[r.delivery]} {r.minutes}
                          </td>
                          <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                            {fmtPct(writtenPct, true)}
                          </td>
                          <td
                            className={`py-2 pr-3 tabular-nums whitespace-nowrap ${
                              outsideAfter
                                ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
                                : ""
                            }`}
                          >
                            {fmtPct(afterPct, true)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                            {fmtPct(wordsPct, true)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                            {silencePct == null ? "—" : `${silencePct}%`}
                          </td>
                          <td className="py-2 pr-3 tabular-nums whitespace-nowrap">
                            {rangeMin != null && rangeMax != null
                              ? `${rangeMin}–${rangeMax}%`
                              : "—"}
                          </td>
                          <td className="py-2 whitespace-nowrap text-xs">
                            {whyShort}
                          </td>
                        </tr>
                      );
                      if (!open) return [main];
                      const detail = (
                        <tr key={`${key}-detail`} className="border-b border-border">
                          <td colSpan={7} className="bg-muted/20 px-3 py-3">
                            {(r.scriptsDetail ?? []).length === 0 ? (
                              <div className="space-y-2">
                                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-foreground">
                                  <dt className="text-muted">Target</dt>
                                  <dd className="tabular-nums">
                                    {fmtClock(r.targetSeconds)}
                                  </dd>
                                  <dt className="text-muted">As written</dt>
                                  <dd className="tabular-nums">
                                    {fmtClockVsTarget(
                                      r.predictedSecondsBefore,
                                      r.targetSeconds,
                                    )}
                                  </dd>
                                  <dt className="text-muted">After fit</dt>
                                  <dd className="tabular-nums">
                                    {fmtClockVsTarget(
                                      r.predictedSecondsAfter,
                                      r.targetSeconds,
                                    )}
                                  </dd>
                                  <dt className="text-muted">Speech</dt>
                                  <dd className="tabular-nums">
                                    {fmtClock(r.speechSeconds)}
                                  </dd>
                                  <dt className="text-muted">Words</dt>
                                  <dd className="tabular-nums">
                                    {r.words == null
                                      ? "—"
                                      : `${Math.round(r.words).toLocaleString()} / ${
                                          r.roughSpeechWords != null
                                            ? Math.round(
                                                r.roughSpeechWords,
                                              ).toLocaleString()
                                            : "—"
                                        }`}
                                  </dd>
                                  <dt className="text-muted">Extendable</dt>
                                  <dd className="tabular-nums">
                                    {r.extendableCount == null
                                      ? "—"
                                      : `${Math.round(r.extendableCount)} · ${fmtClock(
                                          r.extendableSecondsBefore,
                                        )} → ${fmtClock(
                                          r.extendableSecondsAfter,
                                        )}`}
                                  </dd>
                                  <dt className="text-muted">Sentence budget</dt>
                                  <dd className="tabular-nums">—</dd>
                                  <dt className="text-muted">Header total</dt>
                                  <dd className="tabular-nums">—</dd>
                                  <dt className="text-muted">Written</dt>
                                  <dd className="tabular-nums">—</dd>
                                </dl>
                                <p className="text-xs text-muted">
                                  No per-script phase detail — re-run time-based
                                  costs.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-4">
                                {(r.scriptsDetail ?? []).map((s) => (
                                  <div key={`${key}-b${s.briefIndex}`}>
                                    <p className="mb-2 text-xs font-medium text-foreground">
                                      Brief {s.briefIndex + 1}
                                      {shortLengthWhy(s.why)
                                        ? ` · ${shortLengthWhy(s.why)}`
                                        : ""}
                                    </p>
                                    <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-foreground">
                                      <dt className="text-muted">Target</dt>
                                      <dd className="tabular-nums">
                                        {fmtClock(s.targetSeconds ?? r.targetSeconds)}
                                      </dd>
                                      <dt className="text-muted">As written</dt>
                                      <dd className="tabular-nums">
                                        {fmtClockVsTarget(
                                          s.predictedSecondsBefore ??
                                            r.predictedSecondsBefore,
                                          s.targetSeconds ?? r.targetSeconds,
                                        )}
                                      </dd>
                                      <dt className="text-muted">After fit</dt>
                                      <dd className="tabular-nums">
                                        {fmtClockVsTarget(
                                          s.predictedSecondsAfter ??
                                            r.predictedSecondsAfter,
                                          s.targetSeconds ?? r.targetSeconds,
                                        )}
                                      </dd>
                                      <dt className="text-muted">Speech</dt>
                                      <dd className="tabular-nums">
                                        {fmtClock(
                                          s.speechSeconds ?? r.speechSeconds,
                                        )}
                                      </dd>
                                      <dt className="text-muted">Words</dt>
                                      <dd className="tabular-nums">
                                        {(() => {
                                          const w = s.words ?? r.words;
                                          const g =
                                            s.roughSpeechWords ??
                                            r.roughSpeechWords;
                                          if (w == null) return "—";
                                          return `${Math.round(w).toLocaleString()} / ${
                                            g != null
                                              ? Math.round(g).toLocaleString()
                                              : "—"
                                          }`;
                                        })()}
                                      </dd>
                                      <dt className="text-muted">Ordinary pauses</dt>
                                      <dd className="tabular-nums">
                                        {s.ordinaryPauseCount != null
                                          ? `${s.ordinaryPauseCount}${
                                              s.ordinaryPauseAverageSeconds !=
                                              null
                                                ? ` · avg ${s.ordinaryPauseAverageSeconds}s`
                                                : ""
                                            }${
                                              s.ordinaryPauseLongestSeconds !=
                                              null
                                                ? ` · longest ${s.ordinaryPauseLongestSeconds}s`
                                                : ""
                                            }`
                                          : "—"}
                                      </dd>
                                      <dt className="text-muted">Extendable</dt>
                                      <dd className="tabular-nums">
                                        {(() => {
                                          const n =
                                            s.extendableCount ??
                                            r.extendableCount;
                                          if (n == null) return "—";
                                          return `${Math.round(n)} · ${fmtClock(
                                            s.extendableSecondsBefore ??
                                              r.extendableSecondsBefore,
                                          )} → ${fmtClock(
                                            s.extendableSecondsAfter ??
                                              r.extendableSecondsAfter,
                                          )}`;
                                        })()}
                                      </dd>
                                      <dt className="text-muted">Named markers</dt>
                                      <dd className="tabular-nums">
                                        {s.namedMarkersUsed != null
                                          ? `${s.namedMarkersUsed}${
                                              s.namedMarkersUsed > 0
                                                ? " · named pauses"
                                                : ""
                                            }`
                                          : "—"}
                                      </dd>
                                      <dt className="text-muted">Sentence budget</dt>
                                      <dd className="tabular-nums">
                                        {s.sentenceBudget ?? "—"}
                                      </dd>
                                      <dt className="text-muted">Header total</dt>
                                      <dd className="tabular-nums">
                                        {s.headerSentenceTotal ?? "—"}
                                      </dd>
                                      <dt className="text-muted">Written</dt>
                                      <dd className="tabular-nums">
                                        {s.writtenSentenceTotal ?? "—"}
                                      </dd>
                                    </dl>
                                    {(s.phases ?? []).length === 0 ? (
                                      <p className="text-xs text-muted">—</p>
                                    ) : (
                                      <table className="w-full min-w-[640px] text-left text-xs">
                                        <thead className="text-muted">
                                          <tr className="border-b border-border">
                                            <th className="py-1 pr-2 font-medium">
                                              Phase
                                            </th>
                                            <th className="py-1 pr-2 font-medium">
                                              Header vs actual
                                            </th>
                                            <th className="py-1 pr-2 font-medium">
                                              Sentences
                                            </th>
                                            <th className="py-1 pr-2 font-medium">
                                              Words
                                            </th>
                                            <th className="py-1 font-medium">
                                              Extendable
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(s.phases ?? []).map((p, i) => (
                                            <tr
                                              key={`${key}-b${s.briefIndex}-p${i}`}
                                              className="border-b border-border/60 last:border-0 text-foreground"
                                            >
                                              <td className="py-1 pr-2 whitespace-nowrap">
                                                {p.name || `Phase ${i + 1}`}
                                              </td>
                                              <td className="py-1 pr-2 tabular-nums whitespace-nowrap">
                                                {p.headerMinutes != null
                                                  ? `~${p.headerMinutes} min`
                                                  : "—"}{" "}
                                                vs {fmtClock(p.totalSeconds)}
                                              </td>
                                              <td className="py-1 pr-2 tabular-nums whitespace-nowrap">
                                                {p.headerSentences ?? "—"} /{" "}
                                                {p.actualSentences ?? "—"}
                                              </td>
                                              <td className="py-1 pr-2 tabular-nums whitespace-nowrap">
                                                {p.words ?? "—"}
                                              </td>
                                              <td className="py-1 tabular-nums whitespace-nowrap">
                                                {fmtClock(
                                                  p.extendableSecondsBefore,
                                                )}{" "}
                                                →{" "}
                                                {fmtClock(
                                                  p.extendableSecondsAfter,
                                                )}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                      return [main, detail];
                    })
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="rounded-2xl border border-border p-4">
          <div>
            <h2 className="font-semibold text-foreground">
              Sentences vs phase headers
            </h2>
            <p className="mt-1 text-xs text-muted">
              From time-based cost cells. Average actual sentences vs header sentences per
              pacing × length.
            </p>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Delivery</th>
                  <th className="py-2 pr-3 font-medium">Length</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Scripts</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Phases</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Avg header</th>
                  <th className="py-2 pr-3 font-medium tabular-nums">Avg written</th>
                  <th className="py-2 font-medium tabular-nums">vs header</th>
                </tr>
              </thead>
              <tbody>
                {timeSentenceAccuracy.filter((r) => r.phases > 0).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-3 text-sm text-muted">
                      No time-based phase stats yet — run Costs → Time-based costs, or Preview.
                    </td>
                  </tr>
                ) : (
                  timeSentenceAccuracy
                    .filter((r) => r.phases > 0)
                    .map((r) => (
                      <tr
                        key={`sent-${r.delivery}-${r.minutes}`}
                        className="border-b border-border last:border-0 text-foreground"
                      >
                        <td className="py-2 pr-3">{DELIVERY_LABEL[r.delivery]}</td>
                        <td className="py-2 pr-3">{r.minutes} min</td>
                        <td className="py-2 pr-3 tabular-nums">{r.scripts}</td>
                        <td className="py-2 pr-3 tabular-nums">{r.phases}</td>
                        <td className="py-2 pr-3 tabular-nums">
                          {r.avgHeaderSentences ?? "—"}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {r.avgActualSentences ?? "—"}
                        </td>
                        <td className="py-2 tabular-nums">
                          {fmtPct(r.avgActualVsHeaderPct, true)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        </>
      ) : null}

      {adminTab === "accuracy" && activeModeFilter !== "time" ? (
      <>
      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-foreground">First-draft words vs section targets</h2>
        <p className="mt-1 text-xs text-muted">
          Last 90 days, per delivery and length. Negative means the draft was short. Fix rate is
          how often total words were more than 20% off.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Delivery</th>
                <th className="py-2 pr-3 font-medium">Length</th>
                <th className="py-2 pr-3 font-medium">Meditations</th>
                <th className="py-2 pr-3 font-medium">Opening</th>
                <th className="py-2 pr-3 font-medium">Main</th>
                <th className="py-2 pr-3 font-medium">Closing</th>
                <th className="py-2 pr-3 font-medium">Whole script</th>
                <th className="py-2 pr-3 font-medium">Section fix ran</th>
                <th className="py-2 pr-3 font-medium">Script short</th>
                <th className="py-2 pr-3 font-medium">Avg plan</th>
                <th className="py-2 pr-3 font-medium">Avg write</th>
              </tr>
            </thead>
            <tbody>
              {sectionStats.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-2 text-muted">
                    No meditations written in sections yet.
                  </td>
                </tr>
              ) : (
                sectionStats.map((row) => (
                  <tr
                    key={`${row.delivery}-${row.minutes}`}
                    className="border-b border-border last:border-0 text-foreground"
                  >
                    <td className="py-2 pr-3">{DELIVERY_LABEL[row.delivery]}</td>
                    <td className="py-2 pr-3">{row.minutes} min</td>
                    <td className="py-2 pr-3">{row.count}</td>
                    <td className="py-2 pr-3">{fmtPct(row.openingPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.mainPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.closingPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.totalPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.fixRatePct)}</td>
                    <td className="py-2 pr-3">{fmtPct(row.shortRatePct)}</td>
                    <td className="py-2 pr-3">
                      {typeof row.avgPlanMs === "number" ? `${(row.avgPlanMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                    <td className="py-2 pr-3">
                      {typeof row.avgSectionsWriteMs === "number"
                        ? `${(row.avgSectionsWriteMs / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-foreground">Length vs request</h2>
        <p className="mt-1 text-xs text-muted">
          Last 90 days. Fallback rates count meditations made since the length check.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Delivery</th>
                <th className="py-2 pr-3 font-medium">Meditations</th>
                <th className="py-2 pr-3 font-medium">Length vs request</th>
                <th className="py-2 pr-3 font-medium">Pauses scaled before audio</th>
                <th className="py-2 pr-3 font-medium">Revision ran</th>
                <th className="py-2 pr-3 font-medium">Pauses scaled after audio</th>
              </tr>
            </thead>
            <tbody>
              {(["casual", "guided", "open_sits"] as const).map((id) => {
                const row = lengthStats[id];
                return (
                  <tr key={id} className="border-b border-border last:border-0 text-foreground">
                    <td className="py-2 pr-3">{DELIVERY_LABEL[id]}</td>
                    <td className="py-2 pr-3">{row?.count ?? 0}</td>
                    <td className="py-2 pr-3">{fmtPct(row?.avgVsRequestPct, true)}</td>
                    <td className="py-2 pr-3">{fmtPct(row?.preScaledPct)}</td>
                    <td className="py-2 pr-3">{fmtPct(row?.revisedPct)}</td>
                    <td className="py-2 pr-3">{fmtPct(row?.postScaledPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-border p-4">
        <h2 className="font-semibold text-foreground">10-minute preview</h2>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {preview.map((row) => (
            <li key={row.delivery}>
              {row.delivery === "open_sits" ? "Open sits" : row.delivery === "guided" ? "Guided" : "Casual"}
              {" · "}
              {row.words.toLocaleString()} words · {row.chars.toLocaleString()} chars ·{" "}
              {row.silenceMinutes} min silence
            </li>
          ))}
        </ul>
      </section>
      </>
      ) : null}
    </div>
  );
}

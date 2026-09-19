/**
 * Named pause bands in generated scripts (`[[PAUSE medium]]`).
 * Seconds live only here so we can retune render without changing scripts.
 *
 * Legacy / longer-breaks timed markers `[[PAUSE 60s]]` still parse.
 */
export const SCRIPT_PAUSE_BANDS = [
  "extra-short",
  "short",
  "medium",
  "long",
  "extra-long",
  /** Self-paced open practice (~1 min). Longer-breaks mode; not routine line spacing. */
  "open",
] as const;

export type ScriptPauseBand = (typeof SCRIPT_PAUSE_BANDS)[number];

/** Seconds of silence per band before `PAUSE_RENDER_SCALE`. */
export const SCRIPT_PAUSE_BAND_SECONDS: Record<ScriptPauseBand, number> = {
  "extra-short": 1.5,
  short: 2.5,
  medium: 4,
  long: 7,
  "extra-long": 12,
  /** Default open-practice sit; override with `[[PAUSE 90s]]` etc. when needed. */
  open: 75,
};

/** Hard cap on timed `[[PAUSE Ns]]` markers (safety). */
export const SCRIPT_PAUSE_TIMED_MAX_SECONDS = 180;

export const TITLE_PAUSE_MARKER = "[[PAUSE medium]]";

const BAND_ALIASES: Record<string, ScriptPauseBand> = {
  xs: "extra-short",
  "extra short": "extra-short",
  "extra-short": "extra-short",
  extrashort: "extra-short",
  short: "short",
  s: "short",
  medium: "medium",
  med: "medium",
  m: "medium",
  typical: "medium",
  long: "long",
  l: "long",
  "extra long": "extra-long",
  "extra-long": "extra-long",
  extralong: "extra-long",
  xl: "extra-long",
  xlong: "extra-long",
  open: "open",
  practice: "open",
  "open practice": "open",
  "open-practice": "open",
  "self paced": "open",
  "self-paced": "open",
};

export const SCRIPT_PAUSE_MARKER_RE = /\[\[PAUSE\s+([^\]]+)\]\]/gi;

export function normalizePauseBand(raw: string): ScriptPauseBand | null {
  const key = raw.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
  return BAND_ALIASES[key] ?? null;
}

export function secondsForPauseSpec(
  raw: string,
  bands?: Record<ScriptPauseBand, number>,
): number {
  const map = bands ?? SCRIPT_PAUSE_BAND_SECONDS;
  const band = normalizePauseBand(raw);
  if (band) return map[band];
  const n = parseFloat(raw.trim().replace(/s$/i, ""));
  if (Number.isFinite(n) && n > 0) {
    return Math.min(n, SCRIPT_PAUSE_TIMED_MAX_SECONDS);
  }
  return 0;
}

export function sumPauseMarkerSeconds(
  script: string,
  bands?: Record<ScriptPauseBand, number>,
): number {
  if (!script) return 0;
  const re = new RegExp(SCRIPT_PAUSE_MARKER_RE.source, SCRIPT_PAUSE_MARKER_RE.flags);
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    total += secondsForPauseSpec(m[1] ?? "", bands);
  }
  return total;
}

export function stripPauseMarkers(script: string): string {
  if (!script) return "";
  return script
    .replace(new RegExp(SCRIPT_PAUSE_MARKER_RE.source, SCRIPT_PAUSE_MARKER_RE.flags), " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fish Audio inline pause tags (S2 `[brackets]` / S1 `(parens)`).
 * Use Fish’s documented qualitative tags — not timed `[pause 4s]`.
 * @see https://docs.fish.audio/developer-guide/core-features/emotions
 */
export type FishPauseTagStyle = "s2" | "s1";

/** Fish S2 pause cue text (without brackets). */
export type FishPauseCue =
  | "break"
  | "short pause"
  | "long pause"
  | "long-break";

export function fishPauseTagStyleForModel(model: string | null | undefined): FishPauseTagStyle {
  const m = (model ?? "").trim().toLowerCase();
  if (!m) return "s2";
  if (m === "s1" || m.startsWith("s1-") || m.includes("speech-1")) return "s1";
  return "s2";
}

/**
 * Map our named bands → Fish pause cues.
 * Admin band seconds still apply on the segmented (ffmpeg) path only.
 * `open` / long timed pauses need the segmented path — Fish tags cannot hold 60–120s.
 */
export function fishPauseCueForBand(band: ScriptPauseBand): FishPauseCue {
  switch (band) {
    case "extra-short":
      return "break";
    case "short":
      return "short pause";
    case "medium":
      return "long pause";
    case "long":
    case "extra-long":
    case "open":
      return "long-break";
  }
}

/** Legacy `[[PAUSE 3s]]` → nearest Fish cue by duration. */
function fishPauseCueForSeconds(seconds: number): FishPauseCue | null {
  if (!(seconds > 0)) return null;
  if (seconds < 2) return "break";
  if (seconds < 3.5) return "short pause";
  if (seconds < 6) return "long pause";
  return "long-break";
}

/** `[break]` (S2) or `(break)` (S1). */
export function fishNativePauseTag(
  cue: FishPauseCue,
  style: FishPauseTagStyle = "s2",
): string {
  return style === "s1" ? `(${cue})` : `[${cue}]`;
}

/**
 * Replace `[[PAUSE …]]` with Fish qualitative pause tags.
 * Unknown / empty specs are removed. `bands` / `scale` are ignored (seconds
 * only matter on the segmented ffmpeg path).
 */
export function replacePauseMarkersWithFishNative(
  script: string,
  style: FishPauseTagStyle = "s2",
  _bands?: Record<ScriptPauseBand, number>,
  _scale = 1,
): string {
  if (!script) return "";
  const re = new RegExp(SCRIPT_PAUSE_MARKER_RE.source, SCRIPT_PAUSE_MARKER_RE.flags);
  return script
    .replace(re, (_full, raw: string) => {
      const band = normalizePauseBand(raw ?? "");
      const cue = band
        ? fishPauseCueForBand(band)
        : fishPauseCueForSeconds(secondsForPauseSpec(raw ?? ""));
      if (!cue) return " ";
      return ` ${fishNativePauseTag(cue, style)} `;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export type ScriptSegment = {
  text: string;
  pauseSeconds: number;
};

export function parseScriptIntoSegments(
  script: string,
  bands?: Record<ScriptPauseBand, number>,
): ScriptSegment[] {
  const segments: ScriptSegment[] = [];
  if (!script) return segments;
  const re = new RegExp(SCRIPT_PAUSE_MARKER_RE.source, SCRIPT_PAUSE_MARKER_RE.flags);
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(script)) !== null) {
    const raw = script.slice(lastIndex, match.index);
    const text = raw.trim();
    const pause = secondsForPauseSpec(match[1] ?? "", bands);
    if (text) {
      segments.push({
        text,
        pauseSeconds: pause > 0 ? pause : 0,
      });
    } else if (pause > 0 && segments.length > 0) {
      segments[segments.length - 1]!.pauseSeconds += pause;
    }
    lastIndex = match.index + match[0].length;
  }

  const tail = script.slice(lastIndex).trim();
  if (tail) {
    segments.push({ text: tail, pauseSeconds: 0 });
  }

  return segments;
}

/** Prompt block: scripts use named bands only, never seconds (standard / Script Lab). */
export const SCRIPT_PAUSE_PROMPT_RULES = [
  "Use **liberal** natural pauses with inline markers `[[PAUSE short]]`, `[[PAUSE medium]]`, `[[PAUSE long]]`, or `[[PAUSE extra long]]` only — **never** write seconds (no `3s`, `6s`, `1.5s`, etc.). Optional `[[PAUSE extra short]]` for a very brief bridge.",
  "Include them **often**—after most sentences or sense-units, at **every** meaningful transition (arrival → practice, shifts in technique or imagery, closing), and wherever a human guide would breathe or let a phrase land—not only at rare dramatic beats.",
  "Place **every** pause **intelligently**: each gap must fit the moment—what was just said, the emotional or somatic weight, the transition, and what comes next. Pauses are not filler; avoid random, uniform, or excessive markers that would break rhythm or feel mechanical.",
  "Choose the **band** by context: **short** when momentum matters; **medium** as the typical gap between lines; **long** after heavier invitations, imagery, or emotional lines; **extra long** when the listener is practising **on their own** with no imminent next cue (slow body scan, open visualization, resting in silence, counting several breaths alone). Default toward more frequent silence than a dense script—still never gratuitous.",
  "**Guided breath cycles (important):** when you sequence step-by-step breath cues the guide delivers in order—e.g. breathe in … then breathe out; inhale … exhale; hold … release—the pause **between those paired steps** must be **short** or **extra short** only. That gap is just long enough to finish that one phase before the next line; it is **not** self-paced practice. Never use **medium**, **long**, or **extra long** after “breathe in” (or similar) if the next section is “breathe out” (or the matching exhale/release). Use **long** / **extra long** only when the listener has real open time before the guide speaks again.",
  "When the listener truly follows in their own time—with no next instruction arriving soon—prefer **extra long** (sometimes several markers in a row when one sustained silence fits); never rush the next line while they are meant to be practising alone, and never stack extra-long silence where the script does not call for it.",
  "Place pause markers on their own or immediately after a sentence, never splitting words.",
].join("\n");

/**
 * Open-practice silence plan for longer-breaks mode.
 * Spoken guidance stays roughly normal density; duration is hit with cued 1–2 min sits.
 */
export type LongerBreaksOpenPracticePlan = {
  targetMinutes: number;
  /** How many open sits to place. */
  countLo: number;
  countHi: number;
  /** Suggested seconds per open sit (custom timed markers). */
  secondsLo: number;
  secondsHi: number;
  /** Default `[[PAUSE open]]` band seconds. */
  openBandSeconds: number;
  /** Typical total open-practice silence to budget into the stem. */
  typicalOpenSeconds: number;
  /** Spoken+ordinary-pause budget so stem ≈ target. */
  spokenBudgetMinutes: number;
};

export function longerBreaksOpenPracticePlan(
  targetMinutes: number,
): LongerBreaksOpenPracticePlan {
  const mins =
    typeof targetMinutes === "number" &&
    Number.isFinite(targetMinutes) &&
    targetMinutes > 0
      ? targetMinutes
      : 5;
  const openBandSeconds = SCRIPT_PAUSE_BAND_SECONDS.open;

  let countLo: number;
  let countHi: number;
  let secondsLo: number;
  let secondsHi: number;
  let typicalOpenSeconds: number;

  if (mins <= 3) {
    // A true 60–120s open barely fits a 2-minute sit — one shorter open.
    countLo = 1;
    countHi = 1;
    secondsLo = 25;
    secondsHi = 40;
    typicalOpenSeconds = 35;
  } else if (mins <= 7) {
    countLo = 1;
    countHi = 2;
    secondsLo = 45;
    secondsHi = 75;
    typicalOpenSeconds = 70;
  } else if (mins <= 14) {
    countLo = 2;
    countHi = 3;
    secondsLo = 60;
    secondsHi = 90;
    typicalOpenSeconds = 160;
  } else {
    countLo = 3;
    countHi = 4;
    secondsLo = 60;
    secondsHi = 120;
    typicalOpenSeconds = 300;
  }

  const spokenBudgetMinutes = Math.max(
    1.5,
    Math.round(((mins * 60 - typicalOpenSeconds) / 60) * 10) / 10,
  );

  return {
    targetMinutes: mins,
    countLo,
    countHi,
    secondsLo,
    secondsHi,
    openBandSeconds,
    typicalOpenSeconds,
    spokenBudgetMinutes,
  };
}

/**
 * Longer-breaks mode only: self-paced cues + multi-minute open sits.
 * Ordinary line pauses stay on short/medium/long/extra-long — do not inflate those.
 */
export function scriptLongerBreaksOpenPracticeRules(
  targetMinutes: number,
): string {
  const plan = longerBreaksOpenPracticePlan(targetMinutes);
  const stemSeconds = Math.round(plan.targetMinutes * 60);

  return [
    "",
    "### Longer breaks — open practice (hard priority)",
    `The creator chose **longer breaks**. The voice stem must still land near **${plan.targetMinutes} minutes** (~**${stemSeconds}** s) — same Length setting as usual.`,
    "",
    "**What changes:** insert a few **properly cued self-paced practice sits** with **long open silence** (about **one to two minutes** each on longer sits). Do **not** merely thin every line or spam `extra-long` (that band is only ~12 s).",
    "",
    "**What stays the same:** between ordinary spoken lines, keep using `[[PAUSE short]]` / `medium` / `long` / `extra long` as in a normal guided script. Guided in→out breath pairs stay **short** / **extra short**.",
    "",
    "**Cue → open silence (required pattern):**",
    "1. Speak a clear self-paced invitation, e.g. “I’ll give you some time here — follow along at your own pace,” “Take as long as you need with this,” “Stay with this in your own time; I’ll wait,” “Practise this on your own for a little while.”",
    "2. Immediately after that cue, place **one** open-practice pause marker (not a stack of `extra-long`).",
    "3. After the silence, continue with the next guided section (or closing).",
    "",
    "**Open-practice pause markers (longer-breaks only):**",
    `- Preferred default: \`[[PAUSE open]]\` (~**${plan.openBandSeconds}** s of silence).`,
    `- When you need a specific length: timed markers are allowed here — \`[[PAUSE 60s]]\`, \`[[PAUSE 90s]]\`, \`[[PAUSE 120s]]\` (whole seconds only; max **${SCRIPT_PAUSE_TIMED_MAX_SECONDS}**). Pick the duration that fits the cue and the remaining time budget.`,
    "- Never use timed seconds for ordinary line spacing — only for these cued open sits.",
    "",
    "**Budget for this Length:**",
    `- Place about **${plan.countLo}–${plan.countHi}** open-practice sits.`,
    `- Each open sit ~**${plan.secondsLo}–${plan.secondsHi}** s (use timed markers when \`open\` is the wrong size).`,
    `- Together they should contribute roughly **~${plan.typicalOpenSeconds}** s of silence.`,
    `- Write the **spoken guided content** as roughly a **${plan.spokenBudgetMinutes}-minute** script (normal density + ordinary pauses). The open sits fill the rest so the stem hits **${plan.targetMinutes}** minutes.`,
    "",
    "**Do not:** replace open sits with many `extra-long` markers; pad with filler talk; change the Length target; put a minute of silence without a self-paced cue first.",
  ].join("\n");
}

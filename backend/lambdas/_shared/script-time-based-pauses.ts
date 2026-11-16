/**
 * Time-based extendable pauses: `<x 20>` (chosen seconds).
 * Ordinary short markers stay fixed; only extendable ones scale when fitting.
 * After fitting, extendable markers become normal `[[PAUSE Ns]]` for TTS.
 */
import {
  expandShortPauseMarkers,
  SCRIPT_PAUSE_MARKER_RE,
  secondsForPauseSpec,
} from "./script-pause-bands";

/** Model-facing extendable pause: `<x 20>` or `<x20>`. */
export const TIME_EXTENDABLE_PAUSE_RE =
  /<x\s*(\d+(?:\.\d+)?)\s*>/gi;

export type TimePauseToken =
  | { kind: "text"; text: string }
  | { kind: "ordinary"; seconds: number }
  | { kind: "extendable"; seconds: number };

export function formatExtendablePauseMarker(seconds: number): string {
  const n = Math.round(Math.max(0, seconds) * 10) / 10;
  const body = Number.isInteger(n) ? String(n) : String(n);
  return `<x ${body}>`;
}

function formatTimedPause(seconds: number): string {
  const n = Math.round(Math.max(0, seconds) * 10) / 10;
  const body = Number.isInteger(n) ? `${n}s` : `${n}s`;
  return `[[PAUSE ${body}]]`;
}

export function summarizeExtendablePauses(script: string): {
  count: number;
  totalSeconds: number;
} {
  if (!script) return { count: 0, totalSeconds: 0 };
  const re = new RegExp(
    TIME_EXTENDABLE_PAUSE_RE.source,
    TIME_EXTENDABLE_PAUSE_RE.flags,
  );
  let count = 0;
  let totalSeconds = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(script)) !== null) {
    const sec = parseFloat(m[1] ?? "");
    if (Number.isFinite(sec) && sec > 0) {
      count += 1;
      totalSeconds += sec;
    }
  }
  return { count, totalSeconds };
}

export function summarizeOrdinaryPauses(tokens: TimePauseToken[]): {
  count: number;
  totalSeconds: number;
} {
  let count = 0;
  let totalSeconds = 0;
  for (const t of tokens) {
    if (t.kind === "ordinary" && t.seconds > 0) {
      count += 1;
      totalSeconds += t.seconds;
    }
  }
  return { count, totalSeconds };
}

/**
 * Tokenize a time-based script into text / ordinary / extendable pauses.
 * Ordinary short markers are expanded first; `<x N>` stays distinct.
 */
export function tokenizeTimeBasedScript(script: string): TimePauseToken[] {
  if (!script) return [];
  // Protect extendable markers, expand ordinary shorts, then restore.
  const held: number[] = [];
  const protectedScript = script.replace(
    TIME_EXTENDABLE_PAUSE_RE,
    (_m, raw: string) => {
      const sec = parseFloat(raw);
      const n = Number.isFinite(sec) && sec > 0 ? sec : 0;
      const i = held.length;
      held.push(n);
      return `⟦X${i}⟧`;
    },
  );
  const expanded = expandShortPauseMarkers(protectedScript);
  const tokens: TimePauseToken[] = [];
  const re =
    /⟦X(\d+)⟧|\[\[PAUSE\s+([^\]]+)\]\]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expanded)) !== null) {
    const before = expanded.slice(last, m.index);
    if (before) tokens.push({ kind: "text", text: before });
    if (m[1] != null) {
      const sec = held[Number(m[1])] ?? 0;
      tokens.push({ kind: "extendable", seconds: Math.max(0, sec) });
    } else {
      const sec = secondsForPauseSpec(m[2] ?? "");
      tokens.push({ kind: "ordinary", seconds: Math.max(0, sec) });
    }
    last = m.index + m[0].length;
  }
  const tail = expanded.slice(last);
  if (tail) tokens.push({ kind: "text", text: tail });
  return tokens;
}

/** Scale only extendable pauses; ordinary unchanged. */
export function scaleExtendableTokens(
  tokens: TimePauseToken[],
  scale: number,
): TimePauseToken[] {
  if (Math.abs(scale - 1) < 1e-6) return tokens;
  return tokens.map((t) =>
    t.kind === "extendable"
      ? { ...t, seconds: Math.max(0, t.seconds * scale) }
      : t,
  );
}

/**
 * Serialize tokens to TTS script: all pauses as normal `[[PAUSE Ns]]`
 * (extendable converted after fitting).
 */
export function scriptFromTimePauseTokens(tokens: TimePauseToken[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    if (t.kind === "text") {
      parts.push(t.text);
    } else if (t.seconds > 0) {
      parts.push(formatTimedPause(t.seconds));
    }
  }
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Keep `<x N>` form (for continue/trim prompts before final convert). */
export function scriptWithExtendableMarkers(tokens: TimePauseToken[]): string {
  const parts: string[] = [];
  for (const t of tokens) {
    if (t.kind === "text") parts.push(t.text);
    else if (t.kind === "extendable" && t.seconds > 0) {
      parts.push(formatExtendablePauseMarker(t.seconds));
    } else if (t.kind === "ordinary" && t.seconds > 0) {
      // Keep ordinary as timed internal form after expand.
      parts.push(formatTimedPause(t.seconds));
    }
  }
  return parts
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function pauseTotalsFromTokens(tokens: TimePauseToken[]): {
  ordinaryCount: number;
  ordinarySeconds: number;
  extendableCount: number;
  extendableSeconds: number;
} {
  let ordinaryCount = 0;
  let ordinarySeconds = 0;
  let extendableCount = 0;
  let extendableSeconds = 0;
  for (const t of tokens) {
    if (t.kind === "ordinary" && t.seconds > 0) {
      ordinaryCount += 1;
      ordinarySeconds += t.seconds;
    } else if (t.kind === "extendable" && t.seconds > 0) {
      extendableCount += 1;
      extendableSeconds += t.seconds;
    }
  }
  return {
    ordinaryCount,
    ordinarySeconds,
    extendableCount,
    extendableSeconds,
  };
}

/** Strip leading pause tokens (ordinary or extendable) before first text. */
export function stripLeadingPauseTokens(
  tokens: TimePauseToken[],
): TimePauseToken[] {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i]!;
    if (t.kind === "text" && t.text.trim()) break;
    if (t.kind === "text" && !t.text.trim()) {
      i += 1;
      continue;
    }
    if (t.kind === "ordinary" || t.kind === "extendable") {
      i += 1;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

void SCRIPT_PAUSE_MARKER_RE;

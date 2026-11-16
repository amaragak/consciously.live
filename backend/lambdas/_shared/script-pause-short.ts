/**
 * Compact pause markers for model I/O (~2–3 tokens) vs `[[PAUSE …]]` (~8).
 * Core expand lives in script-pause-bands (also used by sum/strip/parse).
 */
import {
  SCRIPT_PAUSE_BAND_SECONDS,
  SCRIPT_PAUSE_MARKER_RE,
  type ScriptPauseBand,
} from "./script-pause-bands";

export {
  expandShortPauseMarkers,
  SHORT_PAUSE_MARKER_RE,
} from "./script-pause-bands";

/** Compact band tokens shown to the model. */
export const SHORT_PAUSE_BAND: Record<ScriptPauseBand, string> = {
  "extra-short": "xs",
  short: "s",
  medium: "m",
  long: "l",
  "extra-long": "xl",
  open: "o",
};

export function shortPauseMarkerForBand(band: ScriptPauseBand): string {
  return `<${SHORT_PAUSE_BAND[band]}>`;
}

export function shortPauseMarkerForSeconds(seconds: number): string {
  const n = Math.round(seconds * 10) / 10;
  const body = Number.isInteger(n) ? String(n) : String(n);
  return `<${body}>`;
}

/** Rewrite guide / prompt text that still uses `[[PAUSE …]]` into timed `<N>`. */
export function rewritePauseMarkersToShortForm(text: string): string {
  if (!text) return text;
  return text.replace(SCRIPT_PAUSE_MARKER_RE, (_m, body: string) => {
    const raw = (body ?? "").trim();
    const key = raw.toLowerCase().replace(/_/g, " ");
    const fromAlias: Record<string, ScriptPauseBand> = {
      "extra short": "extra-short",
      "extra-short": "extra-short",
      short: "short",
      medium: "medium",
      long: "long",
      "extra long": "extra-long",
      "extra-long": "extra-long",
      open: "open",
      xs: "extra-short",
      s: "short",
      m: "medium",
      l: "long",
      xl: "extra-long",
      o: "open",
    };
    const b = fromAlias[key];
    // Was: if (b) return shortPauseMarkerForBand(b);
    if (b) return shortPauseMarkerForSeconds(SCRIPT_PAUSE_BAND_SECONDS[b]);
    const n = parseFloat(raw.replace(/s$/i, ""));
    if (Number.isFinite(n) && n > 0) return shortPauseMarkerForSeconds(n);
    return `<${raw}>`;
  });
}

/** Prompt rules: timed seconds only (named bands retired for new scripts). */
/*
export const SHORT_PAUSE_PROMPT_RULES_NAMED = [
  "Use **liberal** natural pauses with short markers: `<s>`, `<m>`, … Prefer **named bands** …",
].join(" ");
*/
export const SHORT_PAUSE_PROMPT_RULES = [
  "Mark every pause with its length in seconds: `<N>`, for example `<2>` or `<5.5>`. Choose each length for the moment: short where the flow should carry on, longer after something the listener needs time to take in. Place pauses between ideas or small groups of sentences, not after every sentence.",
  "Never invent other marker spellings. Do not write the old `[[PAUSE …]]` form.",
].join(" ");

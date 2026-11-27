/**
 * Style writer's guides for script generation (plan / sections / single-call / Script Lab).
 * Markdown sources: ./style-instructions/*.md (embedded in style-instructions-data.ts).
 *
 * Guidance only — never used to validate, clamp, or reject scripts in code.
 */
import type { DeliveryId } from "./delivery-profiles";
import { normalizeMeditationType } from "./meditation-types";
import { rewritePauseMarkersToShortForm } from "./script-pause-short";
import { STYLE_GUIDE_BY_TYPE } from "./style-instructions-data";
import { loadLiveStyleGuide } from "./preprompts/preprompt-store";

const PAUSES_SECTION_RE = /^##\s*(?:\d+\.\s*)?Pauses\s*$/im;

/** Strip the Pauses section (heading through the next ## or end). Casual keeps app pause rules. */
export function stripPausesSection(guideMarkdown: string): string {
  const text = guideMarkdown.replace(/\r\n/g, "\n");
  const match = PAUSES_SECTION_RE.exec(text);
  if (!match || match.index == null) return text.trim();
  const start = match.index;
  const after = text.slice(start + match[0].length);
  const next = /^##\s+/m.exec(after);
  const end = next ? start + match[0].length + next.index : text.length;
  return `${text.slice(0, start).trimEnd()}\n\n${text.slice(end).trimStart()}`.trim();
}

/**
 * Guides ship with `[[PAUSE …]]`. Rewrite to timed `<N>` (band defaults → seconds)
 * so the model only sees the compact timed syntax. Downstream expands → internal.
 */
export function rewriteGuidePauseMarkers(guideMarkdown: string): string {
  // Guides previously kept [[PAUSE …]] verbatim (identity).
  // return guideMarkdown;
  return rewritePauseMarkersToShortForm(guideMarkdown);
}

export function styleGuideMarkdownFor(
  meditationStyle: string | null | undefined,
): string | null {
  const raw = (meditationStyle ?? "").trim();
  if (!raw) return null;
  const norm = normalizeMeditationType(raw);
  if (!norm) return null;
  const guide = STYLE_GUIDE_BY_TYPE[norm];
  return guide?.trim() ? guide : null;
}

/**
 * Live (Dynamo latest) guide for a style, falling back to the embedded default.
 * Used by Create; sync callers keep using styleGuideMarkdownFor.
 */
export async function styleGuideMarkdownForLive(
  meditationStyle: string | null | undefined,
): Promise<{
  markdown: string;
  /** 0 = embedded repo default. */
  version: number;
  entryId: string;
} | null> {
  const live = await loadLiveStyleGuide(meditationStyle);
  if (!live) return null;
  return { markdown: live.text, version: live.version, entryId: live.entryId };
}

export function styleGuidePacingPreamble(params: {
  delivery: DeliveryId;
  /** Silence share 0–1 from delivery profiles. */
  silenceShare: number;
  /** Casual longest pause (seconds). */
  longestPauseSeconds: number;
  /**
   * When true, omit "within this section's silence target" (plan call, first/last
   * sections with no pause target, or shared cached block).
   */
  omitSectionSilenceTarget?: boolean;
}): string {
  const silencePct = Math.round(
    Math.min(0.95, Math.max(0, params.silenceShare)) * 100,
  );
  const longest = Math.max(
    0.2,
    Math.round(params.longestPauseSeconds * 10) / 10,
  );
  const withinTarget = params.omitSectionSilenceTarget
    ? ""
    : " within this section's silence target";

  if (params.delivery === "casual") {
    // Was: never longer than ${longest} seconds (admin named-band / longest pause).
    void longest;
    return `Pauses in this session are short and conversational. Use the rest of this guide for how things are introduced and said.`;
  }
  if (params.delivery === "open_sits") {
    const targetBit = params.omitSectionSilenceTarget
      ? "this pacing"
      : "this pacing and the section's silence target";
    return `The pause advice in this guide comes from guided meditations. This session is an Open sit: about ${silencePct}% of it is silence, so the silences between cues are much longer than the guide's ranges. Use the guide for where pauses belong and what each moment needs; make the long silences as long as ${targetBit} call for, each following a cue the listener can keep doing for that long.`;
  }
  // guided
  return `The pause advice in this guide comes from guided meditations and fits this session's pacing. Use it for where pauses go and how long they are${withinTarget}.`;
}

/**
 * Full block for the shared system / cached prompt: pacing line + guide.
 * Returns null when no style is chosen or no guide exists.
 */
export function styleGuidePromptBlock(params: {
  meditationStyle: string | null | undefined;
  delivery: DeliveryId;
  silenceShare: number;
  longestPauseSeconds: number;
  /** Casual: strip ## Pauses. */
  stripPauses?: boolean;
  omitSectionSilenceTarget?: boolean;
  /**
   * Live guide text from Admin › Pre-prompts (loaded async by the caller).
   * Omitted = embedded STYLE_GUIDE_BY_TYPE.
   */
  guideMarkdownOverride?: string | null;
}): string | null {
  const raw =
    params.guideMarkdownOverride?.trim() ||
    styleGuideMarkdownFor(params.meditationStyle);
  if (!raw) return null;
  let guide = rewriteGuidePauseMarkers(raw);
  if (params.stripPauses ?? params.delivery === "casual") {
    guide = stripPausesSection(guide);
  }
  const pacing = styleGuidePacingPreamble({
    delivery: params.delivery,
    silenceShare: params.silenceShare,
    longestPauseSeconds: params.longestPauseSeconds,
    omitSectionSilenceTarget: params.omitSectionSilenceTarget,
  });
  return [
    "### Style writer's guide (guidance, not fixed rules)",
    "Apply with judgement. Precedence: the user's brief, chat and attached context first; then this app's length and silence rules (silence share, Casual's longest pause, length tolerance, section word ranges); then this guide. Do not treat the guide as something to validate against.",
    "",
    pacing,
    "",
    guide.trim(),
  ].join("\n");
}

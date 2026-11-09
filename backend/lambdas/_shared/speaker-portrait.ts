/**
 * Circular speaker portraits for Admin Voice / Create picker.
 * Style preprompt is the source of truth; deploy seeds it into Admin › Pre-prompts.
 * Speechify keeps that shared brief. Fish (Pro) swaps the backdrop line for a gradient.
 */

const PORTRAIT_BG_EITHER =
  "Background: a vibrant solid color OR soft two-color gradient that fills the entire backdrop behind the person; no location, no props, no text, no logos, no UI chrome.";

const PORTRAIT_BG_GRADIENT =
  "Background: a soft two-color gradient that fills the entire backdrop behind the person (not a flat single-color fill); no location, no props, no text, no logos, no UI chrome.";

export const SPEAKER_PORTRAIT_STYLE_PREPROMPT = [
  "Generate a single photoreal portrait for a meditation voice-product card.",
  "Framing: tight circular crop feel — head, hair, and shoulders only; subject fills most of the frame; looking toward camera with a warm, friendly, approachable expression.",
  "Photography: soft even studio lighting, natural skin texture, professional but not glamorous; no harsh shadows, no beauty-filter plastic look.",
  PORTRAIT_BG_EITHER,
  "Composition: square image, subject centered, shoulders visible, nothing cut off awkwardly at the chin or crown.",
  "Avoid: full-body shots, waist-up office photos, cartoons, illustration, 3D renders, multiple people, watermarks, frames, borders, or floating badges.",
].join(" ");

function portraitStylePreprompt(gradientBackdrop: boolean): string {
  if (!gradientBackdrop) return SPEAKER_PORTRAIT_STYLE_PREPROMPT;
  return SPEAKER_PORTRAIT_STYLE_PREPROMPT.replace(
    PORTRAIT_BG_EITHER,
    PORTRAIT_BG_GRADIENT,
  );
}

export function speakerPortraitObjectKey(modelId: string): string {
  const id = modelId.trim().replace(/[^a-zA-Z0-9._-]+/g, "_") || "voice";
  return `speaker-portraits/${id}.jpg`;
}

export function coerceAppearanceDescription(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 600);
}

export function coercePortraitBgColor(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 160);
}

export function coercePortraitImageKey(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const k = raw.trim();
  if (!k.startsWith("speaker-portraits/")) return null;
  return k.slice(0, 256);
}

/** Full image-model prompt: style lock + appearance + background. */
export function buildSpeakerPortraitPrompt(params: {
  name: string;
  appearanceDescription: string;
  portraitBgColor: string;
  gender?: "male" | "female" | null;
  /** Fish / Pro voices: backdrop is a two-color gradient, not a flat fill. */
  gradientBackdrop?: boolean;
}): string {
  const name = params.name.trim() || "the narrator";
  const appearance =
    coerceAppearanceDescription(params.appearanceDescription) ||
    "a warm, friendly adult narrator with natural features";
  const gradient = params.gradientBackdrop === true;
  const bg =
    coercePortraitBgColor(params.portraitBgColor) ||
    "a soft teal-to-blue gradient";
  const genderHint =
    params.gender === "male"
      ? "Present as male."
      : params.gender === "female"
        ? "Present as female."
        : "";

  return [
    portraitStylePreprompt(gradient),
    `Subject name (for identity only, do not render text): ${name}.`,
    genderHint,
    `Appearance: ${appearance}`,
    gradient
      ? `Background palette: ${bg}. Paint the backdrop as a soft two-color gradient. Do not use a flat single-color fill.`
      : `Background color / gradient: ${bg}`,
  ]
    .filter(Boolean)
    .join(" ");
}

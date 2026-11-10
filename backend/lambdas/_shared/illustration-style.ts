/**
 * Shared rendering lock for generated covers and scenes.
 * Voice portraits stay photographic. Illustrated vision-board images use this style; realistic ones do not.
 * Scene briefs stay separate; this is prepended at the model call.
 */
export const ILLUSTRATION_STYLE_PREPROMPT = `High-quality editorial vector illustration, crafted by a professional illustrator — rich, detailed and well-composed, in the spirit of premium wellness app artwork. Clean vector rendering: crisp shapes, smooth bezier curves, precise silhouettes, no visible outlines. Considered detail where it matters. Subtle flat shading and gentle tonal steps instead of gradients; a fine riso/paper grain over the whole image.

Palette (keep strictly to these families): warm sand #E9C890, pale cream #F3E6CC, dusty clay #8A6E5E, deep plum-brown #4E4352, sage #8FA27A, deep olive #5F7350, muted slate blue #7F93AE, soft navy #3B4459, warm gold accent #C8A46A. Muted, warm, low saturation. No neon, no pure black or white.

A clear focal point that reads well at thumbnail size. Stylised figures without detailed faces. No text, letters, logos or borders.`;

const STYLE_MARKER = "High-quality editorial vector illustration";

/** Prepend the illustration style once. Scene text that already includes it is left as-is. */
export function withIllustrationStyle(scene: string): string {
  const trimmed = scene.trim();
  if (!trimmed) return ILLUSTRATION_STYLE_PREPROMPT;
  if (trimmed.includes(STYLE_MARKER)) return trimmed;
  return `${ILLUSTRATION_STYLE_PREPROMPT}\n\n${trimmed}`;
}

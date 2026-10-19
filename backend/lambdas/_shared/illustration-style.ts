/**
 * Shared rendering lock for generated covers and scenes.
 * Voice portraits and the vision board stay photographic and do not use this.
 * Scene briefs stay separate; this is prepended at the model call.
 */
export const ILLUSTRATION_STYLE_PREPROMPT = `High-quality editorial vector illustration, crafted by a professional illustrator — rich, detailed and well-composed, in the spirit of modern travel posters and premium wellness app artwork. Clean vector rendering: crisp shapes, smooth bezier curves, precise silhouettes, no visible outlines. Depth through many layered planes and atmospheric perspective — foreground detail, mid-ground subject, hazy background — with distant layers lighter and lower in contrast. Considered detail where it matters: foliage built from varied leaf shapes, textured rock faces, wood grain on furniture, folds in fabric, reflections on water, soft light rays. Subtle flat shading and gentle tonal steps instead of gradients; a fine riso/paper grain over the whole image.

Palette (keep strictly to these families): warm sand #E9C890, pale cream #F3E6CC, dusty clay #8A6E5E, deep plum-brown #4E4352, sage #8FA27A, deep olive #5F7350, muted slate blue #7F93AE, soft navy #3B4459, warm gold accent #C8A46A. Muted, warm, low saturation; light comes from a low warm sun. No neon, no pure black or white.

Composition: a clear focal point with strong visual hierarchy, elegant framing, a sense of calm and space, and enough detail to reward a closer look while still reading at thumbnail size. Quiet, grounded, slightly nostalgic mood. People only if asked, as stylised figures without detailed faces. No text, letters, logos or borders.`;

const STYLE_MARKER = "High-quality editorial vector illustration";

/** Prepend the illustration style once. Scene text that already includes it is left as-is. */
export function withIllustrationStyle(scene: string): string {
  const trimmed = scene.trim();
  if (!trimmed) return ILLUSTRATION_STYLE_PREPROMPT;
  if (trimmed.includes(STYLE_MARKER)) return trimmed;
  return `${ILLUSTRATION_STYLE_PREPROMPT}\n\n${trimmed}`;
}

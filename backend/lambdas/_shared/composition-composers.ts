/** Allowed composer credits for Music › Compositions. */
export const COMPOSITION_COMPOSERS = [
  "zenmix",
  "Consciously Originals",
] as const;

export type CompositionComposer = (typeof COMPOSITION_COMPOSERS)[number];

export const DEFAULT_COMPOSITION_COMPOSER: CompositionComposer = "zenmix";

export function isCompositionComposer(raw: unknown): raw is CompositionComposer {
  return (
    typeof raw === "string" &&
    (COMPOSITION_COMPOSERS as readonly string[]).includes(raw.trim())
  );
}

/**
 * Coerce a stored/API value to a known composer.
 * Unknown / empty → default (`zenmix`) when `fallback` is true (default).
 */
export function normalizeCompositionComposer(
  raw: unknown,
  opts?: { fallback?: boolean },
): CompositionComposer | undefined {
  if (typeof raw === "string") {
    const v = raw.trim();
    if ((COMPOSITION_COMPOSERS as readonly string[]).includes(v)) {
      return v as CompositionComposer;
    }
  }
  if (opts?.fallback === false) return undefined;
  return DEFAULT_COMPOSITION_COMPOSER;
}

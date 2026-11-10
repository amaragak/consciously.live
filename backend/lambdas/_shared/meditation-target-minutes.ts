/** Creator-selected guided length. Keep in sync with the web/mobile clients. */
export type MeditationTargetMinutes = 5 | 10 | 20;
// v9: 2 min removed. Was: 2 | 5 | 10 | 20

export const MEDITATION_TARGET_MINUTES: readonly MeditationTargetMinutes[] = [
  // 2,
  5, 10, 20,
];

export const DEFAULT_MEDITATION_TARGET_MINUTES: MeditationTargetMinutes = 5;

/** Map any numeric length to the nearest allowed option (5 / 10 / 20). */
export function nearestMeditationTargetMinutes(
  minutes: number,
): MeditationTargetMinutes {
  if (!Number.isFinite(minutes)) return DEFAULT_MEDITATION_TARGET_MINUTES;
  let best: MeditationTargetMinutes = DEFAULT_MEDITATION_TARGET_MINUTES;
  let bestDist = Infinity;
  for (const opt of MEDITATION_TARGET_MINUTES) {
    const d = Math.abs(opt - minutes);
    if (d < bestDist) {
      best = opt;
      bestDist = d;
    }
  }
  return best;
}

export function coerceMeditationTargetMinutes(
  raw: unknown,
): MeditationTargetMinutes {
  if (MEDITATION_TARGET_MINUTES.includes(raw as MeditationTargetMinutes)) {
    return raw as MeditationTargetMinutes;
  }
  const n = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(n) && n > 0) return nearestMeditationTargetMinutes(n);
  return DEFAULT_MEDITATION_TARGET_MINUTES;
}

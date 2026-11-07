/**
 * Sound-step delivery styles: Casual · Guided · Open sits.
 * Persisted per account; passed through to script + audio assembly.
 */

import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

export type MeditationDelivery = "casual" | "guided" | "open_sits";

export const MEDITATION_DELIVERY_OPTIONS: Array<{
  id: MeditationDelivery;
  label: string;
  description: string;
}> = [
  {
    id: "casual",
    label: "Casual",
    description:
      "Straight to what you asked for, no settling in. For listening on the go.",
  },
  {
    id: "guided",
    label: "Guided",
    description: "A guided meditation, with pauses to settle into.",
  },
  {
    id: "open_sits",
    label: "Open sits",
    description: "Mostly silence, with a few short cues.",
  },
];

const STORAGE_KEY = "mm_meditation_delivery_v1";

export function parseMeditationDelivery(
  raw: unknown,
): MeditationDelivery | null {
  if (raw === "casual" || raw === "guided" || raw === "open_sits") return raw;
  return null;
}

export function readMeditationDeliveryPref(
  fallback: MeditationDelivery = "guided",
): MeditationDelivery {
  if (typeof window === "undefined") return fallback;
  try {
    return parseMeditationDelivery(readAccountLocalStorage(STORAGE_KEY)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeMeditationDeliveryPref(value: MeditationDelivery) {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}

export function deliveryLabel(value: MeditationDelivery): string {
  return (
    MEDITATION_DELIVERY_OPTIONS.find((o) => o.id === value)?.label ?? "Guided"
  );
}

export function deliveryDescription(value: MeditationDelivery): string {
  return (
    MEDITATION_DELIVERY_OPTIONS.find((o) => o.id === value)?.description ?? ""
  );
}

/** Map legacy longerBreaks boolean ↔ delivery. */
export function deliveryFromLongerBreaks(longerBreaks: boolean): MeditationDelivery {
  return longerBreaks ? "open_sits" : "guided";
}

export function longerBreaksFromDelivery(delivery: MeditationDelivery): boolean {
  return delivery === "open_sits";
}

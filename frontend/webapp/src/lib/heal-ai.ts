/**
 * Heal text calls. Cheap Haiku on the server. Every call is item-scoped
 * and only runs after that item's AI consent.
 */

import {
  getMedimadeApiBase,
  medimadeApiAuthHeaders,
  medimadeFetch,
} from "@/lib/medimade-api";
import type { HealLens, HealType } from "@/lib/heal-store";

export type HealFlagKind = "self_blame" | "resentment" | "absolute" | "rumination";

export type HealFlag = {
  quote: string;
  kind: HealFlagKind;
  lenses: Record<HealLens, string>;
};

async function postHeal(
  path: "/heal/ai" | "/heal/screen",
  body: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const base = getMedimadeApiBase();
  if (!base) return null;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 28_000);
  try {
    const res = await medimadeFetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...medimadeApiAuthHeaders(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function asLensMap(value: unknown): Record<HealLens, string> | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const kind = typeof o.kind === "string" ? o.kind.trim() : "";
  const forgive = typeof o.forgive === "string" ? o.forgive.trim() : "";
  const accept = typeof o.accept === "string" ? o.accept.trim() : "";
  const gave = typeof o.gave === "string" ? o.gave.trim() : "";
  if (!kind || !forgive || !accept || !gave) return null;
  return { kind, forgive, accept, gave };
}

export async function healNewPerspective(input: {
  type: HealType;
  title: string;
  text: string;
}): Promise<HealFlag[] | null> {
  const data = await postHeal("/heal/ai", { action: "perspective", ...input });
  if (!data || !Array.isArray(data.flags)) return null;
  const flags: HealFlag[] = [];
  for (const row of data.flags) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const quote = typeof o.quote === "string" ? o.quote : "";
    const kind = o.kind;
    const lenses = asLensMap(o.lenses);
    if (!quote || !lenses) continue;
    if (
      kind !== "self_blame" &&
      kind !== "resentment" &&
      kind !== "absolute" &&
      kind !== "rumination"
    ) {
      continue;
    }
    flags.push({ quote, kind, lenses });
  }
  return flags;
}

export async function healRetryLens(input: {
  type: HealType;
  title: string;
  quote: string;
  lens: HealLens;
  text: string;
}): Promise<string | null> {
  const data = await postHeal("/heal/ai", { action: "retry-lens", ...input });
  const text = data && typeof data.text === "string" ? data.text.trim() : "";
  return text || null;
}

export async function healSuggest(input: {
  type: HealType;
  title: string;
  writing: string;
  ask: string;
}): Promise<string | null> {
  const data = await postHeal("/heal/ai", { action: "suggest", ...input });
  const text = data && typeof data.text === "string" ? data.text.trim() : "";
  return text || null;
}

export async function healFriendSwap(input: {
  type: HealType;
  title: string;
  text: string;
}): Promise<string | null> {
  const data = await postHeal("/heal/ai", { action: "friend-swap", ...input });
  const text = data && typeof data.text === "string" ? data.text.trim() : "";
  return text || null;
}

/** Explicit suicidal intent or self-harm only. Failure returns false and never blocks writing. */
export async function healAskAngle(input: {
  type: HealType;
  title: string;
  seeingText: string;
  reframe: string;
  writing: string;
  asked: string[];
}): Promise<string | null> {
  const data = await postHeal("/heal/ai", { action: "angle", ...input });
  const question = data && typeof data.question === "string" ? data.question.trim() : "";
  return question || null;
}

export async function healScreenRisk(text: string): Promise<boolean> {
  const trimmed = text.trim();
  if (trimmed.length < 8) return false;
  const data = await postHeal("/heal/screen", { text: trimmed });
  return data?.flagged === true;
}

export function defaultLensForKind(kind: HealFlagKind): HealLens {
  if (kind === "self_blame") return "kind";
  if (kind === "resentment") return "forgive";
  if (kind === "absolute") return "accept";
  return "gave";
}

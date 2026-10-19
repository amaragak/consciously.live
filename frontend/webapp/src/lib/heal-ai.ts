/**
 * Heal text calls. Cheap Haiku on the server. Every call is item-scoped
 * and only runs after that item's AI consent.
 */

import {
  getMedimadeApiBase,
  medimadeApiAuthHeaders,
  medimadeFetch,
} from "@/lib/medimade-api";
import type { HealCanDo, HealLens, HealSeeLens, HealType } from "@/lib/heal-store";

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
export type HealSetupResult = {
  type: HealType;
  badDayText: string;
  goodDayText: string | null;
  canDo: HealCanDo;
  exercises: string[];
};

const HEAL_TYPES = new Set([
  "grief",
  "heartbreak",
  "regret",
  "resentment",
  "pattern",
  "recurring_thought",
  "belief",
  "fear",
  "shame",
  "other",
]);

export async function healSetup(input: {
  title: string;
  update: string;
}): Promise<HealSetupResult | null> {
  const data = await postHeal("/heal/ai", { action: "setup", title: input.title, update: input.update });
  if (!data) return null;
  const type = typeof data.type === "string" && HEAL_TYPES.has(data.type) ? (data.type as HealType) : "other";
  const canDo = data.canDo === "yes" || data.canDo === "no" || data.canDo === "not_sure" ? data.canDo : "not_sure";
  const exercises = Array.isArray(data.exercises)
    ? data.exercises.filter((row): row is string => typeof row === "string" && row.trim().length > 0).slice(0, 10)
    : [];
  const update = input.update;
  const bad = typeof data.badDayText === "string" && update.includes(data.badDayText) ? data.badDayText.trim() : "";
  const good =
    typeof data.goodDayText === "string" && data.goodDayText.trim() && update.includes(data.goodDayText)
      ? data.goodDayText.trim()
      : null;
  return { type, badDayText: bad, goodDayText: good, canDo, exercises };
}

export async function healSuggestMore(input: {
  type: HealType;
  title: string;
  canDo: HealCanDo | null;
  context: string;
}): Promise<string[]> {
  const data = await postHeal("/heal/ai", { action: "suggest-more", ...input });
  if (!data || !Array.isArray(data.questions)) return [];
  return data.questions.filter((row): row is string => typeof row === "string" && row.trim().length > 0).slice(0, 3);
}

export async function healAfterUpdate(input: {
  type: HealType;
  title: string;
  canDo: HealCanDo | null;
  context: string;
}): Promise<{ retire: string[]; add: string[]; goodDayConflict: boolean; topic: string } | null> {
  const data = await postHeal("/heal/ai", { action: "after-update", ...input });
  if (!data) return null;
  return {
    retire: Array.isArray(data.retire) ? data.retire.filter((row): row is string => typeof row === "string") : [],
    add: Array.isArray(data.add)
      ? data.add.filter((row): row is string => typeof row === "string" && row.trim().length > 0).slice(0, 3)
      : [],
    goodDayConflict: data.goodDayConflict === true,
    topic: typeof data.topic === "string" ? data.topic.trim() : "",
  };
}

export async function healLenses(input: {
  type: HealType;
  title: string;
  context: string;
  lens?: HealSeeLens;
}): Promise<Partial<Record<HealSeeLens, string>> | null> {
  const data = await postHeal("/heal/ai", { action: "lenses", ...input });
  if (!data) return null;
  if (input.lens) {
    const text = typeof data.text === "string" ? data.text.trim() : "";
    return text ? { [input.lens]: text } : null;
  }
  const out: Partial<Record<HealSeeLens, string>> = {};
  for (const key of ["kind", "forgive", "accept", "long"] as const) {
    if (typeof data[key] === "string" && data[key].trim()) out[key] = data[key].trim();
  }
  return Object.keys(out).length ? out : null;
}

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

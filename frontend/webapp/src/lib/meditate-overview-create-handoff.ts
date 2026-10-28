/**
 * Meditate overview hero → Create handoff.
 * Overview writes a draft + target step; CreateOneFlow consumes it once on mount.
 */

import {
  emptyCreateOneFlowState,
  type CreateOneFlowState,
  type CreateOneFlowStep,
  type MeditationLengthMinutes,
} from "@/lib/create-one-flow-state";

const KEY = "mm_meditate_overview_create_v1";

export type MeditateOverviewCreateHandoff = {
  v: 1;
  step: Extract<CreateOneFlowStep, "shape" | "sound">;
  state: CreateOneFlowState;
};

export function writeMeditateOverviewCreateHandoff(
  handoff: MeditateOverviewCreateHandoff,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    /* */
  }
}

export function peekMeditateOverviewCreateHandoff(): MeditateOverviewCreateHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MeditateOverviewCreateHandoff;
    if (parsed?.v !== 1) return null;
    if (parsed.step !== "shape" && parsed.step !== "sound") return null;
    if (!parsed.state || parsed.state.v !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function consumeMeditateOverviewCreateHandoff(): MeditateOverviewCreateHandoff | null {
  const handoff = peekMeditateOverviewCreateHandoff();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* */
    }
  }
  return handoff;
}

export function buildOverviewCreateState(opts: {
  prompt: string;
  lengthMinutes: MeditationLengthMinutes;
  style?: CreateOneFlowState["style"];
  program?: CreateOneFlowState["program"];
  journals?: CreateOneFlowState["journals"];
  goal?: CreateOneFlowState["goal"];
  heal?: CreateOneFlowState["heal"];
  surpriseScript?: string | null;
}): CreateOneFlowState {
  return {
    ...emptyCreateOneFlowState(opts.lengthMinutes),
    prompt: opts.prompt.trim(),
    style: opts.style ?? null,
    program: opts.program ?? null,
    journals: opts.journals ?? [],
    goal: opts.goal ?? null,
    heal: opts.heal ?? null,
    surpriseScript: opts.surpriseScript ?? null,
  };
}

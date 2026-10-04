/**
 * Unified Start → Shape → Sound create flow state.
 * In-memory only (React state). Step lives in `?step=`.
 * Do not persist the draft to localStorage / sessionStorage.
 */

import { CREATE_MEDITATE_ROOT } from "@/lib/create-meditation-path";
import type { MeditationStyleLabel } from "@/lib/meditation-style-intake";

/** Legacy key — removed on load so old drafts cannot resurrect after refresh. */
export const CREATE_ONE_FLOW_STORAGE_KEY = "mm_create_one_flow_v1";

export type CreateOneFlowStep = "start" | "shape" | "sound";

export type CreateFlowProgramMode = "one" | "perSession";

export type CreateFlowContextKind =
  | "style"
  | "program"
  | "journal"
  | "goal"
  | "start";

export type CreateFlowChatTurn = {
  role: "user" | "assistant";
  text: string;
  /** Assistant included [[READY]]; keep marker when replaying to the coach API. */
  ready?: boolean;
  /**
   * Mid-chat attachment shown as a “Context added” row (not a typed bubble).
   * Still sent to the coach as a user turn.
   */
  kind?: "context";
  contextKind?: CreateFlowContextKind;
  contextDetail?: string | null;
  /** Optional cover for program (and similar) context rows. */
  contextImageUrl?: string | null;
};

export type CreateFlowProgramAttachment = {
  id: string;
  title: string;
  coverImageUrl?: string | null;
  mode: CreateFlowProgramMode;
  /** Selected session/day ids (empty = all in per-session mode until edited). */
  sessionIds: string[];
  sessionTitles: Record<string, string>;
};

export type CreateFlowJournalAttachment = {
  id: string;
  title: string;
  detail?: string | null;
  /** Plain body for coach context (from journal handoff). */
  bodyPlain?: string | null;
};

export type CreateFlowGoalAttachment = {
  lifeAreaId: string;
  lifeAreaTitle: string;
  goalId?: string | null;
  goalTitle?: string | null;
};

export type CreateFlowStyleAttachment = {
  id: MeditationStyleLabel;
};

export type CreateOneFlowState = {
  v: 1;
  prompt: string;
  style: CreateFlowStyleAttachment | null;
  program: CreateFlowProgramAttachment | null;
  journals: CreateFlowJournalAttachment[];
  goal: CreateFlowGoalAttachment | null;
  chat: CreateFlowChatTurn[];
  /** Style-question answers keyed by question index or id. */
  answers: Record<string, string>;
  lengthMinutes: 2 | 5 | 10 | 20;
  /** Set when Surprise me picked a seed script. */
  surpriseScript?: string | null;
};

function coerceLength(n: unknown): 2 | 5 | 10 | 20 {
  if (n === 2 || n === 5 || n === 10 || n === 20) return n;
  return 5;
}

export function emptyCreateOneFlowState(
  lengthMinutes: 2 | 5 | 10 | 20 = 5,
): CreateOneFlowState {
  return {
    v: 1,
    prompt: "",
    style: null,
    program: null,
    journals: [],
    goal: null,
    chat: [],
    answers: {},
    lengthMinutes: coerceLength(lengthMinutes),
    surpriseScript: null,
  };
}

/** Always null — draft is not persisted. Clears any legacy storage keys. */
export function loadCreateOneFlowState(): CreateOneFlowState | null {
  clearCreateOneFlowState();
  return null;
}

/** No-op — draft is not persisted. */
export function saveCreateOneFlowState(_state: CreateOneFlowState): void {
  clearCreateOneFlowState();
}

export function clearCreateOneFlowState(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CREATE_ONE_FLOW_STORAGE_KEY);
    localStorage.removeItem(CREATE_ONE_FLOW_STORAGE_KEY);
  } catch {
    /* */
  }
}

export function parseCreateOneFlowStep(
  raw: string | null | undefined,
): CreateOneFlowStep {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "shape" || s === "sound") return s;
  return "start";
}

export function createOneFlowHref(step: CreateOneFlowStep): string {
  if (step === "start") return CREATE_MEDITATE_ROOT;
  return `${CREATE_MEDITATE_ROOT}?step=${step}`;
}

/** Map legacy create paths into the one-flow step (+ optional seed hints). */
export function legacyCreatePathToOneFlow(pathname: string): {
  step: CreateOneFlowStep;
  seed?: "style" | "program" | "journal" | "goal" | "chat" | "oneshot" | "surprise";
} {
  if (pathname.includes("/mix")) return { step: "sound" };
  if (pathname.includes("/from-chat")) return { step: "shape", seed: "chat" };
  if (pathname.includes("/from-program")) {
    if (pathname.includes("/chat") || pathname.includes("/sessions")) {
      return { step: "shape", seed: "program" };
    }
    return { step: "start", seed: "program" };
  }
  if (pathname.includes("/from-journal")) return { step: "start", seed: "journal" };
  if (pathname.includes("/from-idea")) return { step: "start", seed: "goal" };
  if (pathname.includes("/from-prompt")) return { step: "start", seed: "oneshot" };
  if (pathname.includes("/by-type")) {
    if (pathname.includes("/questions")) return { step: "shape", seed: "style" };
    return { step: "start", seed: "style" };
  }
  return { step: "start" };
}

export function attachStyleExclusive(
  state: CreateOneFlowState,
  style: CreateFlowStyleAttachment | null,
): CreateOneFlowState {
  if (!style) return { ...state, style: null };
  return {
    ...state,
    style,
    program: null,
  };
}

export function attachProgramExclusive(
  state: CreateOneFlowState,
  program: CreateFlowProgramAttachment | null,
): CreateOneFlowState {
  if (!program) return { ...state, program: null };
  return {
    ...state,
    program,
    style: null,
  };
}

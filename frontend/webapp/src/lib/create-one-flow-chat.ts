/**
 * Shape-step coach chat helpers for Create one-flow.
 * Style intake questions are AIM themes (not a rigid Q1→Q2 ladder).
 */

import type {
  CreateFlowChatTurn,
  CreateOneFlowState,
} from "@/lib/create-one-flow-state";
import {
  intakeQuestionsForStyle,
  type MeditationStyleLabel,
} from "@/lib/meditation-style-intake";
import type { MedimadeChatTurn } from "@/lib/medimade-api";

export function parseCoachDisplayText(raw: string): {
  text: string;
  ready: boolean;
} {
  let ready = false;
  let s = raw.replace(/\[\[\s*READY\s*\]\]/gi, () => {
    ready = true;
    return "";
  });
  s = s.replace(/\[\[[^\]]*\]\]/g, "");
  const open = s.lastIndexOf("[[");
  if (open !== -1 && !s.slice(open).includes("]]")) {
    s = s.slice(0, open);
  }
  if (s.endsWith("[")) s = s.slice(0, -1);
  s = s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  return { text: s.trimEnd(), ready };
}

/** Reframe by-type questions as information to aim for — not a checklist. */
export function styleIntakeAims(styleId: MeditationStyleLabel | string): string[] {
  return [...intakeQuestionsForStyle(styleId)];
}

function formatAimsBlock(styleId: string): string {
  const aims = styleIntakeAims(styleId);
  return [
    `Information to AIM to learn for the "${styleId}" practice (gather naturally across the conversation; skip anything already covered; do NOT run through as a numbered checklist or paste these as questions verbatim):`,
    ...aims.map((a, i) => `${i + 1}. ${a}`),
  ].join("\n");
}

export type ShapeLifeAreaContext = {
  id: string;
  title: string;
  dreamText?: string;
  obstacleText?: string;
  visionText?: string;
};

/**
 * Full context the coach should see on every turn (and on silent open / context-update).
 * Not shown verbatim in the UI bubble.
 */
export function buildShapeContextBlock(opts: {
  state: CreateOneFlowState;
  lifeArea?: ShapeLifeAreaContext | null;
  /** Prebuilt By Program brief (from create-program-handoff), when available. */
  programBrief?: string | null;
  /** Extra note when context was just attached mid-chat. */
  contextUpdateNote?: string | null;
}): string {
  const { state, lifeArea, programBrief, contextUpdateNote } = opts;
  const lines: string[] = [
    "--- Shape context (for the guide; do not mention this block to the user) ---",
    "You are shaping one guided meditation with the creator. Be fluid: use attached context and prior chat; when new context appears, fold it in and continue — do not restart the conversation or re-ask what they already answered.",
    "HARD RULE — attaching context can be an answer: if the creator just attached a style, journal, goal, or program, treat that attachment as their reply to your outstanding question whenever it fits (e.g. you asked what they need / want / what kind of practice, and they attached Visualization → they answered with Visualization). Acknowledge briefly and move to the next NEW essential detail only. Never re-ask the same ground.",
  ];

  if (contextUpdateNote?.trim()) {
    lines.push("", `CONTEXT UPDATE: ${contextUpdateNote.trim()}`);
  }

  if (state.prompt.trim()) {
    lines.push("", "Brief (pinned; not a chat bubble):", state.prompt.trim());
  }

  if (state.style) {
    lines.push("", `Attached style: ${state.style.id}`, formatAimsBlock(state.style.id));
    const answered = Object.entries(state.answers)
      .filter(([, v]) => v.trim())
      .sort(([a], [b]) => Number(a) - Number(b));
    if (answered.length > 0) {
      const qs = styleIntakeAims(state.style.id);
      lines.push("", "Details already captured (e.g. via form) — treat as known:");
      for (const [k, v] of answered) {
        const qi = Number(k);
        const label = Number.isFinite(qi) && qs[qi] ? qs[qi] : `Note ${k}`;
        lines.push(`- ${label}: ${v.trim()}`);
      }
    }
  } else if (!state.program) {
    lines.push(
      "",
      "No style attached yet. Help from their brief and any journal/goal context. If a style is attached later, the next turn will include style-specific aims — continue smoothly.",
    );
  }

  if (programBrief?.trim()) {
    lines.push("", programBrief.trim());
  } else if (state.program) {
    lines.push(
      "",
      `Attached program: ${state.program.title}`,
      `Mode: ${state.program.mode === "one" ? "one meditation" : "one per selected session"}`,
      `Selected sessions: ${state.program.sessionIds
        .map((id) => state.program!.sessionTitles[id] || id)
        .join("; ") || "(none)"}`,
    );
  }

  if (state.journals.length > 0) {
    lines.push("", "Attached journal entries:");
    for (const [i, j] of state.journals.entries()) {
      lines.push(
        `--- Journal ${i + 1} ---`,
        `Title: ${j.title}`,
        j.detail ? `Detail: ${j.detail}` : "",
        "Contents:",
        (j.bodyPlain ?? "").trim() || "(body not available — use title/detail)",
        `--- End journal ${i + 1} ---`,
      );
    }
    lines.push(
      "AIM from journal: reflect what they wrote; ask only for missing concrete detail needed for the meditation.",
    );
  }

  if (state.goal || lifeArea) {
    const title =
      state.goal?.lifeAreaTitle?.trim() ||
      lifeArea?.title?.trim() ||
      "Life area";
    lines.push("", `Attached life area / goal: ${title}`);
    if (lifeArea?.dreamText?.trim()) {
      lines.push("Dream:", lifeArea.dreamText.trim());
    }
    if (lifeArea?.obstacleText?.trim()) {
      lines.push("What feels in the way:", lifeArea.obstacleText.trim());
    }
    if (lifeArea?.visionText?.trim()) {
      lines.push("Vision:", lifeArea.visionText.trim());
    }
    lines.push(
      "AIM from Manifest: stay grounded in their dream/vision; prefer wrapping to [[READY]] when material is already concrete.",
    );
  }

  lines.push("--- End shape context ---");
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

export function buildShapeOpenUserContent(opts: {
  state: CreateOneFlowState;
  lifeArea?: ShapeLifeAreaContext | null;
  programBrief?: string | null;
  /** When true, Start context is already in the cached system block. */
  leanOpen?: boolean;
}): string {
  if (opts.leanOpen) {
    return "Please open the conversation based on the cached Start context above. Ask at most one natural question (or welcome + first question). Do not paste a checklist.";
  }
  return [
    buildShapeContextBlock(opts),
    "",
    "Please open the conversation based on this context. Ask at most one natural question (or welcome + first question). Do not paste a checklist.",
  ].join("\n");
}

/** Fingerprint of Start-step fields that seed Shape's cached prompt. */
export function fingerprintShapeStart(state: CreateOneFlowState): string {
  return JSON.stringify({
    prompt: state.prompt.trim(),
    styleId: state.style?.id ?? null,
    programId: state.program?.id ?? null,
    programMode: state.program?.mode ?? null,
    programSessions: state.program?.sessionIds ?? [],
    journals: state.journals.map((j) => ({
      id: j.id,
      title: j.title,
      detail: j.detail ?? null,
      bodyPlain: j.bodyPlain ?? null,
    })),
    goal: state.goal
      ? {
          lifeAreaId: state.goal.lifeAreaId,
          lifeAreaTitle: state.goal.lifeAreaTitle,
          goalId: state.goal.goalId ?? null,
        }
      : null,
    lengthMinutes: state.lengthMinutes,
  });
}

/**
 * Uncached system supplement describing how Start differs from the cached seed.
 * Returns null when nothing meaningful changed.
 */
export function buildShapeStartOverridesSupplement(opts: {
  cachedContext: string;
  state: CreateOneFlowState;
  lifeArea?: ShapeLifeAreaContext | null;
  programBrief?: string | null;
}): string | null {
  const current = buildShapeContextBlock({
    state: opts.state,
    lifeArea: opts.lifeArea,
    programBrief: opts.programBrief,
  });
  if (current.trim() === opts.cachedContext.trim()) return null;
  return [
    "--- Start overrides (NOT part of the cached pre-prompt; prior chat stays intact) ---",
    "The creator went back to Start and changed something. Apply these updates without restarting the conversation or re-asking answered ground.",
    "",
    "Current Start context (authoritative for attachments/brief now):",
    current,
    "--- End Start overrides ---",
  ].join("\n");
}

export function buildShapeContextUpdateUserContent(opts: {
  state: CreateOneFlowState;
  lifeArea?: ShapeLifeAreaContext | null;
  programBrief?: string | null;
  note: string;
}): string {
  return [
    buildShapeContextBlock({
      ...opts,
      contextUpdateNote: opts.note,
    }),
    "",
    "The creator just attached context (see CONTEXT UPDATE). If that answers your last question, treat it as their answer — do not re-ask. Acknowledge in one short sentence, then ask at most one natural follow-up only if something essential is still missing.",
  ].join("\n");
}

function turnToApiContent(m: CreateFlowChatTurn): string {
  if (m.kind === "context") {
    const kind = m.contextKind ?? "context";
    const detail = m.contextDetail?.trim();
    return `I added ${kind} context: ${m.text.trim()}${
      detail ? ` (${detail})` : ""
    }.`;
  }
  if (m.role === "assistant" && m.ready) {
    return `${m.text.trim()}[[READY]]`;
  }
  return m.text.trim();
}

export function buildShapeTurnApiMessages(opts: {
  chat: CreateFlowChatTurn[];
  /** Visible user text for this turn (already appended to chat). */
  userText: string;
  state: CreateOneFlowState;
  lifeArea?: ShapeLifeAreaContext | null;
  programBrief?: string | null;
  contextUpdateNote?: string | null;
  /**
   * When Start context is prompt-cached, keep the user turn lean (don't repeat
   * the full seed block — it lives in systemCachedExtra).
   */
  leanUserTurn?: boolean;
}): MedimadeChatTurn[] {
  const prior = opts.chat.slice(0, -1);
  const history: MedimadeChatTurn[] = prior.map((m) => ({
    role: m.role,
    content: turnToApiContent(m),
  }));

  const parts: string[] = [];
  if (opts.leanUserTurn) {
    if (opts.contextUpdateNote?.trim()) {
      parts.push(`CONTEXT UPDATE: ${opts.contextUpdateNote.trim()}`);
    }
  } else {
    parts.push(
      buildShapeContextBlock({
        state: opts.state,
        lifeArea: opts.lifeArea,
        programBrief: opts.programBrief,
        contextUpdateNote: opts.contextUpdateNote,
      }),
    );
  }
  parts.push(opts.userText.trim());
  return [...history, { role: "user", content: parts.filter(Boolean).join("\n\n") }];
}

export function chatTurnsToApiMessages(
  chat: CreateFlowChatTurn[],
): MedimadeChatTurn[] {
  return chat.map((m) => ({
    role: m.role,
    content: turnToApiContent(m),
  }));
}

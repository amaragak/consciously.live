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
  intakeShortTitlesForStyle,
  type MeditationStyleLabel,
} from "@/lib/meditation-style-intake";
import type { MedimadeChatTurn } from "@/lib/medimade-api";

export function parseCoachDisplayText(raw: string): {
  text: string;
  ready: boolean;
  aimCovered: number[];
  aimAsking?: number;
} {
  let ready = false;
  const aimCovered: number[] = [];
  let aimAsking: number | undefined;
  let s = raw.replace(/\[\[\s*READY\s*\]\]/gi, () => {
    ready = true;
    return "";
  });
  s = s.replace(/\[\[\s*ASKING\s*:\s*(\d+)\s*\]\]/gi, (_, n: string) => {
    const v = Number(n);
    if (Number.isInteger(v) && v >= 1) aimAsking = v - 1;
    return "";
  });
  s = s.replace(/\[\[\s*AIM\s*:\s*([\d,\s]+)\s*\]\]/gi, (_, nums: string) => {
    for (const part of nums.split(",")) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && n >= 1) aimCovered.push(n - 1);
    }
    return "";
  });
  s = s.replace(/\[\[[^\]]*\]\]/g, "");
  const open = s.lastIndexOf("[[");
  if (open !== -1 && !s.slice(open).includes("]]")) {
    s = s.slice(0, open);
  }
  if (s.endsWith("[")) s = s.slice(0, -1);
  s = s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  return {
    text: s.trimEnd(),
    ready,
    aimCovered: [...new Set(aimCovered)],
    ...(aimAsking != null ? { aimAsking } : {}),
  };
}

const AIM_MATCH_STOP = new Set([
  "the",
  "and",
  "you",
  "your",
  "are",
  "for",
  "this",
  "that",
  "with",
  "does",
  "did",
  "have",
  "has",
  "been",
  "from",
  "about",
  "just",
  "now",
  "else",
  "or",
  "a",
  "an",
  "to",
  "of",
  "on",
  "it",
  "is",
  "do",
  "if",
]);

function lastQuestionInText(text: string): string | null {
  const parts = text.split(/(?<=[?])/);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i]?.trim();
    if (p?.includes("?")) return p;
  }
  return null;
}

function aimWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function aimContentTokens(s: string): string[] {
  return aimWords(s)
    .filter((w) => w.length > 2 && !AIM_MATCH_STOP.has(w))
    .map((w) => (w.endsWith("s") && w.length > 4 ? w.slice(0, -1) : w));
}

function aimMatchScore(question: string, aim: string, shortTitle: string): number {
  const q = ` ${aimWords(question).join(" ")} `;
  const qTokens = new Set(aimContentTokens(question));
  let score = 0;
  const titleNorm = aimWords(shortTitle).join(" ");
  if (titleNorm.length >= 8 && q.includes(` ${titleNorm} `)) score += 8;
  const phrases = new Set<string>();
  for (const source of [shortTitle, aim]) {
    const words = aimWords(source);
    for (let n = 2; n <= 3; n += 1) {
      for (let i = 0; i + n <= words.length; i += 1) {
        const p = words.slice(i, i + n).join(" ");
        if (p.length >= 8) phrases.add(p);
      }
    }
  }
  for (const p of phrases) {
    if (q.includes(` ${p} `)) score += 6;
  }
  for (const w of aimContentTokens(`${aim} ${shortTitle}`)) {
    if (qTokens.has(w)) score += 1;
  }
  return score;
}

/**
 * Guess which AIM the coach is asking about from the last question.
 * Used only when [[ASKING:n]] is missing — no extra model call.
 */
export function inferAimAskingIndex(
  assistantText: string,
  aims: string[],
  shortTitles: string[] = [],
): number | null {
  const question = lastQuestionInText(assistantText);
  if (!question || aims.length === 0) return null;
  let best = -1;
  let bestScore = 0;
  let second = 0;
  for (let i = 0; i < aims.length; i += 1) {
    const score = aimMatchScore(question, aims[i] ?? "", shortTitles[i] ?? "");
    if (score > bestScore) {
      second = bestScore;
      bestScore = score;
      best = i;
    } else if (score > second) {
      second = score;
    }
  }
  if (best < 0 || bestScore < 2 || bestScore === second) return null;
  return best;
}

/**
 * If the coach's latest question is clearly about AIM k, treat 0..k-1 as covered
 * even when [[AIM:n]] / [[ASKING:n]] were omitted.
 */
export function priorAimsImpliedCovered(
  assistantText: string,
  aims: string[],
  shortTitles: string[] = [],
): number[] {
  const asking = inferAimAskingIndex(assistantText, aims, shortTitles);
  if (asking == null || asking <= 0) return [];
  return Array.from({ length: asking }, (_, i) => i);
}

export function resolveAimMarkers(
  parsed: {
    text: string;
    ready: boolean;
    aimCovered: number[];
    aimAsking?: number;
  },
  styleId?: string,
): { aimCovered: number[]; aimAsking?: number; ready: boolean } {
  const aims = styleId ? styleIntakeAims(styleId) : [];
  const titles = styleId ? [...intakeShortTitlesForStyle(styleId)] : [];
  const covered = new Set(parsed.aimCovered);
  let asking = parsed.aimAsking;
  if (parsed.ready) {
    aims.forEach((_, i) => covered.add(i));
    return { aimCovered: [...covered].sort((a, b) => a - b), ready: true };
  }
  if (asking == null && aims.length > 0) {
    const inferred = inferAimAskingIndex(parsed.text, aims, titles);
    if (inferred != null) asking = inferred;
  }
  if (asking != null && asking > 0) {
    for (let i = 0; i < asking; i += 1) covered.add(i);
  }
  return {
    aimCovered: [...covered].sort((a, b) => a - b),
    ...(asking != null ? { aimAsking: asking } : {}),
    ready: parsed.ready,
  };
}

export function collectStyleAimCoverage(
  chat: CreateFlowChatTurn[],
  aims: string[],
  shortTitles: string[] = [],
): { covered: Set<number>; asking: number | null; ready: boolean } {
  const covered = new Set<number>();
  let asking: number | null = null;
  let ready = false;
  for (const t of chat) {
    if (t.role !== "assistant") continue;
    if (t.ready) ready = true;
    for (const i of t.aimCovered ?? []) covered.add(i);
    if (t.aimAsking != null && t.aimAsking >= 0) {
      asking = t.aimAsking;
      for (let i = 0; i < t.aimAsking; i += 1) covered.add(i);
    } else {
      const inferred = inferAimAskingIndex(t.text, aims, shortTitles);
      if (inferred != null) {
        asking = inferred;
        for (let i = 0; i < inferred; i += 1) covered.add(i);
      }
    }
  }
  if (ready) {
    aims.forEach((_, i) => covered.add(i));
    asking = null;
  }
  return { covered, asking, ready };
}

export function styleRailMarkerInstruction(
  chat: CreateFlowChatTurn[],
  styleId: string,
): string {
  const qs = styleIntakeAims(styleId);
  const titles = [...intakeShortTitlesForStyle(styleId)];
  if (qs.length === 0) return "";
  const { covered, asking, ready } = collectStyleAimCoverage(chat, qs, titles);
  const allDone = ready || qs.every((_, i) => covered.has(i));
  if (allDone) {
    return "RAIL: all Format AIM items are done. Emit [[READY]] (hidden). Do not re-ask covered items unless the creator reopens one.";
  }
  const current =
    asking != null && !covered.has(asking)
      ? asking
      : qs.findIndex((_, i) => !covered.has(i));
  const doneLabels = qs
    .map((_, i) => (covered.has(i) ? `${i + 1} (${titles[i]})` : null))
    .filter((x): x is string => Boolean(x));
  const upcoming = qs
    .map((_, i) =>
      !covered.has(i) && i !== current ? `${i + 1} (${titles[i]})` : null,
    )
    .filter((x): x is string => Boolean(x));
  return [
    "RAIL (Format checklist the creator sees — keep markers in sync; wording may stay fluid, not a numbered quiz):",
    doneLabels.length > 0 ? `Done: ${doneLabels.join("; ")}.` : "Done: none yet.",
    Number.isInteger(current) && current >= 0
      ? `Current: ${current + 1} (${titles[current]}).`
      : "Current: none.",
    upcoming.length > 0 ? `Upcoming: ${upcoming.join("; ")}.` : "Upcoming: none.",
    "Hidden markers required in every assistant reply: [[ASKING:n]] for the item you are asking about now (keep the same n on follow-ups). When item n is answered, covered by journal/goal, or skipped, also emit [[AIM:n]]. Moving on in one reply: [[AIM:n]][[ASKING:n+1]]. [[READY]] only when every remaining item is done or skipped. Never show markers to the user.",
  ].join("\n");
}

/** Reframe by-type questions as information to aim for — not a checklist. */
export function styleIntakeAims(styleId: MeditationStyleLabel | string): string[] {
  return [...intakeQuestionsForStyle(styleId)];
}

function formatAimsBlock(styleId: string): string {
  const aims = styleIntakeAims(styleId);
  return [
    `Information to AIM to learn for the "${styleId}" practice (gather naturally across the conversation; skip anything already covered by chat, journal, or goal — and when you skip, confirm how you will use that covered material in the meditation; the creator may skip any item; do NOT run through as a numbered checklist or paste these as questions verbatim):`,
    ...aims.map((a, i) => `${i + 1}. ${a}`),
    "PROGRESS MARKERS (never show to the user). Every assistant reply must include [[ASKING:n]] for the AIM item you are asking about now (1-based; keep the same n on follow-ups), OR omit [[ASKING:]] on a confirm-only turn when you are only marking covered items, OR [[READY]] if every remaining item is done or skipped. Also emit [[AIM:k]] for each item now done. Moving on in one reply: [[AIM:n]][[ASKING:n+1]]. You may gather themes fluidly — do not paste these as a numbered quiz — but markers must match what you are actually asking or confirming.",
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
    "PURPOSE: Gather enough information to create a meditation in the attached FORMAT — either a Style practice OR a Program (never both; they may overlap in theme, but the creator picks one). Journal entries and Manifest goals are CONTEXT: they are always valuable. They may already answer some required questions — if they clearly do, count those answered and do not re-ask. They never replace the format. The finished meditation should always hint at / weave in attached journal and goal context.",
    "You are shaping that meditation with the creator. Be fluid: use attached context and prior chat; when new context appears, fold it in and continue — do not restart the conversation.",
    "REQUIRED QUESTIONS: For a Style, gather the style AIM items unless the creator skips. For a Program, gather each selected session's Ask-items unless the creator skips. Do not emit [[READY]] until those required items are answered or skipped (or there is no format and the brief + context is enough for a general practice).",
    "CONTEXT USE RULE (every turn): For each required Format item (Style AIM / Program Ask-item), decide whether the brief, journal, goal, or prior chat already answers it.",
    "— If YES: count it answered (emit [[AIM:n]] for styles). Confirm in plain words how you will use that material in the meditation (one concrete construction cue — e.g. weaving a named worry into the body of the practice) so they can correct you if you misread it. Do not re-ask that item.",
    "— If NO / unclear: ask that item directly (one question).",
    "REPLY SHAPE until [[READY]]: either (A) confirm-only — no question — stating how covered context will shape the practice, optionally inviting extras as statements (“If you want, add anything else as a short statement”), or (B) a short ack plus ONE direct question for something still missing. Prefer (A) whenever context already covers what you would have asked.",
    "HARD RULE — attaching context is NOT automatically an answer. Only treat a newly attached style / journal / goal / program as fully answering your last question if that attachment clearly covers it (e.g. you asked what kind of practice and they attached a style, or a journal clearly answers an Ask-item). If it does: confirm how you will use it in the meditation and mark the item done; if nothing required remains, confirm-only + [[READY]]. If it does not: acknowledge the new context by name and how you will fold it in, then ask ONE question that still gathers what the outstanding Ask-item needs AND, when it fits, how that relates to the new context. Never skip the unanswered ask. Never emit [[READY]] just because context was added.",
  ];

  if (contextUpdateNote?.trim()) {
    lines.push("", `CONTEXT UPDATE: ${contextUpdateNote.trim()}`);
  }

  if (state.prompt.trim()) {
    lines.push("", "Brief (pinned; not a chat bubble):", state.prompt.trim());
  }

  if (state.style) {
    lines.push("", `Attached style: ${state.style.id}`, formatAimsBlock(state.style.id));
    const qs = styleIntakeAims(state.style.id);
    const answered = Object.entries(state.answers)
      .filter(([, v]) => v.trim())
      .sort(([a], [b]) => Number(a) - Number(b));
    const { covered } = collectStyleAimCoverage(
      state.chat,
      qs,
      [...intakeShortTitlesForStyle(state.style.id)],
    );
    const knownLines: string[] = [];
    for (const [k, v] of answered) {
      const qi = Number(k);
      const label = Number.isFinite(qi) && qs[qi] ? qs[qi] : `Note ${k}`;
      knownLines.push(`- ${label}: ${v.trim()}`);
    }
    for (const i of [...covered].sort((a, b) => a - b)) {
      if (state.answers[String(i)]?.trim()) continue;
      const label = qs[i] ?? `AIM ${i + 1}`;
      knownLines.push(`- ${label}: covered in conversation (do not re-ask)`);
    }
    if (knownLines.length > 0) {
      lines.push("", "Details already captured — treat as known:");
      lines.push(...knownLines);
    }
    lines.push("", styleRailMarkerInstruction(state.chat, state.style.id));
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
      "AIM from journal: treat the entry as valuable context. If it clearly answers required Style/Program questions, count those answered and confirm how you will use that material in the meditation (so they can correct you). Otherwise ask only for missing concrete detail still needed. Always plan to hint at / weave the journal into the finished practice.",
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
      "AIM from Manifest: stay grounded in their dream/vision. Always hint at this goal in the meditation. If it clearly answers required Style/Program questions, count those answered and confirm how you will use the goal in the practice. Otherwise keep the outstanding ask open and weave the goal into the next question.",
    );
  }

  lines.push("--- End shape context ---");
  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n");
}

export function hasShapeStartMaterial(state: CreateOneFlowState): boolean {
  return Boolean(
    state.prompt.trim() ||
      state.style ||
      state.program ||
      state.journals.length > 0 ||
      state.goal,
  );
}

/** True when Start carries brief/journal/goal the coach should scan before asking. */
export function styleOpenHasUsableContext(state: CreateOneFlowState): boolean {
  return Boolean(
    state.prompt.trim() || state.journals.length > 0 || state.goal,
  );
}

/**
 * Instant first bubble when a style is chosen with no brief/journal/goal.
 * When those are present, Shape streams the coach instead so it can confirm
 * how context will be used (or ask only what is still missing).
 */
export function buildStyleFormatOpenTurn(
  state: CreateOneFlowState,
): CreateFlowChatTurn {
  const styleId = state.style?.id?.trim() || "";
  const firstAim = styleId
    ? styleIntakeAims(styleId)[0]?.trim()
    : "";
  const question = firstAim
    ? firstAim.endsWith("?")
      ? firstAim
      : `${firstAim}?`
    : "What would you like this practice to hold?";
  return {
    role: "assistant",
    text: `Let's shape this practice together.\n\n${question}`,
    aimAsking: 0,
  };
}

function shapeOpenNowInstruction(state: CreateOneFlowState): string {
  if (state.program) {
    return [
      "OPEN NOW (first reply): Follow the program OPEN NOW in the Start/program brief.",
      "First scan brief / journal / goal against Ask-items: if context clearly answers an item, do not ask it — confirm how you will use that material in the meditation and move to the next unanswered Ask-item (or [[READY]] if none remain).",
      "Do NOT use a mood-intake opener such as “What’s on your mind?” or “What’s on your mind today?”.",
    ].join(" ");
  }
  if (state.style) {
    const first = styleIntakeAims(state.style.id)[0]?.trim();
    const hasCtx = styleOpenHasUsableContext(state);
    if (hasCtx) {
      return [
        "OPEN NOW (first reply): Scan their brief / journal / goal against every Format AIM item before asking anything.",
        "For each AIM clearly answered by that context: emit [[AIM:n]] and do not ask it.",
        "In your visible reply, confirm how you will use the covered material in the meditation (concrete construction cue) so they can correct you.",
        "If any AIM remains unanswered: after that confirm, ask ONE natural question for the first unanswered AIM only; emit [[ASKING:n]]. Two bubbles (confirm, then question).",
        "If every AIM is already covered: ONE bubble only — construction-oriented confirm, optionally invite extras as statements (no question mark), then [[READY]].",
        "FORBIDDEN: mood-intake openers; forbidden to ask an AIM that context already answered.",
      ].join(" ");
    }
    return [
      "OPEN NOW (first reply — exactly two bubbles):",
      "(1) One short warm greeting that treats the attached format as already chosen (do not name the style).",
      first
        ? `(2) One natural question that gathers Format AIM item 1 (${first}). Emit [[ASKING:1]]. Do not paste the AIM text verbatim if you can say it more simply.`
        : "(2) One natural question for the first Format AIM. Emit [[ASKING:1]].",
      "FORBIDDEN: mood-intake openers (“What’s on your mind?”, “What’s on your mind today?”). Those are only when Start had no brief, no format, and no context.",
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (hasShapeStartMaterial(state)) {
    return [
      "OPEN NOW (first reply): You already have their Start brief and/or attached journal/goal.",
      "Confirm how you will use that material in the meditation so they can correct you.",
      "If you still need one concrete detail: two bubbles (confirm, then one question).",
      "If the material is enough for a general practice: one confirm-only bubble, optional invite for extras as statements, then [[READY]].",
      "FORBIDDEN: a blank-slate mood-intake opener (“What’s on your mind today?”).",
    ].join(" ");
  }
  return [
    "OPEN NOW (first reply): They arrived with no brief, no format, and no context.",
    "A mood-intake opener is allowed here — e.g. a short greeting, then “What’s on your mind today?”.",
  ].join(" ");
}

export function buildShapeOpenUserContent(opts: {
  state: CreateOneFlowState;
  lifeArea?: ShapeLifeAreaContext | null;
  programBrief?: string | null;
  /** When true, Start context is already in the cached system block. */
  leanOpen?: boolean;
}): string {
  const openNow = shapeOpenNowInstruction(opts.state);
  if (opts.leanOpen) {
    const rail = opts.state.style
      ? `${styleRailMarkerInstruction(opts.state.chat, opts.state.style.id)}\n\n`
      : "";
    return `${rail}${openNow} Do not paste a checklist.`;
  }
  return [
    buildShapeContextBlock(opts),
    "",
    `${openNow} Do not paste a checklist.`,
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
    "The creator just attached context (see CONTEXT UPDATE). Acknowledge it by name and say how you will use it in the meditation (so they can correct you). Journal/goal context is valuable and should be woven into the practice; it may answer a required question if it clearly covers it. Treat it as fully answering your last question ONLY if it clearly covers that question — then mark that item done and either confirm-only (invite extras as statements if everything required is covered, then [[READY]]) or ask the next missing required item. Otherwise keep the ask open: ask ONE question that still gets what you needed AND, when it fits, how it relates to the new context. Do not skip ahead. Do not emit [[READY]] merely because context was added.",
  ].join("\n");
}

function turnToApiContent(m: CreateFlowChatTurn): string {
  if (m.kind === "context") {
    const kind = m.contextKind ?? "context";
    const detail = m.contextDetail?.trim();
    return `I added ${kind} context: ${m.text.trim()}${
      detail ? ` (${detail})` : ""
    }. (Context attach — not a spoken answer unless it clearly addressed the last question.)`;
  }
  if (m.role === "assistant") {
    const asking =
      m.aimAsking != null ? `[[ASKING:${m.aimAsking + 1}]]` : "";
    const aims = (m.aimCovered ?? [])
      .map((i) => `[[AIM:${i + 1}]]`)
      .join("");
    const ready = m.ready ? "[[READY]]" : "";
    return `${m.text.trim()}${asking}${aims}${ready}`;
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
    if (opts.state.style) {
      parts.push(styleRailMarkerInstruction(opts.chat, opts.state.style.id));
    }
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

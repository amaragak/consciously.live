/**
 * Snapshot of how a library meditation was created (path + inputs).
 * Stored on the audio job and copied onto the library catalog row.
 *
 * Only freeflow (Chat) has a real coach conversation. Journal / Manifest /
 * Direct skip chat and use pickers / a prompt — store those inputs, not a
 * fake “transcript”.
 */

import type { CreateMeditationPath } from "@/lib/create-meditation-path";

export type MeditationCreationPathStored =
  | Exclude<CreateMeditationPath, "pending">
  | "randomScript";

export type MeditationCreationProvenanceMessage = {
  role: "assistant" | "user";
  text: string;
  variant?: "chat" | "script";
};

export type MeditationCreationJournalEntry = {
  entryId: string;
  title: string;
  bodyPlain: string;
  createdAt?: string;
};

export type MeditationCreationManifest = {
  lifeAreaTitle: string;
  dreamText?: string;
  obstacleText?: string;
  visionText?: string;
  focusGoalTitle?: string;
  focusGoalDetail?: string;
  guidance?: string;
};

export type MeditationCreationProvenance = {
  creationPath: MeditationCreationPathStored;
  meditationStyle?: string | null;
  /** By Type: 3 answers + optional “anything else”. */
  styleQuestionAnswers?: string[];
  /** Chat (freeflow) only — coach conversation turns. */
  messages?: MeditationCreationProvenanceMessage[];
  /** Journal path — selected entry (+ optional guidance). */
  journalEntries?: MeditationCreationJournalEntry[];
  journalGuidance?: string;
  /** Manifest path — life area / optional goal. */
  manifest?: MeditationCreationManifest;
  /** Direct path — user prompt. */
  directPrompt?: string;
};

const PATHS = new Set<string>([
  "style",
  "freeflow",
  "journalReflect",
  "goal",
  "oneShot",
  "fromProgram",
  "randomScript",
]);

export function creationPathDisplayLabel(
  path: MeditationCreationPathStored,
): string {
  switch (path) {
    case "style":
      return "By Type";
    case "freeflow":
      return "Chat";
    case "journalReflect":
      return "Journal";
    case "goal":
      return "Manifest";
    case "oneShot":
      return "Direct";
    case "fromProgram":
      return "By Program";
    case "randomScript":
      return "Random";
    default:
      return "Create";
  }
}

const MAX_PROVENANCE_CHARS = 240_000;
const MAX_MESSAGE_TEXT = 8_000;
const MAX_MESSAGES = 80;

function trimText(s: string, max = MAX_MESSAGE_TEXT): string {
  return s.trim().slice(0, max);
}

export function buildMeditationCreationProvenance(opts: {
  creationPath: CreateMeditationPath;
  randomScript?: boolean;
  meditationStyle: string | null;
  styleQuestionAnswers?: readonly string[];
  /** freeflow chat turns only */
  chatMessages?: readonly MeditationCreationProvenanceMessage[];
  journalEntries?: readonly MeditationCreationJournalEntry[];
  journalGuidance?: string;
  manifest?: MeditationCreationManifest | null;
  directPrompt?: string;
}): MeditationCreationProvenance | null {
  const path: MeditationCreationPathStored = opts.randomScript
    ? "randomScript"
    : opts.creationPath === "pending"
      ? "freeflow"
      : opts.creationPath;

  const style =
    typeof opts.meditationStyle === "string" && opts.meditationStyle.trim()
      ? opts.meditationStyle.trim().slice(0, 120)
      : null;

  const provenance: MeditationCreationProvenance = {
    creationPath: path,
    ...(style ? { meditationStyle: style } : { meditationStyle: null }),
  };

  if (path === "style" && Array.isArray(opts.styleQuestionAnswers)) {
    const answers = opts.styleQuestionAnswers
      .slice(0, 4)
      .map((a) => String(a ?? "").trim().slice(0, MAX_MESSAGE_TEXT));
    if (answers.some((a) => a.trim())) {
      provenance.styleQuestionAnswers = answers;
    }
  }

  if (
    (path === "freeflow" || path === "fromProgram") &&
    opts.chatMessages?.length
  ) {
    provenance.messages = opts.chatMessages
      .filter((m) => !(m.role === "assistant" && m.variant === "script"))
      .slice(-MAX_MESSAGES)
      .map((m) => {
        const out: MeditationCreationProvenanceMessage = {
          role: m.role,
          text: String(m.text ?? "").slice(0, MAX_MESSAGE_TEXT),
        };
        if (m.variant === "chat" || m.variant === "script") {
          out.variant = m.variant;
        }
        return out;
      });
  }

  if (path === "journalReflect") {
    if (opts.journalEntries?.length) {
      provenance.journalEntries = opts.journalEntries.slice(0, 4).map((e) => ({
        entryId: String(e.entryId ?? "").slice(0, 64),
        title: String(e.title ?? "").slice(0, 200),
        bodyPlain: String(e.bodyPlain ?? "").slice(0, 4_000),
        ...(e.createdAt
          ? { createdAt: String(e.createdAt).slice(0, 40) }
          : {}),
      }));
    }
    const g = opts.journalGuidance?.trim();
    if (g) provenance.journalGuidance = g.slice(0, MAX_MESSAGE_TEXT);
  }

  if (path === "goal" && opts.manifest) {
    const m = opts.manifest;
    provenance.manifest = {
      lifeAreaTitle: trimText(m.lifeAreaTitle || "Life area", 200),
      ...(m.dreamText?.trim()
        ? { dreamText: trimText(m.dreamText, 4_000) }
        : {}),
      ...(m.obstacleText?.trim()
        ? { obstacleText: trimText(m.obstacleText, 4_000) }
        : {}),
      ...(m.visionText?.trim()
        ? { visionText: trimText(m.visionText, 4_000) }
        : {}),
      ...(m.focusGoalTitle?.trim()
        ? { focusGoalTitle: trimText(m.focusGoalTitle, 200) }
        : {}),
      ...(m.focusGoalDetail?.trim()
        ? { focusGoalDetail: trimText(m.focusGoalDetail, 4_000) }
        : {}),
      ...(m.guidance?.trim()
        ? { guidance: trimText(m.guidance, MAX_MESSAGE_TEXT) }
        : {}),
    };
  }

  if (path === "oneShot") {
    const p = opts.directPrompt?.trim();
    if (p) provenance.directPrompt = p.slice(0, MAX_MESSAGE_TEXT);
  }

  let json = JSON.stringify(provenance);
  if (json.length > MAX_PROVENANCE_CHARS && provenance.messages) {
    while (
      provenance.messages.length > 1 &&
      JSON.stringify(provenance).length > MAX_PROVENANCE_CHARS
    ) {
      provenance.messages = provenance.messages.slice(1);
    }
    json = JSON.stringify(provenance);
  }
  if (json.length > MAX_PROVENANCE_CHARS) {
    delete provenance.messages;
  }
  return provenance;
}

export function parseMeditationCreationProvenance(
  raw: unknown,
): MeditationCreationProvenance | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.creationPath !== "string" || !PATHS.has(o.creationPath)) {
    return null;
  }
  const creationPath = o.creationPath as MeditationCreationPathStored;
  const meditationStyle =
    typeof o.meditationStyle === "string"
      ? o.meditationStyle.trim().slice(0, 120) || null
      : o.meditationStyle === null
        ? null
        : undefined;

  const provenance: MeditationCreationProvenance = {
    creationPath,
    ...(meditationStyle !== undefined ? { meditationStyle } : {}),
  };

  if (Array.isArray(o.styleQuestionAnswers)) {
    const styleQuestionAnswers = o.styleQuestionAnswers
      .filter((x): x is string => typeof x === "string")
      .slice(0, 4)
      .map((s) => s.slice(0, MAX_MESSAGE_TEXT));
    if (styleQuestionAnswers.length) {
      provenance.styleQuestionAnswers = styleQuestionAnswers;
    }
  }

  if (Array.isArray(o.messages)) {
    const messages: MeditationCreationProvenanceMessage[] = [];
    for (const item of o.messages.slice(0, MAX_MESSAGES)) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      if (m.role !== "user" && m.role !== "assistant") continue;
      if (typeof m.text !== "string") continue;
      const msg: MeditationCreationProvenanceMessage = {
        role: m.role,
        text: m.text.slice(0, MAX_MESSAGE_TEXT),
      };
      if (m.variant === "chat" || m.variant === "script") msg.variant = m.variant;
      messages.push(msg);
    }
    if (messages.length) provenance.messages = messages;
  }

  if (Array.isArray(o.journalEntries)) {
    provenance.journalEntries = o.journalEntries
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
      .slice(0, 4)
      .map((s) => ({
        entryId: typeof s.entryId === "string" ? s.entryId.slice(0, 64) : "",
        title: typeof s.title === "string" ? s.title.slice(0, 200) : "",
        bodyPlain:
          typeof s.bodyPlain === "string" ? s.bodyPlain.slice(0, 4_000) : "",
        ...(typeof s.createdAt === "string"
          ? { createdAt: s.createdAt.slice(0, 40) }
          : {}),
      }));
  }
  if (typeof o.journalGuidance === "string" && o.journalGuidance.trim()) {
    provenance.journalGuidance = o.journalGuidance.trim().slice(0, MAX_MESSAGE_TEXT);
  }

  if (o.manifest && typeof o.manifest === "object") {
    const m = o.manifest as Record<string, unknown>;
    const lifeAreaTitle =
      typeof m.lifeAreaTitle === "string" ? m.lifeAreaTitle.trim() : "";
    if (lifeAreaTitle) {
      provenance.manifest = {
        lifeAreaTitle: lifeAreaTitle.slice(0, 200),
        ...(typeof m.dreamText === "string" && m.dreamText.trim()
          ? { dreamText: m.dreamText.trim().slice(0, 4_000) }
          : {}),
        ...(typeof m.obstacleText === "string" && m.obstacleText.trim()
          ? { obstacleText: m.obstacleText.trim().slice(0, 4_000) }
          : {}),
        ...(typeof m.visionText === "string" && m.visionText.trim()
          ? { visionText: m.visionText.trim().slice(0, 4_000) }
          : {}),
        ...(typeof m.focusGoalTitle === "string" && m.focusGoalTitle.trim()
          ? { focusGoalTitle: m.focusGoalTitle.trim().slice(0, 200) }
          : {}),
        ...(typeof m.focusGoalDetail === "string" && m.focusGoalDetail.trim()
          ? { focusGoalDetail: m.focusGoalDetail.trim().slice(0, 4_000) }
          : {}),
        ...(typeof m.guidance === "string" && m.guidance.trim()
          ? { guidance: m.guidance.trim().slice(0, MAX_MESSAGE_TEXT) }
          : {}),
      };
    }
  }

  if (typeof o.directPrompt === "string" && o.directPrompt.trim()) {
    provenance.directPrompt = o.directPrompt.trim().slice(0, MAX_MESSAGE_TEXT);
  }

  // Legacy rows: journal segments nested on messages — lift into journalEntries.
  if (
    creationPath === "journalReflect" &&
    !provenance.journalEntries?.length &&
    Array.isArray(o.messages)
  ) {
    const lifted: MeditationCreationJournalEntry[] = [];
    for (const item of o.messages) {
      if (!item || typeof item !== "object") continue;
      const segs = (item as Record<string, unknown>).journalSegments;
      if (!Array.isArray(segs)) continue;
      for (const s of segs) {
        if (!s || typeof s !== "object") continue;
        const e = s as Record<string, unknown>;
        lifted.push({
          entryId: typeof e.entryId === "string" ? e.entryId.slice(0, 64) : "",
          title: typeof e.title === "string" ? e.title.slice(0, 200) : "",
          bodyPlain:
            typeof e.bodyPlain === "string" ? e.bodyPlain.slice(0, 4_000) : "",
          ...(typeof e.createdAt === "string"
            ? { createdAt: e.createdAt.slice(0, 40) }
            : {}),
        });
      }
    }
    if (lifted.length) {
      provenance.journalEntries = lifted.slice(0, 4);
      delete provenance.messages;
    }
  }

  return provenance;
}

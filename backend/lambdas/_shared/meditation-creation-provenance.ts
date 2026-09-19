/**
 * Sanitize creation provenance from the create-meditation job body.
 * Copied onto the library catalog row by the audio worker.
 */

export type MeditationCreationProvenance = {
  creationPath:
    | "style"
    | "freeflow"
    | "journalReflect"
    | "goal"
    | "oneShot"
    | "randomScript";
  meditationStyle?: string | null;
  styleQuestionAnswers?: string[];
  /** Chat (freeflow) only. */
  messages?: Array<{
    role: "assistant" | "user";
    text: string;
    variant?: "chat" | "script";
  }>;
  journalEntries?: Array<{
    entryId: string;
    title: string;
    bodyPlain: string;
    createdAt?: string;
  }>;
  journalGuidance?: string;
  manifest?: {
    lifeAreaTitle: string;
    dreamText?: string;
    obstacleText?: string;
    visionText?: string;
    focusGoalTitle?: string;
    focusGoalDetail?: string;
    guidance?: string;
  };
  directPrompt?: string;
};

const PATHS = new Set([
  "style",
  "freeflow",
  "journalReflect",
  "goal",
  "oneShot",
  "randomScript",
]);

const MAX_JSON_CHARS = 240_000;
const MAX_MESSAGE_TEXT = 8_000;
const MAX_MESSAGES = 80;

export function sanitizeMeditationCreationProvenance(
  raw: unknown,
): MeditationCreationProvenance | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.creationPath !== "string" || !PATHS.has(o.creationPath)) {
    return undefined;
  }

  const provenance: MeditationCreationProvenance = {
    creationPath: o.creationPath as MeditationCreationProvenance["creationPath"],
  };

  if (typeof o.meditationStyle === "string" && o.meditationStyle.trim()) {
    provenance.meditationStyle = o.meditationStyle.trim().slice(0, 120);
  } else if (o.meditationStyle === null) {
    provenance.meditationStyle = null;
  }

  if (Array.isArray(o.styleQuestionAnswers)) {
    const answers = o.styleQuestionAnswers
      .filter((x): x is string => typeof x === "string")
      .slice(0, 4)
      .map((s) => s.slice(0, MAX_MESSAGE_TEXT));
    if (answers.some((a) => a.trim())) {
      provenance.styleQuestionAnswers = answers;
    }
  }

  if (Array.isArray(o.messages)) {
    const messages: NonNullable<MeditationCreationProvenance["messages"]> = [];
    for (const item of o.messages.slice(0, MAX_MESSAGES)) {
      if (!item || typeof item !== "object") continue;
      const m = item as Record<string, unknown>;
      if (m.role !== "user" && m.role !== "assistant") continue;
      if (typeof m.text !== "string") continue;
      const msg: NonNullable<MeditationCreationProvenance["messages"]>[number] = {
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
    if (typeof m.lifeAreaTitle === "string" && m.lifeAreaTitle.trim()) {
      provenance.manifest = {
        lifeAreaTitle: m.lifeAreaTitle.trim().slice(0, 200),
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

  let json = JSON.stringify(provenance);
  if (json.length > MAX_JSON_CHARS && provenance.messages) {
    while (
      provenance.messages.length > 1 &&
      JSON.stringify(provenance).length > MAX_JSON_CHARS
    ) {
      provenance.messages = provenance.messages.slice(1);
    }
    json = JSON.stringify(provenance);
  }
  if (json.length > MAX_JSON_CHARS) {
    delete provenance.messages;
  }
  return provenance;
}

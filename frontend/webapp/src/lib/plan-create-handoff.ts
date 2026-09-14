export const PLAN_CREATE_HANDOFF_KEY = "mm_plan_create_handoff_v1";

/** Shown in chat; full context is in `buildPlanCreateHandoffApiContent`. */
export const PLAN_CREATE_FIRST_MESSAGE =
  "Please help me turn this dream and vision into a gentle visualisation meditation.";

/** First assistant line in the API thread (matches journal → create pattern). */
export const PLAN_CREATE_OPENING_ASSISTANT =
  "What you’re holding matters. Stay close to your words—we’ll shape a visualization you can feel in your body, without forcing the outcome.";

export type PlanCreateHandoffV1 = {
  v: 1;
  goalTitle: string;
  visionText: string;
  dreamText?: string;
  obstacleText?: string;
};

export type PlanResistanceThemeHandoff = {
  category: string;
  sampleText: string;
  level: "project" | "subtask" | "todo";
  occurrences: number;
};

export type PlanCreateHandoffV2 = {
  v: 2;
  goalTitle: string;
  visionText: string;
  dreamText?: string;
  obstacleText?: string;
  /** PlanDream / life-area id — carried into the library meditation. */
  lifeAreaId?: string;
  /** Prefer this length in Create (e.g. 2‑min pre-focus manifestation). */
  meditationTargetMinutes?: 2 | 5 | 10 | 20;
  /** After Generate, open Focus (Ideate task handoff still in sessionStorage). */
  returnToFocus?: boolean;
  /** Extra context for a pre-focus manifestation (task + checklist). */
  focusTaskContext?: string;
  project: {
    dreamText: string;
    resistanceText: string;
    visionText: string;
  };
  activeResistanceThemes: PlanResistanceThemeHandoff[];
};

export type PlanCreateHandoff = PlanCreateHandoffV1 | PlanCreateHandoffV2;

export function buildPlanCreateHandoffApiContent(h: PlanCreateHandoff): string {
  const preFocus =
    h.v === 2 && (h.returnToFocus || h.meditationTargetMinutes === 2);
  const lines: string[] = [
    preFocus
      ? "Please help me create a short pre-focus manifestation / visualisation meditation — about 2 minutes — to set a mindset for success before a focus session."
      : PLAN_CREATE_FIRST_MESSAGE,
    "",
    preFocus
      ? "This is an Ideate → Focus preflight handoff. Keep the script brief and energising. Prefer wrapping up with [[READY]] quickly when there is enough material."
      : "This is an Ideate life-area handoff. The user already wrote dream / resistance / vision below — treat that as primary material for a Visualization meditation.",
    preFocus
      ? "Ask at most one short follow-up only if something essential is missing."
      : "Ask at most one short follow-up only if something essential for the visualization is missing. Prefer wrapping up with [[READY]] when the vision is already concrete.",
    "",
    `Dream / goal title: ${h.goalTitle.trim() || "Untitled"}`,
    "",
    "Vision (a specific future moment):",
    h.visionText.trim() || "(not written yet)",
  ];
  if (h.dreamText?.trim()) {
    lines.push("", "The dream (free-form):", h.dreamText.trim());
  }
  if (h.obstacleText?.trim()) {
    lines.push("", "What feels in the way:", h.obstacleText.trim());
  }
  if (h.v === 2) {
    if (h.focusTaskContext?.trim()) {
      lines.push(
        "",
        "Focus session tasks (weave gently into the visualisation):",
        h.focusTaskContext.trim(),
      );
    }
    lines.push(
      "",
      "Project context (keep levels distinct in the meditation):",
      `— Project dream: ${h.project.dreamText.trim() || "—"}`,
      `— Project resistance: ${h.project.resistanceText.trim() || "—"}`,
      `— Project vision: ${h.project.visionText.trim() || "—"}`,
    );
    if (h.activeResistanceThemes.length) {
      lines.push("", "Recurring resistance themes (recent):");
      for (const t of h.activeResistanceThemes) {
        lines.push(
          `— [${t.level}] ${t.category} (${t.occurrences}×): ${t.sampleText.slice(0, 200)}`,
        );
      }
    }
  }
  return lines.join("\n");
}

export function writePlanCreateHandoff(payload: PlanCreateHandoff) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PLAN_CREATE_HANDOFF_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readPlanCreateHandoff(): PlanCreateHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PLAN_CREATE_HANDOFF_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.v === 2) {
      if (typeof o.goalTitle !== "string") return null;
      if (typeof o.visionText !== "string") return null;
      if (!o.project || typeof o.project !== "object") return null;
      const p = o.project as Record<string, unknown>;
      return {
        v: 2,
        goalTitle: o.goalTitle,
        visionText: o.visionText,
        dreamText: typeof o.dreamText === "string" ? o.dreamText : undefined,
        obstacleText:
          typeof o.obstacleText === "string" ? o.obstacleText : undefined,
        lifeAreaId:
          typeof o.lifeAreaId === "string" && o.lifeAreaId.trim()
            ? o.lifeAreaId.trim()
            : undefined,
        meditationTargetMinutes:
          o.meditationTargetMinutes === 2 ||
          o.meditationTargetMinutes === 5 ||
          o.meditationTargetMinutes === 10 ||
          o.meditationTargetMinutes === 20
            ? o.meditationTargetMinutes
            : undefined,
        returnToFocus: o.returnToFocus === true,
        focusTaskContext:
          typeof o.focusTaskContext === "string"
            ? o.focusTaskContext
            : undefined,
        project: {
          dreamText: typeof p.dreamText === "string" ? p.dreamText : "",
          resistanceText:
            typeof p.resistanceText === "string" ? p.resistanceText : "",
          visionText: typeof p.visionText === "string" ? p.visionText : "",
        },
        activeResistanceThemes: Array.isArray(o.activeResistanceThemes)
          ? (o.activeResistanceThemes as PlanResistanceThemeHandoff[])
          : [],
      };
    }
    if (o.v !== 1) return null;
    if (typeof o.goalTitle !== "string" || typeof o.visionText !== "string") return null;
    return {
      v: 1,
      goalTitle: o.goalTitle,
      visionText: o.visionText,
      dreamText: typeof o.dreamText === "string" ? o.dreamText : undefined,
      obstacleText: typeof o.obstacleText === "string" ? o.obstacleText : undefined,
    };
  } catch {
    return null;
  }
}

export function clearPlanCreateHandoff() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PLAN_CREATE_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

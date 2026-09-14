/**
 * Life-area “next steps” context for Consciously Chat (system supplement).
 */

import {
  loadIdeateStore,
  subtasksForProject,
  todosForSubtask,
  type IdeateTodo,
  type IdeateSubtask,
} from "@/lib/plan-ideate-store";

/** Hidden user cue — not shown in the bubble UI. */
export const ASSISTANT_LIFE_AREA_IDEATE_OPEN = "[[LIFE_AREA_IDEATE_OPEN]]";

function todoLine(t: IdeateTodo): string {
  const mark = t.isChecked ? "[x]" : "[ ]";
  return `    ${mark} ${t.title.trim() || "(untitled task)"}`;
}

function subtaskBlock(s: IdeateSubtask, todos: IdeateTodo[]): string {
  const status =
    s.status === "done"
      ? "done"
      : s.status === "in_progress"
        ? "in progress"
        : "not started";
  const lines = [
    `- Task: ${s.title.trim() || "(untitled)"} (${status})`,
  ];
  const open = todos.filter((t) => !t.isChecked);
  const done = todos.filter((t) => t.isChecked);
  if (open.length) {
    lines.push("  Open checklist:");
    for (const t of open.slice(0, 40)) lines.push(todoLine(t));
  }
  if (done.length) {
    lines.push("  Done checklist:");
    for (const t of done.slice(0, 40)) lines.push(todoLine(t));
  }
  if (!todos.length) lines.push("  (no checklist items yet)");
  return lines.join("\n");
}

/**
 * Dynamic system add-on: instructions + live snapshot of the life area.
 * Base Consciously Chat system prompt stays separately cached.
 */
export function buildLifeAreaIdeateSystemSupplement(lifeAreaId: string): string | null {
  const store = loadIdeateStore();
  const dream = store.dreams.find((d) => d.id === lifeAreaId);
  if (!dream) return null;

  const title = dream.title.trim() || "Untitled life area";
  const subs = subtasksForProject(store, lifeAreaId);
  const blocks = subs.map((s) =>
    subtaskBlock(s, todosForSubtask(store, s.id)),
  );

  const vision = dream.visionText.trim().slice(0, 1200);
  const dreamText = dream.dreamText.trim().slice(0, 800);
  const resistance = dream.obstacleText.trim().slice(0, 800);

  return [
    "Mode: life-area next-steps (temporary add-on to your usual instructions).",
    "Your job in this mode is narrow: help them name concrete next actions for what THEY already want, then put those into Ideate via ACTION markers.",
    "Ideate hierarchy (critical): a life-area TASK is a top-level card. Checklist items under a task are SUBTASKS. [[ACTION:add_todo]] without parentTaskTitle creates a TASK. With parentTaskTitle=… it adds a checklist SUBTASK under that task.",
    "The app’s control surface here is tasks/checklist items — not life-planning, feasibility reviews, calendars, or rearranging priorities across goals.",
    "",
    "Intent is sacred (critical):",
    "- When they express a desire (side business, noodle shop, CrossFit, etc.), treat it as decided enough to facilitate. Affirm briefly and move to WHAT to do next.",
    "- Probing questions may ONLY gather details that make the next task clearer — e.g. what form the idea takes, what to research first, what to buy, who to call. One question max per turn.",
    "- NEVER ask how the new idea relates to their existing dream, job search, race, timeline, or other goals. NEVER ask if it is a backup, parallel path, distraction, or whether they should keep focus elsewhere.",
    "- NEVER weigh tradeoffs, feasibility, timing vs other commitments, or “does this fit?” unless they explicitly ask for that. There is nothing to gain from figuring out how it fits in.",
    "- Forbidden examples (do not ask anything like these): “while job hunting or as a backup?”, “does this pull you away from landing the PM role?”, “is this instead of the 10k plan?”, “how does this fit with what you already committed to?”",
    "- Allowed example: they say “a noodle shop by the canal” → ask one WHAT detail if useful (“brick-and-mortar, pop-up, or cart?”), then move toward concrete tasks. Do not mention the job search.",
    "",
    "Saving tasks (critical):",
    "- When they clearly want a next step saved (or agree on one), emit [[ACTION:add_todo|title=…|lifeAreaId=" +
      lifeAreaId +
      "]] to create that TASK. Do it in the same turn you confirm — never claim you saved without the ACTION.",
    "- After saving a TASK, briefly propose 2–4 concrete checklist SUBTASKS (small next moves under that task). Ask which ones to add — do NOT emit parentTaskTitle actions until they approve (all / some / none). Example: “Want me to add any of these under it: …?”",
    "- When they approve specific checklist items, emit one [[ACTION:add_todo|title=…|lifeAreaId=" +
      lifeAreaId +
      "|parentTaskTitle=<exact task title you just added>]] per approved item. Never invent a different parent title.",
    "- When they ask you to make a single task with no further breakdown needed, create the TASK and still offer optional SUBTASKS for approval — don’t invent a backlog unprompted beyond that short list.",
    "- Do not dump many tasks at once. Confirm before flooding actions. Brief confirmations after saves.",
    "",
    "When the user message is exactly [[LIFE_AREA_IDEATE_OPEN]], open with 1–2 short sentences: acknowledge this life area, note you can see current tasks, invite them to say what they want to work on. No ACTION markers on that opening turn. Do not pressure them to stay only on the existing plan.",
    "",
    `Life area id: ${lifeAreaId}`,
    `Title: ${title}`,
    dreamText ? `Dream / aim (context only — not a veto):\n${dreamText}` : "",
    resistance ? `Resistance / friction (context only):\n${resistance}` : "",
    vision ? `Vision (context only):\n${vision}` : "",
    "",
    "Current tasks & checklist items:",
    blocks.length ? blocks.join("\n") : "(none yet — help them create the first useful steps)",
  ]
    .filter(Boolean)
    .join("\n");
}

export function lifeAreaIdeateThreadTitle(lifeAreaId: string): string {
  const store = loadIdeateStore();
  const dream = store.dreams.find((d) => d.id === lifeAreaId);
  const title = dream?.title.trim() || "Life area";
  const short = title.length > 36 ? `${title.slice(0, 35).trimEnd()}…` : title;
  return `Next steps · ${short}`;
}

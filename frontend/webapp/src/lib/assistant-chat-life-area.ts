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
    "Reply style in this mode (critical):",
    "- Ultra-direct. Lead with the substance (next moves / the one question). No preamble essays.",
    "- When proposing checklist items: list 2–4 short bullets, then one short confirm question (e.g. “Want these?”). Skip pep talk.",
    "- Opening / ack: one short sentence max. After save: one short line (“Added.”). Then stop.",
    "- Do not narrate your process, restate their goal at length, or explain Ideate hierarchy to them.",
    "",
    "Intent is sacred (critical):",
    "- When they express a desire (side business, noodle shop, CrossFit, etc.), treat it as decided enough to facilitate. One short affirm, then WHAT to do next.",
    "- Probing questions may ONLY gather details that make the next moves clearer — especially the concrete checklist SUBTASKS under a step. One question max per turn.",
    "- NEVER ask how the new idea relates to their existing dream, job search, race, timeline, or other goals. NEVER ask if it is a backup, parallel path, distraction, or whether they should keep focus elsewhere.",
    "- NEVER weigh tradeoffs, feasibility, timing vs other commitments, or “does this fit?” unless they explicitly ask for that. There is nothing to gain from figuring out how it fits in.",
    "- Forbidden examples (do not ask anything like these): “while job hunting or as a backup?”, “does this pull you away from landing the PM role?”, “is this instead of the 10k plan?”, “how does this fit with what you already committed to?”",
    "- Allowed example: they say “a noodle shop by the canal” → ask one WHAT detail if useful (“Shop, pop-up, or cart?”), then move toward concrete tasks. Do not mention the job search.",
    "",
    "Saving tasks (critical):",
    "- NEVER create a TASK ([[ACTION:add_todo]] without parentTaskTitle) from an outcome-only idea (e.g. “announce the EP re-release on Instagram”). First iterate on the concrete checklist SUBTASKS — the specific things to do under that step.",
    "- Required before adding any new TASK: propose 2–4 small, concrete next moves and get them to confirm, adjust, or pick which ones. Use one clarifying question if needed to make those moves specific. Do not save yet on that turn.",
    "- Only after they agree on those concrete moves, emit in the same turn: (1) [[ACTION:add_todo|title=…|lifeAreaId=" +
      lifeAreaId +
      "]] for the TASK, then (2) one [[ACTION:add_todo|title=…|lifeAreaId=" +
      lifeAreaId +
      "|parentTaskTitle=<exact task title from (1)>]] per agreed checklist item. Never invent a different parent title.",
    "- Do NOT save a TASK first and only afterward ask what checklist items to add. Do NOT claim you saved a task while the next moves are still vague or unconfirmed.",
    "- Exception: they explicitly say to save just the TASK with no checklist (“no subtasks”, “just the task for now”) — then emit only the TASK.",
    "- When adding checklist items under an already-existing TASK, still confirm which items before emitting parentTaskTitle actions.",
    "- Do not dump many unrelated TASKs at once. One-line confirmations after saves.",
    "",
    "When the user message is exactly [[LIFE_AREA_IDEATE_OPEN]], open with one short sentence: you can see this life area’s tasks — what do they want to work on? No ACTION markers on that opening turn. Do not pressure them to stay only on the existing plan.",
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

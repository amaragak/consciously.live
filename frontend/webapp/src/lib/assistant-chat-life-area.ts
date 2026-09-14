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
    `- Subtask: ${s.title.trim() || "(untitled)"} (${status})`,
  ];
  const open = todos.filter((t) => !t.isChecked);
  const done = todos.filter((t) => t.isChecked);
  if (open.length) {
    lines.push("  Open tasks:");
    for (const t of open.slice(0, 40)) lines.push(todoLine(t));
  }
  if (done.length) {
    lines.push("  Done tasks:");
    for (const t of done.slice(0, 40)) lines.push(todoLine(t));
  }
  if (!todos.length) lines.push("  (no tasks yet)");
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
    "Mode: life-area next-steps ideate (temporary add-on to your usual instructions).",
    "The user wants help figuring out reasonable next steps for this Ideate life area — so they can move the needle forward.",
    "Conversation goal: align on what to do next, then create concrete tasks/subtasks they iterate on with you.",
    "Prefer proposing a small set of clear next actions; ask at most one clarifying question when needed.",
    "When they agree on a task, emit [[ACTION:add_todo|title=…|lifeAreaId=" +
      lifeAreaId +
      "]] (or lifeAreaTitle=…) so it lands in Ideate. Do not invent ids other than the lifeAreaId given.",
    "Do not dump a huge backlog unprompted. Confirm before flooding actions. Brief confirmations after saves.",
    "When the user message is exactly [[LIFE_AREA_IDEATE_OPEN]], open with 1–2 short sentences: acknowledge this life area, note you can see current tasks, invite them to shape next steps. No ACTION markers on that opening turn.",
    "",
    `Life area id: ${lifeAreaId}`,
    `Title: ${title}`,
    dreamText ? `Dream / aim:\n${dreamText}` : "",
    resistance ? `Resistance / friction:\n${resistance}` : "",
    vision ? `Vision:\n${vision}` : "",
    "",
    "Current subtasks & tasks:",
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

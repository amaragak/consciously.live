import { createMeditationHref } from "@/lib/create-meditation-path";
import { getMedimadeSessionJwt } from "@/lib/auth-session";
import {
  findGratitudeEntryForLocalDate,
  gratitudeLinesToHtml,
  gratitudeTitleForDate,
  loadJournalStore,
  localDateKey,
  newGratitudeJournalEntry,
  normalizeGratitudeLines,
  saveJournalStore,
  type JournalEntry,
  type JournalStoreV2,
} from "@/lib/journal-storage";
import { putJournalStoreRemote } from "@/lib/medimade-api";
import {
  createSubtask,
  createTodo,
  loadIdeateStore,
  saveIdeateStore,
  upsertSubtask,
  upsertTodo,
  type IdeateStoreV2,
} from "@/lib/plan-ideate-store";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import type { AssistantAction } from "@/lib/assistant-chat-protocol";

export type AssistantActionResult = {
  ok: boolean;
  label: string;
  href?: string;
};

function syncJournalCloud(store: JournalStoreV2): void {
  if (!getMedimadeSessionJwt()) return;
  void putJournalStoreRemote(store).catch(() => {
    /* cloud can catch up later */
  });
}

function resolveLifeArea(
  store: IdeateStoreV2,
  action: Extract<AssistantAction, { name: "add_todo" }>,
) {
  const dreams = store.dreams.filter((d) => !isDemoIdeateDream(d));
  if (action.lifeAreaId) {
    const byId = dreams.find((d) => d.id === action.lifeAreaId);
    if (byId) return byId;
  }
  const needle = (action.lifeAreaTitle ?? "").trim().toLowerCase();
  if (!needle) return null;
  const exact = dreams.find((d) => d.title.trim().toLowerCase() === needle);
  if (exact) return exact;
  const partial = dreams.find((d) => {
    const t = d.title.trim().toLowerCase();
    return t.includes(needle) || needle.includes(t);
  });
  return partial ?? null;
}

function applyGratitude(
  action: Extract<AssistantAction, { name: "add_gratitude" }>,
): AssistantActionResult {
  const lines = normalizeGratitudeLines(action.lines);
  if (!lines.some((l) => l.trim())) {
    return { ok: false, label: "No gratitude text to add" };
  }

  let store = loadJournalStore();
  const today = localDateKey();
  const existing = findGratitudeEntryForLocalDate(store.entries, today);
  let entry: JournalEntry;

  if (existing) {
    const prev = normalizeGratitudeLines(existing.gratitude);
    // Prefer filling empty slots with new lines in order.
    const incoming = lines.filter((l) => l.trim());
    const next = [...prev] as [string, string, string];
    for (const line of incoming) {
      const emptyIdx = next.findIndex((s) => !s.trim());
      if (emptyIdx >= 0) next[emptyIdx] = line;
      else if (!next.includes(line)) {
        // All slots full — replace first with newest intent.
        next[0] = line;
      }
    }
    entry = {
      ...existing,
      gratitude: next,
      contentHtml: gratitudeLinesToHtml(next),
      title: gratitudeTitleForDate(new Date()),
      updatedAt: new Date().toISOString(),
    };
  } else {
    entry = {
      ...newGratitudeJournalEntry(),
      gratitude: lines,
      contentHtml: gratitudeLinesToHtml(lines),
    };
  }

  const idx = store.entries.findIndex((e) => e.id === entry.id);
  const entries =
    idx === -1
      ? [entry, ...store.entries]
      : store.entries.map((e, i) => (i === idx ? entry : e));
  store = { ...store, entries, activeEntryId: entry.id };
  saveJournalStore(store);
  syncJournalCloud(store);

  return {
    ok: true,
    label: "Added to today's gratitudes",
    href: `/journal/my/gratitudes/${encodeURIComponent(entry.id)}`,
  };
}

function applyTodo(
  action: Extract<AssistantAction, { name: "add_todo" }>,
): AssistantActionResult {
  const title = action.title.trim();
  if (!title) return { ok: false, label: "Missing task title" };

  let store = loadIdeateStore();
  const area = resolveLifeArea(store, action);
  if (!area) {
    const names = store.dreams
      .filter((d) => !isDemoIdeateDream(d))
      .map((d) => d.title.trim())
      .filter(Boolean)
      .slice(0, 6);
    const hint = names.length
      ? ` Try one of: ${names.join(", ")}.`
      : " Add a life area in Ideate first.";
    return {
      ok: false,
      label: `Couldn't find that life area.${hint}`,
    };
  }

  let subtasks = store.subtasks.filter((s) => s.projectId === area.id);
  let subtask = subtasks[0];
  if (!subtask) {
    subtask = createSubtask(area.id, "General");
    store = upsertSubtask(store, subtask);
    subtasks = [subtask];
  }

  const siblings = store.todos.filter((t) => t.subtaskId === subtask!.id);
  const order =
    siblings.reduce((m, t) => Math.max(m, t.order), -1) + 1;
  const todo = createTodo(subtask.id, title, order);
  store = upsertTodo(store, todo);
  saveIdeateStore(store);

  return {
    ok: true,
    label: `Added task to ${area.title.trim() || "life area"}`,
    href: `/ideate/goal/${encodeURIComponent(area.id)}`,
  };
}

function applyCreateMeditation(
  action: Extract<AssistantAction, { name: "create_meditation" }>,
): AssistantActionResult {
  const href = createMeditationHref({ path: "freeflow" });
  // Seed summary is available for a later handoff; for now open freeflow chat.
  void action;
  return {
    ok: true,
    label: "Open Create Meditation",
    href,
  };
}

/** Apply a single assistant ACTION against local stores / routes. */
export function executeAssistantAction(
  action: AssistantAction,
): AssistantActionResult {
  try {
    if (action.name === "add_gratitude") return applyGratitude(action);
    if (action.name === "add_todo") return applyTodo(action);
    if (action.name === "create_meditation") {
      return applyCreateMeditation(action);
    }
    return { ok: false, label: "Unknown action" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Action failed";
    return { ok: false, label: msg };
  }
}

export function executeAssistantActions(
  actions: AssistantAction[],
): AssistantActionResult[] {
  return actions.map(executeAssistantAction);
}

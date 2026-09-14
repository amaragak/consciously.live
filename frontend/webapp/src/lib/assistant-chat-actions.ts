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
  /** Short confirmation shown in chat (e.g. “Saved to today’s gratitudes”). */
  label: string;
  /** Optional quote / title of what was saved. */
  detail?: string;
  /** Optional deep link into the app. */
  href?: string;
  /** Link button copy when `href` is set. */
  linkLabel?: string;
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

function persistTodayGratitude(
  nextLines: string[],
  opts: {
    label: string;
    detail?: string;
    linkLabel?: string;
  },
): AssistantActionResult {
  const lines = normalizeGratitudeLines(nextLines);
  if (!lines.some((l) => l.trim())) {
    return { ok: false, label: "No gratitude text to add" };
  }

  let store = loadJournalStore();
  const today = localDateKey();
  const existing = findGratitudeEntryForLocalDate(store.entries, today);
  const entry: JournalEntry = existing
    ? {
        ...existing,
        gratitude: lines,
        contentHtml: gratitudeLinesToHtml(lines),
        title: gratitudeTitleForDate(new Date()),
        updatedAt: new Date().toISOString(),
      }
    : {
        ...newGratitudeJournalEntry(),
        gratitude: lines,
        contentHtml: gratitudeLinesToHtml(lines),
      };

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
    label: opts.label,
    ...(opts.detail ? { detail: opts.detail } : {}),
    href: `/journal/my/gratitudes/${encodeURIComponent(entry.id)}`,
    linkLabel: opts.linkLabel ?? "Open gratitude",
  };
}

/** Fill empty slots first; append beyond 3 when full. Never overwrite filled lines. */
export function mergeGratitudeAdditions(
  prevRaw: unknown,
  incoming: string[],
): string[] {
  const next = normalizeGratitudeLines(prevRaw);
  const existingLower = new Set(
    next.map((s) => s.trim().toLowerCase()).filter(Boolean),
  );

  for (const raw of incoming) {
    const line = raw.trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (existingLower.has(key)) continue;

    const emptyIdx = next.findIndex((s) => !s.trim());
    if (emptyIdx >= 0) {
      next[emptyIdx] = line;
      existingLower.add(key);
      continue;
    }
    next.push(line);
    existingLower.add(key);
  }
  return normalizeGratitudeLines(next);
}

function findGratitudeMatchIndex(lines: string[], match: string): number {
  const needle = match.trim().toLowerCase();
  if (!needle) return -1;
  const exact = lines.findIndex((s) => s.trim().toLowerCase() === needle);
  if (exact >= 0) return exact;

  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim().toLowerCase();
    if (!t) continue;
    if (t.includes(needle)) {
      // Prefer the shortest line that still contains the prior phrase.
      if (t.length < bestScore) {
        best = i;
        bestScore = t.length;
      }
    } else if (needle.includes(t) && t.length >= 2) {
      // Match param is longer than a short stored line — still a hit.
      const score = 1000 - t.length;
      if (score < bestScore) {
        best = i;
        bestScore = score;
      }
    }
  }
  return best;
}

function previewSnippet(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function applyGratitudeAdd(
  action: Extract<AssistantAction, { name: "add_gratitude" }>,
): AssistantActionResult {
  const store = loadJournalStore();
  const today = localDateKey();
  const existing = findGratitudeEntryForLocalDate(store.entries, today);
  const next = mergeGratitudeAdditions(existing?.gratitude, action.lines);
  const prev = normalizeGratitudeLines(existing?.gratitude);
  const changed =
    next.length !== prev.length || next.some((l, i) => l !== prev[i]);
  const detail = previewSnippet(
    action.lines.map((l) => l.trim()).filter(Boolean).join(" · ") ||
      next.filter((l) => l.trim()).at(-1) ||
      "",
  );
  if (!changed) {
    return {
      ok: true,
      label: "Already in today’s gratitudes",
      ...(detail ? { detail } : {}),
      href: existing
        ? `/journal/my/gratitudes/${encodeURIComponent(existing.id)}`
        : undefined,
      linkLabel: "Open gratitude",
    };
  }
  return persistTodayGratitude(next, {
    label: "Saved to today’s gratitudes",
    detail,
    linkLabel: "Open gratitude",
  });
}

function applyGratitudeUpdate(
  action: Extract<AssistantAction, { name: "update_gratitude" }>,
): AssistantActionResult {
  const text = action.text.trim();
  if (!text) return { ok: false, label: "No gratitude text to update" };

  const store = loadJournalStore();
  const today = localDateKey();
  const existing = findGratitudeEntryForLocalDate(store.entries, today);
  const lines = normalizeGratitudeLines(existing?.gratitude);
  const idx = findGratitudeMatchIndex(lines, action.match);

  if (idx < 0) {
    // No prior line — treat as a fresh add rather than inventing overwrite.
    return applyGratitudeAdd({ name: "add_gratitude", lines: [text] });
  }

  const detail = previewSnippet(text);
  if (lines[idx]!.trim() === text) {
    return {
      ok: true,
      label: "Gratitude already up to date",
      detail,
      href: existing
        ? `/journal/my/gratitudes/${encodeURIComponent(existing.id)}`
        : undefined,
      linkLabel: "Open gratitude",
    };
  }

  const next = [...lines];
  next[idx] = text;
  return persistTodayGratitude(next, {
    label: "Updated today’s gratitude",
    detail,
    linkLabel: "Open gratitude",
  });
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
    detail: previewSnippet(title),
    href: `/ideate/goal/${encodeURIComponent(area.id)}`,
    linkLabel: "Open life area",
  };
}

function applyCreateMeditation(
  action: Extract<AssistantAction, { name: "create_meditation" }>,
): AssistantActionResult {
  const href = createMeditationHref({ path: "freeflow" });
  return {
    ok: true,
    label: "Create Meditation is ready",
    ...(action.summary?.trim()
      ? { detail: previewSnippet(action.summary) }
      : {}),
    href,
    linkLabel: "Open Create",
  };
}

/** Apply a single assistant ACTION against local stores / routes. */
export function executeAssistantAction(
  action: AssistantAction,
): AssistantActionResult {
  try {
    if (action.name === "add_gratitude") return applyGratitudeAdd(action);
    if (action.name === "update_gratitude") return applyGratitudeUpdate(action);
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

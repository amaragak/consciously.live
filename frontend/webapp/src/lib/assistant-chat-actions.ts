import { createMeditationHref } from "@/lib/create-meditation-path";
import { getMedimadeSessionJwt } from "@/lib/auth-session";
import {
  deriveEntryTitle,
  entriesForCloudPut,
  findGratitudeEntryForLocalDate,
  gratitudeLinesToHtml,
  gratitudeTitleForDate,
  isGratitudeEntry,
  loadJournalStore,
  localDateKey,
  newGratitudeJournalEntry,
  newJournalEntry,
  normalizeGratitudeLines,
  saveJournalStore,
  stripHtmlToText,
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

const LAST_CHAT_JOURNAL_ENTRY_KEY = "mm_assistant_last_journal_entry_id_v1";

function rememberChatJournalEntryId(id: string): void {
  if (typeof window === "undefined" || !id.trim()) return;
  try {
    window.sessionStorage.setItem(LAST_CHAT_JOURNAL_ENTRY_KEY, id.trim());
  } catch {
    /* */
  }
}

function lastChatJournalEntryId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(LAST_CHAT_JOURNAL_ENTRY_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

function syncJournalCloud(store: JournalStoreV2): void {
  if (!getMedimadeSessionJwt()) return;
  const cloudEntries = entriesForCloudPut(store.entries);
  // Never overwrite cloud with an empty PUT from chat helpers.
  if (cloudEntries.length === 0) return;
  const cloudStore: JournalStoreV2 = {
    ...store,
    entries: cloudEntries,
    activeEntryId:
      store.activeEntryId &&
      cloudEntries.some((e) => e.id === store.activeEntryId)
        ? store.activeEntryId
        : (cloudEntries[0]?.id ?? null),
  };
  void putJournalStoreRemote(cloudStore).catch(() => {
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
  saveJournalStore(store, { source: "assistant-chat" });
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

function plainTextToJournalHtml(text: string): string {
  const paras = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    )
    .map((p) => p.trim())
    .filter(Boolean);
  if (!paras.length) return "<p></p>";
  return paras
    .map(
      (p) =>
        `<p>${p
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}</p>`,
    )
    .join("");
}

function applyJournalEntry(
  action: Extract<AssistantAction, { name: "add_journal_entry" }>,
): AssistantActionResult {
  const body = action.body.trim();
  if (!body) return { ok: false, label: "No journal text to save" };

  const contentHtml = plainTextToJournalHtml(body);
  const title =
    (action.title ?? "").trim() || deriveEntryTitle(contentHtml) || "Journal entry";

  const entry = newJournalEntry({
    title: title.slice(0, 120),
    contentHtml,
  });

  let store = loadJournalStore();
  store = {
    ...store,
    entries: [entry, ...store.entries],
    activeEntryId: entry.id,
  };
  saveJournalStore(store, { source: "assistant-chat" });
  rememberChatJournalEntryId(entry.id);
  syncJournalCloud(store);

  return {
    ok: true,
    label: "Saved journal entry",
    detail: previewSnippet(title),
    href: `/journal/my/${encodeURIComponent(entry.id)}`,
    linkLabel: "Open journal",
  };
}

function freeformJournalEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.filter((e) => !isGratitudeEntry(e));
}

function findJournalEntryForUpdate(
  entries: JournalEntry[],
  action: Extract<AssistantAction, { name: "update_journal_entry" }>,
): JournalEntry | null {
  const freeform = freeformJournalEntries(entries);
  if (!freeform.length) return null;

  if (action.id) {
    const byId = freeform.find((e) => e.id === action.id);
    if (byId) return byId;
  }

  const remembered = lastChatJournalEntryId();
  if (remembered) {
    const byRemembered = freeform.find((e) => e.id === remembered);
    if (byRemembered) return byRemembered;
  }

  const match = (action.match ?? "").trim().toLowerCase();
  if (match) {
    const scored = freeform
      .map((e) => {
        const hay = `${e.title}\n${stripHtmlToText(e.contentHtml)}`
          .trim()
          .toLowerCase();
        if (!hay.includes(match)) return null;
        return { e, score: hay.length };
      })
      .filter((x): x is { e: JournalEntry; score: number } => Boolean(x))
      .sort((a, b) => a.score - b.score);
    if (scored[0]) return scored[0].e;
  }

  // Fall back to the most recently updated freeform entry from this chat flow.
  return [...freeform].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0] ?? null;
}

function applyJournalUpdate(
  action: Extract<AssistantAction, { name: "update_journal_entry" }>,
): AssistantActionResult {
  const body = action.body.trim();
  if (!body) return { ok: false, label: "No journal text to update" };

  let store = loadJournalStore();
  const existing = findJournalEntryForUpdate(store.entries, action);
  if (!existing) {
    // No prior freeform entry — create rather than inventing an update.
    return applyJournalEntry({
      name: "add_journal_entry",
      body,
      ...(action.title ? { title: action.title } : {}),
    });
  }

  const contentHtml = plainTextToJournalHtml(body);
  const title =
    (action.title ?? "").trim() ||
    deriveEntryTitle(contentHtml) ||
    existing.title ||
    "Journal entry";

  const entry: JournalEntry = {
    ...existing,
    title: title.slice(0, 120),
    contentHtml,
    updatedAt: new Date().toISOString(),
  };

  store = {
    ...store,
    entries: store.entries.map((e) => (e.id === entry.id ? entry : e)),
    activeEntryId: entry.id,
  };
  saveJournalStore(store, { source: "assistant-chat" });
  rememberChatJournalEntryId(entry.id);
  syncJournalCloud(store);

  return {
    ok: true,
    label: "Updated journal entry",
    detail: previewSnippet(title),
    href: `/journal/my/${encodeURIComponent(entry.id)}`,
    linkLabel: "Open journal",
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
    if (action.name === "add_journal_entry") return applyJournalEntry(action);
    if (action.name === "update_journal_entry") return applyJournalUpdate(action);
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

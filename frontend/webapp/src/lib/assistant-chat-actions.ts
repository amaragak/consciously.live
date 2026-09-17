import { createMeditationHref } from "@/lib/create-meditation-path";
import { getMedimadeSessionJwt } from "@/lib/auth-session";
import {
  dispatchFocusChatControl,
  readFocusChatRunningHint,
} from "@/lib/focus-chat-control";
import {
  focusMyHrefFromIdeate,
  writeFocusSessionHandoff,
} from "@/lib/focus-session-handoff";
import { loadIdeateVisionBoardStore } from "@/lib/ideate-vision-board";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import {
  deriveEntryTitle,
  entriesForCloudPut,
  findGratitudeEntryForLocalDate,
  formatJournalEntryDate,
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
import {
  fetchDashboardDailyStatus,
  fetchJournalInsightsRemote,
  fetchJournalWeeklyReflectionRemote,
  listBackgroundAudio,
  listJournalWeeklyLettersRemote,
  listLibraryMeditations,
  listLibraryPrograms,
  patchMeditationArchived,
  patchMeditationFavourite,
  patchMeditationPublic,
  putDashboardDailyManualCheck,
  putJournalStoreRemote,
  runJournalInsightsRemote,
} from "@/lib/medimade-api";
import {
  loadMixerPresetStore,
  newMixerPreset,
  saveMixerPresetStore,
} from "@/lib/mixer-preset-storage";
import { createPlanDream } from "@/lib/plan-dreams";
import {
  createSubtask,
  createTodo,
  loadIdeateStore,
  saveIdeateStore,
  upsertDream,
  upsertSubtask,
  upsertTodo,
  deleteTodo,
  type IdeateStoreV2,
} from "@/lib/plan-ideate-store";
import type { AssistantAction } from "@/lib/assistant-chat-protocol";

export type AssistantActionResultItem = {
  id?: string;
  title: string;
  body?: string;
  meta?: string;
  subtitle?: string;
  lines?: string[];
  href?: string;
};

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
  /** Structured rows for list/get results. */
  items?: AssistantActionResultItem[];
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
  // Explicit id wins even for guest demos the user is actively planning.
  if (action.lifeAreaId) {
    const byId = store.dreams.find((d) => d.id === action.lifeAreaId);
    if (byId) return byId;
  }
  const dreams = store.dreams.filter((d) => !isDemoIdeateDream(d));
  const needle = (action.lifeAreaTitle ?? "").trim().toLowerCase();
  if (!needle) return null;
  const pool = dreams.length ? dreams : store.dreams;
  const exact = pool.find((d) => d.title.trim().toLowerCase() === needle);
  if (exact) return exact;
  const partial = pool.find((d) => {
    const t = d.title.trim().toLowerCase();
    return t.includes(needle) || needle.includes(t);
  });
  return partial ?? null;
}

function resolveParentTask(
  store: IdeateStoreV2,
  lifeAreaId: string,
  action: Extract<AssistantAction, { name: "add_todo" }>,
) {
  const parentId = (action.parentTaskId ?? "").trim();
  if (parentId) {
    const byId = store.subtasks.find(
      (s) => s.id === parentId && s.projectId === lifeAreaId,
    );
    if (byId) return byId;
  }
  const needle = (action.parentTaskTitle ?? "").trim().toLowerCase();
  if (!needle) return null;
  const inArea = store.subtasks.filter((s) => s.projectId === lifeAreaId);
  const exact = inArea.find((s) => s.title.trim().toLowerCase() === needle);
  if (exact) return exact;
  return (
    inArea.find((s) => {
      const t = s.title.trim().toLowerCase();
      return t.includes(needle) || needle.includes(t);
    }) ?? null
  );
}

function lifeAreaTasksHref(lifeAreaId: string, taskId: string): string {
  return `/manifest/goal/${encodeURIComponent(lifeAreaId)}?tab=steps&task=${encodeURIComponent(taskId)}`;
}

function gratitudeResultItem(entry: JournalEntry): AssistantActionResultItem {
  const lines = normalizeGratitudeLines(entry.gratitude)
    .map((l) => l.trim())
    .filter(Boolean);
  return {
    id: entry.id,
    title: "Gratitudes",
    meta: formatJournalEntryDate(entry.createdAt),
    lines: lines.length ? lines : ["Empty"],
    href: `/journal/my/gratitudes/${encodeURIComponent(entry.id)}`,
  };
}

function gratitudeResultFromEntry(
  entry: JournalEntry,
  label: string,
): AssistantActionResult {
  return {
    ok: true,
    label,
    items: [gratitudeResultItem(entry)],
  };
}

function persistGratitudeEntry(
  base: JournalEntry | null,
  nextLines: string[],
  opts: { label: string },
): AssistantActionResult {
  const lines = normalizeGratitudeLines(nextLines);
  if (!lines.some((l) => l.trim())) {
    return { ok: false, label: "No gratitude text to add" };
  }

  let store = loadJournalStore();
  const now = new Date();
  const entry: JournalEntry = base
    ? {
        ...base,
        gratitude: lines,
        contentHtml: gratitudeLinesToHtml(lines),
        title: gratitudeTitleForDate(
          Number.isNaN(new Date(base.createdAt).getTime())
            ? now
            : new Date(base.createdAt),
        ),
        updatedAt: now.toISOString(),
      }
    : {
        ...newGratitudeJournalEntry(now),
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

  return gratitudeResultFromEntry(entry, opts.label);
}

function persistTodayGratitude(
  nextLines: string[],
  opts: { label: string },
): AssistantActionResult {
  const store = loadJournalStore();
  const existing = findGratitudeEntryForLocalDate(store.entries, localDateKey());
  return persistGratitudeEntry(existing ?? null, nextLines, opts);
}

function resolveGratitudeEntryForUpdate(action: {
  id?: string;
  date?: string;
  match?: string;
  index?: number;
}): JournalEntry | undefined {
  const store = loadJournalStore();
  if (action.id) {
    return store.entries.find(
      (e) => e.id === action.id && isGratitudeEntry(e),
    );
  }
  if (action.date) {
    return (
      findGratitudeEntryForLocalDate(store.entries, action.date) ?? undefined
    );
  }

  const today = findGratitudeEntryForLocalDate(store.entries, localDateKey());
  const recent = [...store.entries]
    .filter(isGratitudeEntry)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  const match = (action.match ?? "").trim();
  if (match) {
    if (today) {
      const lines = normalizeGratitudeLines(today.gratitude);
      if (findGratitudeMatchIndex(lines, match) >= 0) return today;
    }
    for (const e of recent) {
      const lines = normalizeGratitudeLines(e.gratitude);
      if (findGratitudeMatchIndex(lines, match) >= 0) return e;
    }
  }

  if (action.index != null && action.index >= 1) {
    if (today) {
      const filled = normalizeGratitudeLines(today.gratitude).filter((l) =>
        l.trim(),
      );
      if (action.index <= filled.length) return today;
    }
    for (const e of recent) {
      const filled = normalizeGratitudeLines(e.gratitude).filter((l) =>
        l.trim(),
      );
      if (action.index <= filled.length) return e;
    }
  }

  return today ?? recent[0];
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
  if (!changed && existing) {
    return gratitudeResultFromEntry(existing, "Already in today’s gratitudes");
  }
  return persistTodayGratitude(next, {
    label: "Saved to today’s gratitudes",
  });
}

function applyGratitudeUpdate(
  action: Extract<AssistantAction, { name: "update_gratitude" }>,
): AssistantActionResult {
  const text = action.text.trim();
  if (!text) return { ok: false, label: "No gratitude text to update" };

  const existing = resolveGratitudeEntryForUpdate(action);
  if (!existing) {
    // No entry to edit — treat as a fresh add rather than inventing overwrite.
    return applyGratitudeAdd({ name: "add_gratitude", lines: [text] });
  }

  const lines = normalizeGratitudeLines(existing.gratitude);
  const filled = lines
    .map((l, i) => ({ l: l.trim(), i }))
    .filter((x) => x.l);

  let idx = -1;
  if (action.index != null && action.index >= 1) {
    const hit = filled[action.index - 1];
    idx = hit ? hit.i : -1;
  }
  if (idx < 0 && action.match) {
    idx = findGratitudeMatchIndex(lines, action.match);
  }

  if (idx < 0) {
    return { ok: false, label: "Couldn't find that gratitude line" };
  }

  if (lines[idx]!.trim() === text) {
    return gratitudeResultFromEntry(existing, "Gratitude already up to date");
  }

  const next = [...lines];
  next[idx] = text;
  return persistGratitudeEntry(existing, next, {
    label: "Updated",
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
    items: [
      {
        id: entry.id,
        title: "Journal",
        meta: formatJournalEntryDate(entry.createdAt),
        subtitle: title.slice(0, 120),
        body: stripHtmlToText(contentHtml).trim() || undefined,
        href: `/journal/my/${encodeURIComponent(entry.id)}`,
      },
    ],
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
    label: "Updated",
    items: [
      {
        id: entry.id,
        title: "Journal",
        meta: formatJournalEntryDate(entry.createdAt),
        subtitle: entry.title || "Untitled",
        body: stripHtmlToText(entry.contentHtml).trim() || undefined,
        href: `/journal/my/${encodeURIComponent(entry.id)}`,
      },
    ],
  };
}

function applyTodo(
  action: Extract<AssistantAction, { name: "add_todo" }>,
): AssistantActionResult {
  const title = action.title.trim();
  if (!title) return { ok: false, label: "Missing goal title" };

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
      : " Add a life area in Manifest first.";
    return {
      ok: false,
      label: `Couldn't find that life area.${hint}`,
    };
  }

  const wantsChecklistItem = Boolean(
    (action.parentTaskId ?? "").trim() ||
      (action.parentTaskTitle ?? "").trim(),
  );

  if (wantsChecklistItem) {
    const parent = resolveParentTask(store, area.id, action);
    if (!parent) {
      return {
        ok: false,
        label:
          "Couldn't find that parent goal. Add the goal first, then To Dos under it.",
      };
    }
    const siblings = store.todos.filter((t) => t.subtaskId === parent.id);
    const order =
      siblings.reduce((m, t) => Math.max(m, t.order), -1) + 1;
    const todo = createTodo(parent.id, title, order);
    store = upsertTodo(store, todo);
    saveIdeateStore(store);
    return {
      ok: true,
      label: `Added To Do under ${parent.title.trim() || "goal"}`,
      detail: previewSnippet(title),
      href: lifeAreaTasksHref(area.id, parent.id),
      linkLabel: "Open goal",
    };
  }

  // Ideate UI “goal” = IdeateSubtask (not a nested checklist To Do).
  const subtask = createSubtask(area.id, title);
  store = upsertSubtask(store, subtask);
  saveIdeateStore(store);

  return {
    ok: true,
    label: `Added goal to ${area.title.trim() || "life area"}`,
    detail: previewSnippet(title),
    href: lifeAreaTasksHref(area.id, subtask.id),
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

function applyListGratitudes(
  action: Extract<AssistantAction, { name: "list_gratitudes" }>,
): AssistantActionResult {
  const store = loadJournalStore();
  const limit = Math.min(20, Math.max(1, action.limit ?? 7));
  const rows = store.entries
    .filter(isGratitudeEntry)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, limit);
  if (!rows.length) {
    return {
      ok: true,
      label: "No gratitudes yet",
      href: "/journal/my/gratitudes",
      linkLabel: "Open journal",
    };
  }
  return {
    ok: true,
    label: "Gratitudes",
    items: rows.map((e) => gratitudeResultItem(e)),
  };
}

function applyGetGratitude(
  action: Extract<AssistantAction, { name: "get_gratitude" }>,
): AssistantActionResult {
  const store = loadJournalStore();
  let entry: JournalEntry | undefined;
  if (action.id) {
    entry = store.entries.find(
      (e) => e.id === action.id && isGratitudeEntry(e),
    );
  } else if (action.date) {
    entry =
      findGratitudeEntryForLocalDate(store.entries, action.date) ?? undefined;
  }
  if (!entry) {
    return { ok: false, label: "Couldn't find that gratitude" };
  }
  return gratitudeResultFromEntry(entry, "Gratitudes");
}

function applyListJournalEntries(
  action: Extract<AssistantAction, { name: "list_journal_entries" }>,
): AssistantActionResult {
  const store = loadJournalStore();
  const limit = Math.min(20, Math.max(1, action.limit ?? 8));
  let rows = freeformJournalEntries(store.entries);
  if (action.folderId) {
    rows = rows.filter((e) => e.folderId === action.folderId);
  }
  rows = [...rows]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, limit);
  if (!rows.length) {
    return {
      ok: true,
      label: "No journal entries yet",
      href: "/journal/my",
      linkLabel: "Open journal",
    };
  }
  return {
    ok: true,
    label: "Journal",
    items: rows.map((e) => ({
      id: e.id,
      title: "Journal",
      meta: formatJournalEntryDate(e.createdAt),
      subtitle: e.title || "Untitled",
      body: stripHtmlToText(e.contentHtml).trim() || undefined,
      href: `/journal/my/${encodeURIComponent(e.id)}`,
    })),
  };
}

function applyGetJournalEntry(
  action: Extract<AssistantAction, { name: "get_journal_entry" }>,
): AssistantActionResult {
  const store = loadJournalStore();
  const entry = freeformJournalEntries(store.entries).find(
    (e) => e.id === action.id,
  );
  if (!entry) return { ok: false, label: "Couldn't find that journal entry" };
  return {
    ok: true,
    label: "Journal",
    items: [
      {
        id: entry.id,
        title: "Journal",
        meta: formatJournalEntryDate(entry.createdAt),
        subtitle: entry.title || "Untitled",
        body: stripHtmlToText(entry.contentHtml).trim() || undefined,
        href: `/journal/my/${encodeURIComponent(entry.id)}`,
      },
    ],
  };
}

async function applyGetJournalInsights(): Promise<AssistantActionResult> {
  try {
    const insights = await fetchJournalInsightsRemote();
    if (!insights?.topics?.length) {
      return {
        ok: true,
        label: "No journal insights yet",
        href: "/journal/my/insights",
        linkLabel: "Open insights",
      };
    }
    return {
      ok: true,
      label: "Journal insights",
      items: insights.topics.slice(0, 6).map((t) => ({
        id: t.topicId,
        title: t.topicId.replace(/_/g, " "),
        meta: "Insight",
        body: stripHtmlToText(t.summaryMarkdown).replace(/[#*_`]/g, "").trim(),
        href: "/journal/my/insights",
      })),
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't load insights",
    };
  }
}

async function applyRunJournalInsights(): Promise<AssistantActionResult> {
  try {
    const insights = await runJournalInsightsRemote({ mode: "update" });
    if (!insights.topics?.length) {
      return {
        ok: true,
        label: "Refreshed journal insights",
        href: "/journal/my/insights",
        linkLabel: "Open insights",
      };
    }
    return {
      ok: true,
      label: "Refreshed journal insights",
      items: insights.topics.slice(0, 6).map((t) => ({
        id: t.topicId,
        title: t.topicId.replace(/_/g, " "),
        meta: "Insight",
        body: stripHtmlToText(t.summaryMarkdown).replace(/[#*_`]/g, "").trim(),
        href: "/journal/my/insights",
      })),
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't refresh insights",
    };
  }
}

async function applyListWeeklyLetters(): Promise<AssistantActionResult> {
  try {
    const { letters } = await listJournalWeeklyLettersRemote();
    if (!letters.length) {
      return {
        ok: true,
        label: "No weekly letters yet",
        href: "/journal/my/insights",
        linkLabel: "Open weekly",
      };
    }
    return {
      ok: true,
      label: `${letters.length} weekly letter${letters.length === 1 ? "" : "s"}`,
      items: letters.slice(0, 8).map((l) => ({
        id: l.weekKey,
        title: l.weekKey,
        meta: "Weekly letter",
        body:
          l.weekStart && l.weekEnd
            ? `${l.weekStart} → ${l.weekEnd}`
            : undefined,
        href: `/journal/my/insights/${encodeURIComponent(l.weekKey)}`,
      })),
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't list weekly letters",
    };
  }
}

async function applyGetWeeklyReflection(
  action: Extract<AssistantAction, { name: "get_weekly_reflection" }>,
): Promise<AssistantActionResult> {
  try {
    const res = await fetchJournalWeeklyReflectionRemote(
      action.weekKey ? { week: action.weekKey } : undefined,
    );
    if (!res.reflection) {
      return {
        ok: true,
        label: "No weekly reflection for that week",
        href: "/journal/my/insights",
        linkLabel: "Open weekly",
      };
    }
    const href = res.weekKey
      ? `/journal/my/insights/${encodeURIComponent(res.weekKey)}`
      : "/journal/my/insights";
    return {
      ok: true,
      label: "Weekly reflection",
      items: [
        {
          id: res.weekKey || "week",
          title: res.weekKey || "This week",
          meta: "Weekly letter",
          body: res.reflection.letterMarkdown.replace(/[#*_`]/g, "").trim(),
          href,
        },
      ],
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't load weekly reflection",
    };
  }
}

function resolveLifeAreaFlexible(
  store: IdeateStoreV2,
  opts: { lifeAreaId?: string; lifeAreaTitle?: string; id?: string; title?: string },
) {
  const id = (opts.lifeAreaId ?? opts.id ?? "").trim();
  if (id) {
    const byId = store.dreams.find((d) => d.id === id);
    if (byId) return byId;
  }
  const needle = (opts.lifeAreaTitle ?? opts.title ?? "").trim().toLowerCase();
  if (!needle) return null;
  const dreams = store.dreams.filter((d) => !isDemoIdeateDream(d));
  const pool = dreams.length ? dreams : store.dreams;
  const exact = pool.find((d) => d.title.trim().toLowerCase() === needle);
  if (exact) return exact;
  return (
    pool.find((d) => {
      const t = d.title.trim().toLowerCase();
      return t.includes(needle) || needle.includes(t);
    }) ?? null
  );
}

function applyListLifeAreas(): AssistantActionResult {
  const store = loadIdeateStore();
  const areas = store.dreams.filter((d) => !isDemoIdeateDream(d));
  if (!areas.length) {
    return {
      ok: true,
      label: "No life areas yet",
      href: "/manifest/my",
      linkLabel: "Open Manifest",
    };
  }
  return {
    ok: true,
    label: `${areas.length} life area${areas.length === 1 ? "" : "s"}`,
    items: areas.map((d) => {
      const goals = store.subtasks.filter((s) => s.projectId === d.id);
      const openTodos = store.todos.filter(
        (t) => !t.isChecked && goals.some((g) => g.id === t.subtaskId),
      );
      return {
        id: d.id,
        title: d.title.trim() || "Untitled",
        meta: "Life area",
        body: `${goals.length} goal${goals.length === 1 ? "" : "s"} · ${openTodos.length} open To Do${openTodos.length === 1 ? "" : "s"}`,
        href: `/manifest/goal/${encodeURIComponent(d.id)}`,
      };
    }),
  };
}

function applyGetLifeArea(
  action: Extract<AssistantAction, { name: "get_life_area" }>,
): AssistantActionResult {
  const store = loadIdeateStore();
  const area = resolveLifeAreaFlexible(store, action);
  if (!area) return { ok: false, label: "Couldn't find that life area" };
  const goals = store.subtasks.filter((s) => s.projectId === area.id);
  const openTodos = store.todos.filter(
    (t) =>
      !t.isChecked &&
      goals.some((g) => g.id === t.subtaskId),
  );
  return {
    ok: true,
    label: "Life area",
    items: [
      {
        id: area.id,
        title: area.title.trim() || "Untitled",
        meta: "Life area",
        body: [
          area.dreamText?.trim() || undefined,
          `${goals.length} goal${goals.length === 1 ? "" : "s"} · ${openTodos.length} open To Do${openTodos.length === 1 ? "" : "s"}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        href: `/manifest/goal/${encodeURIComponent(area.id)}`,
      },
    ],
  };
}

function applyCreateLifeArea(
  action: Extract<AssistantAction, { name: "create_life_area" }>,
): AssistantActionResult {
  const title = action.title.trim();
  if (!title) return { ok: false, label: "Missing life area title" };
  let store = loadIdeateStore();
  const dream = createPlanDream({
    title,
    ...(action.description?.trim()
      ? { dreamText: action.description.trim(), firstThought: action.description.trim() }
      : {}),
  });
  store = upsertDream(store, dream);
  saveIdeateStore(store);
  return {
    ok: true,
    label: "Created life area",
    detail: previewSnippet(title),
    href: `/manifest/goal/${encodeURIComponent(dream.id)}`,
    linkLabel: "Open",
  };
}

function applyPutLifeArea(
  action: Extract<AssistantAction, { name: "put_life_area" }>,
): AssistantActionResult {
  let store = loadIdeateStore();
  const existing = store.dreams.find((d) => d.id === action.id);
  if (!existing) return { ok: false, label: "Couldn't find that life area" };
  const next = {
    ...existing,
    ...(action.title?.trim() ? { title: action.title.trim() } : {}),
    ...(action.description?.trim()
      ? {
          dreamText: action.description.trim(),
          firstThought: action.description.trim(),
        }
      : {}),
    updatedAt: new Date().toISOString(),
  };
  store = upsertDream(store, next);
  saveIdeateStore(store);
  return {
    ok: true,
    label: "Updated life area",
    detail: previewSnippet(next.title),
    href: `/manifest/goal/${encodeURIComponent(next.id)}`,
    linkLabel: "Open",
  };
}

function applyListTodos(
  action: Extract<AssistantAction, { name: "list_todos" }>,
): AssistantActionResult {
  const store = loadIdeateStore();
  const area = resolveLifeAreaFlexible(store, action);
  if (!area && (action.lifeAreaId || action.lifeAreaTitle)) {
    return { ok: false, label: "Couldn't find that life area" };
  }
  const goals = area
    ? store.subtasks.filter((s) => s.projectId === area.id)
    : store.subtasks;
  const goalIds = new Set(goals.map((g) => g.id));
  let todos = store.todos.filter((t) => goalIds.has(t.subtaskId));
  if (action.openOnly) todos = todos.filter((t) => !t.isChecked);
  if (!todos.length) {
    return {
      ok: true,
      label: "No To Dos found",
      href: area
        ? `/manifest/goal/${encodeURIComponent(area.id)}?tab=steps`
        : "/manifest/my",
      linkLabel: "Open Manifest",
    };
  }
  return {
    ok: true,
    label: `${todos.length} To Do${todos.length === 1 ? "" : "s"}`,
    items: todos.slice(0, 12).map((t) => {
      const parent = store.subtasks.find((s) => s.id === t.subtaskId);
      return {
        id: t.id,
        title: t.title.trim() || "To Do",
        meta: t.isChecked ? "Done" : parent?.title?.trim() || "To Do",
        body: parent
          ? `Under ${parent.title.trim() || "goal"}`
          : undefined,
        href: parent
          ? lifeAreaTasksHref(parent.projectId, parent.id)
          : area
            ? `/manifest/goal/${encodeURIComponent(area.id)}?tab=steps`
            : "/manifest/my",
      };
    }),
  };
}

function applyPutTodo(
  action: Extract<AssistantAction, { name: "put_todo" }>,
): AssistantActionResult {
  let store = loadIdeateStore();
  const todo = store.todos.find((t) => t.id === action.todoId);
  if (!todo) {
    // Also allow updating a goal (subtask) by id when used as "todo"
    const goal = store.subtasks.find((s) => s.id === action.todoId);
    if (!goal) return { ok: false, label: "Couldn't find that To Do" };
    const next = {
      ...goal,
      ...(action.title?.trim() ? { title: action.title.trim() } : {}),
      ...(action.checked != null
        ? { status: action.checked ? ("done" as const) : ("not_started" as const) }
        : {}),
      updatedAt: new Date().toISOString(),
    };
    store = upsertSubtask(store, next);
    saveIdeateStore(store);
    return {
      ok: true,
      label: "Updated goal",
      detail: previewSnippet(next.title),
      href: lifeAreaTasksHref(goal.projectId, goal.id),
      linkLabel: "Open",
    };
  }
  const next = {
    ...todo,
    ...(action.title?.trim() ? { title: action.title.trim() } : {}),
    ...(action.checked != null
      ? {
          isChecked: action.checked,
          checkedAt: action.checked ? new Date().toISOString() : null,
          wasUnchecked: action.checked ? false : true,
        }
      : {}),
  };
  store = upsertTodo(store, next);
  saveIdeateStore(store);
  const parent = store.subtasks.find((s) => s.id === todo.subtaskId);
  return {
    ok: true,
    label: action.checked === true ? "Marked To Do done" : "Updated To Do",
    detail: previewSnippet(next.title),
    href: parent
      ? lifeAreaTasksHref(parent.projectId, parent.id)
      : "/manifest/my",
    linkLabel: "Open",
  };
}

function applyDeleteTodo(
  action: Extract<AssistantAction, { name: "delete_todo" }>,
): AssistantActionResult {
  let store = loadIdeateStore();
  const todo = store.todos.find((t) => t.id === action.todoId);
  if (!todo) return { ok: false, label: "Couldn't find that To Do" };
  const title = todo.title;
  const parent = store.subtasks.find((s) => s.id === todo.subtaskId);
  store = deleteTodo(store, action.todoId);
  saveIdeateStore(store);
  return {
    ok: true,
    label: "Removed To Do",
    detail: previewSnippet(title),
    href: parent
      ? lifeAreaTasksHref(parent.projectId, parent.id)
      : "/manifest/my",
    linkLabel: "Open",
  };
}

function applyGetIdeateStore(): AssistantActionResult {
  const store = loadIdeateStore();
  const areas = store.dreams.filter((d) => !isDemoIdeateDream(d));
  const openTodos = store.todos.filter((t) => !t.isChecked).length;
  return {
    ok: true,
    label: "Manifest snapshot",
    items: [
      {
        title: "Manifest",
        meta: "Snapshot",
        body: `${areas.length} areas · ${store.subtasks.length} goals · ${openTodos} open To Dos`,
        href: "/manifest/my",
      },
      ...areas.slice(0, 6).map((d) => ({
        id: d.id,
        title: d.title.trim() || "Untitled",
        meta: "Life area",
        href: `/manifest/goal/${encodeURIComponent(d.id)}`,
      })),
    ],
  };
}

async function applyPutIdeateStore(): Promise<AssistantActionResult> {
  try {
    if (!getMedimadeSessionJwt()) {
      return {
        ok: false,
        label: "Sign in to sync Manifest to the cloud",
      };
    }
    const { scheduleIdeateCloudPush } = await import("@/lib/ideate-cloud");
    scheduleIdeateCloudPush(0);
    return {
      ok: true,
      label: "Syncing Manifest to cloud",
      href: "/manifest/my",
      linkLabel: "Open Manifest",
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't sync Manifest",
    };
  }
}

function applyListVisionBoard(): AssistantActionResult {
  const board = loadIdeateVisionBoardStore();
  const items = board.items ?? [];
  if (!items.length) {
    return {
      ok: true,
      label: "Vision board is empty",
      href: "/manifest/my/vision-board",
      linkLabel: "Open vision board",
    };
  }
  return {
    ok: true,
    label: `${items.length} vision item${items.length === 1 ? "" : "s"}`,
    items: items.slice(0, 10).map((i) => ({
      id: i.id,
      title: i.label?.trim() || "Vision item",
      meta: "Vision board",
      body: i.prompt?.trim() || undefined,
      href: "/manifest/my/vision-board",
    })),
  };
}

async function applyListLibrary(
  action: Extract<AssistantAction, { name: "list_library" }>,
): Promise<AssistantActionResult> {
  try {
    let items = await listLibraryMeditations();
    if (action.favouritesOnly) {
      items = items.filter((m) => m.favourite === true);
    }
    const limit = Math.min(20, Math.max(1, action.limit ?? 8));
    items = items.slice(0, limit);
    if (!items.length) {
      return {
        ok: true,
        label: action.favouritesOnly
          ? "No favourites yet"
          : "Library is empty",
        href: "/meditate/library/creations",
        linkLabel: "Open library",
      };
    }
    return {
      ok: true,
      label: `${items.length} meditation${items.length === 1 ? "" : "s"}`,
      items: items.map((m) => {
        const focus = m.sk || m.s3Key;
        return {
          id: focus,
          title: m.title || "Untitled",
          meta: [m.meditationStyle, m.favourite ? "Favourite" : null]
            .filter(Boolean)
            .join(" · ") || "Meditation",
          body: m.description?.trim() || undefined,
          href: `/meditate/library/creations?focus=${encodeURIComponent(focus)}`,
        };
      }),
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't list library",
    };
  }
}

async function applyGetMeditation(
  action: Extract<AssistantAction, { name: "get_meditation" }>,
): Promise<AssistantActionResult> {
  try {
    const items = await listLibraryMeditations();
    const m = items.find(
      (x) => x.sk === action.sk || x.id === action.sk || x.s3Key === action.sk,
    );
    if (!m) return { ok: false, label: "Couldn't find that meditation" };
    const focus = m.sk || m.s3Key;
    return {
      ok: true,
      label: "Meditation",
      items: [
        {
          id: focus,
          title: m.title || "Meditation",
          meta: m.meditationStyle?.trim() || "Meditation",
          body: [m.description?.trim(), m.scriptText?.trim()?.slice(0, 600)]
            .filter(Boolean)
            .join("\n\n"),
          href: `/meditate/library/creations?focus=${encodeURIComponent(focus)}`,
        },
      ],
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't load meditation",
    };
  }
}

async function applyPutMeditationFavourite(
  action: Extract<AssistantAction, { name: "put_meditation_favourite" }>,
): Promise<AssistantActionResult> {
  try {
    await patchMeditationFavourite(action.sk, action.favourite);
    return {
      ok: true,
      label: action.favourite ? "Added to favourites" : "Removed from favourites",
      href: `/meditate/library/creations?focus=${encodeURIComponent(action.sk)}`,
      linkLabel: "Open",
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't update favourite",
    };
  }
}

async function applyPutMeditationArchived(
  action: Extract<AssistantAction, { name: "put_meditation_archived" }>,
): Promise<AssistantActionResult> {
  try {
    await patchMeditationArchived(action.sk, action.archived);
    return {
      ok: true,
      label: action.archived ? "Archived meditation" : "Restored meditation",
      href: "/meditate/library/creations",
      linkLabel: "Open library",
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't update archive",
    };
  }
}

async function applyPutMeditationPublic(
  action: Extract<AssistantAction, { name: "put_meditation_public" }>,
): Promise<AssistantActionResult> {
  try {
    await patchMeditationPublic(action.sk, action.isPublic);
    return {
      ok: true,
      label: action.isPublic ? "Made meditation public" : "Made meditation private",
      href: `/meditate/library/creations?focus=${encodeURIComponent(action.sk)}`,
      linkLabel: "Open",
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't update public flag",
    };
  }
}

function applyPlayMeditation(
  action: Extract<AssistantAction, { name: "play_meditation" }>,
): AssistantActionResult {
  const href = `/meditate/library/creations?focus=${encodeURIComponent(action.sk)}&play=1`;
  return {
    ok: true,
    label: "Ready to play",
    href,
    linkLabel: "Play",
  };
}

async function applyListPrograms(): Promise<AssistantActionResult> {
  try {
    const programs = await listLibraryPrograms();
    if (!programs.length) {
      return {
        ok: true,
        label: "No programs yet",
        href: "/meditate/library/creations",
        linkLabel: "Open library",
      };
    }
    return {
      ok: true,
      label: `${programs.length} program${programs.length === 1 ? "" : "s"}`,
      items: programs.slice(0, 8).map((p) => ({
        id: p.id,
        title: p.title || p.id,
        meta: "Program",
        body: p.description?.trim() || undefined,
        href: "/meditate/library/creations",
      })),
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't list programs",
    };
  }
}

function applyNavigateCreateByType(
  action: Extract<AssistantAction, { name: "navigate_create_by_type" }>,
): AssistantActionResult {
  const href = createMeditationHref({ path: "style" });
  return {
    ok: true,
    label: "Create by type is ready",
    ...(action.style?.trim()
      ? { detail: previewSnippet(action.style) }
      : {}),
    href,
    linkLabel: "Open Create",
  };
}

function applyNavigateCreateFromJournal(
  action: Extract<AssistantAction, { name: "navigate_create_from_journal" }>,
): AssistantActionResult {
  let href = createMeditationHref({ path: "journalReflect" });
  if (action.entryId?.trim()) {
    href += `${href.includes("?") ? "&" : "?"}entryId=${encodeURIComponent(action.entryId.trim())}`;
  }
  return {
    ok: true,
    label: "Create from journal is ready",
    href,
    linkLabel: "Open Create",
  };
}

function applyNavigateCreateFromIdea(
  action: Extract<AssistantAction, { name: "navigate_create_from_idea" }>,
): AssistantActionResult {
  let href = createMeditationHref({ path: "goal" });
  if (action.lifeAreaId?.trim()) {
    href += `${href.includes("?") ? "&" : "?"}lifeAreaId=${encodeURIComponent(action.lifeAreaId.trim())}`;
  }
  return {
    ok: true,
    label: "Create from Manifest is ready",
    href,
    linkLabel: "Open Create",
  };
}

async function applyListSounds(): Promise<AssistantActionResult> {
  try {
    const beds = await listBackgroundAudio();
    return {
      ok: true,
      label: "Background sounds",
      items: [
        {
          title: "Sounds library",
          meta: "Sounds",
          body: [
            `Nature ${beds.nature?.length ?? 0}`,
            `Music ${beds.music?.length ?? 0}`,
            `Drums ${beds.drums?.length ?? 0}`,
            `Noise ${beds.noise?.length ?? 0}`,
          ].join(" · "),
          href: "/meditate/sounds",
        },
      ],
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't list sounds",
    };
  }
}

function applyListSoundMixes(): AssistantActionResult {
  const store = loadMixerPresetStore();
  if (!store.presets.length) {
    return {
      ok: true,
      label: "No saved mixes yet",
      href: "/meditate/sounds",
      linkLabel: "Open sounds",
    };
  }
  return {
    ok: true,
    label: `${store.presets.length} saved mix${store.presets.length === 1 ? "" : "es"}`,
    items: store.presets.map((p) => ({
      id: p.id,
      title: p.name,
      meta: "Sound mix",
      href: "/meditate/sounds",
    })),
  };
}

function applyPutSoundMix(
  action: Extract<AssistantAction, { name: "put_sound_mix" }>,
): AssistantActionResult {
  const store = loadMixerPresetStore();
  const existing = action.id
    ? store.presets.find((p) => p.id === action.id)
    : undefined;
  const now = new Date().toISOString();
  const base = existing ?? newMixerPreset(action.mixName);
  const next = {
    ...base,
    name: action.mixName.trim() || base.name,
    updatedAt: now,
    ...(action.natureKey != null ? { natureKey: action.natureKey } : {}),
    ...(action.musicKey != null ? { musicKey: action.musicKey } : {}),
    ...(action.drumsKey != null ? { drumsKey: action.drumsKey } : {}),
    ...(action.noiseKey != null ? { noiseKey: action.noiseKey } : {}),
    ...(action.natureGain != null ? { natureGain: action.natureGain } : {}),
    ...(action.musicGain != null ? { musicGain: action.musicGain } : {}),
    ...(action.drumsGain != null ? { drumsGain: action.drumsGain } : {}),
    ...(action.noiseGain != null ? { noiseGain: action.noiseGain } : {}),
  };
  const presets = existing
    ? store.presets.map((p) => (p.id === existing.id ? next : p))
    : [...store.presets, next];
  saveMixerPresetStore({
    version: 1,
    activeId: next.id,
    presets,
  });
  return {
    ok: true,
    label: existing ? "Updated sound mix" : "Saved sound mix",
    detail: previewSnippet(next.name),
    href: "/meditate/sounds",
    linkLabel: "Open sounds",
  };
}

function applyGetFocusSession(): AssistantActionResult {
  const hint = readFocusChatRunningHint();
  return {
    ok: true,
    label: "Focus session",
    items: [
      {
        title: hint.task || "Focus",
        meta: "Focus",
        body: `${hint.sessionsToday} session${hint.sessionsToday === 1 ? "" : "s"} today`,
        href: "/focus/my",
      },
    ],
  };
}

function applyStartFocus(
  action: Extract<AssistantAction, { name: "start_focus" }>,
): AssistantActionResult {
  const minutes =
    action.minutes && action.minutes > 0
      ? Math.min(120, action.minutes)
      : undefined;
  if (action.todoId?.trim()) {
    writeFocusSessionHandoff({ v: 1, subtaskId: action.todoId.trim() });
  }
  dispatchFocusChatControl({
    cmd: "start",
    ...(minutes != null ? { minutes } : {}),
  });
  const href = action.todoId?.trim()
    ? focusMyHrefFromIdeate()
    : minutes != null
      ? `/focus/my?minutes=${minutes}&autoStart=1`
      : "/focus/my?autoStart=1";
  return {
    ok: true,
    label: minutes != null ? `Start ${minutes}-min Focus` : "Start Focus",
    href,
    linkLabel: "Open Focus",
  };
}

function applyPauseFocus(): AssistantActionResult {
  dispatchFocusChatControl({ cmd: "pause" });
  return {
    ok: true,
    label: "Pause Focus",
    href: "/focus/my",
    linkLabel: "Open Focus",
  };
}

function applyStopFocus(): AssistantActionResult {
  dispatchFocusChatControl({ cmd: "stop" });
  return {
    ok: true,
    label: "Stop Focus",
    href: "/focus/my",
    linkLabel: "Open Focus",
  };
}

function applyNavigate(
  action: Extract<AssistantAction, { name: "navigate" }>,
): AssistantActionResult {
  const raw = action.href.trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) {
    return { ok: false, label: "Invalid in-app path" };
  }
  const allowedPrefixes = [
    "/journal",
    "/manifest",
    "/meditate",
    "/focus",
    "/account",
    "/home",
    "/chat",
    "/library",
  ];
  if (!allowedPrefixes.some((p) => raw === p || raw.startsWith(`${p}/`))) {
    return { ok: false, label: "That route isn’t available from chat" };
  }
  return {
    ok: true,
    label: "Ready to open",
    detail: previewSnippet(raw, 80),
    href: raw,
    linkLabel: "Open",
  };
}

async function applyGetDailyStatus(): Promise<AssistantActionResult> {
  try {
    const status = await fetchDashboardDailyStatus();
    return {
      ok: true,
      label: "Daily status",
      items: [
        {
          title: `Streak ${status.fullStreak}`,
          meta: "Today",
          body: [
            `Gratitude ${status.gratitude ? "✓" : "—"}`,
            `Meditation ${status.meditation ? "✓" : "—"}`,
            `Life area ${status.lifeArea ? "✓" : "—"}`,
          ].join(" · "),
          href: "/home",
        },
      ],
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't load daily status",
    };
  }
}

async function applyPutDailyCheck(
  action: Extract<AssistantAction, { name: "put_daily_check" }>,
): Promise<AssistantActionResult> {
  try {
    await putDashboardDailyManualCheck({
      dateKey: localDateKey(),
      pillar: action.key,
      checked: action.done,
    });
    return {
      ok: true,
      label: action.done
        ? `Marked ${action.key} done`
        : `Cleared ${action.key} check`,
      href: "/home",
      linkLabel: "Open home",
    };
  } catch (e) {
    return {
      ok: false,
      label: e instanceof Error ? e.message : "Couldn't update daily check",
    };
  }
}

/** Apply a single assistant ACTION against local stores / routes. */
export async function executeAssistantAction(
  action: AssistantAction,
): Promise<AssistantActionResult> {
  try {
    switch (action.name) {
      case "add_gratitude":
        return applyGratitudeAdd(action);
      case "update_gratitude":
        return applyGratitudeUpdate(action);
      case "add_journal_entry":
        return applyJournalEntry(action);
      case "update_journal_entry":
        return applyJournalUpdate(action);
      case "list_gratitudes":
        return applyListGratitudes(action);
      case "get_gratitude":
        return applyGetGratitude(action);
      case "list_journal_entries":
        return applyListJournalEntries(action);
      case "get_journal_entry":
        return applyGetJournalEntry(action);
      case "get_journal_insights":
        return applyGetJournalInsights();
      case "run_journal_insights":
        return applyRunJournalInsights();
      case "list_weekly_letters":
        return applyListWeeklyLetters();
      case "get_weekly_reflection":
        return applyGetWeeklyReflection(action);
      case "add_todo":
        return applyTodo(action);
      case "list_life_areas":
        return applyListLifeAreas();
      case "get_life_area":
        return applyGetLifeArea(action);
      case "create_life_area":
        return applyCreateLifeArea(action);
      case "put_life_area":
        return applyPutLifeArea(action);
      case "list_todos":
        return applyListTodos(action);
      case "put_todo":
        return applyPutTodo(action);
      case "delete_todo":
        return applyDeleteTodo(action);
      case "get_ideate_store":
        return applyGetIdeateStore();
      case "put_ideate_store":
        return applyPutIdeateStore();
      case "list_vision_board":
        return applyListVisionBoard();
      case "create_meditation":
        return applyCreateMeditation(action);
      case "list_library":
        return applyListLibrary(action);
      case "get_meditation":
        return applyGetMeditation(action);
      case "put_meditation_favourite":
        return applyPutMeditationFavourite(action);
      case "put_meditation_archived":
        return applyPutMeditationArchived(action);
      case "put_meditation_public":
        return applyPutMeditationPublic(action);
      case "play_meditation":
        return applyPlayMeditation(action);
      case "list_programs":
        return applyListPrograms();
      case "navigate_create_by_type":
        return applyNavigateCreateByType(action);
      case "navigate_create_from_journal":
        return applyNavigateCreateFromJournal(action);
      case "navigate_create_from_idea":
        return applyNavigateCreateFromIdea(action);
      case "list_sounds":
        return applyListSounds();
      case "list_sound_mixes":
        return applyListSoundMixes();
      case "put_sound_mix":
        return applyPutSoundMix(action);
      case "get_focus_session":
        return applyGetFocusSession();
      case "start_focus":
        return applyStartFocus(action);
      case "pause_focus":
        return applyPauseFocus();
      case "stop_focus":
        return applyStopFocus();
      case "navigate":
        return applyNavigate(action);
      case "get_daily_status":
        return applyGetDailyStatus();
      case "put_daily_check":
        return applyPutDailyCheck(action);
      default: {
        const _exhaustive: never = action;
        return { ok: false, label: `Unknown action: ${String(_exhaustive)}` };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Action failed";
    return { ok: false, label: msg };
  }
}

export async function executeAssistantActions(
  actions: AssistantAction[],
): Promise<AssistantActionResult[]> {
  const out: AssistantActionResult[] = [];
  for (const action of actions) {
    out.push(await executeAssistantAction(action));
  }
  return out;
}

/**
 * Compact ground-truth block appended to the assistant API turn so the model
 * can refer to ordinals ("last one", "second") on the next user message.
 * Not shown in the UI (only `apiThread` content).
 */
export function formatActionResultsForApiThread(
  results: AssistantActionResult[],
): string {
  if (!results.length) return "";
  const blocks: string[] = [];
  for (const r of results) {
    const status = r.ok ? "ok" : "error";
    const head = [`[${status}] ${r.label}`];
    if (r.detail?.trim()) head.push(r.detail.trim());
    if (r.items?.length) {
      for (const item of r.items) {
        const titleBits = [item.title, item.meta, item.subtitle]
          .map((s) => s?.trim())
          .filter(Boolean);
        const lines = (item.lines ?? [])
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length) {
          blocks.push(
            [
              ...head,
              titleBits.length ? titleBits.join(" · ") : null,
              ...lines.map((l, i) => `${i + 1}. ${l}`),
            ]
              .filter(Boolean)
              .join("\n"),
          );
        } else {
          const body = item.body?.trim();
          blocks.push(
            [
              ...head,
              titleBits.length ? titleBits.join(" · ") : null,
              body ? body.slice(0, 400) : null,
            ]
              .filter(Boolean)
              .join("\n"),
          );
        }
      }
    } else {
      blocks.push(head.filter(Boolean).join(" — "));
    }
  }
  if (!blocks.length) return "";
  return `[[ACTION_RESULT]]\n${blocks.join("\n---\n")}\n[[/ACTION_RESULT]]`;
}

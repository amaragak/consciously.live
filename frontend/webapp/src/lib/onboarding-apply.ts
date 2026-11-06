/**
 * Apply onboarding extract into domain stores — merge, never replace.
 */

import {
  draftManifestoFromExtract,
  extractFromTalk,
  type ExtractedArea,
  type TalkExtract,
} from "@/lib/onboarding-analyze";
import { createHealItem, loadHealStore, saveHealStore } from "@/lib/heal-store";
import {
  loadIdeateManifestoStore,
  saveIdeateManifestoManual,
} from "@/lib/ideate-manifesto";
import {
  addIdeateValue,
  loadIdeateValuesStore,
  saveIdeateValuesStore,
} from "@/lib/ideate-values";
import { enqueueJournalUpsert } from "@/lib/journal-sync";
import {
  loadJournalStoreRaw,
  newJournalEntry,
  saveJournalStore,
} from "@/lib/journal-storage";
import { writeManifestoMeditationHandoff } from "@/lib/manifesto-meditation-handoff";
import { createPlanDream } from "@/lib/plan-dreams";
import {
  addResistanceEntry,
  createSubtask,
  loadIdeateStore,
  saveIdeateStore,
  subtasksForProject,
  upsertDream,
  upsertSubtask,
  type IdeateStoreV2,
} from "@/lib/plan-ideate-store";
import { GET_SET_UP_CHANGED } from "@/lib/get-set-up";
import { ONBOARDING_CHANGED } from "@/lib/onboarding-state";

export type AppliedOnboarding = {
  areas: { title: string; dream: string; goal: string; id: string }[];
  values: string[];
  blockers: string[];
  healTitles: string[];
  manifesto: string;
  manifestoWasSuggestion: boolean;
  previousManifesto: string | null;
  journalEntryId: string | null;
  meditationHref: string;
};

function normTitle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function findAreaByTitle(
  store: IdeateStoreV2,
  title: string,
): IdeateStoreV2["dreams"][number] | null {
  const n = normTitle(title);
  return store.dreams.find((d) => normTitle(d.title) === n) ?? null;
}

function mergeArea(
  store: IdeateStoreV2,
  area: ExtractedArea,
): { store: IdeateStoreV2; id: string; goal: string } {
  const existing = findAreaByTitle(store, area.title);
  if (existing) {
    let next = store;
    const dreamText =
      (existing.dreamText || existing.firstThought || "").trim() ||
      area.dream.trim();
    const patched = {
      ...existing,
      dreamText: existing.dreamText?.trim()
        ? existing.dreamText
        : area.dream.trim(),
      firstThought: existing.firstThought?.trim()
        ? existing.firstThought
        : area.dream.trim(),
      updatedAt: new Date().toISOString(),
    };
    next = upsertDream(next, patched);
    const subs = subtasksForProject(next, existing.id);
    let goalTitle = area.goal.trim() || "First goal";
    if (!subs.some((s) => normTitle(s.title) === normTitle(goalTitle))) {
      if (subs.length === 0) {
        next = upsertSubtask(next, createSubtask(existing.id, goalTitle));
      } else {
        goalTitle = subs[0]!.title;
      }
    } else {
      goalTitle =
        subs.find((s) => normTitle(s.title) === normTitle(goalTitle))?.title ??
        goalTitle;
    }
    void dreamText;
    return { store: next, id: existing.id, goal: goalTitle };
  }

  const dream = createPlanDream({
    title: area.title.trim() || "Life area",
    dreamText: area.dream.trim(),
    firstThought: area.dream.trim(),
  });
  let next = upsertDream(store, dream);
  const goalTitle = area.goal.trim() || "First goal";
  next = upsertSubtask(next, createSubtask(dream.id, goalTitle));
  return { store: next, id: dream.id, goal: goalTitle };
}

function addBlockers(
  store: IdeateStoreV2,
  projectId: string,
  texts: string[],
): IdeateStoreV2 {
  let next = store;
  const existing = new Set(
    next.resistanceEntries
      .filter((r) => r.projectId === projectId)
      .map((r) => normTitle(r.text)),
  );
  for (const text of texts) {
    const t = text.trim();
    if (!t || existing.has(normTitle(t))) continue;
    next = addResistanceEntry(next, {
      level: "project",
      projectId,
      subtaskId: null,
      todoId: null,
      text: t,
      category: "other",
    });
    existing.add(normTitle(t));
  }
  return next;
}

function addValues(texts: string[]): string[] {
  let store = loadIdeateValuesStore();
  const have = new Set(store.values.map((v) => normTitle(v.text)));
  const added: string[] = [];
  for (const raw of texts) {
    const t = raw.trim();
    if (!t || have.has(normTitle(t))) continue;
    store = addIdeateValue(store, t);
    have.add(normTitle(t));
    added.push(t);
  }
  saveIdeateValuesStore(store);
  return added;
}

function addHealItems(hints: string[], lifeAreaId: string | null): string[] {
  if (!hints.length) return [];
  let store = loadHealStore();
  const have = new Set(store.items.map((i) => normTitle(i.title)));
  const titles: string[] = [];
  for (const hint of hints.slice(0, 2)) {
    const title = hint.trim().slice(0, 80) || "Something to heal";
    if (have.has(normTitle(title))) continue;
    store = createHealItem(store, {
      type: "pattern",
      title,
      since: null,
      aboutText: hint.trim(),
      lifeAreaId: lifeAreaId ?? null,
      photoDataUrl: null,
    });
    have.add(normTitle(title));
    titles.push(title);
  }
  if (titles.length) saveHealStore(store);
  return titles;
}

function saveTalkJournal(transcript: string): string | null {
  const body = transcript.trim();
  if (!body) return null;
  const html = `<p>${body
    .split(/\n+/)
    .map((p) =>
      p
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;"),
    )
    .join("</p><p>")}</p>`;
  const entry = newJournalEntry({
    title: "Onboarding talk",
    contentHtml: html,
  });
  const store = loadJournalStoreRaw();
  saveJournalStore(
    { ...store, entries: [entry, ...store.entries] },
    { source: "onboarding" },
  );
  enqueueJournalUpsert(entry.id);
  return entry.id;
}

export function applyOnboardingExtract(opts: {
  extract: TalkExtract;
  transcript?: string;
  manifestoDraft?: string;
  acceptManifestoSuggestion?: boolean;
  createJournal?: boolean;
  createHealFromHints?: boolean;
}): AppliedOnboarding {
  let store = loadIdeateStore();
  const areasOut: AppliedOnboarding["areas"] = [];
  let primaryId: string | null = null;

  for (const area of opts.extract.areas.slice(0, 3)) {
    const merged = mergeArea(store, area);
    store = merged.store;
    primaryId = primaryId ?? merged.id;
    areasOut.push({
      id: merged.id,
      title: area.title,
      dream: area.dream,
      goal: merged.goal,
    });
  }

  if (opts.extract.blockers.length && primaryId) {
    store = addBlockers(store, primaryId, opts.extract.blockers);
    // Also stamp obstacle text on first area if empty
    const dream = store.dreams.find((d) => d.id === primaryId);
    if (dream && !(dream.obstacleText || "").trim()) {
      store = upsertDream(store, {
        ...dream,
        obstacleText: opts.extract.blockers[0]!.slice(0, 280),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  saveIdeateStore(store);

  const valuesAdded = addValues(opts.extract.values);
  const allValues = loadIdeateValuesStore()
    .values.map((v) => v.text.trim())
    .filter(Boolean);

  const healTitles = opts.createHealFromHints
    ? addHealItems(opts.extract.healHints, primaryId)
    : [];

  const previous = loadIdeateManifestoStore().text.trim() || null;
  const draft =
    opts.manifestoDraft?.trim() ||
    draftManifestoFromExtract(opts.extract, opts.transcript);
  let manifesto = previous ?? "";
  let manifestoWasSuggestion = false;
  if (!previous) {
    manifesto = saveIdeateManifestoManual({
      values: allValues,
      lifeAreaTitles: areasOut.map((a) => a.title),
      text: draft,
    });
  } else if (opts.acceptManifestoSuggestion) {
    manifesto = saveIdeateManifestoManual({
      values: allValues,
      lifeAreaTitles: areasOut.map((a) => a.title),
      text: draft,
    });
  } else {
    manifesto = previous;
    manifestoWasSuggestion = Boolean(draft && draft !== previous);
  }

  const journalEntryId =
    opts.createJournal === false
      ? null
      : saveTalkJournal(opts.transcript ?? "");

  const meditationHref = writeManifestoMeditationHandoff({
    statement: manifesto || draft,
    values: allValues,
    lifeAreaTitles: areasOut.map((a) => a.title),
    brief:
      areasOut[0]?.dream?.trim() ||
      opts.transcript?.trim().slice(0, 280) ||
      manifesto ||
      draft,
  });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GET_SET_UP_CHANGED));
    window.dispatchEvent(new Event(ONBOARDING_CHANGED));
  }

  return {
    areas: areasOut,
    values: valuesAdded.length
      ? valuesAdded
      : opts.extract.values.slice(0, 5),
    blockers: opts.extract.blockers,
    healTitles,
    manifesto: manifesto || draft,
    manifestoWasSuggestion,
    previousManifesto: previous,
    journalEntryId,
    meditationHref,
  };
}

export function applyGapAnswer(opts: {
  gap: "goals" | "values" | "blockers" | "heal" | "manifesto";
  text: string;
}): AppliedOnboarding {
  const text = opts.text.trim();
  if (opts.gap === "manifesto") {
    const extract = extractFromTalk(text || "I live with intention.");
    const draft = text || draftManifestoFromExtract(extract);
    return applyOnboardingExtract({
      extract: { ...extract, areas: [], values: [], blockers: [], healHints: [] },
      manifestoDraft: draft,
      acceptManifestoSuggestion: !loadIdeateManifestoStore().text.trim(),
      createJournal: false,
      createHealFromHints: false,
    });
  }

  if (opts.gap === "values") {
    const lines = text
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 5);
    const extract: TalkExtract = {
      areas: [],
      values: lines.length ? lines : [text].filter(Boolean),
      blockers: [],
      healHints: [],
      scores: { goals: 0, values: 1, blockers: 0 },
    };
    return applyOnboardingExtract({
      extract,
      createJournal: false,
      createHealFromHints: false,
    });
  }

  if (opts.gap === "blockers") {
    const extract: TalkExtract = {
      areas: [],
      values: [],
      blockers: text ? [text] : [],
      healHints: [],
      scores: { goals: 0, values: 0, blockers: 1 },
    };
    // Ensure there is an area to attach to
    let store = loadIdeateStore();
    if (!store.dreams.length && text) {
      const dream = createPlanDream({
        title: "The life I want",
        dreamText: "A life I'm building toward.",
      });
      store = upsertDream(store, dream);
      saveIdeateStore(store);
    }
    return applyOnboardingExtract({
      extract,
      createJournal: false,
      createHealFromHints: false,
    });
  }

  if (opts.gap === "heal") {
    const extract: TalkExtract = {
      areas: [],
      values: [],
      blockers: [],
      healHints: text ? [text] : [],
      scores: { goals: 0, values: 0, blockers: 0 },
    };
    return applyOnboardingExtract({
      extract,
      createJournal: false,
      createHealFromHints: true,
    });
  }

  // goals
  const extract = extractFromTalk(text);
  if (!extract.areas.length && text) {
    extract.areas.push({
      title: "The life I want",
      dream: text.slice(0, 280),
      goal: "Take one clear next step",
    });
  }
  return applyOnboardingExtract({
    extract: { ...extract, values: [], blockers: [], healHints: [] },
    transcript: text,
    createJournal: false,
    createHealFromHints: false,
  });
}

export function draftManifestoOnlyFromExisting(): string {
  const values = loadIdeateValuesStore()
    .values.map((v) => v.text.trim())
    .filter(Boolean);
  const areas = loadIdeateStore()
    .dreams.filter((d) => !d.completedAt)
    .map((d) => ({
      title: d.title,
      dream: (d.dreamText || d.firstThought || "").trim(),
      goal: "",
    }));
  return draftManifestoFromExtract({
    areas,
    values,
    blockers: [],
    healHints: [],
    scores: { goals: 1, values: 1, blockers: 0 },
  });
}

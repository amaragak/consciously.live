/**
 * Today's eleven affirmations for Manifest.
 * Off until the user turns them on. While on, generated on the first signed-in
 * open of the local day (midnight to midnight on the device). Near-duplicates
 * and the occasional kept-line swap happen here.
 */

import { readAccountLocalStorage, writeAccountLocalStorage } from "@/lib/account-scoped-storage";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import { wasIdeateStorePulledThisSession } from "@/lib/ideate-cloud";
import { loadIdeateManifestoStore } from "@/lib/ideate-manifesto";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import { currentView, loadHealStore } from "@/lib/heal-store";
import { currentGoalForLifeArea } from "@/lib/life-area-summary";
import { getMedimadeApiBase, medimadeApiAuthHeaders, medimadeFetch } from "@/lib/medimade-api";
import { loadIdeateStore } from "@/lib/plan-ideate-store";

const LS_KEY = "mm_daily_affirmations_v1";
const EVENT = "mm-affirmations-changed";
const LINE_COUNT = 11;
const MAX_WORDS = 16;
const PAUSE_AFTER_DAYS = 7;

export type AffirmationLine = {
  id: string;
  text: string;
  source: string | null;
  kept: boolean;
  removed: boolean;
  keptAt: string | null;
};

export type SavedAffirmation = {
  id: string;
  text: string;
  source: string | null;
  keptAt: string;
};

export type AffirmationDay = {
  dateKey: string;
  lines: AffirmationLine[];
  regenerated: boolean;
  generatedAt: string;
};

export type AffirmationsStore = {
  v: 1;
  /** Opt-in. Missing or false for everyone until they turn it on. */
  enabled: boolean;
  /** Generation stopped after a week without opening or listening. */
  paused: boolean;
  /** Last expand, Listen, or dashboard open. */
  lastEngagedAt: string | null;
  /** Local day we already decided not to write, so later edits wait until tomorrow. */
  settledOn: string | null;
  expanded: boolean;
  useHeal: boolean;
  showOnDashboard: boolean;
  today: AffirmationDay | null;
  shown: { dateKey: string; text: string }[];
  saved: SavedAffirmation[];
  rejected: { dateKey: string; text: string }[];
};

export type AffirmationContext = {
  dreams: {
    name: string;
    dream: string;
    moment: string;
    goal: string | null;
  }[];
  values: string[];
  manifesto: string | null;
  working_through: { name: string; bad_day: string | null; good_day: string | null; doubt: string | null }[];
  recent: { shown: string[]; kept: string[]; not_for_me: string[] };
};

let memory: AffirmationsStore | null = null;
let inflight: Promise<AffirmationsStore> | null = null;

function emptyStore(): AffirmationsStore {
  return {
    v: 1,
    enabled: false,
    paused: false,
    lastEngagedAt: null,
    settledOn: null,
    expanded: false,
    useHeal: true,
    showOnDashboard: true,
    today: null,
    shown: [],
    saved: [],
    rejected: [],
  };
}

export function localDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function affirmationDateLabel(now = new Date()): string {
  const date = now.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return `Today · ${date}`;
}

function emit() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeAffirmations(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

function persist(next: AffirmationsStore) {
  memory = next;
  writeAccountLocalStorage(LS_KEY, JSON.stringify(next));
  emit();
}

function asLine(raw: unknown): AffirmationLine | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  if (!text) return null;
  return {
    id: typeof o.id === "string" && o.id ? o.id : `aff_${Math.random().toString(36).slice(2, 10)}`,
    text,
    source: typeof o.source === "string" && o.source.trim() ? o.source.trim() : null,
    kept: o.kept === true,
    removed: o.removed === true,
    keptAt: typeof o.keptAt === "string" ? o.keptAt : null,
  };
}

export function loadAffirmations(): AffirmationsStore {
  if (memory) return memory;
  const raw = readAccountLocalStorage(LS_KEY);
  if (!raw) {
    memory = emptyStore();
    return memory;
  }
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const todayRaw = o.today && typeof o.today === "object" ? (o.today as Record<string, unknown>) : null;
    const lines = Array.isArray(todayRaw?.lines)
      ? todayRaw.lines.map(asLine).filter((row): row is AffirmationLine => Boolean(row))
      : [];
    memory = {
      v: 1,
      enabled: o.enabled === true,
      paused: o.paused === true,
      lastEngagedAt: typeof o.lastEngagedAt === "string" ? o.lastEngagedAt : null,
      settledOn: typeof o.settledOn === "string" ? o.settledOn : null,
      expanded: o.expanded === true,
      useHeal: o.useHeal !== false,
      showOnDashboard: o.showOnDashboard !== false,
      today:
        todayRaw && typeof todayRaw.dateKey === "string" && lines.length
          ? {
              dateKey: todayRaw.dateKey,
              lines,
              regenerated: todayRaw.regenerated === true,
              generatedAt: typeof todayRaw.generatedAt === "string" ? todayRaw.generatedAt : "",
            }
          : null,
      shown: Array.isArray(o.shown)
        ? o.shown.flatMap((row) => {
            if (!row || typeof row !== "object") return [];
            const r = row as Record<string, unknown>;
            if (typeof r.dateKey !== "string" || typeof r.text !== "string") return [];
            return [{ dateKey: r.dateKey, text: r.text }];
          })
        : [],
      saved: Array.isArray(o.saved)
        ? o.saved.flatMap((row) => {
            if (!row || typeof row !== "object") return [];
            const r = row as Record<string, unknown>;
            if (typeof r.text !== "string" || !r.text.trim()) return [];
            return [
              {
                id: typeof r.id === "string" ? r.id : `saved_${Math.random().toString(36).slice(2, 8)}`,
                text: r.text.trim(),
                source: typeof r.source === "string" && r.source.trim() ? r.source.trim() : null,
                keptAt: typeof r.keptAt === "string" ? r.keptAt : new Date().toISOString(),
              },
            ];
          })
        : [],
      rejected: Array.isArray(o.rejected)
        ? o.rejected.flatMap((row) => {
            if (!row || typeof row !== "object") return [];
            const r = row as Record<string, unknown>;
            if (typeof r.dateKey !== "string" || typeof r.text !== "string") return [];
            return [{ dateKey: r.dateKey, text: r.text }];
          })
        : [],
    };
    return memory;
  } catch {
    memory = emptyStore();
    return memory;
  }
}

export function normalizeAffirmation(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nearDuplicate(a: string, b: string): boolean {
  const left = normalizeAffirmation(a);
  const right = normalizeAffirmation(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const words = (s: string) => new Set(s.split(" ").filter((w) => w.length > 2));
  const A = words(left);
  const B = words(right);
  if (A.size === 0 || B.size === 0) return false;
  let shared = 0;
  for (const word of A) if (B.has(word)) shared += 1;
  const union = A.size + B.size - shared;
  return union > 0 && shared / union >= 0.72;
}

function withinDays(dateKey: string, today: string, days: number): boolean {
  const a = Date.parse(`${dateKey}T12:00:00`);
  const b = Date.parse(`${today}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return b - a <= days * 86_400_000 && b >= a;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function pruneHistory(store: AffirmationsStore, today: string): AffirmationsStore {
  return {
    ...store,
    shown: store.shown.filter((row) => withinDays(row.dateKey, today, 14)),
    rejected: store.rejected.filter((row) => withinDays(row.dateKey, today, 14)),
  };
}

export function buildAffirmationContext(useHeal: boolean, store = loadAffirmations()): AffirmationContext {
  const today = localDateKey();
  const ideate = loadIdeateStore();
  const dreams = ideate.dreams
    .map((dream) => {
      const goal = currentGoalForLifeArea(ideate, dream.id);
      return {
        name: dream.title.trim() || "Life area",
        dream: (dream.dreamText || "").trim(),
        moment: (dream.visionText || "").trim(),
        goal: goal?.title.trim() || null,
      };
    })
    .filter((row) => row.dream || row.moment || row.goal);
  const values = loadIdeateValuesStore()
    .values.map((row) => row.text.trim())
    .filter(Boolean);
  const manifesto = loadIdeateManifestoStore().text.trim() || null;
  const heal = loadHealStore();
  const working = useHeal
    ? heal.items
        .filter((item) => item.status !== "at_peace")
        .map((item) => {
          const bad = currentView(heal, item.id, "bad")?.text.trim() || null;
          const good = currentView(heal, item.id, "good")?.text.trim() || null;
          const doubt =
            item.type === "pattern" ||
            item.type === "recurring_thought" ||
            item.type === "belief" ||
            item.type === "fear"
              ? item.title.trim() || item.aboutText.trim() || null
              : null;
          return {
            name: item.title.trim() || "Heal",
            bad_day: bad,
            good_day: good,
            doubt,
          };
        })
        .filter((row) => row.bad_day || row.good_day || row.doubt)
    : [];
  const recentShown = store.shown.filter((row) => withinDays(row.dateKey, today, 14)).map((row) => row.text);
  return {
    dreams,
    values,
    manifesto,
    working_through: working,
    recent: {
      shown: recentShown,
      kept: store.saved.map((row) => row.text),
      not_for_me: store.rejected.filter((row) => withinDays(row.dateKey, today, 14)).map((row) => row.text),
    },
  };
}

export function hasAffirmationContext(ctx = buildAffirmationContext(true)): boolean {
  return Boolean(ctx.manifesto || ctx.values.length || ctx.dreams.length);
}

function allowedSources(ctx: AffirmationContext): Map<string, string> {
  const names = new Map<string, string>();
  const add = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    names.set(trimmed.toLowerCase(), trimmed);
  };
  for (const dream of ctx.dreams) add(dream.name);
  for (const value of ctx.values) add(value);
  for (const item of ctx.working_through) add(item.name);
  return names;
}

function daySwapsKept(dateKey: string): boolean {
  let n = 0;
  for (const ch of dateKey) n += ch.charCodeAt(0);
  return n % 3 === 0;
}

export function settleGeneratedLines(
  raw: { text: string; drew_on: string | null }[],
  ctx: AffirmationContext,
  store: AffirmationsStore,
  dateKey: string,
): AffirmationLine[] {
  const sources = allowedSources(ctx);
  const recent = [
    ...store.shown.filter((row) => withinDays(row.dateKey, dateKey, 14)).map((row) => row.text),
    ...store.saved.map((row) => row.text),
    ...store.rejected.filter((row) => withinDays(row.dateKey, dateKey, 14)).map((row) => row.text),
  ];
  const kept: AffirmationLine[] = [];
  for (const row of raw) {
    const text = row.text.replace(/\s+/g, " ").trim();
    if (!text || wordCount(text) > MAX_WORDS) continue;
    if (recent.some((prev) => nearDuplicate(prev, text))) continue;
    if (kept.some((prev) => nearDuplicate(prev.text, text))) continue;
    const sourceKey = row.drew_on?.trim().toLowerCase() || "";
    const source = sourceKey ? sources.get(sourceKey) ?? null : null;
    kept.push({
      id: `aff_${Math.random().toString(36).slice(2, 10)}`,
      text,
      source,
      kept: false,
      removed: false,
      keptAt: null,
    });
    if (kept.length === LINE_COUNT) break;
  }
  if (daySwapsKept(dateKey) && store.saved.length && kept.length) {
    const replacement = store.saved.find(
      (saved) => !kept.some((line) => nearDuplicate(line.text, saved.text)),
    );
    if (replacement) {
      let n = 0;
      for (const ch of dateKey) n += ch.charCodeAt(0);
      const index = n % kept.length;
      kept[index] = {
        id: replacement.id,
        text: replacement.text,
        source: replacement.source,
        kept: true,
        removed: false,
        keptAt: replacement.keptAt,
      };
    }
  }
  return kept;
}

async function requestLines(ctx: AffirmationContext): Promise<{ text: string; drew_on: string | null }[]> {
  const base = getMedimadeApiBase();
  if (!base) throw new Error("API is not configured");
  const res = await medimadeFetch(`${base}/affirmations/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...medimadeApiAuthHeaders(),
    },
    body: JSON.stringify({ context: ctx }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    affirmations?: { text?: string; drew_on?: string | null }[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || "Couldn't write today's affirmations");
  return (data.affirmations ?? []).flatMap((row) => {
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!text) return [];
    const drew = typeof row.drew_on === "string" ? row.drew_on.trim() : null;
    return [{ text, drew_on: drew || null }];
  });
}

function rememberShown(store: AffirmationsStore, day: AffirmationDay): AffirmationsStore {
  const shown = [
    ...store.shown.filter((row) => row.dateKey !== day.dateKey),
    ...day.lines.map((line) => ({ dateKey: day.dateKey, text: line.text })),
  ];
  return pruneHistory({ ...store, shown, today: day }, day.dateKey);
}

async function writeToday(store: AffirmationsStore, regenerated: boolean): Promise<AffirmationsStore> {
  const ctx = buildAffirmationContext(store.useHeal, store);
  if (!hasAffirmationContext(ctx)) return store;
  const dateKey = localDateKey();
  const raw = await requestLines(ctx);
  const lines = settleGeneratedLines(raw, ctx, store, dateKey);
  if (!lines.length) throw new Error("No new lines");
  const day: AffirmationDay = {
    dateKey,
    lines,
    regenerated,
    generatedAt: new Date().toISOString(),
  };
  const next = rememberShown(store, day);
  persist(next);
  return next;
}

function contextIsReady(): boolean {
  if (!isMedimadeSessionActive()) return true;
  return wasIdeateStorePulledThisSession();
}

/** True once seven local midnights have passed since the last open or listen. */
export function affirmationEngagementIsStale(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return false;
  const startThen = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const startNow = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return (startNow - startThen) / 86_400_000 >= PAUSE_AFTER_DAYS;
}

function pauseIfStale(store: AffirmationsStore): AffirmationsStore {
  if (!store.enabled || store.paused) return store;
  if (!affirmationEngagementIsStale(store.lastEngagedAt)) return store;
  const next = { ...store, paused: true };
  persist(next);
  return next;
}

export async function ensureTodayAffirmations(): Promise<AffirmationsStore> {
  let store = loadAffirmations();
  if (!isMedimadeSessionActive()) return store;
  if (!store.enabled) return store;
  store = pauseIfStale(store);
  if (store.paused) return store;
  const today = localDateKey();
  if (store.today?.dateKey === today && store.today.lines.length) return store;
  if (store.settledOn === today) return store;
  if (!contextIsReady()) return store;
  if (!hasAffirmationContext(buildAffirmationContext(store.useHeal, store))) {
    const settled = { ...store, settledOn: today };
    persist(settled);
    return settled;
  }
  if (inflight) return inflight;
  inflight = writeToday({ ...store, today: null, settledOn: today }, false).finally(() => {
    inflight = null;
  });
  return inflight;
}

export async function turnOnAffirmations(): Promise<AffirmationsStore> {
  const previous = loadAffirmations();
  const now = new Date().toISOString();
  const store = {
    ...previous,
    enabled: true,
    paused: false,
    expanded: false,
    lastEngagedAt: now,
    settledOn: null,
  };
  persist(store);
  try {
    const next = await writeToday(store, false);
    const today = localDateKey();
    if (!next.today || next.today.dateKey !== today || next.today.lines.length === 0) {
      throw new Error("Couldn't write today's affirmations");
    }
    return next;
  } catch (error) {
    persist(previous);
    throw error;
  }
}

export async function resumeAffirmations(): Promise<AffirmationsStore> {
  return turnOnAffirmations();
}

export function turnOffAffirmations() {
  persist({
    ...loadAffirmations(),
    enabled: false,
    paused: false,
    expanded: false,
  });
}

export function noteAffirmationEngagement() {
  const store = loadAffirmations();
  if (!store.enabled || store.paused) return;
  persist({ ...store, lastEngagedAt: new Date().toISOString() });
}

export async function regenerateTodayAffirmations(): Promise<AffirmationsStore> {
  const store = loadAffirmations();
  const today = localDateKey();
  if (store.today?.dateKey === today && store.today.regenerated) return store;
  const next = await writeToday(store, true);
  return next;
}

export function setAffirmationsExpanded(expanded: boolean) {
  const store = loadAffirmations();
  persist({
    ...store,
    expanded,
    lastEngagedAt:
      expanded && store.enabled && !store.paused
        ? new Date().toISOString()
        : store.lastEngagedAt,
  });
}

export function setAffirmationsUseHeal(useHeal: boolean) {
  persist({ ...loadAffirmations(), useHeal });
}

export function setAffirmationsOnDashboard(showOnDashboard: boolean) {
  persist({ ...loadAffirmations(), showOnDashboard });
}

export function toggleKeepAffirmation(lineId: string) {
  const store = loadAffirmations();
  const today = store.today;
  if (!today) return;
  const line = today.lines.find((row) => row.id === lineId);
  if (!line || line.removed) return;
  const now = new Date().toISOString();
  const kept = !line.kept;
  const lines = today.lines.map((row) =>
    row.id === lineId ? { ...row, kept, keptAt: kept ? now : null } : row,
  );
  const saved = kept
    ? [
        { id: line.id, text: line.text, source: line.source, keptAt: now },
        ...store.saved.filter((row) => !nearDuplicate(row.text, line.text)),
      ]
    : store.saved.filter((row) => row.id !== line.id && !nearDuplicate(row.text, line.text));
  persist({ ...store, today: { ...today, lines }, saved });
}

export function removeSavedAffirmation(savedId: string) {
  const store = loadAffirmations();
  const hit = store.saved.find((row) => row.id === savedId);
  const saved = store.saved.filter((row) => row.id !== savedId);
  const today = store.today
    ? {
        ...store.today,
        lines: store.today.lines.map((line) =>
          hit && (line.id === savedId || nearDuplicate(line.text, hit.text))
            ? { ...line, kept: false, keptAt: null }
            : line,
        ),
      }
    : store.today;
  persist({ ...store, saved, today });
}

export function dismissAffirmation(lineId: string) {
  const store = loadAffirmations();
  const today = store.today;
  if (!today) return;
  const line = today.lines.find((row) => row.id === lineId);
  if (!line || line.removed) return;
  const lines = today.lines.map((row) =>
    row.id === lineId ? { ...row, removed: true, kept: false } : row,
  );
  const rejected = [{ dateKey: today.dateKey, text: line.text }, ...store.rejected];
  const saved = store.saved.filter((row) => !nearDuplicate(row.text, line.text));
  persist({ ...store, today: { ...today, lines }, rejected, saved });
}

export function undoDismissAffirmation(lineId: string) {
  const store = loadAffirmations();
  const today = store.today;
  if (!today) return;
  const line = today.lines.find((row) => row.id === lineId);
  if (!line) return;
  const lines = today.lines.map((row) => (row.id === lineId ? { ...row, removed: false } : row));
  const rejected = store.rejected.filter(
    (row) => !(row.dateKey === today.dateKey && nearDuplicate(row.text, line.text)),
  );
  persist({ ...store, today: { ...today, lines }, rejected });
}

export function visibleAffirmationLines(store = loadAffirmations()): AffirmationLine[] {
  const today = localDateKey();
  if (!store.today || store.today.dateKey !== today) return [];
  return store.today.lines;
}

export const AFFIRMATIONS_CREATE_KEY = "mm_affirmations_create_v1";

export function armAffirmationMeditation(lines: string[]) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    AFFIRMATIONS_CREATE_KEY,
    JSON.stringify({ lines: lines.map((line) => line.trim()).filter(Boolean) }),
  );
}

export function readAffirmationMeditation(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(AFFIRMATIONS_CREATE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { lines?: unknown }) : null;
    sessionStorage.removeItem(AFFIRMATIONS_CREATE_KEY);
    return Array.isArray(parsed?.lines)
      ? parsed.lines.filter((line): line is string => typeof line === "string" && Boolean(line.trim()))
      : [];
  } catch {
    return [];
  }
}

/**
 * Heal — private, long-term things the user is finding hard to put down.
 * Account-scoped on this device. Nothing here is read by Chat, insights,
 * or community unless the matching share toggle is on (both default off).
 */

import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";

export type HealType =
  | "grief"
  | "heartbreak"
  | "regret"
  | "resentment"
  | "pattern"
  | "recurring_thought"
  | "belief"
  | "fear"
  | "other";

export type HealStatus = "active" | "lighter" | "at_peace";

export type HealEntryKind =
  | "thought"
  | "prompt"
  | "letter"
  | "friend"
  | "write15"
  | "angle";

export type HealReframe = {
  id: string;
  itemId: string;
  text: string;
  sourceEntryId: string | null;
  createdAt: string;
};

export type HealManifestTarget = "obstacle" | "affirmation" | "manifesto";

export type HealManifestLink = {
  id: string;
  itemId: string;
  reframeId: string;
  lifeAreaId: string;
  target: HealManifestTarget;
  targetId: string;
  text: string;
  createdAt: string;
};

export type HealLens = "kind" | "forgive" | "accept" | "gave";

export type HealPerspective = {
  id: string;
  anchorStart: number;
  anchorEnd: number;
  lens: HealLens;
  text: string;
  createdAt: string;
};

export type HealItem = {
  id: string;
  type: HealType;
  title: string;
  since: string | null;
  photoId: string | null;
  aboutText: string;
  seeingText: string;
  angleQuestions: string[];
  aboutUpdatedAt: string;
  aboutPerspectives: HealPerspective[];
  linkedLifeAreaIds: string[];
  linkedValueIds: string[];
  valuesAction: string | null;
  status: HealStatus;
  restedAt: string | null;
  aiEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  journalEntryIds: string[];
  meditationBuiltAt: string | null;
  riskAt: string | null;
  heavyNudgeDismissedAt: string | null;
  write15Days: string[];
};

export type HealEntry = {
  id: string;
  itemId: string;
  kind: HealEntryKind;
  promptKey: string | null;
  text: string;
  perspectives: HealPerspective[];
  createdAt: string;
};

export type HealCheckin = {
  id: string;
  itemId: string;
  score: number;
  note: string | null;
  createdAt: string;
};

export type HealStoreV1 = {
  v: 1;
  items: HealItem[];
  entries: HealEntry[];
  reframes: HealReframe[];
  manifestLinks: HealManifestLink[];
  checkins: HealCheckin[];
  photos: Record<string, string>;
  shareWithChat: boolean;
  shareWithInsights: boolean;
};

const LS_KEY = "mm_heal_v1";
const EVENT = "consciously-heal-store";

function emptyStore(): HealStoreV1 {
  return {
    v: 1,
    items: [],
    entries: [],
    reframes: [],
    manifestLinks: [],
    checkins: [],
    photos: {},
    shareWithChat: false,
    shareWithInsights: false,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export function newHealId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function asType(v: unknown): HealType {
  if (
    v === "grief" ||
    v === "heartbreak" ||
    v === "regret" ||
    v === "resentment" ||
    v === "pattern" ||
    v === "recurring_thought" ||
    v === "belief" ||
    v === "fear" ||
    v === "other"
  ) {
    return v;
  }
  return "other";
}

function asStatus(v: unknown): HealStatus {
  if (v === "active" || v === "lighter" || v === "at_peace") return v;
  return "active";
}

function asLens(v: unknown): HealLens {
  if (v === "kind" || v === "forgive" || v === "accept" || v === "gave") return v;
  return "kind";
}

function normalizePerspective(x: unknown): HealPerspective | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.text !== "string") return null;
  const start = typeof o.anchorStart === "number" ? o.anchorStart : 0;
  const end = typeof o.anchorEnd === "number" ? o.anchorEnd : start;
  return {
    id: o.id,
    anchorStart: start,
    anchorEnd: end,
    lens: asLens(o.lens),
    text: o.text,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : nowIso(),
  };
}

function normalizeItem(x: unknown): HealItem | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return null;
  const createdAt = typeof o.createdAt === "string" ? o.createdAt : nowIso();
  return {
    id: o.id,
    type: asType(o.type),
    title: o.title,
    since: typeof o.since === "string" ? o.since : null,
    photoId: typeof o.photoId === "string" ? o.photoId : null,
    aboutText: typeof o.aboutText === "string" ? o.aboutText : "",
    seeingText: typeof o.seeingText === "string" ? o.seeingText : "",
    angleQuestions: Array.isArray(o.angleQuestions)
      ? o.angleQuestions.filter((q): q is string => typeof q === "string").slice(-10)
      : [],
    aboutUpdatedAt:
      typeof o.aboutUpdatedAt === "string" ? o.aboutUpdatedAt : createdAt,
    aboutPerspectives: Array.isArray(o.aboutPerspectives)
      ? o.aboutPerspectives
          .map(normalizePerspective)
          .filter((p): p is HealPerspective => p != null)
      : [],
    linkedLifeAreaIds: Array.isArray(o.linkedLifeAreaIds)
      ? o.linkedLifeAreaIds.filter((id): id is string => typeof id === "string")
      : [],
    linkedValueIds: Array.isArray(o.linkedValueIds)
      ? o.linkedValueIds.filter((id): id is string => typeof id === "string")
      : [],
    valuesAction: typeof o.valuesAction === "string" ? o.valuesAction : null,
    status: asStatus(o.status),
    restedAt: typeof o.restedAt === "string" ? o.restedAt : null,
    aiEnabled: o.aiEnabled === true,
    createdAt,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : createdAt,
    journalEntryIds: Array.isArray(o.journalEntryIds)
      ? o.journalEntryIds.filter((id): id is string => typeof id === "string")
      : [],
    meditationBuiltAt:
      typeof o.meditationBuiltAt === "string" ? o.meditationBuiltAt : null,
    riskAt: typeof o.riskAt === "string" ? o.riskAt : null,
    heavyNudgeDismissedAt:
      typeof o.heavyNudgeDismissedAt === "string"
        ? o.heavyNudgeDismissedAt
        : null,
    write15Days: Array.isArray(o.write15Days)
      ? o.write15Days.filter((d): d is string => typeof d === "string")
      : [],
  };
}

function normalizeEntry(x: unknown): HealEntry | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.itemId !== "string") return null;
  if (typeof o.text !== "string") return null;
  const kind =
    o.kind === "thought" ||
    o.kind === "prompt" ||
    o.kind === "letter" ||
    o.kind === "friend" ||
    o.kind === "write15" ||
    o.kind === "angle"
      ? o.kind
      : "thought";
  return {
    id: o.id,
    itemId: o.itemId,
    kind,
    promptKey: typeof o.promptKey === "string" ? o.promptKey : null,
    text: o.text,
    perspectives: Array.isArray(o.perspectives)
      ? o.perspectives
          .map(normalizePerspective)
          .filter((p): p is HealPerspective => p != null)
      : [],
    createdAt: typeof o.createdAt === "string" ? o.createdAt : nowIso(),
  };
}

function normalizeReframe(x: unknown): HealReframe | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.itemId !== "string" || typeof o.text !== "string") {
    return null;
  }
  return {
    id: o.id,
    itemId: o.itemId,
    text: o.text,
    sourceEntryId: typeof o.sourceEntryId === "string" ? o.sourceEntryId : null,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : nowIso(),
  };
}

function normalizeManifestLink(x: unknown): HealManifestLink | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.itemId !== "string" || typeof o.reframeId !== "string") {
    return null;
  }
  const target =
    o.target === "obstacle" || o.target === "affirmation" || o.target === "manifesto"
      ? o.target
      : null;
  if (!target || typeof o.lifeAreaId !== "string" || typeof o.targetId !== "string") return null;
  return {
    id: o.id,
    itemId: o.itemId,
    reframeId: o.reframeId,
    lifeAreaId: o.lifeAreaId,
    target,
    targetId: o.targetId,
    text: typeof o.text === "string" ? o.text : "",
    createdAt: typeof o.createdAt === "string" ? o.createdAt : nowIso(),
  };
}

function normalizeCheckin(x: unknown): HealCheckin | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.itemId !== "string") return null;
  const score = typeof o.score === "number" ? Math.round(o.score) : 0;
  if (score < 1 || score > 10) return null;
  return {
    id: o.id,
    itemId: o.itemId,
    score,
    note: typeof o.note === "string" && o.note.trim() ? o.note : null,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : nowIso(),
  };
}

export function loadHealStore(): HealStoreV1 {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = readAccountLocalStorage(LS_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.v !== 1) return emptyStore();
    const photos: Record<string, string> = {};
    if (parsed.photos && typeof parsed.photos === "object") {
      for (const [k, v] of Object.entries(parsed.photos as Record<string, unknown>)) {
        if (typeof v === "string" && v.startsWith("data:image/")) photos[k] = v;
      }
    }
    return {
      v: 1,
      items: Array.isArray(parsed.items)
        ? parsed.items.map(normalizeItem).filter((i): i is HealItem => i != null)
        : [],
      entries: Array.isArray(parsed.entries)
        ? parsed.entries
            .map(normalizeEntry)
            .filter((e): e is HealEntry => e != null)
        : [],
      reframes: Array.isArray(parsed.reframes)
        ? parsed.reframes
            .map(normalizeReframe)
            .filter((row): row is HealReframe => row != null)
        : [],
      manifestLinks: Array.isArray(parsed.manifestLinks)
        ? parsed.manifestLinks
            .map(normalizeManifestLink)
            .filter((row): row is HealManifestLink => row != null)
        : [],
      checkins: Array.isArray(parsed.checkins)
        ? parsed.checkins
            .map(normalizeCheckin)
            .filter((c): c is HealCheckin => c != null)
        : [],
      photos,
      shareWithChat: parsed.shareWithChat === true,
      shareWithInsights: parsed.shareWithInsights === true,
    };
  } catch {
    return emptyStore();
  }
}

export function saveHealStore(store: HealStoreV1): void {
  if (typeof window === "undefined") return;
  try {
    writeAccountLocalStorage(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota — drop oldest photos rather than fail the write */
    const slim = { ...store, photos: {} };
    try {
      writeAccountLocalStorage(LS_KEY, JSON.stringify(slim));
    } catch {
      /* ignore */
    }
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeHealStore(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(EVENT, handler);
  window.addEventListener("medimade-session-changed", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("medimade-session-changed", handler);
  };
}

export function healItemById(store: HealStoreV1, id: string): HealItem | null {
  return store.items.find((item) => item.id === id) ?? null;
}

export function activeHealItems(store: HealStoreV1): HealItem[] {
  return store.items
    .filter((item) => item.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function restedHealItems(store: HealStoreV1): HealItem[] {
  return store.items
    .filter((item) => item.status !== "active")
    .sort((a, b) => (b.restedAt ?? "").localeCompare(a.restedAt ?? ""));
}

export function entriesForItem(store: HealStoreV1, itemId: string): HealEntry[] {
  return store.entries
    .filter((entry) => entry.itemId === itemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function checkinsForItem(store: HealStoreV1, itemId: string): HealCheckin[] {
  return store.checkins
    .filter((row) => row.itemId === itemId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function latestCheckin(
  store: HealStoreV1,
  itemId: string,
): HealCheckin | null {
  const rows = checkinsForItem(store, itemId);
  return rows[rows.length - 1] ?? null;
}

export function createHealItem(
  store: HealStoreV1,
  input: {
    type: HealType;
    title: string;
    since: string | null;
    aboutText: string;
    seeingText?: string;
    lifeAreaId?: string | null;
    photoDataUrl: string | null;
  },
): HealStoreV1 {
  const createdAt = nowIso();
  const id = newHealId("heal");
  let photoId: string | null = null;
  const photos = { ...store.photos };
  if (input.photoDataUrl) {
    photoId = newHealId("photo");
    photos[photoId] = input.photoDataUrl;
  }
  const item: HealItem = {
    id,
    type: input.type,
    title: input.title.trim() || "Untitled",
    since: input.since,
    photoId,
    aboutText: input.aboutText.trim(),
    seeingText: input.seeingText?.trim() ?? "",
    angleQuestions: [],
    aboutUpdatedAt: createdAt,
    aboutPerspectives: [],
    linkedLifeAreaIds: input.lifeAreaId ? [input.lifeAreaId] : [],
    linkedValueIds: [],
    valuesAction: null,
    status: "active",
    restedAt: null,
    aiEnabled: false,
    createdAt,
    updatedAt: createdAt,
    journalEntryIds: [],
    meditationBuiltAt: null,
    riskAt: null,
    heavyNudgeDismissedAt: null,
    write15Days: [],
  };
  return { ...store, photos, items: [item, ...store.items] };
}

export function patchHealItem(
  store: HealStoreV1,
  itemId: string,
  patch: Partial<HealItem>,
): HealStoreV1 {
  const updatedAt = nowIso();
  return {
    ...store,
    items: store.items.map((item) =>
      item.id === itemId ? { ...item, ...patch, id: item.id, updatedAt } : item,
    ),
  };
}

export function setHealItemStatus(
  store: HealStoreV1,
  itemId: string,
  status: HealStatus,
): HealStoreV1 {
  const restedAt = status === "active" ? null : nowIso();
  return patchHealItem(store, itemId, { status, restedAt });
}

export function addHealEntry(
  store: HealStoreV1,
  entry: Omit<HealEntry, "id" | "createdAt" | "perspectives"> & {
    perspectives?: HealPerspective[];
  },
): { store: HealStoreV1; entry: HealEntry } {
  const row: HealEntry = {
    id: newHealId("entry"),
    itemId: entry.itemId,
    kind: entry.kind,
    promptKey: entry.promptKey,
    text: entry.text,
    perspectives: entry.perspectives ?? [],
    createdAt: nowIso(),
  };
  return {
    entry: row,
    store: patchHealItem(
      { ...store, entries: [row, ...store.entries] },
      entry.itemId,
      {},
    ),
  };
}

export function patchHealEntry(
  store: HealStoreV1,
  entryId: string,
  patch: Partial<HealEntry>,
): HealStoreV1 {
  return {
    ...store,
    entries: store.entries.map((entry) =>
      entry.id === entryId ? { ...entry, ...patch, id: entry.id } : entry,
    ),
  };
}

export function deleteHealEntry(store: HealStoreV1, entryId: string): HealStoreV1 {
  return { ...store, entries: store.entries.filter((entry) => entry.id !== entryId) };
}

export function addHealCheckin(
  store: HealStoreV1,
  itemId: string,
  score: number,
  note: string | null,
): HealStoreV1 {
  const row: HealCheckin = {
    id: newHealId("checkin"),
    itemId,
    score,
    note,
    createdAt: nowIso(),
  };
  return patchHealItem(
    { ...store, checkins: [...store.checkins, row] },
    itemId,
    {},
  );
}

export function setHealPhoto(
  store: HealStoreV1,
  itemId: string,
  dataUrl: string | null,
): HealStoreV1 {
  const item = healItemById(store, itemId);
  if (!item) return store;
  const photos = { ...store.photos };
  if (item.photoId) delete photos[item.photoId];
  if (!dataUrl) {
    return patchHealItem({ ...store, photos }, itemId, { photoId: null });
  }
  const photoId = newHealId("photo");
  photos[photoId] = dataUrl;
  return patchHealItem({ ...store, photos }, itemId, { photoId });
}

export function healPhotoUrl(store: HealStoreV1, item: HealItem): string | null {
  if (!item.photoId) return null;
  return store.photos[item.photoId] ?? null;
}

/** Latest score in each of the last 12 weeks, oldest first. Missing weeks are omitted. */
export function weeklyScores(
  store: HealStoreV1,
  itemId: string,
  now = new Date(),
): number[] {
  const rows = checkinsForItem(store, itemId);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const buckets = new Map<number, number>();
  for (const row of rows) {
    const t = new Date(row.createdAt).getTime();
    if (Number.isNaN(t)) continue;
    const weeksAgo = Math.floor((now.getTime() - t) / weekMs);
    if (weeksAgo < 0 || weeksAgo > 11) continue;
    buckets.set(11 - weeksAgo, row.score);
  }
  const scores: number[] = [];
  for (let i = 0; i < 12; i += 1) {
    const score = buckets.get(i);
    if (score != null) scores.push(score);
  }
  return scores;
}

export type HealTrend =
  | "much_lighter"
  | "lighter"
  | "same"
  | "heavier";

export function healTrendLabel(trend: HealTrend): string {
  if (trend === "much_lighter") return "Much lighter";
  if (trend === "lighter") return "Lighter than a month ago";
  if (trend === "heavier") return "Heavier than a month ago";
  return "About the same";
}

/** Compare the latest score with the check-in closest to 30 days ago. */
export function healTrend(
  store: HealStoreV1,
  itemId: string,
  now = new Date(),
): HealTrend | null {
  const rows = checkinsForItem(store, itemId);
  if (rows.length < 2) return null;
  const latest = rows[rows.length - 1]!;
  const target = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  let prior: HealCheckin | null = null;
  let best = Infinity;
  for (const row of rows.slice(0, -1)) {
    const delta = Math.abs(new Date(row.createdAt).getTime() - target);
    if (delta < best && delta < 20 * 24 * 60 * 60 * 1000) {
      best = delta;
      prior = row;
    }
  }
  if (!prior) return null;
  const diff = latest.score - prior.score;
  if (diff <= -3) return "much_lighter";
  if (diff <= -1) return "lighter";
  if (diff >= 1) return "heavier";
  return "same";
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function staysHeavy(store: HealStoreV1, itemId: string, now = new Date()): boolean {
  const item = healItemById(store, itemId);
  if (!item || item.status !== "active") return false;
  if (item.heavyNudgeDismissedAt) {
    const dismissed = new Date(item.heavyNudgeDismissedAt).getTime();
    if (now.getTime() - dismissed < 30 * DAY_MS) return false;
  }
  const start = now.getTime() - 42 * DAY_MS;
  const rows = checkinsForItem(store, itemId).filter((row) => {
    const t = new Date(row.createdAt).getTime();
    return t >= start && t <= now.getTime();
  });
  if (rows.length < 4) return false;
  const avg = rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
  return avg >= 8;
}

export function lastHealActivityIso(store: HealStoreV1, itemId: string): string | null {
  const item = healItemById(store, itemId);
  if (!item) return null;
  let latest = item.updatedAt;
  for (const entry of store.entries) {
    if (entry.itemId === itemId && entry.createdAt > latest) latest = entry.createdAt;
  }
  for (const row of store.checkins) {
    if (row.itemId === itemId && row.createdAt > latest) latest = row.createdAt;
  }
  return latest;
}

export function writingChangedSinceMeditation(item: HealItem, store: HealStoreV1): boolean {
  if (!item.meditationBuiltAt) return false;
  if (item.aboutUpdatedAt > item.meditationBuiltAt) return true;
  if (
    store.reframes.some(
      (row) => row.itemId === item.id && row.createdAt > item.meditationBuiltAt!,
    )
  ) {
    return true;
  }
  return store.entries.some(
    (entry) => entry.itemId === item.id && entry.createdAt > item.meditationBuiltAt!,
  );
}

export function reframesForItem(store: HealStoreV1, itemId: string): HealReframe[] {
  return store.reframes
    .filter((row) => row.itemId === itemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function currentReframe(store: HealStoreV1, itemId: string): HealReframe | null {
  return reframesForItem(store, itemId)[0] ?? null;
}

export function addHealReframe(
  store: HealStoreV1,
  input: { itemId: string; text: string; sourceEntryId: string | null },
): HealStoreV1 {
  const text = input.text.trim();
  if (!text) return store;
  const current = currentReframe(store, input.itemId);
  if (current?.text === text) return store;
  const row: HealReframe = {
    id: newHealId("reframe"),
    itemId: input.itemId,
    text,
    sourceEntryId: input.sourceEntryId,
    createdAt: nowIso(),
  };
  return { ...store, reframes: [row, ...store.reframes] };
}

export function linksForItem(store: HealStoreV1, itemId: string): HealManifestLink[] {
  return store.manifestLinks
    .filter((row) => row.itemId === itemId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function healRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const days = Math.round((Date.now() - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return formatHealDate(iso);
}

export function healItemsForLifeArea(store: HealStoreV1, lifeAreaId: string): HealItem[] {
  return store.items.filter(
    (item) =>
      item.linkedLifeAreaIds.includes(lifeAreaId) &&
      Boolean(item.valuesAction?.trim()),
  );
}

export function formatHealDate(iso: string | null, withYear = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear || !sameYear ? { year: "numeric" } : {}),
  });
}

export function formatHealMonth(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

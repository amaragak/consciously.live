/**
 * Ideate vision board metadata.
 * Signed-in: in-memory working copy + cloud PUT (never localStorage).
 * Guests: device-only metadata + IndexedDB binaries.
 */

import {
  readAccountLocalStorage,
  removeAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { isMedimadeSessionActive } from "@/lib/auth-session";

export type VisionBoardVersion = {
  id: string;
  prompt: string;
  imageUrl?: string;
  mediaId?: string;
  mediaKey?: string;
  /** User refine note that produced this version (absent on the first generate). */
  changeRequest?: string;
  createdAt: string;
};

export type VisionBoardItem = {
  id: string;
  /** Soft fill for the preview mosaic (and fallback when no image). */
  color: string;
  label: string;
  kind?: "swatch" | "image";
  /** Guest-only IndexedDB media id — never written to cloud. */
  mediaId?: string;
  /** CloudFront URL (source of truth when signed in). */
  imageUrl?: string;
  mediaKey?: string;
  /** Scene prompt for the active (visible) image. */
  prompt?: string;
  /** Refine note that produced the active image (if refined). */
  changeRequest?: string;
  createdAt?: string;
  /** Prior versions, oldest → newest. Active image lives on the item itself. */
  versions?: VisionBoardVersion[];
  /**
   * Life area (dream) ids this image is tagged to. Empty / omitted = untagged.
   * An image may belong to several areas.
   */
  lifeAreaIds?: string[];
  /** Leads Manifesto, story, and poster picks. Omitted when false. */
  favourite?: boolean;
  /** Natural pixel size. Backfilled when the image loads. */
  width?: number;
  height?: number;
  /**
   * Position on the board. Omitted on library images.
   * Absent on every item means the legacy rule: the first 8 images are the board.
   */
  boardOrder?: number;
  /** Library image after the board switched to explicit membership. */
  offBoard?: boolean;
  /** At most one image on the board. Omitted when false. */
  featured?: boolean;
  /** Non-destructive crop. Null / omitted is the full image. */
  crop?: VisionCrop | null;
};

export type VisionCropPreset =
  | "1:1"
  | "4:5"
  | "3:2"
  | "16:9"
  | "9:16"
  | "free";

/** Normalised 0–1 rectangle inside the image. */
export type VisionCrop = {
  preset: VisionCropPreset;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type VisionSelfReference = {
  /** Guest-only IndexedDB id — never written to cloud. */
  mediaId?: string;
  /** CloudFront URL (required for signed-in sync). */
  url?: string;
  /** S3 object key (required for signed-in sync / generate). */
  key?: string;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  /** Bytes of the stored file — informational. */
  byteLength: number;
  updatedAt: string;
};

/** Optional supporting refs (people, pets, places) labeled for the image model. */
export type VisionExtraReference = VisionSelfReference & {
  id: string;
  /** What this image shows — used so generate can match scene text to the right ref. */
  description: string;
};

export type IdeateVisionBoardStoreV1 = {
  v: 1 | 2;
  items: VisionBoardItem[];
  selfReference?: VisionSelfReference | null;
  /** Optional supporting photos (mum, dog, etc.), max 3. */
  extraReferences?: VisionExtraReference[];
};

const LS_KEY = "mm_ideate_vision_board_v1";
export const MAX_VISION_EXTRA_REFERENCES = 3;

/** Signed-in session copy — never written to localStorage. */
let memoryStore: IdeateVisionBoardStoreV1 | null = null;

const SWATCH_COLORS = [
  "#C4A882",
  "#8FA89A",
  "#A8B5C4",
  "#D4A090",
  "#C9B896",
  "#B8A99A",
  "#9AADB5",
] as const;

function emptyBoard(): IdeateVisionBoardStoreV1 {
  return { v: 2, items: [], selfReference: null, extraReferences: [] };
}

function isSignedIn(): boolean {
  return isMedimadeSessionActive();
}

function removeVisionLs(): void {
  if (typeof window === "undefined") return;
  try {
    removeAccountLocalStorage(LS_KEY);
  } catch {
    /* */
  }
}

/** Drop signed-in memory + any leftover localStorage vision board. */
export function clearIdeateVisionBoardDeviceData(): void {
  memoryStore = null;
  removeVisionLs();
}

/** Clear in-memory vision board only — keep localStorage for cloud migration. */
export function clearIdeateVisionBoardMemoryOnly(): void {
  memoryStore = null;
}

export function pickVisionSwatchColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 17) % 997;
  return SWATCH_COLORS[h % SWATCH_COLORS.length]!;
}

export function visionLabelFromPrompt(prompt: string): string {
  const t = prompt.trim();
  if (!t) return "";
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

function newVersionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `vv_${crypto.randomUUID()}`;
  }
  return `vv_${Date.now().toString(16)}`;
}

function normalizeVersion(x: unknown): VisionBoardVersion | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.prompt !== "string") return null;
  return {
    id: o.id,
    prompt: o.prompt,
    ...(typeof o.imageUrl === "string" ? { imageUrl: o.imageUrl } : {}),
    ...(typeof o.mediaId === "string" ? { mediaId: o.mediaId } : {}),
    ...(typeof o.mediaKey === "string" ? { mediaKey: o.mediaKey } : {}),
    ...(typeof o.changeRequest === "string"
      ? { changeRequest: o.changeRequest }
      : {}),
    createdAt:
      typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
  };
}

function normalizeItem(x: unknown): VisionBoardItem | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  const kind = o.kind === "image" || o.kind === "swatch" ? o.kind : undefined;
  const versions = Array.isArray(o.versions)
    ? o.versions
        .map(normalizeVersion)
        .filter((v): v is VisionBoardVersion => Boolean(v))
        .slice(-24)
    : undefined;
  const lifeAreaIds = normalizeLifeAreaIds(o.lifeAreaIds);
  return {
    id: o.id,
    color: typeof o.color === "string" ? o.color : "#E5DFD0",
    label: typeof o.label === "string" ? o.label : "",
    ...(kind ? { kind } : {}),
    ...(typeof o.mediaId === "string" ? { mediaId: o.mediaId } : {}),
    ...(typeof o.imageUrl === "string" ? { imageUrl: o.imageUrl } : {}),
    ...(typeof o.mediaKey === "string" ? { mediaKey: o.mediaKey } : {}),
    ...(typeof o.prompt === "string" ? { prompt: o.prompt } : {}),
    ...(typeof o.changeRequest === "string"
      ? { changeRequest: o.changeRequest }
      : {}),
    ...(typeof o.createdAt === "string" ? { createdAt: o.createdAt } : {}),
    ...(versions?.length ? { versions } : {}),
    ...(lifeAreaIds.length ? { lifeAreaIds } : {}),
    ...(o.favourite === true ? { favourite: true } : {}),
    ...(typeof o.width === "number" && o.width > 0 ? { width: o.width } : {}),
    ...(typeof o.height === "number" && o.height > 0 ? { height: o.height } : {}),
    ...(typeof o.boardOrder === "number" && Number.isFinite(o.boardOrder)
      ? { boardOrder: o.boardOrder }
      : {}),
    ...(o.offBoard === true ? { offBoard: true } : {}),
    ...(o.featured === true ? { featured: true } : {}),
    ...(normalizeCrop(o.crop) ? { crop: normalizeCrop(o.crop) } : {}),
  };
}

function normalizeCrop(raw: unknown): VisionCrop | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const preset = o.preset;
  if (
    preset !== "1:1" &&
    preset !== "4:5" &&
    preset !== "3:2" &&
    preset !== "16:9" &&
    preset !== "9:16" &&
    preset !== "free"
  ) {
    return null;
  }
  const x = typeof o.x === "number" ? o.x : NaN;
  const y = typeof o.y === "number" ? o.y : NaN;
  const w = typeof o.w === "number" ? o.w : NaN;
  const h = typeof o.h === "number" ? o.h : NaN;
  if (![x, y, w, h].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) return null;
  if (w < 0.02 || h < 0.02) return null;
  return {
    preset,
    x: Math.min(x, 1 - w),
    y: Math.min(y, 1 - h),
    w,
    h,
  };
}

/** Tile ratio after crop. Falls back to square until the natural size is known. */
export function visionItemAspect(item: VisionBoardItem): number {
  const width = item.width && item.width > 0 ? item.width : 1;
  const height = item.height && item.height > 0 ? item.height : 1;
  const crop = item.crop;
  if (crop && crop.w > 0 && crop.h > 0) {
    return (crop.w * width) / (crop.h * height);
  }
  return width / height;
}

function normalizeLifeAreaIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Replace the life-area tags on one vision tile. Empty clears tags. */
export function setVisionItemLifeAreaIds(
  store: IdeateVisionBoardStoreV1,
  itemId: string,
  lifeAreaIds: string[],
): IdeateVisionBoardStoreV1 {
  const ids = normalizeLifeAreaIds(lifeAreaIds);
  const i = store.items.findIndex((x) => x.id === itemId);
  if (i < 0) return store;
  const prev = store.items[i]!;
  const next: VisionBoardItem = {
    ...prev,
    ...(ids.length ? { lifeAreaIds: ids } : {}),
  };
  if (!ids.length) delete next.lifeAreaIds;
  return {
    ...store,
    v: 2,
    items: store.items.map((x, j) => (j === i ? next : x)),
  };
}

/**
 * Make `itemId` the first image for a life area in board order (manifesto
 * print uses that as the large / leading tile). No-op if already first or
 * the item isn't tagged to the area.
 */
export function promoteVisionItemForLifeArea(
  store: IdeateVisionBoardStoreV1,
  itemId: string,
  lifeAreaId: string,
): IdeateVisionBoardStoreV1 {
  const areaId = lifeAreaId.trim();
  if (!areaId) return store;
  const target = store.items.find((x) => x.id === itemId);
  if (!target || !visionItemHasImage(target)) return store;
  if (!(target.lifeAreaIds ?? []).includes(areaId)) return store;

  const areaImageIds = store.items
    .filter(
      (x) =>
        visionItemHasImage(x) && (x.lifeAreaIds ?? []).includes(areaId),
    )
    .map((x) => x.id);
  if (areaImageIds[0] === itemId) return store;

  const from = store.items.findIndex((x) => x.id === itemId);
  const firstId = areaImageIds[0];
  if (from < 0 || !firstId) return store;
  const before = store.items.findIndex((x) => x.id === firstId);
  if (before < 0) return store;

  const next = store.items.slice();
  const [moved] = next.splice(from, 1);
  if (!moved) return store;
  const insertAt = from < before ? before - 1 : before;
  next.splice(insertAt, 0, moved);
  return { ...store, v: 2, items: next };
}

/** Drop a deleted life area from every vision tile's tags. */
export function removeLifeAreaIdFromVisionBoard(
  store: IdeateVisionBoardStoreV1,
  lifeAreaId: string,
): IdeateVisionBoardStoreV1 {
  const needle = lifeAreaId.trim();
  if (!needle) return store;
  let changed = false;
  const items = store.items.map((item) => {
    const ids = item.lifeAreaIds;
    if (!ids?.length || !ids.includes(needle)) return item;
    changed = true;
    const nextIds = ids.filter((id) => id !== needle);
    if (!nextIds.length) {
      const { lifeAreaIds: _drop, ...rest } = item;
      void _drop;
      return rest;
    }
    return { ...item, lifeAreaIds: nextIds };
  });
  return changed ? { ...store, v: 2, items } : store;
}

function normalizeSelfRef(x: unknown): VisionSelfReference | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.mimeType !== "string") return null;
  const mediaId = typeof o.mediaId === "string" ? o.mediaId : undefined;
  const url = typeof o.url === "string" ? o.url : undefined;
  const key = typeof o.key === "string" ? o.key : undefined;
  if (!mediaId && !url) return null;
  return {
    ...(mediaId ? { mediaId } : {}),
    ...(url ? { url } : {}),
    ...(key ? { key } : {}),
    mimeType: o.mimeType,
    fileName: typeof o.fileName === "string" ? o.fileName : "reference.jpg",
    width: typeof o.width === "number" ? o.width : 0,
    height: typeof o.height === "number" ? o.height : 0,
    byteLength: typeof o.byteLength === "number" ? o.byteLength : 0,
    updatedAt:
      typeof o.updatedAt === "string"
        ? o.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeExtraRef(x: unknown): VisionExtraReference | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  const base = normalizeSelfRef(x);
  if (!base) return null;
  return {
    ...base,
    id: o.id,
    description: typeof o.description === "string" ? o.description : "",
  };
}

function normalizeStore(raw: unknown): IdeateVisionBoardStoreV1 {
  if (!raw || typeof raw !== "object") return emptyBoard();
  const parsed = raw as {
    v?: number;
    items?: unknown[];
    selfReference?: unknown;
    extraReferences?: unknown[];
  };
  if ((parsed?.v !== 1 && parsed?.v !== 2) || !Array.isArray(parsed.items)) {
    return emptyBoard();
  }
  return {
    v: 2,
    items: parsed.items
      .map(normalizeItem)
      .filter((i): i is VisionBoardItem => Boolean(i))
      .slice(0, 48),
    selfReference: normalizeSelfRef(parsed.selfReference),
    extraReferences: Array.isArray(parsed.extraReferences)
      ? parsed.extraReferences
          .map(normalizeExtraRef)
          .filter((r): r is VisionExtraReference => Boolean(r))
          .slice(0, MAX_VISION_EXTRA_REFERENCES)
      : [],
  };
}

export function loadIdeateVisionBoardStore(): IdeateVisionBoardStoreV1 {
  if (typeof window === "undefined") return emptyBoard();
  if (isSignedIn()) {
    return memoryStore ? structuredClone(memoryStore) : emptyBoard();
  }
  try {
    const raw = readAccountLocalStorage(LS_KEY);
    if (!raw) return emptyBoard();
    return normalizeStore(JSON.parse(raw));
  } catch {
    return emptyBoard();
  }
}

/**
 * Persist working copy: memory only when signed in (never localStorage);
 * guests use localStorage.
 */
export function saveIdeateVisionBoardStoreLocal(store: IdeateVisionBoardStoreV1) {
  if (typeof window === "undefined") return;
  const normalized: IdeateVisionBoardStoreV1 = {
    v: 2,
    items: store.items.slice(0, 48),
    selfReference: store.selfReference ?? null,
    extraReferences: (store.extraReferences ?? [])
      .slice(0, MAX_VISION_EXTRA_REFERENCES)
      .map((r) => ({
        ...r,
        description: String(r.description || "").slice(0, 280),
      })),
  };
  if (isSignedIn()) {
    memoryStore = structuredClone(normalized);
    removeVisionLs();
    return;
  }
  memoryStore = null;
  try {
    writeAccountLocalStorage(LS_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
}

/** Persist and schedule cloud PUT when signed in. */
export function saveIdeateVisionBoardStore(store: IdeateVisionBoardStoreV1) {
  saveIdeateVisionBoardStoreLocal(store);
  if (typeof window !== "undefined" && isSignedIn()) {
    void import("@/lib/ideate-cloud").then((m) => m.scheduleIdeateCloudPush());
  }
}

export function upsertVisionBoardItem(
  store: IdeateVisionBoardStoreV1,
  item: VisionBoardItem,
): IdeateVisionBoardStoreV1 {
  const i = store.items.findIndex((x) => x.id === item.id);
  const items =
    i === -1
      ? [item, ...store.items]
      : store.items.map((x, j) => (j === i ? item : x));
  return { ...store, v: 2, items: items.slice(0, 48) };
}

export function removeVisionBoardItem(
  store: IdeateVisionBoardStoreV1,
  id: string,
): IdeateVisionBoardStoreV1 {
  return {
    ...store,
    v: 2,
    items: store.items.filter((x) => x.id !== id),
  };
}

/** True when the item can appear in the Ideate hero / compose mosaic. */
export function visionItemHasImage(item: VisionBoardItem): boolean {
  return Boolean(
    (typeof item.imageUrl === "string" && item.imageUrl.trim()) ||
      (typeof item.mediaId === "string" && item.mediaId.trim()),
  );
}

export const VISION_COMPOSE_SLOT_COUNT = 16;
/** Boards saved before explicit membership: the first 8 images are on the board. */
const LEGACY_BOARD_COUNT = 8;

function boardMembershipExplicit(items: readonly VisionBoardItem[]): boolean {
  return items.some(
    (item) => typeof item.boardOrder === "number" || item.offBoard === true,
  );
}

/** Image-bearing items that occupy the board, in board order. */
export function boardVisionItems(items: readonly VisionBoardItem[]): VisionBoardItem[] {
  const images = items.filter(visionItemHasImage);
  if (!boardMembershipExplicit(images)) {
    return images.slice(0, LEGACY_BOARD_COUNT);
  }
  return images
    .filter((item) => typeof item.boardOrder === "number")
    .sort((a, b) => (a.boardOrder ?? 0) - (b.boardOrder ?? 0))
    .slice(0, VISION_COMPOSE_SLOT_COUNT);
}

function withoutBoardFields(item: VisionBoardItem): VisionBoardItem {
  const { boardOrder: _order, featured: _featured, ...rest } = item;
  return { ...rest, offBoard: true };
}

/** Persist board membership. Library images lose `boardOrder`. */
function writeBoard(
  store: IdeateVisionBoardStoreV1,
  board: VisionBoardItem[],
): IdeateVisionBoardStoreV1 {
  const limited = board.slice(0, VISION_COMPOSE_SLOT_COUNT);
  const featuredId = limited.find((item) => item.featured)?.id;
  const ids = new Set(limited.map((item) => item.id));
  const byId = new Map(store.items.map((item) => [item.id, item]));
  const ordered = limited.map((item, order) => {
    const source = byId.get(item.id) ?? item;
    const next: VisionBoardItem = { ...source, ...item, boardOrder: order };
    delete next.offBoard;
    if (next.id === featuredId) next.featured = true;
    else delete next.featured;
    return next;
  });
  const library = store.items
    .filter((item) => visionItemHasImage(item) && !ids.has(item.id))
    .map(withoutBoardFields);
  const nonImage = store.items.filter((item) => !visionItemHasImage(item));
  return {
    ...store,
    v: 2,
    items: [...ordered, ...library, ...nonImage].slice(0, 48),
  };
}

/**
 * Automatic picks: favourites in board order, then the other board images
 * in board order, then library images newest first.
 */
export function visionPickOrder(items: readonly VisionBoardItem[]): VisionBoardItem[] {
  const board = boardVisionItems(items);
  const boardIds = new Set(board.map((i) => i.id));
  const library = items
    .filter((i) => visionItemHasImage(i) && !boardIds.has(i.id))
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return [
    ...board.filter((i) => i.favourite),
    ...board.filter((i) => !i.favourite),
    ...library,
  ];
}

export function setVisionItemFavourite(
  store: IdeateVisionBoardStoreV1,
  itemId: string,
  favourite: boolean,
): IdeateVisionBoardStoreV1 {
  return {
    ...store,
    v: 2,
    items: store.items.map((item) => {
      if (item.id !== itemId) return item;
      if (!favourite) {
        const { favourite: _drop, ...rest } = item;
        return rest;
      }
      return { ...item, favourite: true };
    }),
  };
}

/** New uploads and generations land in the library, never on the board. */
export function insertVisionItemInLibrary(
  store: IdeateVisionBoardStoreV1,
  item: VisionBoardItem,
): IdeateVisionBoardStoreV1 {
  const board = boardVisionItems(store.items).filter((entry) => entry.id !== item.id);
  const stamped = writeBoard(store, board);
  const fresh = withoutBoardFields(item);
  const without = stamped.items.filter((entry) => entry.id !== item.id);
  without.splice(board.length, 0, fresh);
  return { ...stamped, items: without.slice(0, 48) };
}

/** Move an on-board image into the library. */
export function removeVisionItemFromBoard(
  store: IdeateVisionBoardStoreV1,
  itemId: string,
): IdeateVisionBoardStoreV1 {
  const board = boardVisionItems(store.items);
  if (!board.some((item) => item.id === itemId)) return store;
  return writeBoard(
    store,
    board.filter((item) => item.id !== itemId),
  );
}

/** Append a generated take as a version. The active image stays put. */
export function stashVisionBoardTake(
  item: VisionBoardItem,
  next: {
    prompt: string;
    imageUrl?: string;
    mediaId?: string;
    mediaKey?: string;
  },
): { item: VisionBoardItem; versionId: string } {
  const versionId = newVersionId();
  const version: VisionBoardVersion = {
    id: versionId,
    prompt: next.prompt,
    ...(next.imageUrl ? { imageUrl: next.imageUrl } : {}),
    ...(next.mediaId ? { mediaId: next.mediaId } : {}),
    ...(next.mediaKey ? { mediaKey: next.mediaKey } : {}),
    createdAt: new Date().toISOString(),
  };
  return {
    versionId,
    item: {
      ...item,
      versions: [...(item.versions ?? []), version].slice(-24),
    },
  };
}

/** Board image ids, padded with empty slots up to the board limit. */
export function getComposeSlotIds(
  items: VisionBoardItem[],
): (string | null)[] {
  const ids = boardVisionItems(items).map((item) => item.id);
  return Array.from(
    { length: VISION_COMPOSE_SLOT_COUNT },
    (_, i) => ids[i] ?? null,
  );
}

/**
 * Insert or move an image to a board index. Adding past the limit leaves the
 * store unchanged so the caller can show the full-board message.
 */
export function placeVisionItemInComposeSlot(
  store: IdeateVisionBoardStoreV1,
  itemId: string,
  slotIndex: number,
): IdeateVisionBoardStoreV1 {
  const target = store.items.find((item) => item.id === itemId);
  if (!target || !visionItemHasImage(target)) return store;
  const board = boardVisionItems(store.items);
  const from = board.findIndex((item) => item.id === itemId);
  if (from < 0 && board.length >= VISION_COMPOSE_SLOT_COUNT) return store;
  if (target.featured && from >= 0) return store;
  const rest = board.filter((item) => item.id !== itemId);
  const index = Math.max(0, Math.min(slotIndex, rest.length));
  rest.splice(index, 0, from >= 0 ? board[from]! : target);
  return writeBoard(store, rest);
}

export function setVisionItemFeatured(
  store: IdeateVisionBoardStoreV1,
  itemId: string,
): IdeateVisionBoardStoreV1 {
  const target = store.items.find((item) => item.id === itemId);
  if (!target || !visionItemHasImage(target)) return store;
  let board = boardVisionItems(store.items);
  if (!board.some((item) => item.id === itemId)) {
    if (board.length >= VISION_COMPOSE_SLOT_COUNT) return store;
    board = [...board, target];
  }
  return writeBoard(
    store,
    board.map((item) =>
      item.id === itemId ? { ...item, featured: true } : { ...item, featured: undefined },
    ),
  );
}

export function setVisionItemCrop(
  store: IdeateVisionBoardStoreV1,
  itemId: string,
  crop: VisionCrop | null,
  featured: boolean,
): IdeateVisionBoardStoreV1 {
  const target = store.items.find((item) => item.id === itemId);
  if (!target) return store;
  let board = boardVisionItems(store.items);
  const onBoard = board.some((item) => item.id === itemId);
  if (featured && !onBoard) {
    if (board.length >= VISION_COMPOSE_SLOT_COUNT) return store;
    board = [...board, target];
  }
  const patched = store.items.map((item) => {
    if (item.id !== itemId) {
      return featured && item.featured ? { ...item, featured: undefined } : item;
    }
    const next: VisionBoardItem = { ...item };
    if (crop) next.crop = crop;
    else delete next.crop;
    if (featured) next.featured = true;
    else delete next.featured;
    return next;
  });
  const nextStore = { ...store, items: patched };
  if (!featured && !onBoard) return nextStore;
  const byId = new Map(nextStore.items.map((item) => [item.id, item]));
  const members = featured && !onBoard ? board : boardVisionItems(nextStore.items);
  return writeBoard(
    nextStore,
    members.map((item) => byId.get(item.id) ?? item),
  );
}

export function setVisionItemDimensions(
  store: IdeateVisionBoardStoreV1,
  itemId: string,
  width: number,
  height: number,
): IdeateVisionBoardStoreV1 {
  if (!(width > 0) || !(height > 0)) return store;
  const item = store.items.find((entry) => entry.id === itemId);
  if (!item || (item.width === width && item.height === height)) return store;
  return {
    ...store,
    v: 2,
    items: store.items.map((entry) =>
      entry.id === itemId ? { ...entry, width, height } : entry,
    ),
  };
}

/** Snapshot the active image onto `versions`, then apply a new active image. */
export function applyVisionBoardRefinement(
  item: VisionBoardItem,
  next: {
    prompt: string;
    imageUrl?: string;
    mediaId?: string;
    mediaKey?: string;
    changeRequest?: string;
  },
): VisionBoardItem {
  const now = new Date().toISOString();
  const prior: VisionBoardVersion[] = [...(item.versions ?? [])];
  if (item.prompt && (item.imageUrl || item.mediaId)) {
    prior.push({
      id: newVersionId(),
      prompt: item.prompt,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.mediaId ? { mediaId: item.mediaId } : {}),
      ...(item.mediaKey ? { mediaKey: item.mediaKey } : {}),
      ...(item.changeRequest ? { changeRequest: item.changeRequest } : {}),
      createdAt: item.createdAt || now,
    });
  }
  return {
    ...item,
    label: visionLabelFromPrompt(next.prompt),
    kind: "image",
    prompt: next.prompt,
    ...(next.imageUrl ? { imageUrl: next.imageUrl } : {}),
    ...(next.mediaId ? { mediaId: next.mediaId } : {}),
    ...(next.mediaKey ? { mediaKey: next.mediaKey } : {}),
    ...(next.changeRequest ? { changeRequest: next.changeRequest } : {}),
    createdAt: now,
    versions: prior.slice(-24),
  };
}

/** Make a prior version active; current active is pushed onto history. */
export function restoreVisionBoardVersion(
  item: VisionBoardItem,
  versionId: string,
): VisionBoardItem | null {
  const versions = item.versions ?? [];
  const idx = versions.findIndex((v) => v.id === versionId);
  if (idx < 0) return null;
  const chosen = versions[idx]!;
  const now = new Date().toISOString();
  const rest = versions.filter((v) => v.id !== versionId);
  if (item.prompt && (item.imageUrl || item.mediaId)) {
    rest.push({
      id: newVersionId(),
      prompt: item.prompt,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.mediaId ? { mediaId: item.mediaId } : {}),
      ...(item.mediaKey ? { mediaKey: item.mediaKey } : {}),
      ...(item.changeRequest ? { changeRequest: item.changeRequest } : {}),
      createdAt: item.createdAt || now,
    });
  }
  return {
    ...item,
    prompt: chosen.prompt,
    label: visionLabelFromPrompt(chosen.prompt),
    kind: "image",
    imageUrl: chosen.imageUrl,
    mediaId: chosen.mediaId,
    mediaKey: chosen.mediaKey,
    changeRequest: chosen.changeRequest,
    createdAt: chosen.createdAt || now,
    versions: rest.slice(-24),
  };
}

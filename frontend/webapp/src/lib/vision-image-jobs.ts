import { flushIdeateCloudNow } from "@/lib/ideate-cloud";
import {
  loadIdeateVisionBoardStore,
  saveIdeateVisionBoardStore,
  showStylePicture,
  stampActiveStyle,
  upsertVisionBoardItem,
  visionImageStyleOf,
  visionItemHasImage,
  type VisionBoardItem,
  type VisionImageStyle,
  type VisionPreviousImage,
  type VisionStylePicture,
} from "@/lib/ideate-vision-board";
import {
  getVisionMedia,
  newVisionMediaId,
  putVisionMedia,
  resizeImageFileForApi,
  visionMediaToBase64,
} from "@/lib/ideate-vision-media";
import { generateVisionBoardScene } from "@/lib/medimade-api";
import { streamPlanCoachReply } from "@/lib/plan-claude";
import { getMedimadeSessionJwt, isMedimadeSessionActive } from "@/lib/auth-session";

const redrawing = new Set<string>();
let redrawingSnapshot: string[] = [];
const redrawListeners = new Set<() => void>();
export type VisionToastNotice = {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
};

const toastListeners = new Set<(notice: VisionToastNotice) => void>();

export function visionRedrawingIds(): string[] {
  return redrawingSnapshot;
}

export function subscribeVisionRedrawing(listener: () => void): () => void {
  redrawListeners.add(listener);
  return () => redrawListeners.delete(listener);
}

function setRedrawing(id: string, on: boolean) {
  if (on) redrawing.add(id);
  else redrawing.delete(id);
  redrawingSnapshot = [...redrawing];
  redrawListeners.forEach((listener) => listener());
}

function captionNeedsVoice(item: VisionBoardItem): boolean {
  const prompt = item.prompt?.trim() ?? "";
  if (!prompt) return false;
  const caption = item.caption?.trim() ?? "";
  if (!item.captionVoice || !caption) return true;
  const words = caption.split(/\s+/);
  if (words.length >= 12 && /(?:\b(?:at|in|on|with|of)\s+\S+)$/i.test(caption)) return true;
  if (caption.length >= 78) return true;
  return /(?:\b(?:a|an|the|at|in|on|of|with|and|or|to|for))$/i.test(caption);
}

function tidyCaption(raw: string): string {
  let text = raw.replace(/^["']+|["']+$/g, "").replace(/[.]+$/g, "").replace(/\s+/g, " ").trim();
  text = text.replace(/^(someone|a person|the person|the user|the owner)\b/i, "Me");
  if (/^me\b/i.test(text)) text = `Me${text.slice(2)}`;
  const words = text.split(/\s+/).filter(Boolean).slice(0, 10);
  while (words.length > 3 && /^(a|an|the|at|in|on|of|with|and|or|to|for)$/i.test(words[words.length - 1] ?? "")) {
    words.pop();
  }
  let out = words.join(" ");
  if (out.length > 80) out = out.slice(0, 80).replace(/\s+\S*$/, "");
  return out;
}

function captionsFromReply(raw: string): Map<string, string> {
  const nextCaption = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const id = line.match(/tile_[0-9a-f-]{36}/i)?.[0];
    const caption = tidyCaption(line.split("|").slice(1).join("|"));
    if (id && caption) nextCaption.set(id, caption);
  }
  return nextCaption;
}

let shaping: Promise<void> | null = null;

/** Rewrite clipped prompt captions into "Me …" or a plain scene line. */
export function shapeVisionCaptions(): Promise<void> {
  if (shaping) return shaping;
  const run = async () => {
    const store = loadIdeateVisionBoardStore();
    let pending = store.items.filter(captionNeedsVoice);
    if (!pending.length) return;
    const nextCaption = new Map<string, string>();
    for (let attempt = 0; attempt < 2 && pending.length; attempt++) {
      const scenes = pending
        .map((item) => `${item.id} | ${item.prompt!.trim().slice(0, 400)}`)
        .join("\n");
      const raw = await streamPlanCoachReply(
        [
          {
            role: "user",
            content:
              "Rewrite each vision-board scene as the short line printed on the image.\n" +
              "The person in the scene is the owner. Start with Me and say what they are doing, in 8 words or fewer. Example: Me playing guitar on stage.\n" +
              "If no person is in the picture, describe what is shown and do not start with Me. Example: A quiet studio at sunset.\n" +
              "Output only the lines, one per scene, exactly: id | caption\n" +
              "No quotes. No trailing period. No commentary.\n\n" +
              scenes,
          },
        ],
        () => undefined,
      );
      for (const [id, caption] of captionsFromReply(raw)) nextCaption.set(id, caption);
      pending = pending.filter((item) => !nextCaption.has(item.id));
    }
    if (!nextCaption.size) return;
    const fresh = loadIdeateVisionBoardStore();
    let changed = false;
    const items = fresh.items.map((item) => {
      const caption = nextCaption.get(item.id);
      if (!caption || !captionNeedsVoice(item)) return item;
      changed = true;
      return { ...item, caption, captionVoice: true };
    });
    if (!changed) return;
    saveIdeateVisionBoardStore({ ...fresh, v: 2, items });
    if (isMedimadeSessionActive()) await flushIdeateCloudNow();
  };
  shaping = run().finally(() => {
    shaping = null;
  });
  return shaping;
}

export function pushVisionToast(
  text: string,
  action?: { label: string; onAction: () => void },
) {
  const notice: VisionToastNotice = {
    text,
    ...(action ? { actionLabel: action.label, onAction: action.onAction } : {}),
  };
  toastListeners.forEach((listener) => listener(notice));
}

export function subscribeVisionToast(listener: (notice: VisionToastNotice) => void): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
}

const frameListeners = new Set<() => void>();

export function subscribeVisionFrames(listener: () => void): () => void {
  frameListeners.add(listener);
  return () => frameListeners.delete(listener);
}

function notifyVisionFrames() {
  frameListeners.forEach((listener) => listener());
}

export function otherStyleCount(
  items: VisionBoardItem[],
  next: VisionImageStyle,
): number {
  return items.filter(
    (item) =>
      Boolean(item.prompt?.trim()) && visionImageStyleOf(item.imageStyle) !== next,
  ).length;
}

function visionKeyFromUrl(url: string | undefined | null): string | null {
  if (!url?.trim()) return null;
  try {
    const path = new URL(url.trim()).pathname.replace(/^\/+/, "");
    return path.startsWith("ideate/vision/") ? path : null;
  } catch {
    return null;
  }
}

export class IllustrationReferenceError extends Error {
  constructor() {
    super(
      "Illustrations aren't using your photo yet, so your photoreal images were left as they are.",
    );
    this.name = "IllustrationReferenceError";
  }
}

function realisticPicture(item: VisionBoardItem): VisionStylePicture | null {
  const stored = item.styles?.realistic;
  if (stored && (stored.imageUrl || stored.mediaId || stored.mediaKey)) return stored;
  if (visionImageStyleOf(item.imageStyle) === "realistic" && visionItemHasImage(item)) {
    return {
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.mediaId ? { mediaId: item.mediaId } : {}),
      ...(item.mediaKey ? { mediaKey: item.mediaKey } : {}),
    };
  }
  return null;
}

function illustrationBasis(item: VisionBoardItem, likenessKey: string): string {
  const scene = realisticPicture(item);
  const sceneKey =
    scene?.mediaKey?.trim() || visionKeyFromUrl(scene?.imageUrl) || scene?.mediaId || "";
  if (sceneKey) return `scene:${sceneKey}`;
  if (likenessKey) return `likeness:${likenessKey}`;
  return "";
}

/** Illustrated images with no photoreal version need a likeness photo. */
export function illustratedNeedsLikeness(items: VisionBoardItem[]): boolean {
  return items.some(
    (item) =>
      Boolean(item.prompt?.trim()) && visionItemHasImage(item) && !realisticPicture(item),
  );
}

function likenessKeyOf(): string {
  const ref = loadIdeateVisionBoardStore().selfReference;
  return ref?.key?.trim() || visionKeyFromUrl(ref?.url) || ref?.mediaId || "";
}

function itemNeedsStyleVersion(
  item: VisionBoardItem,
  style: VisionImageStyle,
  likenessKey: string,
): boolean {
  if (!item.prompt?.trim() || !visionItemHasImage(item)) return false;
  const stamped = stampActiveStyle(item);
  const picture = stamped.styles?.[style];
  const basis = style === "illustrated" ? illustrationBasis(stamped, likenessKey) : "";
  const sourceKey = picture?.sourceKey ?? "";
  const drawnFromPhoto = style !== "illustrated" || (sourceKey !== "" && sourceKey === basis);
  return !(picture && (picture.imageUrl || picture.mediaId) && drawnFromPhoto);
}

/** Generated images that still need a picture in this style. Uploads are skipped. */
export function missingStyleIds(items: VisionBoardItem[], style: VisionImageStyle): string[] {
  const likenessKey = likenessKeyOf();
  return items
    .filter((item) => itemNeedsStyleVersion(item, style, likenessKey))
    .map((item) => item.id);
}

export function visionHasUploads(items: VisionBoardItem[]): boolean {
  return items.some((item) => !item.prompt?.trim() && visionItemHasImage(item));
}

export function hasVisionLikeness(): boolean {
  const ref = loadIdeateVisionBoardStore().selfReference;
  if (!ref) return false;
  if (isMedimadeSessionActive()) {
    return Boolean(ref.url && (ref.key || visionKeyFromUrl(ref.url)));
  }
  return Boolean(ref.mediaId || ref.url);
}

async function storeGenerated(
  item: VisionBoardItem,
  result: { url?: string; key?: string; imageBase64: string; mimeType: string },
  style: VisionImageStyle,
): Promise<VisionBoardItem> {
  const previous: VisionPreviousImage = {
    ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    ...(item.mediaId ? { mediaId: item.mediaId } : {}),
    ...(item.mediaKey ? { mediaKey: item.mediaKey } : {}),
    imageStyle: visionImageStyleOf(item.imageStyle),
    ...(item.width ? { width: item.width } : {}),
    ...(item.height ? { height: item.height } : {}),
  };
  let mediaId = item.mediaId;
  let imageUrl = result.url;
  let mediaKey = result.key;
  if (!isMedimadeSessionActive()) {
    const outBytes = Uint8Array.from(atob(result.imageBase64), (c) => c.charCodeAt(0));
    mediaId = newVisionMediaId("scene");
    await putVisionMedia({
      id: mediaId,
      mimeType: result.mimeType,
      bytes: outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength),
      updatedAt: new Date().toISOString(),
    });
  } else if (!result.url) {
    throw new Error("Generated image did not sync to the cloud.");
  }
  return {
    ...item,
    ...(imageUrl ? { imageUrl } : {}),
    ...(mediaId ? { mediaId } : {}),
    ...(mediaKey ? { mediaKey } : {}),
    imageStyle: style,
    previousImage: previous.imageUrl || previous.mediaId ? previous : null,
    width: undefined,
    height: undefined,
  };
}

export async function redrawVisionItem(
  item: VisionBoardItem,
  style: VisionImageStyle,
  opts?: { skipLikeness?: boolean },
): Promise<void> {
  const prompt = item.prompt?.trim();
  if (!prompt) return;
  setRedrawing(item.id, true);
  try {
    const store = loadIdeateVisionBoardStore();
    const ref = store.selfReference;
    const skip = style === "illustrated" || opts?.skipLikeness === true;
    const referenceKey = ref?.key?.trim() || visionKeyFromUrl(ref?.url) || "";
    let referenceBase64: string | undefined;
    let mimeType = ref?.mimeType;
    if (!skip && !getMedimadeSessionJwt() && ref?.mediaId) {
      const rec = await getVisionMedia(ref.mediaId);
      if (!rec) throw new Error("Reference photo is missing — upload it again.");
      const blob = new Blob([rec.bytes], { type: rec.mimeType });
      const prepared = await resizeImageFileForApi(blob, 1536, 0.9);
      const buf = await prepared.blob.arrayBuffer();
      referenceBase64 = await visionMediaToBase64({
        id: "tmp",
        mimeType: prepared.mimeType,
        bytes: buf,
        updatedAt: new Date().toISOString(),
      });
      mimeType = prepared.mimeType;
    }
    const result = await generateVisionBoardScene({
      prompt,
      polishPrompt: false,
      style,
      ...(skip ? { skipLikeness: true } : {}),
      ...(!skip && referenceKey ? { referenceKey, mimeType } : {}),
      ...(!skip && referenceBase64 ? { referenceBase64, mimeType } : {}),
    });
    const next = await storeGenerated(item, result, style);
    const current = loadIdeateVisionBoardStore();
    saveIdeateVisionBoardStore(upsertVisionBoardItem(current, next));
    if (isMedimadeSessionActive()) await flushIdeateCloudNow();
  } finally {
    setRedrawing(item.id, false);
  }
}

export async function redrawVisionItems(
  style: VisionImageStyle,
  opts?: { skipLikeness?: boolean },
): Promise<number> {
  const items = loadIdeateVisionBoardStore().items.filter(
    (item) =>
      Boolean(item.prompt?.trim()) && visionImageStyleOf(item.imageStyle) !== style,
  );
  let done = 0;
  for (const item of items) {
    const fresh = loadIdeateVisionBoardStore().items.find((row) => row.id === item.id) ?? item;
    await redrawVisionItem(fresh, style, opts);
    done += 1;
  }
  return done;
}

export function restoreVisionPrevious(item: VisionBoardItem): VisionBoardItem | null {
  const previous = item.previousImage;
  if (!previous) return null;
  const swapped: VisionPreviousImage = {
    ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    ...(item.mediaId ? { mediaId: item.mediaId } : {}),
    ...(item.mediaKey ? { mediaKey: item.mediaKey } : {}),
    imageStyle: visionImageStyleOf(item.imageStyle),
    ...(item.width ? { width: item.width } : {}),
    ...(item.height ? { height: item.height } : {}),
  };
  return {
    ...item,
    imageUrl: previous.imageUrl,
    mediaId: previous.mediaId,
    mediaKey: previous.mediaKey,
    imageStyle: visionImageStyleOf(previous.imageStyle),
    width: previous.width,
    height: previous.height,
    previousImage: swapped,
  };
}

let pendingStyleRedraw: VisionImageStyle | null = null;

export function setPendingStyleRedraw(style: VisionImageStyle | null) {
  pendingStyleRedraw = style;
}

export function takePendingStyleRedraw(): VisionImageStyle | null {
  const style = pendingStyleRedraw;
  pendingStyleRedraw = null;
  return style;
}

export async function saveVisionImageStyle(style: VisionImageStyle): Promise<void> {
  const store = loadIdeateVisionBoardStore();
  saveIdeateVisionBoardStore({ ...store, v: 2, imageStyle: style });
  if (isMedimadeSessionActive()) await flushIdeateCloudNow();
}

export type VisionStyleProgress = {
  style: VisionImageStyle;
  done: number;
  total: number;
};

let styleProgress: VisionStyleProgress | null = null;
const progressListeners = new Set<() => void>();

export function visionStyleProgress(): VisionStyleProgress | null {
  return styleProgress;
}

export function subscribeVisionStyleProgress(listener: () => void): () => void {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}

function setStyleProgress(next: VisionStyleProgress | null) {
  styleProgress = next;
  progressListeners.forEach((listener) => listener());
}

async function generateStylePicture(
  item: VisionBoardItem,
  style: VisionImageStyle,
  skipLikeness: boolean,
): Promise<VisionStylePicture> {
  const prompt = item.prompt?.trim() ?? "";
  const store = loadIdeateVisionBoardStore();
  const ref = store.selfReference;
  const skip = style !== "illustrated" && skipLikeness;
  const referenceKey = ref?.key?.trim() || visionKeyFromUrl(ref?.url) || "";
  const likenessKey = referenceKey || ref?.mediaId || "";
  let referenceBase64: string | undefined;
  let mimeType = ref?.mimeType;
  if (!skip && !getMedimadeSessionJwt() && ref?.mediaId) {
    const rec = await getVisionMedia(ref.mediaId);
    if (!rec) throw new Error("Reference photo is missing — upload it again.");
    const blob = new Blob([rec.bytes], { type: rec.mimeType });
    const prepared = await resizeImageFileForApi(blob, 1536, 0.9);
    const buf = await prepared.blob.arrayBuffer();
    referenceBase64 = await visionMediaToBase64({
      id: "tmp",
      mimeType: prepared.mimeType,
      bytes: buf,
      updatedAt: new Date().toISOString(),
    });
    mimeType = prepared.mimeType;
  }
  let sceneKey = "";
  let sceneBase64: string | undefined;
  let sceneMimeType: string | undefined;
  if (style === "illustrated") {
    const scene = realisticPicture(item);
    sceneKey = scene?.mediaKey?.trim() || visionKeyFromUrl(scene?.imageUrl) || "";
    if (!sceneKey && scene?.mediaId) {
      const rec = await getVisionMedia(scene.mediaId);
      if (rec) {
        const blob = new Blob([rec.bytes], { type: rec.mimeType });
        const prepared = await resizeImageFileForApi(blob, 1536, 0.9);
        const buf = await prepared.blob.arrayBuffer();
        sceneBase64 = await visionMediaToBase64({
          id: "tmp",
          mimeType: prepared.mimeType,
          bytes: buf,
          updatedAt: new Date().toISOString(),
        });
        sceneMimeType = prepared.mimeType;
      }
    }
  }
  const basis =
    style === "illustrated" ? illustrationBasis(item, likenessKey) : "";
  if (style === "illustrated" && !basis) {
    throw new Error("Upload a photo of yourself first.");
  }
  const result = await generateVisionBoardScene({
    prompt,
    polishPrompt: false,
    style,
    ...(skip ? { skipLikeness: true } : {}),
    ...(!skip && referenceKey ? { referenceKey, mimeType } : {}),
    ...(!skip && referenceBase64 ? { referenceBase64, mimeType } : {}),
    ...(sceneKey ? { sceneKey } : {}),
    ...(sceneBase64 ? { sceneBase64, sceneMimeType } : {}),
  });
  if (style === "illustrated" && result.referenced !== true) {
    throw new IllustrationReferenceError();
  }
  let mediaId: string | undefined;
  if (!isMedimadeSessionActive()) {
    const outBytes = Uint8Array.from(atob(result.imageBase64), (c) => c.charCodeAt(0));
    mediaId = newVisionMediaId("scene");
    await putVisionMedia({
      id: mediaId,
      mimeType: result.mimeType,
      bytes: outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength),
      updatedAt: new Date().toISOString(),
    });
  } else if (!result.url) {
    throw new Error("Generated image did not sync to the cloud.");
  }
  return {
    ...(result.url ? { imageUrl: result.url } : {}),
    ...(mediaId ? { mediaId } : {}),
    ...(result.key ? { mediaKey: result.key } : {}),
    ...(basis ? { sourceKey: basis } : {}),
  };
}

/** A few image calls at a time, so one switch cannot swamp the generator. */
const STYLE_BATCH = 3;

type StyleJob = {
  style: VisionImageStyle;
  ids: string[];
  skipLikeness: boolean;
  total: number;
  done: number;
  failed: string[];
  pumping: boolean;
};

const styleJobs = new Map<VisionImageStyle, StyleJob>();
const styleInflight = new Set<string>();
let lastStyleFailure: { style: VisionImageStyle; ids: string[] } | null = null;

function styleJobKey(style: VisionImageStyle, id: string): string {
  return `${style}:${id}`;
}

function publishStyleProgress() {
  const viewing = visionImageStyleOf(loadIdeateVisionBoardStore().imageStyle);
  const active = [...styleJobs.values()];
  const job = active.find((entry) => entry.style === viewing) ?? active[0];
  setStyleProgress(job ? { style: job.style, done: job.done, total: job.total } : null);
}

function applyStyleView(style: VisionImageStyle): string[] {
  const store = loadIdeateVisionBoardStore();
  const likenessKey = likenessKeyOf();
  const missing: string[] = [];
  const items = store.items.map((item) => {
    if (!item.prompt?.trim() || !visionItemHasImage(item)) return item;
    const stamped = stampActiveStyle(item);
    if (itemNeedsStyleVersion(stamped, style, likenessKey)) {
      if (style === "illustrated" && !illustrationBasis(stamped, likenessKey)) return stamped;
      missing.push(stamped.id);
      return stamped;
    }
    const picture = stamped.styles?.[style];
    return picture ? showStylePicture(stamped, style, picture) : stamped;
  });
  saveIdeateVisionBoardStore({ ...store, v: 2, imageStyle: style, items });
  notifyVisionFrames();
  return missing;
}

async function storeStylePicture(
  id: string,
  style: VisionImageStyle,
  skipLikeness: boolean,
) {
  const current = loadIdeateVisionBoardStore().items.find((item) => item.id === id);
  if (!current?.prompt?.trim()) return;
  const picture = await generateStylePicture(current, style, skipLikeness);
  const fresh = loadIdeateVisionBoardStore();
  const live = fresh.items.find((item) => item.id === id) ?? current;
  const stamped = stampActiveStyle(live);
  const stored = { ...stamped, styles: { ...stamped.styles, [style]: picture } };
  const next =
    visionImageStyleOf(fresh.imageStyle) === style
      ? showStylePicture(stored, style, picture)
      : stored;
  saveIdeateVisionBoardStore(upsertVisionBoardItem(fresh, next));
}

function retryLastStyleFailure() {
  const failure = lastStyleFailure;
  if (!failure?.ids.length) return;
  lastStyleFailure = null;
  void switchVisionImageStyle(failure.style, { onlyIds: failure.ids });
}

async function pumpStyleJob(job: StyleJob) {
  const workers = Array.from({ length: Math.min(STYLE_BATCH, Math.max(job.ids.length, 1)) }, async () => {
    while (job.ids.length) {
      const id = job.ids.shift();
      if (!id) return;
      try {
        await storeStylePicture(id, job.style, job.skipLikeness);
      } catch {
        job.failed.push(id);
      } finally {
        styleInflight.delete(styleJobKey(job.style, id));
        setRedrawing(id, false);
        job.done += 1;
        publishStyleProgress();
        notifyVisionFrames();
      }
    }
  });
  await Promise.all(workers);
  if (job.ids.length) {
    await pumpStyleJob(job);
    return;
  }
  setStyleProgress({ style: job.style, done: job.total, total: job.total });
  await new Promise((resolve) => window.setTimeout(resolve, 500));
  job.pumping = false;
  if (job.ids.length) {
    job.pumping = true;
    void pumpStyleJob(job);
    return;
  }
  styleJobs.delete(job.style);
  publishStyleProgress();
  if (isMedimadeSessionActive()) await flushIdeateCloudNow();
  if (job.failed.length) {
    lastStyleFailure = { style: job.style, ids: [...job.failed] };
    pushVisionToast(`${job.failed.length} couldn't be made.`, {
      label: "Try again",
      onAction: retryLastStyleFailure,
    });
    return;
  }
  if (job.total > 0) {
    pushVisionToast(
      job.style === "illustrated"
        ? `${job.total} ${job.total === 1 ? "image" : "images"} illustrated.`
        : `${job.total} ${job.total === 1 ? "image" : "images"} made photorealistic.`,
    );
  }
}

function enqueueStyleVersions(
  style: VisionImageStyle,
  ids: string[],
  skipLikeness: boolean,
) {
  const pending = ids.filter((id) => !styleInflight.has(styleJobKey(style, id)));
  if (!pending.length) return;
  let job = styleJobs.get(style);
  if (!job) {
    job = { style, ids: [], skipLikeness, total: 0, done: 0, failed: [], pumping: false };
    styleJobs.set(style, job);
  }
  job.skipLikeness = skipLikeness;
  for (const id of pending) {
    styleInflight.add(styleJobKey(style, id));
    setRedrawing(id, true);
    job.ids.push(id);
    job.total += 1;
  }
  publishStyleProgress();
  if (!job.pumping) {
    job.pumping = true;
    void pumpStyleJob(job);
  }
}

/**
 * Save the user's style, show versions that already exist, and generate the rest.
 * Generation keeps running if the user leaves or switches back.
 * Returns how many images were queued.
 */
export function switchVisionImageStyle(
  style: VisionImageStyle,
  opts?: { skipLikeness?: boolean; onlyIds?: string[] },
): Promise<number> {
  const missing = applyStyleView(style);
  const ids = opts?.onlyIds?.length
    ? missing.filter((id) => opts.onlyIds?.includes(id))
    : missing;
  if (!ids.length) {
    if (isMedimadeSessionActive()) void flushIdeateCloudNow();
    return Promise.resolve(0);
  }
  enqueueStyleVersions(style, ids, opts?.skipLikeness === true);
  return Promise.resolve(ids.length);
}

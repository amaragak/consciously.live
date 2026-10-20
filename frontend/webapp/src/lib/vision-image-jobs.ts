import { flushIdeateCloudNow } from "@/lib/ideate-cloud";
import {
  loadIdeateVisionBoardStore,
  saveIdeateVisionBoardStore,
  upsertVisionBoardItem,
  visionImageStyleOf,
  type VisionBoardItem,
  type VisionImageStyle,
  type VisionPreviousImage,
} from "@/lib/ideate-vision-board";
import {
  getVisionMedia,
  newVisionMediaId,
  putVisionMedia,
  resizeImageFileForApi,
  visionMediaToBase64,
} from "@/lib/ideate-vision-media";
import { generateVisionBoardScene } from "@/lib/medimade-api";
import { getMedimadeSessionJwt, isMedimadeSessionActive } from "@/lib/auth-session";

const redrawing = new Set<string>();
let redrawingSnapshot: string[] = [];
const redrawListeners = new Set<() => void>();
const toastListeners = new Set<(text: string) => void>();

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

export function pushVisionToast(text: string) {
  toastListeners.forEach((listener) => listener(text));
}

export function subscribeVisionToast(listener: (text: string) => void): () => void {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
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

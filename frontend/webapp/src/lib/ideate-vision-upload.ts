/**
 * Add one uploaded image to the vision board (same storage rules as the
 * Vision board page's "Upload image": CloudFront upload when signed in,
 * IndexedDB for guests). Resolves with the new tile id. Used by the Manifesto
 * hero's "Add image" tile and the print view's add-image sheet.
 */

import {
  loadIdeateVisionBoardStore,
  pickVisionSwatchColor,
  saveIdeateVisionBoardStore,
  upsertVisionBoardItem,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import {
  blobToArrayBuffer,
  newVisionMediaId,
  putVisionMedia,
  resizeImageFileForApi,
  visionMediaToBase64,
} from "@/lib/ideate-vision-media";
import { flushIdeateCloudNow } from "@/lib/ideate-cloud";
import { getMedimadeApiBase, uploadIdeateVisionMedia } from "@/lib/medimade-api";

function newTileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `tile_${crypto.randomUUID()}`;
  }
  return `tile_${Date.now().toString(16)}`;
}

export async function addVisionBoardImageFromFile(
  file: File,
  signedIn: boolean,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo or image file.");
  }
  if (signedIn && !getMedimadeApiBase()) {
    throw new Error("API URL is not configured.");
  }

  const label =
    file.name.replace(/\.[^.]+$/, "").trim().slice(0, 48) || "Uploaded";
  const id = newTileId();
  const createdAt = new Date().toISOString();
  let item: VisionBoardItem;

  if (signedIn) {
    const prepared = await resizeImageFileForApi(file, 2048, 0.92);
    const apiBuf = await blobToArrayBuffer(prepared.blob);
    const imageBase64 = await visionMediaToBase64({
      id: "tmp",
      mimeType: prepared.mimeType,
      bytes: apiBuf,
      updatedAt: createdAt,
    });
    const uploaded = await uploadIdeateVisionMedia({
      imageBase64,
      mimeType: prepared.mimeType,
      kind: "tile",
    });
    item = {
      id,
      color: pickVisionSwatchColor(label),
      label,
      kind: "image",
      imageUrl: uploaded.url,
      mediaKey: uploaded.key,
      createdAt,
    };
  } else {
    const mediaId = newVisionMediaId("tile");
    await putVisionMedia({
      id: mediaId,
      mimeType: file.type || "image/jpeg",
      bytes: await blobToArrayBuffer(file),
      updatedAt: createdAt,
    });
    item = {
      id,
      color: pickVisionSwatchColor(label),
      label,
      kind: "image",
      mediaId,
      createdAt,
    };
  }

  saveIdeateVisionBoardStore(
    upsertVisionBoardItem(loadIdeateVisionBoardStore(), item),
  );
  if (signedIn) await flushIdeateCloudNow();
  return id;
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyVisionBoardRefinement,
  getComposeSlotIds,
  insertVisionItemInLibrary,
  loadIdeateVisionBoardStore,
  MAX_VISION_EXTRA_REFERENCES,
  pickVisionSwatchColor,
  placeVisionItemInComposeSlot,
  removeVisionBoardItem,
  removeVisionItemFromBoard,
  restoreVisionBoardVersion,
  saveIdeateVisionBoardStore,
  setVisionItemCrop,
  setVisionItemDimensions,
  setVisionItemFavourite,
  setVisionItemFeatured,
  setVisionItemLifeAreaIds,
  stashVisionBoardTake,
  upsertVisionBoardItem,
  visionItemHasImage,
  visionLabelFromPrompt,
  type VisionBoardItem,
  type VisionCrop,
  type VisionExtraReference,
  type VisionSelfReference,
} from "@/lib/ideate-vision-board";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { subscribeIdeateCloud } from "@/lib/ideate-cloud";
import {
  blobToArrayBuffer,
  deleteVisionMedia,
  getVisionMedia,
  newVisionMediaId,
  putVisionMedia,
  resizeImageFileForApi,
  visionMediaToBase64,
  visionMediaToObjectUrl,
} from "@/lib/ideate-vision-media";
import { flushIdeateCloudNow } from "@/lib/ideate-cloud";
import {
  generateVisionBoardScene,
  getMedimadeApiBase,
  uploadIdeateVisionMedia,
} from "@/lib/medimade-api";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import { VisionBoardLayout } from "@/components/plan/vision-board-layout";
import {
  VisionBoardImage,
  VisionBoardImageSkeleton,
} from "@/components/plan/vision-board-image";

const SECTION_LABEL =
  "text-sm font-medium uppercase tracking-widest text-[#8A7566]";

const VISION_TILE_DRAG_MIME = "application/x-ideate-vision-tile";

type TileMenu = "actions" | "refine" | "versions" | "lifeAreas";

function newTileId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `tile_${crypto.randomUUID()}`;
  }
  return `tile_${Date.now().toString(16)}`;
}

function newExtraRefId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `xref_${crypto.randomUUID()}`;
  }
  return `xref_${Date.now().toString(16)}`;
}

/** Recover S3 object key from a vision CloudFront URL when `key` was dropped from the store. */
function visionKeyFromUrl(url: string | undefined | null): string | null {
  if (!url?.trim()) return null;
  try {
    const path = new URL(url.trim()).pathname.replace(/^\/+/, "");
    if (path.startsWith("ideate/vision/")) return path;
    return null;
  } catch {
    return null;
  }
}

/**
 * Vision board — same content shell as My Ideas (`max-w-6xl`).
 * Signed-in: S3 + Ideate cloud store only (no IndexedDB).
 * Guests: device IndexedDB only.
 */
export function IdeateVisionBoardClient() {
  const [items, setItems] = useState<VisionBoardItem[]>([]);
  const [selfRef, setSelfRef] = useState<VisionSelfReference | null>(null);
  const [extraRefs, setExtraRefs] = useState<VisionExtraReference[]>([]);
  const [selfPreviewUrl, setSelfPreviewUrl] = useState<string | null>(null);
  const [extraPreviewUrls, setExtraPreviewUrls] = useState<
    Record<string, string>
  >({});
  const [tileUrls, setTileUrls] = useState<Record<string, string>>({});
  const [scenePrompt, setScenePrompt] = useState("");
  const [busy, setBusy] = useState<"ref" | "gen" | "extra" | "upload" | null>(
    null,
  );
  const [refiningId, setRefiningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [menuTileId, setMenuTileId] = useState<string | null>(null);
  const [menuMode, setMenuMode] = useState<TileMenu>("actions");
  const [refineDraft, setRefineDraft] = useState("");
  const [composeDragOver, setComposeDragOver] = useState<number | null>(null);
  const [draggingTileId, setDraggingTileId] = useState<string | null>(null);
  const [lifeAreas, setLifeAreas] = useState<
    { id: string; title: string; visionText: string }[]
  >(() =>
    loadIdeateStore()
      .dreams.filter((d) => !isDemoIdeateDream(d))
      .map((d) => ({
        id: d.id,
        title: d.title.trim() || "Untitled",
        visionText: d.visionText?.trim() ?? "",
      })),
  );
  const [freshId, setFreshId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const extraFileInputRef = useRef<HTMLInputElement | null>(null);
  const boardFileInputRef = useRef<HTMLInputElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const extraPreviewUrlsRef = useRef<Record<string, string>>({});
  const tileUrlsRef = useRef<Record<string, string>>({});
  const boardRef = useRef<HTMLUListElement | null>(null);
  const { ready: cloudReady, signedIn, revision } = useIdeateCloud();

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = null;
    setSelfPreviewUrl(null);
  }, []);

  const closeTileMenu = useCallback(() => {
    setMenuTileId(null);
    setMenuMode("actions");
    setRefineDraft("");
  }, []);

  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id.startsWith("vision-tile-")) return;
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, [items]);

  const refreshLifeAreas = useCallback(() => {
    setLifeAreas(
      loadIdeateStore()
        .dreams.filter((d) => !isDemoIdeateDream(d))
      .map((d) => ({
        id: d.id,
        title: d.title.trim() || "Untitled",
        visionText: d.visionText?.trim() ?? "",
      })),
    );
  }, []);

  useEffect(() => {
    refreshLifeAreas();
    return subscribeIdeateCloud(refreshLifeAreas);
  }, [refreshLifeAreas, revision]);

  const refresh = useCallback(async () => {
    const store = loadIdeateVisionBoardStore();
    setItems(store.items);
    setSelfRef(store.selfReference ?? null);
    setExtraRefs(store.extraReferences ?? []);

    revokePreview();
    for (const u of Object.values(extraPreviewUrlsRef.current)) {
      if (u.startsWith("blob:")) URL.revokeObjectURL(u);
    }
    extraPreviewUrlsRef.current = {};

    const nextExtraPreviews: Record<string, string> = {};

    if (signedIn) {
      if (store.selfReference?.url) {
        setSelfPreviewUrl(store.selfReference.url);
      }
      for (const xr of store.extraReferences ?? []) {
        if (xr.url) nextExtraPreviews[xr.id] = xr.url;
      }
      const nextTiles: Record<string, string> = {};
      for (const item of store.items) {
        if (item.imageUrl) nextTiles[item.id] = item.imageUrl;
        for (const v of item.versions ?? []) {
          if (v.imageUrl) nextTiles[v.id] = v.imageUrl;
        }
      }
      tileUrlsRef.current = nextTiles;
      setTileUrls(nextTiles);
    } else {
      if (store.selfReference?.url) {
        setSelfPreviewUrl(store.selfReference.url);
      } else if (store.selfReference?.mediaId) {
        const rec = await getVisionMedia(store.selfReference.mediaId);
        if (rec) {
          const url = visionMediaToObjectUrl(rec);
          previewUrlRef.current = url;
          setSelfPreviewUrl(url);
        }
      }

      for (const xr of store.extraReferences ?? []) {
        if (xr.url) {
          nextExtraPreviews[xr.id] = xr.url;
          continue;
        }
        if (!xr.mediaId) continue;
        const rec = await getVisionMedia(xr.mediaId);
        if (!rec) continue;
        nextExtraPreviews[xr.id] = visionMediaToObjectUrl(rec);
      }

      const nextTiles: Record<string, string> = {};
      const loadMedia = async (id: string, mediaId?: string, imageUrl?: string) => {
        if (imageUrl) {
          nextTiles[id] = imageUrl;
          return;
        }
        if (!mediaId) return;
        const rec = await getVisionMedia(mediaId);
        if (!rec) return;
        nextTiles[id] = visionMediaToObjectUrl(rec);
      };
      for (const item of store.items) {
        await loadMedia(item.id, item.mediaId, item.imageUrl);
        for (const v of item.versions ?? []) {
          await loadMedia(v.id, v.mediaId, v.imageUrl);
        }
      }
      for (const u of Object.values(tileUrlsRef.current)) {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      }
      tileUrlsRef.current = nextTiles;
      setTileUrls(nextTiles);
    }
    extraPreviewUrlsRef.current = nextExtraPreviews;
    setExtraPreviewUrls(nextExtraPreviews);
    setHydrated(true);
  }, [revokePreview, signedIn]);

  useEffect(() => {
    if (!cloudReady && signedIn) return;
    const id = requestAnimationFrame(() => {
      void refresh();
    });
    return () => {
      cancelAnimationFrame(id);
    };
  }, [refresh, cloudReady, revision, signedIn]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      for (const u of Object.values(extraPreviewUrlsRef.current)) {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      }
      for (const u of Object.values(tileUrlsRef.current)) {
        if (u.startsWith("blob:")) URL.revokeObjectURL(u);
      }
    };
  }, []);

  useEffect(() => {
    if (!menuTileId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (boardRef.current?.contains(t)) return;
      closeTileMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTileMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuTileId, closeTileMenu]);

  const persistBoard = useCallback(
    async (store: ReturnType<typeof loadIdeateVisionBoardStore>) => {
      saveIdeateVisionBoardStore(store);
      if (signedIn) {
        await flushIdeateCloudNow();
      }
    },
    [signedIn],
  );

  const toggleTileLifeArea = useCallback(
    async (item: VisionBoardItem, lifeAreaId: string) => {
      const current = item.lifeAreaIds ?? [];
      const next = current.includes(lifeAreaId)
        ? current.filter((id) => id !== lifeAreaId)
        : [...current, lifeAreaId];
      await persistBoard(
        setVisionItemLifeAreaIds(
          loadIdeateVisionBoardStore(),
          item.id,
          next,
        ),
      );
      await refresh();
    },
    [persistBoard, refresh],
  );

  const runGenerate = useCallback(
    async (params: {
      prompt: string;
      changeRequest?: string;
      polishPrompt?: boolean;
      continuityKey?: string;
      continuityMediaId?: string;
    }) => {
      await import("@/lib/auth-session").then((m) =>
        m.ensureMedimadeSession({ force: false }),
      );
      const auth = await import("@/lib/auth-session");
      // Refresh once if memory JWT missing (common after reload).
      if (!auth.getMedimadeSessionJwt()) {
        await auth.ensureMedimadeSession({ force: true });
      }

      const store = loadIdeateVisionBoardStore();
      const refMeta = store.selfReference;
      if (!refMeta) {
        throw new Error("Upload a clear photo of yourself first.");
      }

      const common = {
        prompt: params.prompt,
        ...(params.changeRequest
          ? { changeRequest: params.changeRequest }
          : {}),
        ...(params.polishPrompt === false ? { polishPrompt: false } : {}),
      };

      const jwt = Boolean(auth.getMedimadeSessionJwt());
      const referenceKey =
        refMeta.key?.trim() || visionKeyFromUrl(refMeta.url) || "";

      // Persist recovered key so later generates don't need URL parsing.
      if (jwt && referenceKey && !refMeta.key) {
        await persistBoard({
          ...store,
          v: 2,
          selfReference: { ...refMeta, key: referenceKey },
        });
      }

      const buildExtras = async (): Promise<
        Array<{
          description: string;
          referenceKey?: string;
          referenceBase64?: string;
          mimeType?: string;
        }>
      > => {
        const out: Array<{
          description: string;
          referenceKey?: string;
          referenceBase64?: string;
          mimeType?: string;
        }> = [];
        for (const xr of store.extraReferences ?? []) {
          const description = xr.description.trim();
          if (!description) continue;
          const xKey = xr.key?.trim() || visionKeyFromUrl(xr.url) || "";
          if (jwt && xKey) {
            out.push({
              description,
              referenceKey: xKey,
              mimeType: xr.mimeType,
            });
            continue;
          }
          if (xr.mediaId) {
            const rec = await getVisionMedia(xr.mediaId);
            if (!rec) continue;
            const blob = new Blob([rec.bytes], { type: rec.mimeType });
            const prepared = await resizeImageFileForApi(blob, 1280, 0.88);
            const apiBuf = await blobToArrayBuffer(prepared.blob);
            const referenceBase64 = await visionMediaToBase64({
              id: "tmp",
              mimeType: prepared.mimeType,
              bytes: apiBuf,
              updatedAt: new Date().toISOString(),
            });
            out.push({
              description,
              referenceBase64,
              mimeType: prepared.mimeType,
            });
          }
        }
        if (
          out.length < MAX_VISION_EXTRA_REFERENCES &&
          (params.continuityKey || params.continuityMediaId)
        ) {
          const description =
            "This scene as it looks now. Keep the same people and place, and make a fresh moment.";
          if (params.continuityKey) {
            out.push({ description, referenceKey: params.continuityKey });
          } else if (params.continuityMediaId) {
            const rec = await getVisionMedia(params.continuityMediaId);
            if (rec) {
              const blob = new Blob([rec.bytes], { type: rec.mimeType });
              const prepared = await resizeImageFileForApi(blob, 1280, 0.88);
              const apiBuf = await blobToArrayBuffer(prepared.blob);
              const referenceBase64 = await visionMediaToBase64({
                id: "tmp",
                mimeType: prepared.mimeType,
                bytes: apiBuf,
                updatedAt: new Date().toISOString(),
              });
              out.push({
                description,
                referenceBase64,
                mimeType: prepared.mimeType,
              });
            }
          }
        }
        return out.slice(0, MAX_VISION_EXTRA_REFERENCES);
      };

      const extraReferences = await buildExtras();

      // Cloud path: Lambda reads the object from S3 (no browser CORS to CloudFront).
      if (jwt && referenceKey) {
        try {
          return await generateVisionBoardScene({
            ...common,
            referenceKey,
            mimeType: refMeta.mimeType,
            ...(extraReferences.length ? { extraReferences } : {}),
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (/failed to fetch/i.test(msg)) {
            throw new Error(
              "Could not reach the API. Check your connection and try again.",
            );
          }
          throw e;
        }
      }

      // Guest IndexedDB binary.
      if (refMeta.mediaId) {
        const rec = await getVisionMedia(refMeta.mediaId);
        if (!rec) {
          throw new Error("Reference photo is missing — upload it again.");
        }
        const blob = new Blob([rec.bytes], { type: rec.mimeType });
        const prepared = await resizeImageFileForApi(blob, 1536, 0.9);
        const apiBuf = await blobToArrayBuffer(prepared.blob);
        const referenceBase64 = await visionMediaToBase64({
          id: "tmp",
          mimeType: prepared.mimeType,
          bytes: apiBuf,
          updatedAt: new Date().toISOString(),
        });
        return generateVisionBoardScene({
          ...common,
          referenceBase64,
          mimeType: prepared.mimeType,
          ...(extraReferences.length ? { extraReferences } : {}),
        });
      }

      if (refMeta.url && !jwt) {
        throw new Error(
          "Your session expired. Sign in again to regenerate with your cloud photo.",
        );
      }

      throw new Error(
        "Your reference photo is incomplete — re-upload it, then try again.",
      );
    },
    [persistBoard],
  );

  const onPickReference = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setError(null);
      setBusy("ref");
      try {
        if (!file.type.startsWith("image/")) {
          throw new Error("Choose a photo (JPEG, PNG, or HEIC).");
        }
        if (signedIn && !getMedimadeApiBase()) {
          throw new Error("API URL is not configured.");
        }

        const probe = await createImageBitmap(file);
        const width = probe.width;
        const height = probe.height;
        probe.close();

        const prev = loadIdeateVisionBoardStore().selfReference;

        if (signedIn) {
          const prepared = await resizeImageFileForApi(file, 2048, 0.92);
          const apiBuf = await blobToArrayBuffer(prepared.blob);
          const imageBase64 = await visionMediaToBase64({
            id: "tmp",
            mimeType: prepared.mimeType,
            bytes: apiBuf,
            updatedAt: new Date().toISOString(),
          });
          const uploaded = await uploadIdeateVisionMedia({
            imageBase64,
            mimeType: prepared.mimeType,
            kind: "self",
          });

          const meta: VisionSelfReference = {
            url: uploaded.url,
            key: uploaded.key,
            mimeType: prepared.mimeType,
            fileName: file.name || "reference.jpg",
            width: prepared.width || width,
            height: prepared.height || height,
            byteLength: uploaded.byteLength ?? apiBuf.byteLength,
            updatedAt: new Date().toISOString(),
          };
          const store = loadIdeateVisionBoardStore();
          await persistBoard({
            ...store,
            v: 2,
            selfReference: meta,
          });
        } else {
          const fullBuf = await blobToArrayBuffer(file);
          const mediaId = newVisionMediaId("self");
          if (prev?.mediaId) await deleteVisionMedia(prev.mediaId);
          await putVisionMedia({
            id: mediaId,
            mimeType: file.type || "image/jpeg",
            bytes: fullBuf,
            updatedAt: new Date().toISOString(),
          });
          const meta: VisionSelfReference = {
            mediaId,
            mimeType: file.type || "image/jpeg",
            fileName: file.name || "reference.jpg",
            width,
            height,
            byteLength: fullBuf.byteLength,
            updatedAt: new Date().toISOString(),
          };
          const store = loadIdeateVisionBoardStore();
          await persistBoard({
            ...store,
            v: 2,
            selfReference: meta,
          });
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save that photo");
      } finally {
        setBusy(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [persistBoard, refresh, signedIn],
  );

  const clearReference = useCallback(async () => {
    setError(null);
    const store = loadIdeateVisionBoardStore();
    if (!signedIn && store.selfReference?.mediaId) {
      await deleteVisionMedia(store.selfReference.mediaId);
    }
    await persistBoard({
      ...store,
      v: 2,
      selfReference: null,
    });
    await refresh();
  }, [persistBoard, refresh, signedIn]);

  const onPickExtraReference = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setError(null);
      const store = loadIdeateVisionBoardStore();
      const current = store.extraReferences ?? [];
      if (current.length >= MAX_VISION_EXTRA_REFERENCES) {
        setError(`You can add up to ${MAX_VISION_EXTRA_REFERENCES} extra references.`);
        if (extraFileInputRef.current) extraFileInputRef.current.value = "";
        return;
      }
      setBusy("extra");
      try {
        if (!file.type.startsWith("image/")) {
          throw new Error("Choose a photo (JPEG, PNG, or HEIC).");
        }
        if (signedIn && !getMedimadeApiBase()) {
          throw new Error("API URL is not configured.");
        }

        const probe = await createImageBitmap(file);
        const width = probe.width;
        const height = probe.height;
        probe.close();
        const id = newExtraRefId();

        let meta: VisionExtraReference;
        if (signedIn) {
          const prepared = await resizeImageFileForApi(file, 1600, 0.9);
          const apiBuf = await blobToArrayBuffer(prepared.blob);
          const imageBase64 = await visionMediaToBase64({
            id: "tmp",
            mimeType: prepared.mimeType,
            bytes: apiBuf,
            updatedAt: new Date().toISOString(),
          });
          const uploaded = await uploadIdeateVisionMedia({
            imageBase64,
            mimeType: prepared.mimeType,
            kind: "extra",
          });
          meta = {
            id,
            description: "",
            url: uploaded.url,
            key: uploaded.key,
            mimeType: prepared.mimeType,
            fileName: file.name || "extra.jpg",
            width: prepared.width || width,
            height: prepared.height || height,
            byteLength: uploaded.byteLength ?? apiBuf.byteLength,
            updatedAt: new Date().toISOString(),
          };
        } else {
          const fullBuf = await blobToArrayBuffer(file);
          const mediaId = newVisionMediaId("extra");
          await putVisionMedia({
            id: mediaId,
            mimeType: file.type || "image/jpeg",
            bytes: fullBuf,
            updatedAt: new Date().toISOString(),
          });
          meta = {
            id,
            description: "",
            mediaId,
            mimeType: file.type || "image/jpeg",
            fileName: file.name || "extra.jpg",
            width,
            height,
            byteLength: fullBuf.byteLength,
            updatedAt: new Date().toISOString(),
          };
        }

        await persistBoard({
          ...store,
          v: 2,
          extraReferences: [...current, meta].slice(
            0,
            MAX_VISION_EXTRA_REFERENCES,
          ),
        });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save that photo");
      } finally {
        setBusy(null);
        if (extraFileInputRef.current) extraFileInputRef.current.value = "";
      }
    },
    [persistBoard, refresh, signedIn],
  );

  const updateExtraDescription = useCallback(
    async (id: string, description: string) => {
      const store = loadIdeateVisionBoardStore();
      const next = (store.extraReferences ?? []).map((r) =>
        r.id === id
          ? { ...r, description: description.slice(0, 280) }
          : r,
      );
      setExtraRefs(next);
      await persistBoard({ ...store, v: 2, extraReferences: next });
    },
    [persistBoard],
  );

  const clearExtraReference = useCallback(
    async (id: string) => {
      setError(null);
      const store = loadIdeateVisionBoardStore();
      const target = (store.extraReferences ?? []).find((r) => r.id === id);
      if (!signedIn && target?.mediaId) {
        await deleteVisionMedia(target.mediaId);
      }
      await persistBoard({
        ...store,
        v: 2,
        extraReferences: (store.extraReferences ?? []).filter((r) => r.id !== id),
      });
      await refresh();
    },
    [persistBoard, refresh, signedIn],
  );

  const onGenerate = useCallback(async (areaId?: string | null) => {
    setError(null);
    if (!getMedimadeApiBase()) {
      setError("API URL is not configured.");
      return;
    }
    const prompt = scenePrompt.trim();
    if (prompt.length < 3) {
      setError("Describe the scene you want to step into.");
      return;
    }

    setBusy("gen");
    try {
      const result = await runGenerate({ prompt });
      const finalPrompt = result.prompt?.trim() || prompt;
      const area = areaId ? { lifeAreaIds: [areaId] } : {};

      if (signedIn) {
        if (!result.url) {
          throw new Error("Generated image did not sync to the cloud.");
        }
        const item: VisionBoardItem = {
          id: newTileId(),
          color: pickVisionSwatchColor(finalPrompt),
          label: visionLabelFromPrompt(finalPrompt),
          kind: "image",
          imageUrl: result.url,
          ...(result.key ? { mediaKey: result.key } : {}),
          prompt: finalPrompt,
          createdAt: new Date().toISOString(),
          ...area,
        };
        setFreshId(item.id);
        await persistBoard(
          insertVisionItemInLibrary(loadIdeateVisionBoardStore(), item),
        );
      } else {
        const outBytes = Uint8Array.from(atob(result.imageBase64), (c) =>
          c.charCodeAt(0),
        );
        const mediaId = newVisionMediaId("scene");
        await putVisionMedia({
          id: mediaId,
          mimeType: result.mimeType,
          bytes: outBytes.buffer.slice(
            outBytes.byteOffset,
            outBytes.byteOffset + outBytes.byteLength,
          ),
          updatedAt: new Date().toISOString(),
        });
        const item: VisionBoardItem = {
          id: mediaId.replace(/^scene_/, "tile_"),
          color: pickVisionSwatchColor(finalPrompt),
          label: visionLabelFromPrompt(finalPrompt),
          kind: "image",
          mediaId,
          ...(result.url ? { imageUrl: result.url } : {}),
          ...(result.key ? { mediaKey: result.key } : {}),
          prompt: finalPrompt,
          createdAt: new Date().toISOString(),
          ...area,
        };
        setFreshId(item.id);
        await persistBoard(
          insertVisionItemInLibrary(loadIdeateVisionBoardStore(), item),
        );
      }
      setScenePrompt("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }, [persistBoard, refresh, runGenerate, scenePrompt, signedIn]);

  const onUploadBoardImage = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setError(null);
      setBusy("upload");
      try {
        if (!file.type.startsWith("image/")) {
          throw new Error("Choose a photo or image file.");
        }
        if (signedIn && !getMedimadeApiBase()) {
          throw new Error("API URL is not configured.");
        }

        const label =
          file.name.replace(/\.[^.]+$/, "").trim().slice(0, 48) || "Uploaded";
        const id = newTileId();

        if (signedIn) {
          const prepared = await resizeImageFileForApi(file, 2048, 0.92);
          const apiBuf = await blobToArrayBuffer(prepared.blob);
          const imageBase64 = await visionMediaToBase64({
            id: "tmp",
            mimeType: prepared.mimeType,
            bytes: apiBuf,
            updatedAt: new Date().toISOString(),
          });
          const uploaded = await uploadIdeateVisionMedia({
            imageBase64,
            mimeType: prepared.mimeType,
            kind: "tile",
          });
          const item: VisionBoardItem = {
            id,
            color: pickVisionSwatchColor(label),
            label,
            kind: "image",
            imageUrl: uploaded.url,
            mediaKey: uploaded.key,
            createdAt: new Date().toISOString(),
          };
          setFreshId(item.id);
          await persistBoard(
            insertVisionItemInLibrary(loadIdeateVisionBoardStore(), item),
          );
        } else {
          const fullBuf = await blobToArrayBuffer(file);
          const mediaId = newVisionMediaId("tile");
          await putVisionMedia({
            id: mediaId,
            mimeType: file.type || "image/jpeg",
            bytes: fullBuf,
            updatedAt: new Date().toISOString(),
          });
          const item: VisionBoardItem = {
            id,
            color: pickVisionSwatchColor(label),
            label,
            kind: "image",
            mediaId,
            createdAt: new Date().toISOString(),
          };
          setFreshId(item.id);
          await persistBoard(
            insertVisionItemInLibrary(loadIdeateVisionBoardStore(), item),
          );
        }
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add that image");
      } finally {
        setBusy(null);
        if (boardFileInputRef.current) boardFileInputRef.current.value = "";
      }
    },
    [persistBoard, refresh, signedIn],
  );

  const onRemoveTile = useCallback(
    async (item: VisionBoardItem) => {
      if (!signedIn) {
        if (item.mediaId) await deleteVisionMedia(item.mediaId);
        for (const v of item.versions ?? []) {
          if (v.mediaId) await deleteVisionMedia(v.mediaId);
        }
      }
      closeTileMenu();
      await persistBoard(
        removeVisionBoardItem(loadIdeateVisionBoardStore(), item.id),
      );
      await refresh();
    },
    [closeTileMenu, persistBoard, refresh, signedIn],
  );

  const onRegenerateTile = useCallback(
    async (item: VisionBoardItem) => {
      setError(null);
      if (!getMedimadeApiBase()) {
        setError("API URL is not configured.");
        return;
      }
      const basePrompt = item.prompt?.trim();
      if (!basePrompt) {
        setError("This tile has no scene prompt to regenerate.");
        return;
      }

      setRefiningId(item.id);
      try {
        const result = await runGenerate({
          prompt: basePrompt,
          polishPrompt: false,
        });
        const finalPrompt = result.prompt?.trim() || basePrompt;

        let nextMediaId: string | undefined;
        let nextUrl = result.url;
        let nextKey = result.key;

        if (signedIn) {
          if (!result.url) {
            throw new Error("Generated image did not sync to the cloud.");
          }
        } else {
          const outBytes = Uint8Array.from(atob(result.imageBase64), (c) =>
            c.charCodeAt(0),
          );
          nextMediaId = newVisionMediaId("scene");
          await putVisionMedia({
            id: nextMediaId,
            mimeType: result.mimeType,
            bytes: outBytes.buffer.slice(
              outBytes.byteOffset,
              outBytes.byteOffset + outBytes.byteLength,
            ),
            updatedAt: new Date().toISOString(),
          });
        }

        const updated = applyVisionBoardRefinement(item, {
          prompt: finalPrompt,
          ...(nextUrl ? { imageUrl: nextUrl } : {}),
          ...(nextMediaId ? { mediaId: nextMediaId } : {}),
          ...(nextKey ? { mediaKey: nextKey } : {}),
          ...(item.changeRequest
            ? { changeRequest: item.changeRequest }
            : {}),
        });
        await persistBoard(
          upsertVisionBoardItem(loadIdeateVisionBoardStore(), updated),
        );
        closeTileMenu();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Regenerate failed");
      } finally {
        setRefiningId(null);
      }
    },
    [closeTileMenu, persistBoard, refresh, runGenerate, signedIn],
  );

  const onRefineTile = useCallback(
    async (item: VisionBoardItem) => {
      setError(null);
      if (!getMedimadeApiBase()) {
        setError("API URL is not configured.");
        return;
      }
      const change = refineDraft.trim();
      if (change.length < 2) {
        setError("Say how you’d like to change this image.");
        return;
      }
      const basePrompt = item.prompt?.trim();
      if (!basePrompt) {
        setError("This tile has no scene prompt to refine.");
        return;
      }

      setRefiningId(item.id);
      try {
        const result = await runGenerate({
          prompt: basePrompt,
          changeRequest: change,
        });
        const finalPrompt = result.prompt?.trim() || basePrompt;

        let nextMediaId: string | undefined;
        let nextUrl = result.url;
        let nextKey = result.key;

        if (signedIn) {
          if (!result.url) {
            throw new Error("Generated image did not sync to the cloud.");
          }
        } else {
          const outBytes = Uint8Array.from(atob(result.imageBase64), (c) =>
            c.charCodeAt(0),
          );
          nextMediaId = newVisionMediaId("scene");
          await putVisionMedia({
            id: nextMediaId,
            mimeType: result.mimeType,
            bytes: outBytes.buffer.slice(
              outBytes.byteOffset,
              outBytes.byteOffset + outBytes.byteLength,
            ),
            updatedAt: new Date().toISOString(),
          });
        }

        const updated = applyVisionBoardRefinement(item, {
          prompt: finalPrompt,
          ...(nextUrl ? { imageUrl: nextUrl } : {}),
          ...(nextMediaId ? { mediaId: nextMediaId } : {}),
          ...(nextKey ? { mediaKey: nextKey } : {}),
          changeRequest: change,
        });
        await persistBoard(
          upsertVisionBoardItem(loadIdeateVisionBoardStore(), updated),
        );
        closeTileMenu();
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Refine failed");
      } finally {
        setRefiningId(null);
      }
    },
    [closeTileMenu, persistBoard, refineDraft, refresh, runGenerate, signedIn],
  );

  const onRestoreVersion = useCallback(
    async (item: VisionBoardItem, versionId: string) => {
      const updated = restoreVisionBoardVersion(item, versionId);
      if (!updated) return;
      closeTileMenu();
      await persistBoard(
        upsertVisionBoardItem(loadIdeateVisionBoardStore(), updated),
      );
      await refresh();
    },
    [closeTileMenu, persistBoard, refresh],
  );

  const onPlaceInCompose = useCallback(
    async (itemId: string, slotIndex: number) => {
      const next = placeVisionItemInComposeSlot(
        loadIdeateVisionBoardStore(),
        itemId,
        slotIndex,
      );
      await persistBoard(next);
      setItems(next.items);
    },
    [persistBoard],
  );

  const onToggleFavourite = useCallback(
    async (item: VisionBoardItem) => {
      const next = setVisionItemFavourite(
        loadIdeateVisionBoardStore(),
        item.id,
        !item.favourite,
      );
      await persistBoard(next);
      setItems(next.items);
    },
    [persistBoard],
  );

  const onRemoveFromBoard = useCallback(
    async (item: VisionBoardItem) => {
      const next = removeVisionItemFromBoard(
        loadIdeateVisionBoardStore(),
        item.id,
      );
      await persistBoard(next);
      setItems(next.items);
    },
    [persistBoard],
  );

  const onAddToBoard = useCallback(
    async (item: VisionBoardItem) => {
      const store = loadIdeateVisionBoardStore();
      const slots = getComposeSlotIds(store.items);
      const empty = slots.findIndex((id) => !id);
      if (empty < 0) {
        setError("Your board is full. Remove one to add another.");
        return;
      }
      const next = placeVisionItemInComposeSlot(store, item.id, empty);
      await persistBoard(next);
      setItems(next.items);
    },
    [persistBoard],
  );

  const onFeature = useCallback(
    async (item: VisionBoardItem) => {
      const store = loadIdeateVisionBoardStore();
      const slots = getComposeSlotIds(store.items);
      const onBoard = slots.includes(item.id);
      if (!onBoard && slots.every(Boolean)) {
        setError("Your board is full. Remove one to add another.");
        return;
      }
      const next = setVisionItemFeatured(store, item.id);
      await persistBoard(next);
      setItems(next.items);
    },
    [persistBoard],
  );

  const onApplyCrop = useCallback(
    async (item: VisionBoardItem, crop: VisionCrop | null, featured: boolean) => {
      const store = loadIdeateVisionBoardStore();
      const slots = getComposeSlotIds(store.items);
      const onBoard = slots.includes(item.id);
      if (featured && !onBoard && slots.every(Boolean)) {
        setError("Your board is full. Remove one to add another.");
        return;
      }
      const next = setVisionItemCrop(store, item.id, crop, featured);
      await persistBoard(next);
      setItems(next.items);
    },
    [persistBoard],
  );

  const onMeasure = useCallback(
    async (item: VisionBoardItem, width: number, height: number) => {
      const store = loadIdeateVisionBoardStore();
      const next = setVisionItemDimensions(store, item.id, width, height);
      if (next === store) return;
      await persistBoard(next);
      setItems(next.items);
    },
    [persistBoard],
  );

  const onNewTake = useCallback(
    async (item: VisionBoardItem): Promise<{ versionId: string } | null> => {
      setError(null);
      const basePrompt = item.prompt?.trim();
      if (!basePrompt) {
        setError("This image has no scene to take again.");
        return null;
      }
      if (!getMedimadeApiBase()) {
        setError("API URL is not configured.");
        return null;
      }
      setRefiningId(item.id);
      try {
        const result = await runGenerate({
          prompt: basePrompt,
          polishPrompt: false,
          ...(item.mediaKey ? { continuityKey: item.mediaKey } : {}),
          ...(!item.mediaKey && item.mediaId
            ? { continuityMediaId: item.mediaId }
            : {}),
        });
        let nextMediaId: string | undefined;
        if (!signedIn) {
          const outBytes = Uint8Array.from(atob(result.imageBase64), (c) =>
            c.charCodeAt(0),
          );
          nextMediaId = newVisionMediaId("scene");
          await putVisionMedia({
            id: nextMediaId,
            mimeType: result.mimeType,
            bytes: outBytes.buffer.slice(
              outBytes.byteOffset,
              outBytes.byteOffset + outBytes.byteLength,
            ),
            updatedAt: new Date().toISOString(),
          });
        } else if (!result.url) {
          throw new Error("Generated image did not sync to the cloud.");
        }
        const current =
          loadIdeateVisionBoardStore().items.find((x) => x.id === item.id) ??
          item;
        const stashed = stashVisionBoardTake(current, {
          prompt: result.prompt?.trim() || basePrompt,
          ...(result.url ? { imageUrl: result.url } : {}),
          ...(nextMediaId ? { mediaId: nextMediaId } : {}),
          ...(result.key ? { mediaKey: result.key } : {}),
        });
        await persistBoard(
          upsertVisionBoardItem(loadIdeateVisionBoardStore(), stashed.item),
        );
        await refresh();
        return { versionId: stashed.versionId };
      } catch (e) {
        setError(e instanceof Error ? e.message : "New take failed");
        return null;
      } finally {
        setRefiningId(null);
      }
    },
    [persistBoard, refresh, runGenerate, signedIn],
  );

  const onUseVersion = useCallback(
    async (item: VisionBoardItem, versionId: string) => {
      const current =
        loadIdeateVisionBoardStore().items.find((x) => x.id === item.id) ??
        item;
      const restored = restoreVisionBoardVersion(current, versionId);
      if (!restored) return;
      await persistBoard(
        upsertVisionBoardItem(loadIdeateVisionBoardStore(), restored),
      );
      await refresh();
    },
    [persistBoard, refresh],
  );

  const hasReference = signedIn
    ? Boolean(selfRef?.url && (selfRef?.key || visionKeyFromUrl(selfRef?.url)))
    : Boolean(selfRef?.mediaId || selfRef?.url);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPickReference(e.target.files?.[0] ?? null)}
      />
      <input
        ref={extraFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPickExtraReference(e.target.files?.[0] ?? null)}
      />
      <input
        ref={boardFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onUploadBoardImage(e.target.files?.[0] ?? null)}
      />
      <VisionBoardLayout
        items={items}
        tileUrls={tileUrls}
        lifeAreas={lifeAreas}
        hydrated={hydrated}
        busy={busy}
        error={error}
        scenePrompt={scenePrompt}
        onScenePrompt={setScenePrompt}
        onGenerate={(areaId) => void onGenerate(areaId)}
        onUploadClick={() => boardFileInputRef.current?.click()}
        onToggleFavourite={(item) => void onToggleFavourite(item)}
        onPlace={(itemId, slot) => void onPlaceInCompose(itemId, slot)}
        onRemoveFromBoard={(item) => void onRemoveFromBoard(item)}
        onAddToBoard={(item) => void onAddToBoard(item)}
        onFeature={(item) => void onFeature(item)}
        onApplyCrop={(item, crop, featured) => void onApplyCrop(item, crop, featured)}
        onMeasure={(item, width, height) => void onMeasure(item, width, height)}
        onNewTake={onNewTake}
        onUseVersion={(item, versionId) => void onUseVersion(item, versionId)}
        freshId={freshId}
        selfPreviewUrl={selfPreviewUrl}
        hasReference={hasReference}
        extraRefs={extraRefs}
        extraPreviewUrls={extraPreviewUrls}
        onPickSelf={() => fileInputRef.current?.click()}
        onClearSelf={() => void clearReference()}
        onPickExtra={() => extraFileInputRef.current?.click()}
        onClearExtra={(id) => void clearExtraReference(id)}
        onExtraDescription={(id, value) => void updateExtraDescription(id, value)}
        selfFileName={selfRef?.fileName ?? null}
      />
    </>
  );
}

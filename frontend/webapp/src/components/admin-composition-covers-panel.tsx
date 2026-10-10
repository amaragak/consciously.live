import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibraryPlayer } from "@/components/library-player-provider";
import type { LibraryActiveTrack } from "@/components/library-player-provider";
import { CompositionCoverWideCropper } from "@/components/composition-cover-wide-cropper";
import {
  CompositionImportModal,
  type CompositionImportDraft,
} from "@/components/composition-import-modal";
import { SOUNDSCAPE_ELEMENT_VOLUME } from "@/lib/bed-volume";
import {
  ADMIN_IMAGE_MODELS,
  backgroundAudioPlaybackKey,
  clearAdminCompositionCover,
  createAdminSoundUploads,
  ensureAdminCompositionCoverThumbs,
  applyAdminCompositionLoudnormRestore,
  applyAdminSoundEq,
  measureAdminCompositionLoudnorm,
  generateAdminCompositionCover,
  getMedimadeMediaBaseUrl,
  listAdminCompositionCovers,
  renameAdminCompositionPackName,
  saveAdminCompositionPackNames,
  saveAdminCompositionTagTypes,
  setAdminCompositionCoverTags,
  trimAdminSound,
  updateAdminCompositionCoverMeta,
  uploadAdminSoundToS3,
  COMPOSITION_COMPOSERS,
  type AdminCompositionCoverItem,
  type AdminCompositionTagType,
  type AdminImageModel,
  type CompositionComposer,
} from "@/lib/medimade-api";

function compositionHasCatalogTrim(
  item: Pick<
    AdminCompositionCoverItem,
    "trimStartSec" | "trimEndSec" | "fadeInSec" | "fadeOutSec"
  >,
): boolean {
  return (
    (item.trimStartSec ?? 0) > 0.01 ||
    item.trimEndSec != null ||
    (item.fadeInSec ?? 0) > 0 ||
    (item.fadeOutSec ?? 0) > 0
  );
}

function compositionHasCatalogEq(
  item: Pick<AdminCompositionCoverItem, "eqBands">,
): boolean {
  return (item.eqBands?.length ?? 0) > 0;
}

/** Catalog has EQ/trim but no confirmed AAC bake (e.g. after replace/normalize). */
function compositionStreamingEditsStale(
  item: AdminCompositionCoverItem,
): boolean {
  if (item.streamingEditedAt) return false;
  return compositionHasCatalogTrim(item) || compositionHasCatalogEq(item);
}

function compositionPendingEditsSummary(
  item: AdminCompositionCoverItem,
): string {
  const parts: string[] = [];
  if (compositionHasCatalogTrim(item)) {
    const end =
      item.trimEndSec != null ? `${item.trimEndSec.toFixed(1)}s` : "end";
    parts.push(`Trim ${(item.trimStartSec ?? 0).toFixed(1)}s → ${end}`);
    if ((item.fadeInSec ?? 0) > 0) {
      parts.push(`Fade in ${item.fadeInSec!.toFixed(1)}s`);
    }
    if ((item.fadeOutSec ?? 0) > 0) {
      parts.push(`Fade out ${item.fadeOutSec!.toFixed(1)}s`);
    }
  }
  if (compositionHasCatalogEq(item)) {
    const eq = (item.eqBands ?? [])
      .filter((b) => b.enabled !== false)
      .map((b) => {
        const g = b.gain >= 0 ? `+${b.gain}` : `${b.gain}`;
        return `${b.frequency}Hz ${g}dB`;
      })
      .join(" · ");
    if (eq) parts.push(`EQ ${eq}`);
  }
  return parts.join(" · ") || "Saved markers";
}

const LOUDNORM_FULL_TARGET_LUFS = -16;

/** Target LUFS for a restore slider position (0 = −16, 100 = source). */
function loudnormDraftTargetLufs(sourceLufs: number, restorePct: number): number {
  const pct = Math.min(100, Math.max(0, restorePct)) / 100;
  if (sourceLufs <= LOUDNORM_FULL_TARGET_LUFS) return LOUDNORM_FULL_TARGET_LUFS;
  return (
    LOUDNORM_FULL_TARGET_LUFS +
    (sourceLufs - LOUDNORM_FULL_TARGET_LUFS) * pct
  );
}

/**
 * Client-side preview volume: `fileLufs` is the level of the audio element’s
 * current src (frozen when preview starts). Boost/cut so the fader sounds like
 * `restoreDraft` without re-encoding. Cap leaves ~6 dB headroom above listen vol.
 */
function loudnormPreviewElementVolume(
  sourceLufs: number | null | undefined,
  fileLufs: number,
  restoreDraft: number,
): number {
  if (sourceLufs == null) return SOUNDSCAPE_ELEMENT_VOLUME;
  const draftTarget = loudnormDraftTargetLufs(sourceLufs, restoreDraft);
  const gainDb = draftTarget - fileLufs;
  const linear = 10 ** (gainDb / 20);
  return Math.min(1, Math.max(0, SOUNDSCAPE_ELEMENT_VOLUME * linear));
}

function committedFileLufs(item: AdminCompositionCoverItem): number {
  return (
    item.loudnormOutputLufs ??
    item.loudnormTargetLufs ??
    LOUDNORM_FULL_TARGET_LUFS
  );
}

type CoverFilter = "all" | "missing" | "has";

type RowState = {
  model: AdminImageModel;
  /** Optional creative direction for first gen / fresh idea. */
  guidePrompt: string;
  /** Revision note — prior prompts + this → LLM rewrite. */
  changeRequest: string;
  tagDraft: string;
  nameDraft: string;
  binauralHzDraft: string;
  coverWideCropYDraft: number;
  cropOpen: boolean;
  busy: boolean;
  /** Row-local status (e.g. replace upload progress). */
  statusNote: string | null;
  /** Draft for loudnorm restore slider (0 = full −16, 100 = source). */
  loudnormRestoreDraft: number;
  error: string | null;
};

function blankRowState(
  model: AdminImageModel = "gpt-image-1-mini",
  item?: Pick<
    AdminCompositionCoverItem,
    "name" | "binauralHz" | "coverWideCropY"
  >,
): RowState {
  return {
    model,
    guidePrompt: "",
    changeRequest: "",
    tagDraft: "",
    nameDraft: item?.name ?? "",
    binauralHzDraft:
      item?.binauralHz != null && Number.isFinite(item.binauralHz)
        ? String(item.binauralHz)
        : "",
    coverWideCropYDraft:
      item?.coverWideCropY != null && Number.isFinite(item.coverWideCropY)
        ? Math.min(100, Math.max(0, Math.round(item.coverWideCropY)))
        : 50,
    cropOpen: false,
    busy: false,
    statusNote: null,
    loudnormRestoreDraft: 0,
    error: null,
  };
}

function formatBinauralHzDraft(hz: number | null | undefined): string {
  if (hz == null || !Number.isFinite(hz)) return "";
  return String(hz);
}

function parseBinauralHzDraft(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 1000) {
    throw new Error("Binaural Hz must be a number between 0 and 1000");
  }
  return Math.round(n * 10) / 10;
}

function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().slice(0, 32);
}

function slugifyTypeId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function hasCover(item: AdminCompositionCoverItem): boolean {
  return Boolean(item.coverImageUrl || item.coverImageKey);
}

function hasThumb(item: AdminCompositionCoverItem): boolean {
  return Boolean(item.coverImageThumbUrl || item.coverImageThumbKey);
}

function titleFromFilename(name: string): string {
  const leaf = name.split(/[/\\]/).pop() ?? name;
  const stem = leaf.replace(/\.(mp3|wav)$/i, "");
  const pretty = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return pretty || "Untitled";
}

type ImportPrompt = {
  key: string;
  filename: string;
  initialName: string;
};

/** Cover present but no thumb — backfill without AI regen. */
function needsThumb(item: AdminCompositionCoverItem): boolean {
  return hasCover(item) && !hasThumb(item);
}

function mediaFileUrl(base: string, key: string, cacheBust?: string | null): string {
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  const url = `${b}/${path}`;
  const v = cacheBust?.trim();
  if (!v) return url;
  return `${url}?v=${encodeURIComponent(v)}`;
}

function compositionStripTrack(
  baseUrl: string | undefined,
  item: AdminCompositionCoverItem,
): LibraryActiveTrack | null {
  const root = (baseUrl ?? getMedimadeMediaBaseUrl() ?? "").replace(/\/$/, "");
  if (!root || !item.key.trim()) return null;
  const playKey = backgroundAudioPlaybackKey(item.key);
  const cover =
    item.coverImageThumbUrl?.trim() || item.coverImageUrl?.trim() || "";
  return {
    url: mediaFileUrl(root, playKey, item.updatedAt),
    title: item.name,
    s3Key: `admin:composition-cover:${item.key}`,
    ambientOnly: true,
    ambientKind: "soundscape",
    liveMix: false,
    musicKey: item.key,
    musicGain: 100,
    natureKey: "",
    drumsKey: "",
    noiseKey: "",
    natureGain: 0,
    drumsGain: 0,
    noiseGain: 0,
    ...(cover ? { coverImageUrl: cover } : {}),
  };
}

function IconPlay({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5.14v13.72L19 12 8 5.14z" />
    </svg>
  );
}

function IconPause({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 5h4v14H6V5zm8 0h4v14h-4V5z" />
    </svg>
  );
}

/** Warning triangle for a tag type with no tags on this composition. */
function IconWarningArrow({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

/** Types that have a vocabulary but none of those tags appear on the item. */
function missingTagTypesForItem(
  item: AdminCompositionCoverItem,
  types: AdminCompositionTagType[],
): AdminCompositionTagType[] {
  const onItem = new Set(item.tags);
  return types.filter((type) => {
    if (type.tags.length === 0) return false;
    return !type.tags.some((t) => onItem.has(t));
  });
}

export function AdminCompositionCoversPanel() {
  const { playTrack, toggleCurrent, nowPlaying, playingS3Key, dismiss } =
    useLibraryPlayer();
  const loudnormPreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  /** LUFS of the file currently loaded in the preview element (not live catalog). */
  const loudnormPreviewFileLufsRef = useRef<number>(LOUDNORM_FULL_TARGET_LUFS);
  const [loudnormPreviewKey, setLoudnormPreviewKey] = useState<string | null>(
    null,
  );
  const [items, setItems] = useState<AdminCompositionCoverItem[]>([]);
  const [tagTypes, setTagTypes] = useState<AdminCompositionTagType[]>([]);
  const [packNames, setPackNames] = useState<string[]>([]);
  const [tagTypesBusy, setTagTypesBusy] = useState(false);
  const [packNamesBusy, setPackNamesBusy] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [newPackName, setNewPackName] = useState("");
  const [typeTagDrafts, setTypeTagDrafts] = useState<Record<string, string>>(
    {},
  );
  const [baseUrl, setBaseUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [coverFilter, setCoverFilter] = useState<CoverFilter>("all");
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [defaultModel, setDefaultModel] =
    useState<AdminImageModel>("gpt-image-1-mini");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const bulkAbortRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  /** Target catalog key for Replace file (ref so file-picker onChange isn’t stale). */
  const replaceTargetKeyRef = useRef<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [importPrompt, setImportPrompt] = useState<ImportPrompt | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        items: list,
        baseUrl: nextBase,
        tagTypes: nextTypes,
        packNames: nextPacks,
      } = await listAdminCompositionCovers();
      setItems(list);
      setTagTypes(nextTypes);
      setPackNames(nextPacks);
      if (nextBase) setBaseUrl(nextBase);
      setRows((prev) => {
        const next: Record<string, RowState> = {};
        for (const it of list) {
          const existing = prev[it.key];
          if (existing?.busy) {
            next[it.key] = existing;
          } else {
            next[it.key] = {
              ...(existing ?? blankRowState(defaultModel, it)),
              nameDraft: it.name,
              binauralHzDraft: formatBinauralHzDraft(it.binauralHz),
              coverWideCropYDraft:
                existing?.cropOpen
                  ? existing.coverWideCropYDraft
                  : (it.coverWideCropY ?? 50),
              loudnormRestoreDraft: it.loudnormRestorePct ?? 0,
            };
          }
        }
        return next;
      });
      setSelected((prev) => {
        const keys = new Set(list.map((it) => it.key));
        const next = new Set<string>();
        for (const k of prev) {
          if (keys.has(k)) next.add(k);
        }
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load compositions");
    } finally {
      setLoading(false);
    }
  }, [defaultModel]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (coverFilter === "missing" && hasCover(it)) return false;
      if (coverFilter === "has" && !hasCover(it)) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.key.toLowerCase().includes(q) ||
        it.tags.some((t) => t.includes(q))
      );
    });
  }, [items, query, coverFilter]);

  const counts = useMemo(() => {
    let missing = 0;
    let withCover = 0;
    let missingThumb = 0;
    for (const it of items) {
      if (hasCover(it)) {
        withCover += 1;
        if (!hasThumb(it)) missingThumb += 1;
      } else missing += 1;
    }
    return { total: items.length, missing, withCover, missingThumb };
  }, [items]);

  /** Catalog-wide tags (most used first) so admins reuse the same wording. */
  const usedTags = useMemo(() => {
    const countsByTag = new Map<string, number>();
    for (const it of items) {
      for (const tag of it.tags) {
        countsByTag.set(tag, (countsByTag.get(tag) ?? 0) + 1);
      }
    }
    return [...countsByTag.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [items]);

  const typedTagSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of tagTypes) {
      for (const tag of t.tags) s.add(tag);
    }
    return s;
  }, [tagTypes]);

  const untypedUsedTags = useMemo(
    () => usedTags.filter((t) => !typedTagSet.has(t)),
    [usedTags, typedTagSet],
  );

  async function persistTagTypes(next: AdminCompositionTagType[]) {
    setTagTypesBusy(true);
    setError(null);
    const normalized = next.map((t, i) => ({
      ...t,
      id: t.id || slugifyTypeId(t.label) || `type-${i + 1}`,
      label: t.label.trim().slice(0, 48),
      tags: [...new Set(t.tags.map(normalizeTag).filter(Boolean))],
      sort: i,
    }));
    setTagTypes(normalized);
    try {
      const saved = await saveAdminCompositionTagTypes(normalized);
      setTagTypes(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save tag types");
      try {
        await refresh();
      } catch {
        /* keep optimistic */
      }
    } finally {
      setTagTypesBusy(false);
    }
  }

  function addTagType() {
    const label = newTypeLabel.trim();
    if (!label) return;
    const idBase = slugifyTypeId(label) || `type-${tagTypes.length + 1}`;
    let id = idBase;
    let n = 2;
    while (tagTypes.some((t) => t.id === id)) {
      id = `${idBase}-${n}`;
      n += 1;
    }
    setNewTypeLabel("");
    void persistTagTypes([
      ...tagTypes,
      { id, label, tags: [], sort: tagTypes.length },
    ]);
  }

  function renameTagType(id: string, label: string) {
    const nextLabel = label.trim().slice(0, 48);
    if (!nextLabel) return;
    void persistTagTypes(
      tagTypes.map((t) => (t.id === id ? { ...t, label: nextLabel } : t)),
    );
  }

  function removeTagType(id: string) {
    if (!window.confirm("Remove this tag type? Tags themselves stay on covers.")) {
      return;
    }
    void persistTagTypes(tagTypes.filter((t) => t.id !== id));
  }

  function assignTagToType(typeId: string, rawTag: string) {
    const tag = normalizeTag(rawTag);
    if (!tag) return;
    void persistTagTypes(
      tagTypes.map((t) => {
        if (t.id === typeId) {
          if (t.tags.includes(tag)) return t;
          return { ...t, tags: [...t.tags, tag] };
        }
        return { ...t, tags: t.tags.filter((x) => x !== tag) };
      }),
    );
  }

  function removeTagFromType(typeId: string, tag: string) {
    void persistTagTypes(
      tagTypes.map((t) =>
        t.id === typeId ? { ...t, tags: t.tags.filter((x) => x !== tag) } : t,
      ),
    );
  }

  const selectedInView = useMemo(() => {
    const keys = new Set(filtered.map((it) => it.key));
    let n = 0;
    for (const k of selected) {
      if (keys.has(k)) n += 1;
    }
    return n;
  }, [filtered, selected]);

  const allFilteredSelected =
    filtered.length > 0 && selectedInView === filtered.length;

  function patchRow(key: string, patch: Partial<RowState>) {
    setRows((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? blankRowState(defaultModel)), ...patch },
    }));
  }

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of filtered) next.add(it.key);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function selectMissing() {
    setSelected(
      new Set(items.filter((it) => !hasCover(it)).map((it) => it.key)),
    );
  }

  function selectMissingInView() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const it of filtered) {
        if (!hasCover(it)) next.add(it.key);
      }
      return next;
    });
  }

  async function onGenerate(
    item: AdminCompositionCoverItem,
    mode: "fresh" | "refine" | "regen",
  ): Promise<boolean> {
    const state = rows[item.key] ?? blankRowState(defaultModel, item);
    const title = state.nameDraft.trim() || item.name;
    const changeRequest = state.changeRequest.trim();
    const guidePrompt = state.guidePrompt.trim();
    // Regen: what-to-change → LLM refine; otherwise fresh idea (title + guide).
    const resolved: "fresh" | "refine" =
      mode === "regen"
        ? changeRequest
          ? "refine"
          : "fresh"
        : mode;
    if (resolved === "refine" && !changeRequest) {
      patchRow(item.key, {
        error: "Add what to change for regen",
      });
      return false;
    }
    patchRow(item.key, { busy: true, error: null });
    try {
      const saved = await generateAdminCompositionCover({
        key: item.key,
        title,
        model: state.model,
        guidePrompt: resolved === "fresh" ? guidePrompt : "",
        changeRequest: resolved === "refine" ? changeRequest : "",
      });
      setItems((prev) =>
        prev.map((p) => (p.key === saved.key ? { ...p, ...saved } : p)),
      );
      patchRow(item.key, {
        busy: false,
        nameDraft: saved.name,
        binauralHzDraft: formatBinauralHzDraft(saved.binauralHz),
        ...(resolved === "refine" ? { changeRequest: "" } : {}),
      });
      return true;
    } catch (e) {
      patchRow(item.key, {
        busy: false,
        error: e instanceof Error ? e.message : "Generate failed",
      });
      return false;
    }
  }

  async function onClear(item: AdminCompositionCoverItem) {
    if (!hasCover(item)) return;
    if (!window.confirm(`Clear cover for “${item.name}”?`)) return;
    patchRow(item.key, { busy: true, error: null });
    try {
      const saved = await clearAdminCompositionCover(item.key);
      setItems((prev) =>
        prev.map((p) => (p.key === saved.key ? { ...p, ...saved } : p)),
      );
      patchRow(item.key, { busy: false });
    } catch (e) {
      patchRow(item.key, {
        busy: false,
        error: e instanceof Error ? e.message : "Clear failed",
      });
    }
  }

  async function persistTags(item: AdminCompositionCoverItem, tags: string[]) {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of tags) {
      const t = normalizeTag(raw);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      unique.push(t);
      if (unique.length >= 24) break;
    }
    const state = rows[item.key] ?? blankRowState(defaultModel, item);
    const title = state.nameDraft.trim() || item.name;
    patchRow(item.key, { busy: true, error: null });
    try {
      const saved = await setAdminCompositionCoverTags({
        key: item.key,
        tags: unique,
        title,
      });
      setItems((prev) =>
        prev.map((p) => (p.key === saved.key ? { ...p, ...saved } : p)),
      );
      patchRow(item.key, {
        busy: false,
        nameDraft: saved.name,
        binauralHzDraft: formatBinauralHzDraft(saved.binauralHz),
      });
    } catch (e) {
      patchRow(item.key, {
        busy: false,
        error: e instanceof Error ? e.message : "Could not save tags",
      });
    }
  }

  async function persistMeta(
    item: AdminCompositionCoverItem,
    overrides?: {
      customPackName?: string | null;
      composer?: CompositionComposer;
      adminFavourite?: boolean;
      coverWideCropY?: number;
    },
  ) {
    // Prefer ref so Save crop always reads the latest drag position, not a
    // stale render closure from before the last pointermove.
    const state =
      rowsRef.current[item.key] ?? blankRowState(defaultModel, item);
    const name = state.nameDraft.trim().slice(0, 200);
    if (!name) {
      patchRow(item.key, {
        nameDraft: item.name,
        error: "Title is required",
      });
      return;
    }
    let binauralHz: number | null;
    try {
      binauralHz = parseBinauralHzDraft(state.binauralHzDraft);
    } catch (e) {
      patchRow(item.key, {
        error: e instanceof Error ? e.message : "Invalid Hz",
      });
      return;
    }
    const customPackName =
      overrides && "customPackName" in overrides
        ? overrides.customPackName ?? null
        : item.customPackName;
    const composer =
      overrides && "composer" in overrides
        ? (overrides.composer ?? item.composer)
        : item.composer;
    const adminFavourite =
      overrides && "adminFavourite" in overrides
        ? Boolean(overrides.adminFavourite)
        : item.adminFavourite;
    const cropRaw =
      overrides && "coverWideCropY" in overrides
        ? (overrides.coverWideCropY ?? state.coverWideCropYDraft)
        : state.coverWideCropYDraft;
    const cropRounded = Math.round(Number(cropRaw));
    const coverWideCropY = Number.isFinite(cropRounded)
      ? Math.min(100, Math.max(0, cropRounded))
      : 50;
    if (
      name === item.name &&
      binauralHz === (item.binauralHz ?? null) &&
      customPackName === (item.customPackName ?? null) &&
      composer === item.composer &&
      adminFavourite === item.adminFavourite &&
      coverWideCropY === (item.coverWideCropY ?? 50) &&
      !overrides
    ) {
      patchRow(item.key, {
        nameDraft: item.name,
        binauralHzDraft: formatBinauralHzDraft(item.binauralHz),
        coverWideCropYDraft: coverWideCropY,
        error: null,
      });
      return;
    }
    // Optimistic: keep the crop where the admin put it. A missing/defaulted
    // coverWideCropY on the response used to snap the band back to 50%.
    patchRow(item.key, {
      busy: true,
      error: null,
      coverWideCropYDraft: coverWideCropY,
    });
    setItems((prev) =>
      prev.map((p) =>
        p.key === item.key ? { ...p, coverWideCropY } : p,
      ),
    );
    try {
      const saved = await updateAdminCompositionCoverMeta({
        key: item.key,
        name,
        binauralHz,
        customPackName,
        composer,
        adminFavourite,
        coverWideCropY,
      });
      setItems((prev) =>
        prev.map((p) =>
          p.key === saved.key
            ? { ...p, ...saved, coverWideCropY }
            : p,
        ),
      );
      patchRow(item.key, {
        busy: false,
        nameDraft: saved.name,
        binauralHzDraft: formatBinauralHzDraft(saved.binauralHz),
        coverWideCropYDraft: coverWideCropY,
      });
    } catch (e) {
      patchRow(item.key, {
        busy: false,
        coverWideCropYDraft: item.coverWideCropY ?? 50,
        error: e instanceof Error ? e.message : "Could not save",
      });
      setItems((prev) =>
        prev.map((p) =>
          p.key === item.key
            ? { ...p, coverWideCropY: item.coverWideCropY ?? 50 }
            : p,
        ),
      );
    }
  }

  async function persistPackNames(next: string[]) {
    setPackNamesBusy(true);
    setError(null);
    const normalized = [
      ...new Set(
        next
          .map((n) => n.trim().replace(/\s+/g, " ").slice(0, 48))
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
    setPackNames(normalized);
    try {
      const saved = await saveAdminCompositionPackNames(normalized);
      setPackNames(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save pack names");
      try {
        await refresh();
      } catch {
        /* keep optimistic */
      }
    } finally {
      setPackNamesBusy(false);
    }
  }

  function addPackName() {
    const name = newPackName.trim().replace(/\s+/g, " ").slice(0, 48);
    if (!name) return;
    if (packNames.some((p) => p.toLowerCase() === name.toLowerCase())) {
      setNewPackName("");
      return;
    }
    setNewPackName("");
    void persistPackNames([...packNames, name]);
  }

  function removePackName(name: string) {
    if (!window.confirm(`Remove pack name “${name}”? Assignments on tracks stay until you clear them.`)) {
      return;
    }
    void persistPackNames(packNames.filter((p) => p !== name));
  }

  async function renamePackName(from: string) {
    const next = window.prompt(`Rename pack “${from}” to:`, from);
    if (next == null) return;
    const to = next.trim().replace(/\s+/g, " ").slice(0, 48);
    if (!to || to === from) return;
    if (
      packNames.some(
        (p) => p.toLowerCase() === to.toLowerCase() && p !== from,
      )
    ) {
      setError(`Pack “${to}” already exists`);
      return;
    }
    setPackNamesBusy(true);
    setError(null);
    try {
      const { packNames: saved } = await renameAdminCompositionPackName(
        from,
        to,
      );
      setPackNames(saved);
      const fromKey = from.toLowerCase();
      setItems((prev) =>
        prev.map((item) =>
          (item.customPackName ?? "").toLowerCase() === fromKey
            ? { ...item, customPackName: to }
            : item,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename pack");
      try {
        await refresh();
      } catch {
        /* keep optimistic */
      }
    } finally {
      setPackNamesBusy(false);
    }
  }

  function stopLoudnormPreview() {
    const el = loudnormPreviewAudioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    setLoudnormPreviewKey(null);
  }

  function togglePlay(item: AdminCompositionCoverItem) {
    stopLoudnormPreview();
    const track = compositionStripTrack(baseUrl, item);
    if (!track) {
      patchRow(item.key, { error: "Media URL unavailable" });
      return;
    }
    if (nowPlaying?.s3Key === track.s3Key) {
      toggleCurrent();
      return;
    }
    playTrack(track);
  }

  function toggleLoudnormPreview(item: AdminCompositionCoverItem) {
    if (loudnormPreviewKey === item.key) {
      stopLoudnormPreview();
      return;
    }
    const track = compositionStripTrack(baseUrl, item);
    if (!track?.url) {
      patchRow(item.key, { error: "Media URL unavailable" });
      return;
    }
    dismiss();
    const state = rows[item.key] ?? blankRowState(defaultModel, item);
    // Freeze the level of the file we’re about to load — catalog target can
    // change mid-apply while this element still plays the old quieter encode.
    loudnormPreviewFileLufsRef.current = committedFileLufs(item);
    let el = loudnormPreviewAudioRef.current;
    if (!el) {
      el = new Audio();
      el.preload = "auto";
      loudnormPreviewAudioRef.current = el;
      el.addEventListener("ended", () => setLoudnormPreviewKey(null));
    }
    el.pause();
    el.src = track.url;
    el.volume = loudnormPreviewElementVolume(
      item.loudnormSourceLufs,
      loudnormPreviewFileLufsRef.current,
      state.loudnormRestoreDraft,
    );
    setLoudnormPreviewKey(item.key);
    void el.play().catch(() => {
      setLoudnormPreviewKey(null);
      patchRow(item.key, { error: "Could not play loudnorm preview" });
    });
  }

  // Live-update preview gain as the restore fader moves (baseline stays frozen).
  useEffect(() => {
    if (!loudnormPreviewKey) return;
    const item = items.find((it) => it.key === loudnormPreviewKey);
    if (!item) return;
    const state = rows[loudnormPreviewKey] ?? blankRowState(defaultModel, item);
    const el = loudnormPreviewAudioRef.current;
    if (!el) return;
    el.volume = loudnormPreviewElementVolume(
      item.loudnormSourceLufs,
      loudnormPreviewFileLufsRef.current,
      state.loudnormRestoreDraft,
    );
  }, [loudnormPreviewKey, items, rows, defaultModel]);

  useEffect(() => {
    return () => {
      const el = loudnormPreviewAudioRef.current;
      if (el) {
        el.pause();
        el.removeAttribute("src");
      }
    };
  }, []);

  function isStripPlaying(item: AdminCompositionCoverItem): boolean {
    const key = `admin:composition-cover:${item.key}`;
    return nowPlaying?.s3Key === key && playingS3Key === key;
  }

  function addDraftTag(item: AdminCompositionCoverItem) {
    const state = rows[item.key] ?? blankRowState(defaultModel, item);
    const next = normalizeTag(state.tagDraft);
    if (!next) return;
    patchRow(item.key, { tagDraft: "" });
    if (item.tags.includes(next)) return;
    void persistTags(item, [...item.tags, next]);
  }

  async function generateSelected() {
    const queue = items.filter((it) => selected.has(it.key));
    if (queue.length === 0) return;
    bulkAbortRef.current = false;
    setBulkBusy(true);
    let ok = 0;
    let fail = 0;
    for (let i = 0; i < queue.length; i += 1) {
      if (bulkAbortRef.current) break;
      const item = queue[i]!;
      setBulkProgress(
        `Generating ${i + 1} of ${queue.length}: ${item.name}`,
      );
      const succeeded = await onGenerate(item, "fresh");
      if (succeeded) ok += 1;
      else fail += 1;
    }
    setBulkProgress(
      bulkAbortRef.current
        ? `Stopped — ${ok} generated, ${fail} failed.`
        : `Done — ${ok} generated, ${fail} failed.`,
    );
    setBulkBusy(false);
  }

  async function onPickCompositionFile(file: File | null) {
    if (!file || uploadBusy || bulkBusy) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".mp3") && !lower.endsWith(".wav")) {
      setError("Upload an .mp3 or .wav file.");
      return;
    }
    setUploadBusy(true);
    setUploadNote(`Uploading ${file.name}…`);
    setError(null);
    setImportError(null);
    try {
      const relativePath = `compositions/${file.name}`;
      const contentType =
        file.type ||
        (lower.endsWith(".wav") ? "audio/wav" : "audio/mpeg");
      const { uploads, skipped, reprocessed } = await createAdminSoundUploads({
        files: [
          {
            relativePath,
            contentType,
            size: file.size,
          },
        ],
        category: "compositions",
      });
      if (reprocessed.length > 0) {
        setUploadNote(
          `${file.name} was already in S3 — reprocessing. Refresh in a moment.`,
        );
        await refresh();
        return;
      }
      if (skipped.length > 0 && uploads.length === 0) {
        throw new Error(
          `“${file.name}” is already on S3 (same filename). Rename the file or pick another.`,
        );
      }
      const u = uploads[0];
      if (!u) throw new Error("Upload was not accepted.");
      setUploadNote(`Uploading ${file.name} to storage…`);
      await uploadAdminSoundToS3(u, file, undefined, (loaded) => {
        if (file.size > 0) {
          const pct = Math.min(100, Math.round((loaded / file.size) * 100));
          setUploadNote(`Uploading ${file.name}… ${pct}%`);
        }
      });
      setUploadNote(null);
      setImportPrompt({
        key: u.key,
        filename: file.name,
        initialName: titleFromFilename(file.name),
      });
    } catch (e) {
      setUploadNote(null);
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadBusy(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  function startReplaceFile(item: AdminCompositionCoverItem) {
    if (uploadBusy || bulkBusy) return;
    replaceTargetKeyRef.current = item.key;
    setError(null);
    replaceInputRef.current?.click();
  }

  async function reapplyStreamingEdits(item: AdminCompositionCoverItem) {
    if (!compositionStreamingEditsStale(item)) return;
    patchRow(item.key, {
      busy: true,
      error: null,
      statusNote: "Re-applying EQ/trim to streaming AAC…",
    });
    try {
      const hasTrim = compositionHasCatalogTrim(item);
      const hasEq = compositionHasCatalogEq(item);
      let streamingEditedAt: string | null = null;
      let eqBands = item.eqBands;
      if (hasTrim) {
        // Trim bake re-encodes from master and keeps catalog EQ bands.
        const result = await trimAdminSound({
          key: item.key,
          startSec: item.trimStartSec ?? 0,
          endSec: item.trimEndSec ?? null,
          fadeInSec: item.fadeInSec ?? 0,
          fadeOutSec: item.fadeOutSec ?? 0,
        });
        streamingEditedAt = result.streamingEditedAt;
      } else if (hasEq && item.eqBands?.length) {
        const result = await applyAdminSoundEq({
          key: item.key,
          bands: item.eqBands,
        });
        streamingEditedAt = result.streamingEditedAt;
        eqBands = result.bands;
      }
      const now = streamingEditedAt || new Date().toISOString();
      setItems((prev) =>
        prev.map((p) =>
          p.key === item.key
            ? { ...p, streamingEditedAt: now, eqBands, updatedAt: now }
            : p,
        ),
      );
      patchRow(item.key, {
        busy: false,
        statusNote: "Streaming edits re-applied.",
      });
    } catch (e) {
      patchRow(item.key, {
        busy: false,
        statusNote: null,
        error: e instanceof Error ? e.message : "Re-apply failed",
      });
    }
  }

  async function measureLoudnormOnly(item: AdminCompositionCoverItem) {
    patchRow(item.key, {
      busy: true,
      error: null,
      statusNote: "Measuring loudness (raw only — no file overwrite)…",
    });
    try {
      const saved = await measureAdminCompositionLoudnorm(item.key);
      setItems((prev) =>
        prev.map((p) => (p.key === saved.key ? { ...p, ...saved } : p)),
      );
      patchRow(item.key, {
        busy: false,
        loudnormRestoreDraft: saved.loudnormRestorePct,
        statusNote:
          saved.loudnormReductionDb != null && saved.loudnormReductionDb > 0.05
            ? `Measured — full loudnorm would cut −${saved.loudnormReductionDb.toFixed(1)} dB`
            : "Measured — already at or below −16 LUFS",
      });
    } catch (e) {
      patchRow(item.key, {
        busy: false,
        statusNote: null,
        error: e instanceof Error ? e.message : "Measure failed",
      });
    }
  }

  async function applyLoudnormRestore(item: AdminCompositionCoverItem) {
    const state = rows[item.key] ?? blankRowState(defaultModel, item);
    const restorePct = Math.min(
      100,
      Math.max(0, Math.round(state.loudnormRestoreDraft)),
    );
    const source = item.loudnormSourceLufs;
    const aimLufs =
      source != null
        ? loudnormDraftTargetLufs(source, restorePct)
        : LOUDNORM_FULL_TARGET_LUFS;
    // Stop simulated preview — after encode, Play uses the real file level.
    stopLoudnormPreview();
    dismiss();
    patchRow(item.key, {
      busy: true,
      error: null,
      statusNote:
        restorePct <= 0
          ? `Encoding to full −16 LUFS…`
          : `Encoding to ${aimLufs.toFixed(1)} LUFS (${restorePct}% toward original)…`,
    });
    try {
      const saved = await applyAdminCompositionLoudnormRestore({
        key: item.key,
        restorePct,
      });
      setItems((prev) =>
        prev.map((p) => (p.key === saved.key ? { ...p, ...saved } : p)),
      );
      const target =
        saved.loudnormTargetLufs ??
        (source != null
          ? loudnormDraftTargetLufs(source, saved.loudnormRestorePct)
          : aimLufs);
      patchRow(item.key, {
        loudnormRestoreDraft: saved.loudnormRestorePct,
        statusNote:
          saved.loudnormRestorePct <= 0
            ? `Re-encoding to ${target.toFixed(1)} LUFS (full −16)…`
            : `Re-encoding to ${target.toFixed(1)} LUFS (${saved.loudnormRestorePct}% original) — not cutting back to −16…`,
      });
      const done = await pollReplaceNormalize(item.key, {
        mode: "restore",
        aimLufs: target,
        restorePct: saved.loudnormRestorePct,
      });
      const finalLufs =
        done.loudnormOutputLufs ?? done.loudnormTargetLufs ?? target;
      const stale = compositionStreamingEditsStale(done);
      patchRow(item.key, {
        busy: false,
        loudnormRestoreDraft: done.loudnormRestorePct,
        statusNote:
          done.loudnormRestorePct <= 0
            ? `Done — file is at ${finalLufs.toFixed(1)} LUFS (full −16). Play to hear.`
            : `Done — loudness restored to ${finalLufs.toFixed(1)} LUFS (${done.loudnormRestorePct}% toward original${
                done.loudnormSourceLufs != null
                  ? ` ${done.loudnormSourceLufs.toFixed(1)}`
                  : ""
              }). Play to hear.${
                stale
                  ? " EQ/trim still saved but stale — re-apply if you want them."
                  : ""
              }`,
      });
    } catch (e) {
      patchRow(item.key, {
        busy: false,
        statusNote: null,
        error: e instanceof Error ? e.message : "Loudnorm restore failed",
      });
    }
  }

  async function pollReplaceNormalize(
    targetKey: string,
    opts?: {
      mode?: "replace" | "restore";
      aimLufs?: number;
      restorePct?: number;
    },
  ): Promise<AdminCompositionCoverItem> {
    const mode = opts?.mode ?? "replace";
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => window.setTimeout(r, 2500));
      const { items: list } = await listAdminCompositionCovers();
      const row = list.find((it) => it.key === targetKey);
      if (!row) continue;
      setItems((prev) =>
        prev.map((p) => (p.key === row.key ? { ...p, ...row } : p)),
      );
      const stage = row.processing?.stage;
      const detail = row.processing?.detail?.trim();
      if (stage === "failed") {
        throw new Error(
          row.processing?.error?.trim() ||
            (mode === "restore"
              ? "Loudness restore encode failed"
              : "Normalize failed after replace"),
        );
      }
      if (stage === "done") {
        if (mode === "replace") {
          const stale = compositionStreamingEditsStale(row);
          patchRow(targetKey, {
            statusNote: stale
              ? "Ready — EQ/trim still saved but stale; re-apply below if you want them."
              : detail
                ? `Ready — ${detail}`
                : "Ready — new mix is live. Play to hear it.",
          });
        }
        return row;
      }
      const aim =
        opts?.aimLufs != null ? `${opts.aimLufs.toFixed(1)} LUFS` : null;
      const pct =
        opts?.restorePct != null && opts.restorePct > 0
          ? `${opts.restorePct}% original`
          : null;
      const restoreHint = [aim, pct].filter(Boolean).join(", ");
      const label =
        mode === "restore"
          ? stage === "uploading"
            ? "Restore — waiting…"
            : stage === "downloading"
              ? `Restore — downloading raw${restoreHint ? ` → ${restoreHint}` : ""}…`
              : stage === "normalizing"
                ? `Restore — encoding to ${restoreHint || "fader level"}…`
                : stage === "encoding"
                  ? `Restore — writing AAC at ${aim || "fader level"}…`
                  : stage === "storing"
                    ? `Restore — uploading ${aim || "restored"} file…`
                    : `Restore in progress${restoreHint ? ` (${restoreHint})` : ""}…`
          : stage === "uploading"
            ? "Waiting for upload…"
            : stage === "downloading"
              ? "Normalizing — downloading…"
              : stage === "normalizing"
                ? "Normalizing loudness…"
                : stage === "encoding"
                  ? "Encoding AAC…"
                  : stage === "storing"
                    ? "Storing files…"
                    : "Normalizing…";
      // Prefer restore-specific copy over raw pipeline detail (avoids “normalising”).
      patchRow(targetKey, {
        statusNote:
          mode === "restore"
            ? label
            : detail
              ? `${label} ${detail}`
              : label,
      });
    }
    throw new Error(
      mode === "restore"
        ? "Loudness restore is still running — wait a minute and Play again."
        : "Normalize is still running — wait a minute and play again.",
    );
  }

  async function onReplaceCompositionFile(file: File | null) {
    const targetKey = replaceTargetKeyRef.current;
    replaceTargetKeyRef.current = null;
    if (!file || !targetKey || uploadBusy || bulkBusy) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".mp3") && !lower.endsWith(".wav")) {
      patchRow(targetKey, {
        error: "Replace with an .mp3 or .wav file.",
        statusNote: null,
      });
      return;
    }
    setUploadBusy(true);
    setError(null);
    patchRow(targetKey, {
      busy: true,
      error: null,
      statusNote: `Uploading ${file.name}…`,
    });
    try {
      const contentType =
        file.type ||
        (lower.endsWith(".wav") ? "audio/wav" : "audio/mpeg");
      const { uploads, replaced } = await createAdminSoundUploads({
        files: [
          {
            relativePath: `compositions/${file.name}`,
            contentType,
            size: file.size,
          },
        ],
        category: "compositions",
        replaceKey: targetKey,
      });
      if (!replaced) {
        throw new Error(
          "Server ignored replace (API not updated). Deploy backend, then try again.",
        );
      }
      const u = uploads[0];
      if (!u) throw new Error("Replace upload was not accepted.");
      await uploadAdminSoundToS3(u, file, undefined, (loaded) => {
        if (file.size > 0) {
          const pct = Math.min(100, Math.round((loaded / file.size) * 100));
          patchRow(targetKey, { statusNote: `Uploading ${file.name}… ${pct}%` });
        }
      });
      patchRow(targetKey, {
        statusNote: "Upload complete — waiting for normalize…",
      });
      await pollReplaceNormalize(targetKey);
      patchRow(targetKey, { busy: false });
    } catch (e) {
      patchRow(targetKey, {
        busy: false,
        statusNote: null,
        error: e instanceof Error ? e.message : "Replace failed",
      });
    } finally {
      setUploadBusy(false);
      if (replaceInputRef.current) replaceInputRef.current.value = "";
    }
  }

  async function saveImportDetails(draft: CompositionImportDraft) {
    if (!importPrompt) return;
    setImportSaving(true);
    setImportError(null);
    try {
      let binauralHz: number | null;
      try {
        binauralHz = parseBinauralHzDraft(draft.binauralHz);
      } catch (e) {
        throw e instanceof Error ? e : new Error("Invalid Hz");
      }
      const saved = await updateAdminCompositionCoverMeta({
        key: importPrompt.key,
        name: draft.name,
        composer: draft.composer,
        customPackName: draft.customPackName,
        binauralHz,
      });
      const withTags =
        draft.tags.length > 0
          ? await setAdminCompositionCoverTags({
              key: importPrompt.key,
              tags: draft.tags,
              title: draft.name,
            })
          : saved;
      setItems((prev) => {
        const exists = prev.some((p) => p.key === withTags.key);
        if (exists) {
          return prev.map((p) =>
            p.key === withTags.key ? { ...p, ...withTags } : p,
          );
        }
        return [...prev, withTags].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
      });
      setRows((prev) => ({
        ...prev,
        [withTags.key]: blankRowState(defaultModel, withTags),
      }));
      setImportPrompt(null);
      await refresh();
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Could not save details");
    } finally {
      setImportSaving(false);
    }
  }

  async function skipImportDetails() {
    setImportPrompt(null);
    setImportError(null);
    await refresh();
  }

  async function generateMissingThumbs() {
    if (counts.missingThumb === 0 || thumbBusy || bulkBusy) return;
    setThumbBusy(true);
    setBulkProgress(
      `Building thumbnails for ${counts.missingThumb} cover${
        counts.missingThumb === 1 ? "" : "s"
      }…`,
    );
    try {
      const result = await ensureAdminCompositionCoverThumbs();
      if (result.items.length > 0) {
        const byKey = new Map(result.items.map((it) => [it.key, it]));
        setItems((prev) =>
          prev.map((p) => {
            const u = byKey.get(p.key);
            return u ? { ...p, ...u } : p;
          }),
        );
      }
      setBulkProgress(
        result.fail > 0
          ? `Thumbnails: ${result.ok} ok, ${result.fail} failed${
              result.errors[0] ? ` (${result.errors[0].error})` : ""
            }.`
          : result.ok === 0
            ? "No covers needed thumbnails."
            : `Thumbnails ready for ${result.ok} cover${
                result.ok === 1 ? "" : "s"
              }.`,
      );
    } catch (e) {
      setBulkProgress(
        e instanceof Error ? e.message : "Thumbnail backfill failed",
      );
    } finally {
      setThumbBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <CompositionImportModal
        open={Boolean(importPrompt)}
        filename={importPrompt?.filename ?? ""}
        initialName={importPrompt?.initialName ?? ""}
        packNames={packNames}
        tagTypes={tagTypes}
        saving={importSaving}
        error={importError}
        onSave={(draft) => void saveImportDetails(draft)}
        onSkip={() => void skipImportDetails()}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          void onPickCompositionFile(file);
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          void onReplaceCompositionFile(file);
        }}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
            Compositions
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Upload one composition at a time, then set name, composer, pack, and
            tags. Edit covers and metadata below; play a row while tagging.
          </p>
          <p className="mt-1 text-xs text-muted">
            {counts.total} total · {counts.missing} missing · {counts.withCover}{" "}
            with cover
            {counts.missingThumb > 0
              ? ` · ${counts.missingThumb} missing thumb`
              : ""}
          </p>
          {uploadNote ? (
            <p className="mt-1 text-xs font-medium text-accent-link">
              {uploadNote}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            disabled={uploadBusy || loading || bulkBusy}
            onClick={() => uploadInputRef.current?.click()}
            className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-2 text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploadBusy ? "Uploading…" : "Upload composition"}
          </button>
          <button
            type="button"
            disabled={
              counts.missingThumb === 0 || loading || bulkBusy || thumbBusy
            }
            onClick={() => void generateMissingThumbs()}
            className="cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-card disabled:opacity-50"
          >
            {thumbBusy
              ? "Building thumbnails…"
              : counts.missingThumb > 0
                ? `Generate missing thumbnails (${counts.missingThumb})`
                : "Thumbnails up to date"}
          </button>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Default model
            <select
              value={defaultModel}
              onChange={(e) => {
                const m = e.target.value as AdminImageModel;
                setDefaultModel(m);
                setRows((prev) => {
                  const next = { ...prev };
                  for (const key of Object.keys(next)) {
                    if (!next[key]?.busy) {
                      next[key] = { ...next[key]!, model: m };
                    }
                  }
                  return next;
                });
              }}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50"
            >
              {ADMIN_IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Custom pack names
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Customer-facing pack labels such as World or Solemn — not S3
              folder names. Define them here, then assign one per track below.
              They appear as filter chips in the soundscape picker. Rename
              (✎) rewrites the label on every assigned track so associations
              stay intact.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newPackName}
              disabled={packNamesBusy || loading}
              onChange={(e) => setNewPackName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPackName();
                }
              }}
              placeholder="New pack name…"
              className="h-9 w-44 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent/50 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={packNamesBusy || loading || !newPackName.trim()}
              onClick={addPackName}
              className="cursor-pointer rounded-xl border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-50"
            >
              Add pack
            </button>
          </div>
        </div>
        {packNames.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No custom pack names yet.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {packNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-0.5 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-[12px] text-foreground"
              >
                {name}
                <button
                  type="button"
                  disabled={packNamesBusy}
                  aria-label={`Rename pack ${name}`}
                  title="Rename (keeps track assignments)"
                  onClick={() => void renamePackName(name)}
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-50"
                >
                  ✎
                </button>
                <button
                  type="button"
                  disabled={packNamesBusy}
                  aria-label={`Remove pack ${name}`}
                  onClick={() => removePackName(name)}
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-50"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Tag types</h2>
            <p className="mt-0.5 text-xs text-muted">
              Group catalog tags so covers reuse the same vocabulary. Assign
              existing tags into a type, or add new ones here first.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newTypeLabel}
              disabled={tagTypesBusy || loading}
              onChange={(e) => setNewTypeLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTagType();
                }
              }}
              placeholder="New type name…"
              className="h-9 w-44 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent/50 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={tagTypesBusy || loading || !newTypeLabel.trim()}
              onClick={addTagType}
              className="cursor-pointer rounded-xl border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-background disabled:opacity-50"
            >
              Add type
            </button>
          </div>
        </div>
        {tagTypes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No tag types yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {tagTypes.map((type) => {
              const draft = typeTagDrafts[type.id] ?? "";
              const assignable = [
                ...new Set([...untypedUsedTags, ...usedTags]),
              ]
                .filter((t) => !type.tags.includes(t))
                .filter((t) => {
                  const q = normalizeTag(draft);
                  return !q || t.includes(q);
                })
                .slice(0, 24);
              return (
                <li
                  key={type.id}
                  className="rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      defaultValue={type.label}
                      disabled={tagTypesBusy}
                      onBlur={(e) => {
                        if (e.target.value.trim() !== type.label) {
                          renameTagType(type.id, e.target.value);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="h-8 min-w-[8rem] flex-1 rounded-lg border border-border bg-card px-2.5 text-sm font-semibold text-foreground outline-none focus:border-accent/50 disabled:opacity-50 sm:max-w-xs"
                      aria-label="Tag type name"
                    />
                    <button
                      type="button"
                      disabled={tagTypesBusy}
                      onClick={() => removeTagType(type.id)}
                      className="cursor-pointer rounded-lg border border-border px-2.5 py-1 text-xs text-danger hover:bg-danger-soft disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {type.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-[12px] text-foreground"
                      >
                        {tag}
                        <button
                          type="button"
                          disabled={tagTypesBusy}
                          aria-label={`Remove ${tag} from ${type.label}`}
                          onClick={() => removeTagFromType(type.id, tag)}
                          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-50"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      value={draft}
                      disabled={tagTypesBusy}
                      onChange={(e) =>
                        setTypeTagDrafts((prev) => ({
                          ...prev,
                          [type.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          const next = normalizeTag(draft);
                          if (!next) return;
                          setTypeTagDrafts((prev) => ({
                            ...prev,
                            [type.id]: "",
                          }));
                          assignTagToType(type.id, next);
                        }
                      }}
                      placeholder="Add tag to type…"
                      className="h-7 min-w-[9rem] flex-1 rounded-lg border border-border bg-card px-2 text-sm outline-none focus:border-accent/50 disabled:opacity-50"
                    />
                  </div>
                  {assignable.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="w-full text-[10px] text-muted">
                        Click to assign
                      </span>
                      {assignable.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          disabled={tagTypesBusy}
                          onClick={() => assignTagToType(type.id, tag)}
                          className="cursor-pointer rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-foreground disabled:opacity-50"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {untypedUsedTags.length > 0 ? (
          <p className="mt-3 text-[11px] text-muted">
            Untyped used tags: {untypedUsedTags.join(", ")}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title…"
          className="h-10 min-w-[14rem] flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent/50"
        />
        <div
          className="inline-flex overflow-hidden rounded-xl border border-border"
          role="group"
          aria-label="Cover filter"
        >
          {(
            [
              ["all", "All"],
              ["missing", "No cover"],
              ["has", "Has cover"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCoverFilter(id)}
              className={`cursor-pointer px-3 py-2 text-sm ${
                coverFilter === id
                  ? "bg-accent-soft/70 font-semibold text-foreground"
                  : "bg-background text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={loading || bulkBusy || thumbBusy}
          onClick={() => void refresh()}
          className="cursor-pointer rounded-xl border border-border px-3 py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
        <button
          type="button"
          disabled={filtered.length === 0 || bulkBusy || thumbBusy}
          onClick={() => {
            if (allFilteredSelected) clearSelection();
            else selectAllFiltered();
          }}
          className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50"
        >
          {allFilteredSelected ? "Deselect all" : "Select all"}
        </button>
        <button
          type="button"
          disabled={counts.missing === 0 || bulkBusy || thumbBusy}
          onClick={selectMissing}
          className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50"
        >
          Select ungenerated
        </button>
        <button
          type="button"
          disabled={
            filtered.every((it) => hasCover(it)) || bulkBusy || thumbBusy
          }
          onClick={selectMissingInView}
          className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted hover:text-foreground disabled:opacity-50"
        >
          Select ungenerated in view
        </button>
        <button
          type="button"
          disabled={selected.size === 0 || bulkBusy || thumbBusy}
          onClick={clearSelection}
          className="cursor-pointer rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
        >
          Clear selection
        </button>
        <span className="text-xs text-muted">
          {selected.size} selected
          {selectedInView !== selected.size
            ? ` (${selectedInView} in view)`
            : ""}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {bulkBusy ? (
            <button
              type="button"
              onClick={() => {
                bulkAbortRef.current = true;
              }}
              className="cursor-pointer rounded-xl border border-border px-3 py-1.5 text-sm text-danger hover:bg-danger-soft"
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            disabled={
              selected.size === 0 || bulkBusy || thumbBusy || loading
            }
            onClick={() => void generateSelected()}
            className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {bulkBusy
              ? "Generating…"
              : `Generate selected${selected.size ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>

      {bulkProgress ? (
        <p className="text-sm text-muted" role="status" aria-live="polite">
          {bulkProgress}
        </p>
      ) : null}

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading compositions…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">
          {items.length === 0
            ? "No soundscapes found in the customer picker (categorised compositions)."
            : "No compositions match that filter."}
        </p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const state = rows[item.key] ?? blankRowState(defaultModel, item);
            const covered = hasCover(item);
            const isSelected = selected.has(item.key);
            const isPlaying = isStripPlaying(item);
            const tagDraftNorm = normalizeTag(state.tagDraft);
            const onItemTags = new Set(item.tags);
            const suggestionPool = [
              ...new Set([
                ...usedTags,
                ...tagTypes.flatMap((t) => t.tags),
              ]),
            ];
            const tagSuggestions = suggestionPool.filter((tag) => {
              if (onItemTags.has(tag)) return false;
              if (!tagDraftNorm) return true;
              return tag.includes(tagDraftNorm);
            });
            const missingTypes = missingTagTypesForItem(item, tagTypes);
            return (
              <li
                key={item.key}
                className={`rounded-2xl border bg-card p-4 shadow-sm ${
                  isSelected ? "border-accent" : "border-border"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <label className="flex shrink-0 cursor-pointer items-start pt-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={bulkBusy || state.busy}
                      onChange={() => toggleSelected(item.key)}
                      className="mt-1 size-4 cursor-pointer accent-[var(--accent-button)]"
                      aria-label={`Select ${item.name}`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => togglePlay(item)}
                    aria-label={
                      isPlaying ? `Pause ${item.name}` : `Play ${item.name}`
                    }
                    className="relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-xl bg-border/40"
                  >
                    {item.coverImageThumbUrl || item.coverImageUrl ? (
                      <img
                        src={
                          item.coverImageThumbUrl || item.coverImageUrl || ""
                        }
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-muted">
                        No image
                      </div>
                    )}
                    <span
                      className={`absolute inset-0 flex items-center justify-center ${
                        isPlaying
                          ? "bg-black/45 text-on-accent"
                          : "bg-black/35 text-white"
                      }`}
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55">
                        {isPlaying ? <IconPause /> : <IconPlay />}
                      </span>
                    </span>
                  </button>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            covered
                              ? "bg-accent-soft/60 text-accent-link"
                              : "bg-surface-2 text-muted"
                          }`}
                        >
                          {covered ? "Has cover" : "No cover"}
                        </span>
                        {needsThumb(item) ? (
                          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                            No thumb
                          </span>
                        ) : null}
                        {missingTypes.map((type) => (
                          <span
                            key={type.id}
                            title={`No ${type.label} tag`}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200"
                          >
                            <IconWarningArrow />
                            {type.label}
                          </span>
                        ))}
                        <button
                          type="button"
                          disabled={state.busy || bulkBusy}
                          onClick={() =>
                            void persistMeta(item, {
                              adminFavourite: !item.adminFavourite,
                            })
                          }
                          aria-label={
                            item.adminFavourite
                              ? "Remove from favourites"
                              : "Mark as favourite"
                          }
                          title="Favourite — shown as Our Picks on the customer picker"
                          className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border text-sm disabled:opacity-50 ${
                            item.adminFavourite
                              ? "border-accent bg-accent-soft/60 text-accent-link"
                              : "border-border bg-background text-muted hover:text-foreground"
                          }`}
                        >
                          {item.adminFavourite ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePlay(item)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-semibold text-foreground hover:bg-card"
                        >
                          {isPlaying ? <IconPause size={12} /> : <IconPlay size={12} />}
                          {isPlaying ? "Pause" : "Play"}
                        </button>
                        <button
                          type="button"
                          disabled={state.busy || bulkBusy || uploadBusy}
                          onClick={() => startReplaceFile(item)}
                          title="Upload a new mix for this composition (keeps name, tags, cover). EQ/trim stay saved but become stale until re-applied."
                          className="inline-flex cursor-pointer items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-semibold text-foreground hover:bg-card disabled:opacity-50"
                        >
                          Replace file
                        </button>
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted">
                        {item.key}
                      </p>
                      {compositionStreamingEditsStale(item) ? (
                        <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
                          <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">
                            Streaming edits stale
                          </p>
                          <p className="mt-0.5 text-[11px] text-amber-900/80 dark:text-amber-100/80">
                            {compositionPendingEditsSummary(item)} — not in the
                            current AAC (after replace or loudnorm). Not applied
                            automatically.
                          </p>
                          <button
                            type="button"
                            disabled={state.busy || bulkBusy || uploadBusy}
                            onClick={() => void reapplyStreamingEdits(item)}
                            className="mt-2 cursor-pointer rounded-xl accent-fill-gradient px-3 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-50"
                          >
                            {state.busy &&
                            state.statusNote?.includes("Re-applying")
                              ? "Re-applying…"
                              : "Re-apply to streaming AAC"}
                          </button>
                        </div>
                      ) : null}
                      {state.statusNote ? (
                        <p
                          className="mt-1 text-xs font-medium text-accent-link"
                          role="status"
                          aria-live="polite"
                        >
                          {state.statusNote}
                        </p>
                      ) : null}
                      {item.loudnormSourceLufs != null &&
                      (item.loudnormReductionDb ?? 0) > 0.05 ? (
                        <div className="mt-3 rounded-xl border border-border bg-background/60 px-3 py-2.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-xs font-semibold text-foreground">
                              Loudness
                            </p>
                            <p className="text-[11px] text-muted">
                              Original{" "}
                              {item.loudnormSourceLufs.toFixed(1)} LUFS · file
                              now{" "}
                              {committedFileLufs(item).toFixed(1)} LUFS
                              {(item.loudnormRestorePct ?? 0) > 0
                                ? ` (${item.loudnormRestorePct}% restored)`
                                : " (full −16)"}
                            </p>
                          </div>
                          <label className="mt-2 flex flex-col gap-1 text-[11px] text-muted">
                            Target level (
                            {Math.round(state.loudnormRestoreDraft)}% toward
                            original)
                            <input
                              type="range"
                              min={0}
                              max={100}
                              step={1}
                              disabled={state.busy || bulkBusy || uploadBusy}
                              value={state.loudnormRestoreDraft}
                              onChange={(e) =>
                                patchRow(item.key, {
                                  loudnormRestoreDraft: Number(e.target.value),
                                })
                              }
                              className="w-full accent-[var(--accent-button)] disabled:opacity-50"
                            />
                            <span className="flex justify-between text-[10px]">
                              <span>Full −16 (quieter)</span>
                              <span>
                                Aim{" "}
                                {loudnormDraftTargetLufs(
                                  item.loudnormSourceLufs,
                                  state.loudnormRestoreDraft,
                                ).toFixed(1)}{" "}
                                LUFS
                              </span>
                              <span>
                                Original {item.loudnormSourceLufs.toFixed(1)}
                              </span>
                            </span>
                          </label>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              disabled={state.busy || bulkBusy || uploadBusy}
                              onClick={() => toggleLoudnormPreview(item)}
                              title="Browser-only volume simulation of the fader (does not change the file). Stop and use Play after Apply to hear the real encode."
                              className="inline-flex cursor-pointer items-center gap-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-background disabled:opacity-50"
                            >
                              {loudnormPreviewKey === item.key ? (
                                <IconPause size={12} />
                              ) : (
                                <IconPlay size={12} />
                              )}
                              {loudnormPreviewKey === item.key
                                ? "Stop preview"
                                : "Preview fader"}
                            </button>
                            <button
                              type="button"
                              disabled={
                                state.busy ||
                                bulkBusy ||
                                uploadBusy ||
                                state.loudnormRestoreDraft ===
                                  (item.loudnormRestorePct ?? 0)
                              }
                              onClick={() => void applyLoudnormRestore(item)}
                              className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-1.5 text-xs font-semibold text-on-accent disabled:opacity-50"
                            >
                              {state.busy &&
                              state.statusNote?.toLowerCase().includes("restore")
                                ? "Encoding…"
                                : `Apply ${loudnormDraftTargetLufs(
                                    item.loudnormSourceLufs,
                                    state.loudnormRestoreDraft,
                                  ).toFixed(1)} LUFS`}
                            </button>
                          </div>
                          <p className="mt-1.5 text-[10px] text-muted">
                            Apply always re-runs from the original raw: 0% =
                            full −16 loudnorm, mid = same loudnorm with a milder
                            target, 100% = passthrough (no loudnorm). Preview is
                            a temporary volume guess — use Play after Apply.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <p className="text-[10px] text-muted">
                            No loudnorm measurement yet (needs raw in S3).
                          </p>
                          <button
                            type="button"
                            disabled={state.busy || bulkBusy || uploadBusy}
                            onClick={() => void measureLoudnormOnly(item)}
                            className="cursor-pointer rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-background disabled:opacity-50"
                          >
                            Measure loudnorm
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-muted">
                        Title
                        <input
                          type="text"
                          value={state.nameDraft}
                          disabled={state.busy || bulkBusy}
                          onChange={(e) =>
                            patchRow(item.key, { nameDraft: e.target.value })
                          }
                          onBlur={() => void persistMeta(item)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="h-9 rounded-xl border border-border bg-background px-3 font-display text-sm font-medium text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                        />
                      </label>
                      <label className="flex w-28 flex-col gap-1 text-xs text-muted">
                        Binaural Hz
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0.1}
                          max={1000}
                          step="any"
                          placeholder="e.g. 7.83"
                          value={state.binauralHzDraft}
                          disabled={state.busy || bulkBusy}
                          onChange={(e) =>
                            patchRow(item.key, {
                              binauralHzDraft: e.target.value,
                            })
                          }
                          onBlur={() => void persistMeta(item)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          className="h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                        />
                      </label>
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-muted">
                        Custom pack
                        <select
                          value={item.customPackName ?? ""}
                          disabled={
                            state.busy || bulkBusy || packNames.length === 0
                          }
                          onChange={(e) =>
                            void persistMeta(item, {
                              customPackName: e.target.value || null,
                            })
                          }
                          className="h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                        >
                          <option value="">
                            {packNames.length === 0
                              ? "Define packs above…"
                              : "No pack"}
                          </option>
                          {packNames.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                          {item.customPackName &&
                          !packNames.includes(item.customPackName) ? (
                            <option value={item.customPackName}>
                              {item.customPackName} (legacy)
                            </option>
                          ) : null}
                        </select>
                      </label>
                      <label className="flex min-w-[11rem] flex-1 flex-col gap-1 text-xs text-muted">
                        Composer
                        <select
                          value={item.composer}
                          disabled={state.busy || bulkBusy}
                          onChange={(e) =>
                            void persistMeta(item, {
                              composer: e.target.value as CompositionComposer,
                            })
                          }
                          className="h-9 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                        >
                          {COMPOSITION_COMPOSERS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      Tags
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-[12px] text-foreground"
                          >
                            {tag}
                            <button
                              type="button"
                              disabled={state.busy || bulkBusy}
                              aria-label={`Remove tag ${tag}`}
                              onClick={() =>
                                void persistTags(
                                  item,
                                  item.tags.filter((t) => t !== tag),
                                )
                              }
                              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted hover:text-foreground disabled:opacity-50"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={state.tagDraft}
                          disabled={state.busy || bulkBusy || item.tags.length >= 24}
                          onChange={(e) =>
                            patchRow(item.key, { tagDraft: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") {
                              e.preventDefault();
                              addDraftTag(item);
                            }
                          }}
                          onBlur={() => addDraftTag(item)}
                          placeholder={
                            item.tags.length >= 24
                              ? "Tag limit reached"
                              : "Add tag…"
                          }
                          className="h-8 min-w-[8rem] flex-1 rounded-xl border border-border bg-background px-2.5 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                        />
                      </div>
                      {tagSuggestions.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-[10px] text-muted">
                            {tagDraftNorm
                              ? "Matching tags — click to add"
                              : "Tags by type — click to add"}
                          </span>
                          {tagTypes.map((type) => {
                            const typed = tagSuggestions.filter((t) =>
                              type.tags.includes(t),
                            );
                            if (typed.length === 0) return null;
                            return (
                              <div key={type.id} className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                                  {type.label}
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {typed.map((tag) => (
                                    <button
                                      key={tag}
                                      type="button"
                                      disabled={
                                        state.busy ||
                                        bulkBusy ||
                                        item.tags.length >= 24
                                      }
                                      onClick={() =>
                                        void persistTags(item, [
                                          ...item.tags,
                                          tag,
                                        ])
                                      }
                                      className="cursor-pointer rounded-full border border-dashed border-border bg-background px-2 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-foreground disabled:opacity-50"
                                    >
                                      {tag}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                          {(() => {
                            const other = tagSuggestions.filter(
                              (t) => !typedTagSet.has(t),
                            );
                            if (other.length === 0) return null;
                            return (
                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                                  Other
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {other.map((tag) => (
                                    <button
                                      key={tag}
                                      type="button"
                                      disabled={
                                        state.busy ||
                                        bulkBusy ||
                                        item.tags.length >= 24
                                      }
                                      onClick={() =>
                                        void persistTags(item, [
                                          ...item.tags,
                                          tag,
                                        ])
                                      }
                                      className="cursor-pointer rounded-full border border-dashed border-border bg-background px-2 py-0.5 text-[11px] text-muted hover:border-accent/40 hover:text-foreground disabled:opacity-50"
                                    >
                                      {tag}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                      <span className="text-[10px] text-muted">
                        Lowercase, Enter or comma to add · compositions only
                      </span>
                    </label>
                    <label className="flex max-w-xs flex-col gap-1 text-xs text-muted">
                      Model
                      <select
                        value={state.model}
                        disabled={state.busy || bulkBusy}
                        onChange={(e) =>
                          patchRow(item.key, {
                            model: e.target.value as AdminImageModel,
                          })
                        }
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                      >
                        {ADMIN_IMAGE_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {covered &&
                    (item.coverImageUrl || item.coverImageThumbUrl) ? (
                      <div className="rounded-xl border border-border bg-background/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={state.busy || bulkBusy}
                            onClick={() =>
                              patchRow(item.key, {
                                cropOpen: !state.cropOpen,
                                coverWideCropYDraft:
                                  state.coverWideCropYDraft ??
                                  item.coverWideCropY ??
                                  50,
                              })
                            }
                            className="cursor-pointer rounded-full border border-border bg-card px-3 py-1 text-[12px] font-semibold text-foreground disabled:opacity-50"
                          >
                            {state.cropOpen
                              ? "Hide widescreen crop"
                              : "Widescreen crop (Sound card)"}
                          </button>
                          {!state.cropOpen ? (
                            <span className="text-[11px] text-muted">
                              Focus {item.coverWideCropY ?? 50}% · 4:1 band
                            </span>
                          ) : null}
                        </div>
                        {state.cropOpen ? (
                          <div className="mt-3 space-y-2">
                            <CompositionCoverWideCropper
                              imageUrl={
                                item.coverImageUrl ||
                                item.coverImageThumbUrl ||
                                ""
                              }
                              value={state.coverWideCropYDraft}
                              disabled={state.busy || bulkBusy}
                              onChange={(y) =>
                                patchRow(item.key, {
                                  coverWideCropYDraft: y,
                                })
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={
                                  state.busy ||
                                  bulkBusy ||
                                  state.coverWideCropYDraft ===
                                    (item.coverWideCropY ?? 50)
                                }
                                onClick={() => {
                                  const draft =
                                    rowsRef.current[item.key]
                                      ?.coverWideCropYDraft ??
                                    state.coverWideCropYDraft;
                                  void persistMeta(item, {
                                    coverWideCropY: draft,
                                  });
                                }}
                                className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
                              >
                                Save crop
                              </button>
                              <button
                                type="button"
                                disabled={state.busy || bulkBusy}
                                onClick={() =>
                                  patchRow(item.key, {
                                    coverWideCropYDraft: 50,
                                  })
                                }
                                className="cursor-pointer rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground disabled:opacity-50"
                              >
                                Reset to centre
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <label className="flex flex-col gap-1 text-xs text-muted">
                      Guide prompt
                      <input
                        type="text"
                        value={state.guidePrompt}
                        disabled={state.busy || bulkBusy}
                        onChange={(e) =>
                          patchRow(item.key, {
                            guidePrompt: e.target.value,
                          })
                        }
                        placeholder="Optional — e.g. misty coastal cliffs at dusk…"
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                      />
                      <span className="text-[10px] text-muted">
                        {covered
                          ? "Used by Regen when what-to-change is empty, or always by Fresh idea"
                          : "Optional direction for the first cover (title alone is fine)"}
                      </span>
                    </label>
                    {covered ? (
                      <label className="flex flex-col gap-1 text-xs text-muted">
                        What to change
                        <input
                          type="text"
                          value={state.changeRequest}
                          disabled={state.busy || bulkBusy}
                          onChange={(e) =>
                            patchRow(item.key, {
                              changeRequest: e.target.value,
                            })
                          }
                          placeholder="e.g. warmer light, add a figure, less green…"
                          className="rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent/50 disabled:opacity-50"
                        />
                        <span className="text-[10px] text-muted">
                          If set, Regen rewrites from prior prompts + this note
                          {item.lastCoverPrompt ? " · has prior prompt" : ""}
                        </span>
                      </label>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {!covered ? (
                        <button
                          type="button"
                          disabled={state.busy || bulkBusy}
                          onClick={() => void onGenerate(item, "fresh")}
                          className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
                        >
                          {state.busy ? "Generating…" : "Generate"}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={state.busy || bulkBusy}
                            onClick={() => void onGenerate(item, "fresh")}
                            className="cursor-pointer rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                            title="Fresh generate from title + guide (ignores prior prompts and what-to-change)"
                          >
                            Fresh idea
                          </button>
                          <button
                            type="button"
                            disabled={state.busy || bulkBusy}
                            onClick={() => void onGenerate(item, "regen")}
                            className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
                            title={
                              state.changeRequest.trim()
                                ? "Rewrite from prior prompts + what to change"
                                : "Fresh from title + guide prompt"
                            }
                          >
                            {state.busy ? "Regenerating…" : "Regen"}
                          </button>
                          <button
                            type="button"
                            disabled={state.busy || bulkBusy}
                            onClick={() => void onClear(item)}
                            className="cursor-pointer rounded-xl border border-border px-3 py-1.5 text-sm text-danger hover:bg-danger-soft disabled:opacity-50"
                          >
                            Clear
                          </button>
                        </>
                      )}
                    </div>
                    {state.error ? (
                      <p className="text-sm text-danger">{state.error}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

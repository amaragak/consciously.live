import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLibraryPlayer } from "@/components/library-player-provider";
import type { LibraryActiveTrack } from "@/components/library-player-provider";
import {
  ADMIN_IMAGE_MODELS,
  backgroundAudioPlaybackKey,
  clearAdminCompositionCover,
  ensureAdminCompositionCoverThumbs,
  generateAdminCompositionCover,
  getMedimadeMediaBaseUrl,
  listAdminCompositionCovers,
  saveAdminCompositionPackNames,
  saveAdminCompositionTagTypes,
  setAdminCompositionCoverTags,
  updateAdminCompositionCoverMeta,
  type AdminCompositionCoverItem,
  type AdminCompositionTagType,
  type AdminImageModel,
} from "@/lib/medimade-api";

type CoverFilter = "all" | "missing" | "has";

type RowState = {
  model: AdminImageModel;
  changeRequest: string;
  tagDraft: string;
  nameDraft: string;
  binauralHzDraft: string;
  busy: boolean;
  error: string | null;
};

function blankRowState(
  model: AdminImageModel = "gpt-image-1-mini",
  item?: Pick<AdminCompositionCoverItem, "name" | "binauralHz">,
): RowState {
  return {
    model,
    changeRequest: "",
    tagDraft: "",
    nameDraft: item?.name ?? "",
    binauralHzDraft:
      item?.binauralHz != null && Number.isFinite(item.binauralHz)
        ? String(item.binauralHz)
        : "",
    busy: false,
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

/** Cover present but no thumb — backfill without AI regen. */
function needsThumb(item: AdminCompositionCoverItem): boolean {
  return hasCover(item) && !hasThumb(item);
}

function mediaFileUrl(base: string, key: string): string {
  const b = base.replace(/\/$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${b}/${path}`;
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
    url: mediaFileUrl(root, playKey),
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
  const { playTrack, toggleCurrent, nowPlaying, playingS3Key } =
    useLibraryPlayer();
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [defaultModel, setDefaultModel] =
    useState<AdminImageModel>("gpt-image-1-mini");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);
  const bulkAbortRef = useRef(false);

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
    regen: boolean,
  ): Promise<boolean> {
    const state = rows[item.key] ?? blankRowState(defaultModel, item);
    const title = state.nameDraft.trim() || item.name;
    patchRow(item.key, { busy: true, error: null });
    try {
      const saved = await generateAdminCompositionCover({
        key: item.key,
        title,
        model: state.model,
        changeRequest: regen ? state.changeRequest : "",
      });
      setItems((prev) =>
        prev.map((p) => (p.key === saved.key ? { ...p, ...saved } : p)),
      );
      patchRow(item.key, {
        busy: false,
        nameDraft: saved.name,
        binauralHzDraft: formatBinauralHzDraft(saved.binauralHz),
        ...(regen ? { changeRequest: "" } : {}),
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
      adminFavourite?: boolean;
    },
  ) {
    const state = rows[item.key] ?? blankRowState(defaultModel, item);
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
    const adminFavourite =
      overrides && "adminFavourite" in overrides
        ? Boolean(overrides.adminFavourite)
        : item.adminFavourite;
    if (
      name === item.name &&
      binauralHz === (item.binauralHz ?? null) &&
      customPackName === (item.customPackName ?? null) &&
      adminFavourite === item.adminFavourite &&
      !overrides
    ) {
      patchRow(item.key, {
        nameDraft: item.name,
        binauralHzDraft: formatBinauralHzDraft(item.binauralHz),
        error: null,
      });
      return;
    }
    patchRow(item.key, { busy: true, error: null });
    try {
      const saved = await updateAdminCompositionCoverMeta({
        key: item.key,
        name,
        binauralHz,
        customPackName,
        adminFavourite,
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
        error: e instanceof Error ? e.message : "Could not save",
      });
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

  function togglePlay(item: AdminCompositionCoverItem) {
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
      const succeeded = await onGenerate(item, false);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-foreground">
            Compositions
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Edit titles, binaural Hz, and tags; generate cover art (~1K full +
            list thumbnail). Select rows to generate in bulk, or one at a time.
            Thumbnail backfill only resizes existing covers — no AI regen. Play
            a row to hear it while tagging.
          </p>
          <p className="mt-1 text-xs text-muted">
            {counts.total} total · {counts.missing} missing · {counts.withCover}{" "}
            with cover
            {counts.missingThumb > 0
              ? ` · ${counts.missingThumb} missing thumb`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
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
              They appear as filter chips in the soundscape picker.
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
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-[12px] text-foreground"
              >
                {name}
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
                      </div>
                      <p className="mt-1 truncate text-[11px] text-muted">
                        {item.key}
                      </p>
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
                    {covered ? (
                      <label className="flex flex-col gap-1 text-xs text-muted">
                        What to change (regen)
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
                          Rewrites the next prompt from prior cover prompts + this note
                          {item.lastCoverPrompt ? " · has prior prompt" : ""}
                        </span>
                      </label>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      {!covered ? (
                        <button
                          type="button"
                          disabled={state.busy || bulkBusy}
                          onClick={() => void onGenerate(item, false)}
                          className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
                        >
                          {state.busy ? "Generating…" : "Generate"}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={state.busy || bulkBusy}
                            onClick={() => void onGenerate(item, true)}
                            className="cursor-pointer rounded-xl accent-fill-gradient px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
                          >
                            {state.busy ? "Regenerating…" : "Regen"}
                          </button>
                          <button
                            type="button"
                            disabled={state.busy || bulkBusy}
                            onClick={() => void onGenerate(item, false)}
                            className="cursor-pointer rounded-xl border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                            title="Fresh generate from title (ignores change note)"
                          >
                            Fresh from title
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

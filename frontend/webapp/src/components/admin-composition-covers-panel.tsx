import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ADMIN_IMAGE_MODELS,
  clearAdminCompositionCover,
  ensureAdminCompositionCoverThumbs,
  generateAdminCompositionCover,
  listAdminCompositionCovers,
  type AdminCompositionCoverItem,
  type AdminImageModel,
} from "@/lib/medimade-api";

type CoverFilter = "all" | "missing" | "has";

type RowState = {
  model: AdminImageModel;
  changeRequest: string;
  busy: boolean;
  error: string | null;
};

function blankRowState(model: AdminImageModel = "gpt-image-1-mini"): RowState {
  return {
    model,
    changeRequest: "",
    busy: false,
    error: null,
  };
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

export function AdminCompositionCoversPanel() {
  const [items, setItems] = useState<AdminCompositionCoverItem[]>([]);
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
      const { items: list } = await listAdminCompositionCovers();
      setItems(list);
      setRows((prev) => {
        const next: Record<string, RowState> = {};
        for (const it of list) {
          next[it.key] = prev[it.key] ?? blankRowState(defaultModel);
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
        it.name.toLowerCase().includes(q) || it.key.toLowerCase().includes(q)
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
    const state = rows[item.key] ?? blankRowState(defaultModel);
    patchRow(item.key, { busy: true, error: null });
    try {
      const saved = await generateAdminCompositionCover({
        key: item.key,
        title: item.name,
        model: state.model,
        changeRequest: regen ? state.changeRequest : "",
      });
      setItems((prev) =>
        prev.map((p) => (p.key === saved.key ? { ...p, ...saved } : p)),
      );
      patchRow(item.key, {
        busy: false,
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
            Composition covers
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Soundscape / composition cover art (~1K full + list thumbnail).
            Select rows to generate in bulk, or generate one at a time.
            Thumbnail backfill only resizes existing covers — no AI regen.
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
            const state = rows[item.key] ?? blankRowState(defaultModel);
            const covered = hasCover(item);
            const isSelected = selected.has(item.key);
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
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-border/40">
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
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-display text-lg font-medium tracking-tight text-foreground">
                          {item.name}
                        </h2>
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
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {item.key}
                      </p>
                    </div>
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

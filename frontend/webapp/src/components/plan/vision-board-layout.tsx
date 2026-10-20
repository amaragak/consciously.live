import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { LIGHT_ACCENT_BORDER } from "@/components/plan/manifesto-section";
import { VisionBoardAreas } from "@/components/plan/vision-board-areas";
import { subscribeVisionToast, type VisionToastNotice } from "@/lib/vision-image-jobs";
import type { VisionImageStyle } from "@/lib/ideate-vision-board";
import {
  boardVisionItems,
  visionItemHasImage,
  type VisionBoardItem,
  type VisionCrop,
  type VisionExtraReference,
} from "@/lib/ideate-vision-board";

export type VisionArea = { id: string; title: string; visionText: string };

const CHIP_ON =
  "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-foreground px-3.5 text-[13px] font-semibold text-background";
const CHIP_OFF =
  "inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground";
function srcOf(item: VisionBoardItem, urls: Record<string, string>): string | null {
  return (
    (typeof item.imageUrl === "string" && item.imageUrl.trim()) ||
    urls[item.id] ||
    null
  );
}

function draftScene(area: VisionArea, names: string[]): string {
  const vision = area.visionText.replace(/\s+/g, " ").trim();
  const sentence = vision
    ? vision.split(/(?<=[.!?])\s/)[0]!
    : `I am in a clear, present moment of my ${area.title} life.`;
  const body = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  const lead = /^i\b/i.test(body) ? body : `I am there. ${body}`;
  if (!names.length) return lead;
  return `${lead.replace(/[.!?]$/, "")}, with ${names.join(" and ")}.`;
}

export function VisionBoardLayout({
  items,
  imageStyle,
  onStyle,
  onDropImage,
  onMoveArea,
  onCaption,
  tileUrls,
  lifeAreas,
  hydrated,
  busy,
  error,
  scenePrompt,
  onScenePrompt,
  onGenerate,
  onUploadClick,
  onToggleFavourite,
  onPlace,
  onRemoveFromBoard,
  onAddToBoard,
  onFeature,
  onApplyCrop,
  onMeasure,
  onNewTake,
  onUseVersion,
  freshId,
  selfPreviewUrl,
  hasReference,
  extraRefs,
  extraPreviewUrls,
  onPickSelf,
  onClearSelf,
  onPickExtra,
  onClearExtra,
  onExtraDescription,
  selfFileName,
}: {
  items: VisionBoardItem[];
  imageStyle: VisionImageStyle;
  onStyle: (next: VisionImageStyle) => void;
  onDropImage: (itemId: string, areaId: string | null, index: number) => void;
  onMoveArea: (areaId: string, direction: -1 | 1) => void;
  onCaption: (item: VisionBoardItem, caption: string) => void;
  tileUrls: Record<string, string>;
  lifeAreas: VisionArea[];
  hydrated: boolean;
  busy: string | null;
  error: string | null;
  scenePrompt: string;
  onScenePrompt: (value: string) => void;
  onGenerate: (areaId: string | null) => void;
  onUploadClick: () => void;
  onToggleFavourite: (item: VisionBoardItem) => void;
  onPlace: (itemId: string, slot: number) => void;
  onRemoveFromBoard: (item: VisionBoardItem) => void;
  onAddToBoard: (item: VisionBoardItem) => void;
  onFeature: (item: VisionBoardItem) => void;
  onApplyCrop: (item: VisionBoardItem, crop: VisionCrop | null, featured: boolean) => void;
  onMeasure: (item: VisionBoardItem, width: number, height: number) => void;
  onNewTake: (item: VisionBoardItem) => Promise<{ versionId: string } | null>;
  onUseVersion: (item: VisionBoardItem, versionId: string) => void;
  freshId: string | null;
  selfPreviewUrl: string | null;
  hasReference: boolean;
  extraRefs: VisionExtraReference[];
  extraPreviewUrls: Record<string, string>;
  onPickSelf: () => void;
  onClearSelf: () => void;
  onPickExtra: () => void;
  onClearExtra: (id: string) => void;
  onExtraDescription: (id: string, value: string) => void;
  selfFileName: string | null;
}) {
  const images = items.filter(visionItemHasImage);
  const board = boardVisionItems(items);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [createArea, setCreateArea] = useState<string | null>(null);
  const [drafted, setDrafted] = useState(false);
  const [draftAreaName, setDraftAreaName] = useState("");
  const [search, setSearch] = useSearchParams();
  const launchedCreate = useRef(false);
  const [toast, setToast] = useState<VisionToastNotice | null>(null);
  const [take, setTake] = useState<{
    itemId: string;
    phase: "making" | "ready";
    versionId: string | null;
    selected: string;
  } | null>(null);

  useEffect(() => {
    if (search.get("refs") !== "1") return;
    setRefsOpen(true);
    const next = new URLSearchParams(search);
    next.delete("refs");
    setSearch(next, { replace: true });
  }, [search, setSearch]);

  useEffect(() => {
    let timer = 0;
    const unsubscribe = subscribeVisionToast((notice) => {
      setToast(notice);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), notice.onAction ? 8000 : 3200);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const openCreate = (area: VisionArea | null, prefill: boolean) => {
    setCreateArea(area?.id ?? null);
    if (prefill && area) {
      const names = [
        ...(hasReference ? ["you"] : []),
        ...extraRefs.map((ref) => ref.description.trim()).filter(Boolean),
      ];
      onScenePrompt(draftScene(area, names));
      setDrafted(true);
      setDraftAreaName(area.title);
    } else {
      setDrafted(false);
    }
    setCreateOpen(true);
  };

  useEffect(() => {
    if (launchedCreate.current || !hydrated) return;
    const id = search.get("createArea");
    if (!id) return;
    launchedCreate.current = true;
    const area = lifeAreas.find((row) => row.id === id) ?? null;
    openCreate(area, Boolean(area));
    const next = new URLSearchParams(search);
    next.delete("createArea");
    setSearch(next, { replace: true });
  }, [hydrated, lifeAreas, search, setSearch]);

  const startTake = async (item: VisionBoardItem) => {
    setTake({
      itemId: item.id,
      phase: "making",
      versionId: null,
      selected: "current",
    });
    const result = await onNewTake(item);
    if (!result) {
      setTake(null);
      return;
    }
    setTake({
      itemId: item.id,
      phase: "ready",
      versionId: result.versionId,
      selected: result.versionId,
    });
  };

  const resolvedUrls = Object.fromEntries(
    images.flatMap((item) => {
      const src = srcOf(item, tileUrls);
      return src ? [[item.id, src] as const] : [];
    }),
  );

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pb-10 sm:pt-6">
      {toast ? (
        <div
          role="status"
          className="fixed bottom-[calc(58px+env(safe-area-inset-bottom,0px)+76px)] left-1/2 z-40 flex -translate-x-1/2 items-center rounded-full bg-foreground px-4 py-2 text-sm text-background sm:bottom-24"
        >
          {toast.text}
          {toast.onAction ? (
            <button
              type="button"
              className="ml-2 cursor-pointer font-semibold underline"
              onClick={() => {
                toast.onAction?.();
                setToast(null);
              }}
            >
              {toast.actionLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      <VisionBoardAreas
        items={items}
        tileUrls={tileUrls}
        lifeAreas={lifeAreas}
        imageStyle={imageStyle}
        hydrated={hydrated}
        freshId={freshId}
        onStyle={onStyle}
        onUpload={onUploadClick}
        onCreate={() => openCreate(null, false)}
        onCreateForArea={(area) =>
          openCreate(
            { id: area.id, title: area.title, visionText: area.visionText ?? "" },
            true,
          )
        }
        onToggleFavourite={onToggleFavourite}
        onAdd={onAddToBoard}
        onRemove={onRemoveFromBoard}
        onDropImage={onDropImage}
        onMoveArea={onMoveArea}
        onApplyCrop={(item, crop) => onApplyCrop(item, crop, false)}
        onMeasure={onMeasure}
        onNewTake={(item) => void startTake(item)}
        onVersions={(item) => setVersionsFor(item.id)}
        onCaption={onCaption}
      />

      {createOpen ? (
        <Sheet title="Create an image" onClose={() => setCreateOpen(false)}>
          <label className="block text-[13px] font-semibold text-foreground">
            Describe the scene
          </label>
          <textarea
            value={scenePrompt}
            onChange={(e) => {
              onScenePrompt(e.target.value);
              setDrafted(false);
            }}
            rows={4}
            placeholder="e.g. Me sitting on a large pile of money in a sunny room"
            className={`mt-2 min-h-24 w-full rounded-xl border px-3.5 py-3 text-[15px] leading-normal outline-none ${
              drafted
                ? "border-accent bg-accent-soft"
                : "border-border bg-card"
            }`}
          />
          {drafted ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-accent-link">
              <Sparkles className="size-3.5" strokeWidth={1.8} />
              Drafted from your {draftAreaName} vision · edit freely
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-muted">
              Mention people or pets by their reference names.
            </p>
          )}
          <p className="mt-5 text-[13px] font-semibold text-foreground">Life area</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCreateArea(null)}
              className={createArea === null ? CHIP_ON : CHIP_OFF}
            >
              None
            </button>
            {lifeAreas.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => setCreateArea(area.id)}
                className={createArea === area.id ? CHIP_ON : CHIP_OFF}
              >
                {area.title}
              </button>
            ))}
          </div>
          <p className="mt-5 text-[13px] font-semibold text-foreground">References</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hasReference && selfPreviewUrl ? (
              <span className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card pr-3">
                <img src={selfPreviewUrl} alt="" className="size-8 rounded-full object-cover" />
                You
              </span>
            ) : null}
            {extraRefs.map((ref) => (
              <span
                key={ref.id}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card pr-3"
              >
                {extraPreviewUrls[ref.id] ? (
                  <img
                    src={extraPreviewUrls[ref.id]}
                    alt=""
                    className="size-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="size-8 rounded-full bg-accent-soft" />
                )}
                {ref.description.trim() || "Reference"}
              </span>
            ))}
            <button
              type="button"
              onClick={onPickExtra}
              className="inline-flex h-10 cursor-pointer items-center rounded-full border border-dashed border-border px-3 text-[13px] font-semibold text-accent-link"
            >
              + Person, pet or place
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRefsOpen(true)}
            className="mt-2 inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-accent-link"
          >
            Manage references
            <ChevronRight className="size-4" strokeWidth={1.8} />
          </button>
          {error ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-auto pt-6">
            <button
              type="button"
              disabled={
                busy !== null ||
                scenePrompt.trim().length < 3 ||
                !hasReference
              }
              onClick={() => onGenerate(createArea)}
              className="accent-fill-gradient inline-flex h-[46px] w-full cursor-pointer items-center justify-center rounded-full text-sm font-semibold text-on-accent disabled:opacity-40"
            >
              {busy === "gen" ? "Generating…" : "Generate"}
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              New images go to your library. Add them to your board from there.
            </p>
          </div>
        </Sheet>
      ) : null}

      {refsOpen
        ? createPortal(
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-[20px] bg-card p-6 sm:max-w-md sm:rounded-[20px]">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl">References</h2>
              <button type="button" aria-label="Close" onClick={() => setRefsOpen(false)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="mb-3 inline-flex rounded-xl bg-accent-soft p-[3px]" role="group" aria-label="Vision board images">
              {(["realistic", "illustrated"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => style !== imageStyle && onStyle(style)}
                  className={`h-8 cursor-pointer rounded-[9px] px-3.5 text-[13px] font-semibold ${
                    imageStyle === style ? "bg-card text-foreground shadow-sm" : "text-foreground/70"
                  }`}
                >
                  {style === "realistic" ? "Photorealistic" : "Illustrated"}
                </button>
              ))}
            </div>
            <p className="mb-3 text-xs text-muted">Don't like AI images of yourself? Use illustrations instead.</p>
            <p className="mt-3 text-sm font-semibold">You</p>
            {selfPreviewUrl ? (
              <img src={selfPreviewUrl} alt="" className="mt-2 h-40 w-full rounded-lg object-cover" />
            ) : (
              <p className="mt-2 text-sm text-muted">No photo yet. A clear, front-facing photo works best.</p>
            )}
            {selfFileName ? (
              <p className="mt-1 text-xs text-muted">{selfFileName}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={onPickSelf}
                className="accent-fill-gradient cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold text-on-accent"
              >
                {hasReference ? "Replace" : "Upload"}
              </button>
              {hasReference ? (
                <button
                  type="button"
                  onClick={onClearSelf}
                  className="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs text-muted"
                >
                  Remove
                </button>
              ) : null}
            </div>
            <p className="mt-5 text-sm font-semibold">Also in the scene</p>
            <ul className="mt-2 flex flex-col gap-3">
              {extraRefs.map((ref) => (
                <li key={ref.id}>
                  <div className="flex items-center gap-2">
                    {extraPreviewUrls[ref.id] ? (
                      <img src={extraPreviewUrls[ref.id]} alt="" className="size-12 rounded-md object-cover" />
                    ) : null}
                    <input
                      value={ref.description}
                      onChange={(e) => onExtraDescription(ref.id, e.target.value.slice(0, 280))}
                      placeholder="e.g. My mum"
                      className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-sm"
                    />
                    <button type="button" aria-label="Remove reference" onClick={() => onClearExtra(ref.id)}>
                      <X className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {extraRefs.length < 3 ? (
              <button
                type="button"
                onClick={onPickExtra}
                className="mt-3 cursor-pointer text-sm font-semibold text-accent-link"
              >
                + Add photo
              </button>
            ) : null}
          </div>
        </div>,
        document.body,
        )
        : null}

      {versionsFor ? (
        <VersionsDialog
          item={items.find((item) => item.id === versionsFor) ?? null}
          urls={tileUrls}
          onClose={() => setVersionsFor(null)}
          onUse={(versionId) => {
            const item = items.find((entry) => entry.id === versionsFor);
            if (!item) return;
            onUseVersion(item, versionId);
            setVersionsFor(null);
          }}
        />
      ) : null}

      {take ? (
        <NewTakeDialog
          item={items.find((item) => item.id === take.itemId) ?? null}
          urls={tileUrls}
          phase={take.phase}
          versionId={take.versionId}
          selected={take.selected}
          onSelect={(id) => setTake({ ...take, selected: id })}
          onClose={() => setTake(null)}
          onAnother={() => {
            const item = items.find((entry) => entry.id === take.itemId);
            if (item) void startTake(item);
          }}
          onUse={() => {
            const item = items.find((entry) => entry.id === take.itemId);
            if (item && take.selected !== "current") onUseVersion(item, take.selected);
            setTake(null);
          }}
          error={error}
        />
      ) : null}
    </div>
  );
}

function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[140] bg-black/40">
      <div className="absolute inset-x-0 bottom-0 top-12 flex flex-col gap-0 overflow-y-auto rounded-t-[20px] bg-background px-6 pb-6 pt-6 sm:inset-y-0 sm:left-auto sm:w-[440px] sm:rounded-none sm:px-[26px] sm:pb-[22px] sm:pt-[26px]">
        <div className="flex items-start justify-between gap-5">
          <h2 className="font-display text-2xl text-foreground">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="cursor-pointer">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-5 flex min-h-0 flex-1 flex-col gap-0">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

function VersionsDialog({
  item,
  urls,
  onClose,
  onUse,
}: {
  item: VisionBoardItem | null;
  urls: Record<string, string>;
  onClose: () => void;
  onUse: (versionId: string) => void;
}) {
  if (!item || typeof document === "undefined") return null;
  const current = srcOf(item, urls);
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-[700px] rounded-t-[20px] bg-card p-6 sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Versions</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-4 flex gap-4 overflow-x-auto">
          <figure className="w-[200px] shrink-0">
            {current ? (
              <img src={current} alt="" className="h-[140px] w-full rounded-xl object-cover" />
            ) : null}
            <figcaption className="mt-1 text-sm font-semibold">Current</figcaption>
          </figure>
          {[...(item.versions ?? [])].reverse().map((version) => {
            const src = version.imageUrl || urls[version.id];
            return (
              <button
                key={version.id}
                type="button"
                onClick={() => onUse(version.id)}
                className="w-[200px] shrink-0 cursor-pointer text-left"
              >
                {src ? (
                  <img src={src} alt="" className="h-[140px] w-full rounded-xl object-cover" />
                ) : (
                  <div className="h-[140px] rounded-xl bg-accent-soft" />
                )}
                <span className="mt-1 block text-sm font-semibold">Earlier version</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function NewTakeDialog({
  item,
  urls,
  phase,
  versionId,
  selected,
  onSelect,
  onClose,
  onAnother,
  onUse,
  error,
}: {
  item: VisionBoardItem | null;
  urls: Record<string, string>;
  phase: "making" | "ready";
  versionId: string | null;
  selected: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onAnother: () => void;
  onUse: () => void;
  error: string | null;
}) {
  if (!item || typeof document === "undefined") return null;
  const current = srcOf(item, urls);
  const made = versionId
    ? item.versions?.find((version) => version.id === versionId)
    : null;
  const madeSrc = made ? made.imageUrl || urls[made.id] || null : null;
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-[700px] rounded-t-[20px] bg-card p-6 sm:rounded-[20px]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">New take</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-2 text-[13px] text-foreground">
          Same scene and people, a fresh moment. Kept as a version; your board shows the one you pick.
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex gap-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => onSelect("current")}
            className={`w-[200px] shrink-0 text-left ${selected === "current" ? "rounded-xl ring-[3px] ring-accent" : ""}`}
          >
            {current ? (
              <img src={current} alt="" className="h-[140px] w-full rounded-xl object-cover" />
            ) : null}
            <span className="mt-1 block text-sm font-semibold">Current</span>
          </button>
          {phase === "making" ? (
            <div className={`flex h-[140px] w-[200px] shrink-0 flex-col items-center justify-center rounded-xl border bg-accent-soft ${LIGHT_ACCENT_BORDER}`}>
              <Sparkles className="size-4 animate-pulse text-accent-link" />
              <p className="mt-1 text-[13px] font-semibold text-accent-link">Making a new take…</p>
              <p className="text-xs text-muted">About 20 seconds</p>
            </div>
          ) : made ? (
            <button
              type="button"
              onClick={() => versionId && onSelect(versionId)}
              className={`w-[200px] shrink-0 text-left ${selected === versionId ? "rounded-xl ring-[3px] ring-accent" : ""}`}
            >
              {madeSrc ? (
                <img src={madeSrc} alt="" className="h-[140px] w-full rounded-xl object-cover" />
              ) : (
                <div className="h-[140px] rounded-xl bg-accent-soft" />
              )}
              <span className="mt-1 block text-sm font-semibold">New take · Just now</span>
            </button>
          ) : null}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={phase === "making"}
            onClick={onAnother}
            className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40"
          >
            <RefreshCw className="size-4" strokeWidth={1.8} />
            Another take
          </button>
          <button
            type="button"
            disabled={phase === "making"}
            onClick={onUse}
            className="accent-fill-gradient inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold text-on-accent disabled:opacity-40"
          >
            {selected === versionId ? "Use new take" : "Use this one"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

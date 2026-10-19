import { Image as ImageIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogoMark } from "@/components/logo-mark";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import { RaiseControl } from "@/components/plan/life-area/raise-control";
import {
  MIST,
  activeOverviewGoal,
  areaThoughts,
  obstacleChips,
  textHash,
} from "@/components/plan/life-area/kit";
import { PlanLifeAreaVisionSections } from "@/components/plan/plan-life-area-reflect-sections";
import { HealObstacleNote } from "@/components/heal/heal-reframe";
import { flushIdeateCloudNow, subscribeIdeateCloud } from "@/lib/ideate-cloud";
import {
  getVisionMedia,
  visionMediaToObjectUrl,
} from "@/lib/ideate-vision-media";
import { addVisionBoardImageFromFile } from "@/lib/ideate-vision-upload";
import {
  loadIdeateVisionBoardStore,
  saveIdeateVisionBoardStore,
  setVisionItemLifeAreaIds,
  visionItemAspect,
  visionItemHasImage,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import { suggestObstacleLabels } from "@/lib/obstacle-labels";
import type { PlanDream } from "@/lib/plan-dreams";
import { loadIdeateStore } from "@/lib/plan-ideate-store";

const GLASS =
  "inline-flex items-center justify-center rounded-full border border-white/30 bg-[color-mix(in_srgb,var(--deep)_40%,transparent)] text-xs font-semibold text-white";
/** Photo fades out so the paisley panel shows through, same weights as the old navy wash. */
const WIDE_PHOTO_MASK =
  "linear-gradient(to top, rgb(0 0 0 / 0.06) 0%, rgb(0 0 0 / 0.3) 50%, rgb(0 0 0 / 0.95) 100%)";
/** Same soften as the Manifest overview vision-board tiles. */
const HERO_PHOTO_FILTER =
  "grayscale(16%) sepia(11%) contrast(0.94) brightness(0.91) saturate(0.85)";

type Props = {
  dream: PlanDream;
  onPatch: (partial: Partial<PlanDream>) => void;
};

export function DreamPoster({ dream, onPatch }: Props) {
  const navigate = useNavigate();
  const { signedIn } = useIdeateCloud();
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const [momentOpen, setMomentOpen] = useState(false);
  const [items, setItems] = useState<VisionBoardItem[]>([]);
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<number | null>(null);
  const [md, setMd] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches,
  );
  const fileRef = useRef<HTMLInputElement | null>(null);
  const obstacleWhenOpened = useRef("");
  const labelsTouched = useRef(false);
  const labelAttempt = useRef<string | null>(null);
  const objectUrl = useRef<string | null>(null);

  const reload = useCallback(() => {
    setItems(loadIdeateVisionBoardStore().items);
  }, []);

  useEffect(() => {
    reload();
    return subscribeIdeateCloud(reload);
  }, [reload]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setMd(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const image = posterImage(items, dream);
  const knownSize = Boolean(
    (image?.width && image.height) || (image?.crop && image.crop.w > 0),
  );
  const aspect = image
    ? knownSize
      ? visionItemAspect(image)
      : (natural ?? visionItemAspect(image))
    : 0;
  const wide = Boolean(image && aspect >= 1.6);

  useEffect(() => {
    setNatural(null);
    setSrc(image?.imageUrl?.trim() || null);
    if (objectUrl.current) {
      URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    }
    if (!image || image.imageUrl?.trim() || !image.mediaId) return;
    let cancel = false;
    void getVisionMedia(image.mediaId).then((rec) => {
      if (cancel || !rec) return;
      const url = visionMediaToObjectUrl(rec);
      objectUrl.current = url;
      setSrc(url);
    });
    return () => {
      cancel = true;
    };
  }, [image]);

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  useEffect(() => {
    if (dream.obstacleLabels !== undefined) return;
    const text = dream.obstacleText.trim();
    if (!text || labelAttempt.current === text) return;
    labelAttempt.current = text;
    let cancel = false;
    void suggestObstacleLabels(text)
      .then((labels) => {
        if (!cancel) onPatch({ obstacleLabels: labels });
      })
      .catch(() => {
        labelAttempt.current = null;
      });
    return () => {
      cancel = true;
    };
  }, [dream.obstacleLabels, dream.obstacleText, onPatch]);

  const dreamText = dream.dreamText.trim();
  const empty = !dreamText;
  const labels = (dream.obstacleLabels ?? []).filter(Boolean).slice(0, 4);
  const store = loadIdeateStore();
  const progress = activeOverviewGoal(store, dream);
  const showProgress = Boolean(progress && progress.total > 0);
  const moment = dream.visionText.trim();

  function openEditor() {
    obstacleWhenOpened.current = dream.obstacleText;
    labelsTouched.current = false;
    setEditing(true);
  }

  async function closeEditor() {
    setEditing(false);
    if (labelsTouched.current) return;
    if (dream.obstacleText.trim() === obstacleWhenOpened.current.trim()) return;
    const labelsNext = await suggestObstacleLabels(dream.obstacleText);
    onPatch({ obstacleLabels: labelsNext });
  }

  async function onUpload(file: File | null) {
    if (!file) return;
    const id = await addVisionBoardImageFromFile(file, signedIn);
    const board = loadIdeateVisionBoardStore();
    const item = board.items.find((row) => row.id === id);
    const tagged = [
      ...new Set([...(item?.lifeAreaIds ?? []), dream.id]),
    ];
    saveIdeateVisionBoardStore(setVisionItemLifeAreaIds(board, id, tagged));
    if (signedIn) await flushIdeateCloudNow();
    reload();
    onPatch({ visionImageId: id });
    setPicker(false);
  }

  const body = empty ? (
    <EmptyDream onWrite={openEditor} />
  ) : (
    <PosterCopy
      dream={dream}
      wide={wide}
      hasImage={Boolean(image)}
      labels={labels}
      moment={moment}
      momentOpen={momentOpen}
      onToggleMoment={() => setMomentOpen((v) => !v)}
      onPatch={onPatch}
      showProgress={showProgress}
      progress={progress}
      onOpenGoal={() => {
        if (!progress) return;
        navigate(
          `/manifest/goal/${encodeURIComponent(dream.id)}/tracker/${encodeURIComponent(progress.goal.id)}`,
        );
      }}
      onLabel={(label) => setDetail(label)}
      showChoose={!image && !md}
      onChoose={() => setPicker(true)}
    />
  );

  return (
    <>
      <section
        className={`relative overflow-hidden rounded-[20px] bg-[#1a1820] text-white shadow-[0_18px_40px_-20px_color-mix(in_srgb,var(--deep)_50%,transparent)] ${
          empty
            ? "md:h-[350px]"
            : !image
              ? "md:h-[350px]"
              : wide
                ? "h-[430px] md:h-[340px]"
                : md
                  ? "h-[372px]"
                  : ""
        }`}
      >
        <div
          aria-hidden
          className="navy-paisley-plate"
        />
        {!image ? (
          <div
            className="pointer-events-none absolute -right-6 -top-10 size-[220px] opacity-10 md:-right-10 md:-top-16 md:size-[360px]"
            aria-hidden
          >
            <LogoMark size={48} fill="#C8A46A" className="size-full" />
          </div>
        ) : null}
        {!empty && image && wide && src ? (
          <>
            <img
              src={src}
              alt=""
              className="absolute inset-0 size-full object-cover"
              style={{
                objectPosition: cropPosition(image),
                filter: HERO_PHOTO_FILTER,
                WebkitMaskImage: WIDE_PHOTO_MASK,
                maskImage: WIDE_PHOTO_MASK,
              }}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0) {
                  setNatural(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
          </>
        ) : null}
        {!empty && image && !wide && md && src ? (
          <div className="absolute inset-y-0 right-0 w-[372px]">
            <img
              src={src}
              alt=""
              className="size-full object-cover"
              style={{
                objectPosition: cropPosition(image),
                filter: HERO_PHOTO_FILTER,
                WebkitMaskImage: "linear-gradient(to right, transparent, #000 90px)",
                maskImage: "linear-gradient(to right, transparent, #000 90px)",
              }}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0) {
                  setNatural(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
            <PosterActions
              className="absolute right-4 top-3.5 z-10"
              showImage
              onImage={() => setPicker(true)}
              onEdit={openEditor}
            />
          </div>
        ) : null}
        {!empty && image && !wide && !md && src ? (
          <div className="relative aspect-square w-full">
            <img
              src={src}
              alt=""
              className="size-full object-cover"
              style={{
                objectPosition: cropPosition(image),
                filter: HERO_PHOTO_FILTER,
                WebkitMaskImage:
                  "linear-gradient(to bottom, #000 calc(100% - 70px), transparent)",
                maskImage:
                  "linear-gradient(to bottom, #000 calc(100% - 70px), transparent)",
              }}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth > 0) {
                  setNatural(img.naturalWidth / img.naturalHeight);
                }
              }}
            />
            {!empty ? (
              <PosterActions
                className="absolute right-4 top-3.5"
                showImage
                onImage={() => setPicker(true)}
                onEdit={openEditor}
              />
            ) : null}
          </div>
        ) : null}

        <div
          className={
            !empty && image && !wide && md
              ? "relative flex h-full w-[calc(100%-372px)] flex-col justify-between py-[22px] pl-7 pr-[18px]"
              : !empty && image && wide
                ? "absolute inset-x-4 bottom-4 top-3.5 flex flex-col md:bottom-[22px]"
                : !empty && image && !wide && !md
                  ? "relative flex flex-col gap-3 px-4 pb-4 pt-1"
                  : "relative flex h-full min-h-[240px] flex-col justify-between px-4 py-4 md:px-7 md:py-[22px]"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--header-gold)]">
              The dream
            </p>
            {!empty && !(image && !wide) ? (
              <PosterActions
                showImage={Boolean(image) || md}
                labelledImage={!image}
                onImage={() => setPicker(true)}
                onEdit={openEditor}
              />
            ) : null}
          </div>
          {!empty && image && wide ? (
            <div className="mt-auto flex flex-col gap-3 md:gap-3.5 md:px-3">{body}</div>
          ) : (
            body
          )}
        </div>
      </section>

      {editing ? (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-overlay/40 sm:items-center">
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-background sm:max-w-3xl sm:rounded-2xl">
            <div className="flex justify-end px-4 pt-3">
              <button
                type="button"
                className="text-sm font-semibold text-accent-link"
                onClick={() => void closeEditor()}
              >
                Done
              </button>
            </div>
            <PlanLifeAreaVisionSections
              dreamId={dream.id}
              dreamText={dream.dreamText}
              obstacleText={dream.obstacleText}
              visionText={dream.visionText}
              obstacleLabels={dream.obstacleLabels ?? []}
              healObstacleAnswers={dream.healObstacleAnswers ?? []}
              onLabelsChange={(next) => {
                labelsTouched.current = true;
                onPatch({ obstacleLabels: next });
              }}
              onPatch={(p) => {
                const next: Partial<PlanDream> = { ...p };
                if (
                  p.dreamText != null &&
                  p.dreamText.trim() !== dream.dreamText.trim()
                ) {
                  next.dreamOriginal = null;
                  next.dreamRaisedFrom = null;
                }
                if (
                  p.visionText != null &&
                  p.visionText.trim() !== dream.visionText.trim()
                ) {
                  next.outcomeOriginal = null;
                  next.outcomeRaisedFrom = null;
                }
                onPatch(next);
              }}
            />
          </div>
        </div>
      ) : null}

      {picker ? (
        <ImagePicker
          items={areaImages(items, dream.id)}
          onClose={() => setPicker(false)}
          onPick={(id) => {
            onPatch({ visionImageId: id });
            setPicker(false);
          }}
          canRemove={Boolean(image)}
          onRemove={() => {
            onPatch({ visionImageId: null });
            setPicker(false);
          }}
          onUpload={() => fileRef.current?.click()}
          onCreate={() =>
            navigate(
              `/manifest/my/vision-board?createArea=${encodeURIComponent(dream.id)}`,
            )
          }
        />
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          void onUpload(file);
        }}
      />
      {detail ? (
        <ObstacleDetail
          label={detail}
          dream={dream}
          onClose={() => setDetail(null)}
        />
      ) : null}
    </>
  );
}

function posterImage(
  items: VisionBoardItem[],
  dream: PlanDream,
): VisionBoardItem | null {
  if (dream.visionImageId === null) return null;
  if (dream.visionImageId) {
    const picked = items.find(
      (item) => item.id === dream.visionImageId && visionItemHasImage(item),
    );
    if (picked) return picked;
  }
  return defaultPosterImage(items, dream.id);
}

function areaImages(items: VisionBoardItem[], areaId: string): VisionBoardItem[] {
  return items
    .filter(
      (item) =>
        visionItemHasImage(item) && (item.lifeAreaIds ?? []).includes(areaId),
    )
    .sort((a, b) => {
      if (Boolean(a.favourite) !== Boolean(b.favourite)) return a.favourite ? -1 : 1;
      return (
        new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
      );
    });
}

function defaultPosterImage(
  items: VisionBoardItem[],
  areaId: string,
): VisionBoardItem | null {
  const tagged = areaImages(items, areaId);
  return tagged.find((item) => item.favourite) ?? tagged[0] ?? null;
}

function cropPosition(item: VisionBoardItem): string {
  const crop = item.crop;
  if (!crop || crop.w <= 0 || crop.h <= 0) return "50% 50%";
  return `${(crop.x + crop.w / 2) * 100}% ${(crop.y + crop.h / 2) * 100}%`;
}

function PosterActions({
  showImage,
  labelledImage = false,
  onImage,
  onEdit,
  className = "",
}: {
  showImage: boolean;
  labelledImage?: boolean;
  onImage: () => void;
  onEdit: () => void;
  className?: string;
}) {
  return (
    <span className={`flex shrink-0 gap-2 ${className}`}>
      {showImage ? (
        <button
          type="button"
          onClick={onImage}
          aria-label={labelledImage ? undefined : "Choose an image"}
          className={`${GLASS} ${labelledImage ? "h-[34px] gap-1.5 px-3.5" : "size-[34px]"}`}
        >
          <ImageIcon className="size-[15px]" strokeWidth={1.8} />
          {labelledImage ? "Choose an image" : null}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onEdit}
        aria-label="Edit vision"
        className={`${GLASS} h-[34px] px-3.5`}
      >
        Edit
      </button>
    </span>
  );
}

function EmptyDream({ onWrite }: { onWrite: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-end gap-4">
      <p className="font-display text-[22px] leading-[1.22] text-white/70 md:text-[26px]">
        What do you want here?
      </p>
      <button
        type="button"
        onClick={onWrite}
        className={`${MIST} h-10 self-start px-4 text-sm`}
      >
        Write your vision
      </button>
    </div>
  );
}

function PosterCopy({
  dream,
  wide,
  hasImage,
  labels,
  moment,
  momentOpen,
  onToggleMoment,
  onPatch,
  showProgress,
  progress,
  onOpenGoal,
  onLabel,
  showChoose,
  onChoose,
}: {
  dream: PlanDream;
  wide: boolean;
  hasImage: boolean;
  labels: string[];
  moment: string;
  momentOpen: boolean;
  onToggleMoment: () => void;
  onPatch: (partial: Partial<PlanDream>) => void;
  showProgress: boolean;
  progress: ReturnType<typeof activeOverviewGoal>;
  onOpenGoal: () => void;
  onLabel: (label: string) => void;
  showChoose: boolean;
  onChoose: () => void;
}) {
  const dreamSize = !hasImage
    ? "text-[22px] md:text-[30px]"
    : wide
      ? "text-[24px] md:text-[30px]"
      : "text-[22px] md:text-[26px]";
  return (
    <div className="flex flex-col gap-3 md:gap-3.5">
      <p
        className={`font-display leading-[1.22] text-white ${dreamSize} ${
          wide ? "md:max-w-[820px]" : ""
        }`}
      >
        {dream.dreamText.trim()}
      </p>
      <RaiseControl
        tone="onDark"
        text={dream.dreamText}
        original={dream.dreamOriginal}
        raisedFrom={dream.dreamRaisedFrom}
        storageKey={`mm_raise_original:${dream.id}:dream`}
        onAccept={(next, original) =>
          onPatch({
            dreamText: next,
            dreamOriginal: original,
            dreamRaisedFrom: textHash(next),
          })
        }
        onRestore={(text) =>
          onPatch({
            dreamText: text,
            dreamOriginal: dream.dreamText,
            dreamRaisedFrom: null,
          })
        }
        onClear={() => onPatch({ dreamOriginal: null, dreamRaisedFrom: null })}
      />
      {moment ? (
        <div>
          <button
            type="button"
            onClick={onToggleMoment}
            className={`text-left text-[13px] leading-[1.45] text-white/80 md:text-sm ${
              momentOpen ? "" : "line-clamp-2"
            }`}
          >
            <span className="font-semibold text-white">The moment: </span>
            {moment}
          </button>
          {momentOpen ? (
            <RaiseControl
              tone="onDark"
              text={dream.visionText}
              original={dream.outcomeOriginal}
              raisedFrom={dream.outcomeRaisedFrom}
              storageKey={`mm_raise_original:${dream.id}:outcome`}
              onAccept={(next, original) =>
                onPatch({
                  visionText: next,
                  outcomeOriginal: original,
                  outcomeRaisedFrom: textHash(next),
                })
              }
              onRestore={(text) =>
                onPatch({
                  visionText: text,
                  outcomeOriginal: dream.visionText,
                  outcomeRaisedFrom: null,
                })
              }
              onClear={() =>
                onPatch({ outcomeOriginal: null, outcomeRaisedFrom: null })
              }
            />
          ) : null}
        </div>
      ) : null}
      {labels.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-[11px] font-semibold uppercase tracking-[1.2px] text-white/70">
            In the way
          </span>
          {labels.map((label) => {
            const answer = (dream.healObstacleAnswers ?? []).find((row) => row.label === label);
            return (
              <span key={label} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => onLabel(label)}
                  className="rounded-full border border-white/[0.22] bg-[color-mix(in_srgb,var(--deep)_45%,transparent)] px-[11px] py-[5px] text-xs text-white"
                >
                  {label}
                </button>
                <HealObstacleNote
                  dreamId={dream.id}
                  label={label}
                  text={answer?.text}
                  healItemId={answer?.healItemId}
                />
              </span>
            );
          })}
        </div>
      ) : null}
      {showProgress && progress ? (
        <button
          type="button"
          onClick={onOpenGoal}
          className="flex items-center gap-3 border-t border-white/[0.18] pt-3 text-left"
        >
          <span className="shrink-0 text-xs text-white/85">
            <span className="md:hidden">Active goal</span>
            <span className="hidden md:inline">{progress.goal.title}</span>
          </span>
          <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.22]">
            <span
              className="block h-full bg-accent"
              style={{
                width: `${Math.round((progress.done / progress.total) * 100)}%`,
              }}
            />
          </span>
          <span className="shrink-0 text-xs font-semibold text-white">
            {progress.done} of {progress.total}
          </span>
        </button>
      ) : null}
      {showChoose ? (
        <button
          type="button"
          onClick={onChoose}
          className={`${GLASS} h-[34px] gap-1.5 self-start px-3.5`}
        >
          <ImageIcon className="size-[15px]" strokeWidth={1.8} />
          Choose an image
        </button>
      ) : null}
    </div>
  );
}

function ImagePicker({
  items,
  canRemove,
  onClose,
  onPick,
  onRemove,
  onUpload,
  onCreate,
}: {
  items: VisionBoardItem[];
  canRemove: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
  onRemove: () => void;
  onUpload: () => void;
  onCreate: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[155] flex items-end justify-center bg-overlay/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-card p-4 sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Choose an image</p>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg">
            ×
          </button>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onUpload} className={`${MIST} h-9 px-3 text-sm`}>
            Upload
          </button>
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex h-9 items-center rounded-full border border-border px-3 text-sm font-semibold"
          >
            ✦ Create one
          </button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {items.map((item) => (
            <PickerThumb key={item.id} item={item} onPick={() => onPick(item.id)} />
          ))}
        </div>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No images for this area yet. Upload one, or create one.
          </p>
        ) : null}
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="mt-4 text-sm font-semibold text-accent-link"
          >
            Remove image
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PickerThumb({
  item,
  onPick,
}: {
  item: VisionBoardItem;
  onPick: () => void;
}) {
  const [src, setSrc] = useState(item.imageUrl?.trim() || "");
  useEffect(() => {
    if (item.imageUrl?.trim() || !item.mediaId) return;
    let cancel = false;
    let url = "";
    void getVisionMedia(item.mediaId).then((rec) => {
      if (cancel || !rec) return;
      url = visionMediaToObjectUrl(rec);
      setSrc(url);
    });
    return () => {
      cancel = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.imageUrl, item.mediaId]);
  return (
    <button
      type="button"
      onClick={onPick}
      className="aspect-square overflow-hidden rounded-xl bg-surface"
    >
      {src ? (
        <img src={src} alt={item.label || ""} className="size-full object-cover" />
      ) : null}
    </button>
  );
}

function ObstacleDetail({
  label,
  dream,
  onClose,
}: {
  label: string;
  dream: PlanDream;
  onClose: () => void;
}) {
  const words = label.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const chip =
    obstacleChips(dream.obstacleText).find((row) =>
      words.some((word) => row.toLowerCase().includes(word)),
    ) ?? null;
  const thoughts = areaThoughts(dream);
  const count = chip
    ? thoughts.filter((t) =>
        t.text.toLowerCase().includes(chip.toLowerCase().slice(0, 12)),
      ).length
    : 0;
  return (
    <div
      className="fixed inset-0 z-[155] flex items-end justify-center bg-overlay/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[1.5px] text-accent-link">
          In the way
        </p>
        <h2 className="mt-1 font-display text-2xl text-foreground">{label}</h2>
        {dream.obstacleText.trim() ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {dream.obstacleText}
          </p>
        ) : null}
        {chip ? (
          <p className="mt-3 text-sm">
            <span className="font-semibold">{chip}</span>
            <span className="text-muted"> ×{count}</span>
            <span className="text-accent-link"> {count > 1 ? "↑" : "→"}</span>
          </p>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-sm font-semibold text-accent-link"
        >
          Close
        </button>
      </div>
    </div>
  );
}

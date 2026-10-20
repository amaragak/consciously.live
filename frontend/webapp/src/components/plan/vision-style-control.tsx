import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SettingsRow, SettingsSegmented } from "@/components/settings/settings-primitives";
import {
  loadIdeateVisionBoardStore,
  visionImageStyleOf,
  type VisionImageStyle,
} from "@/lib/ideate-vision-board";
import {
  hasVisionLikeness,
  otherStyleCount,
  pushVisionToast,
  redrawVisionItems,
  saveVisionImageStyle,
  setPendingStyleRedraw,
  subscribeVisionToast,
} from "@/lib/vision-image-jobs";

export const VISION_STYLE_HELP =
  "Don't like AI images of yourself? Use illustrations instead.";

const OPTIONS = [
  { value: "realistic" as const, label: "Realistic" },
  { value: "illustrated" as const, label: "Illustrated" },
];

export function VisionStyleControl({
  value,
  onCommit,
  onAddPhoto,
  showHelp = true,
}: {
  value: VisionImageStyle;
  onCommit: (
    next: VisionImageStyle,
    redraw: boolean,
    skipLikeness: boolean,
  ) => void;
  onAddPhoto?: () => void;
  showHelp?: boolean;
}) {
  const [ask, setAsk] = useState<VisionImageStyle | null>(null);
  const [needPhoto, setNeedPhoto] = useState(false);
  const count = ask
    ? otherStyleCount(loadIdeateVisionBoardStore().items, ask)
    : 0;

  const choose = (next: VisionImageStyle) => {
    if (next === value) return;
    const n = otherStyleCount(loadIdeateVisionBoardStore().items, next);
    if (n > 0) {
      setAsk(next);
      setNeedPhoto(false);
      return;
    }
    onCommit(next, false, false);
  };

  const redrawAll = () => {
    if (!ask) return;
    if (ask === "realistic" && !hasVisionLikeness()) {
      setNeedPhoto(true);
      return;
    }
    const next = ask;
    setAsk(null);
    onCommit(next, true, false);
  };

  return (
    <div>
      <SettingsSegmented
        aria-label="Vision board images"
        value={value}
        options={OPTIONS}
        onChange={choose}
      />
      {showHelp ? <p className="mt-1.5 text-xs text-muted">{VISION_STYLE_HELP}</p> : null}
      {ask ? (
        <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-md rounded-t-[20px] bg-card p-6 sm:rounded-[20px]">
            <h2 className="font-display text-2xl text-foreground">
              Redraw your {count}{" "}
              {count === 1 ? "image" : "images"} as{" "}
              {ask === "illustrated" ? "illustrations" : "realistic images"}?
            </h2>
            {needPhoto ? (
              <p className="mt-3 text-sm text-muted">
                Realistic images can use a photo of you. Skip makes them without your likeness.
              </p>
            ) : null}
            <div className="mt-5 flex flex-col gap-2">
              {needPhoto ? (
                <>
                  <button
                    type="button"
                    className="accent-fill-gradient h-11 cursor-pointer rounded-full text-sm font-semibold text-on-accent"
                    onClick={() => {
                      const next = ask;
                      setAsk(null);
                      setNeedPhoto(false);
                      if (next) setPendingStyleRedraw(next);
                      onAddPhoto?.();
                    }}
                  >
                    Add a photo
                  </button>
                  <button
                    type="button"
                    className="h-11 cursor-pointer rounded-full border border-border text-sm font-semibold"
                    onClick={() => {
                      const next = ask;
                      setAsk(null);
                      setNeedPhoto(false);
                      onCommit(next, true, true);
                    }}
                  >
                    Skip
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="accent-fill-gradient h-11 cursor-pointer rounded-full text-sm font-semibold text-on-accent"
                    onClick={redrawAll}
                  >
                    Redraw all
                  </button>
                  <button
                    type="button"
                    className="h-11 cursor-pointer rounded-full border border-border text-sm font-semibold"
                    onClick={() => {
                      const next = ask;
                      setAsk(null);
                      onCommit(next, false, false);
                    }}
                  >
                    Only new images
                  </button>
                </>
              )}
              <button
                type="button"
                className="h-11 cursor-pointer text-sm font-semibold text-muted"
                onClick={() => {
                  setAsk(null);
                  setNeedPhoto(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function useStoredVisionStyle(): VisionImageStyle {
  return visionImageStyleOf(loadIdeateVisionBoardStore().imageStyle);
}

export function VisionBoardImagesSetting() {
  const [style, setStyle] = useState<VisionImageStyle>(() =>
    visionImageStyleOf(loadIdeateVisionBoardStore().imageStyle),
  );
  const [toast, setToast] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let timer = 0;
    const unsubscribe = subscribeVisionToast((notice) => {
      setToast(notice.text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setToast(null), 3200);
    });
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <SettingsRow
        title="Vision board images"
        helper={VISION_STYLE_HELP}
        showMarker={false}
        control={
          <VisionStyleControl
            value={style}
            showHelp={false}
            onAddPhoto={() => {
              navigate("/manifest/my/vision-board?refs=1");
            }}
            onCommit={(next, redraw, skipLikeness) => {
              void (async () => {
                await saveVisionImageStyle(next);
                setStyle(next);
                if (!redraw) return;
                const n = await redrawVisionItems(next, { skipLikeness });
                pushVisionToast(
                  n === 1
                    ? `Redrawn as ${next === "illustrated" ? "an illustration" : "a realistic image"}`
                    : `Redrawn ${n} images`,
                );
              })();
            }}
          />
        }
      />
      {toast ? (
        <p
          role="status"
          className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background"
        >
          {toast}
        </p>
      ) : null}
    </>
  );
}

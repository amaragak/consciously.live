import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import { PrimaryCreateButton } from "@/components/primary-create-button";
import type { Guide } from "@/content/guides";
import { isMedimadeSessionActive } from "@/lib/auth-session";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import { loadIdeateManifestoStore } from "@/lib/ideate-manifesto";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import { pullIdeateStoreFromCloud, subscribeIdeateCloud } from "@/lib/ideate-cloud";
import {
  currentGoalForLifeArea,
  newGoalHref,
} from "@/lib/life-area-summary";
import { writeManifestoMeditationHandoff } from "@/lib/manifesto-meditation-handoff";
import { loadIdeateStore } from "@/lib/plan-ideate-store";

type AreaOption = { id: string; title: string; goal: string | null };

function loadAreaOptions(): AreaOption[] {
  const store = loadIdeateStore();
  return store.dreams
    .filter((d) => !isDemoIdeateDream(d))
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .map((d) => ({
      id: d.id,
      title: d.title.trim() || "Untitled",
      goal: currentGoalForLifeArea(store, d.id)?.title.trim() || null,
    }));
}

/** First line of the practice brief — the goal title drafted from it. */
function draftGoalTitle(brief: string): string {
  return (
    brief
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

/**
 * Practice action for a Manifest guide's "Put it into practice" card.
 * `lifeArea` (default): pick a life area, then land on its Goals tab with a
 * new goal drafted from the brief (nothing saves until confirmed).
 * `create`: open Create with the brief and the manifesto attached as context.
 */
export function ManifestPracticeButton({
  guide,
  className,
}: {
  guide: Guide;
  className: string;
}) {
  const navigate = useNavigate();
  const brief = guide.practiceBrief?.trim() ?? "";
  const action = guide.practiceAction ?? "lifeArea";
  const [open, setOpen] = useState(false);
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const syncAreas = useCallback(() => setAreas(loadAreaOptions()), []);

  useEffect(() => {
    if (!open) return;
    syncAreas();
    const unsub = subscribeIdeateCloud(syncAreas);
    if (isMedimadeSessionActive()) {
      void pullIdeateStoreFromCloud().finally(syncAreas);
    }
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      unsub();
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, syncAreas]);

  if (!brief) return null;

  if (action === "create") {
    const make = () => {
      const stored = loadIdeateManifestoStore().text.trim();
      const values = loadIdeateValuesStore().values.map((v) => v.text);
      const lifeAreaTitles = loadAreaOptions().map((a) => a.title);
      void navigate(
        writeManifestoMeditationHandoff({
          statement: stored,
          values,
          lifeAreaTitles,
          brief,
        }),
      );
    };
    return (
      <PrimaryCreateButton
        leadingPlus={false}
        onClick={make}
        className={`${className} w-full rounded-full!`}
      >
        ✦ Create meditation
      </PrimaryCreateButton>
    );
  }

  const title = draftGoalTitle(brief);
  const pick = (id: string) => {
    setOpen(false);
    void navigate(newGoalHref(id, title));
  };
  const addArea = () => {
    setOpen(false);
    const params = new URLSearchParams({ new: "1", then: "goal" });
    if (title) params.set("goalTitle", title);
    void navigate(`/manifest/my?${params.toString()}`);
  };

  return (
    <div ref={rootRef} className="relative flex flex-col">
      <PrimaryCreateButton
        leadingPlus={false}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`${className} w-full rounded-full!`}
      >
        Add to a life area
      </PrimaryCreateButton>
      {open ? (
        <div
          role="dialog"
          aria-label="Add to which life area?"
          className="z-30 mt-2 flex w-full flex-col gap-0.5 rounded-[14px] border border-border bg-card p-2 shadow-[0_12px_32px_rgb(15_27_45_/_0.14)] md:absolute md:left-0 md:top-full md:w-[300px]"
        >
          <span className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[1.4px] text-muted">
            Add to which life area?
          </span>
          {areas.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a.id)}
              className="group/row flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-[9px] text-left transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold text-foreground">
                  {a.title}
                </span>
                <span className="truncate text-xs text-muted">
                  {a.goal ? `Goal: ${a.goal}` : "No goal yet"}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-accent-link opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100"
                strokeWidth={1.8}
              />
            </button>
          ))}
          <div className="mt-1 border-t border-border px-3 pb-1 pt-2.5">
            <button
              type="button"
              onClick={addArea}
              className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-accent-link transition-opacity hover:opacity-80"
            >
              <Plus aria-hidden className="size-3.5" strokeWidth={2} />
              New life area
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

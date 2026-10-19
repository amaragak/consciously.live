import { Check, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HealAvatar } from "@/components/heal/heal-bits";
import { healTypeLabel } from "@/lib/heal-copy";
import { loadHealStore, type HealItem } from "@/lib/heal-store";
import type { JournalLink, JournalMeditationSnapshot, JournalMeditationSource } from "@/lib/journal-storage";
import { listLibraryMeditations, type LibraryMeditationItem } from "@/lib/medimade-api";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import type { PlanDream } from "@/lib/plan-dreams";

export type ContextPick = {
  targetType: JournalLink["targetType"];
  targetId: string;
  label: string;
  meditationSource?: JournalMeditationSource;
  meditationSnapshot?: JournalMeditationSnapshot;
};

type Tab = "meditation" | "manifest" | "heal";

type Props = {
  open: boolean;
  selected: ContextPick[];
  onClose: () => void;
  onAdd: (picks: ContextPick[]) => void;
};

function keyOf(pick: Pick<ContextPick, "targetType" | "targetId">): string {
  return `${pick.targetType}:${pick.targetId}`;
}

export function JournalContextPicker({ open, selected, onClose, onAdd }: Props) {
  const [tab, setTab] = useState<Tab>("meditation");
  const [query, setQuery] = useState("");
  const [picks, setPicks] = useState<ContextPick[]>(selected);
  const [meditations, setMeditations] = useState<LibraryMeditationItem[]>([]);
  const [areas, setAreas] = useState<PlanDream[]>([]);
  const [healItems, setHealItems] = useState<HealItem[]>([]);

  useEffect(() => {
    if (!open) return;
    setPicks(selected);
    setQuery("");
    setAreas(
      loadIdeateStore().dreams.filter((dream) => dream.title.trim() && !dream.demo),
    );
    setHealItems(
      loadHealStore().items.filter((item) => item.status !== "at_peace" && item.title.trim()),
    );
    let cancel = false;
    void listLibraryMeditations()
      .then((items) => {
        if (cancel) return;
        setMeditations(
          items
            .filter((item) => !item.archived && !item.isDraft && item.title?.trim())
            .sort(
              (a, b) =>
                Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""),
            ),
        );
      })
      .catch(() => {
        if (!cancel) setMeditations([]);
      });
    return () => {
      cancel = true;
    };
    // Reload lists when the picker opens. `selected` is read once for the starting checks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const q = query.trim().toLowerCase();
  const healStore = useMemo(() => (open ? loadHealStore() : null), [open, healItems]);

  if (!open || typeof document === "undefined") return null;

  function toggle(pick: ContextPick) {
    setPicks((current) => {
      const key = keyOf(pick);
      if (current.some((row) => keyOf(row) === key)) {
        return current.filter((row) => keyOf(row) !== key);
      }
      return [...current, pick];
    });
  }

  function checked(pick: Pick<ContextPick, "targetType" | "targetId">): boolean {
    const key = keyOf(pick);
    return picks.some((row) => keyOf(row) === key);
  }

  const meditationRows = meditations.filter((item) =>
    !q || item.title.toLowerCase().includes(q),
  );
  const areaRows = areas.filter((area) => !q || area.title.toLowerCase().includes(q));
  const healRows = healItems.filter((item) => !q || item.title.toLowerCase().includes(q));

  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        aria-label="Close add context"
        className="absolute inset-0 cursor-pointer bg-[rgb(15_27_45_/_0.18)]"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[min(80dvh,640px)] flex-col gap-3.5 rounded-t-2xl border border-border bg-card px-5 pb-4 pt-5 shadow-xl lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[420px] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:px-[22px] lg:pb-[18px] lg:pt-[22px]">
        <div className="flex items-center">
          <h2 className="font-display text-[22px] text-foreground">Add context</h2>
          <button
            type="button"
            aria-label="Close"
            className="ml-auto cursor-pointer text-muted"
            onClick={onClose}
          >
            <X className="size-[18px]" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex w-fit gap-1 rounded-full border border-border p-1">
          {(
            [
              ["meditation", "Meditation"],
              ["manifest", "Manifest"],
              ["heal", "Heal"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setQuery("");
              }}
              className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                tab === id ? "bg-nav text-white" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex h-10 items-center gap-2 rounded-[10px] border border-border px-3 text-[13px] text-muted">
          <Search className="size-3.5" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              tab === "meditation"
                ? "Search meditations…"
                : tab === "manifest"
                  ? "Search life areas…"
                  : "Search Heal…"
            }
            className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted"
          />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === "meditation"
            ? meditationRows.map((item) => {
                const targetId = (item.s3Key || item.sk || item.id || "").trim();
                const minutes = item.durationSeconds
                  ? `${Math.max(1, Math.round(item.durationSeconds / 60))} min`
                  : "";
                return (
                  <PickRow
                    key={targetId || item.title}
                    checked={checked({ targetType: "meditation", targetId })}
                    title={item.title}
                    meta={minutes}
                    art={
                      item.coverImageUrl ? (
                        <img src={item.coverImageUrl} alt="" className="size-full object-cover" />
                      ) : null
                    }
                    onClick={() =>
                      toggle({
                        targetType: "meditation",
                        targetId,
                        label: item.title.trim(),
                        meditationSource: "own",
                        meditationSnapshot: {
                          title: item.title.trim() || "Meditation",
                          coverImageUrl: item.coverImageUrl ?? null,
                          speakerName: item.speakerName ?? null,
                          durationSeconds: item.durationSeconds ?? null,
                        },
                      })
                    }
                  />
                );
              })
            : null}
          {tab === "manifest"
            ? areaRows.map((area) => (
                <PickRow
                  key={area.id}
                  checked={checked({ targetType: "life_area", targetId: area.id })}
                  title={area.title}
                  art={<span className="font-display text-[15px]">{area.title.trim().slice(0, 1).toUpperCase()}</span>}
                  onClick={() =>
                    toggle({
                      targetType: "life_area",
                      targetId: area.id,
                      label: area.title.trim(),
                    })
                  }
                />
              ))
            : null}
          {tab === "heal" && healStore
            ? healRows.map((item) => (
                <PickRow
                  key={item.id}
                  checked={checked({ targetType: "heal_item", targetId: item.id })}
                  title={item.title}
                  meta={healTypeLabel(item.type)}
                  art={<HealAvatar item={item} store={healStore} size={36} />}
                  onClick={() =>
                    toggle({
                      targetType: "heal_item",
                      targetId: item.id,
                      label: item.title.trim(),
                    })
                  }
                />
              ))
            : null}
          {tab === "meditation" && meditationRows.length === 0 ? (
            <p className="py-6 text-sm text-muted">No meditations match.</p>
          ) : null}
          {tab === "manifest" && areaRows.length === 0 ? (
            <p className="py-6 text-sm text-muted">No life areas match.</p>
          ) : null}
          {tab === "heal" && healRows.length === 0 ? (
            <p className="py-6 text-sm text-muted">Nothing in Heal yet.</p>
          ) : null}
        </div>
        <div className="flex items-center gap-2.5 border-t border-border pt-3">
          <p className="text-[13px] text-muted">
            {picks.length === 0
              ? "None selected"
              : `${picks.length} selected`}
          </p>
          <button
            type="button"
            disabled={picks.length === 0}
            onClick={() => onAdd(picks)}
            className="ml-auto inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold accent-fill-gradient disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add {picks.length || ""}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PickRow({
  checked,
  title,
  meta,
  art,
  onClick,
}: {
  checked: boolean;
  title: string;
  meta?: string;
  art: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-3 border-t border-border py-2.5 text-left"
    >
      <span
        className={`grid size-5 shrink-0 place-items-center rounded-md ${
          checked ? "bg-nav text-white" : "border-[1.5px] border-border"
        }`}
      >
        {checked ? <Check className="size-3" strokeWidth={2} /> : null}
      </span>
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-background text-muted">
        {art}
      </span>
      <span className="min-w-0">
        {meta ? (
          <span className="block text-[10px] font-semibold uppercase tracking-[1.3px] text-muted">
            {meta}
          </span>
        ) : null}
        <span className="block truncate font-display text-[16px] text-foreground">{title}</span>
      </span>
    </button>
  );
}

import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AttachedJournalList } from "@/components/attached-journal-list";
import { MIST } from "@/components/plan/life-area/kit";
import {
  ensureMeditationOrigins,
  journalNewEntryHref,
  journalRowsForLifeArea,
  subscribeJournalEntries,
  subscribeMeditationOrigins,
  type HealJournalRow,
} from "@/lib/journal-links";
import type { PlanDream } from "@/lib/plan-dreams";

export function LifeAreaJournal({ dream }: { dream: PlanDream }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<HealJournalRow[]>([]);

  useEffect(() => {
    const sync = () => {
      setRows(
        journalRowsForLifeArea(dream.id).map((row) => {
          const meditation = row.entry.links?.find(
            (link) => link.targetType === "meditation" && (row.mode === "reflection" || link.reflecting),
          );
          return {
            entry: row.entry,
            mode: row.mode,
            at: row.at,
            meditationTitle:
              meditation?.label || meditation?.meditationSnapshot?.title || null,
          };
        }),
      );
    };
    sync();
    const stopEntries = subscribeJournalEntries(sync);
    const stopOrigins = subscribeMeditationOrigins(sync);
    void ensureMeditationOrigins().then(sync);
    return () => {
      stopEntries();
      stopOrigins();
    };
  }, [dream.id]);

  const title = dream.title.trim() || "this area";

  return (
    <div className="flex flex-col gap-3.5">
      <button
        type="button"
        onClick={() =>
          navigate(
            journalNewEntryHref({
              targetType: "life_area",
              targetId: dream.id,
              label: dream.title,
            }),
          )
        }
        className="flex cursor-pointer items-center gap-3.5 rounded-[14px] border-[1.5px] border-dashed border-accent/40 bg-accent-soft px-4 py-3 text-left"
      >
        <span className={`${MIST} size-9 shrink-0`} aria-hidden>
          <Plus className="size-4" strokeWidth={1.8} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-display text-[19px] text-foreground">New entry</span>
          <span className="text-[12.5px] text-muted">Starts with {title} attached</span>
        </span>
      </button>
      {rows.length ? (
        <div className="rounded-2xl border border-border bg-card px-4 pb-1 pt-1.5 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)] sm:px-6">
          <AttachedJournalList
            rows={rows}
            current={{ targetType: "life_area", targetId: dream.id }}
          />
        </div>
      ) : (
        <p className="text-sm leading-normal text-muted">
          Attach {title} to an entry in Journal and it shows up here.
        </p>
      )}
    </div>
  );
}

import { PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SelectChevron } from "@/components/select-chevron";
import {
  journalContextDate,
  journalFirstLine,
  journalHref,
  reflectionsForMeditation,
  subscribeJournalEntries,
} from "@/lib/journal-links";
import {
  armReflectMeditationHandoff,
  reflectHandoffFromLibraryItem,
  reflectMeditationJournalHref,
} from "@/lib/journal-meditation-reflect";
import type { LibraryMeditationItem } from "@/lib/medimade-api";

export function MeditationReflectionLink({
  meditationId,
  item,
}: {
  meditationId: string;
  item?: LibraryMeditationItem | null;
}) {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeJournalEntries(() => setTick((n) => n + 1)), []);
  void tick;
  const id = meditationId.trim();
  if (!id) return null;
  const rows = reflectionsForMeditation(id);
  const latest = rows[0] ?? null;
  const line = latest ? journalFirstLine(latest) : "";
  const label = !latest
    ? "Reflect on this meditation"
    : rows.length > 1
      ? `Your reflections (${rows.length})`
      : `Your reflection · ${journalContextDate(latest.updatedAt || latest.createdAt)}`;

  function open() {
    if (latest) {
      navigate(journalHref(latest));
      return;
    }
    if (!item) return;
    const handoff = reflectHandoffFromLibraryItem(item, "own");
    if (!handoff) return;
    armReflectMeditationHandoff(handoff);
    navigate(reflectMeditationJournalHref());
  }

  return (
    <button
      type="button"
      onClick={open}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] border border-border bg-[var(--surface)] px-3 py-2.5 text-left"
    >
      <PenLine className="size-3.5 shrink-0 text-accent" strokeWidth={1.8} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold text-foreground">{label}</span>
        {latest && line ? (
          <span className="block truncate text-[12px] text-muted">{line}</span>
        ) : null}
      </span>
      <SelectChevron direction="right" />
    </button>
  );
}

import { Heart, Moon, Sparkles } from "lucide-react";
import { useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
import { loadHealStore } from "@/lib/heal-store";
import {
  journalContextDate,
  journalHref,
  journalPlain,
  type HealJournalRow,
} from "@/lib/journal-links";
import type { JournalLink } from "@/lib/journal-storage";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { Link } from "@/lib/spa-nav";

const PREVIEW = 3;

type Current = {
  targetType: JournalLink["targetType"];
  targetId: string;
};

export function AttachedJournalList({
  rows,
  current,
}: {
  rows: HealJournalRow[];
  current: Current;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, PREVIEW);
  return (
    <div>
      {shown.map((row, index) => (
        <AttachedJournalRow
          key={row.entry.id}
          row={row}
          current={current}
          first={index === 0}
        />
      ))}
      {rows.length > PREVIEW ? (
        <div className="border-t border-border py-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center text-[13px] font-semibold text-muted"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Show less" : `Show all ${rows.length}`}
            <SelectChevron direction="right" className="text-muted" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AttachedJournalRow({
  row,
  current,
  first,
}: {
  row: HealJournalRow;
  current: Current;
  first: boolean;
}) {
  const title = rowTitle(row);
  const excerpt = journalPlain(row.entry);
  const when = journalContextDate(row.at);
  const kind = row.mode === "reflection" ? "Reflection" : "Journal entry";
  const also = otherLinks(row, current);
  return (
    <Link
      href={journalHref(row.entry)}
      className={`flex gap-3 py-4 lg:gap-4 ${first ? "" : "border-t border-border"}`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-[1.2px] text-muted">
          {kind}
          {when ? ` · ${when}` : ""}
        </span>
        {title ? <span className="text-[15px] font-semibold text-foreground">{title}</span> : null}
        {excerpt ? (
          <span className="line-clamp-2 font-display text-[16px] leading-[1.55] text-muted">
            {excerpt}
          </span>
        ) : null}
        {also.length ? (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] text-muted">Also on</span>
            {also.map((link) => (
              <AlsoChip key={link.id} link={link} />
            ))}
          </span>
        ) : null}
      </span>
      <SelectChevron direction="right" className="mt-1 text-muted" />
    </Link>
  );
}

function rowTitle(row: HealJournalRow): string {
  const title = row.entry.title.trim();
  if (title && title !== "Untitled" && title !== "Untitled entry" && title !== "New entry") {
    return title;
  }
  if (row.mode === "reflection" && row.meditationTitle) {
    return `Reflection: ${row.meditationTitle}`;
  }
  return title;
}

function otherLinks(row: HealJournalRow, current: Current): JournalLink[] {
  return (row.entry.links ?? []).filter(
    (link) => !(link.targetType === current.targetType && link.targetId === current.targetId),
  );
}

function AlsoChip({ link }: { link: JournalLink }) {
  const name = chipName(link);
  const kind =
    link.targetType === "heal_item"
      ? "Heal"
      : link.targetType === "life_area"
        ? "Manifest"
        : "Meditation";
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-card px-2 text-[11.5px] text-muted">
      {link.targetType === "heal_item" ? (
        <Heart className="size-[11px]" strokeWidth={1.8} aria-hidden />
      ) : link.targetType === "life_area" ? (
        <Sparkles className="size-[11px]" strokeWidth={1.8} aria-hidden />
      ) : (
        <Moon className="size-[11px]" strokeWidth={1.8} aria-hidden />
      )}
      <span>{kind}</span>
      <b className="font-semibold text-foreground">{name}</b>
    </span>
  );
}

function chipName(link: JournalLink): string {
  if (link.label?.trim()) return link.label.trim();
  if (link.meditationSnapshot?.title?.trim()) return link.meditationSnapshot.title.trim();
  if (link.targetType === "heal_item") {
    return loadHealStore().items.find((item) => item.id === link.targetId)?.title?.trim() || "Heal";
  }
  if (link.targetType === "life_area") {
    return (
      loadIdeateStore().dreams.find((dream) => dream.id === link.targetId)?.title?.trim() ||
      "Life area"
    );
  }
  return "Meditation";
}

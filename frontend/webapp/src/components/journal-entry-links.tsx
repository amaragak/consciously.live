import { Heart, List, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HEAL_OUTLINE, HEAL_PRIMARY, HealOverlay } from "@/components/heal/heal-bits";
import {
  JournalContextPicker,
  type ContextPick,
} from "@/components/journal-context-picker";
import { JournalReflectMeditationCard } from "@/components/journal-reflect-meditation-card";
import {
  addHealView,
  currentView,
  loadHealStore,
  saveHealStore,
} from "@/lib/heal-store";
import {
  ensureMeditationOrigins,
  entryWithLinks,
  journalPlain,
  linksOfType,
  newJournalLink,
  peekMeditationOrigins,
} from "@/lib/journal-links";
import type { JournalEntry, JournalLink } from "@/lib/journal-storage";

type Props = {
  entry: JournalEntry;
  onChange: (partial: Partial<JournalEntry>) => void;
};

export function JournalEntryLinks({ entry, onChange }: Props) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const tokens = entry.links?.filter((link) => link.targetType !== "meditation") ?? [];
  const meditations =
    linksOfType(entry, "meditation").length > 0
      ? linksOfType(entry, "meditation")
      : entry.meditationId
        ? [
            {
              id: `legacy-${entry.meditationId}`,
              entryId: entry.id,
              targetType: "meditation" as const,
              targetId: entry.meditationId,
              createdAt: entry.createdAt,
              reflecting: true,
              label: entry.meditationSnapshot?.title,
              meditationSource: entry.meditationSource,
              meditationSnapshot: entry.meditationSnapshot,
            } satisfies JournalLink,
          ]
        : [];

  function apply(next: JournalLink[]) {
    onChange(entryWithLinks(entry, next));
  }

  function remove(link: JournalLink) {
    apply((entry.links ?? meditations).filter((row) => row.id !== link.id && row.targetId !== link.targetId));
  }

  const selected: ContextPick[] = (entry.links ?? meditations).map((link) => ({
    targetType: link.targetType,
    targetId: link.targetId,
    label: link.label || link.meditationSnapshot?.title || link.targetId,
    meditationSource: link.meditationSource,
    meditationSnapshot: link.meditationSnapshot,
  }));

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {tokens.map((link) => (
          <span
            key={link.id}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-card pl-2 pr-1 text-[13px] text-foreground"
          >
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1.5"
              onClick={() =>
                navigate(
                  link.targetType === "heal_item"
                    ? `/heal/${encodeURIComponent(link.targetId)}`
                    : `/manifest/goal/${encodeURIComponent(link.targetId)}`,
                )
              }
            >
              {link.targetType === "heal_item" ? (
                <Heart className="size-3.5 text-accent-link" strokeWidth={1.8} aria-hidden />
              ) : (
                <List className="size-3.5 text-accent-link" strokeWidth={1.8} aria-hidden />
              )}
              <span className="text-muted">
                {link.targetType === "heal_item" ? "Heal" : "Manifest"} ·
              </span>
              <span className="font-semibold">{link.label || "Untitled"}</span>
            </button>
            <button
              type="button"
              aria-label={`Remove ${link.label || "link"}`}
              className="cursor-pointer p-1 text-muted"
              onClick={() => remove(link)}
            >
              <X className="size-3" strokeWidth={1.8} />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-[30px] cursor-pointer items-center gap-1 px-1 text-[13px] font-semibold text-accent-link"
        >
          <Plus className="size-3.5" strokeWidth={1.8} aria-hidden />
          Add context
        </button>
      </div>
      {meditations.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {meditations.map((link) => (
            <JournalReflectMeditationCard
              key={link.id}
              meditationId={link.targetId}
              snapshot={link.meditationSnapshot}
              label={link.reflecting ? "Reflecting on" : "Meditation"}
              onUnlink={() => remove(link)}
            />
          ))}
        </div>
      ) : null}
      <JournalContextPicker
        open={open}
        selected={selected}
        onClose={() => setOpen(false)}
        onAdd={(picks) => {
          const previous = entry.links ?? [];
          const next = picks.map((pick) => {
            const kept = previous.find(
              (link) => link.targetType === pick.targetType && link.targetId === pick.targetId,
            );
            if (kept) return { ...kept, label: pick.label || kept.label };
            return newJournalLink({
              entryId: entry.id,
              targetType: pick.targetType,
              targetId: pick.targetId,
              label: pick.label,
              reflecting: false,
              meditationSource: pick.meditationSource,
              meditationSnapshot: pick.meditationSnapshot,
            });
          });
          apply(next);
          setOpen(false);
        }}
      />
      <HealReflectionPrompt entry={entry} />
    </>
  );
}

function HealReflectionPrompt({ entry }: { entry: JournalEntry }) {
  const wasEmpty = useRef(journalPlain(entry).length === 0);
  const [itemId, setItemId] = useState<string | null>(null);
  const [goodNow, setGoodNow] = useState("");

  useEffect(() => {
    const text = journalPlain(entry);
    if (!text || !wasEmpty.current) return;
    const meditation = (entry.links ?? []).find(
      (link) => link.targetType === "meditation" && link.reflecting,
    ) ?? (entry.meditationId
      ? { targetId: entry.meditationId }
      : null);
    if (!meditation) return;
    let cancel = false;
    void ensureMeditationOrigins().then((origins) => {
      if (cancel) return;
      const healItemId =
        origins.get(meditation.targetId)?.healItemId ||
        peekMeditationOrigins()?.get(meditation.targetId)?.healItemId ||
        null;
      if (!healItemId) return;
      const key = `mm_heal_see_it_${entry.id}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        /* */
      }
      const good = currentView(loadHealStore(), healItemId, "good")?.text ?? "";
      setGoodNow(good);
      setItemId(healItemId);
      wasEmpty.current = false;
    });
    return () => {
      cancel = true;
    };
  }, [entry.contentHtml, entry.id, entry.links, entry.meditationId]);

  if (!itemId) return null;
  const text = journalPlain(entry);
  const good = currentView(loadHealStore(), itemId, "good")?.text ?? "";

  return (
    <HealOverlay title="Does this change how you see it?" onClose={() => setItemId(null)} wide>
      <div className="overflow-y-auto px-5 py-5">
        <p className="text-[12px] font-semibold text-heal-accent">What you wrote</p>
        <div className="mt-2 rounded-xl bg-background px-3 py-2 text-sm">{text}</div>
        <h2 className="mt-4 font-display text-[24px]">Does this change how you see it?</h2>
        <textarea
          autoFocus
          value={goodNow}
          onChange={(event) => setGoodNow(event.target.value)}
          rows={4}
          className="mt-3 w-full resize-none rounded-xl border-[1.5px] border-heal-accent bg-card px-3 py-2 font-display text-[18px] outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={HEAL_PRIMARY}
            disabled={!goodNow.trim() || goodNow.trim() === good}
            onClick={() => {
              const next = addHealView(loadHealStore(), {
                itemId,
                side: "good",
                text: goodNow,
                source: "user",
                sourceEntryId: entry.id,
              });
              saveHealStore(next);
              setItemId(null);
            }}
          >
            Update my good-day view
          </button>
          <button type="button" className={HEAL_OUTLINE} onClick={() => setItemId(null)}>
            Not yet
          </button>
        </div>
      </div>
    </HealOverlay>
  );
}

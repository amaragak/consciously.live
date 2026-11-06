"use client";

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import {
  JournalContextPicker,
  type ContextPick,
} from "@/components/journal-context-picker";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { healItemHrefById, lifeAreaHrefById } from "@/lib/entity-href";
import {
  entryWithLinks,
  linksOfType,
  newJournalLink,
} from "@/lib/journal-links";
import {
  JOURNAL_MOODS,
  JOURNAL_MOOD_PILL,
  isJournalMoodId,
  journalMoodLabel,
  type JournalMoodId,
} from "@/lib/journal-moods";
import type { JournalEntry, JournalLink } from "@/lib/journal-storage";
import { libraryMeditationDetailHrefById } from "@/lib/library-meditation-detail";
import { listLibraryMeditations } from "@/lib/medimade-api";

type Props = {
  entry: JournalEntry;
  onMoodChange: (mood: string | undefined) => void;
  onTagsChange: (tags: string[]) => void;
  onChange: (partial: Partial<JournalEntry>) => void;
  /** Open the existing tag composer (optional external). */
  onRequestAddTag?: () => void;
};

/** Light border; bronze only on the label (consciously-journal-entry-fix). */
const DASHED_PILL =
  "inline-flex h-7 cursor-pointer items-center rounded-full border border-dashed border-border px-2.5 text-[12.5px] font-semibold text-[#8A6424]";

function cleanTag(raw: string): string {
  return raw.trim().replace(/^#/, "").slice(0, 32);
}

function contextLabel(link: JournalLink): string {
  return (
    link.label?.trim() ||
    link.meditationSnapshot?.title?.trim() ||
    (link.targetType === "meditation"
      ? "Meditation"
      : link.targetType === "heal_item"
        ? "Heal"
        : "Life area")
  );
}

/**
 * Mobile entry meta: one pill row (+ Mood / + Context / + Tag or set values),
 * inline mood picker, and compact rounded context chips underneath.
 */
export function JournalMobileEntryMeta({
  entry,
  onMoodChange,
  onTagsChange,
  onChange,
  onRequestAddTag,
}: Props) {
  const navigate = useNavigate();
  const { playItem } = useLibraryPlayer();
  const [moodOpen, setMoodOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [tagDraftOpen, setTagDraftOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const tagInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const moodId = isJournalMoodId(entry.mood) ? entry.mood : null;
  const moodLabel = moodId ? journalMoodLabel(moodId) : null;
  const moodPill = moodId ? JOURNAL_MOOD_PILL[moodId] : null;
  const tags = entry.tags ?? [];

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
  const otherLinks =
    entry.links?.filter((link) => link.targetType !== "meditation") ?? [];
  const contextLinks = [...meditations, ...otherLinks];
  const hasMood = Boolean(moodLabel);
  const hasTag = tags.length > 0;
  const hasContext = contextLinks.length > 0;
  const nothingSet = !hasMood && !hasTag && !hasContext;

  useEffect(() => {
    if (!tagDraftOpen) return;
    tagInputRef.current?.focus();
  }, [tagDraftOpen]);

  function applyLinks(next: JournalLink[]) {
    onChange(entryWithLinks(entry, next));
  }

  function removeLink(link: JournalLink) {
    applyLinks(
      (entry.links ?? meditations).filter(
        (row) => row.id !== link.id && row.targetId !== link.targetId,
      ),
    );
  }

  function addTag() {
    const t = cleanTag(tagDraft);
    if (!t) {
      setTagDraft("");
      setTagDraftOpen(false);
      return;
    }
    onTagsChange([...new Set([...tags, t])].slice(0, 16));
    setTagDraft("");
    setTagDraftOpen(false);
  }

  async function playMeditation(link: JournalLink) {
    const id = link.targetId;
    try {
      const items = await listLibraryMeditations().catch(() => []);
      const hit = items.find(
        (x) => x.s3Key === id || x.sk === id || x.id === id,
      );
      if (hit) playItem(hit);
    } catch {
      /* ignore */
    }
  }

  function openContext(link: JournalLink) {
    if (link.targetType === "heal_item") {
      navigate(healItemHrefById(link.targetId));
      return;
    }
    if (link.targetType === "life_area") {
      navigate(lifeAreaHrefById(link.targetId));
      return;
    }
    navigate(libraryMeditationDetailHrefById(link.targetId));
  }

  function armLongPress(link: JournalLink) {
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      removeLink(link);
    }, 550);
  }

  function clearLongPress() {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const selected: ContextPick[] = (entry.links ?? meditations).map((link) => ({
    targetType: link.targetType,
    targetId: link.targetId,
    label: link.label || link.meditationSnapshot?.title || link.targetId,
    meditationSource: link.meditationSource,
    meditationSnapshot: link.meditationSnapshot,
  }));

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {nothingSet ? (
          <>
            <button
              type="button"
              className={DASHED_PILL}
              onClick={() => setMoodOpen((v) => !v)}
            >
              + Mood
            </button>
            <button
              type="button"
              className={DASHED_PILL}
              onClick={() => setContextOpen(true)}
            >
              + Context
            </button>
            <button
              type="button"
              className={DASHED_PILL}
              onClick={() => {
                onRequestAddTag?.();
                setTagDraftOpen(true);
              }}
            >
              + Tag
            </button>
          </>
        ) : (
          <>
            {moodLabel && moodPill ? (
              <button
                type="button"
                onClick={() => setMoodOpen((v) => !v)}
                className="inline-flex h-7 cursor-pointer items-center rounded-full px-2.5 text-[12.5px] font-semibold text-foreground"
                style={{ backgroundColor: moodPill.background }}
              >
                {moodLabel}
              </button>
            ) : null}
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  onTagsChange(tags.filter((x) => x !== tag))
                }
                className="inline-flex h-7 cursor-pointer items-center rounded-full border border-border px-2.5 text-[12.5px] text-foreground/85"
                title="Tap to remove"
              >
                #{tag}
              </button>
            ))}
            <button
              type="button"
              className={DASHED_PILL}
              onClick={() => {
                if (!hasMood) setMoodOpen(true);
                else if (!hasContext) setContextOpen(true);
                else {
                  onRequestAddTag?.();
                  setTagDraftOpen(true);
                }
              }}
            >
              + Add
            </button>
          </>
        )}
      </div>

      {moodOpen ? (
        <div className="rounded-2xl bg-[color-mix(in_srgb,var(--accent)_12%,var(--card))] px-3.5 py-3">
          <p className="mb-2 text-[13px] font-medium text-foreground/80">
            How does this feel?
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mood">
            {JOURNAL_MOODS.map((m) => {
              const on = entry.mood === m.id;
              const pill = JOURNAL_MOOD_PILL[m.id as JournalMoodId];
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    onMoodChange(on ? undefined : m.id);
                    setMoodOpen(false);
                  }}
                  className="cursor-pointer rounded-full border px-3 py-1 text-[13px] font-medium transition-colors"
                  style={
                    on
                      ? {
                          background: pill.background,
                          borderColor: "transparent",
                          color: pill.color,
                        }
                      : {
                          background: "var(--card)",
                          borderColor: "var(--border)",
                          color: "var(--foreground)",
                        }
                  }
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {tagDraftOpen ? (
        <input
          ref={tagInputRef}
          type="text"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
            if (e.key === "Escape") {
              setTagDraftOpen(false);
              setTagDraft("");
            }
          }}
          onBlur={() => {
            if (tagDraft.trim()) addTag();
            else setTagDraftOpen(false);
          }}
          aria-label="Add a tag"
          placeholder="Tag name"
          className="h-9 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-accent/50"
        />
      ) : null}

      {contextLinks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {contextLinks.map((link) => {
            const label = contextLabel(link);
            const isMed = link.targetType === "meditation";
            return (
              <span
                key={link.id}
                className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-[10px] border border-border bg-card pl-1.5 pr-2.5 text-[13px] text-foreground"
                onPointerDown={() => armLongPress(link)}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                onPointerCancel={clearLongPress}
              >
                {isMed ? (
                  <button
                    type="button"
                    aria-label={`Play ${label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      clearLongPress();
                      void playMeditation(link);
                    }}
                    className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-on-accent"
                    style={PRIMARY_ACCENT_FILL_STYLE}
                  >
                    <Play className="size-3 fill-current" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    clearLongPress();
                    openContext(link);
                  }}
                  className="min-w-0 max-w-[11rem] cursor-pointer truncate text-left font-medium"
                >
                  {label}
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <JournalContextPicker
        open={contextOpen}
        selected={selected}
        onClose={() => setContextOpen(false)}
        onAdd={(picks) => {
          const previous = entry.links ?? [];
          const next = picks.map((pick) => {
            const kept = previous.find(
              (link) =>
                link.targetType === pick.targetType &&
                link.targetId === pick.targetId,
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
          applyLinks(next);
          setContextOpen(false);
        }}
      />
    </div>
  );
}

import * as Switch from "@radix-ui/react-switch";
import { Check, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { JournalPromptQuestion } from "@/components/journal-prompt-question";
import {
  JOURNAL_PROMPT_TOPICS,
  buildJournalPromptLibrary,
  journalPromptMatchesFilter,
  splitJournalPromptsForEntry,
  type JournalPrompt,
  type JournalPromptFilter,
  type JournalPromptTopicKey,
} from "@/lib/journal-prompts";

const INCLUDE_KEY = "mm_journal_prompt_includes_v1";

export type JournalPromptSources = {
  areas: { id: string; title: string }[];
  values: { id: string; text: string }[];
  healItems: { id: string; title: string }[];
  linkedRefIds: string[];
  meditations: { id: string; title: string }[];
};

function readIncludes(): { areas: boolean; values: boolean; heal: boolean } {
  try {
    const raw = localStorage.getItem(INCLUDE_KEY);
    if (!raw) return { areas: true, values: true, heal: true };
    const parsed = JSON.parse(raw) as {
      areas?: boolean;
      values?: boolean;
      heal?: boolean;
    };
    return {
      areas: parsed.areas !== false,
      values: parsed.values !== false,
      heal: parsed.heal !== false,
    };
  } catch {
    return { areas: true, values: true, heal: true };
  }
}

function filterChipClass(active: boolean): string {
  return `inline-flex h-8 max-w-full cursor-pointer items-center gap-1 truncate rounded-full border px-3 text-[13.5px] font-semibold transition-colors ${
    active
      ? "border-nav bg-nav text-nav-foreground"
      : "border-border bg-card text-foreground hover:border-accent/50"
  }`;
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={(v) => onChange(Boolean(v))}
      aria-label={label}
      className="relative h-6 w-[42px] shrink-0 cursor-pointer rounded-full border border-[#AFC2DC] bg-[#E7E1D6] transition-colors data-[state=checked]:bg-[#C9D7EA]"
    >
      <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
    </Switch.Root>
  );
}

function PromptRow({
  prompt,
  used,
  onPick,
}: {
  prompt: JournalPrompt;
  used: boolean;
  onPick: (prompt: JournalPrompt) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(prompt)}
      className="flex w-full min-h-[50px] cursor-pointer items-center gap-3 border-t border-border py-3 text-left"
    >
      <span
        className={`min-w-0 flex-1 text-[15.5px] leading-snug ${
          used ? "text-muted" : "text-foreground"
        }`}
      >
        <JournalPromptQuestion template={prompt.template} name={prompt.name} />
      </span>
      {used ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold text-[#8A6424]">
          <Check className="size-3.5" strokeWidth={2.4} aria-hidden />
          Added
        </span>
      ) : (
        /* Chevron kept off — + shows add. */
        <span
          className="inline-flex size-[30px] shrink-0 items-center justify-center rounded-full border border-border bg-card text-[#8A6424]"
          aria-hidden
        >
          <Plus className="size-4" strokeWidth={2} />
        </span>
      )}
    </button>
  );
}

export function JournalPromptsPanel({
  sources,
  usedIds,
  onPick,
  onClose,
}: {
  sources: JournalPromptSources;
  usedIds: ReadonlySet<string>;
  onPick: (prompt: JournalPrompt) => void;
  onClose: () => void;
}) {
  const [includes, setIncludes] = useState(readIncludes);
  const [filter, setFilter] = useState<JournalPromptFilter>({ kind: "all" });

  useEffect(() => {
    try {
      localStorage.setItem(INCLUDE_KEY, JSON.stringify(includes));
    } catch {
      /* ignore */
    }
  }, [includes]);

  const library = useMemo(
    () =>
      buildJournalPromptLibrary({
        includeLifeAreas: includes.areas,
        includeValues: includes.values,
        includeHeal: includes.heal,
        areas: sources.areas,
        values: sources.values,
        healItems: sources.healItems,
        meditations: sources.meditations,
      }),
    [includes, sources],
  );

  const linked = useMemo(
    () => new Set(sources.linkedRefIds),
    [sources.linkedRefIds],
  );

  const visible = library.filter((prompt) =>
    journalPromptMatchesFilter(prompt, filter),
  );
  const { fromEntry, rest } = splitJournalPromptsForEntry(visible, linked);

  const setInclude = (key: "areas" | "values" | "heal", on: boolean) => {
    setIncludes((prev) => ({ ...prev, [key]: on }));
    setFilter((current) => {
      if (key === "areas" && !on && current.kind === "area") return { kind: "all" };
      if (key === "values" && !on && current.kind === "value") return { kind: "all" };
      if (key === "heal" && !on && current.kind === "heal") return { kind: "all" };
      return current;
    });
  };

  const toggleTopic = (topic: JournalPromptTopicKey | "all") => {
    if (topic === "all") {
      setFilter({ kind: "all" });
      return;
    }
    setFilter((current) =>
      current.kind === "topic" && current.topic === topic
        ? { kind: "all" }
        : { kind: "topic", topic },
    );
  };

  const toggleRef = (
    kind: "area" | "value" | "heal",
    refId: string,
  ) => {
    setFilter((current) =>
      current.kind === kind && current.refId === refId
        ? { kind: "all" }
        : { kind, refId },
    );
  };

  const group = (
    title: string,
    on: boolean,
    setOn: (v: boolean) => void,
    chips: { id: string; label: string; kind: "area" | "value" | "heal" }[],
  ) => {
    if (chips.length === 0) return null;
    return (
      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2.5">
          <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-foreground">
            {title}
          </span>
          <ToggleSwitch checked={on} onChange={setOn} label={title} />
        </div>
        {on ? (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const active = filter.kind === chip.kind && filter.refId === chip.id;
              const covered = library.some(
                (prompt) =>
                  prompt.bucket === chip.kind &&
                  prompt.refId === chip.id &&
                  usedIds.has(prompt.id),
              );
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleRef(chip.kind, chip.id)}
                  className={filterChipClass(active)}
                >
                  <span className="truncate">{chip.label}</span>
                  {active || covered ? (
                    <Check className="h-[11px] w-[11px] shrink-0" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const section = (label: string, prompts: JournalPrompt[]) => {
    if (prompts.length === 0) return null;
    return (
      <div>
        <div className="pt-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-[#8A6424]">
          {label}
        </div>
        {prompts.map((prompt) => (
          <PromptRow
            key={prompt.id}
            prompt={prompt}
            used={usedIds.has(prompt.id)}
            onPick={onPick}
          />
        ))}
      </div>
    );
  };

  const body = (
    <>
      <div className="flex flex-wrap gap-1.5">
        {JOURNAL_PROMPT_TOPICS.map((topic) => {
          const active =
            topic.id === "all"
              ? filter.kind === "all"
              : filter.kind === "topic" && filter.topic === topic.id;
          return (
            <button
              key={topic.id}
              type="button"
              aria-pressed={active}
              onClick={() => toggleTopic(topic.id === "all" ? "all" : topic.id)}
              className={filterChipClass(active)}
            >
              {topic.label}
            </button>
          );
        })}
      </div>
      {group(
        "From my life areas",
        includes.areas,
        (on) => setInclude("areas", on),
        sources.areas
          .filter((area) => area.title.trim())
          .map((area) => ({
            id: area.id,
            label: area.title.trim(),
            kind: "area" as const,
          })),
      )}
      {group(
        "From my values",
        includes.values,
        (on) => setInclude("values", on),
        sources.values
          .filter((value) => value.text.trim())
          .map((value) => ({
            id: value.id,
            label: value.text.trim(),
            kind: "value" as const,
          })),
      )}
      {group(
        "From my Heal items",
        includes.heal,
        (on) => setInclude("heal", on),
        sources.healItems
          .filter((item) => item.title.trim())
          .map((item) => ({
            id: item.id,
            label: item.title.trim(),
            kind: "heal" as const,
          })),
      )}
      {section("From this entry", fromEntry)}
      {section("Prompts", rest)}
    </>
  );

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[130]">
      <button
        type="button"
        aria-label="Close prompts"
        className="absolute inset-0 cursor-pointer bg-[rgb(15_27_45_/_0.4)] sm:bg-[rgb(15_27_45_/_0.18)]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Prompts"
        className="absolute inset-x-0 bottom-0 top-[120px] flex flex-col overflow-hidden rounded-t-[24px] border border-b-0 border-border bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2.5 shadow-xl sm:inset-y-3 sm:right-3 sm:left-auto sm:top-3 sm:w-[min(380px,calc(100%-1.5rem))] sm:rounded-[18px] sm:border sm:pb-4 sm:pt-4 sm:shadow-[0_2px_12px_rgba(15,27,45,0.05)]"
      >
        <div className="flex justify-center pb-2 sm:hidden" aria-hidden>
          <span className="h-[5px] w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center">
          <span className="flex-1 text-[11.5px] font-semibold uppercase tracking-[1.4px] text-[#8A6424]">
            Prompts
          </span>
          <button
            type="button"
            aria-label="Close prompts"
            onClick={onClose}
            className="flex cursor-pointer text-muted hover:text-foreground"
          >
            <X className="size-[18px]" strokeWidth={1.8} aria-hidden />
          </button>
        </div>
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain">
          {body}
        </div>
      </div>
    </div>,
    document.body,
  );
}

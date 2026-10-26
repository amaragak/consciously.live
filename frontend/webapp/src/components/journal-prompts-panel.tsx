import * as Switch from "@radix-ui/react-switch";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
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
  return `inline-flex h-[30px] max-w-full cursor-pointer items-center gap-1 truncate rounded-full border px-3 text-[13px] transition-colors ${
    active
      ? "border-[#C8A46A] bg-[#C8A46A] font-semibold text-[#0F1B2D]"
      : "border-[#E6D3AE] bg-card font-medium text-foreground hover:border-accent/50"
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
      className="relative h-[22px] w-10 shrink-0 cursor-pointer rounded-full border border-[#AFC2DC] bg-[#E7E1D6] transition-colors data-[state=checked]:bg-[#C9D7EA]"
    >
      <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
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
      className="flex w-full cursor-pointer items-start gap-2.5 border-t border-[#E6D3AE] py-[11px] text-left"
    >
      <span
        className={`min-w-0 flex-1 text-[14.5px] leading-snug ${
          used ? "text-muted line-through" : "text-foreground"
        }`}
      >
        <JournalPromptQuestion template={prompt.template} name={prompt.name} />
      </span>
      <SelectChevron direction="right" className="mt-0.5 text-accent-link" />
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
    sub: string,
    on: boolean,
    setOn: (v: boolean) => void,
    chips: { id: string; label: string; kind: "area" | "value" | "heal" }[],
  ) => {
    if (chips.length === 0) return null;
    return (
      <div className="flex flex-col gap-2.5 border-t border-[#E6D3AE] pt-3">
        <div className="flex items-center gap-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] text-foreground">{title}</span>
            <span className="block text-[12px] text-muted">{sub}</span>
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
        <div className="pt-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto rounded-[18px] border border-border bg-card px-[18px] py-4 shadow-[0_2px_12px_rgba(15,27,45,0.05)]">
      <div className="flex items-center">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          Prompts
        </span>
        <button
          type="button"
          aria-label="Close prompts"
          onClick={onClose}
          className="flex cursor-pointer text-muted hover:text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
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
        "Include my life areas",
        "Tap one to see only its prompts",
        includes.areas,
        (on) => setInclude("areas", on),
        sources.areas
          .filter((area) => area.title.trim())
          .map((area) => ({ id: area.id, label: area.title.trim(), kind: "area" as const })),
      )}
      {group(
        "Include my values",
        "Tap one to see only its prompts",
        includes.values,
        (on) => setInclude("values", on),
        sources.values
          .filter((value) => value.text.trim())
          .map((value) => ({ id: value.id, label: value.text.trim(), kind: "value" as const })),
      )}
      {group(
        "Include my Heal items",
        "Tap one to see only its prompts",
        includes.heal,
        (on) => setInclude("heal", on),
        sources.healItems
          .filter((item) => item.title.trim())
          .map((item) => ({ id: item.id, label: item.title.trim(), kind: "heal" as const })),
      )}
      {section("From this entry", fromEntry)}
      {section("Prompts", rest)}
    </div>
  );
}

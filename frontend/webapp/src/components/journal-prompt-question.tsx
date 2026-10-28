import {
  journalEntryListTitle,
  journalPromptMarksFromHtml,
  type JournalEntry,
} from "@/lib/journal-storage";

/** Gold inline name chip, same treatment as Story prompt names. */
export const JOURNAL_PROMPT_NAME_CHIP =
  "inline whitespace-nowrap rounded px-[5px] font-medium text-accent-link [background:var(--accent-soft)] [box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_55%,white)]";

export function JournalPromptQuestion({
  template,
  name,
  className = "",
}: {
  template: string;
  name?: string;
  className?: string;
}) {
  const label = name?.trim() ?? "";
  if (!label || !template.includes("{name}")) {
    return <span className={className}>{template}</span>;
  }
  const parts = template.split("{name}");
  return (
    <span className={className}>
      {parts[0]}
      <span className={JOURNAL_PROMPT_NAME_CHIP}>{label}</span>
      {parts.slice(1).join(label)}
    </span>
  );
}

export function JournalEntryListTitle({
  entry,
  className = "",
  fallback = "Untitled entry",
}: {
  entry: Pick<JournalEntry, "title" | "contentHtml" | "entryDate" | "createdAt">;
  className?: string;
  fallback?: string;
}) {
  const typed = entry.title.trim();
  if (typed) return <span className={className}>{typed}</span>;
  const mark = journalPromptMarksFromHtml(entry.contentHtml)[0];
  if (mark) {
    return (
      <span className={className}>
        <JournalPromptQuestion template={mark.template} name={mark.name} />
      </span>
    );
  }
  const label = journalEntryListTitle(entry, fallback);
  return <span className={className}>{label}</span>;
}

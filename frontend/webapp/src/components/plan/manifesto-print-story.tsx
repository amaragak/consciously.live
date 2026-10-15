/**
 * Manifesto print — story chapter + compose-mode control (Full · Summary · Choose · Off).
 */

import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "@/lib/spa-nav";
import { Sparkles } from "lucide-react";
import {
  countWords,
  resolveStoryOnPrint,
  storySectionKey,
  versionSections,
  type ManifestoStoryStoreV1,
  type StoryOnPrintChooseStyle,
  type StoryOnPrintMode,
  type StoryOnPrintSettings,
  type StoryVersion,
  type StoryVersionSection,
} from "@/lib/manifesto-story";

const LIGHT = "color-mix(in srgb, var(--gold) 70%, white)";
const SERIF_DISPLAY: CSSProperties = { fontVariationSettings: "'opsz' 144" };
const SERIF_TEXT: CSSProperties = { fontVariationSettings: "'opsz' 24" };

function Rule() {
  return (
    <span
      aria-hidden
      className="block h-px flex-1"
      style={{ background: LIGHT }}
    />
  );
}

function caps(size: number, letterSpacing: number): CSSProperties {
  return {
    fontSize: size,
    letterSpacing,
    fontWeight: 600,
    textTransform: "uppercase",
  };
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function DropCapPassage({
  text,
  indentLater,
}: {
  text: string;
  indentLater: boolean;
}) {
  const paras = paragraphs(text);
  if (paras.length === 0) return null;
  return (
    <>
      {paras.map((p, i) => {
        if (i === 0) {
          const first = p.charAt(0);
          const rest = p.slice(1);
          return (
            <p key={i} className="m-0" data-print-break>
              <span
                className="font-display float-left text-marketing-ink"
                style={{
                  ...SERIF_DISPLAY,
                  fontWeight: 300,
                  fontSize: 76,
                  lineHeight: 0.8,
                  padding: "8px 12px 0 0",
                }}
              >
                {first}
              </span>
              {rest}
            </p>
          );
        }
        return (
          <p
            key={i}
            className="m-0"
            style={{ textIndent: indentLater ? 28 : 0 }}
          >
            {p}
          </p>
        );
      })}
    </>
  );
}

function SectionBlock({
  heading,
  text,
  showHeading,
  dropCap,
  gapAfter,
}: {
  heading: string;
  text: string;
  showHeading: boolean;
  dropCap: boolean;
  gapAfter: number;
}) {
  const paras = paragraphs(text);
  return (
    <div className="flex flex-col" style={{ gap: showHeading ? 6 : 0 }}>
      {showHeading ? (
        <div
          className="font-ui text-accent-link"
          style={{ ...caps(10.5, 2.2), marginBottom: 2 }}
          data-print-break
        >
          {heading}
        </div>
      ) : null}
      {dropCap ? (
        <DropCapPassage text={text} indentLater />
      ) : (
        paras.map((p, i) => (
          <p
            key={i}
            className="m-0"
            style={{ textIndent: i === 0 ? 0 : 28 }}
            data-print-break={i === 0 ? true : undefined}
          >
            {p}
          </p>
        ))
      )}
      <div aria-hidden style={{ height: gapAfter }} />
    </div>
  );
}

export type PrintStoryData = {
  firstName: string;
  version: StoryVersion | null;
  settings: StoryOnPrintSettings;
};

export type PrintStoryCompose = {
  settings: StoryOnPrintSettings;
  onPatchSettings: (patch: Partial<StoryOnPrintSettings>) => void;
  onEditSummary: (text: string) => void;
  onEditSectionSummary: (key: string, text: string) => void;
  onRegenerateSummary: () => void;
  onRegenerateSectionSummaries: () => void;
  regenerating: boolean;
  storyHref: string;
};

/** Latest prepared version for the print chapter. */
export function printStoryFromStore(
  store: ManifestoStoryStoreV1,
  firstName: string,
): PrintStoryData {
  const version = store.versions[0] ?? null;
  return {
    firstName,
    version,
    settings: resolveStoryOnPrint(store),
  };
}

function EditableSummary({
  text,
  compose,
  onSave,
  className,
  style,
}: {
  text: string;
  compose: boolean;
  onSave: (v: string) => void;
  className?: string;
  style?: CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  if (!compose || !editing) {
    return (
      <p
        className={`${className ?? ""} ${compose ? "cursor-text" : ""}`}
        style={style}
        onClick={compose ? () => setEditing(true) : undefined}
      >
        {text}
      </p>
    );
  }
  return (
    <textarea
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        const next = draft.trim();
        if (next && next !== text) onSave(next);
        else setDraft(text);
      }}
      className="w-full resize-none border-0 bg-transparent p-0 font-display text-[17px] leading-[1.75] text-marketing-ink outline-none"
      style={{ ...SERIF_TEXT, minHeight: 120 }}
      rows={Math.max(4, Math.ceil(draft.length / 60))}
    />
  );
}

export function PrintStoryChapter({
  data,
  compose,
  mobile,
}: {
  data: PrintStoryData;
  compose: PrintStoryCompose | null;
  mobile: boolean;
}) {
  const { firstName, version, settings } = data;
  const mode = settings.mode;

  if (!version) {
    if (!compose) return null;
    return (
      <div
        className="relative flex flex-col"
        style={{ marginTop: 56 }}
        data-compose-chrome
      >
        <ChapterHeader firstName={firstName} mobile={mobile} />
        <Link
          href={compose.storyHref}
          className="mx-auto mt-4 flex w-full max-w-[640px] items-center justify-center rounded-2xl border border-dashed px-4 py-5 text-center text-[13px] font-semibold text-accent-link"
          style={{ borderColor: LIGHT }}
        >
          Write your story and prepare it for narration to add it here →
        </Link>
      </div>
    );
  }

  if (mode === "off") return null;

  const sections = versionSections(version);
  const chosenKeys = new Set(settings.chosen);
  const chosenSections = sections.filter((s) =>
    chosenKeys.has(storySectionKey(s)),
  );

  return (
    <div className="relative flex flex-col" style={{ marginTop: 56 }}>
      <ChapterHeader firstName={firstName} mobile={mobile} />
      {compose && !mobile ? (
        <div
          data-compose-chrome
          className="absolute z-20"
          style={{ top: 0, left: "100%", marginLeft: 16 }}
        >
          <StoryOnPrintPanel
            version={version}
            sections={sections}
            compose={compose}
          />
        </div>
      ) : null}
      {compose && mobile ? (
        <MobileStorySheet
          version={version}
          sections={sections}
          compose={compose}
        />
      ) : null}

      <div
        className="mx-auto flex w-full max-w-[640px] flex-col font-display text-marketing-ink"
        style={{
          ...SERIF_TEXT,
          fontSize: mobile ? 16 : 17,
          lineHeight: 1.75,
          marginTop: 18,
        }}
      >
        {mode === "full"
          ? sections.map((s, i) => (
              <SectionBlock
                key={storySectionKey(s)}
                heading={s.heading}
                text={s.text}
                showHeading={settings.showHeadings}
                dropCap={i === 0}
                gapAfter={i < sections.length - 1 ? 28 : 0}
              />
            ))
          : null}
        {mode === "summary" ? (
          <EditableSummary
            text={
              version.summary?.trim() ||
              "Generating summary… (open Summary controls and tap Regenerate if this stays empty.)"
            }
            compose={Boolean(compose)}
            onSave={(t) => compose?.onEditSummary(t)}
          />
        ) : null}
        {mode === "choose"
          ? (chosenSections.length ? chosenSections : []).map((s, i) => {
              const key = storySectionKey(s);
              const summarised = settings.chooseStyle === "summarised";
              const body = summarised
                ? version.sectionSummaries?.[key]?.trim() || s.text
                : s.text;
              if (summarised) {
                return (
                  <div
                    key={key}
                    className="flex flex-col gap-[6px]"
                    style={{
                      marginBottom: i < chosenSections.length - 1 ? 26 : 0,
                    }}
                  >
                    <div
                      className="font-ui text-accent-link"
                      style={caps(10.5, 2.2)}
                      data-print-break
                    >
                      {s.heading}
                    </div>
                    <EditableSummary
                      text={body}
                      compose={Boolean(compose)}
                      onSave={(t) => compose?.onEditSectionSummary(key, t)}
                    />
                  </div>
                );
              }
              return (
                <SectionBlock
                  key={key}
                  heading={s.heading}
                  text={body}
                  showHeading
                  dropCap={false}
                  gapAfter={i < chosenSections.length - 1 ? 26 : 0}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

function ChapterHeader({
  firstName,
  mobile,
}: {
  firstName: string;
  mobile: boolean;
}) {
  const label = firstName.trim()
    ? `${firstName.trim()}'s story`
    : "Your story";
  return (
    <div
      className="flex items-center text-accent-link"
      style={{ ...caps(mobile ? 9.5 : 10, 3), gap: 16 }}
    >
      <Rule />
      <span>{label}</span>
      <Rule />
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  compact,
}: {
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  return (
    <div
      className="flex rounded-full"
      style={{
        padding: 3,
        gap: 2,
        background: "color-mix(in srgb, var(--muted) 14%, transparent)",
      }}
    >
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`min-w-0 flex-1 cursor-pointer rounded-full text-center font-semibold transition-colors ${
              on
                ? "bg-[color-mix(in_srgb,var(--accent)_22%,white)] text-foreground shadow-[0_1px_2px_rgb(15_27_45_/_0.12)]"
                : "text-muted"
            }`}
            style={{
              fontSize: compact ? 11 : 12,
              padding: compact ? "5px 0" : "6px 0",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function StoryOnPrintPanel({
  version,
  sections,
  compose,
}: {
  version: StoryVersion;
  sections: StoryVersionSection[];
  compose: PrintStoryCompose;
}) {
  const { settings, onPatchSettings } = compose;
  return (
    <div
      className="flex flex-col rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgb(15_27_45_/_0.12)]"
      style={{ width: 262, padding: 12, gap: 10 }}
    >
      <span
        className="font-ui text-muted"
        style={{ ...caps(10, 1.4), fontWeight: 600 }}
      >
        Story on the print
      </span>
      <Segmented<StoryOnPrintMode>
        value={settings.mode}
        onChange={(mode) => onPatchSettings({ mode })}
        options={[
          { id: "full", label: "Full" },
          { id: "summary", label: "Summary" },
          { id: "choose", label: "Choose" },
          { id: "off", label: "Off" },
        ]}
      />
      {settings.mode === "full" ? (
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
          <input
            type="checkbox"
            checked={settings.showHeadings}
            onChange={(e) =>
              onPatchSettings({ showHeadings: e.target.checked })
            }
            className="size-3.5 accent-[var(--accent)]"
          />
          Show prompts as headings
        </label>
      ) : null}
      {settings.mode === "summary" ? (
        <>
          <p className="m-0 text-[12px] leading-[1.4] text-muted">
            AI summary of the whole story, about 150 words. Click the text to
            edit it.
          </p>
          <RegenerateBtn
            label="Regenerate"
            busy={compose.regenerating}
            onClick={compose.onRegenerateSummary}
          />
        </>
      ) : null}
      {settings.mode === "choose" ? (
        <ChooseControls
          version={version}
          sections={sections}
          compose={compose}
        />
      ) : null}
    </div>
  );
}

function ChooseControls({
  version,
  sections,
  compose,
}: {
  version: StoryVersion;
  sections: StoryVersionSection[];
  compose: PrintStoryCompose;
}) {
  const { settings, onPatchSettings } = compose;
  const chosen = new Set(settings.chosen);
  return (
    <>
      <div
        className="flex flex-col gap-1 border-t border-border pt-2"
      >
        {sections.map((s) => {
          const key = storySectionKey(s);
          const on = chosen.has(key);
          const words = countWords(s.text);
          return (
            <label
              key={key}
              className={`flex cursor-pointer items-center gap-2 py-1 text-[13px] ${
                on ? "text-foreground" : "text-muted"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => {
                  const next = new Set(chosen);
                  if (on) next.delete(key);
                  else next.add(key);
                  onPatchSettings({ chosen: [...next] });
                }}
                className="size-3.5 accent-[var(--accent)]"
              />
              <span className="min-w-0 flex-1 truncate">{s.heading}</span>
              <span className="shrink-0 text-[11px] text-muted">{words}</span>
            </label>
          );
        })}
      </div>
      <Segmented<StoryOnPrintChooseStyle>
        value={settings.chooseStyle}
        compact
        onChange={(chooseStyle) => onPatchSettings({ chooseStyle })}
        options={[
          { id: "written", label: "As written" },
          { id: "summarised", label: "Summarised" },
        ]}
      />
      {settings.chooseStyle === "summarised" ? (
        <RegenerateBtn
          label="Regenerate summaries"
          busy={compose.regenerating}
          onClick={compose.onRegenerateSectionSummaries}
        />
      ) : null}
      {!version.summary && settings.chooseStyle === "summarised" ? null : null}
    </>
  );
}

function RegenerateBtn({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 self-start text-[12px] font-semibold text-accent-link disabled:opacity-50"
    >
      <Sparkles
        className={`h-3 w-3 ${busy ? "animate-pulse" : ""}`}
        aria-hidden
      />
      {busy ? "Working…" : label}
    </button>
  );
}

function MobileStorySheet({
  version,
  sections,
  compose,
}: {
  version: StoryVersion;
  sections: StoryVersionSection[];
  compose: PrintStoryCompose;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-compose-chrome
        onClick={() => setOpen(true)}
        className="mx-auto mt-3 inline-flex h-8 cursor-pointer items-center rounded-full border border-border bg-card px-3 text-[12px] font-semibold text-foreground"
      >
        Story
      </button>
      {open ? (
        <div
          data-compose-chrome
          className="fixed inset-0 z-[80] flex flex-col justify-end"
        >
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-[rgb(15_27_45_/_0.42)]"
            onClick={() => setOpen(false)}
          />
          <div className="relative max-h-[70vh] overflow-auto rounded-t-[22px] bg-card px-4 pb-6 pt-3 shadow-[0_-12px_40px_rgb(15_27_45_/_0.25)]">
            <span
              aria-hidden
              className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border"
            />
            <StoryOnPrintPanel
              version={version}
              sections={sections}
              compose={compose}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Ensure summaries exist when Summary / Choose·Summarised is selected. */
export function storyNeedsSummaries(
  version: StoryVersion | null,
  settings: StoryOnPrintSettings,
): "whole" | "sections" | null {
  if (!version) return null;
  if (settings.mode === "summary" && !version.summary?.trim()) return "whole";
  if (
    settings.mode === "choose" &&
    settings.chooseStyle === "summarised"
  ) {
    const keys = versionSections(version).map(storySectionKey);
    const missing = keys.some((k) => !version.sectionSummaries?.[k]?.trim());
    if (missing) return "sections";
  }
  return null;
}

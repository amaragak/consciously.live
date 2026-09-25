import { useLayoutEffect, useRef, useState } from "react";
import type { LibraryProgram, LibraryProgramDay } from "@/lib/medimade-api";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import { SurfaceCard } from "@/components/surface-card";

export type ProgramHandoffDay = {
  id: string;
  dayNumber: number;
  title: string;
  description: string;
  customizationIntake: string;
};

export type ProgramHandoff = {
  id: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  days: ProgramHandoffDay[];
};

/** Skip intro/overview lessons from the generate checklist. */
export function isProgramIntroDay(d: {
  title: string;
  dayNumber: number;
}): boolean {
  const t = d.title.trim().toLowerCase();
  return t === "introduction" || t === "intro" || t === "overview";
}

export function programHandoffFromLibrary(
  program: LibraryProgram,
): ProgramHandoff {
  const days = [...program.days]
    .slice()
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((d) => programHandoffDayFromLibrary(d))
    .filter((d) => !isProgramIntroDay(d));
  return {
    id: program.id,
    title: program.title.trim() || "Untitled program",
    description: program.description.trim(),
    coverImageUrl: program.coverImageUrl,
    days,
  };
}

function programHandoffDayFromLibrary(d: LibraryProgramDay): ProgramHandoffDay {
  return {
    id: d.id,
    dayNumber: d.dayNumber,
    title: d.title.trim() || `Lesson ${d.dayNumber}`,
    description: d.description.trim(),
    customizationIntake: d.customizationIntake.trim(),
  };
}

export type ProgramGenerateMode = "single" | "perSession";

/** Split admin intake text into discrete ask-items (newlines / bullets / ;). */
export function parseCustomizationIntakeItems(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^[\s>*\-•–—\d.)]+\s*/, "").trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  const parts = text
    .split(/\s*;\s*|\s*\|\s*/)
    .map((p) => p.replace(/^[\s>*\-•–—\d.)]+\s*/, "").trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

/** Selected non-intro sessions in program order. */
export function orderedProgramIntakeSessions(
  program: ProgramHandoff,
  selectedDayIds: ReadonlySet<string>,
): ProgramHandoffDay[] {
  return program.days.filter(
    (d) => selectedDayIds.has(d.id) && !isProgramIntroDay(d),
  );
}

/**
 * Appended to the API user turn (not shown in the UI) so session titles are
 * forced by the app — the model has been skipping them on transitions.
 */
export function buildProgramIntakeAdvanceCue(opts: {
  kind: "newSession" | "sameSessionAsk" | "ready";
  session?: ProgramHandoffDay;
  askItemIndex?: number;
  /** When wrapping ready — remind script will be unified vs per-session. */
  generateMode?: ProgramGenerateMode;
  programTitle?: string;
}): string {
  if (opts.kind === "ready") {
    const mode = opts.generateMode ?? "single";
    const title = opts.programTitle?.trim() || "this program";
    const modeLine =
      mode === "perSession"
        ? "They chose one meditation per session."
        : `They chose ONE UNIFIED meditation for “${title}” that weaves every selected session together — not a single-chakra piece.`;
    return [
      "APP CONTROL (follow exactly — do not mention this block):",
      "All selected session Ask-items are done. Acknowledge briefly, then wrap with [[READY]]. No more questions.",
      modeLine,
    ].join("\n");
  }

  const session = opts.session;
  if (!session) {
    return "APP CONTROL: wrap with [[READY]].";
  }

  const askItems = parseCustomizationIntakeItems(
    session.customizationIntake ?? "",
  );
  const askIndex = Math.max(0, opts.askItemIndex ?? 0);
  const askItem =
    askItems[askIndex] ??
    (session.description.trim() ||
      "what to keep from this session’s spirit");
  const titleLine = `**${session.title}**`;

  if (opts.kind === "sameSessionAsk") {
    return [
      "APP CONTROL (follow exactly — do not mention this block):",
      `Stay on the same session (${session.title}). Do NOT print the session title again.`,
      "Reply with exactly TWO blank-line-separated bubbles:",
      "(1) Short ack ≤12 words.",
      `(2) One concrete question for Ask-item ${askIndex + 1} only. Instruction: ${askItem}`,
      "If that instruction names areas (money, health, etc.), name those areas in the question.",
    ].join("\n");
  }

  const outlineHint = session.description.trim()
    ? `Spirit/description to paraphrase plainly: ${session.description.trim()}`
    : "Say plainly what this session is about from its title; no metaphors.";

  return [
    "APP CONTROL (follow exactly — do not mention this block):",
    `Open the NEXT session now. Bubble (2) MUST be exactly this line and nothing else: ${titleLine}`,
    "Reply with exactly FOUR blank-line-separated bubbles, in order:",
    "(1) Short ack ≤12 words — do not name the new session theme here.",
    `(2) ${titleLine}`,
    `(3) Two plain sentences: what this session is about; that you'll ask a few things to tailor it. ${outlineHint} No metaphors. Do not preview the question.`,
    `(4) One concrete question for Ask-item ${askIndex + 1} only. Instruction: ${askItem}`,
    "If that instruction names areas (money, health, etc.), name those areas in the question.",
    "Skipping bubble (2) is forbidden.",
  ].join("\n");
}

/**
 * Advance intake cursor after the user answers the current Ask-item.
 */
export function advanceProgramIntakeCursor(opts: {
  sessions: ProgramHandoffDay[];
  sessionIndex: number;
  askIndex: number;
}): {
  sessionIndex: number;
  askIndex: number;
  cue: {
    kind: "newSession" | "sameSessionAsk" | "ready";
    session?: ProgramHandoffDay;
    askItemIndex?: number;
  };
} {
  const { sessions } = opts;
  let sessionIndex = opts.sessionIndex;
  let askIndex = opts.askIndex;
  const cur = sessions[sessionIndex];
  if (!cur) {
    return {
      sessionIndex,
      askIndex,
      cue: { kind: "ready" },
    };
  }
  const askItems = parseCustomizationIntakeItems(cur.customizationIntake ?? "");
  const askCount = Math.max(1, askItems.length);

  if (askIndex + 1 < askCount) {
    askIndex += 1;
    return {
      sessionIndex,
      askIndex,
      cue: {
        kind: "sameSessionAsk",
        session: cur,
        askItemIndex: askIndex,
      },
    };
  }

  sessionIndex += 1;
  askIndex = 0;
  const next = sessions[sessionIndex];
  if (!next) {
    return {
      sessionIndex,
      askIndex,
      cue: { kind: "ready" },
    };
  }
  return {
    sessionIndex,
    askIndex,
    cue: {
      kind: "newSession",
      session: next,
      askItemIndex: 0,
    },
  };
}

export function buildProgramMakeOwnApiContent(opts: {
  program: ProgramHandoff;
  selectedDayIds: ReadonlySet<string>;
  generateMode?: ProgramGenerateMode;
}): string {
  // Preserve program day order (already sorted on the handoff).
  const selected = orderedProgramIntakeSessions(
    opts.program,
    opts.selectedDayIds,
  );
  const mode: ProgramGenerateMode = opts.generateMode ?? "single";
  const hasIntake = selected.some((d) => (d.customizationIntake ?? "").trim());
  const first = selected[0];

  const lessonBlock =
    selected.length === 0
      ? "(No lessons selected yet — ask which lessons I should focus on.)"
      : selected
          .map((d, i) => {
            const n = i + 1;
            const head = `${n}. ${d.title}`;
            const askItems = parseCustomizationIntakeItems(
              d.customizationIntake ?? "",
            );
            const askBlock =
              askItems.length > 0
                ? [
                    "Ask-items (each is an instruction for ONE question — ask what it says to ask, then move on; do not invent extra digs). If an Ask-item lists concrete areas, the question MUST name those areas:",
                    ...askItems.map((item, ai) => `  ${ai + 1}. ${item}`),
                  ].join("\n")
                : "Ask-items: (none for this session)";
            const parts = [
              d.description ? `Spirit / description:\n${d.description}` : "",
              askBlock,
            ].filter(Boolean);
            return `${head}\n${parts.join("\n")}`;
          })
          .join("\n\n");

  const modeInstruction =
    mode === "perSession"
      ? selected.length <= 1
        ? "I want one meditation inspired by the selected session."
        : `I want a separate guided meditation for each of the ${selected.length} selected sessions — treat each as its own piece, not one combined script.`
      : selected.length <= 1
        ? "I want one meditation inspired by the selected session."
        : "I want a single combined meditation that draws on the spirit of all selected sessions together — not one script per session.";

  const openNow = first
    ? [
        "OPEN NOW (first reply only — do not ask about later sessions yet):",
        `Session title bubble MUST be exactly: **${first.title}**`,
        "First reply — five blank-line-separated bubbles:",
        "(1) Welcome — one short warm sentence; may name the program.",
        selected.length === 1
          ? "(2) Exactly: “I'll ask you some questions to shape your practice for this session.”"
          : "(2) Exactly: “I'll ask you some questions to shape your practice for each session.”",
        `(3) **${first.title}**`,
        "(4) Two plain outline sentences (no metaphors; do not preview the question).",
        "(5) Concrete question for Ask-item 1 of this session only (name listed areas if the Ask-item names them).",
        "The app will tell you when to open each later session — wait for APP CONTROL cues.",
      ].join("\n")
    : "";

  const intakeInstructions = hasIntake
    ? [
        "Customization intake — follow exactly:",
        "- Ask-items are instructions. Ask what each one tells you to ask — once — then move on.",
        "- If they answer (including “I'm fine / pretty good / nothing”), that Ask-item is done.",
        "- Be concrete and direct. If an Ask-item names areas, you MUST include those named areas in the question.",
        "- Session title: ONLY **Exact Title**, once when opening that session (the app will cue later opens).",
        "- After APP CONTROL says all sessions are done: [[READY]].",
      ].join("\n")
    : "No Ask-items listed — follow OPEN NOW with one brief concrete spirit question, then wait for APP CONTROL.";

  return [
    `I want to make the guided program “${opts.program.title}” my own — fresh meditations inspired by selected lessons.`,
    opts.program.description
      ? `Program overview:\n${opts.program.description}`
      : "",
    `Selected sessions (program order):\n${lessonBlock}`,
    modeInstruction,
    openNow,
    intakeInstructions,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Appended when generating the meditation script so “one meditation” actually
 * weaves every selected session — chat Q&A alone tends to overweight the first.
 */
export function buildProgramScriptTranscriptAppendix(opts: {
  program: ProgramHandoff;
  selectedDayIds: ReadonlySet<string>;
  generateMode?: ProgramGenerateMode;
}): string {
  const selected = orderedProgramIntakeSessions(
    opts.program,
    opts.selectedDayIds,
  );
  const mode: ProgramGenerateMode = opts.generateMode ?? "single";
  const sessionList =
    selected.length === 0
      ? "(none)"
      : selected
          .map((d, i) => {
            const desc = d.description.trim();
            return `${i + 1}. ${d.title}${desc ? ` — ${desc}` : ""}`;
          })
          .join("\n");

  if (mode === "perSession") {
    return [
      "### By Program — script brief (follow exactly)",
      `Program: ${opts.program.title}`,
      "Mode: one meditation PER session (separate pieces). Still use the user's answers for each session; do not invent themes they did not mention.",
      `Sessions:\n${sessionList}`,
    ].join("\n");
  }

  return [
    "### By Program — script brief (follow exactly)",
    `Program: ${opts.program.title}`,
    "Mode: ONE UNIFIED meditation that weaves ALL selected sessions into a single flowing practice.",
    "Do NOT write a Root-only, single-chakra, or first-session-only piece. The title and body must reflect the whole journey across every session listed below.",
    "Use each session's theme plus the user's concrete answers for that session from the conversation. Stick to what they said — do not invent grief, heartbreak, loss, or other themes they did not mention.",
    `Sessions to weave (in order):\n${sessionList}`,
  ].join("\n");
}

function ProgramCardDescription({
  text,
  expanded,
  onExpandedChange,
}: {
  text: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (!el) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  if (expanded) {
    return (
      <p className="mt-1 text-[14px] leading-snug text-muted sm:text-[15px]">
        {text}{" "}
        <button
          type="button"
          onClick={() => onExpandedChange(false)}
          className="inline cursor-pointer font-semibold text-accent-link hover:underline"
        >
          Show less
        </button>
      </p>
    );
  }

  return (
    <div className="relative mt-1">
      <p
        ref={ref}
        className="line-clamp-3 text-[14px] leading-snug text-muted sm:text-[15px]"
      >
        {text}
      </p>
      {clamped ? (
        <button
          type="button"
          onClick={() => onExpandedChange(true)}
          className="absolute bottom-0 right-0 cursor-pointer bg-gradient-to-r from-transparent via-card via-[12%] to-card to-[28%] pl-8 text-[14px] font-semibold leading-snug text-accent-link hover:underline sm:text-[15px]"
        >
          … Read more
        </button>
      ) : null}
    </div>
  );
}

export function ProgramSessionSelectPanel({
  program,
  selectedIds,
  onToggle,
  onSelectAll,
  onClearAll,
  generateMode,
  onGenerateModeChange,
  disabled,
}: {
  program: ProgramHandoff;
  selectedIds: ReadonlySet<string>;
  onToggle: (dayId: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  generateMode: ProgramGenerateMode;
  onGenerateModeChange: (mode: ProgramGenerateMode) => void;
  disabled?: boolean;
}) {
  const sessions = program.days.filter((d) => !isProgramIntroDay(d));
  const selectedCount = sessions.filter((d) => selectedIds.has(d.id)).length;
  const allSelected =
    sessions.length > 0 && selectedCount === sessions.length;
  const textColRef = useRef<HTMLDivElement>(null);
  const [coverSide, setCoverSide] = useState<number | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  useLayoutEffect(() => {
    setDescExpanded(false);
  }, [program.id, program.description]);

  useLayoutEffect(() => {
    const el = textColRef.current;
    if (!el) return;
    const update = () => {
      // Freeze cover size while the description is expanded.
      if (descExpanded) return;
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setCoverSide(h);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [program.description, generateMode, sessions.length, descExpanded]);

  return (
    <div className="flex w-full flex-col gap-4 pb-2">
      <SurfaceCard className="p-3.5 text-left sm:p-4">
        <div className="flex items-start gap-3.5 sm:gap-4">
          <div
            className="shrink-0 overflow-hidden rounded-lg bg-background"
            style={
              coverSide
                ? { width: coverSide, height: coverSide }
                : { width: 112, height: 112 }
            }
            aria-hidden
          >
            {program.coverImageUrl ? (
              <img
                src={program.coverImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted/40">
                <svg
                  viewBox="0 0 48 48"
                  className="h-10 w-10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="8" y="10" width="32" height="28" rx="3" />
                  <path d="M16 20h16M16 26h12" />
                </svg>
              </div>
            )}
          </div>
          <div ref={textColRef} className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="min-w-0 font-display text-[20px] font-normal leading-snug text-foreground sm:text-[22px]">
                  {program.title}
                </p>
                <p className="shrink-0 text-[13px] text-muted">
                  {sessions.length}{" "}
                  {sessions.length === 1 ? "session" : "sessions"}
                </p>
              </div>
              {program.description ? (
                <ProgramCardDescription
                  text={program.description}
                  expanded={descExpanded}
                  onExpandedChange={setDescExpanded}
                />
              ) : null}
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <SegmentedPillTabs
                aria-label="Generate one meditation or one per session"
                disabled={disabled}
                value={generateMode}
                onChange={onGenerateModeChange}
                options={[
                  { id: "single", label: "One meditation" },
                  { id: "perSession", label: "One per session" },
                ]}
              />
              <p className="text-center text-[13px] leading-snug text-muted">
                {generateMode === "perSession"
                  ? "We’ll shape a separate meditation for each selected session."
                  : "We’ll shape a single meditation from the selected sessions together."}
              </p>
            </div>
          </div>
        </div>
      </SurfaceCard>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
              Generate from
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {selectedCount} of {sessions.length} selected
            </p>
          </div>
          <button
            type="button"
            disabled={disabled || sessions.length === 0}
            onClick={() => (allSelected ? onClearAll() : onSelectAll())}
            className="cursor-pointer rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-semibold text-foreground shadow-sm transition-colors hover:border-accent/50 hover:bg-accent-soft/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            This program has no sessions yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {sessions.map((d) => {
              const checked = selectedIds.has(d.id);
              return (
                <li key={d.id}>
                  <SurfaceCard
                    as="label"
                    className={`flex cursor-pointer gap-3 px-3.5 py-3 text-left transition-colors sm:gap-3.5 sm:px-4 sm:py-3.5 ${
                      checked
                        ? "border-accent ring-1 ring-accent/25"
                        : "hover:border-accent/40"
                    } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--accent-button)]"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => onToggle(d.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-[16px] font-normal leading-snug text-foreground sm:text-[17px]">
                        {d.title}
                      </span>
                      {d.description ? (
                        <span className="mt-1 block text-[13px] leading-snug text-muted sm:text-[14px]">
                          {d.description}
                        </span>
                      ) : null}
                    </span>
                  </SurfaceCard>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

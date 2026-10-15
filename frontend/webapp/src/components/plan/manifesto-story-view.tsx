import * as Switch from "@radix-ui/react-switch";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  Mic,
  Plus,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wand2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { appendSpokenText, useWhisperDictation } from "@/hooks/use-whisper-dictation";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  getMedimadeSessionDisplayName,
  getMedimadeSessionEmail,
} from "@/lib/auth-session";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import { firstNameFromAccount, romanNumeral } from "@/lib/manifesto-print";
import {
  STORY_LISTEN_GOAL_MIN,
  addStoryVersion,
  addUpdatedStoryVersion,
  composeSectionsForUpdate,
  countWords,
  draftIsEmpty,
  draftPlainText,
  listeningFillPercent,
  listeningMinutes,
  loadManifestoStoryStore,
  patchVersionSectionText,
  saveManifestoStoryStore,
  saveManifestoStoryStoreLocal,
  storyNarrationDrift,
  storySectionKey,
  versionSections,
  type ManifestoStoryStoreV1,
  type StoryVersionSection,
} from "@/lib/manifesto-story";
import { SegmentedPillTabs } from "@/components/segmented-pill-tabs";
import {
  STORY_ANSWER_PLACEHOLDER,
  STORY_OPENER_PLACEHOLDER,
  STORY_OPENER_PROMPT_ID,
  areaRefIdFromPromptId,
  draftHasPromptLabel,
  draftSectionsForCompose,
  insertPromptLabel,
  isTextHiddenByCollapse,
  parseStoryDraft,
  promptsDoneFromDraft,
  removePromptLabel,
  serializeStoryDraft,
  toggleLabelCollapsed,
  wordsOwnedByLabel,
  type RaiseLifeAreaMeta,
  type StoryDraftNode,
} from "@/lib/manifesto-story-draft";
import {
  ambitionLabel,
  composeStoryThirdPerson,
  findingTypeLabel,
  lockedSentenceRanges,
  pruneRaiseLocks,
  raiseLockFromAcceptedSpan,
  raiseLocksForPassedSentences,
  raiseStoryCeiling,
  raiseSuggestionLabel,
  regenerateStorySuggestion,
  stripOvertlyNegativeRaiseLocks,
  type StoryFinding,
} from "@/lib/manifesto-story-llm";
import { fetchUserSettings } from "@/lib/settings-api";
import {
  mergeAccountPronouns,
  readAccountPronounsLocal,
} from "@/lib/settings-local-defaults";
import type { AccountPronouns } from "@/lib/story-pronouns";
import {
  STORY_OPENER_PROMPT,
  STORY_PROMPT_TOPICS,
  buildStoryPromptLibrary,
  orderUnusedStoryPrompts,
  promptGroupHasCoverage,
  type StoryPrompt,
  type StoryPromptFilter,
  type StoryPromptTopicKey,
} from "@/lib/manifesto-story-prompts";
import { loadPlanDreamsStore } from "@/lib/plan-dreams";
import { useIdeateCloud } from "@/components/plan/ideate-cloud-provider";
import {
  ManifestoStoryNarrateRail,
  type NarrationCardState,
} from "@/components/plan/manifesto-story-narrate-rail";
import {
  ManifestoStoryPrepareCheck,
  type PrepareCheckDecision,
} from "@/components/plan/manifesto-story-prepare-check";
import { ensureManifestoStoryReminderPoller } from "@/lib/manifesto-story-reminder";
import {
  APP_MOBILE_TAB_BAR_CHANGED,
  APP_MOBILE_TAB_BAR_GAP_PX,
  getAppMobileTabBarState,
} from "@/lib/app-mobile-tab-bar";

/* ------------------------------------------------------------- constants */

const LIGHT = "color-mix(in srgb, var(--gold) 70%, white)";
const SERIF_DISPLAY: CSSProperties = { fontVariationSettings: "'opsz' 144" };
const SERIF_TEXT: CSSProperties = { fontVariationSettings: "'opsz' 24" };
const MIN_WORDS_TO_COMPOSE = 150;
const AUTOSAVE_MS = 1000;

const CARD =
  "rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]";
/** Match Manifesto print / overview pages — keep cards clear of the shell. */
const PAGE =
  "mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-4 px-4 pb-10 pt-4 sm:px-6";
/** Mobile stacks cards with a 12px gap. */
const PAGE_MOBILE = PAGE.replace("gap-4", "gap-3");
const BTN_PRIMARY =
  "accent-fill-gradient inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.45]";
const BTN_OUTLINE =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-[0.45]";
const LABEL_CAPS =
  "font-ui text-[10px] font-semibold uppercase tracking-[2.6px] text-accent-link";

/* --------------------------------------------------------------- helpers */

function useSessionFirstName(): string {
  const read = () =>
    firstNameFromAccount(
      getMedimadeSessionDisplayName(),
      getMedimadeSessionEmail(),
    );
  const [name, setName] = useState(read);
  useEffect(() => {
    const sync = () => setName(read());
    window.addEventListener("medimade-session-changed", sync);
    return () => window.removeEventListener("medimade-session-changed", sync);
  }, []);
  return name;
}

const emptyText = (): StoryDraftNode => ({ kind: "text", text: "" });

/**
 * Guarantee the structure the editor relies on: every label is followed by a
 * text node, a break is always preceded by one, and the draft ends in text.
 */
function normalizeNodes(nodes: readonly StoryDraftNode[]): StoryDraftNode[] {
  const out: StoryDraftNode[] = [];
  for (const n of nodes) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === "label" && n.kind !== "text") {
      out.push(emptyText());
    }
    if (n.kind === "break" && (!prev || prev.kind === "break")) {
      out.push(emptyText());
    }
    out.push(n);
  }
  const last = out[out.length - 1];
  if (!last || last.kind !== "text") out.push(emptyText());
  return out;
}

function nodesFromDraft(draft: string): StoryDraftNode[] {
  return normalizeNodes(parseStoryDraft(draft));
}

/** Story body only — prompt labels never reach the model. */
function bodyDraft(nodes: readonly StoryDraftNode[]): string {
  return serializeStoryDraft(nodes.filter((n) => n.kind !== "label"));
}

function lastTextIndex(nodes: readonly StoryDraftNode[]): number {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i]!.kind === "text") return i;
  }
  return -1;
}

/** Index of the label that owns the text node at `index`, or -1. */
function owningLabelIndex(
  nodes: readonly StoryDraftNode[],
  index: number,
): number {
  for (let i = index - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (n.kind === "break") return -1;
    if (n.kind === "label") return i;
  }
  return -1;
}

type LiveFinding = {
  id: string;
  /** Index of the text node in the draft nodes. */
  node: number;
  start: number;
  end: number;
  quote: string;
  type: StoryFinding["type"];
  suggestion: string;
};

type RawFinding = Pick<StoryFinding, "id" | "quote" | "type" | "suggestion">;

/** promptId or `"opening"` for the text node’s owning section. */
function sectionKeyForDraftNode(
  nodes: readonly StoryDraftNode[],
  nodeIndex: number,
): string {
  let key = "opening";
  for (let i = 0; i <= nodeIndex; i++) {
    const n = nodes[i];
    if (n?.kind === "label") key = n.promptId;
  }
  return key;
}

function filterFindingsToSectionKeys(
  findings: readonly LiveFinding[],
  nodes: readonly StoryDraftNode[],
  keys: readonly string[] | null,
): LiveFinding[] {
  if (!keys || keys.length === 0) return [...findings];
  const set = new Set(keys);
  return findings.filter((f) =>
    set.has(sectionKeyForDraftNode(nodes, f.node)),
  );
}

/** Find each quote inside the text nodes (the model works on plain text). */
function locateFindings(
  nodes: readonly StoryDraftNode[],
  raw: readonly RawFinding[],
): LiveFinding[] {
  const out: LiveFinding[] = [];
  for (const f of raw) {
    if (!f.quote) continue;
    let placed = false;
    for (let ni = 0; ni < nodes.length && !placed; ni++) {
      const n = nodes[ni]!;
      if (n.kind !== "text") continue;
      let from = 0;
      for (;;) {
        const idx = n.text.indexOf(f.quote, from);
        if (idx < 0) break;
        const end = idx + f.quote.length;
        const clash = out.some(
          (o) => o.node === ni && !(end <= o.start || idx >= o.end),
        );
        if (!clash) {
          out.push({
            id: f.id,
            node: ni,
            start: idx,
            end,
            quote: f.quote,
            type: f.type,
            suggestion: f.suggestion,
          });
          placed = true;
          break;
        }
        from = idx + 1;
      }
    }
  }
  return out.sort((a, b) => a.node - b.node || a.start - b.start);
}

/** Shift findings after an edit; drop any finding the edit touched. */
function adjustFindings(
  findings: readonly LiveFinding[],
  node: number,
  oldText: string,
  newText: string,
): LiveFinding[] {
  const max = Math.min(oldText.length, newText.length);
  let p = 0;
  while (p < max && oldText[p] === newText[p]) p++;
  let s = 0;
  while (
    s < max - p &&
    oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]
  ) {
    s++;
  }
  const oldTail = oldText.length - s;
  const delta = newText.length - oldText.length;
  const out: LiveFinding[] = [];
  for (const f of findings) {
    if (f.node !== node) {
      out.push(f);
    } else if (f.end <= p) {
      out.push(f);
    } else if (f.start >= oldTail) {
      out.push({ ...f, start: f.start + delta, end: f.end + delta });
    }
  }
  return out;
}

/* ------------------------------------------------------- small widgets */

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
      className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full border border-border bg-muted transition-colors data-[state=checked]:border-accent-button data-[state=checked]:bg-accent-button disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Switch.Thumb className="block h-4 w-4 translate-x-[2px] rounded-full bg-card shadow-sm transition-transform will-change-transform data-[state=checked]:translate-x-[16px]" />
    </Switch.Root>
  );
}

function ListeningMeter({
  words,
  compact,
}: {
  words: number;
  compact?: boolean;
}) {
  const mins = listeningMinutes(words);
  const fill = listeningFillPercent(words);
  return (
    <div
      className={
        compact
          ? "w-full min-w-0"
          : "ml-auto min-w-[260px] max-w-full shrink-0 basis-[420px]"
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-1">
        <span
          className={`font-display text-foreground ${compact ? "text-xl" : "text-2xl"}`}
          style={SERIF_DISPLAY}
        >
          {mins} min
        </span>
        <span
          className={`text-foreground/80 ${compact ? "text-xs" : "text-[13px]"}`}
        >
          of listening · {words.toLocaleString()} words
        </span>
        <span className="ml-auto text-xs text-muted">
          Goal {STORY_LISTEN_GOAL_MIN} min
        </span>
      </div>
      <div className="relative mt-2 h-[6px] rounded-[3px] bg-border">
        <div
          className="h-full rounded-[3px] bg-accent transition-[width] duration-300"
          style={{ width: `${fill}%` }}
        />
        <span
          aria-hidden
          className="absolute -top-[4px] right-0 h-[14px] w-[2px] bg-accent-link"
        />
      </div>
    </div>
  );
}

const HOLD_BACK =
  "Don’t hold back. Write the biggest version of your life you can imagine.";
const VISION_SUBLINE =
  "Your whole life vision, written as if it’s already true. Aim for ten minutes of listening.";

function PageHeader({
  words,
  wide,
  toolbar,
  mobileTitleRight,
  mobileTabs,
  mobileFooter,
  showSubline = true,
  /** Writing A/D uses the hold-back line; guidelines / B keep the vision subline. */
  holdBackSubline = false,
}: {
  words: number;
  wide: boolean;
  toolbar?: ReactNode;
  mobileTitleRight?: ReactNode;
  /** Full-width draft/narration toggle between title and meter. */
  mobileTabs?: ReactNode;
  /** When set (mobile writing), the card is title row + meter + footer. */
  mobileFooter?: ReactNode;
  showSubline?: boolean;
  holdBackSubline?: boolean;
}) {
  const meter = <ListeningMeter words={words} compact={!wide} />;
  const subline = holdBackSubline ? (
    <p
      className={`font-display italic leading-[1.45] text-accent-link ${
        wide ? "text-base" : "-mt-1 text-sm"
      }`}
      style={SERIF_TEXT}
    >
      {HOLD_BACK}
    </p>
  ) : (
    <p className={`text-foreground/80 ${wide ? "text-[15px]" : "text-[13px]"}`}>
      {VISION_SUBLINE}
    </p>
  );

  if (!wide) {
    if (mobileFooter || mobileTabs) {
      return (
        <div className={`${CARD} flex flex-col gap-3 px-4 py-3.5`}>
          <div className="flex items-center justify-between gap-3">
            <h2
              className="font-display text-2xl text-foreground"
              style={SERIF_DISPLAY}
            >
              Your story
            </h2>
            {mobileTitleRight}
          </div>
          {mobileTabs}
          {showSubline ? subline : null}
          {meter}
          {mobileFooter}
        </div>
      );
    }
    return (
      <div
        className={`${CARD} flex flex-col ${
          showSubline ? "gap-3.5 p-[18px]" : "gap-3 px-4 py-3.5"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              className="font-display text-2xl text-foreground"
              style={SERIF_DISPLAY}
            >
              Your story
            </h2>
            {showSubline ? subline : null}
          </div>
          {mobileTitleRight}
        </div>
        {meter}
      </div>
    );
  }

  return (
    <div
      className={`${CARD} flex flex-col ${
        toolbar ? "gap-[18px] px-8 pb-[18px] pt-[22px]" : "px-8 py-[22px]"
      }`}
    >
      <div className="flex flex-wrap items-end gap-8">
        <div className="flex min-w-0 flex-col gap-[6px]">
          <h2
            className="font-display text-[30px] font-normal leading-tight text-foreground"
            style={SERIF_DISPLAY}
          >
            Your story
          </h2>
          {showSubline ? subline : null}
        </div>
        {meter}
      </div>
      {toolbar}
    </div>
  );
}

function TalkButton({
  height,
  recording,
  busy,
  onClick,
  className = "",
}: {
  height: string;
  recording: boolean;
  busy: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={recording}
      className={`${BTN_OUTLINE} ${height} ${className} ${
        recording ? "border-accent bg-accent-soft" : ""
      }`}
    >
      <Mic
        className={`h-4 w-4 ${recording ? "animate-pulse text-accent-link" : ""}`}
        aria-hidden
      />
      {busy ? "Transcribing…" : recording ? "Stop" : "Talk it out"}
    </button>
  );
}

function Rule() {
  return (
    <span
      aria-hidden
      className="block h-px flex-1"
      style={{ backgroundColor: LIGHT }}
    />
  );
}

/**
 * Floating Raise + mic toolbar. Desktop: 24px from bottom, right-aligned to the
 * writing card. Mobile: bottom-right; lifts above the on-screen keyboard via
 * visualViewport (and Capacitor Keyboard when present).
 */
function FloatingEditorTools({
  wide,
  anchorRef,
  hidden,
  raising,
  raiseDisabled,
  onRaise,
  recording,
  busy,
  onTalk,
}: {
  wide: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  hidden: boolean;
  raising: boolean;
  raiseDisabled: boolean;
  onRaise: () => void;
  recording: boolean;
  busy: boolean;
  onTalk: () => void;
}) {
  const [rightPx, setRightPx] = useState(24);
  const [bottomPx, setBottomPx] = useState(wide ? 24 : 16);
  const [tabLift, setTabLift] = useState(0);

  useEffect(() => {
    if (wide) {
      setTabLift(0);
      return;
    }
    const sync = () => {
      const s = getAppMobileTabBarState();
      setTabLift(s.visible ? s.offsetPx + APP_MOBILE_TAB_BAR_GAP_PX : 0);
    };
    sync();
    window.addEventListener(APP_MOBILE_TAB_BAR_CHANGED, sync);
    return () => window.removeEventListener(APP_MOBILE_TAB_BAR_CHANGED, sync);
  }, [wide]);

  useEffect(() => {
    if (!wide) return;
    const measure = () => {
      const el = anchorRef.current;
      if (!el || typeof window === "undefined") return;
      const rect = el.getBoundingClientRect();
      setRightPx(Math.max(14, window.innerWidth - rect.right));
    };
    measure();
    window.addEventListener("resize", measure);
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (anchorRef.current) ro?.observe(anchorRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [wide, anchorRef]);

  useEffect(() => {
    if (wide) {
      setBottomPx(24);
      return;
    }
    const base = 16 + tabLift;
    const vv = window.visualViewport;
    const sync = () => {
      if (!vv) {
        setBottomPx(base);
        return;
      }
      const occluded = Math.max(
        0,
        window.innerHeight - (vv.height + vv.offsetTop),
      );
      setBottomPx(occluded > 40 ? occluded + 8 : base);
    };
    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);

    let disposeCap: (() => void) | undefined;
    void (async () => {
      try {
        // Optional native plugin — not listed in webapp deps; load at runtime only.
        const load = new Function(
          "return import('@capacitor/keyboard')",
        ) as () => Promise<{
          Keyboard?: {
            addListener: (
              e: string,
              cb: (info: { keyboardHeight: number }) => void,
            ) => Promise<{ remove: () => void }>;
          };
        }>;
        const Keyboard = (await load()).Keyboard;
        if (!Keyboard?.addListener) return;
        const show = await Keyboard.addListener("keyboardWillShow", (info) => {
          setBottomPx(Math.max(base, (info.keyboardHeight ?? 0) + 8));
        });
        const hide = await Keyboard.addListener("keyboardWillHide", () => {
          setBottomPx(base);
        });
        disposeCap = () => {
          show.remove();
          hide.remove();
        };
      } catch {
        /* web / no Capacitor */
      }
    })();

    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      disposeCap?.();
    };
  }, [wide, tabLift]);

  if (hidden || typeof document === "undefined") return null;

  const h = wide ? "h-[34px]" : "h-8";
  const mic = wide ? "h-[34px] w-[34px]" : "h-8 w-8";

  return createPortal(
    <div
      role="toolbar"
      aria-label="Story editor tools"
      className="pointer-events-auto fixed z-40 flex items-center gap-2 rounded-full border border-border bg-card p-[5px]"
      style={{
        bottom: bottomPx,
        right: wide ? rightPx : 14,
        boxShadow: "0 8px 22px color-mix(in srgb, var(--foreground) 14%, transparent)",
      }}
    >
      <button
        type="button"
        onClick={onRaise}
        disabled={raiseDisabled}
        className={`accent-fill-gradient inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-3 text-xs font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.45] ${h}`}
      >
        <Sparkles
          className={`h-[13px] w-[13px] ${raising ? "animate-pulse" : ""}`}
          aria-hidden
        />
        {raising ? "Reading…" : "Raise the ceiling"}
      </button>
      <button
        type="button"
        onClick={onTalk}
        disabled={busy}
        aria-label="Talk it out"
        aria-pressed={recording}
        title={busy ? "Transcribing…" : recording ? "Stop" : "Talk it out"}
        className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border text-foreground transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-[0.45] ${mic} ${
          recording ? "border-accent bg-accent-soft" : "border-border bg-card"
        }`}
      >
        <Mic
          className={`h-[15px] w-[15px] ${recording ? "animate-pulse text-accent-link" : ""}`}
          aria-hidden
        />
      </button>
    </div>,
    document.body,
  );
}

/* ---------------------------------------------------------- story cards */

function Paper({
  wide,
  title,
  headerRight,
  children,
  className = "",
  variant = "writing",
  bare = false,
  hideHeader = false,
  cardRef,
}: {
  wide: boolean;
  title: string;
  /** Plain string (caps caption) or a node (tools). */
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Writing (A/D) vs third-person version (B) padding. */
  variant?: "writing" | "version";
  /** Header row holds only `headerRight`, left-aligned (no title or rule). */
  bare?: boolean;
  /** Writing card: content starts at the first label / paragraph. */
  hideHeader?: boolean;
  cardRef?: RefObject<HTMLDivElement | null>;
}) {
  const padWide =
    variant === "version"
      ? "min-h-[700px] gap-[18px] px-14 pb-11 pt-10"
      : "min-h-[700px] gap-[18px] px-14 pb-14 pt-10";
  const right =
    typeof headerRight === "string" ? (
      <span className="font-ui text-[10px] font-medium uppercase tracking-[2.6px] text-muted">
        {headerRight}
      </span>
    ) : (
      headerRight
    );
  return (
    <div
      ref={cardRef}
      className={`${CARD} relative flex min-w-0 flex-1 flex-col ${
        wide ? padWide : "gap-4 px-[18px] py-5"
      } ${className}`}
    >
      {hideHeader ? null : bare ? (
        right ? <div className="relative flex items-center">{right}</div> : null
      ) : (
        <div className="relative flex items-center justify-between gap-3">
          <span
            className={`min-w-0 font-display font-normal leading-tight text-accent-link ${
              wide ? "text-xl" : "text-lg"
            }`}
          >
            {title}
          </span>
          {right ? <span className="shrink-0">{right}</span> : null}
        </div>
      )}
      {children}
    </div>
  );
}

/* ------------------------------------------------------- guidelines (C) */

const GUIDE_ITEMS: readonly { title: string; body: string }[] = [
  {
    title: "Write it as already true.",
    body: "Present tense, as if you’re living it now. “I am”, never “I will” or “I hope”.",
  },
  {
    title: "Go further than feels sensible.",
    body: "Delusional optimism is the point. If it sounds a bit much, you’re close. Then go bigger.",
  },
  {
    title: "Make it specific.",
    body: "Names, places, numbers. What you see, hear and feel on an ordinary day.",
  },
  {
    title: "Cover the whole of you.",
    body: "Who you are and how you feel, the people around you, your work, your body, your home.",
  },
  {
    title: "Write long.",
    body: "About 1,400 words makes ten minutes of listening. Use the mic if typing slows you down.",
  },
  {
    title: "First person is fine.",
    body: "Write “I”. We’ll turn it into the third person, by name, when you prepare it for narration.",
  },
];

function GuidelinesPaper({
  wide,
  onStart,
  onTalk,
  onBack,
  recording,
  busy,
}: {
  wide: boolean;
  onStart: () => void;
  onTalk: () => void;
  onBack?: () => void;
  recording: boolean;
  busy: boolean;
}) {
  const rule = <div aria-hidden className="h-px w-full bg-border" />;
  return (
    <div
      className={`${CARD} flex flex-col text-left ${
        wide
          ? "gap-[22px] px-8 pb-[30px] pt-7"
          : "gap-4 px-[18px] pb-[22px] pt-5"
      }`}
    >
      <div className="flex flex-col gap-2">
        <span className="font-ui text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          Before you start
        </span>
        <h3
          className={`font-display font-normal leading-[1.2] text-foreground ${
            wide ? "text-[26px]" : "text-[22px]"
          }`}
          style={SERIF_TEXT}
        >
          How to write your story
        </h3>
        <p
          className={`max-w-[640px] leading-[1.55] text-foreground ${
            wide ? "text-[15px]" : "text-sm"
          }`}
        >
          A long, vivid description of your life as you want it, already real.
          You’ll listen to it every night until it feels familiar.
        </p>
      </div>
      {rule}
      <ol
        className={`grid list-none p-0 ${
          wide
            ? "grid-cols-1 gap-x-12 gap-y-6 md:grid-cols-2"
            : "grid-cols-1 gap-y-4"
        }`}
      >
        {GUIDE_ITEMS.map((item, i) => (
          <li key={item.title} className="flex gap-3.5">
            <span
              className={`shrink-0 font-display font-normal italic leading-none text-accent ${
                wide ? "w-[30px] text-[22px]" : "w-[30px] text-xl"
              }`}
              style={SERIF_TEXT}
            >
              {romanNumeral(i + 1)}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h4
                className={`font-display leading-[1.3] text-foreground ${
                  wide ? "text-lg" : "text-[17px]"
                }`}
                style={SERIF_TEXT}
              >
                {item.title}
              </h4>
              <p
                className={`leading-[1.55] text-foreground ${
                  wide ? "text-sm" : "text-[13px]"
                }`}
              >
                {item.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {rule}
      <div className="flex flex-wrap items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={`${BTN_PRIMARY} h-11 px-8`}
          >
            Back to writing
          </button>
        ) : wide ? (
          <>
            <button
              type="button"
              onClick={onStart}
              className={`${BTN_PRIMARY} h-11 px-8`}
            >
              Start writing
            </button>
            <TalkButton
              height="h-11"
              recording={recording}
              busy={busy}
              onClick={onTalk}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- side cards */

const PROMPTS_PAGE = 6;
const USED_OPEN_KEY = "consciously.story.prompts.usedOpen";
const NAME_TAG =
  "inline whitespace-nowrap rounded px-[5px] font-medium text-accent-link [background:var(--accent-soft)] [box-shadow:inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_55%,white)]";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function PromptNameTag({
  name,
  onClick,
}: {
  name: string;
  onClick?: () => void;
}) {
  if (!onClick) {
    return <span className={NAME_TAG}>{name}</span>;
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`${NAME_TAG} cursor-pointer`}
    >
      {name}
    </button>
  );
}

function PromptText({
  prompt,
  className = "",
  onTagClick,
}: {
  prompt: Pick<StoryPrompt, "template" | "text" | "name">;
  className?: string;
  onTagClick?: () => void;
}) {
  if (!prompt.name || !prompt.template.includes("{name}")) {
    return <span className={className}>{prompt.text}</span>;
  }
  const parts = prompt.template.split("{name}");
  return (
    <span className={className}>
      {parts[0]}
      <PromptNameTag name={prompt.name} onClick={onTagClick} />
      {parts.slice(1).join(prompt.name)}
    </span>
  );
}

function filterChipClass(active: boolean): string {
  return `inline-flex h-7 max-w-full cursor-pointer items-center gap-1 truncate rounded-full border px-3 text-xs transition-colors ${
    active
      ? "border-selected bg-selected font-semibold text-on-selected"
      : "border-border bg-card text-foreground hover:border-accent/50"
  }`;
}

function PromptsCard({
  store,
  doneIds,
  filter,
  onFilter,
  unused,
  used,
  library,
  areas,
  values,
  onPick,
  onOpenUsed,
  onToggleAreas,
  onToggleValues,
  bare = false,
}: {
  store: ManifestoStoryStoreV1;
  doneIds: readonly string[];
  filter: StoryPromptFilter;
  onFilter: (f: StoryPromptFilter) => void;
  unused: StoryPrompt[];
  used: StoryPrompt[];
  library: readonly StoryPrompt[];
  areas: { id: string; title: string }[];
  values: { id: string; text: string }[];
  onPick: (p: StoryPrompt) => void;
  onOpenUsed: (promptId: string) => void;
  onToggleAreas: (v: boolean) => void;
  onToggleValues: (v: boolean) => void;
  /** Contents only (inside the mobile sheet): no card surface or heading. */
  bare?: boolean;
}) {
  const [shown, setShown] = useState(PROMPTS_PAGE);
  const [usedOpen, setUsedOpen] = useState(() => {
    try {
      return localStorage.getItem(USED_OPEN_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [exit, setExit] = useState<{
    id: string;
    phase: "check" | "collapse";
  } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const exitPrompt = exit
    ? (library.find((p) => p.id === exit.id) ?? null)
    : null;

  useEffect(() => {
    setShown(PROMPTS_PAGE);
  }, [filter, store.includeLifeAreas, store.includeValues]);

  const setUsedOpenPersist = (open: boolean) => {
    setUsedOpen(open);
    try {
      localStorage.setItem(USED_OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const displayUnused = useMemo(() => {
    const list = unused.slice();
    if (exitPrompt && !list.some((p) => p.id === exitPrompt.id)) {
      list.unshift(exitPrompt);
    }
    return list;
  }, [unused, exitPrompt]);

  const visible = displayUnused.slice(0, shown);
  const totalForCount = unused.length;

  const runPick = (p: StoryPrompt) => {
    if (exit) return;
    if (prefersReducedMotion()) {
      onPick(p);
      setHighlightId(p.id);
      window.setTimeout(() => setHighlightId((id) => (id === p.id ? null : id)), 1200);
      return;
    }
    setExit({ id: p.id, phase: "check" });
    window.setTimeout(() => {
      setExit({ id: p.id, phase: "collapse" });
      window.setTimeout(() => {
        onPick(p);
        setExit(null);
        setHighlightId(p.id);
        window.setTimeout(
          () => setHighlightId((id) => (id === p.id ? null : id)),
          1200,
        );
      }, 250);
    }, 150);
  };

  const toggleTopic = (topic: StoryPromptTopicKey | "all") => {
    if (topic === "all") {
      onFilter({ kind: "all" });
      return;
    }
    if (filter.kind === "topic" && filter.topic === topic) {
      onFilter({ kind: "all" });
      return;
    }
    onFilter({ kind: "topic", topic });
  };

  const toggleArea = (refId: string) => {
    if (filter.kind === "area" && filter.refId === refId) {
      onFilter({ kind: "all" });
      return;
    }
    onFilter({ kind: "area", refId });
  };

  const toggleValue = (refId: string) => {
    if (filter.kind === "value" && filter.refId === refId) {
      onFilter({ kind: "all" });
      return;
    }
    onFilter({ kind: "value", refId });
  };

  return (
    <div
      className={
        bare
          ? "flex flex-col gap-[10px] px-[18px] pb-[18px]"
          : `${CARD} flex flex-col gap-[10px] px-[18px] py-4`
      }
    >
      {bare ? null : <span className={LABEL_CAPS}>Prompts</span>}
      <div className="flex flex-wrap gap-1.5">
        {STORY_PROMPT_TOPICS.map((t) => {
          const active =
            t.id === "all"
              ? filter.kind === "all"
              : filter.kind === "topic" && filter.topic === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTopic(t.id === "all" ? "all" : t.id)}
              aria-pressed={active}
              className={filterChipClass(active)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-[10px]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-foreground">Include my life areas</p>
            <p className="text-xs text-muted">Tap one to see only its prompts</p>
          </div>
          <ToggleSwitch
            checked={store.includeLifeAreas}
            onChange={onToggleAreas}
            label="Include my life areas"
          />
        </div>
        {store.includeLifeAreas && areas.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {areas.map((a) => {
              const active = filter.kind === "area" && filter.refId === a.id;
              const covered = promptGroupHasCoverage(
                library,
                doneIds,
                "area",
                a.id,
              );
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleArea(a.id)}
                  aria-pressed={active}
                  className={filterChipClass(active)}
                >
                  <span className="truncate">{a.title}</span>
                  {covered ? (
                    <Check className="h-[11px] w-[11px] shrink-0 text-accent-link" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-[10px]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-foreground">Include my values</p>
            <p className="text-xs text-muted">Tap one to see only its prompts</p>
          </div>
          <ToggleSwitch
            checked={store.includeValues}
            onChange={onToggleValues}
            label="Include my values"
          />
        </div>
        {store.includeValues && values.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {values.map((v) => {
              const active = filter.kind === "value" && filter.refId === v.id;
              const covered = promptGroupHasCoverage(
                library,
                doneIds,
                "value",
                v.id,
              );
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggleValue(v.id)}
                  aria-pressed={active}
                  className={filterChipClass(active)}
                >
                  <span className="truncate">{v.text}</span>
                  {covered ? (
                    <Check className="h-[11px] w-[11px] shrink-0 text-accent-link" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <ul className="m-0 flex list-none flex-col p-0">
        {visible.map((p) => {
          const leaving = exit?.id === p.id;
          const phase = leaving ? exit!.phase : null;
          return (
            <li
              key={p.id}
              className={`overflow-hidden border-t border-border transition-[max-height,opacity,background-color] ${
                phase === "collapse"
                  ? "max-h-0 opacity-0 duration-[250ms]"
                  : "max-h-28 opacity-100 duration-150"
              } ${phase === "check" || phase === "collapse" ? "bg-accent-soft" : ""}`}
            >
              <button
                type="button"
                onClick={() => runPick(p)}
                disabled={Boolean(exit)}
                className="flex w-full cursor-pointer items-start gap-2 py-[9px] text-left disabled:cursor-default"
              >
                <PromptText
                  prompt={p}
                  className="min-w-0 flex-1 text-sm leading-[1.45] text-foreground"
                  onTagClick={
                    p.refId
                      ? () =>
                          p.bucket === "area"
                            ? toggleArea(p.refId!)
                            : toggleValue(p.refId!)
                      : undefined
                  }
                />
                {phase === "check" || phase === "collapse" ? (
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 scale-110 text-accent-link transition-transform duration-150"
                    aria-hidden
                  />
                ) : (
                  <ArrowRight
                    className="mt-0.5 h-4 w-4 shrink-0 transition-opacity duration-150"
                    style={{ color: LIGHT }}
                    aria-hidden
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {shown < totalForCount ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-[10px]">
          <button
            type="button"
            onClick={() => setShown((n) => n + PROMPTS_PAGE)}
            className="cursor-pointer text-[13px] font-semibold text-accent-link transition-opacity hover:opacity-80"
          >
            More prompts
          </button>
          <span className="text-xs text-muted">
            {Math.min(shown, totalForCount)} of {totalForCount}
          </span>
        </div>
      ) : null}

      {used.length > 0 ? (
        <div className="mt-1.5 flex flex-col gap-0.5 border-t border-border pt-[10px]">
          <button
            type="button"
            onClick={() => setUsedOpenPersist(!usedOpen)}
            className="flex w-full cursor-pointer items-center gap-1.5 pb-1 text-left"
            aria-expanded={usedOpen}
          >
            <ChevronDown
              className={`h-[14px] w-[14px] shrink-0 text-muted transition-transform ${
                usedOpen ? "" : "-rotate-90"
              }`}
              aria-hidden
            />
            <span className="font-ui text-[10px] font-semibold uppercase tracking-[1.4px] text-muted">
              Used · {used.length}
            </span>
          </button>
          {usedOpen
            ? used.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpenUsed(p.id)}
                  className={`flex w-full cursor-pointer items-start gap-2.5 rounded-lg py-[7px] text-left transition-colors duration-[1200ms] ${
                    highlightId === p.id
                      ? "bg-accent-soft px-2 -mx-2"
                      : "bg-transparent"
                  }`}
                >
                  <Check
                    className="mt-0.5 h-[13px] w-[13px] shrink-0 text-accent-link"
                    aria-hidden
                  />
                  <PromptText
                    prompt={p}
                    className="min-w-0 flex-1 text-[13px] leading-[1.45] text-muted"
                    onTagClick={
                      p.refId
                        ? () =>
                            p.bucket === "area"
                              ? toggleArea(p.refId!)
                              : toggleValue(p.refId!)
                        : undefined
                    }
                  />
                </button>
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

function AmbitionBlock({ ambition }: { ambition: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span
          className="font-display text-xl text-foreground"
          style={SERIF_DISPLAY}
        >
          {ambitionLabel(ambition)}
        </span>
        <span className="text-xs text-muted">Ambition</span>
      </div>
      <div
        className="relative h-[6px] rounded-[3px]"
        style={{
          backgroundImage: `linear-gradient(90deg, var(--border), ${LIGHT}, var(--accent))`,
        }}
      >
        <span
          aria-hidden
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent-link bg-card"
          style={{ left: `${Math.round(ambition * 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <ThumbsDown className="h-3 w-3 shrink-0" aria-hidden />
          Sensible
        </span>
        <span>Bold</span>
        <span className="inline-flex items-center gap-0.5 text-accent-link">
          Delusional
          <ThumbsUp className="h-3 w-3 shrink-0" aria-hidden />
          <ThumbsUp className="h-3 w-3 shrink-0" aria-hidden />
        </span>
      </div>
    </div>
  );
}

function raiseEmptyCopy(ambition: number): string {
  if (ambition >= 0.7) return "Nothing to raise. That’s already bold.";
  if (ambition <= 0) return "Write a little first — then we can push it further.";
  return "Still in the sensible zone. Keep going, or say the version you’d almost not admit.";
}

function RaiseCard({
  ambition,
  findings,
  activeId,
  onSelect,
  onUseAll,
  onDone,
}: {
  ambition: number;
  findings: LiveFinding[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onUseAll: () => void;
  onDone: () => void;
}) {
  const n = findings.length;
  return (
    <div className={`${CARD} flex flex-col gap-[14px] p-[18px]`}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-accent-link" aria-hidden />
        <span className={LABEL_CAPS}>Raise the ceiling</span>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <AmbitionBlock ambition={ambition} />

      <p
        className="font-display text-[22px] leading-tight text-foreground"
        style={SERIF_DISPLAY}
      >
        {n} {n === 1 ? "place" : "places"} you played it safe
      </p>

      {n > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {findings.map((f) => {
            const active = f.id === activeId;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f.id)}
                  className={`flex w-full cursor-pointer flex-col gap-1 text-left ${
                    active
                      ? "rounded-[10px] border p-[10px]"
                      : "border-t border-border py-[10px]"
                  }`}
                  style={
                    active
                      ? {
                          borderColor: LIGHT,
                          backgroundColor: "var(--accent-soft)",
                        }
                      : undefined
                  }
                >
                  <span className={LABEL_CAPS}>{findingTypeLabel(f.type)}</span>
                  <span className="text-[13px] text-muted">
                    “{f.quote.trim()}”
                  </span>
                  <span className="flex items-start gap-1.5 text-sm text-foreground">
                    <ArrowRight
                      className="mt-0.5 h-4 w-4 shrink-0 text-accent-link"
                      aria-hidden
                    />
                    {raiseSuggestionLabel(f.suggestion)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">{raiseEmptyCopy(ambition)}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onUseAll}
          disabled={n === 0}
          className={`${BTN_PRIMARY} h-10 flex-1`}
        >
          Use all {n}
        </button>
        <button type="button" onClick={onDone} className={`${BTN_OUTLINE} h-10`}>
          <Check className="h-4 w-4" aria-hidden />
          Done
        </button>
      </div>
      <p className="text-xs text-muted">
        Suggestions only. Nothing changes unless you choose it.
      </p>
    </div>
  );
}

/** Mobile "Raise the ceiling" sheet body: active finding expanded in place. */
function RaiseSheetBody({
  ambition,
  findings,
  activeId,
  busy,
  onSelect,
  onUse,
  onAnother,
  onKeep,
}: {
  ambition: number;
  findings: LiveFinding[];
  activeId: string | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onUse: (f: LiveFinding) => void;
  onAnother: (f: LiveFinding) => void;
  onKeep: (f: LiveFinding) => void;
}) {
  const n = findings.length;
  const rowEls = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!activeId) return;
    rowEls.current
      .get(activeId)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  return (
    <div className="flex flex-col gap-3 px-[18px] pb-4">
      <AmbitionBlock ambition={ambition} />
      <p
        className="font-display text-[19px] leading-tight text-foreground"
        style={SERIF_DISPLAY}
      >
        {n} {n === 1 ? "place" : "places"} you played it safe
      </p>
      {n > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {findings.map((f) => {
            const active = f.id === activeId;
            return (
              <li
                key={f.id}
                ref={(el) => {
                  if (el) rowEls.current.set(f.id, el);
                  else rowEls.current.delete(f.id);
                }}
                className={active ? "py-1" : undefined}
              >
                {active ? (
                  <div
                    className="flex flex-col gap-2 rounded-xl border p-3"
                    style={{
                      borderColor: LIGHT,
                      backgroundColor: "var(--accent-soft)",
                    }}
                  >
                    <span className={LABEL_CAPS}>{findingTypeLabel(f.type)}</span>
                    <span className="text-[13px] text-muted">
                      “{f.quote.trim()}”
                    </span>
                    <p
                      className="font-display text-base leading-[1.45] text-foreground"
                      style={SERIF_TEXT}
                    >
                      {raiseSuggestionLabel(f.suggestion)}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onUse(f)}
                        disabled={busy}
                        className={`${BTN_PRIMARY} h-[34px]`}
                      >
                        Use this
                      </button>
                      <button
                        type="button"
                        onClick={() => onAnother(f)}
                        disabled={busy}
                        className={`${BTN_OUTLINE} h-[34px]`}
                      >
                        <Sparkles
                          className={`h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`}
                          aria-hidden
                        />
                        Another
                      </button>
                      <button
                        type="button"
                        onClick={() => onKeep(f)}
                        className="ml-auto cursor-pointer whitespace-nowrap text-[13px] text-muted transition-colors hover:text-foreground"
                      >
                        Keep mine
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(f.id)}
                    className="flex w-full cursor-pointer flex-col gap-1 border-t border-border py-[10px] text-left"
                  >
                    <span className={LABEL_CAPS}>{findingTypeLabel(f.type)}</span>
                    <span className="text-[13px] text-muted">
                      “{f.quote.trim()}”
                    </span>
                    <span className="flex items-start gap-1.5 text-sm text-foreground">
                      <ArrowRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent-link"
                        aria-hidden
                      />
                      {raiseSuggestionLabel(f.suggestion)}
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">{raiseEmptyCopy(ambition)}</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------- bottom sheet */

function BottomSheet({
  open,
  onClose,
  title,
  top,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Distance from the top of the screen, in px (scaled on short screens). */
  top: number;
  footer?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[210] bg-overlay/45 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-border bg-card"
        style={{ top: `min(${top}px, ${Math.round(top / 8)}dvh)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-center gap-2 px-[18px] pb-3 pt-3">
          <Sparkles className="h-4 w-4 text-accent-link" aria-hidden />
          <span className="font-ui text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
        {footer ? (
          <div className="flex gap-2 border-t border-border px-[18px] pb-4 pt-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- the editor */

type FocusRequest = { node: number; pos: number; n: number };

type RaiseInlineActions = {
  onUse: (f: LiveFinding) => void;
  onAnother: (f: LiveFinding) => void;
  onKeep: (f: LiveFinding) => void;
  busy: boolean;
};

function PromptLabelRow({
  wide,
  text,
  collapsed,
  words,
  fresh,
  onToggle,
  onRemove,
  registerEl,
}: {
  wide: boolean;
  text: string;
  collapsed: boolean;
  words: number;
  fresh: boolean;
  onToggle: () => void;
  onRemove: () => void;
  registerEl: (el: HTMLElement | null) => void;
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown;
  const count = collapsed ? (
    <span className="shrink-0 whitespace-nowrap text-xs text-muted">
      {words} {words === 1 ? "word" : "words"}
    </span>
  ) : null;
  const remove = (
    <button
      type="button"
      onClick={onRemove}
      aria-label="Remove prompt label"
      className={`inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-opacity hover:text-foreground focus:opacity-100 ${
        wide && !fresh ? "opacity-0 group-hover:opacity-100" : "opacity-100"
      }`}
    >
      <X className="h-[13px] w-[13px]" aria-hidden />
    </button>
  );

  if (!wide) {
    return (
      <div ref={registerEl} className="flex items-start gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-1.5 text-left"
        >
          <Chevron
            className="mt-px h-3.5 w-3.5 shrink-0 text-muted"
            strokeWidth={1.8}
            aria-hidden
          />
          <span className="font-ui text-xs font-semibold leading-[1.4] tracking-[0.2px] text-accent-link">
            {text}
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-1.5">
          {count}
          {remove}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={registerEl}
      className="group flex items-center gap-1.5"
      style={{ margin: "6px 0 -6px" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        title={text}
        className="flex min-w-0 shrink cursor-pointer items-center gap-1.5 text-left"
      >
        <Chevron
          className="h-3.5 w-3.5 shrink-0 text-muted"
          strokeWidth={1.8}
          aria-hidden
        />
        <span className="truncate font-ui text-xs font-semibold tracking-[0.2px] text-accent-link">
          {text}
        </span>
      </button>
      <span
        aria-hidden
        className="block h-px min-w-[16px] flex-1 bg-border"
      />
      {count}
      {remove}
    </div>
  );
}

/** Desktop quick actions after each Raise `ins` — ✓ / ✕ on every finding; Another only when active. */
function RaiseInlineQuickActions({
  busy,
  showAnother,
  onUse,
  onAnother,
  onKeep,
}: {
  busy: boolean;
  showAnother: boolean;
  onUse: () => void;
  onAnother: () => void;
  onKeep: () => void;
}) {
  return (
    <span
      role="group"
      aria-label="Suggestion actions"
      className="ml-1 inline-flex translate-y-px items-center gap-[3px] whitespace-nowrap align-middle font-ui"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onUse}
        disabled={busy}
        aria-label="Use"
        className={`${BTN_PRIMARY} h-5 w-5 shrink-0 !gap-0 !px-0`}
      >
        <Check className="h-[11px] w-[11px]" aria-hidden strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={onKeep}
        aria-label="Keep mine"
        className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted transition-colors hover:text-foreground"
      >
        <X className="h-[11px] w-[11px]" aria-hidden strokeWidth={2.2} />
      </button>
      {showAnother ? (
        <button
          type="button"
          onClick={onAnother}
          disabled={busy}
          className={`${BTN_OUTLINE} h-5 gap-1 !px-2 text-[11px] font-semibold`}
        >
          <Sparkles
            className={`h-2.5 w-2.5 ${busy ? "animate-pulse" : ""}`}
            aria-hidden
          />
          Another
        </button>
      ) : null}
    </span>
  );
}

/** Faint mist underline on a sentence that has already been raised. */
const RAISED_UNDERLINE: CSSProperties = {
  textDecorationLine: "underline",
  textDecorationColor: "color-mix(in srgb, var(--accent-button) 55%, transparent)",
  textDecorationThickness: "2.5px",
  textUnderlineOffset: "0.18em",
};

/** Mirror layer: transparent glyphs, mist underline on locked sentences. */
function RaisedTextMirror({
  text,
  raiseLocks,
}: {
  text: string;
  raiseLocks: readonly string[];
}) {
  const locks = lockedSentenceRanges(text, raiseLocks);
  if (locks.length === 0) {
    return (
      <>
        {text}
        {"\u200b"}
        {"\n"}
      </>
    );
  }
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const r of locks) {
    if (r.start > cursor) {
      pieces.push(
        <span key={`p-${cursor}`}>{text.slice(cursor, r.start)}</span>,
      );
    }
    pieces.push(
      <span key={`r-${r.start}`} style={RAISED_UNDERLINE}>
        {text.slice(r.start, r.end)}
      </span>,
    );
    cursor = r.end;
  }
  if (cursor < text.length) {
    pieces.push(<span key={`p-${cursor}`}>{text.slice(cursor)}</span>);
  }
  return (
    <>
      {pieces}
      {"\u200b"}
      {"\n"}
    </>
  );
}

/** Plain draft chunks with optional raised underlines (raise-mode leftovers). */
function textWithRaiseUnderlines(
  text: string,
  from: number,
  to: number,
  raiseLocks: readonly string[],
  keyPrefix: string,
): ReactNode[] {
  const slice = text.slice(from, to);
  if (!slice) return [];
  const locks = lockedSentenceRanges(slice, raiseLocks);
  if (locks.length === 0) {
    return [<span key={`${keyPrefix}-${from}`}>{slice}</span>];
  }
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const r of locks) {
    if (r.start > cursor) {
      pieces.push(
        <span key={`${keyPrefix}-p-${from + cursor}`}>
          {slice.slice(cursor, r.start)}
        </span>,
      );
    }
    pieces.push(
      <span
        key={`${keyPrefix}-r-${from + r.start}`}
        style={RAISED_UNDERLINE}
      >
        {slice.slice(r.start, r.end)}
      </span>,
    );
    cursor = r.end;
  }
  if (cursor < slice.length) {
    pieces.push(
      <span key={`${keyPrefix}-p-${from + cursor}`}>{slice.slice(cursor)}</span>,
    );
  }
  return pieces;
}

function StoryEditor({
  wide,
  nodes,
  findings,
  raiseLocks,
  activeId,
  raiseActions,
  focusRequest,
  freshPromptId,
  onChangeText,
  onCaret,
  onPickFinding,
  onRemoveBreak,
  onToggleLabel,
  onRemoveLabel,
  registerSpan,
  registerLabel,
}: {
  wide: boolean;
  nodes: StoryDraftNode[];
  findings: LiveFinding[];
  raiseLocks: readonly string[];
  activeId: string | null;
  raiseActions: RaiseInlineActions;
  focusRequest: FocusRequest | null;
  freshPromptId: string | null;
  onChangeText: (node: number, value: string) => void;
  onCaret: (node: number, pos: number) => void;
  onPickFinding: (id: string | null) => void;
  onRemoveBreak: (node: number) => void;
  onToggleLabel: (node: number) => void;
  onRemoveLabel: (node: number) => void;
  registerSpan: (id: string, el: HTMLElement | null) => void;
  registerLabel: (promptId: string, el: HTMLElement | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const areaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const textStyle: CSSProperties = {
    ...SERIF_TEXT,
    fontSize: wide ? 18 : 16,
    lineHeight: wide ? 1.75 : 1.7,
  };

  useEffect(() => {
    if (!focusRequest) return;
    const ta = areaRefs.current[focusRequest.node];
    if (!ta) return;
    ta.focus();
    const p = Math.min(focusRequest.pos, ta.value.length);
    ta.setSelectionRange(p, p);
  }, [focusRequest]);

  const pickAtCaret = (node: number, ta: HTMLTextAreaElement) => {
    onCaret(node, ta.selectionStart);
    if (ta.selectionStart !== ta.selectionEnd) return;
    const pos = ta.selectionStart;
    const hit = findings.find(
      (f) => f.node === node && pos >= f.start && pos <= f.end,
    );
    onPickFinding(hit ? hit.id : null);
  };

  const textCount = nodes.filter((n) => n.kind === "text").length;
  const hasLabel = nodes.some((n) => n.kind === "label");

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-[18px]">
      {nodes.map((n, i) => {
        if (n.kind === "label") {
          return (
            <PromptLabelRow
              key={`label-${n.promptId}-${i}`}
              wide={wide}
              text={n.text}
              collapsed={n.collapsed}
              words={wordsOwnedByLabel(nodes, i)}
              fresh={freshPromptId === n.promptId}
              onToggle={() => onToggleLabel(i)}
              onRemove={() => onRemoveLabel(i)}
              registerEl={(el) => registerLabel(n.promptId, el)}
            />
          );
        }
        if (n.kind === "break") {
          return (
            <div
              key={`break-${i}`}
              className="group flex items-center gap-3"
              role="separator"
            >
              <Rule />
              <span aria-hidden className="text-sm text-accent">
                ✦
              </span>
              <Rule />
              <button
                type="button"
                onClick={() => onRemoveBreak(i)}
                aria-label="Remove section break"
                className="inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          );
        }

        if (isTextHiddenByCollapse(nodes, i)) return null;

        const text = n.text;
        const prev = nodes[i - 1];
        let placeholder: string | undefined;
        let ariaLabel = i === 0 ? "Your life vision" : "Story section";
        if (prev?.kind === "label") {
          placeholder =
            prev.promptId === STORY_OPENER_PROMPT_ID
              ? STORY_OPENER_PLACEHOLDER
              : STORY_ANSWER_PLACEHOLDER;
          ariaLabel = `Your answer: ${prev.text}`;
        } else if (textCount === 1 && !hasLabel) {
          placeholder = STORY_OPENER_PLACEHOLDER;
        }

        const nodeFindings = findings
          .filter((f) => f.node === i)
          .sort((a, b) => a.start - b.start);

        // Raise mode: tracked-changes preview (del/ins). Draft stays original.
        if (nodeFindings.length > 0) {
          const pieces: ReactNode[] = [];
          let cursor = 0;
          for (const f of nodeFindings) {
            if (f.start > cursor) {
              pieces.push(
                ...textWithRaiseUnderlines(
                  text,
                  cursor,
                  f.start,
                  raiseLocks,
                  `t-${i}`,
                ),
              );
            }
            const active = f.id === activeId;
            const original = text.slice(f.start, f.end);
            pieces.push(
              <span
                key={f.id}
                ref={(el) => registerSpan(f.id, el)}
                className="inline"
              >
                <button
                  type="button"
                  onClick={() => onPickFinding(f.id)}
                  className="cursor-pointer border-0 bg-transparent p-0 font-inherit text-inherit select-none"
                  aria-current={active ? "true" : undefined}
                  aria-label={`Suggestion: ${original.trim() || "phrase"}`}
                >
                  <del className="text-muted no-underline [text-decoration-line:line-through] [text-decoration-color:var(--muted)] [text-decoration-thickness:1px]">
                    {original}
                  </del>
                  {f.suggestion !== "" ? (
                    <>
                      {" "}
                      <ins
                        className={`rounded-[3px] px-0.5 text-foreground no-underline ${
                          raiseActions.busy && active ? "opacity-50" : ""
                        }`}
                        style={{
                          backgroundColor:
                            "color-mix(in srgb, var(--accent) 18%, transparent)",
                          boxShadow: active
                            ? "inset 0 -2px 0 var(--accent)"
                            : "inset 0 -1.5px 0 color-mix(in srgb, var(--accent) 55%, transparent)",
                        }}
                      >
                        {f.suggestion}
                      </ins>
                    </>
                  ) : null}
                </button>
                {wide ? (
                  <RaiseInlineQuickActions
                    busy={raiseActions.busy}
                    showAnother={active}
                    onUse={() => raiseActions.onUse(f)}
                    onAnother={() => raiseActions.onAnother(f)}
                    onKeep={() => raiseActions.onKeep(f)}
                  />
                ) : null}
              </span>,
            );
            cursor = f.end;
          }
          if (cursor < text.length) {
            pieces.push(
              ...textWithRaiseUnderlines(
                text,
                cursor,
                text.length,
                raiseLocks,
                `t-${i}`,
              ),
            );
          }

          return (
            <div
              key={`text-${i}`}
              className="whitespace-pre-wrap font-display text-foreground [overflow-wrap:anywhere]"
              style={textStyle}
              aria-label={ariaLabel}
            >
              {pieces}
            </div>
          );
        }

        return (
          <div key={`text-${i}`} className="grid">
            <div
              aria-hidden
              className="pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap font-display text-transparent [overflow-wrap:anywhere]"
              style={textStyle}
            >
              <RaisedTextMirror text={text} raiseLocks={raiseLocks} />
            </div>
            <textarea
              ref={(el) => {
                areaRefs.current[i] = el;
              }}
              value={text}
              onChange={(e) => {
                onChangeText(i, e.target.value);
                onCaret(i, e.target.selectionStart);
              }}
              onClick={(e) => pickAtCaret(i, e.currentTarget)}
              onKeyUp={(e) => onCaret(i, e.currentTarget.selectionStart)}
              onSelect={(e) => onCaret(i, e.currentTarget.selectionStart)}
              placeholder={placeholder}
              aria-label={ariaLabel}
              spellCheck
              className="col-start-1 row-start-1 h-full w-full resize-none overflow-hidden whitespace-pre-wrap border-0 bg-transparent p-0 font-display text-foreground outline-none placeholder:italic placeholder:text-muted [overflow-wrap:anywhere]"
              style={textStyle}
            />
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------- third-person sections (B) */

function GrowTextarea({
  value,
  onChange,
  wide,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  wide: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, wide]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel ?? "Your story, in the third person"}
      className="w-full resize-none overflow-hidden whitespace-pre-wrap border-0 bg-transparent p-0 font-display text-foreground outline-none [overflow-wrap:anywhere]"
      style={{
        ...SERIF_TEXT,
        fontSize: wide ? 18 : 16,
        lineHeight: wide ? 1.75 : 1.7,
      }}
    />
  );
}

function formatPreparedAt(iso: string | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

function NarrationOutOfDateBanner({
  changedCount,
  busyLabel,
  onUpdate,
  wide,
}: {
  changedCount: number;
  /** Null when idle; "Checking…" / "Preparing…" while busy. */
  busyLabel: string | null;
  onUpdate: () => void;
  wide: boolean;
}) {
  const n = changedCount;
  const label = `Update ${n} section${n === 1 ? "" : "s"}`;
  const busy = Boolean(busyLabel);
  return (
    <div
      className={`flex gap-3 rounded-xl border border-accent/25 bg-accent-soft/40 px-3.5 py-3 ${
        wide ? "items-center" : "flex-col"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Clock
          className="mt-0.5 h-4 w-4 shrink-0 text-accent-link"
          aria-hidden
        />
        <div className="min-w-0 flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-foreground">
            Your draft has changed since this was prepared
          </p>
          <p className="text-[13px] text-foreground/80">
            Update just those sections, or keep this version as it is.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onUpdate}
        disabled={busy}
        className={`${BTN_PRIMARY} h-[34px] shrink-0 px-4 text-[13px] ${
          wide ? "" : "w-full"
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Wand2 className="h-3.5 w-3.5" aria-hidden />
        )}
        {busy ? busyLabel : label}
      </button>
    </div>
  );
}

function NarrationSectionEditor({
  section,
  promptLabel,
  outOfDate,
  highlighted,
  wide,
  composing,
  onChange,
  onUpdateSection,
  sectionRef,
}: {
  section: StoryVersionSection;
  /** Draft prompt question (or short heading fallback) shown above the text. */
  promptLabel: string;
  outOfDate: boolean;
  highlighted: boolean;
  wide: boolean;
  composing: boolean;
  onChange: (text: string) => void;
  onUpdateSection: () => void;
  sectionRef?: (el: HTMLDivElement | null) => void;
}) {
  const label = promptLabel.trim();
  return (
    <div
      ref={sectionRef}
      className={`flex flex-col gap-1.5 rounded-md transition-[background-color] duration-[1200ms] ${
        outOfDate ? "pl-4" : ""
      } ${highlighted ? "bg-accent-soft/50" : "bg-transparent"}`}
      style={
        outOfDate
          ? { boxShadow: "inset 2px 0 0 var(--accent)" }
          : undefined
      }
    >
      {label ? (
        wide ? (
          <div
            className="flex items-center gap-1.5"
            style={{ margin: "0 0 -2px" }}
          >
            <span
              className="min-w-0 truncate font-ui text-xs font-semibold tracking-[0.2px] text-accent-link"
              title={label}
            >
              {label}
            </span>
            <span
              aria-hidden
              className="block h-px min-w-[16px] flex-1 bg-border"
            />
          </div>
        ) : (
          <span className="font-ui text-xs font-semibold leading-[1.4] tracking-[0.2px] text-accent-link">
            {label}
          </span>
        )
      ) : null}
      {outOfDate ? (
        <div className="flex items-center gap-2.5 font-ui">
          <span className="text-[10px] font-semibold uppercase tracking-[1.3px] text-accent-link">
            {wide ? "Changed in your draft" : "Changed"}
          </span>
          <button
            type="button"
            disabled={composing}
            onClick={onUpdateSection}
            className="cursor-pointer text-xs font-semibold text-accent-link underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {wide ? "Update this section" : "Update"}
          </button>
        </div>
      ) : null}
      <GrowTextarea
        wide={wide}
        value={section.text}
        onChange={onChange}
        ariaLabel={
          label
            ? `Narration section: ${label}`
            : section.heading
              ? `Narration section: ${section.heading}`
              : "Narration section"
        }
      />
    </div>
  );
}

type StoryViewTab = "draft" | "narration";

const STORY_TAB_TRACK =
  "border-0 bg-border p-[3px] rounded-full";
const STORY_TAB_SELECTED =
  "bg-card text-foreground shadow-[0_1px_3px_rgba(15,27,45,0.14)] py-[7px] px-3.5 text-[12px] font-semibold sm:text-[13px]";
const STORY_TAB_IDLE =
  "text-foreground/80 py-[7px] px-3.5 text-[12px] font-semibold sm:text-[13px] hover:text-foreground";

/* ------------------------------------------------------------ main view */

export function ManifestoStoryView() {
  const wide = useMinWidth(768);
  const firstName = useSessionFirstName();
  const dict = useWhisperDictation();
  const { ready: cloudReady, revision } = useIdeateCloud();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    ensureManifestoStoryReminderPoller();
  }, []);

  const [store, setStore] = useState<ManifestoStoryStoreV1>(() =>
    loadManifestoStoryStore(),
  );
  const storeRef = useRef(store);
  storeRef.current = store;
  const dirtyRef = useRef(false);

  const reloadStore = useCallback(() => {
    if (dirtyRef.current) return;
    const next = loadManifestoStoryStore();
    storeRef.current = next;
    setStore(next);
  }, []);

  useEffect(() => {
    window.addEventListener("focus", reloadStore);
    return () => window.removeEventListener("focus", reloadStore);
  }, [reloadStore]);

  // Re-read after cloud pull / other ideate writers (HMR loses in-memory only).
  useEffect(() => {
    if (!cloudReady) return;
    reloadStore();
  }, [cloudReady, revision, reloadStore]);

  const [areas] = useState(() =>
    loadPlanDreamsStore().dreams.map((d) => ({ id: d.id, title: d.title })),
  );
  const [values] = useState(() =>
    loadIdeateValuesStore().values.map((v) => ({ id: v.id, text: v.text })),
  );

  /** Fresh dream/vision meta for Raise (life-area prompts). */
  const raiseLifeAreas = (): RaiseLifeAreaMeta[] =>
    loadPlanDreamsStore().dreams.map((d) => ({
      id: d.id,
      title: d.title,
      dream: (d.dreamText || d.firstThought || "").trim(),
      vision: (d.visionText || "").trim(),
    }));

  const raiseValuesContext = () => {
    const list = loadIdeateValuesStore().values;
    const values = list.map((v) => v.text.trim()).filter(Boolean);
    const valuesById: Record<string, string> = {};
    for (const v of list) {
      if (v.text.trim()) valuesById[v.id] = v.text.trim();
    }
    return { values, valuesById };
  };

  const [started, setStarted] = useState(false);
  const [showGuides, setShowGuides] = useState(false);
  const [promptsSheet, setPromptsSheet] = useState(false);
  const [filter, setFilter] = useState<StoryPromptFilter>({ kind: "all" });
  const [recentUsed, setRecentUsed] = useState<string[]>([]);
  const [mobileSkip, setMobileSkip] = useState(0);
  const [mobileFade, setMobileFade] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [freshPromptId, setFreshPromptId] = useState<string | null>(null);
  const caretRef = useRef<{ node: number; pos: number } | null>(null);
  const labelEls = useRef(new Map<string, HTMLElement>());

  const [raise, setRaise] = useState<{
    ambition: number;
    findings: LiveFinding[];
  } | null>(null);
  const [raising, setRaising] = useState(false);
  const [raiseError, setRaiseError] = useState<string | null>(null);
  const [raiseSheet, setRaiseSheet] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [anotherBusy, setAnotherBusy] = useState(false);
  const spanRefs = useRef(new Map<string, HTMLElement>());
  const writingCardRef = useRef<HTMLDivElement | null>(null);

  const [composePhase, setComposePhase] = useState<
    "idle" | "checking" | "preparing"
  >("idle");
  const composing = composePhase !== "idle";
  const composeBusyLabel =
    composePhase === "checking"
      ? "Checking…"
      : composePhase === "preparing"
        ? "Preparing…"
        : null;
  const [prepareGate, setPrepareGate] = useState<{
    ambition: number;
    findings: LiveFinding[];
    onlyKeys: string[] | null;
  } | null>(null);
  const [prepareDecisions, setPrepareDecisions] = useState<
    Record<string, PrepareCheckDecision>
  >({});
  const [prepareAnotherBusyId, setPrepareAnotherBusyId] = useState<
    string | null
  >(null);
  const [narrationCardState, setNarrationCardState] =
    useState<NarrationCardState>(1);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [highlightKeys, setHighlightKeys] = useState<string[]>([]);
  const sectionEls = useRef(new Map<string, HTMLElement>());

  /* ----- store + autosave */

  const update = useCallback(
    (fn: (s: ManifestoStoryStoreV1) => ManifestoStoryStoreV1) => {
      const prev = storeRef.current;
      let next = fn(prev);
      if (next.draft !== prev.draft) {
        // Done prompts are derived from the labels in the draft.
        next = { ...next, promptsDone: promptsDoneFromDraft(next.draft) };
      }
      next = { ...next, updatedAt: new Date().toISOString() };
      storeRef.current = next;
      dirtyRef.current = true;
      setStore(next);
      // Survive HMR / reload immediately; cloud PUT stays debounced below.
      saveManifestoStoryStoreLocal(next);
    },
    [],
  );

  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = window.setTimeout(() => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      // Touches cloud schedule (signed-in) / rewrites LS with final stamp.
      saveManifestoStoryStore(storeRef.current);
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [store]);

  useEffect(
    () => () => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        saveManifestoStoryStore(storeRef.current);
      }
    },
    [],
  );

  // A brand-new, truly empty draft opens with the "Start here" label.
  useEffect(() => {
    const s = storeRef.current;
    if (s.draft === "" && !s.activeVersionId && s.versions.length === 0) {
      update((x) => ({
        ...x,
        draft: serializeStoryDraft([
          {
            kind: "label",
            promptId: STORY_OPENER_PROMPT.id,
            text: STORY_OPENER_PROMPT.text,
            collapsed: false,
          },
          emptyText(),
        ]),
      }));
    }
  }, [update]);

  /* ----- derived */

  const activeVersion =
    store.versions.find((v) => v.id === store.activeVersionId) ??
    store.versions[0] ??
    null;
  const hasVersions = store.versions.length > 0;
  const urlTab = searchParams.get("tab");
  const storyTab: StoryViewTab =
    urlTab === "narration" && hasVersions ? "narration" : "draft";
  const setStoryTab = useCallback(
    (tab: StoryViewTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!next.get("view")) next.set("view", "story");
          if (tab === "narration") next.set("tab", "narration");
          else next.delete("tab");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const nodes = useMemo(() => nodesFromDraft(store.draft), [store.draft]);
  const doneIds = useMemo(() => promptsDoneFromDraft(store.draft), [store.draft]);
  const draftWords = countWords(draftPlainText(store.draft));
  const drift = useMemo(
    () => storyNarrationDrift(store.draft, activeVersion),
    [store.draft, activeVersion],
  );
  const meterWords =
    storyTab === "narration" && activeVersion
      ? activeVersion.wordCount
      : draftWords;
  const empty = draftIsEmpty(store.draft);
  const showGuidelines = empty && !started && !hasVersions;

  const promptLibrary = useMemo(
    () =>
      buildStoryPromptLibrary({
        includeLifeAreas: store.includeLifeAreas,
        includeValues: store.includeValues,
        areas,
        values,
      }),
    [store.includeLifeAreas, store.includeValues, areas, values],
  );

  const unusedPrompts = useMemo(
    () =>
      orderUnusedStoryPrompts({
        library: promptLibrary,
        usedIds: doneIds,
        filter,
        areas,
        values,
        includeLifeAreas: store.includeLifeAreas,
        includeValues: store.includeValues,
      }),
    [
      promptLibrary,
      doneIds,
      filter,
      areas,
      values,
      store.includeLifeAreas,
      store.includeValues,
    ],
  );

  const usedPrompts = useMemo(() => {
    const byId = new Map(promptLibrary.map((p) => [p.id, p]));
    const labelText = new Map<string, string>();
    for (const n of nodes) {
      if (n.kind === "label") labelText.set(n.promptId, n.text);
    }
    const knownUsed = doneIds.filter((id) => byId.has(id));
    const orphans = doneIds.filter((id) => !byId.has(id));
    const order: string[] = [];
    for (const id of recentUsed) {
      if (knownUsed.includes(id) && !order.includes(id)) order.push(id);
    }
    for (const id of [...knownUsed].reverse()) {
      if (!order.includes(id)) order.push(id);
    }
    for (const id of [...orphans].reverse()) {
      if (!order.includes(id)) order.push(id);
    }
    return order.map((id) => {
      const p = byId.get(id);
      if (p) return p;
      const text = labelText.get(id) ?? id;
      return {
        id,
        bucket: "topic" as const,
        template: text,
        text,
      };
    });
  }, [promptLibrary, doneIds, recentUsed, nodes]);

  /** Prompt questions for For narration section headers (draft labels win). */
  const narrationPromptLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of promptLibrary) {
      const t = p.text.trim();
      if (t) map.set(p.id, t);
    }
    for (const n of nodes) {
      if (n.kind !== "label") continue;
      const t = n.text.trim();
      if (t) map.set(n.promptId, t);
    }
    return map;
  }, [nodes, promptLibrary]);

  /** Mobile card: first unused in balanced order, advanced by Skip. */
  const mobilePrompt =
    unusedPrompts.length > 0
      ? unusedPrompts[mobileSkip % unusedPrompts.length]!
      : null;

  /* ----- draft helpers */

  const currentNodes = useCallback(
    () => nodesFromDraft(storeRef.current.draft),
    [],
  );

  const commitNodes = useCallback(
    (next: readonly StoryDraftNode[]): StoryDraftNode[] => {
      const norm = normalizeNodes(next);
      const draft = serializeStoryDraft(norm);
      update((s) => ({ ...s, draft }));
      return norm;
    },
    [update],
  );

  const relocateFindings = useCallback((next: StoryDraftNode[]) => {
    setRaise((r) =>
      r ? { ...r, findings: locateFindings(next, r.findings) } : r,
    );
  }, []);

  /* ----- draft editing */

  const setNodeText = useCallback(
    (index: number, value: string) => {
      const cur = currentNodes();
      const n = cur[index];
      if (!n || n.kind !== "text") return;
      const old = n.text;
      const next = cur.slice();
      next[index] = { kind: "text", text: value };
      const draft = serializeStoryDraft(next);
      update((s) => ({ ...s, draft }));
      setRaise((r) => {
        if (!r) return r;
        const findings = adjustFindings(r.findings, index, old, value);
        if (findings.length === 0) {
          setActiveId(null);
          return null;
        }
        setActiveId((id) =>
          id && findings.some((f) => f.id === id)
            ? id
            : (findings[0]?.id ?? null),
        );
        return { ...r, findings };
      });
    },
    [currentNodes, update],
  );

  const onCaret = useCallback((node: number, pos: number) => {
    caretRef.current = { node, pos };
  }, []);

  const addSectionBreak = () => {
    const cur = currentNodes();
    const caret = caretRef.current;
    let idx =
      caret && cur[caret.node]?.kind === "text" ? caret.node : lastTextIndex(cur);
    if (idx < 0) return;
    const n = cur[idx];
    if (!n || n.kind !== "text") return;
    const pos =
      caret && caret.node === idx
        ? Math.min(caret.pos, n.text.length)
        : n.text.length;
    const head = n.text.slice(0, pos).replace(/\s+$/, "");
    const tail = n.text.slice(pos).replace(/^\s+/, "");
    const next: StoryDraftNode[] = [
      ...cur.slice(0, idx),
      { kind: "text", text: head },
      { kind: "break" },
      { kind: "text", text: tail },
      ...cur.slice(idx + 1),
    ];
    const norm = commitNodes(next);
    relocateFindings(norm);
    idx += 2;
    caretRef.current = { node: idx, pos: 0 };
    setFocusRequest({ node: idx, pos: 0, n: Date.now() });
  };

  const removeBreak = (index: number) => {
    const cur = currentNodes();
    if (cur[index]?.kind !== "break") return;
    const before = cur[index - 1];
    const after = cur[index + 1];
    let next: StoryDraftNode[];
    if (before?.kind === "text" && after?.kind === "text") {
      const merged =
        before.text && after.text
          ? `${before.text}\n\n${after.text}`
          : before.text || after.text;
      next = [
        ...cur.slice(0, index - 1),
        { kind: "text", text: merged },
        ...cur.slice(index + 2),
      ];
    } else {
      next = [...cur.slice(0, index), ...cur.slice(index + 1)];
    }
    const norm = commitNodes(next);
    relocateFindings(norm);
    caretRef.current = null;
  };

  /* ----- prompt labels */

  const toggleLabel = (index: number) => {
    setFreshPromptId(null);
    commitNodes(toggleLabelCollapsed(currentNodes(), index));
  };

  const removeLabel = (index: number) => {
    setFreshPromptId(null);
    const norm = commitNodes(removePromptLabel(currentNodes(), index));
    relocateFindings(norm);
    caretRef.current = null;
  };

  const scrollToLabel = (promptId: string) => {
    window.setTimeout(
      () =>
        labelEls.current
          .get(promptId)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      0,
    );
  };

  const insertPrompt = (p: StoryPrompt) => {
    if (promptsSheet) setPromptsSheet(false);
    const cur = currentNodes();
    if (draftHasPromptLabel(storeRef.current.draft, p.id)) {
      // Already in the draft: expand it and scroll to it.
      const { nodes: expanded } = insertPromptLabel(cur, {
        promptId: p.id,
        text: p.text,
        cursorNodeIndex: null,
        cursorOffset: 0,
      });
      commitNodes(expanded);
      scrollToLabel(p.id);
      return;
    }
    const caret = caretRef.current;
    const inText = caret && cur[caret.node]?.kind === "text";
    const res = insertPromptLabel(cur, {
      promptId: p.id,
      text: p.text,
      cursorNodeIndex: inText ? caret!.node : null,
      cursorOffset: inText ? caret!.pos : 0,
    });
    const norm = commitNodes(res.nodes);
    relocateFindings(norm);
    setRecentUsed((ids) => [p.id, ...ids.filter((id) => id !== p.id)].slice(0, 200));
    setMobileSkip(0);
    const li = norm.findIndex(
      (n) => n.kind === "label" && n.promptId === p.id,
    );
    const focus = li >= 0 ? li + 1 : norm.length - 1;
    caretRef.current = { node: focus, pos: 0 };
    setFreshPromptId(p.id);
    setFocusRequest({ node: focus, pos: 0, n: Date.now() });
  };

  const openUsedPrompt = (promptId: string) => {
    const cur = currentNodes();
    const idx = cur.findIndex(
      (n) => n.kind === "label" && n.promptId === promptId,
    );
    if (idx < 0) return;
    const n = cur[idx]!;
    if (n.kind === "label" && n.collapsed) {
      commitNodes(toggleLabelCollapsed(cur, idx));
    }
    scrollToLabel(promptId);
  };

  const setFilterSafe = (next: StoryPromptFilter) => {
    setFilter(next);
    setMobileSkip(0);
  };

  /* ----- dictation */

  const insertSpoken = (spoken: string) => {
    const cur = currentNodes();
    const caret = caretRef.current;
    const n = caret ? cur[caret.node] : undefined;
    if (caret && n && n.kind === "text") {
      const t = n.text;
      const pos = Math.min(caret.pos, t.length);
      const before = appendSpokenText(t.slice(0, pos), spoken);
      const after = t.slice(pos);
      const merged =
        after && !/^\s/.test(after) ? `${before} ${after}` : `${before}${after}`;
      caretRef.current = { node: caret.node, pos: before.length };
      setNodeText(caret.node, merged);
      return;
    }
    const last = lastTextIndex(cur);
    const lastNode = cur[last];
    if (last >= 0 && lastNode && lastNode.kind === "text") {
      setNodeText(last, appendSpokenText(lastNode.text, spoken));
    }
  };

  const toggleDictation = async (fromGuidelines = false) => {
    if (dict.busy) return;
    if (dict.recording) {
      const spoken = await dict.stopAndTranscribe();
      if (spoken) insertSpoken(spoken);
      return;
    }
    if (fromGuidelines) setStarted(true);
    await dict.start();
  };

  const startWriting = () => {
    setStarted(true);
    setShowGuides(false);
    let cur = currentNodes();
    const li = cur.findIndex(
      (n) => n.kind === "label" && n.promptId === STORY_OPENER_PROMPT_ID,
    );
    let target = -1;
    if (li >= 0 && cur[li + 1]?.kind === "text") {
      target = li + 1;
      const label = cur[li];
      if (label && label.kind === "label" && label.collapsed) {
        cur = commitNodes(toggleLabelCollapsed(cur, li));
      }
    } else {
      target = cur.findIndex((n) => n.kind === "text");
    }
    const t = cur[target];
    if (!t || t.kind !== "text") return;
    caretRef.current = { node: target, pos: t.text.length };
    setFocusRequest({ node: target, pos: t.text.length, n: Date.now() });
  };

  /* ----- raise the ceiling */

  const rememberRaiseLock = (
    nodeText: string,
    start: number,
    end: number,
    accepted: boolean,
  ) => {
    const lock = raiseLockFromAcceptedSpan(nodeText, start, end);
    if (!lock) return;
    update((s) => {
      const raiseLocks = pruneRaiseLocks(s.draft, [...s.raiseLocks, lock]);
      const raiseAccepted = accepted
        ? pruneRaiseLocks(s.draft, [...s.raiseAccepted, lock])
        : pruneRaiseLocks(s.draft, s.raiseAccepted);
      return { ...s, raiseLocks, raiseAccepted };
    });
  };

  const performRaiseCheck = async (): Promise<{
    ambition: number;
    findings: LiveFinding[];
  } | null> => {
    const cur = currentNodes();
    // Keep prompt labels so Raise can honour morning vs night, etc.
    const draft = serializeStoryDraft(cur);
    const body = bodyDraft(cur);
    // Drop locks on overtly negative sentences (including an earlier Keep).
    const locks = stripOvertlyNegativeRaiseLocks(
      draft,
      storeRef.current.raiseLocks,
    );
    const accepted = stripOvertlyNegativeRaiseLocks(
      draft,
      storeRef.current.raiseAccepted,
    );
    if (
      locks.length !== storeRef.current.raiseLocks.length ||
      accepted.length !== storeRef.current.raiseAccepted.length
    ) {
      update((s) => ({ ...s, raiseLocks: locks, raiseAccepted: accepted }));
    }
    const { values, valuesById } = raiseValuesContext();
    const res = await raiseStoryCeiling(draft, locks, {
      lifeAreas: raiseLifeAreas(),
      values,
      valuesById,
    });
    const live = locateFindings(currentNodes(), res.findings);
    // History only — unchecked sentences stay open until the user Use/Keep.
    const passedLocks = raiseLocksForPassedSentences(body, res.findings);
    update((s) => ({
      ...s,
      raiseLocks: pruneRaiseLocks(s.draft, s.raiseLocks),
      raiseAccepted: pruneRaiseLocks(s.draft, s.raiseAccepted),
      raiseHistory: [
        ...s.raiseHistory,
        {
          at: new Date().toISOString(),
          ambition: res.ambition,
          findings: res.findings.map((f) => ({
            quote: f.quote,
            suggestion: f.suggestion,
            type: f.type,
          })),
          passed: passedLocks,
        },
      ].slice(-12),
    }));
    return { ambition: res.ambition, findings: live };
  };

  const runRaise = async () => {
    if (raising || empty) return;
    setRaising(true);
    setRaiseError(null);
    setPromptsSheet(false);
    try {
      const res = await performRaiseCheck();
      if (!res) return;
      setRaise({ ambition: res.ambition, findings: res.findings });
      setActiveId(res.findings[0]?.id ?? null);
      if (!wide) setRaiseSheet(true);
    } catch {
      setRaiseError("Couldn’t check your story. Try again.");
    } finally {
      setRaising(false);
    }
  };

  const clearRaise = () => {
    const open = raise?.findings ?? [];
    if (open.length > 0) {
      const cur = currentNodes();
      const dismissLocks: string[] = [];
      for (const f of open) {
        // Negatives must re-flag next Raise / prepare — never lock on dismiss.
        if (f.type === "negative") continue;
        const n = cur[f.node];
        if (!n || n.kind !== "text") continue;
        const lock = raiseLockFromAcceptedSpan(n.text, f.start, f.end);
        if (lock) dismissLocks.push(lock);
      }
      if (dismissLocks.length) {
        update((s) => ({
          ...s,
          raiseLocks: pruneRaiseLocks(s.draft, [
            ...s.raiseLocks,
            ...dismissLocks,
          ]),
        }));
      }
    }
    setRaise(null);
    setActiveId(null);
    setRaiseSheet(false);
  };

  const applyReplacement = (f: LiveFinding, replacement: string) => {
    const cur = currentNodes();
    const n = cur[f.node];
    if (!n || n.kind !== "text") return null;
    const old = n.text;
    const updated = old.slice(0, f.start) + replacement + old.slice(f.end);
    const next = cur.slice();
    next[f.node] = { kind: "text", text: updated };
    const draft = serializeStoryDraft(next);
    update((s) => ({ ...s, draft }));
    return { old, updated };
  };

  const nextFindingId = (id: string): string | null => {
    const list = raise?.findings ?? [];
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return null;
    return list[i + 1]?.id ?? list[i - 1]?.id ?? null;
  };

  const useFinding = (f: LiveFinding) => {
    const res = applyReplacement(f, f.suggestion);
    if (!res) return;
    const lockEnd = f.start + f.suggestion.length;
    rememberRaiseLock(res.updated, f.start, lockEnd, true);
    const nextId = nextFindingId(f.id);
    setRaise((r) => {
      if (!r) return r;
      const findings = adjustFindings(
        r.findings,
        f.node,
        res.old,
        res.updated,
      );
      if (findings.length === 0) return null;
      return { ...r, findings };
    });
    setActiveId(nextId);
  };

  const useAll = () => {
    if (!raise) return;
    const next = currentNodes();
    const ordered = raise.findings
      .slice()
      .sort((a, b) => b.node - a.node || b.start - a.start);
    const newLocks: string[] = [];
    for (const f of ordered) {
      const n = next[f.node];
      if (!n || n.kind !== "text") continue;
      const updated =
        n.text.slice(0, f.start) + f.suggestion + n.text.slice(f.end);
      next[f.node] = { kind: "text", text: updated };
      const lock = raiseLockFromAcceptedSpan(
        updated,
        f.start,
        f.start + f.suggestion.length,
      );
      if (lock) newLocks.push(lock);
    }
    const norm = normalizeNodes(next);
    const draft = serializeStoryDraft(norm);
    update((s) => ({
      ...s,
      draft,
      raiseLocks: pruneRaiseLocks(draft, [...s.raiseLocks, ...newLocks]),
      raiseAccepted: pruneRaiseLocks(draft, [...s.raiseAccepted, ...newLocks]),
    }));
    setRaise(null);
    setActiveId(null);
    setRaiseSheet(false);
  };

  const keepMine = (id: string) => {
    const f = raise?.findings.find((x) => x.id === id);
    // Keep on non-negative = don't re-flag; Keep on negative must still re-flag.
    if (f && f.type !== "negative") {
      const n = currentNodes()[f.node];
      if (n?.kind === "text") {
        rememberRaiseLock(n.text, f.start, f.end, false);
      }
    }
    const nextId = nextFindingId(id);
    setRaise((r) => {
      if (!r) return r;
      const findings = r.findings.filter((x) => x.id !== id);
      if (findings.length === 0) return null;
      return { ...r, findings };
    });
    setActiveId(nextId);
  };

  const anotherSuggestion = async (f: LiveFinding) => {
    if (anotherBusy) return;
    setAnotherBusy(true);
    try {
      const cur = currentNodes();
      const li = owningLabelIndex(cur, f.node);
      const label = li >= 0 ? cur[li] : undefined;
      const lifeAreas = raiseLifeAreas();
      const { values, valuesById } = raiseValuesContext();
      const refId =
        label?.kind === "label"
          ? areaRefIdFromPromptId(label.promptId)
          : null;
      const suggestion = await regenerateStorySuggestion({
        draft: serializeStoryDraft(cur),
        quote: f.quote,
        type: f.type,
        promptText: label?.kind === "label" ? label.text : undefined,
        lifeAreas,
        lifeArea: refId
          ? lifeAreas.find((a) => a.id === refId) ?? null
          : null,
        values,
        valuesById,
      });
      setRaise((r) =>
        r
          ? {
              ...r,
              findings: r.findings.map((x) =>
                x.id === f.id ? { ...x, suggestion } : x,
              ),
            }
          : r,
      );
    } finally {
      setAnotherBusy(false);
    }
  };

  /** Make sure a finding's text isn't hidden under a collapsed label. */
  const ensureNodeVisible = (nodeIndex: number) => {
    const cur = currentNodes();
    const li = owningLabelIndex(cur, nodeIndex);
    const label = li >= 0 ? cur[li] : undefined;
    if (label && label.kind === "label" && label.collapsed) {
      commitNodes(toggleLabelCollapsed(cur, li));
    }
  };

  const selectFromList = (id: string) => {
    setActiveId(id);
    const f = raise?.findings.find((x) => x.id === id);
    if (f) ensureNodeVisible(f.node);
    if (!wide) return;
    window.setTimeout(
      () =>
        spanRefs.current
          .get(id)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      50,
    );
  };

  const pickFinding = (id: string | null) => {
    setActiveId(id);
    if (!wide && id) setRaiseSheet(true);
  };

  /** Mobile sheet / inline pill — Use & Keep already advance activeId. */
  const sheetUse = (f: LiveFinding) => {
    useFinding(f);
  };
  const sheetKeep = (f: LiveFinding) => {
    keepMine(f.id);
  };

  /* ----- prepare / update narration */

  const wordsOk = draftWords >= MIN_WORDS_TO_COMPOSE;
  const wordsToCompose = Math.max(0, MIN_WORDS_TO_COMPOSE - draftWords);
  const changedCount = activeVersion ? drift.changedCount : 0;

  const afterPrepareSuccess = (updatedKeys: string[]) => {
    setStoryTab("narration");
    setHighlightKeys(updatedKeys);
    window.setTimeout(() => {
      const first = updatedKeys[0];
      if (first) {
        sectionEls.current
          .get(first)
          ?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }, 80);
    // Keep accent tint briefly, then clear so it can fade out.
    window.setTimeout(() => setHighlightKeys([]), 1200);
  };

  const confirmOverwriteEdited = (keys: readonly string[]): boolean => {
    if (!activeVersion) return true;
    const byKey = new Map(
      versionSections(activeVersion).map(
        (s) => [storySectionKey(s), s] as const,
      ),
    );
    const edited = keys.filter((k) => byKey.get(k)?.editedByUser).length;
    if (edited === 0) return true;
    return window.confirm(
      `You've edited ${edited} section${edited === 1 ? "" : "s"} in the narration text. Updating will replace those edits.`,
    );
  };

  const resolveStoryPronouns = async (): Promise<AccountPronouns> => {
    const local = readAccountPronounsLocal();
    try {
      const { settings } = await fetchUserSettings();
      return mergeAccountPronouns(settings, local).account.pronouns;
    } catch {
      return local ?? "they_them";
    }
  };

  const executePrepareOrUpdate = async (onlyKeys: string[] | null) => {
    const draftSerialized = serializeStoryDraft(currentNodes());
    const draftBody = bodyDraft(currentNodes());
    const isUpdate = Boolean(activeVersion) && hasVersions && onlyKeys != null;
    const keys = onlyKeys ?? [];
    const pronouns = await resolveStoryPronouns();

    if (!isUpdate) {
      const composed = await composeStoryThirdPerson({
        draft: draftBody,
        firstName,
        pronouns,
        sections: draftSectionsForCompose(draftSerialized),
      });
      update((s) =>
        addStoryVersion(s, composed.text, composed.sections, {
          draft: draftSerialized,
        }),
      );
      afterPrepareSuccess(
        composed.sections.map((s) => s.promptId ?? "opening"),
      );
    } else {
      const baseId = activeVersion!.id;
      const sectionsIn = composeSectionsForUpdate(drift.draftSections, keys);
      const rewriteTargets = sectionsIn.filter((s) => s.role === "rewrite");
      if (rewriteTargets.length === 0) {
        update((s) =>
          addUpdatedStoryVersion(s, {
            draft: draftSerialized,
            updatedSections: [],
            baseVersionId: baseId,
          }),
        );
        afterPrepareSuccess(keys);
      } else {
        const composed = await composeStoryThirdPerson({
          draft: draftBody,
          firstName,
          pronouns,
          sections: sectionsIn,
          rewriteOnly: true,
        });
        const updatedSections = composed.sections.map((s) => ({
          promptId: s.promptId,
          heading: s.heading,
          text: s.text,
        }));
        update((s) =>
          addUpdatedStoryVersion(s, {
            draft: draftSerialized,
            updatedSections,
            baseVersionId: baseId,
          }),
        );
        afterPrepareSuccess(
          updatedSections.map((s) => s.promptId ?? "opening"),
        );
      }
    }
    setRaise(null);
    setActiveId(null);
    setRaiseSheet(false);
  };

  const finishPrepareGate = async (mode: "leave" | "apply") => {
    if (!prepareGate) return;
    const gate = prepareGate;
    const decisions = prepareDecisions;
    setPrepareGate(null);
    setPrepareDecisions({});
    setComposePhase("preparing");
    setComposeError(null);
    const resolve = (id: string): "used" | "kept" => {
      const d = decisions[id];
      if (d === "used" || d === "kept") return d;
      // Apply suggestions → use undecided; Leave it as is → keep undecided.
      return mode === "apply" ? "used" : "kept";
    };
    try {
      const cur = currentNodes();
      for (const f of gate.findings) {
        if (resolve(f.id) !== "kept") continue;
        // Kept negatives stay unlocked so Raise / prepare re-flag them.
        if (f.type === "negative") continue;
        const n = cur[f.node];
        if (n?.kind === "text") {
          rememberRaiseLock(n.text, f.start, f.end, false);
        }
      }
      const next = currentNodes().map((n) =>
        n.kind === "text" ? { ...n } : n,
      );
      const ordered = gate.findings
        .filter((f) => resolve(f.id) === "used")
        .sort((a, b) => b.node - a.node || b.start - a.start);
      const newLocks: string[] = [];
      for (const f of ordered) {
        const n = next[f.node];
        if (!n || n.kind !== "text") continue;
        let start = f.start;
        let end = f.end;
        if (n.text.slice(start, end) !== f.quote) {
          const idx = n.text.indexOf(f.quote);
          if (idx < 0) continue;
          start = idx;
          end = idx + f.quote.length;
        }
        const updated =
          n.text.slice(0, start) + f.suggestion + n.text.slice(end);
        next[f.node] = { kind: "text", text: updated };
        const lock = raiseLockFromAcceptedSpan(
          updated,
          start,
          start + f.suggestion.length,
        );
        if (lock) newLocks.push(lock);
      }
      if (ordered.length > 0) {
        const norm = normalizeNodes(next);
        const draft = serializeStoryDraft(norm);
        update((s) => ({
          ...s,
          draft,
          raiseLocks: pruneRaiseLocks(draft, [...s.raiseLocks, ...newLocks]),
          raiseAccepted: pruneRaiseLocks(draft, [
            ...s.raiseAccepted,
            ...newLocks,
          ]),
        }));
      }
      await executePrepareOrUpdate(gate.onlyKeys);
    } catch {
      setComposeError("Couldn’t prepare your story just now. Try again.");
    } finally {
      setComposePhase("idle");
    }
  };

  const runPrepareOrUpdate = async (onlyKeys?: readonly string[]) => {
    if (composing || prepareGate) return;
    const isUpdate = Boolean(activeVersion) && hasVersions;
    // No drift → still allow a full re-check (e.g. kept negatives must re-flag).
    const allKeys = drift.draftSections.map((s) => s.promptId ?? "opening");
    const keys =
      onlyKeys && onlyKeys.length > 0
        ? [...onlyKeys]
        : isUpdate
          ? drift.changedKeys.length > 0
            ? [...drift.changedKeys]
            : allKeys
          : [];

    if (isUpdate) {
      if (keys.length === 0) return;
      if (!confirmOverwriteEdited(keys)) return;
    } else if (!wordsOk) {
      return;
    }

    setComposePhase("checking");
    setComposeError(null);
    try {
      const check = await performRaiseCheck();
      const nodes = currentNodes();
      const scoped = filterFindingsToSectionKeys(
        check?.findings ?? [],
        nodes,
        isUpdate ? keys : null,
      );
      if (scoped.length > 0) {
        setPrepareGate({
          ambition: check?.ambition ?? 0.4,
          findings: scoped,
          onlyKeys: isUpdate ? keys : null,
        });
        setPrepareDecisions({});
        setComposePhase("idle");
        return;
      }
      setComposePhase("preparing");
      await executePrepareOrUpdate(isUpdate ? keys : null);
    } catch {
      setComposeError("Couldn’t prepare your story just now. Try again.");
      setComposePhase("idle");
    } finally {
      setComposePhase((p) =>
        p === "checking" || p === "preparing" ? "idle" : p,
      );
    }
  };

  /* ----- shared bits */

  const promptsCardFor = (bare: boolean) => (
    <PromptsCard
      bare={bare}
      store={store}
      doneIds={doneIds}
      filter={filter}
      onFilter={setFilterSafe}
      unused={unusedPrompts}
      used={usedPrompts}
      library={promptLibrary}
      areas={areas}
      values={values}
      onPick={insertPrompt}
      onOpenUsed={openUsedPrompt}
      onToggleAreas={(v) => {
        update((s) => ({ ...s, includeLifeAreas: v }));
        if (!v && filter.kind === "area") setFilterSafe({ kind: "all" });
      }}
      onToggleValues={(v) => {
        update((s) => ({ ...s, includeValues: v }));
        if (!v && filter.kind === "value") setFilterSafe({ kind: "all" });
      }}
    />
  );

  const raiseCard = raise ? (
    <RaiseCard
      ambition={raise.ambition}
      findings={raise.findings}
      activeId={activeId}
      onSelect={selectFromList}
      onUseAll={useAll}
      onDone={clearRaise}
    />
  ) : null;

  const talkOnClick = () => void toggleDictation(false);

  const floatingTools =
    storyTab === "draft" ? (
      <FloatingEditorTools
        wide={wide}
        anchorRef={writingCardRef}
        hidden={!wide && (promptsSheet || raiseSheet)}
        raising={raising}
        raiseDisabled={raising || empty}
        onRaise={() => void runRaise()}
        recording={dict.recording}
        busy={dict.busy}
        onTalk={talkOnClick}
      />
    ) : null;

  const editor = (
    <StoryEditor
      wide={wide}
      nodes={nodes}
      findings={raise?.findings ?? []}
      raiseLocks={store.raiseAccepted}
      activeId={activeId}
      raiseActions={{
        busy: anotherBusy,
        onUse: useFinding,
        onAnother: (f) => void anotherSuggestion(f),
        onKeep: (f) => keepMine(f.id),
      }}
      focusRequest={focusRequest}
      freshPromptId={freshPromptId}
      onChangeText={setNodeText}
      onCaret={onCaret}
      onPickFinding={pickFinding}
      onRemoveBreak={removeBreak}
      onToggleLabel={toggleLabel}
      onRemoveLabel={removeLabel}
      registerSpan={(id, el) => {
        if (el) spanRefs.current.set(id, el);
        else spanRefs.current.delete(id);
      }}
      registerLabel={(id, el) => {
        if (el) labelEls.current.set(id, el);
        else labelEls.current.delete(id);
      }}
    />
  );

  const sectionBreakButton = (
    <button
      type="button"
      onClick={addSectionBreak}
      className="relative inline-flex h-7 w-fit cursor-pointer items-center gap-1.5 rounded-full border border-dashed px-3 text-xs font-semibold text-accent-link transition-opacity hover:opacity-80"
      style={{ borderColor: LIGHT }}
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      Section break
    </button>
  );

  const storyTabControl = (equalWidth: boolean) => (
    <SegmentedPillTabs<StoryViewTab>
      aria-label="Story view"
      value={storyTab}
      onChange={setStoryTab}
      equalWidth={equalWidth}
      className={`${STORY_TAB_TRACK} ${equalWidth ? "w-full" : ""}`}
      selectedClassName={STORY_TAB_SELECTED}
      idleClassName={STORY_TAB_IDLE}
      options={[
        { id: "draft", label: "My draft" },
        {
          id: "narration",
          disabled: !hasVersions,
          label: (
            <span className="inline-flex items-center gap-1.5">
              For narration
              {changedCount > 0 ? (
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  title="Your draft has changes the narration doesn't have yet"
                  aria-label="Your draft has changes the narration doesn't have yet"
                />
              ) : null}
            </span>
          ),
        },
      ]}
    />
  );

  const prepareHint =
    !hasVersions && wordsToCompose > 0
      ? `Prepare for narration unlocks at ${MIN_WORDS_TO_COMPOSE} words · ${wordsToCompose} to go`
      : !hasVersions
        ? "Third person, tidied, ready to record"
        : changedCount > 0
          ? `${changedCount} section${changedCount === 1 ? "" : "s"} changed`
          : null;

  const prepareToolbarRight = (() => {
    if (storyTab === "narration" && activeVersion) {
      const when =
        formatPreparedAt(activeVersion.preparedAt ?? activeVersion.createdAt) ||
        "recently";
      if (narrationCardState === 2) {
        return (
          <span className="text-[13px] font-semibold text-accent-link">
            ✓ Narrated
          </span>
        );
      }
      if (narrationCardState === 1 || narrationCardState === 3) {
        return (
          <span className="text-[13px] font-semibold text-accent-link">
            ✓ Ready to narrate
          </span>
        );
      }
      return (
        <span className="text-[13px] text-muted">
          Prepared {when} · edits here don’t change your draft
        </span>
      );
    }
    const label =
      composeBusyLabel ??
      (!hasVersions ? "Prepare for narration" : "Update narration text");
    return (
      <div className="flex flex-wrap items-center gap-[10px]">
        {prepareHint ? (
          <span id="story-prepare-hint" className="text-[13px] text-muted">
            {prepareHint}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void runPrepareOrUpdate()}
          disabled={
            composing ||
            Boolean(prepareGate) ||
            (!hasVersions && !wordsOk)
          }
          aria-describedby={prepareHint ? "story-prepare-hint" : undefined}
          className={`${BTN_PRIMARY} h-11`}
        >
          {composing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Wand2 className="h-4 w-4" aria-hidden />
          )}
          {label}
        </button>
      </div>
    );
  })();

  const prepareMobileFooter =
    storyTab === "draft" ? (
      <div className="flex flex-col gap-2">
        {prepareHint ? (
          <span
            id="story-prepare-hint"
            className="text-center text-[12px] text-muted"
          >
            {prepareHint}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void runPrepareOrUpdate()}
          disabled={
            composing ||
            Boolean(prepareGate) ||
            (!hasVersions && !wordsOk)
          }
          className={`${BTN_PRIMARY} h-11 w-full`}
        >
          {composing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Wand2 className="h-4 w-4" aria-hidden />
          )}
          {composeBusyLabel ??
            (!hasVersions
              ? "Prepare for narration"
              : "Update narration text")}
        </button>
      </div>
    ) : activeVersion ? (
      narrationCardState === 2 ? (
        <span className="text-center text-[12px] font-semibold text-accent-link">
          ✓ Narrated
        </span>
      ) : narrationCardState === 1 || narrationCardState === 3 ? (
        <span className="text-center text-[12px] font-semibold text-accent-link">
          ✓ Ready to narrate
        </span>
      ) : (
        <span className="text-center text-[12px] text-muted">
          Prepared{" "}
          {formatPreparedAt(
            activeVersion.preparedAt ?? activeVersion.createdAt,
          ) || "recently"}{" "}
          · edits here don’t change your draft
        </span>
      )
    ) : null;

  const howToButton = (cls: string, icon: string) => (
    <button
      type="button"
      onClick={() => setShowGuides(true)}
      className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap font-semibold text-accent-link transition-opacity hover:opacity-80 ${cls}`}
    >
      <BookOpen className={icon} aria-hidden />
      How to write it
    </button>
  );

  const guidelinesModal =
    showGuides && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-x-0 bottom-0 top-14 z-[210] overflow-y-auto bg-overlay/45 backdrop-blur-[2px] lg:left-[var(--app-sidebar-w,200px)]"
            onClick={() => setShowGuides(false)}
          >
            <div className="flex min-h-full items-center justify-center p-4">
              <div
                role="dialog"
                aria-modal="true"
                aria-label="How to write your story"
                className="w-full max-w-[1000px]"
                onClick={(e) => e.stopPropagation()}
              >
                <GuidelinesPaper
                  wide={wide}
                  onStart={startWriting}
                  onTalk={() => undefined}
                  onBack={() => setShowGuides(false)}
                  recording={false}
                  busy={false}
                />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  const dictError = dict.error ? (
    <p className="text-xs text-danger" role="alert">
      {dict.error}
    </p>
  ) : null;

  const inlineErrors = (
    <>
      {dictError}
      {raiseError ? (
        <p className="text-xs text-danger" role="alert">
          {raiseError}
        </p>
      ) : null}
      {composeError ? (
        <p className="text-xs text-danger" role="alert">
          {composeError}
        </p>
      ) : null}
    </>
  );

  /* ----- state C: guidelines */

  if (showGuidelines) {
    return (
      <div className={wide ? PAGE : PAGE_MOBILE}>
        <PageHeader words={0} wide={wide} />
        <GuidelinesPaper
          wide={wide}
          onStart={startWriting}
          onTalk={() => void toggleDictation(true)}
          recording={dict.recording}
          busy={dict.busy}
        />
        {dictError}
        {wide ? null : (
          <div className="sticky bottom-0 z-20 flex flex-col gap-2 bg-background/95 pb-3 pt-2 backdrop-blur">
            <button
              type="button"
              onClick={startWriting}
              className={`${BTN_PRIMARY} h-[46px] w-full`}
            >
              Start writing
            </button>
            <TalkButton
              height="h-[46px]"
              recording={dict.recording}
              busy={dict.busy}
              onClick={() => void toggleDictation(true)}
              className="w-full"
            />
          </div>
        )}
      </div>
    );
  }

  /* ----- draft + narration (same page, tabbed) */

  const narrationSections = activeVersion
    ? versionSections(activeVersion)
    : [];
  const changedKeySet = new Set(drift.changedKeys);
  const promptLabelForSection = (section: StoryVersionSection): string => {
    if (section.promptId) {
      return (
        narrationPromptLabels.get(section.promptId) ||
        section.heading.trim() ||
        ""
      );
    }
    return section.heading.trim() || "Opening";
  };

  const paperDraft = (
    <Paper wide={wide} title="My life vision" hideHeader cardRef={writingCardRef}>
      <div className="relative">{editor}</div>
      {sectionBreakButton}
    </Paper>
  );

  const paperNarration =
    activeVersion ? (
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {!wide && changedCount > 0 ? (
          <NarrationOutOfDateBanner
            changedCount={changedCount}
            busyLabel={composeBusyLabel}
            onUpdate={() => void runPrepareOrUpdate()}
            wide={false}
          />
        ) : null}
        <Paper
          wide={wide}
          variant="version"
          title="My Life Vision"
          headerRight={
            wide
              ? `Third person · ${activeVersion.wordCount.toLocaleString()} words`
              : (
                  <span className="text-xs text-muted">
                    Third person · {activeVersion.wordCount.toLocaleString()}{" "}
                    words
                  </span>
                )
          }
        >
          <div className="relative flex flex-col gap-5">
            {wide && changedCount > 0 ? (
              <NarrationOutOfDateBanner
                changedCount={changedCount}
                busyLabel={composeBusyLabel}
                onUpdate={() => void runPrepareOrUpdate()}
                wide
              />
            ) : null}
            {narrationSections.map((section) => {
              const key = storySectionKey(section);
              return (
                <NarrationSectionEditor
                  key={key}
                  section={section}
                  promptLabel={promptLabelForSection(section)}
                  outOfDate={changedKeySet.has(key)}
                  highlighted={highlightKeys.includes(key)}
                  wide={wide}
                  composing={composing}
                  onChange={(v) =>
                    update((s) =>
                      patchVersionSectionText(
                        s,
                        activeVersion.id,
                        section.promptId,
                        v,
                      ),
                    )
                  }
                  onUpdateSection={() => void runPrepareOrUpdate([key])}
                  sectionRef={(el) => {
                    if (el) sectionEls.current.set(key, el);
                    else sectionEls.current.delete(key);
                  }}
                />
              );
            })}
          </div>
        </Paper>
      </div>
    ) : null;

  const sideColumn =
    storyTab === "narration" && activeVersion ? (
      <ManifestoStoryNarrateRail
        store={store}
        version={activeVersion}
        firstName={firstName}
        onStoreChange={update}
        changedCount={changedCount}
        onUpdateFirst={() => runPrepareOrUpdate()}
        onCardStateChange={setNarrationCardState}
      />
    ) : (
      <aside className="flex w-full flex-col gap-[14px] md:w-[320px] md:shrink-0">
        {raiseCard ?? promptsCardFor(false)}
      </aside>
    );

  const writingToolbar = (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {storyTabControl(false)}
        {storyTab === "draft" ? howToButton("text-[13px]", "h-4 w-4") : null}
      </div>
      {prepareToolbarRight}
    </div>
  );

  const onPrepareGateAnother = async (id: string) => {
    const f = prepareGate?.findings.find((x) => x.id === id);
    if (!f || prepareAnotherBusyId) return;
    setPrepareAnotherBusyId(id);
    try {
      const cur = currentNodes();
      const li = owningLabelIndex(cur, f.node);
      const label = li >= 0 ? cur[li] : undefined;
      const lifeAreas = raiseLifeAreas();
      const { values, valuesById } = raiseValuesContext();
      const refId =
        label?.kind === "label"
          ? areaRefIdFromPromptId(label.promptId)
          : null;
      const suggestion = await regenerateStorySuggestion({
        draft: serializeStoryDraft(cur),
        quote: f.quote,
        type: f.type,
        promptText: label?.kind === "label" ? label.text : undefined,
        lifeAreas,
        lifeArea: refId
          ? (lifeAreas.find((a) => a.id === refId) ?? null)
          : null,
        values,
        valuesById,
      });
      setPrepareGate((g) =>
        g
          ? {
              ...g,
              findings: g.findings.map((x) =>
                x.id === id ? { ...x, suggestion } : x,
              ),
            }
          : g,
      );
    } catch {
      /* keep prior suggestion */
    } finally {
      setPrepareAnotherBusyId(null);
    }
  };

  const prepareCheckDialog = (
    <ManifestoStoryPrepareCheck
      open={Boolean(prepareGate)}
      wide={wide}
      ambition={prepareGate?.ambition ?? 0.4}
      findings={prepareGate?.findings ?? []}
      decisions={prepareDecisions}
      anotherBusyId={prepareAnotherBusyId}
      onClose={() => {
        setPrepareGate(null);
        setPrepareDecisions({});
      }}
      onDecide={(id, d) =>
        setPrepareDecisions((prev) => ({ ...prev, [id]: d }))
      }
      onAnother={(id) => void onPrepareGateAnother(id)}
      onPrepareAsIs={() => void finishPrepareGate("leave")}
      onPrepareWithChanges={() => void finishPrepareGate("apply")}
    />
  );

  if (wide) {
    return (
      <div className={PAGE.replace("pb-10", "pb-[72px]")}>
        <PageHeader
          words={meterWords}
          wide
          holdBackSubline={storyTab === "draft"}
          toolbar={writingToolbar}
        />
        {inlineErrors}
        <div className="flex items-start gap-5">
          {storyTab === "narration" ? paperNarration : paperDraft}
          {sideColumn}
        </div>
        {floatingTools}
        {guidelinesModal}
        {prepareCheckDialog}
      </div>
    );
  }

  /* ----- mobile */

  return (
    <div className={PAGE_MOBILE.replace("pb-10", "pb-[72px]")}>
      <PageHeader
        words={meterWords}
        wide={false}
        holdBackSubline={storyTab === "draft"}
        mobileTitleRight={
          storyTab === "draft" ? howToButton("text-xs", "h-3.5 w-3.5") : null
        }
        mobileTabs={storyTabControl(true)}
        mobileFooter={prepareMobileFooter}
      />

      {storyTab === "draft" ? (
        <>
          <div className={`${CARD} flex flex-col gap-2 px-4 py-3`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-ui text-[10px] font-semibold uppercase tracking-[1.4px] text-muted">
                Prompt
              </span>
              <button
                type="button"
                onClick={() => setPromptsSheet(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-accent-link transition-opacity hover:opacity-80"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                All prompts
              </button>
            </div>
            {mobilePrompt ? (
              <>
                <div
                  className={`flex items-start justify-between gap-3 transition-opacity duration-200 ${
                    mobileFade ? "opacity-0" : "opacity-100"
                  }`}
                >
                  <span
                    className="min-w-0 flex-1 font-display text-base leading-[1.4] text-foreground"
                    style={SERIF_TEXT}
                  >
                    <PromptText
                      prompt={mobilePrompt}
                      onTagClick={
                        mobilePrompt.refId
                          ? () => {
                              setFilterSafe(
                                mobilePrompt.bucket === "area"
                                  ? {
                                      kind: "area",
                                      refId: mobilePrompt.refId!,
                                    }
                                  : {
                                      kind: "value",
                                      refId: mobilePrompt.refId!,
                                    },
                              );
                              setPromptsSheet(true);
                            }
                          : undefined
                      }
                    />
                  </span>
                  <button
                    type="button"
                    onClick={() => insertPrompt(mobilePrompt)}
                    className="inline-flex h-[30px] shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border px-3 text-xs font-semibold text-foreground transition-opacity hover:opacity-90"
                    style={{
                      borderColor: LIGHT,
                      backgroundColor: "var(--accent-soft)",
                    }}
                  >
                    + Answer
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (unusedPrompts.length <= 1) return;
                    if (prefersReducedMotion()) {
                      setMobileSkip((n) => n + 1);
                      return;
                    }
                    setMobileFade(true);
                    window.setTimeout(() => {
                      setMobileSkip((n) => n + 1);
                      setMobileFade(false);
                    }, 160);
                  }}
                  className="w-fit cursor-pointer text-xs font-semibold text-accent-link transition-opacity hover:opacity-80"
                >
                  Skip
                </button>
              </>
            ) : (
              <p className="text-sm text-muted">Every prompt is in your story.</p>
            )}
          </div>

          {paperDraft}
          {inlineErrors}
          {raise && !raiseSheet ? (
            <button
              type="button"
              onClick={() => setRaiseSheet(true)}
              className={`${BTN_OUTLINE} h-10 w-full`}
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Review {raise.findings.length} suggestions
            </button>
          ) : null}

          <BottomSheet
            open={promptsSheet}
            onClose={() => setPromptsSheet(false)}
            title="Prompts"
            top={150}
          >
            {promptsCardFor(true)}
          </BottomSheet>
          <BottomSheet
            open={raiseSheet && Boolean(raise)}
            onClose={() => setRaiseSheet(false)}
            title="Raise the ceiling"
            top={400}
            footer={
              raise ? (
                <>
                  <button
                    type="button"
                    onClick={useAll}
                    disabled={raise.findings.length === 0}
                    className={`${BTN_PRIMARY} h-[42px] flex-1`}
                  >
                    Use all {raise.findings.length}
                  </button>
                  <button
                    type="button"
                    onClick={clearRaise}
                    className={`${BTN_OUTLINE} h-[42px]`}
                  >
                    Done
                  </button>
                </>
              ) : null
            }
          >
            {raise ? (
              <RaiseSheetBody
                ambition={raise.ambition}
                findings={raise.findings}
                activeId={activeId}
                busy={anotherBusy}
                onSelect={selectFromList}
                onUse={sheetUse}
                onAnother={(f) => void anotherSuggestion(f)}
                onKeep={sheetKeep}
              />
            ) : null}
          </BottomSheet>
          {floatingTools}
        </>
      ) : (
        <>
          {inlineErrors}
          {paperNarration}
          <div className="flex flex-col gap-3">{sideColumn}</div>
        </>
      )}
      {guidelinesModal}
      {prepareCheckDialog}
    </div>
  );
}

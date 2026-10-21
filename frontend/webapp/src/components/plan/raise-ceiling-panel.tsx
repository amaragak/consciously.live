import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AmbitionAimBar,
  RaiseLevelDial,
  RaiseLineDial,
} from "@/components/plan/raise-level-dial";
import {
  ambitionLabel,
  ambitionShownForRaise,
  findingTypeLabel,
  raiseSuggestionLabel,
  suggestionAt,
  type RaiseLevel,
  type RaiseSuggestions,
  type StoryFindingType,
} from "@/lib/manifesto-story-llm";

const LIGHT = "color-mix(in srgb, var(--gold) 70%, white)";
const SERIF_DISPLAY: CSSProperties = { fontVariationSettings: "'opsz' 144" };
const SERIF_TEXT: CSSProperties = { fontVariationSettings: "'opsz' 24" };
const CARD =
  "rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]";
const BTN_PRIMARY =
  "accent-fill-gradient inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.45]";
const BTN_OUTLINE =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-[0.45]";
const LABEL_CAPS =
  "font-ui text-[10px] font-semibold uppercase tracking-[2.6px] text-accent-link";

export type RaiseReadPhase = "ready" | "reading" | "error";

const RaiseSideOpenContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

/** Life-area page frame. Reserves the side-panel width while Raise the ceiling is open. */
export function RaiseSideFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <RaiseSideOpenContext.Provider value={{ open, setOpen }}>
      <div
        className={`${className ?? ""} transition-[padding] duration-200 ease-out ${
          open ? "lg:pr-[420px]" : ""
        }`.trim()}
      >
        {children}
      </div>
    </RaiseSideOpenContext.Provider>
  );
}

export function useRaiseSideOpen(): boolean {
  return useContext(RaiseSideOpenContext).open;
}

export function useSetRaiseSideOpen(): (open: boolean) => void {
  return useContext(RaiseSideOpenContext).setOpen;
}

function RaiseReadStatus({
  phase,
  onRetry,
}: {
  phase: "reading" | "error";
  onRetry?: () => void;
}) {
  if (phase === "error") {
    return (
      <div className="mb-3.5 flex items-center gap-2.5 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3">
        <p className="text-sm font-semibold text-foreground">
          Couldn't read this just now.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="cursor-pointer font-semibold text-accent-link"
          >
            Try again
          </button>
        </p>
      </div>
    );
  }
  return (
    <div className="mb-3.5 flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent-soft px-3.5 py-3">
      <span
        className="mt-0.5 size-[18px] shrink-0 animate-spin rounded-full border-2 border-accent/40 border-t-accent"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">
          Reading your dream and moment
        </p>
        <p className="mt-0.5 text-xs text-foreground">
          Finding the places you played it safe. Usually a few seconds.
        </p>
      </div>
    </div>
  );
}

function RaiseSkeletons() {
  return (
    <div className="flex flex-col gap-3.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-2.5 rounded-xl border border-border p-3.5"
        >
          <span className="mm-skeleton h-3 w-[30%] rounded-md" />
          <span className="mm-skeleton h-3 w-[70%] rounded-md" />
          <span className="mm-skeleton h-3 w-[92%] rounded-md" />
          <span className="mm-skeleton h-3 w-[55%] rounded-md" />
        </div>
      ))}
    </div>
  );
}

export type RaiseCeilingFinding = {
  id: string;
  quote: string;
  type: StoryFindingType;
  suggestion: string;
  suggestions: RaiseSuggestions;
  level: RaiseLevel;
  status: "open" | "used" | "kept";
};

function raiseEmptyCopy(ambition: number): string {
  if (ambition <= 0) return "Write a little first — then we can push it further.";
  if (ambition >= 0.45) return "Nothing to raise. That’s already ambitious.";
  return "Still sensible. Keep going, or say the version you’d almost not admit.";
}

function RaiseActionRow({
  busy,
  onUse,
  onAnother,
  onKeep,
}: {
  busy: boolean;
  onUse: () => void;
  onAnother?: () => void;
  onKeep?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        onClick={onUse}
        disabled={busy}
        className={`${BTN_PRIMARY} h-[34px]`}
      >
        Use this
      </button>
      {onAnother ? (
        <button
          type="button"
          onClick={onAnother}
          disabled={busy}
          className={`${BTN_OUTLINE} h-[34px]`}
        >
          <Sparkles
            className={`h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`}
            aria-hidden
          />
          Another
        </button>
      ) : null}
      {onKeep ? (
        <button
          type="button"
          onClick={onKeep}
          className="cursor-pointer text-[13px] text-muted transition-colors hover:text-foreground"
        >
          Keep mine
        </button>
      ) : null}
    </div>
  );
}

function AmbitionBlock({
  ambition,
  level,
  findings,
}: {
  ambition: number;
  level: RaiseLevel;
  findings: number;
}) {
  const shown = ambitionShownForRaise(ambition, findings);
  return (
    <AmbitionAimBar ambition={shown} level={level} title={ambitionLabel(shown)} />
  );
}

export function RaiseCard<T extends RaiseCeilingFinding>({
  ambition,
  level,
  onLevel,
  findings,
  activeId,
  anotherBusyId,
  onSelect,
  onLineLevel,
  onUseAll,
  onDone,
  onUse,
  onAnother,
  onKeep,
  variant = "stack",
  stacked = false,
  phase: phaseProp = "ready",
  onRetry,
}: {
  ambition: number;
  level: RaiseLevel;
  onLevel: (level: RaiseLevel) => void;
  findings: T[];
  activeId: string | null;
  anotherBusyId: string | null;
  onSelect: (id: string) => void;
  onLineLevel: (id: string, level: RaiseLevel) => void;
  onUseAll: () => void;
  onDone: () => void;
  onUse?: (f: T) => void;
  onAnother?: (f: T) => void;
  onKeep?: (f: T) => void;
  /** Life-area flyout. Story keeps the stacked card. */
  variant?: "stack" | "flyout";
  /** Side panel stacks the dial and uses one card column. */
  stacked?: boolean;
  phase?: RaiseReadPhase;
  onRetry?: () => void;
}) {
  const n = findings.length;
  const phase = phaseProp ?? "ready";
  const waiting = phase !== "ready";
  const heading = (
    <p
      className={`font-display text-[22px] leading-tight ${
        waiting && n === 0 ? "text-muted" : "text-foreground"
      }`}
      style={SERIF_DISPLAY}
    >
      {waiting && n === 0
        ? "Places you played it safe"
        : `${n} ${n === 1 ? "place" : "places"} you played it safe`}
    </p>
  );
  if (variant === "flyout") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-col gap-4 px-[22px] pb-4 pt-[18px]">
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
          <div
            className={`flex flex-col items-stretch gap-4 ${
              stacked ? "" : "lg:flex-row lg:items-center lg:gap-7"
            } ${waiting ? "pointer-events-none opacity-45" : ""}`}
          >
            <RaiseLevelDial natural={!stacked} level={level} onChange={onLevel} sunSize={36} />
            <div className="min-w-0 flex-1">
              <AmbitionBlock ambition={ambition} level={level} findings={n} />
            </div>
          </div>
          <div className="h-px bg-border" />
          {heading}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-[22px] pb-3">
          {waiting ? (
            <RaiseReadStatus phase={phase === "error" ? "error" : "reading"} onRetry={onRetry} />
          ) : null}
          {phase === "reading" && n === 0 ? (
            <RaiseSkeletons />
          ) : n > 0 ? (
            <div
              className={`grid grid-cols-1 items-start gap-3.5 ${
                stacked ? "" : "lg:grid-cols-2"
              } ${phase === "ready" ? "raise-cards-in" : ""}`}
            >
              {findings.map((f) => {
                const active = f.id === activeId;
                return (
                  <div
                    key={f.id}
                    className={`flex flex-col gap-1 rounded-[10px] border border-border p-[10px] text-left ${
                      anotherBusyId === f.id ? "opacity-50" : ""
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(f.id)}
                        className={`${LABEL_CAPS} cursor-pointer text-left`}
                      >
                        {findingTypeLabel(f.type)}
                      </button>
                      {f.status === "open" ? (
                        <span className="ml-auto">
                          <RaiseLineDial
                            level={f.level}
                            onChange={(next) => onLineLevel(f.id, next)}
                          />
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect(f.id)}
                      className="flex w-full cursor-pointer flex-col gap-1 text-left"
                    >
                      <span className="text-[13px] text-muted">“{f.quote.trim()}”</span>
                      <span className="flex items-start gap-1.5 text-sm text-foreground">
                        <ArrowRight
                          className="mt-0.5 h-4 w-4 shrink-0 text-accent-link"
                          aria-hidden
                        />
                        {raiseSuggestionLabel(suggestionAt(f, f.level))}
                      </span>
                    </button>
                    {active && onUse ? (
                      <RaiseActionRow
                        busy={anotherBusyId === f.id}
                        onUse={() => onUse(f)}
                        onAnother={onAnother ? () => onAnother(f) : undefined}
                        onKeep={onKeep ? () => onKeep(f) : undefined}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : phase === "ready" ? (
            <p className="text-sm text-muted">{raiseEmptyCopy(ambition)}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-[22px] pb-5 pt-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onUseAll}
              disabled={waiting || n === 0}
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
      </div>
    );
  }
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

      <RaiseLevelDial level={level} onChange={onLevel} sunSize={36} />

      <AmbitionBlock ambition={ambition} level={level} findings={n} />

      {heading}

      {n > 0 ? (
        <ul className="m-0 flex list-none flex-col p-0">
          {findings.map((f) => {
            const active = f.id === activeId;
            return (
              <li key={f.id}>
                <div
                  className={`flex flex-col gap-1 ${
                    anotherBusyId === f.id ? "opacity-50" : ""
                  } ${
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
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onSelect(f.id)}
                      className={`${LABEL_CAPS} cursor-pointer text-left`}
                    >
                      {findingTypeLabel(f.type)}
                    </button>
                    {f.status === "open" ? (
                      <span className="ml-auto">
                        <RaiseLineDial
                          level={f.level}
                          onChange={(next) => onLineLevel(f.id, next)}
                        />
                      </span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect(f.id)}
                    className="flex w-full cursor-pointer flex-col gap-1 text-left"
                  >
                    <span className="text-[13px] text-muted">
                      “{f.quote.trim()}”
                    </span>
                    <span className="flex items-start gap-1.5 text-sm text-foreground">
                      <ArrowRight
                        className="mt-0.5 h-4 w-4 shrink-0 text-accent-link"
                        aria-hidden
                      />
                      {raiseSuggestionLabel(suggestionAt(f, f.level))}
                    </span>
                  </button>
                  {active && onUse ? (
                    <RaiseActionRow
                      busy={anotherBusyId === f.id}
                      onUse={() => onUse(f)}
                      onAnother={onAnother ? () => onAnother(f) : undefined}
                      onKeep={onKeep ? () => onKeep(f) : undefined}
                    />
                  ) : null}
                </div>
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

export function RaiseSheetBody<T extends RaiseCeilingFinding>({
  ambition,
  level,
  onLevel,
  findings,
  activeId,
  busyId,
  onSelect,
  onLineLevel,
  onUse,
  onAnother,
  onKeep,
  phase: phaseProp = "ready",
  onRetry,
}: {
  ambition: number;
  level: RaiseLevel;
  onLevel: (level: RaiseLevel) => void;
  findings: T[];
  activeId: string | null;
  busyId: string | null;
  onSelect: (id: string) => void;
  onLineLevel: (id: string, level: RaiseLevel) => void;
  onUse: (f: T) => void;
  onAnother: (f: T) => void;
  onKeep: (f: T) => void;
  phase?: RaiseReadPhase;
  onRetry?: () => void;
}) {
  const n = findings.length;
  const phase = phaseProp ?? "ready";
  const waiting = phase !== "ready";
  const rowEls = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    if (!activeId) return;
    rowEls.current
      .get(activeId)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId]);

  return (
    <div className="flex flex-col gap-3 px-[18px] pb-4">
      <div className={waiting ? "pointer-events-none flex flex-col gap-3 opacity-45" : "flex flex-col gap-3"}>
        <RaiseLevelDial level={level} onChange={onLevel} sunSize={26} />
        <AmbitionBlock ambition={ambition} level={level} findings={n} />
      </div>
      <p
        className={`font-display text-[19px] leading-tight ${
          waiting && n === 0 ? "text-muted" : "text-foreground"
        }`}
        style={SERIF_DISPLAY}
      >
        {waiting && n === 0
          ? "Places you played it safe"
          : `${n} ${n === 1 ? "place" : "places"} you played it safe`}
      </p>
      {waiting ? (
        <RaiseReadStatus phase={phase === "error" ? "error" : "reading"} onRetry={onRetry} />
      ) : null}
      {phase === "reading" && n === 0 ? (
        <RaiseSkeletons />
      ) : n > 0 ? (
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
                    className={`flex flex-col gap-2 rounded-xl border p-3 ${
                      busyId === f.id ? "opacity-50" : ""
                    }`}
                    style={{
                      borderColor: LIGHT,
                      backgroundColor: "var(--accent-soft)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={LABEL_CAPS}>{findingTypeLabel(f.type)}</span>
                      {f.status === "open" ? (
                        <span className="ml-auto">
                          <RaiseLineDial
                            level={f.level}
                            mobile
                            onChange={(next) => onLineLevel(f.id, next)}
                          />
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[13px] text-muted">
                      “{f.quote.trim()}”
                    </span>
                    <p
                      className="font-display text-base leading-[1.45] text-foreground"
                      style={SERIF_TEXT}
                    >
                      {raiseSuggestionLabel(suggestionAt(f, f.level))}
                    </p>
                    <RaiseActionRow
                      busy={busyId === f.id}
                      onUse={() => onUse(f)}
                      onAnother={() => onAnother(f)}
                      onKeep={() => onKeep(f)}
                    />
                  </div>
                ) : (
                  <div
                    className={`flex flex-col gap-1 border-t border-border py-[10px] ${
                      busyId === f.id ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelect(f.id)}
                        className={`${LABEL_CAPS} cursor-pointer text-left`}
                      >
                        {findingTypeLabel(f.type)}
                      </button>
                      {f.status === "open" ? (
                        <span className="ml-auto">
                          <RaiseLineDial
                            level={f.level}
                            mobile
                            onChange={(next) => onLineLevel(f.id, next)}
                          />
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect(f.id)}
                      className="flex w-full cursor-pointer flex-col gap-1 text-left"
                    >
                      <span className="text-[13px] text-muted">
                        “{f.quote.trim()}”
                      </span>
                      <span className="flex items-start gap-1.5 text-sm text-foreground">
                        <ArrowRight
                          className="mt-0.5 h-4 w-4 shrink-0 text-accent-link"
                          aria-hidden
                        />
                        {raiseSuggestionLabel(suggestionAt(f, f.level))}
                      </span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : phase === "ready" ? (
        <p className="text-sm text-muted">{raiseEmptyCopy(ambition)}</p>
      ) : null}
    </div>
  );
}

const RaisePanelSlotContext = createContext<HTMLElement | null>(null);

/** Renders a slot under the hero so the desktop card does not cover the text. */
export function RaisePanelSlot({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  return (
    <RaisePanelSlotContext.Provider value={el}>
      {children}
      <div ref={setEl} />
    </RaisePanelSlotContext.Provider>
  );
}

export function BottomSheet({
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

export function RaiseCeilingPlacement({
  wide,
  card,
  sheet,
}: {
  wide: boolean;
  card: ReactNode;
  sheet: ReactNode;
}) {
  const slot = useContext(RaisePanelSlotContext);
  if (wide) {
    if (!slot) return null;
    return createPortal(
      <div className="mt-3 w-full md:w-[320px]">{card}</div>,
      slot,
    );
  }
  if (typeof document === "undefined") return null;
  return createPortal(sheet, document.body);
}

/** Desktop life-area panel. The page narrows beside it; the page click does not close it. */
export function RaiseSidePanel({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="dialog"
      aria-label="Raise the ceiling"
      className="fixed bottom-0 right-0 top-[var(--app-header-h)] z-[120] flex w-[420px] max-w-full flex-col border-l border-border bg-card shadow-lg"
    >
      {children}
    </div>,
    document.body,
  );
}

/** Full-width flyout under the life-area Raise the ceiling button. */
export function RaiseFlyout({
  anchor,
  onClose,
  children,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  const [box, setBox] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    caret: number;
  } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const hero = anchor?.closest("[data-life-hero]") as HTMLElement | null;
      if (!anchor || !hero) return;
      const button = anchor.getBoundingClientRect();
      const bounds = hero.getBoundingClientRect();
      const top = button.bottom + 8;
      const maxHeight = Math.max(180, window.innerHeight - top - 24);
      const caret = Math.min(
        Math.max(16, button.left + button.width / 2 - bounds.left - 7),
        Math.max(16, bounds.width - 28),
      );
      setBox({ top, left: bounds.left, width: bounds.width, maxHeight, caret });
    };
    place();
    if (!scrolled.current && anchor) {
      scrolled.current = true;
      const button = anchor.getBoundingClientRect();
      const room = window.innerHeight - (button.bottom + 8) - 24;
      const need = Math.max(0, 320 - room);
      const maxScroll = Math.max(0, button.top - 64);
      const delta = Math.min(need, maxScroll);
      if (delta > 8) window.scrollBy({ top: delta, behavior: "smooth" });
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const hero = anchor?.closest("[data-life-hero]");
    const observer = hero ? new ResizeObserver(place) : null;
    if (hero && observer) observer.observe(hero);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      observer?.disconnect();
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onDown, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined" || !box) return null;
  return createPortal(
    <div
      className="fixed z-[120] flex flex-col"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        maxHeight: box.maxHeight,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[7px] size-3.5 rotate-45 border-l border-t border-border bg-card"
        style={{ left: box.caret }}
      />
      <div
        ref={ref}
        role="dialog"
        aria-label="Raise the ceiling"
        className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-[18px] border border-border bg-card shadow-[0_24px_60px_rgba(15,27,45,0.22)]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
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

      <RaiseLevelDial level={level} onChange={onLevel} sunSize={36} />

      <AmbitionBlock ambition={ambition} level={level} findings={n} />

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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onUse(f)}
                        disabled={anotherBusyId === f.id}
                        className={`${BTN_PRIMARY} h-[34px]`}
                      >
                        Use this
                      </button>
                      {onAnother ? (
                        <button
                          type="button"
                          onClick={() => onAnother(f)}
                          disabled={anotherBusyId === f.id}
                          className={`${BTN_OUTLINE} h-[34px]`}
                        >
                          <Sparkles
                            className={`h-3.5 w-3.5 ${anotherBusyId === f.id ? "animate-pulse" : ""}`}
                            aria-hidden
                          />
                          Another
                        </button>
                      ) : null}
                      {onKeep ? (
                        <button
                          type="button"
                          onClick={() => onKeep(f)}
                          className="ml-auto cursor-pointer whitespace-nowrap text-[13px] text-muted transition-colors hover:text-foreground"
                        >
                          Keep mine
                        </button>
                      ) : null}
                    </div>
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
      <RaiseLevelDial level={level} onChange={onLevel} sunSize={26} />
      <AmbitionBlock ambition={ambition} level={level} findings={n} />
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
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onUse(f)}
                        disabled={busyId === f.id}
                        className={`${BTN_PRIMARY} h-[34px]`}
                      >
                        Use this
                      </button>
                      <button
                        type="button"
                        onClick={() => onAnother(f)}
                        disabled={busyId === f.id}
                        className={`${BTN_OUTLINE} h-[34px]`}
                      >
                        <Sparkles
                          className={`h-3.5 w-3.5 ${busyId === f.id ? "animate-pulse" : ""}`}
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
      ) : (
        <p className="text-sm text-muted">{raiseEmptyCopy(ambition)}</p>
      )}
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

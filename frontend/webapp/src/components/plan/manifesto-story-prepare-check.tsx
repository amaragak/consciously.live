/**
 * Ambition check dialog before Prepare / Update narration (StoryCheck pack).
 */

import {
  Check,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
import {
  AmbitionAimBar,
  RaiseLevelDial,
  RaiseLineDial,
} from "@/components/plan/raise-level-dial";

const SERIF_DISPLAY = { fontVariationSettings: "'opsz' 144" } as const;
const SERIF_TEXT = { fontVariationSettings: "'opsz' 24" } as const;

const BTN_PRIMARY =
  "accent-fill-gradient inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.45]";
const BTN_OUTLINE =
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-[0.45]";

export type PrepareCheckDecision = "used" | "kept" | null;

export type PrepareCheckFinding = {
  id: string;
  quote: string;
  suggestion: string;
  suggestions: RaiseSuggestions;
  type: StoryFindingType;
  level: RaiseLevel;
  pastSuggestions: string[];
};

function FindingRow({
  finding,
  decision,
  wide,
  anotherBusy,
  onDecide,
  onLevel,
  onAnother,
}: {
  finding: PrepareCheckFinding;
  decision: PrepareCheckDecision;
  wide: boolean;
  anotherBusy: boolean;
  onDecide: (d: PrepareCheckDecision) => void;
  onLevel: (level: RaiseLevel) => void;
  onAnother: () => void;
}) {
  const used = decision === "used";
  const kept = decision === "kept";
  const open = !decision;
  const sug = raiseSuggestionLabel(suggestionAt(finding, finding.level));
  return (
    <div
      className={`flex gap-3 rounded-[14px] border px-3.5 py-3 transition-opacity ${
        anotherBusy ? "opacity-50" : ""
      } ${
        used
          ? "border-accent/35 bg-accent-soft/50"
          : kept
            ? "border-border opacity-[0.55]"
            : "border-border bg-card"
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[1.3px] text-accent-link">
            {findingTypeLabel(finding.type)}
          </span>
          {open ? (
            <span className="ml-auto">
              <RaiseLineDial
                level={finding.level}
                mobile={!wide}
                onChange={onLevel}
              />
            </span>
          ) : null}
        </div>
        <p
          className={`text-[13px] leading-snug text-muted ${
            kept ? "" : "line-through"
          }`}
        >
          {finding.quote}
        </p>
        {sug !== "remove" ? (
          <p
            className={`font-display leading-[1.5] text-foreground ${
              kept ? "line-through" : ""
            }`}
            style={{
              ...SERIF_TEXT,
              fontSize: wide ? 16 : 15,
            }}
          >
            {sug}
          </p>
        ) : (
          <p className="text-[13px] italic text-muted">remove</p>
        )}
        {!decision ? (
          <button
            type="button"
            disabled={anotherBusy}
            onClick={onAnother}
            className="inline-flex w-fit cursor-pointer items-center gap-1 text-xs font-semibold text-accent-link disabled:cursor-not-allowed disabled:opacity-50"
          >
            {anotherBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3 w-3" aria-hidden />
            )}
            Another
          </button>
        ) : null}
      </div>
      <div className="flex shrink-0 items-start gap-1.5">
        <button
          type="button"
          aria-label="Use suggestion"
          aria-pressed={used}
          onClick={() => onDecide(used ? null : "used")}
          className={`flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full transition-colors ${
            used
              ? "accent-fill-gradient text-on-accent"
              : "border border-border bg-card text-foreground hover:border-accent/50"
          }`}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Keep my wording"
          aria-pressed={kept}
          onClick={() => onDecide(kept ? null : "kept")}
          className={`flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full transition-colors ${
            kept
              ? "bg-foreground text-background"
              : "border border-border bg-card text-foreground hover:border-accent/50"
          }`}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function ManifestoStoryPrepareCheck({
  open,
  wide,
  level,
  onLevel,
  ambition,
  findings,
  decisions,
  anotherBusyId,
  onClose,
  onDecide,
  onLineLevel,
  onAnother,
  onPrepareAsIs,
  onPrepareWithChanges,
}: {
  open: boolean;
  wide: boolean;
  level: RaiseLevel;
  onLevel: (level: RaiseLevel) => void;
  ambition: number;
  findings: PrepareCheckFinding[];
  decisions: Record<string, PrepareCheckDecision>;
  anotherBusyId: string | null;
  onClose: () => void;
  onDecide: (id: string, d: PrepareCheckDecision) => void;
  onLineLevel: (id: string, level: RaiseLevel) => void;
  onAnother: (id: string) => void;
  onPrepareAsIs: () => void;
  onPrepareWithChanges: () => void;
}) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const n = findings.length;
  const used = findings.filter((f) => decisions[f.id] === "used").length;
  const kept = findings.filter((f) => decisions[f.id] === "kept").length;
  const left = n - used - kept;
  const title =
    n === 1 ? "1 line could go bigger" : `${n} lines could go bigger`;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Before you narrate
          </span>
          <h2
            className="font-display text-[26px] font-normal leading-tight text-foreground"
            style={SERIF_DISPLAY}
          >
            {title}
          </h2>
          <p className="text-[13px] leading-snug text-foreground/85">
            Only new or changed lines are checked. Anything you keep stays as
            you wrote it.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <RaiseLevelDial
        level={level}
        onChange={onLevel}
        sunSize={wide ? 36 : 26}
      />

      {wide ? (
        <AmbitionAimBar
          ambition={ambitionShownForRaise(ambition, findings.length)}
          level={level}
          title={ambitionLabel(
            ambitionShownForRaise(ambition, findings.length),
          )}
        />
      ) : null}

      <div className="flex max-h-[min(48vh,420px)] flex-col gap-2.5 overflow-y-auto">
        {findings.map((f) => (
          <FindingRow
            key={f.id}
            finding={f}
            decision={decisions[f.id] ?? null}
            wide={wide}
            anotherBusy={anotherBusyId === f.id}
            onDecide={(d) => onDecide(f.id, d)}
            onLevel={(level) => onLineLevel(f.id, level)}
            onAnother={() => onAnother(f.id)}
          />
        ))}
      </div>

      {wide ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            {used} used · {kept} kept · {left} to decide
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPrepareAsIs}
              className={`${BTN_OUTLINE} h-11 px-5`}
            >
              Leave it as is
            </button>
            <button
              type="button"
              onClick={onPrepareWithChanges}
              className={`${BTN_PRIMARY} h-11 px-5`}
            >
              <Wand2 className="h-4 w-4" aria-hidden />
              Apply suggestions
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onPrepareAsIs}
            className={`${BTN_OUTLINE} h-11 w-full`}
          >
            Leave it as is
          </button>
          <button
            type="button"
            onClick={onPrepareWithChanges}
            className={`${BTN_PRIMARY} h-11 w-full`}
          >
            <Wand2 className="h-4 w-4" aria-hidden />
            Apply suggestions
          </button>
        </div>
      )}
    </>
  );

  return createPortal(
    <div
      className={`fixed inset-x-0 bottom-0 top-14 z-[210] lg:left-[var(--app-sidebar-w,200px)] ${
        entered ? "bg-overlay/45" : "bg-overlay/0"
      } transition-colors duration-200`}
      onClick={onClose}
    >
      {wide ? (
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Before you narrate"
            onClick={(e) => e.stopPropagation()}
            className={`flex w-full max-w-[660px] flex-col gap-[18px] rounded-[20px] border border-border bg-card px-[26px] pb-[22px] pt-[26px] shadow-[0_20px_60px_rgba(15,27,45,0.18)] transition-transform duration-200 ${
              entered ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
            }`}
          >
            {body}
          </div>
        </div>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Before you narrate"
          onClick={(e) => e.stopPropagation()}
          className={`absolute inset-x-0 bottom-0 top-[90px] flex flex-col overflow-hidden rounded-t-[22px] border border-b-0 border-border bg-card shadow-xl transition-transform duration-200 ${
            entered ? "translate-y-0" : "translate-y-6"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-4 pt-5">
            <div className="flex flex-col gap-4">{body}</div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

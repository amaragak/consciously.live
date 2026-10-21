import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MIST, textHash } from "@/components/plan/life-area/kit";
import {
  BottomSheet,
  RaiseCard,
  RaiseFlyout,
  RaiseSheetBody,
  RaiseSidePanel,
  useSetRaiseSideOpen,
  type RaiseCeilingFinding,
  type RaiseReadPhase,
} from "@/components/plan/raise-ceiling-panel";
import { useMinWidth } from "@/hooks/use-min-width";
import {
  raiseStoryCeiling,
  regenerateFindingLine,
  suggestionAt,
  surroundingSentences,
  type RaiseLevel,
  type StoryFinding,
  type StoryRaiseResult,
} from "@/lib/manifesto-story-llm";

type Field = {
  text: string;
  original?: string | null;
  raisedFrom?: string | null;
  storageKey: string;
  onAccept: (next: string, original: string) => void;
  onRestore: (original: string) => void;
  onClear: () => void;
};

type Live = RaiseCeilingFinding & {
  start: number;
  end: number;
  field: number;
};

function isRaised(field: Field): boolean {
  return Boolean(
    field.text.trim() &&
      field.raisedFrom &&
      field.raisedFrom === textHash(field.text),
  );
}

function toLive(f: StoryFinding, level: RaiseLevel, field: number): Live {
  return {
    id: `${field}:${f.id}`,
    quote: f.quote,
    type: f.type,
    suggestion: f.suggestion,
    suggestions: f.suggestions,
    level,
    status: "open",
    start: f.start,
    end: f.end,
    field,
  };
}

export function RaiseControl({
  text,
  original,
  raisedFrom,
  storageKey,
  onAccept,
  onRestore,
  onClear,
  also,
  hideTrigger = false,
  tone = "default",
}: {
  text: string;
  original?: string | null;
  raisedFrom?: string | null;
  storageKey: string;
  onAccept: (next: string, original: string) => void;
  onRestore: (original: string) => void;
  onClear: () => void;
  /** Second field, such as The moment, raised in the same pass. */
  also?: Field | null;
  hideTrigger?: boolean;
  tone?: "default" | "onDark";
}) {
  const wide = useMinWidth(768);
  const side = useMinWidth(1024);
  const setRaiseSide = useSetRaiseSideOpen();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const onDark = tone === "onDark";
  const primary: Field = {
    text,
    original,
    raisedFrom,
    storageKey,
    onAccept,
    onRestore,
    onClear,
  };
  const fields = [primary, ...(also?.text.trim() ? [also] : [])];
  const unlocked = fields.filter((field) => !isRaised(field));
  const cache = useRef(new Map<string, { ambition: number; findings: Live[] }>());
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [level, setLevel] = useState<RaiseLevel>("audacious");
  const [ambition, setAmbition] = useState(0);
  const [findings, setFindings] = useState<Live[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [originalOpen, setOriginalOpen] = useState<Record<string, boolean>>({});

  function remember(key: string, show: boolean) {
    setOriginalOpen((prev) => ({ ...prev, [key]: show }));
    try {
      localStorage.setItem(key, show ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function readOriginal(key: string): boolean {
    if (key in originalOpen) return originalOpen[key]!;
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }

  function cacheKey(): string {
    return unlocked.map((field) => field.text.trim()).join("\n\n");
  }

  useEffect(() => {
    if (!(open && side)) return;
    setRaiseSide(true);
    return () => setRaiseSide(false);
  }, [open, setRaiseSide, side]);

  function applyLevel(next: RaiseLevel, rows = findings) {
    setLevel(next);
    setFindings(rows.map((f) => (f.status === "open" ? { ...f, level: next } : f)));
  }

  async function raise() {
    const key = cacheKey();
    if (!key) return;
    const hit = cache.current.get(key);
    if (hit) {
      setFailed(false);
      setAmbition(hit.ambition);
      applyLevel(level, hit.findings);
      setActiveId(hit.findings[0]?.id ?? null);
      setOpen(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    setFindings([]);
    setOpen(true);
    try {
      const merged: Live[] = [];
      let score = 0;
      for (const [index, field] of fields.entries()) {
        if (isRaised(field)) continue;
        const result: StoryRaiseResult = await raiseStoryCeiling(field.text, [], {
          raisedFrom: field.raisedFrom ?? undefined,
          textHash: textHash(field.text),
        });
        score = Math.max(score, result.ambition);
        for (const finding of result.findings) {
          merged.push(toLive(finding, level, index));
        }
      }
      cache.current.clear();
      cache.current.set(key, { ambition: score, findings: merged });
      setAmbition(score);
      setFindings(merged);
      setActiveId(merged[0]?.id ?? null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function writeFinding(f: Live, replacement: string) {
    const field = fields[f.field];
    if (!field) return;
    if (!field.text.includes(f.quote)) return;
    field.onAccept(field.text.replace(f.quote, replacement), field.text);
  }

  function useOne(f: Live) {
    writeFinding(f, suggestionAt(f, f.level));
    setFindings((rows) => {
      const next = rows.filter((row) => row.id !== f.id);
      setActiveId(next[0]?.id ?? null);
      if (next.length === 0) setOpen(false);
      return next;
    });
  }

  function useAll() {
    const ordered = findings.slice().sort((a, b) => b.field - a.field || b.start - a.start);
    const drafts = fields.map((field) => field.text);
    for (const f of ordered) {
      const replacement = suggestionAt(f, f.level);
      const current = drafts[f.field] ?? "";
      drafts[f.field] = current.includes(f.quote)
        ? current.replace(f.quote, replacement)
        : current;
    }
    fields.forEach((field, index) => {
      if (drafts[index] !== field.text) field.onAccept(drafts[index]!, field.text);
    });
    setOpen(false);
  }

  function keep(f: Live) {
    setFindings((rows) => {
      const next = rows.filter((row) => row.id !== f.id);
      setActiveId(next[0]?.id ?? null);
      if (next.length === 0) setOpen(false);
      return next;
    });
  }

  async function another(f: Live) {
    setBusyId(f.id);
    try {
      const next = await regenerateFindingLine({
        quote: f.quote,
        level: f.level,
        surrounding: surroundingSentences(fields[f.field]?.text ?? f.quote, f.start, f.end),
        pastSuggestions: [suggestionAt(f, f.level)],
        person: "first",
      });
      if (!next) return;
      setFindings((rows) =>
        rows.map((row) =>
          row.id === f.id
            ? {
                ...row,
                suggestions: { ...row.suggestions, [row.level]: next },
                suggestion: row.level === "ambitious" ? next : row.suggestion,
              }
            : row,
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (!text.trim() && !also?.text.trim()) return null;

  const showButton = !hideTrigger && unlocked.length > 0;
  const raisedPrimary = isRaised(primary);
  const phase: RaiseReadPhase = busy ? "reading" : failed ? "error" : "ready";
  const card = (
    <RaiseCard
      variant="flyout"
      stacked={side}
      phase={phase}
      onRetry={() => void raise()}
      ambition={ambition}
      level={level}
      onLevel={(next) => applyLevel(next)}
      findings={findings}
      activeId={activeId}
      anotherBusyId={busyId}
      onSelect={setActiveId}
      onLineLevel={(id, next) =>
        setFindings((rows) =>
          rows.map((row) => (row.id === id ? { ...row, level: next } : row)),
        )
      }
      onUseAll={useAll}
      onDone={() => setOpen(false)}
      onUse={useOne}
      onAnother={(f) => void another(f)}
      onKeep={keep}
    />
  );

  return (
    <div className="mt-2">
      {raisedPrimary ? (
        <p
          key={primary.storageKey}
          className={`flex flex-wrap items-center gap-1 text-xs ${
            onDark ? "text-white/80" : "text-muted"
          }`}
        >
          <Sparkles
            className={`size-3 ${onDark ? "text-white/80" : "text-accent-link"}`}
            aria-hidden
          />
          Raised
          <span aria-hidden>·</span>
          <button
            type="button"
            className={`font-semibold ${onDark ? "text-white/80" : "text-accent-link"}`}
            onClick={() => remember(primary.storageKey, !readOriginal(primary.storageKey))}
          >
            {readOriginal(primary.storageKey) ? "Hide original" : "Show original"}
          </button>
        </p>
      ) : null}
      {showButton ? (
        <button
          ref={setAnchor}
          type="button"
          onClick={() => {
            if (open && !side) {
              setOpen(false);
              return;
            }
            if (open) return;
            void raise();
          }}
          aria-expanded={open}
          className={`${MIST} mt-2 h-8 px-3 text-xs ${
            open && !busy ? "shadow-[0_0_0_3px_rgba(200,164,106,0.45)]" : ""
          }`}
        >
          <Sparkles className={`size-3 ${busy ? "animate-pulse" : ""}`} aria-hidden />
          {busy ? "Reading…" : "Raise the ceiling"}
        </button>
      ) : null}
      {readOriginal(primary.storageKey) && primary.original ? (
          <div
            key={`${primary.storageKey}:original`}
            className={`mt-2 flex flex-col gap-1.5 rounded-[10px] border px-3 py-2.5 ${
              onDark ? "border-white/20 bg-transparent" : "border-border bg-background"
            }`}
          >
            <p className={`text-xs ${onDark ? "text-white/80" : "text-muted"}`}>
              What you wrote
            </p>
            <p
              className={`font-display text-[15px] ${
                onDark ? "text-white/80" : "text-foreground"
              }`}
            >
              {primary.original}
            </p>
            <button
              type="button"
              className={`self-start text-xs font-semibold ${
                onDark ? "text-white/80" : "text-accent-link"
              }`}
              onClick={() => {
                primary.onRestore(primary.original || "");
                primary.onClear();
                remember(primary.storageKey, false);
              }}
            >
              Use this instead
            </button>
          </div>
        ) : null}
      {open && side ? <RaiseSidePanel onClose={() => setOpen(false)}>{card}</RaiseSidePanel> : null}
      {open && wide && !side ? (
        <RaiseFlyout anchor={anchor} onClose={() => setOpen(false)}>
          {card}
        </RaiseFlyout>
      ) : null}
      {open && !wide ? (
        <BottomSheet
          open
          onClose={() => setOpen(false)}
          title="Raise the ceiling"
          top={400}
          footer={
            <>
              <button
                type="button"
                onClick={useAll}
                disabled={findings.length === 0 || phase !== "ready"}
                className="accent-fill-gradient inline-flex h-[42px] flex-1 items-center justify-center rounded-full text-sm font-semibold text-on-accent disabled:opacity-45"
              >
                Use all {findings.length}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-[42px] items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground"
              >
                Done
              </button>
            </>
          }
        >
          <p
            className="px-[18px] pb-2 font-display text-lg leading-snug text-foreground"
            style={{ fontVariationSettings: "'opsz' 144" }}
          >
            {text.trim()}
          </p>
          <RaiseSheetBody
            ambition={ambition}
            level={level}
            onLevel={(next) => applyLevel(next)}
            findings={findings}
            activeId={activeId}
            busyId={busyId}
            phase={phase}
            onRetry={() => void raise()}
            onSelect={setActiveId}
            onLineLevel={(id, next) =>
              setFindings((rows) =>
                rows.map((row) => (row.id === id ? { ...row, level: next } : row)),
              )
            }
            onUse={useOne}
            onAnother={(f) => void another(f)}
            onKeep={keep}
          />
        </BottomSheet>
      ) : null}
    </div>
  );
}

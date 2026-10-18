import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { AREA_LABEL, MIST, textHash } from "@/components/plan/life-area/kit";
import { raiseStoryCeiling, suggestionAt } from "@/lib/manifesto-story-llm";

export function RaiseControl({
  text,
  original,
  raisedFrom,
  storageKey,
  onAccept,
  onRestore,
  onClear,
  tone = "default",
}: {
  text: string;
  original?: string | null;
  raisedFrom?: string | null;
  storageKey: string;
  onAccept: (next: string, original: string) => void;
  onRestore: (original: string) => void;
  onClear: () => void;
  tone?: "default" | "onDark";
}) {
  const raised = Boolean(text.trim() && raisedFrom && raisedFrom === textHash(text));
  const [open, setOpen] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [findings, setFindings] = useState<
    { quote: string; suggestion: string }[]
  >([]);
  const [level, setLevel] = useState<"ambitious" | "audacious" | "delusional">(
    "ambitious",
  );
  const onDark = tone === "onDark";

  useEffect(() => {
    try {
      setShowOriginal(localStorage.getItem(storageKey) === "1");
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  function remember(openOriginal: boolean) {
    setShowOriginal(openOriginal);
    try {
      localStorage.setItem(storageKey, openOriginal ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  async function raise() {
    if (!text.trim() || raised) return;
    setBusy(true);
    setOpen(true);
    try {
      const result = await raiseStoryCeiling(text, [], {
        raisedFrom: raisedFrom ?? undefined,
        textHash: textHash(text),
      });
      setFindings(
        result.findings
          .map((f) => ({
            quote: f.quote,
            suggestion: suggestionAt(f, level),
          }))
          .filter((f) => f.suggestion.trim()),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!text.trim()) return null;

  return (
    <div className="mt-2">
      {raised ? (
        <p
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
            onClick={() => remember(!showOriginal)}
          >
            {showOriginal ? "Hide original" : "Show original"}
          </button>
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void raise()}
          className={`${MIST} mt-2 h-8 px-3 text-xs`}
        >
          <Sparkles className="size-3" aria-hidden />
          Raise the ceiling
        </button>
      )}
      {showOriginal && original ? (
        <div
          className={`mt-2 flex flex-col gap-1.5 rounded-[10px] border px-3 py-2.5 ${
            onDark
              ? "border-white/20 bg-transparent"
              : "border-border bg-background"
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
            {original}
          </p>
          <button
            type="button"
            className={`self-start text-xs font-semibold ${
              onDark ? "text-white/80" : "text-accent-link"
            }`}
            onClick={() => {
              onRestore(original);
              onClear();
              remember(false);
            }}
          >
            Use this instead
          </button>
        </div>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-[160] flex items-end justify-center bg-overlay/40 sm:items-center">
          <div className="w-full max-w-lg rounded-t-2xl bg-card p-5 sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <p className={AREA_LABEL}>Raise the ceiling</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="mt-3 flex gap-2 text-xs">
              {(["ambitious", "audacious", "delusional"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLevel(id)}
                  className={`rounded-full px-2.5 py-1 capitalize ${
                    level === id ? "bg-accent-soft text-accent-link" : "text-muted"
                  }`}
                >
                  {id}
                </button>
              ))}
            </div>
            {busy ? (
              <p className="mt-4 text-sm text-muted">Reading…</p>
            ) : findings.length === 0 ? (
              <p className="mt-4 text-sm text-muted">
                Nothing to raise on this version.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {findings.map((f) => (
                  <li key={f.quote} className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted">{f.quote}</p>
                    <p className="mt-1 text-sm text-foreground">{f.suggestion}</p>
                    <button
                      type="button"
                      className={`${MIST} mt-2 h-8 px-3 text-xs`}
                      onClick={() => {
                        const next = text.replace(f.quote, f.suggestion);
                        onAccept(next === text ? f.suggestion : next, text);
                        setOpen(false);
                      }}
                    >
                      Use this
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

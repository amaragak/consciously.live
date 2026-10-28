import { Bookmark, Headphones, MoreHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useLibraryPlayer } from "@/components/library-player-provider";
import { SelectChevron } from "@/components/select-chevron";
import { useMinWidth } from "@/hooks/use-min-width";
import { CREATE_MEDITATE_ROOT } from "@/lib/create-meditation-path";
import {
  affirmationDateLabel,
  armAffirmationMeditation,
  buildAffirmationContext,
  dismissAffirmation,
  ensureTodayAffirmations,
  hasAffirmationContext,
  loadAffirmations,
  localDateKey,
  noteAffirmationEngagement,
  regenerateTodayAffirmations,
  removeSavedAffirmation,
  resumeAffirmations,
  setAffirmationsExpanded,
  setAffirmationsOnDashboard,
  setAffirmationsUseHeal,
  subscribeAffirmations,
  toggleKeepAffirmation,
  turnOffAffirmations,
  turnOnAffirmations,
  undoDismissAffirmation,
  visibleAffirmationLines,
  type AffirmationsStore,
} from "@/lib/daily-affirmations";
import { affirmationSpeechBlob } from "@/lib/daily-affirmations-speak";
import { subscribeIdeateCloud } from "@/lib/ideate-cloud";
import { Link } from "@/lib/spa-nav";

function useAffirmations(): AffirmationsStore {
  return useSyncExternalStore(subscribeAffirmations, loadAffirmations, loadAffirmations);
}

function formatKept(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Kept";
  return `Kept ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

export function DailyAffirmationsWarmup() {
  useEffect(() => {
    const run = () => {
      void ensureTodayAffirmations().catch(() => {});
    };
    run();
    return subscribeIdeateCloud(run);
  }, []);
  return null;
}

export function DashboardAffirmationsCard() {
  const store = useAffirmations();
  const lines = visibleAffirmationLines(store).filter((line) => !line.removed);
  const [listening, setListening] = useState(false);
  const { playTrack } = useLibraryPlayer();
  const urlRef = useRef<string | null>(null);
  if (!store.enabled || store.paused || !store.showOnDashboard || !lines.length) return null;
  const first = lines[0]!;

  async function listen() {
    if (listening) return;
    noteAffirmationEngagement();
    setListening(true);
    try {
      const blob = await affirmationSpeechBlob(lines.map((line) => line.text).join(". "));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      playTrack({
        url,
        title: "Today's affirmations",
        s3Key: `affirmations:dashboard:${store.today?.dateKey ?? "today"}`,
        speakerName: "Affirmations",
      });
    } catch {
      /* the Manifest card surfaces the same failure */
    } finally {
      setListening(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_2px_10px_rgba(15,27,45,0.04)]">
      <p className="min-w-0 flex-1 truncate text-[17px] font-medium leading-snug text-foreground">
        {first.text}
      </p>
      <button
        type="button"
        aria-label="Listen"
        title="Listen"
        disabled={listening}
        onClick={() => void listen()}
        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted"
      >
        <Headphones className="h-4 w-4" aria-hidden />
      </button>
      <Link
        href="/manifest?affirmations=open"
        onClick={() => noteAffirmationEngagement()}
        className="shrink-0 text-[13px] font-semibold text-muted"
      >
        All {lines.length}
      </Link>
    </div>
  );
}

export function DailyAffirmationsCard() {
  const store = useAffirmations();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const wide = useMinWidth(768);
  const { playTrack } = useLibraryPlayer();
  const [menu, setMenu] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [phase, setPhase] = useState<"idle" | "writing" | "failed">("idle");
  const [note, setNote] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const today = localDateKey();
  const day = store.today?.dateKey === today ? store.today : null;
  const lines = day?.lines ?? [];
  const hasContext = hasAffirmationContext(buildAffirmationContext(store.useHeal, store));

  useEffect(() => {
    if (params.get("affirmations") !== "open") return;
    if (store.enabled && !store.paused) setAffirmationsExpanded(true);
    const next = new URLSearchParams(params);
    next.delete("affirmations");
    setParams(next, { replace: true });
  }, [params, setParams, store.enabled, store.paused]);

  useEffect(() => {
    if (!store.enabled || store.paused || day || !hasContext) return;
    let cancelled = false;
    setPhase("writing");
    void ensureTodayAffirmations()
      .then(() => {
        if (!cancelled) setPhase("idle");
      })
      .catch(() => {
        if (!cancelled) setPhase("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [day, hasContext, store.enabled, store.paused]);

  useEffect(() => {
    if (!menu) return;
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menu]);

  async function listen(texts: string[], title: string, key: string) {
    if (listening || !texts.length) return;
    noteAffirmationEngagement();
    setListening(true);
    setNote(null);
    try {
      const blob = await affirmationSpeechBlob(texts.join(". "));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      playTrack({ url, title, s3Key: key, speakerName: "Affirmations" });
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't read these");
    } finally {
      setListening(false);
    }
  }

  function makeMeditation() {
    const texts = lines.filter((line) => !line.removed).map((line) => line.text);
    if (!texts.length) return;
    armAffirmationMeditation(texts);
    navigate(`${CREATE_MEDITATE_ROOT}?step=shape&fromAffirmations=1`);
  }

  async function newSet() {
    if (day?.regenerated) return;
    setMenu(false);
    setPhase("writing");
    setNote(null);
    try {
      await regenerateTodayAffirmations();
      setPhase("idle");
    } catch (e) {
      setPhase("failed");
      setNote(e instanceof Error ? e.message : "Couldn't write a new set");
    }
  }

  const first = lines.find((line) => !line.removed) ?? lines[0];
  const expanded = store.expanded && Boolean(lines.length);

  async function turnOn() {
    if (!hasContext) {
      setNote("Add a dream, a value, or your manifesto, and then turn this on.");
      return;
    }
    setPhase("writing");
    setNote(null);
    try {
      await turnOnAffirmations();
      setPhase("idle");
    } catch (e) {
      setPhase("failed");
      setNote(e instanceof Error ? e.message : "Couldn't write today's affirmations");
    }
  }

  async function resume() {
    setPhase("writing");
    setNote(null);
    try {
      await resumeAffirmations();
      setPhase("idle");
    } catch (e) {
      setPhase("failed");
      setNote(e instanceof Error ? e.message : "Couldn't write today's affirmations");
    }
  }

  if (!store.enabled) {
    return (
      <section id="affirmations" aria-label="Daily affirmations" className="mx-auto mt-3 max-w-6xl px-4 sm:px-6">
        <StatusRow
          wide={wide}
          label="Daily affirmations"
          body="Eleven short lines each day, written from your dreams, values and what you're working through."
          action="Turn on"
          busy={phase === "writing"}
          onAction={() => void turnOn()}
        />
        {note ? <p className="mt-2 text-[13px] text-muted">{note}</p> : null}
      </section>
    );
  }

  if (store.paused) {
    return (
      <section id="affirmations" aria-label="Paused affirmations" className="mx-auto mt-3 max-w-6xl px-4 sm:px-6">
        <StatusRow
          wide={wide}
          label="Paused"
          body="You haven't looked at them for a week, so new ones stopped. Resume to get a fresh set each day."
          action="Resume"
          busy={phase === "writing"}
          onAction={() => void resume()}
        />
        {note ? <p className="mt-2 text-[13px] text-muted">{note}</p> : null}
      </section>
    );
  }

  if (!lines.length && !hasContext && phase !== "writing") return null;

  return (
    <section
      id="affirmations"
      aria-label="Today's affirmations"
      className="mx-auto mt-3 max-w-6xl px-4 sm:px-6"
    >
      <div className="rounded-2xl border border-border bg-card px-[18px] py-4 shadow-[0_2px_10px_rgba(15,27,45,0.04)]">
        {savedOpen ? (
          <SavedList
            store={store}
            listening={listening}
            onBack={() => setSavedOpen(false)}
            onListen={() =>
              void listen(
                store.saved.map((row) => row.text),
                "Saved affirmations",
                "affirmations:saved",
              )
            }
          />
        ) : !lines.length ? (
          phase === "failed" ? (
            <p className="text-[15px] text-muted">
              Today&apos;s affirmations will show up the next time they can be written.
            </p>
          ) : (
            <AffirmationSkeleton />
          )
        ) : expanded ? (
          <>
            <header className="flex flex-wrap items-start gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-accent-link">
                  {affirmationDateLabel()}
                </p>
                <h2 className="mt-1 font-display text-[28px] leading-tight text-foreground">
                  Your affirmations
                </h2>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <IconButton
                  label="Listen"
                  disabled={listening}
                  onClick={() =>
                    void listen(
                      lines.filter((line) => !line.removed).map((line) => line.text),
                      "Today's affirmations",
                      `affirmations:${today}`,
                    )
                  }
                />
                {wide ? (
                  <button
                    type="button"
                    onClick={makeMeditation}
                    className="inline-flex h-[38px] cursor-pointer items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground"
                  >
                    Make a meditation
                  </button>
                ) : null}
                <div className="relative" ref={menuRef}>
                  <IconButton label="More" onClick={() => setMenu((open) => !open)}>
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </IconButton>
                  {menu ? (
                    <Menu
                      regenerated={Boolean(day?.regenerated)}
                      useHeal={store.useHeal}
                      showOnDashboard={store.showOnDashboard}
                      showMake={!wide}
                      onSaved={() => {
                        setMenu(false);
                        setSavedOpen(true);
                      }}
                      onNew={() => void newSet()}
                      onTurnOff={() => {
                        setMenu(false);
                        turnOffAffirmations();
                      }}
                      onHeal={() => setAffirmationsUseHeal(!store.useHeal)}
                      onDashboard={() => setAffirmationsOnDashboard(!store.showOnDashboard)}
                      onMake={() => {
                        setMenu(false);
                        makeMeditation();
                      }}
                    />
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Show less"
                  onClick={() => setAffirmationsExpanded(false)}
                  className="inline-flex h-8 cursor-pointer items-center gap-1 text-[13px] font-semibold text-muted"
                >
                  <SelectChevron open />
                </button>
              </div>
            </header>
            <ul className="mt-2">
              {lines.map((line) => (
                <li
                  key={line.id}
                  className="flex items-start gap-3 border-t border-border py-[18px]"
                >
                  {line.removed ? (
                    <>
                      <p className="min-w-0 flex-1 text-[14px] text-muted">
                        Removed. It won&apos;t come back, and similar lines will show up less.
                      </p>
                      <button
                        type="button"
                        onClick={() => undoDismissAffirmation(line.id)}
                        className="shrink-0 text-[13px] font-semibold text-muted"
                      >
                        Undo
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="text-[18px] font-medium leading-[1.4] text-foreground">
                          {line.text}
                        </p>
                        {line.source ? (
                          <span className="mt-2 inline-flex rounded-full border border-border px-2 py-0.5 text-[12px] font-semibold text-accent-link">
                            {line.source}
                          </span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        aria-pressed={line.kept}
                        aria-label={line.kept ? "Kept" : "Keep"}
                        onClick={() => toggleKeepAffirmation(line.id)}
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-muted"
                      >
                        <Bookmark
                          className="h-4 w-4"
                          fill={line.kept ? "currentColor" : "none"}
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        aria-label="Not for me"
                        onClick={() => dismissAffirmation(line.id)}
                        className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-muted"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <footer className="flex items-center gap-2.5 border-t border-border pt-3 text-[13px] text-muted">
              <span>New ones tomorrow, from your dreams, values and what you&apos;re working through.</span>
              <button
                type="button"
                onClick={() => setSavedOpen(true)}
                className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-0.5 font-semibold text-muted"
              >
                Saved · {store.saved.length}
                <SelectChevron direction="right" />
              </button>
            </footer>
          </>
        ) : (
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-accent-link">
                Today&apos;s affirmations
              </p>
              <p className="mt-1 truncate text-[17px] font-medium leading-snug text-foreground">
                {first && !first.removed
                  ? first.text
                  : "Cleared for today. New ones tomorrow."}
              </p>
            </div>
            <IconButton
              label="Listen"
              disabled={listening}
              onClick={() =>
                void listen(
                  lines.filter((line) => !line.removed).map((line) => line.text),
                  "Today's affirmations",
                  `affirmations:${today}`,
                )
              }
            />
            <button
              type="button"
              onClick={() => setAffirmationsExpanded(true)}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-muted"
            >
              Show all {lines.length}
              <SelectChevron />
            </button>
          </div>
        )}
        {note ? <p className="mt-2 text-[13px] text-muted">{note}</p> : null}
      </div>
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted disabled:opacity-50"
    >
      {children ?? <Headphones className="h-4 w-4" aria-hidden />}
    </button>
  );
}

function StatusRow({
  wide,
  label,
  body,
  action,
  busy,
  onAction,
}: {
  wide: boolean;
  label: string;
  body: string;
  action: string;
  busy: boolean;
  onAction: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card shadow-[0_2px_10px_rgba(15,27,45,0.04)] ${
        wide
          ? "flex items-center gap-[18px] py-[14px] pl-[22px] pr-[18px]"
          : "flex flex-col gap-2.5 px-4 py-[14px]"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-accent-link">
        {label}
      </p>
      <p className={`min-w-0 text-[14px] text-muted ${wide ? "flex-1" : "leading-[1.5]"}`}>
        {body}
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={onAction}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-foreground disabled:opacity-50"
      >
        {busy ? "Writing…" : action}
      </button>
    </div>
  );
}

function AffirmationSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3" aria-hidden>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-2.5 w-28 rounded-full bg-border" />
        <div className="h-4 w-4/5 rounded-full bg-border" />
      </div>
      <div className="h-8 w-8 rounded-full bg-border" />
      <div className="h-3 w-16 rounded-full bg-border" />
    </div>
  );
}

function Menu({
  regenerated,
  useHeal,
  showOnDashboard,
  showMake,
  onSaved,
  onNew,
  onTurnOff,
  onHeal,
  onDashboard,
  onMake,
}: {
  regenerated: boolean;
  useHeal: boolean;
  showOnDashboard: boolean;
  showMake: boolean;
  onSaved: () => void;
  onNew: () => void;
  onTurnOff: () => void;
  onHeal: () => void;
  onDashboard: () => void;
  onMake: () => void;
}) {
  const item = "block w-full cursor-pointer px-3 py-2 text-left text-[14px] text-foreground hover:bg-muted/40";
  return (
    <div className="absolute right-0 top-10 z-20 w-64 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-[0_8px_24px_rgba(15,27,45,0.12)]">
      <button type="button" className={item} onClick={onSaved}>
        Saved affirmations
      </button>
      <button type="button" className={item} disabled={regenerated} onClick={onNew}>
        {regenerated ? "New set for today · used" : "New set for today"}
      </button>
      <button type="button" className={item} onClick={onTurnOff}>
        Turn off daily affirmations
      </button>
      {showMake ? (
        <button type="button" className={item} onClick={onMake}>
          Make a meditation
        </button>
      ) : null}
      <button type="button" className={item} onClick={onHeal}>
        Use what I&apos;m working through in Heal · {useHeal ? "On" : "Off"}
      </button>
      <button type="button" className={item} onClick={onDashboard}>
        Show on Dashboard · {showOnDashboard ? "On" : "Off"}
      </button>
    </div>
  );
}

function SavedList({
  store,
  listening,
  onBack,
  onListen,
}: {
  store: AffirmationsStore;
  listening: boolean;
  onBack: () => void;
  onListen: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer text-[13px] font-semibold text-muted"
        >
          Back
        </button>
        <h2 className="font-display text-[22px] text-foreground">Saved affirmations</h2>
        <button
          type="button"
          disabled={listening || store.saved.length === 0}
          onClick={onListen}
          className="ml-auto inline-flex h-8 cursor-pointer items-center rounded-full border border-border px-3 text-[13px] font-semibold text-foreground disabled:opacity-50"
        >
          Listen to all
        </button>
      </div>
      {store.saved.length === 0 ? (
        <p className="mt-4 text-[14px] text-muted">Keep a line and it stays here.</p>
      ) : (
        <ul className="mt-2">
          {store.saved.map((row) => (
            <li key={row.id} className="flex items-start gap-3 border-t border-border py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-medium leading-[1.4] text-foreground">{row.text}</p>
                <p className="mt-1 text-[12px] text-muted">
                  {row.source ? `${row.source} · ` : ""}
                  {formatKept(row.keptAt)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Remove from saved"
                onClick={() => removeSavedAffirmation(row.id)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center text-muted"
              >
                <Bookmark className="h-4 w-4" fill="currentColor" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { Heart, Leaf, Play } from "lucide-react";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { useMemo, useState } from "react";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { appendSpokenText } from "@/hooks/use-whisper-dictation";
import { HEAL_LENSES, healTypeLabel, promptLabel, promptsForType } from "@/lib/heal-copy";
import {
  defaultLensForKind,
  healNewPerspective,
  healRetryLens,
  type HealFlag,
} from "@/lib/heal-ai";
import { loadJournalStore } from "@/lib/journal-storage";
import { writePlanCreateHandoff } from "@/lib/plan-create-handoff";
import { useRouter } from "@/lib/spa-nav";
import {
  addHealEntry,
  addHealReframe,
  currentReframe,
  entriesForItem,
  formatHealDate,
  latestCheckin,
  linksForItem,
  loadHealStore,
  newHealId,
  patchHealItem,
  setHealItemStatus,
  staysHeavy,
  weeklyScores,
  writingChangedSinceMeditation,
  type HealEntry,
  type HealItem,
  type HealLens,
  type HealPerspective,
  type HealStoreV1,
} from "@/lib/heal-store";
import {
  CheckInDialog,
  HEAL_OUTLINE,
  HEAL_PAGE,
  HEAL_PRIMARY,
  HealAvatar,
  HealOverlay,
  HealRiskPill,
  HealSparkline,
  PerspectiveBlock,
  rememberRisk,
  useHealStore,
} from "@/components/heal/heal-bits";
import { HealNameChip } from "@/components/heal/heal-name-chip";
import {
  HealPracticeDialog,
  type HealPracticeId,
} from "@/components/heal/heal-practices";
import {
  HowYouSeeIt,
  ManifestDialog,
  ReframeEnd,
  ReframePill,
  syncLinkedReframe,
  TryAnotherAngle,
  VersionTimeline,
  WorkOnIt,
} from "@/components/heal/heal-reframe";

function pinnedEntries(entries: HealEntry[]): HealEntry[] {
  const plan = entries.find((entry) => entry.promptKey === "if_then");
  if (!plan) return entries;
  return [plan, ...entries.filter((entry) => entry.id !== plan.id)];
}

export function HealItemView({ itemId }: { itemId: string }) {
  const [store, setStore] = useHealStore();
  const item = store.items.find((row) => row.id === itemId) ?? null;
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(false);
  const [menu, setMenu] = useState(false);
  const [practice, setPractice] = useState<HealPracticeId | null>(null);
  const [consentThen, setConsentThen] = useState<(() => void) | null>(null);
  const [thought, setThought] = useState("");
  const [promptKey, setPromptKey] = useState<string | null>(null);
  const [tagOpen, setTagOpen] = useState(false);
  const [editingSee, setEditingSee] = useState(false);
  const [manifestOpen, setManifestOpen] = useState(false);
  const [endStep, setEndStep] = useState<{ summary: string; entryId: string } | null>(null);
  const [offerSync, setOfferSync] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; href: string } | null>(null);

  if (!item) {
    return (
      <div className={HEAL_PAGE}>
        <p className="text-sm text-muted">This isn&apos;t here anymore.</p>
      </div>
    );
  }

  const current = item;
  const entries = entriesForItem(store, current.id);
  const latest = latestCheckin(store, item.id);
  const scores = weeklyScores(store, item.id);
  const heavy = staysHeavy(store, item.id);
  const journal = loadJournalStore().entries.filter((entry) => entry.kind !== "gratitude");

  function commit(next: HealStoreV1) {
    setStore(next);
  }

  function enableAi(then: () => void) {
    if (current.aiEnabled) {
      then();
      return;
    }
    setConsentThen(() => then);
  }

  function saveAbout(text: string) {
    commit(
      patchHealItem(store, current.id, {
        aboutText: text,
        aboutUpdatedAt: new Date().toISOString(),
      }),
    );
    void rememberRisk(current.id, text, commit);
  }

  function makeMeditation() {
    const reframe = currentReframe(store, current.id)?.text ?? "";
    const writing = [reframe, current.seeingText, current.aboutText, ...entries.map((entry) => entry.text)]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000);
    writePlanCreateHandoff({
      v: 2,
      goalTitle: `For ${current.title}`,
      visionText: writing,
      healBrief: `Move from how this has been seen to how it is seen now, using the writer's own words. How they've been seeing it: ${current.seeingText || "(not written)"}. How they see it now: ${reframe || "(not yet)"}. Be kind without spinning it positive. No clinical language, no advice about getting in touch or reconciling, and no silver linings.`,
      project: { dreamText: "", resistanceText: "", visionText: writing },
      activeResistanceThemes: [],
      meditationTargetMinutes: 10,
    });
    commit(
      patchHealItem(store, current.id, {
        meditationBuiltAt: new Date().toISOString(),
      }),
    );
    router.push("/meditate/create?step=shape&fromDream=1&seed=goal");
  }

  return (
    <div className={HEAL_PAGE}>
      <HealRiskPill show={Boolean(item.riskAt)} />
      {heavy ? (
        <section className="mb-4 flex gap-3 rounded-2xl border border-heal-border bg-heal-tint p-4">
          <span className="inline-flex size-[38px] shrink-0 items-center justify-center rounded-full bg-card text-heal-accent">
            <Heart className="size-4" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-[20px] text-foreground">
              This has felt heavy for a while
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              You&apos;ve rated <HealNameChip item={item} store={store} /> 8 or more for six
              weeks. That&apos;s a lot to carry on your own. Talking to someone trained in{" "}
              {item.type === "grief" ? "grief" : "this"} can help, and in England you can refer
              yourself to NHS Talking Therapies without seeing a GP.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href="https://www.nhs.uk/service-search/mental-health/find-an-nhs-talking-therapies-service"
                className={HEAL_PRIMARY}
              >
                Find NHS Talking Therapies
              </a>
              {item.type === "grief" ? (
                <a href="tel:08088081677" className={HEAL_OUTLINE}>
                  Cruse Bereavement Support
                </a>
              ) : null}
              <button
                type="button"
                className="cursor-pointer text-sm text-muted"
                onClick={() =>
                  commit(
                    patchHealItem(store, item.id, {
                      heavyNudgeDismissedAt: new Date().toISOString(),
                    }),
                  )
                }
              >
                Not now
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <HealAvatar item={item} store={store} size={84} />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold uppercase tracking-[1.2px] text-heal-accent">
              {healTypeLabel(item.type)}
              {item.since ? ` · since ${formatHealDate(item.since, true)}` : ""}
            </p>
            <h2 className="font-display text-[34px] leading-none text-foreground">{item.title}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.linkedLifeAreaIds[0] ? (
                <span className="rounded-full border border-border px-2.5 py-0.5 text-[12px]">
                  Life area · {loadIdeateStore().dreams.find((dream) => dream.id === item.linkedLifeAreaIds[0])?.title || "Life area"}
                </span>
              ) : null}
              <span className="rounded-full border border-border px-2.5 py-0.5 text-[12px]">
                {entries.length} {entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>
          </div>
          <div className="hidden gap-2 sm:flex">
            <button type="button" className={HEAL_OUTLINE} onClick={() => enableAi(makeMeditation)}>
              Meditate
            </button>
            <button type="button" className={HEAL_OUTLINE} onClick={() => setCheckIn(true)}>
              Check in
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
          <button type="button" className={HEAL_OUTLINE} onClick={() => setCheckIn(true)}>
            Check in
          </button>
          <button type="button" className={HEAL_OUTLINE} onClick={() => enableAi(makeMeditation)}>
            Meditate
          </button>
        </div>
      </section>

      <div className="mt-4">
        <HowYouSeeIt
          item={item}
          store={store}
          editing={editingSee}
          link={linksForItem(store, item.id)[0] ?? null}
          onEdit={setEditingSee}
          onSaveSeeing={(text) => {
            commit(patchHealItem(store, item.id, { seeingText: text.trim() }));
            setEditingSee(false);
          }}
          onSaveNow={(text) => {
            const previous = currentReframe(store, item.id)?.text ?? "";
            commit(addHealReframe(store, { itemId: item.id, text, sourceEntryId: null }));
            setEditingSee(false);
            const link = linksForItem(store, item.id)[0];
            if (link && text.trim() && text.trim() !== previous) {
              const area = loadIdeateStore().dreams.find((dream) => dream.id === link.lifeAreaId);
              setOfferSync(area?.title || "your life area");
            }
          }}
          onManifest={() => setManifestOpen(true)}
        />
      </div>
      {offerSync ? (
        <p className="mt-2 text-[13px] text-muted">
          This is in your {offerSync} vision.{" "}
          <button
            type="button"
            className="font-semibold text-heal-accent"
            onClick={() => {
              const latest = currentReframe(loadHealStore(), item.id);
              if (latest) syncLinkedReframe(item.id, latest.text);
              setOfferSync(null);
            }}
          >
            Update it there too?
          </button>
          <button type="button" className="ml-2 text-muted" onClick={() => setOfferSync(null)}>
            No
          </button>
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <WorkOnIt
            item={item}
            onOpen={(id) => setPractice(id)}
            onPrompt={(key) => {
              setPromptKey(key);
              document.getElementById("heal-writing")?.scrollIntoView({ behavior: "smooth" });
            }}
          />
          <TryAnotherAngle
            item={item}
            store={store}
            onNeedAi={enableAi}
            onSaved={(entryId, text) => setEndStep({ summary: text.slice(0, 140), entryId })}
          />
          <section id="heal-writing" className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Writing</h2>
            <textarea
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              placeholder="Write about it. Negative is fine here."
              rows={3}
              className="mt-2 w-full resize-none bg-transparent font-display text-[17px] outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {promptsForType(item.type).map((prompt) => (
                <button
                  key={prompt.key}
                  type="button"
                  onClick={() => setPromptKey(prompt.key)}
                  className={`cursor-pointer rounded-full border px-2.5 py-1 text-[12px] ${
                    promptKey === prompt.key
                      ? "border-foreground bg-foreground text-white"
                      : "border-heal-border bg-heal-tint"
                  }`}
                >
                  {prompt.label}
                </button>
              ))}
              <button
                type="button"
                className="cursor-pointer rounded-full border border-heal-border bg-heal-tint px-2.5 py-1 text-[12px]"
                onClick={() => router.push(`/heal/${item.id}/letter`)}
              >
                Unsent letter
              </button>
            </div>
            <button
              type="button"
              disabled={!thought.trim()}
              className={`${HEAL_PRIMARY} mt-3`}
              onClick={() => {
                const added = addHealEntry(store, {
                  itemId: item.id,
                  kind: promptKey ? "prompt" : "thought",
                  promptKey,
                  text: thought.trim(),
                });
                commit(added.store);
                void rememberRisk(item.id, thought, commit);
                setThought("");
                setPromptKey(null);
              }}
            >
              Add
            </button>
            <ul className="mt-4 flex flex-col gap-4">
              {pinnedEntries(entries).map((entry) => (
                <li key={entry.id} className="border-t border-border/70 pt-3">
                  <p className="text-[12px] font-semibold text-heal-accent">
                    {entry.kind === "letter"
                      ? "Unsent letter"
                      : entry.kind === "friend"
                        ? "What I'd tell a friend"
                        : entry.kind === "angle"
                          ? "Another angle"
                          : promptLabel(item.type, entry.promptKey) ?? "Writing"}
                    <span className="ml-2 font-normal text-muted">
                      {formatHealDate(entry.createdAt)}
                    </span>
                  </p>
                  <p className="mt-1 font-display text-[17px] leading-relaxed text-foreground">
                    {entry.text}
                  </p>
                  {entry.perspectives.map((perspective) => (
                    <PerspectiveBlock key={perspective.id} text={perspective.text} />
                  ))}
                  <ReframePill store={store} itemId={item.id} entryId={entry.id} />
                </li>
              ))}
              {item.aboutText ? (
                <li className="border-t border-border/70 pt-3">
                  <p className="text-[12px] font-semibold text-heal-accent">
                    What happened
                    <span className="ml-2 font-normal text-muted">{formatHealDate(item.aboutUpdatedAt)}</span>
                  </p>
                  <textarea
                    defaultValue={item.aboutText}
                    onBlur={(event) => saveAbout(event.target.value)}
                    rows={3}
                    className="mt-1 w-full resize-none bg-transparent font-display text-[17px] leading-relaxed outline-none"
                  />
                  {item.aboutPerspectives.map((perspective) => (
                    <PerspectiveBlock key={perspective.id} text={perspective.text} />
                  ))}
                </li>
              ) : null}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-3">
          <VersionTimeline item={item} store={store} />
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">Meditation</h3>
            {item.meditationBuiltAt ? (
              <div className="mt-2">
                <div className="overflow-hidden rounded-xl">
                  <HealAvatar item={item} store={store} size={120} />
                </div>
                <p className="mt-2 font-display text-[18px]">{item.title}</p>
                <p className="text-[12px] text-muted">
                  {Math.max(1, entries.length + (currentReframe(store, item.id) ? 1 : 0))} min · made from how you see it now
                </p>
                <button
                  type="button"
                  className={`${HEAL_PRIMARY} mt-2`}
                  onClick={() => router.push("/meditate/library/creations")}
                >
                  <Play className="size-3.5" aria-hidden />
                  Play
                </button>
                {writingChangedSinceMeditation(item, store) ? (
                  <button
                    type="button"
                    className={`${HEAL_OUTLINE} mt-2`}
                    onClick={() => enableAi(makeMeditation)}
                  >
                    Update
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-2">
                <p className="font-display text-[18px]">{item.title}</p>
                <p className="text-[12px] text-muted">
                  {Math.max(1, entries.length + (currentReframe(store, item.id) ? 1 : 0))} min · made from how you see it now
                </p>
                <button
                  type="button"
                  className={`${HEAL_OUTLINE} mt-3`}
                  onClick={() => enableAi(makeMeditation)}
                >
                  Make a meditation
                </button>
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-foreground">How heavy</h3>
            <p className="font-display text-[28px] text-foreground">
              {latest ? latest.score : "–"}
              <span className="text-base text-muted"> / 10</span>
            </p>
            <p className="text-[13px] text-muted">{latest ? "Latest check-in" : "No check-in yet"}</p>
            <HealSparkline scores={scores} />
          </section>
          <section className="rounded-2xl border border-heal-border bg-heal-tint p-4">
            <h3 className="text-sm font-semibold text-foreground">When you&apos;re settled</h3>
            <p className="mt-1 text-sm text-foreground">
              When how you see it now feels true, lay this to rest. Nothing is deleted.
            </p>
            <button
              type="button"
              className={`${HEAL_OUTLINE} mt-3`}
              onClick={() => {
                commit(setHealItemStatus(store, item.id, "at_peace"));
                router.push("/heal/rested");
              }}
            >
              <Leaf className="size-3.5" aria-hidden />
              Lay to rest
            </button>
            {item.status !== "active" ? (
              <button
                type="button"
                className="mt-2 cursor-pointer text-sm font-semibold text-accent-link"
                onClick={() => commit(setHealItemStatus(store, item.id, "active"))}
              >
                Bring back
              </button>
            ) : null}
          </section>
        </aside>
      </div>

      {checkIn ? (
        <CheckInDialog items={[item]} onClose={() => setCheckIn(false)} onSaved={commit} />
      ) : null}
      {practice ? (
        <HealPracticeDialog
          item={item}
          practice={practice}
          store={store}
          onClose={() => setPractice(null)}
          onStore={commit}
          onRecorded={(summary, entryId) => {
            setPractice(null);
            setEndStep({ summary: summary.slice(0, 140), entryId });
          }}
        />
      ) : null}
      {endStep ? (
        <HealOverlay title="How you see it" onClose={() => setEndStep(null)}>
          <div className="overflow-y-auto px-5 py-5">
            <ReframeEnd
              summary={endStep.summary}
              currentText={currentReframe(store, item.id)?.text ?? ""}
              onSkip={() => setEndStep(null)}
              onUpdate={(text) => {
                const previous = currentReframe(store, item.id)?.text ?? "";
                commit(addHealReframe(store, { itemId: item.id, text, sourceEntryId: endStep.entryId }));
                const link = linksForItem(store, item.id)[0];
                if (link && text.trim() !== previous) {
                  const area = loadIdeateStore().dreams.find((dream) => dream.id === link.lifeAreaId);
                  setOfferSync(area?.title || "your life area");
                }
                setEndStep(null);
              }}
            />
          </div>
        </HealOverlay>
      ) : null}
      {manifestOpen ? (
        <ManifestDialog
          item={item}
          store={store}
          onClose={() => setManifestOpen(false)}
          onStore={commit}
          onToast={(text, href) => setToast({ text, href })}
        />
      ) : null}
      {toast ? (
        <p className="fixed bottom-24 left-1/2 z-[160] -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-white">
          {toast.text}{" "}
          <button type="button" className="font-semibold underline" onClick={() => router.push(toast.href)}>
            View
          </button>
        </p>
      ) : null}
      {consentThen ? (
        <ConsentDialog
          item={item}
          store={store}
          onClose={() => setConsentThen(null)}
          onAllow={() => {
            const next = patchHealItem(store, item.id, { aiEnabled: true });
            commit(next);
            const run = consentThen;
            setConsentThen(null);
            run();
          }}
        />
      ) : null}
      {tagOpen ? (
        <HealOverlay title="Journal entries" onClose={() => setTagOpen(false)}>
          <div className="overflow-y-auto px-5 py-5">
            <h2 className="font-display text-[20px]">Tag a journal entry</h2>
            <ul className="mt-3 flex flex-col gap-1">
              {journal.slice(0, 20).map((entry) => {
                const on = item.journalEntryIds.includes(entry.id);
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="w-full cursor-pointer rounded-lg px-2 py-2 text-left text-sm hover:bg-heal-tint"
                      onClick={() => {
                        const journalEntryIds = on
                          ? item.journalEntryIds.filter((id) => id !== entry.id)
                          : [...item.journalEntryIds, entry.id];
                        commit(patchHealItem(store, item.id, { journalEntryIds }));
                      }}
                    >
                      {on ? "✓ " : ""}
                      {entry.title.trim() || "Untitled"} · {formatHealDate(entry.createdAt)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </HealOverlay>
      ) : null}
    </div>
  );
}

function AboutCard({
  item,
  store,
  onSave,
  onPerspective,
  onNeedAi,
}: {
  item: HealItem;
  store: HealStoreV1;
  onSave: (text: string) => void;
  onPerspective: (perspective: HealPerspective) => void;
  onNeedAi: (then: () => void) => void;
}) {
  const [text, setText] = useState(item.aboutText);
  const [flags, setFlags] = useState<HealFlag[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [lens, setLens] = useState<HealLens>("kind");
  const [busy, setBusy] = useState(false);

  function run() {
    setBusy(true);
    void healNewPerspective({
      type: item.type,
      title: item.title,
      text,
    }).then((next) => {
      setFlags(next);
      setBusy(false);
    });
  }

  const ranges = useMemo(() => locateFlags(text, flags ?? []), [text, flags]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[12px] font-semibold text-heal-accent">What happened</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== item.aboutText) onSave(text);
        }}
        rows={6}
        className="mt-2 w-full resize-none bg-transparent font-display text-[18px] leading-[1.65] outline-none"
      />
      <FlaggedText
        text={text}
        ranges={ranges}
        onOpen={(index) => {
          setOpen(index);
          const flag = ranges[index];
          if (flag) setLens(defaultLensForKind(flag.kind));
        }}
      />
      {item.aboutPerspectives.map((perspective) => (
        <PerspectiveBlock key={perspective.id} text={perspective.text} />
      ))}
      {open != null && ranges[open] ? (
        <LensCard
          item={item}
          store={store}
          flag={ranges[open]}
          source={text}
          lens={lens}
          onLens={setLens}
          busy={busy}
          onAdd={() => {
            const flag = ranges[open];
            if (!flag) return;
            onPerspective({
              id: newHealId("perspective"),
              anchorStart: flag.start,
              anchorEnd: flag.end,
              lens,
              text: flag.lenses[lens],
              createdAt: new Date().toISOString(),
            });
            setFlags((current) => current?.filter((_, i) => i !== open) ?? null);
            setOpen(null);
          }}
          onRetry={() => {
            const flag = ranges[open];
            if (!flag) return;
            setBusy(true);
            void healRetryLens({
              type: item.type,
              title: item.title,
              quote: flag.quote,
              lens,
              text,
            }).then((next) => {
              if (next) {
                setFlags((current) =>
                  current?.map((row, i) =>
                    i === open ? { ...row, lenses: { ...row.lenses, [lens]: next } } : row,
                  ) ?? null,
                );
              }
              setBusy(false);
            });
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
      <div className="mt-3 flex items-center justify-between">
        <DictationMicButton
          variant="inset"
          onTranscript={(spoken) => setText((current) => appendSpokenText(current, spoken))}
        />
        <button
          type="button"
          className={HEAL_OUTLINE}
          onClick={() => onNeedAi(run)}
        >
          <Leaf className="size-3.5" aria-hidden />
          {busy ? "Looking…" : "New perspective"}
        </button>
      </div>
    </section>
  );
}

function locateFlags(text: string, flags: HealFlag[]) {
  return flags
    .map((flag) => {
      const start = text.indexOf(flag.quote);
      if (start < 0) return null;
      return { ...flag, start, end: start + flag.quote.length };
    })
    .filter((flag): flag is HealFlag & { start: number; end: number } => flag != null);
}

function FlaggedText({
  text,
  ranges,
  onOpen,
}: {
  text: string;
  ranges: Array<HealFlag & { start: number; end: number }>;
  onOpen: (index: number) => void;
}) {
  if (ranges.length === 0) return null;
  return (
    <p className="mt-2 text-sm leading-relaxed">
      {ranges.map((range, index) => (
        <button
          key={`${range.start}-${index}`}
          type="button"
          onClick={() => onOpen(index)}
          className="mr-2 cursor-pointer rounded bg-heal-tint px-0.5 underline decoration-heal-accent decoration-dotted underline-offset-[5px]"
        >
          {text.slice(range.start, range.end)}
        </button>
      ))}
    </p>
  );
}

function LensCard({
  item,
  store,
  flag,
  lens,
  onLens,
  onAdd,
  onRetry,
  onClose,
  busy,
}: {
  item: HealItem;
  store: HealStoreV1;
  flag: HealFlag;
  source: string;
  lens: HealLens;
  onLens: (lens: HealLens) => void;
  onAdd: () => void;
  onRetry: () => void;
  onClose: () => void;
  busy: boolean;
}) {
  return (
    <div className="mt-3 rounded-[14px] border border-heal-border bg-heal-tint px-[18px] py-4">
      <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[1.2px] text-heal-accent">
        <Leaf className="size-3" aria-hidden />
        New perspective
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {HEAL_LENSES.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onLens(row.id)}
            className={`h-8 cursor-pointer rounded-full px-3 text-[13px] ${
              lens === row.id ? "bg-foreground text-white" : "bg-card text-foreground"
            }`}
          >
            {row.label}
          </button>
        ))}
      </div>
      <p className="mt-3 font-display text-[18px] italic leading-relaxed">{flag.lenses[lens]}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={HEAL_PRIMARY} onClick={onAdd} disabled={busy}>
          Add to my writing
        </button>
        <button type="button" className={HEAL_OUTLINE} onClick={onRetry} disabled={busy}>
          Try another
        </button>
        <button type="button" className="cursor-pointer text-sm text-muted" onClick={onClose}>
          Not now
        </button>
      </div>
      <span className="sr-only">{item.title}</span>
      <span className="sr-only">{store.v}</span>
    </div>
  );
}

function ConsentDialog({
  item,
  store,
  onClose,
  onAllow,
}: {
  item: HealItem;
  store: HealStoreV1;
  onClose: () => void;
  onAllow: () => void;
}) {
  return (
    <HealOverlay title="Use AI" onClose={onClose}>
      <div className="px-5 py-5">
        <h2 className="font-display text-[22px] text-foreground">
          Use AI with {item.title}&apos;s writing
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          This reads only what you&apos;ve written about <HealNameChip item={item} store={store} />.
          It isn&apos;t used in Chat, insights, or anywhere else.
        </p>
        <div className="mt-4 flex gap-2">
          <button type="button" className={HEAL_PRIMARY} onClick={onAllow}>
            Turn on for {item.title}
          </button>
          <button type="button" className={HEAL_OUTLINE} onClick={onClose}>
            Not now
          </button>
        </div>
      </div>
    </HealOverlay>
  );
}

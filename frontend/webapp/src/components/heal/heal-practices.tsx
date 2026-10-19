import { useEffect, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
import {
  compassionSteps,
  friendSituation,
  promptAllowsSuggestion,
  typePracticePrompt,
} from "@/lib/heal-copy";
import { healFriendSwap, healSuggest } from "@/lib/heal-ai";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import {
  addHealEntry,
  loadHealStore,
  patchHealItem,
  type HealItem,
  type HealStoreV1,
} from "@/lib/heal-store";
import {
  HEAL_OUTLINE,
  HEAL_PRIMARY,
  HealOverlay,
  rememberRisk,
} from "@/components/heal/heal-bits";
import { HealNameChip } from "@/components/heal/heal-name-chip";
import { Sparkles } from "lucide-react";

export type HealPracticeId =
  | "friend"
  | "compassion"
  | "write15"
  | "values"
  | "type"
  | "notice"
  | "ifthen"
  | "evidence";

export function HealPracticesList({
  item,
  onOpen,
}: {
  item: HealItem;
  onOpen: (id: HealPracticeId) => void;
}) {
  const rows: { id: HealPracticeId; title: string; meta: string }[] = [
    { id: "friend", title: "If a friend were carrying this", meta: "5 min" },
    { id: "compassion", title: "Self-compassion break", meta: "3 min" },
    { id: "write15", title: "Write for 15 minutes", meta: "4 days" },
  ];
  const specific = typePracticePrompt(item.type);
  const extra: { id: HealPracticeId; title: string; meta: string }[] =
    item.type === "pattern"
      ? [
          { id: "notice", title: "Notice it, name it", meta: "3 min" },
          { id: "ifthen", title: "If-then plan", meta: "2 min" },
        ]
      : [{ id: "type", title: specific.label, meta: "A few lines" }];
  return (
    <ul className="mt-2">
      {[...rows, ...extra].map(
        (row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onOpen(row.id)}
              className="flex w-full cursor-pointer items-center gap-2 border-b border-border/70 py-2.5 text-left last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-foreground">{row.title}</span>
                <span className="text-[12px] text-muted">{row.meta}</span>
              </span>
              <SelectChevron direction="right" />
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

export function HealPracticeDialog({
  item,
  practice,
  store,
  onClose,
  onStore,
  onRecorded,
}: {
  item: HealItem;
  practice: HealPracticeId;
  store: HealStoreV1;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
  onRecorded?: (summary: string, entryId: string) => void;
}) {
  if (practice === "friend") {
    return (
      <FriendPractice item={item} store={store} onClose={onClose} onStore={onStore} onRecorded={onRecorded} />
    );
  }
  if (practice === "compassion") {
    return <CompassionPractice item={item} onClose={onClose} onStore={onStore} onRecorded={onRecorded} />;
  }
  if (practice === "write15") {
    return <Write15Practice item={item} onClose={onClose} onStore={onStore} />;
  }
  if (practice === "values") {
    return (
      <ValuesPractice item={item} store={store} onClose={onClose} onStore={onStore} />
    );
  }
  if (practice === "notice") {
    return <NoticePractice item={item} onClose={onClose} onStore={onStore} onRecorded={onRecorded} />;
  }
  if (practice === "ifthen") {
    return <IfThenPractice item={item} onClose={onClose} onStore={onStore} onRecorded={onRecorded} />;
  }
  if (practice === "evidence") {
    return <EvidencePractice item={item} onClose={onClose} onStore={onStore} onRecorded={onRecorded} />;
  }
  return <TypePractice item={item} onClose={onClose} onStore={onStore} />;
}

function StepBars({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-4 flex gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1 flex-1 rounded-full ${
            i <= step ? "bg-heal-accent" : "bg-heal-border"
          }`}
        />
      ))}
    </div>
  );
}

function FriendPractice({
  item,
  store,
  onClose,
  onStore,
  onRecorded,
}: {
  item: HealItem;
  store: HealStoreV1;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
  onRecorded?: (summary: string, entryId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [shown, setShown] = useState("");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const line =
    item.aboutText.split(/[.!?]\s/).find((part) => /fault|blame|should have|let .* down/i.test(part)) ||
    "";

  return (
    <HealOverlay title="If a friend were carrying this" onClose={onClose} wide>
      <div className="overflow-y-auto px-6 py-[22px]">
        <StepBars step={step} total={2} />
        {step === 0 ? (
          <>
            <p className="font-display text-[24px] leading-snug text-foreground">
              {line
                ? `Imagine a close friend ${friendSituation(item.type)} and told you, “${line.trim()}.” What would you say to them?`
                : `Imagine a close friend ${friendSituation(item.type)}, and blamed themselves. What would you say to them?`}
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write what you'd say…"
              rows={5}
              className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            {item.aiEnabled ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-heal-accent"
                  onClick={() => {
                    setBusy(true);
                    void healSuggest({
                      type: item.type,
                      title: item.title,
                      writing: item.aboutText,
                      ask: "What would you say to a friend carrying this?",
                    }).then((value) => {
                      setSuggestion(value);
                      setBusy(false);
                    });
                  }}
                >
                  <Sparkles className="size-3.5" aria-hidden />
                  {busy ? "Thinking…" : "Stuck? Suggest one"}
                </button>
              </div>
            ) : null}
            {suggestion ? (
              <SuggestionCard
                title={item.title}
                text={suggestion}
                onUse={() => {
                  setText(suggestion);
                  setSuggestion(null);
                }}
                onAnother={() => {
                  void healSuggest({
                    type: item.type,
                    title: item.title,
                    writing: item.aboutText,
                    ask: "What would you say to a friend carrying this? A different wording.",
                  }).then(setSuggestion);
                }}
                onClose={() => setSuggestion(null)}
              />
            ) : null}
            <button
              type="button"
              disabled={!text.trim()}
              className={`${HEAL_PRIMARY} mt-4`}
              onClick={() => {
                setShown(text.trim());
                setStep(1);
                if (item.aiEnabled) {
                  void healFriendSwap({
                    type: item.type,
                    title: item.title,
                    text: text.trim(),
                  }).then((next) => {
                    if (next) setShown(next);
                  });
                }
              }}
            >
              Next
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-[24px] text-foreground">
              Now read it as if it&apos;s to you.
            </h2>
            <p className="mt-4 border-l-[3px] border-heal-accent pl-3 font-display text-[20px] italic leading-relaxed text-foreground">
              {shown}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className={HEAL_OUTLINE}
                onClick={() => speak(shown)}
              >
                Listen
              </button>
              <button
                type="button"
                className={HEAL_PRIMARY}
                onClick={() => {
                  const added = addHealEntry(loadHealStore(), {
                    itemId: item.id,
                    kind: "friend",
                    promptKey: "friend",
                    text: shown,
                  });
                  onStore(added.store);
                  void rememberRisk(item.id, shown, onStore);
                  onRecorded?.(shown, added.entry.id);
                  setSaved(true);
                }}
              >
                Save
              </button>
            </div>
            {saved ? (
              <p className="mt-3 text-sm text-muted">
                Saved to <HealNameChip item={item} store={store} /> as &quot;What I&apos;d tell a
                friend&quot;, to come back to when it gets heavy.
              </p>
            ) : null}
          </>
        )}
      </div>
    </HealOverlay>
  );
}

function CompassionPractice({
  item,
  onClose,
  onStore,
  onRecorded,
}: {
  item: HealItem;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
  onRecorded?: (summary: string, entryId: string) => void;
}) {
  const steps = compassionSteps(item.type);
  const [step, setStep] = useState(0);
  const current = steps[step]!;
  return (
    <HealOverlay title="Self-compassion break" onClose={onClose} wide>
      <div className="overflow-y-auto px-6 py-[22px]">
        <StepBars step={step} total={3} />
        <h2 className="font-display text-[26px] leading-tight text-foreground">
          {current.title}
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-foreground">{current.body}</p>
        <button
          type="button"
          className={`${HEAL_PRIMARY} mt-5`}
          onClick={() => {
            if (step < 2) {
              setStep(step + 1);
              return;
            }
            const added = addHealEntry(loadHealStore(), {
              itemId: item.id,
              kind: "prompt",
              promptKey: "compassion",
              text: "Self-compassion break",
            });
            onStore(added.store);
            onRecorded?.("Self-compassion break", added.entry.id);
            onClose();
          }}
        >
          {step < 2 ? "Next" : "Done"}
        </button>
      </div>
    </HealOverlay>
  );
}

function Write15Practice({
  item,
  onClose,
  onStore,
}: {
  item: HealItem;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
}) {
  const [left, setLeft] = useState(15 * 60);
  const [text, setText] = useState("");
  useEffect(() => {
    const id = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const day = write15DayNumber(item);

  function finish() {
    if (!text.trim()) {
      onClose();
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const days = item.write15Days.includes(today)
      ? item.write15Days
      : [...item.write15Days, today];
    const added = addHealEntry(loadHealStore(), {
      itemId: item.id,
      kind: "write15",
      promptKey: "write15",
      text: text.trim(),
    });
    onStore(patchHealItem(added.store, item.id, { write15Days: days }));
    void rememberRisk(item.id, text, onStore);
    onClose();
  }

  return (
    <HealOverlay title="Write for 15 minutes" onClose={onClose} wide>
      <div className="flex max-h-[80dvh] flex-col px-6 py-[22px]">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full bg-heal-tint px-3 py-1 text-sm font-semibold text-heal-accent">
            {mm}:{ss}
          </span>
        </div>
        <p className="mt-3 text-sm text-foreground">
          Write without stopping about <HealNameChip item={item} store={loadHealStore()} /> and
          how it&apos;s affected you. Don&apos;t worry about spelling or making sense. Nobody else
          will read it.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="mt-3 min-h-40 w-full flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 font-display text-[17px] leading-relaxed outline-none"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted">
            Day {day} of 4 · same time tomorrow works best
          </p>
          <button type="button" className={HEAL_OUTLINE} onClick={finish}>
            Finish early
          </button>
        </div>
      </div>
    </HealOverlay>
  );
}

function write15DayNumber(item: HealItem): number {
  const days = new Set(item.write15Days);
  const cursor = new Date();
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let n = 0;
  for (let i = 0; i < 4; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return Math.min(4, n + 1);
}

function ValuesPractice({
  item,
  store,
  onClose,
  onStore,
}: {
  item: HealItem;
  store: HealStoreV1;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
}) {
  const values = loadIdeateValuesStore().values;
  const areas = loadIdeateStore().dreams.filter((dream) => !isDemoIdeateDream(dream));
  const [valueIds, setValueIds] = useState(item.linkedValueIds);
  const [areaIds, setAreaIds] = useState(item.linkedLifeAreaIds);
  const [action, setAction] = useState(item.valuesAction ?? "");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((row) => row !== id) : [...list, id];
  }
  return (
    <HealOverlay title="What would you want this to lead to?" onClose={onClose} wide>
      <div className="overflow-y-auto px-6 py-[22px]">
        <p className="font-display text-[22px] leading-snug text-foreground">
          Pain often points at what matters. Link <HealNameChip item={item} store={store} /> to
          the values and life areas in your Manifest that they&apos;re part of.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              onClick={() => setAreaIds(toggle(areaIds, area.id))}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                areaIds.includes(area.id)
                  ? "border-foreground bg-foreground text-white"
                  : "border-heal-border bg-heal-tint"
              }`}
            >
              {area.title}
            </button>
          ))}
          {values.map((value) => (
            <button
              key={value.id}
              type="button"
              onClick={() => setValueIds(toggle(valueIds, value.id))}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                valueIds.includes(value.id)
                  ? "border-foreground bg-foreground text-white"
                  : "border-heal-border bg-heal-tint"
              }`}
            >
              {value.text}
            </button>
          ))}
        </div>
        <textarea
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="What would you want this to lead to?"
          rows={3}
          className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
        />
        {item.aiEnabled ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-heal-accent"
              onClick={() => {
                void healSuggest({
                  type: item.type,
                  title: item.title,
                  writing: `${item.aboutText}\n${action}`,
                  ask: "What would you want this to lead to?",
                }).then(setSuggestion);
              }}
            >
              <Sparkles className="size-3.5" aria-hidden />
              Stuck? Suggest one
            </button>
          </div>
        ) : null}
        {suggestion ? (
          <SuggestionCard
            title={item.title}
            text={suggestion}
            onUse={() => {
              setAction(suggestion);
              setSuggestion(null);
            }}
            onAnother={() => {
              void healSuggest({
                type: item.type,
                title: item.title,
                writing: item.aboutText,
                ask: "A different next step from this writing.",
              }).then(setSuggestion);
            }}
            onClose={() => setSuggestion(null)}
          />
        ) : null}
        <p className="mt-2 text-[12px] text-muted">
          Shown on the linked life area as &quot;For {item.title}&quot;.
        </p>
        <button
          type="button"
          className={`${HEAL_PRIMARY} mt-4`}
          onClick={() => {
            onStore(
              patchHealItem(loadHealStore(), item.id, {
                linkedLifeAreaIds: areaIds,
                linkedValueIds: valueIds,
                valuesAction: action.trim() || null,
              }),
            );
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </HealOverlay>
  );
}

function NoticePractice({
  item,
  onClose,
  onStore,
  onRecorded,
}: {
  item: HealItem;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
  onRecorded?: (summary: string, entryId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [thought, setThought] = useState("");
  const [next, setNext] = useState("");

  return (
    <HealOverlay title="Notice it, name it" onClose={onClose} wide>
      <div className="overflow-y-auto px-6 py-[22px]">
        <StepBars step={step} total={3} />
        {step === 0 ? (
          <>
            <p className="font-display text-[24px] leading-snug text-foreground">
              Write the thought that comes with the pattern, in your own words.
            </p>
            <textarea
              value={thought}
              onChange={(e) => setThought(e.target.value)}
              rows={4}
              className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              disabled={!thought.trim()}
              className={`${HEAL_PRIMARY} mt-4`}
              onClick={() => setStep(1)}
            >
              Next
            </button>
          </>
        ) : null}
        {step === 1 ? (
          <>
            <p className="font-display text-[24px] leading-snug text-foreground">
              I&apos;m noticing the thought that {thought.trim()}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-foreground">
              Read it back slowly. It&apos;s a thought, not an instruction.
            </p>
            <button type="button" className={`${HEAL_PRIMARY} mt-4`} onClick={() => setStep(2)}>
              Next
            </button>
          </>
        ) : null}
        {step === 2 ? (
          <>
            <p className="font-display text-[24px] leading-snug text-foreground">
              What would you do if this thought were just background noise?
            </p>
            <textarea
              value={next}
              onChange={(e) => setNext(e.target.value)}
              rows={4}
              className="mt-4 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              disabled={!next.trim()}
              className={`${HEAL_PRIMARY} mt-4`}
              onClick={() => {
                const added = addHealEntry(loadHealStore(), {
                  itemId: item.id,
                  kind: "prompt",
                  promptKey: "notice_name",
                  text: next.trim(),
                });
                onStore(added.store);
                void rememberRisk(item.id, next, onStore);
                onRecorded?.(next.trim(), added.entry.id);
                onClose();
              }}
            >
              Save
            </button>
          </>
        ) : null}
      </div>
    </HealOverlay>
  );
}

function IfThenPractice({
  item,
  onClose,
  onStore,
  onRecorded,
}: {
  item: HealItem;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
  onRecorded?: (summary: string, entryId: string) => void;
}) {
  const [when, setWhen] = useState("");
  const [will, setWill] = useState("");
  const ready = when.trim().length > 0 && will.trim().length > 0;
  return (
    <HealOverlay title="If-then plan" onClose={onClose} wide>
      <div className="overflow-y-auto px-6 py-[22px]">
        <label className="block text-sm font-semibold text-foreground">
          When…
          <input
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            placeholder="someone asks me for something at work"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal outline-none"
          />
        </label>
        <label className="mt-3 block text-sm font-semibold text-foreground">
          I will…
          <input
            value={will}
            onChange={(e) => setWill(e.target.value)}
            placeholder="say I'll check and get back to them"
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal outline-none"
          />
        </label>
        <button
          type="button"
          disabled={!ready}
          className={`${HEAL_PRIMARY} mt-4`}
          onClick={() => {
            const text = `If ${when.trim()}, then ${will.trim()}`;
            const added = addHealEntry(loadHealStore(), {
              itemId: item.id,
              kind: "prompt",
              promptKey: "if_then",
              text,
            });
            onStore(added.store);
            void rememberRisk(item.id, text, onStore);
            onRecorded?.(text, added.entry.id);
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </HealOverlay>
  );
}

function EvidencePractice({
  item,
  onClose,
  onStore,
  onRecorded,
}: {
  item: HealItem;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
  onRecorded?: (summary: string, entryId: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [thought, setThought] = useState(item.seeingText);
  const [tested, setTested] = useState("");
  return (
    <HealOverlay title="Look at the evidence" onClose={onClose} wide>
      <div className="overflow-y-auto px-6 py-[22px]">
        <StepBars step={step} total={2} />
        {step === 0 ? (
          <>
            <p className="font-display text-[24px] leading-snug text-foreground">The thought</p>
            <textarea
              value={thought}
              onChange={(event) => setThought(event.target.value)}
              rows={4}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <button type="button" className={`${HEAL_PRIMARY} mt-4`} onClick={() => setStep(1)}>
              Next
            </button>
          </>
        ) : (
          <>
            <p className="font-display text-[24px] leading-snug text-foreground">
              When has this been tested? What actually happened?
            </p>
            <textarea
              value={tested}
              onChange={(event) => setTested(event.target.value)}
              rows={4}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
            />
            <button
              type="button"
              disabled={!tested.trim()}
              className={`${HEAL_PRIMARY} mt-4`}
              onClick={() => {
                const patched = patchHealItem(loadHealStore(), item.id, { seeingText: thought.trim() });
                const added = addHealEntry(patched, {
                  itemId: item.id,
                  kind: "prompt",
                  promptKey: "evidence",
                  text: tested.trim(),
                });
                onStore(added.store);
                onRecorded?.(tested.trim(), added.entry.id);
                onClose();
              }}
            >
              Save
            </button>
          </>
        )}
      </div>
    </HealOverlay>
  );
}

function TypePractice({
  item,
  onClose,
  onStore,
}: {
  item: HealItem;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
}) {
  const prompt = typePracticePrompt(item.type);
  const [text, setText] = useState("");
  const suggest = promptAllowsSuggestion(prompt.key);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  return (
    <HealOverlay title={prompt.label} onClose={onClose} wide>
      <div className="overflow-y-auto px-6 py-[22px]">
        <h2 className="font-display text-[24px] text-foreground">{prompt.label}</h2>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-display text-[17px] outline-none"
        />
        {suggest && item.aiEnabled ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="text-[13px] font-semibold text-heal-accent"
              onClick={() => {
                void healSuggest({
                  type: item.type,
                  title: item.title,
                  writing: item.aboutText,
                  ask: prompt.label,
                }).then(setSuggestion);
              }}
            >
              Stuck? Suggest one
            </button>
          </div>
        ) : null}
        {suggestion ? (
          <SuggestionCard
            title={item.title}
            text={suggestion}
            onUse={() => {
              setText(suggestion);
              setSuggestion(null);
            }}
            onAnother={() => {
              void healSuggest({
                type: item.type,
                title: item.title,
                writing: item.aboutText,
                ask: prompt.label,
              }).then(setSuggestion);
            }}
            onClose={() => setSuggestion(null)}
          />
        ) : null}
        <button
          type="button"
          disabled={!text.trim()}
          className={`${HEAL_PRIMARY} mt-4`}
          onClick={() => {
            const added = addHealEntry(loadHealStore(), {
              itemId: item.id,
              kind: "prompt",
              promptKey: prompt.key,
              text: text.trim(),
            });
            onStore(added.store);
            void rememberRisk(item.id, text, onStore);
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </HealOverlay>
  );
}

export function SuggestionCard({
  title,
  text,
  onUse,
  onAnother,
  onClose,
}: {
  title: string;
  text: string;
  onUse: () => void;
  onAnother: () => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-heal-accent bg-heal-tint px-4 py-3.5">
      <p className="text-[12px] font-semibold text-foreground">
        Suggestion · from what you&apos;ve written about {title}
      </p>
      <p className="mt-1 font-display text-[17px] leading-relaxed text-foreground">{text}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={HEAL_PRIMARY} onClick={onUse}>
          Use and edit
        </button>
        <button type="button" className={HEAL_OUTLINE} onClick={onAnother}>
          Try another
        </button>
        <button type="button" className="cursor-pointer text-sm text-muted" onClick={onClose}>
          Write my own
        </button>
      </div>
    </div>
  );
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(utter);
}

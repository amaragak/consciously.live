import { ArrowDown, ArrowRight, Check, Heart, Leaf, PenLine, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
import { HEAL_OUTLINE, HEAL_PRIMARY, HealOverlay } from "@/components/heal/heal-bits";
import { friendQuestion, typePracticePrompt } from "@/lib/heal-copy";
import { healAskAngle } from "@/lib/heal-ai";
import { loadIdeateStore, saveIdeateStore } from "@/lib/plan-ideate-store";
import {
  addHealEntry,
  createHealItem,
  currentReframe,
  formatHealDate,
  healRelative,
  loadHealStore,
  patchHealItem,
  reframesForItem,
  saveHealStore,
  type HealItem,
  type HealManifestLink,
  type HealStoreV1,
} from "@/lib/heal-store";

export function ReframeEnd({
  summary,
  currentText,
  onUpdate,
  onSkip,
}: {
  summary: string;
  currentText: string;
  onUpdate: (text: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState(currentText);
  useEffect(() => {
    setText(currentText);
  }, [currentText]);
  return (
    <div>
      <div className="rounded-[14px] border border-border bg-background px-3 py-3">
        <p className="text-[12px] font-semibold text-muted">What you found</p>
        <p className="mt-1 text-sm text-foreground">{summary}</p>
      </div>
      <h2 className="mt-4 font-display text-[24px] leading-tight text-foreground">
        Does this change how you see it?
      </h2>
      <p className="mt-1 text-[13px] text-muted">
        Edit how you see it now, in your own words. Your earlier version is kept.
      </p>
      <textarea
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        className="mt-3 w-full resize-none rounded-xl border-[1.5px] border-heal-accent bg-card px-3 py-2 font-display text-[18px] leading-relaxed outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={text.trim() === currentText.trim() || !text.trim()}
          className={HEAL_PRIMARY}
          onClick={() => onUpdate(text)}
        >
          Update how I see it
        </button>
        <button type="button" className={HEAL_OUTLINE} onClick={onSkip}>
          Not yet
        </button>
        <span className="ml-auto text-[13px] text-muted">Saved to Writing either way</span>
      </div>
    </div>
  );
}

export function HowYouSeeIt({
  item,
  store,
  editing,
  onEdit,
  onSaveSeeing,
  onSaveNow,
  onManifest,
  link,
}: {
  item: HealItem;
  store: HealStoreV1;
  editing: boolean;
  onEdit: (open: boolean) => void;
  onSaveSeeing: (text: string) => void;
  onSaveNow: (text: string) => void;
  onManifest: () => void;
  link: HealManifestLink | null;
}) {
  const versions = reframesForItem(store, item.id);
  const now = versions[0] ?? null;
  const area = link
    ? loadIdeateStore().dreams.find((dream) => dream.id === link.lifeAreaId)
    : null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">
          How you see it
        </h2>
        {versions.length >= 2 ? (
          <a href="#heal-versions" className="text-[13px] font-semibold text-heal-accent lg:pointer-events-auto">
            How it&apos;s changed · {versions.length} versions
          </a>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col items-stretch gap-2 md:flex-row md:items-stretch">
        <SeeingBox
          label="How I've been seeing it"
          text={item.seeingText}
          empty="In a sentence or two: how have you been seeing this? Negative is fine."
          meta={item.seeingText ? `Written ${formatHealDate(item.updatedAt)}` : ""}
          accent={false}
          editing={editing || !item.seeingText}
          onSave={onSaveSeeing}
        />
        <span className="grid place-items-center text-heal-accent">
          <ArrowDown className="size-4 md:hidden" aria-hidden />
          <ArrowRight className="hidden size-4 md:block" aria-hidden />
        </span>
        <SeeingBox
          label="How I see it now"
          text={now?.text ?? ""}
          empty="Not yet. Work on it below."
          meta={now ? `Your words · updated ${healRelative(now.createdAt)}` : ""}
          accent
          editing={editing}
          onSave={onSaveNow}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {now ? (
          <button type="button" className={link ? HEAL_OUTLINE : HEAL_PRIMARY} onClick={onManifest}>
            {link ? <Check className="size-3.5" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
            {link ? `In Manifest · ${area?.title || "life area"}` : "Take this into Manifest"}
          </button>
        ) : null}
        <button type="button" className={HEAL_OUTLINE} onClick={() => onEdit(!editing)}>
          <PenLine className="size-3.5" aria-hidden />
          Edit
        </button>
      </div>
      <p className="mt-2 text-[13px] text-muted">
        Doesn&apos;t feel true yet? Work on it below. Each tool ends by asking if it changes how you see it.
      </p>
    </section>
  );
}

function SeeingBox({
  label,
  text,
  empty,
  meta,
  accent,
  editing,
  onSave,
}: {
  label: string;
  text: string;
  empty: string;
  meta: string;
  accent: boolean;
  editing: boolean;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  return (
    <div
      className={`min-w-0 flex-1 rounded-[14px] px-3 py-3 ${
        accent ? "border-[1.5px] border-heal-accent bg-card" : "border border-heal-border bg-background"
      }`}
    >
      <p className={`text-[12px] font-semibold ${accent ? "text-heal-accent" : "text-muted"}`}>{label}</p>
      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => onSave(draft)}
          placeholder={empty}
          rows={3}
          className="mt-1 w-full resize-none bg-transparent font-display text-[20px] leading-snug text-foreground outline-none placeholder:text-muted"
        />
      ) : (
        <p className={`mt-1 font-display text-[20px] leading-snug ${text ? "text-foreground" : "text-muted"}`}>
          {text || empty}
        </p>
      )}
      {meta && text ? <p className="mt-2 text-[12px] text-muted">{meta}</p> : null}
    </div>
  );
}

export function WorkOnIt({
  item,
  onOpen,
  onPrompt,
}: {
  item: HealItem;
  onOpen: (id: "evidence" | "friend" | "notice" | "compassion" | "write15" | "ifthen" | "type") => void;
  onPrompt: (key: string) => void;
}) {
  const specific = kindTool(item);
  const tools: { id: "evidence" | "friend" | "notice" | "type"; title: string; meta: string; question: string; prompt?: string }[] = [
    { id: "evidence", title: "Look at the evidence", meta: "5 min", question: "What actually happened when it was tested?" },
    { id: "friend", title: "If a friend…", meta: "5 min", question: friendQuestion(item.type) },
    { id: "notice", title: "Notice it, name it", meta: "3 min", question: "See the thought as a thought, not an instruction." },
    {
      id: specific.prompt ? "type" : "type",
      title: specific.title,
      meta: specific.meta,
      question: specific.question,
      prompt: specific.prompt,
    },
  ];
  const [more, setMore] = useState(false);
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Work on it</h2>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        {tools.map((tool) => (
          <button
            key={tool.title}
            type="button"
            className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-left"
            onClick={() => (tool.prompt ? onPrompt(tool.prompt) : onOpen(tool.id))}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-foreground">{tool.title}</span>
              <span className="text-[12px] text-muted">{tool.meta}</span>
              <span className="mt-1 block text-[13px] text-foreground">{tool.question}</span>
            </span>
            <SelectChevron direction="right" />
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mt-2 cursor-pointer text-[13px] font-semibold text-accent-link"
        onClick={() => setMore(true)}
      >
        More tools
      </button>
      {more ? (
        <HealOverlay title="More tools" onClose={() => setMore(false)}>
          <div className="flex flex-col px-5 py-4">
            {[
              { id: "compassion" as const, title: "Self-compassion break", meta: "3 min" },
              { id: "write15" as const, title: "Write for 15 minutes", meta: "4 days" },
              ...(item.type === "pattern"
                ? [{ id: "ifthen" as const, title: "If-then plan", meta: "2 min" }]
                : []),
            ].map((row) => (
              <button
                key={row.id}
                type="button"
                className="flex items-center gap-2 border-b border-border py-3 text-left last:border-b-0"
                onClick={() => {
                  setMore(false);
                  onOpen(row.id);
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{row.title}</span>
                  <span className="text-[12px] text-muted">{row.meta}</span>
                </span>
                <SelectChevron direction="right" />
              </button>
            ))}
          </div>
        </HealOverlay>
      ) : null}
    </section>
  );
}

function kindTool(item: HealItem): { title: string; meta: string; question: string; prompt?: string } {
  if (item.type === "grief") {
    return { title: "Gratitude for them", meta: "A few lines", question: "What do you want to keep of them?" };
  }
  if (item.type === "pattern") {
    return { title: "Where it started", meta: "Writing", question: "When did this pattern first show up?", prompt: "started" };
  }
  if (item.type === "belief") {
    return { title: "Where I learned it", meta: "Writing", question: "Who or what taught you this?", prompt: "learned" };
  }
  if (item.type === "recurring_thought") {
    return { title: "What it's trying to protect", meta: "Writing", question: "What is the thought looking after?", prompt: "protects" };
  }
  const prompt = typePracticePrompt(item.type);
  return { title: prompt.label, meta: "A few lines", question: prompt.label };
}

export function TryAnotherAngle({
  item,
  store,
  onNeedAi,
  onSaved,
}: {
  item: HealItem;
  store: HealStoreV1;
  onNeedAi: (then: () => void) => void;
  onSaved: (entryId: string, text: string) => void;
}) {
  const [question, setQuestion] = useState<string | null>(null);
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  function ask() {
    onNeedAi(() => {
      setBusy(true);
      const now = currentReframe(store, item.id);
      const writing = store.entries
        .filter((entry) => entry.itemId === item.id)
        .slice(0, 6)
        .map((entry) => entry.text)
        .join("\n\n")
        .slice(0, 8000);
      void healAskAngle({
        type: item.type,
        title: item.title,
        seeingText: item.seeingText,
        reframe: now?.text ?? "",
        writing,
        asked: item.angleQuestions,
      }).then((next) => {
        setBusy(false);
        if (!next) return;
        setQuestion(next);
        setAnswering(false);
        const fresh = loadHealStore();
        const current = fresh.items.find((row) => row.id === item.id);
        if (!current) return;
        saveHealStore(
          patchHealItem(fresh, item.id, {
            angleQuestions: [...current.angleQuestions, next].slice(-10),
          }),
        );
      });
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 text-heal-accent" aria-hidden />
        <div>
          <h3 className="text-[15px] font-semibold text-foreground">Try another angle</h3>
          <p className="text-[13px] text-muted">A question based on what you&apos;ve written. You write the answer.</p>
        </div>
      </div>
      {question ? (
        <p className="mt-3 font-display text-[18px] italic leading-snug text-foreground">{question}</p>
      ) : (
        <p className="mt-3 text-sm text-muted">{busy ? "Thinking…" : "Ask for one question from what you've written."}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={HEAL_OUTLINE} disabled={!question} onClick={() => setAnswering(true)}>
          Answer it
        </button>
        <button type="button" className={HEAL_OUTLINE} disabled={busy} onClick={ask}>
          Another question
        </button>
      </div>
      {answering && question ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-foreground">{question}</p>
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-display text-[17px] outline-none"
          />
          <button
            type="button"
            disabled={!answer.trim()}
            className={`${HEAL_PRIMARY} mt-2`}
            onClick={() => {
              const added = addHealEntry(loadHealStore(), {
                itemId: item.id,
                kind: "angle",
                promptKey: null,
                text: answer.trim(),
              });
              saveHealStore(added.store);
              onSaved(added.entry.id, answer.trim());
              setAnswer("");
              setAnswering(false);
            }}
          >
            Add
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ReframePill({
  store,
  itemId,
  entryId,
}: {
  store: HealStoreV1;
  itemId: string;
  entryId: string;
}) {
  const versions = reframesForItem(store, itemId);
  const match = versions.find((row) => row.sourceEntryId === entryId);
  if (!match) return null;
  const current = versions[0]?.sourceEntryId === entryId;
  return (
    <a
      href={`#reframe-${match.id}`}
      className="mt-2 inline-flex items-center gap-1 rounded-full bg-heal-tint px-2 py-0.5 text-[12px] font-semibold text-heal-accent"
    >
      <Leaf className="size-3" aria-hidden />
      {current ? "Led to how I see it now" : "Led to an earlier view"}
    </a>
  );
}

export function VersionTimeline({ item, store }: { item: HealItem; store: HealStoreV1 }) {
  const versions = reframesForItem(store, item.id);
  const [all, setAll] = useState(false);
  if (versions.length === 0) return null;
  const shown = all ? versions : versions.slice(0, 3);
  return (
    <section id="heal-versions" className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">How it&apos;s changed</h3>
      <ol className="mt-3">
        {shown.map((version, index) => (
          <li key={version.id} id={`reframe-${version.id}`} className="relative pl-4">
            {index < shown.length - 1 ? (
              <span className="absolute bottom-0 left-[3px] top-3 w-px bg-heal-border" />
            ) : null}
            <span
              className={`absolute left-0 top-1.5 size-2 rounded-full ${
                index === 0 ? "bg-heal-accent" : "border border-heal-border bg-card"
              }`}
            />
            <p className="text-[12px] text-muted">
              {index === 0 ? `Now · ${healRelative(version.createdAt)}` : formatHealDate(version.createdAt)}
            </p>
            <p className="font-display text-[15px] leading-snug text-foreground">{version.text}</p>
          </li>
        ))}
      </ol>
      {versions.length > 3 && !all ? (
        <button type="button" className="mt-2 text-[13px] font-semibold text-accent-link" onClick={() => setAll(true)}>
          Show all
        </button>
      ) : null}
    </section>
  );
}

export function ManifestDialog({
  item,
  store,
  onClose,
  onStore,
  onToast,
}: {
  item: HealItem;
  store: HealStoreV1;
  onClose: () => void;
  onStore: (next: HealStoreV1) => void;
  onToast: (text: string, href: string) => void;
}) {
  const now = currentReframe(store, item.id);
  const dreams = loadIdeateStore().dreams.filter((dream) => dream.title.trim());
  const existing = store.manifestLinks.find((row) => row.itemId === item.id) ?? null;
  const [areaId, setAreaId] = useState(existing?.lifeAreaId ?? item.linkedLifeAreaIds[0] ?? "");
  const [text, setText] = useState(now?.text ?? "");
  const area = dreams.find((dream) => dream.id === areaId) ?? null;
  const obstacles = (area?.obstacleLabels ?? []).filter(Boolean);
  const [obstacle, setObstacle] = useState(existing?.targetId || obstacles[0] || "");
  if (!now) return null;
  function writeAnswer(nextText: string) {
    if (!area || !obstacle.trim() || !now) return;
    const ideate = loadIdeateStore();
    const linkId = existing?.id ?? `heal_link_${now.id}`;
    saveIdeateStore({
      ...ideate,
      dreams: ideate.dreams.map((dream) => {
        if (dream.id !== area.id) return dream;
        const answers = (dream.healObstacleAnswers ?? []).filter((row) => row.id !== linkId);
        return {
          ...dream,
          healObstacleAnswers: [
            ...answers,
            { id: linkId, label: obstacle, text: nextText.trim(), healItemId: item.id },
          ],
        };
      }),
    });
    const link = {
      id: linkId,
      itemId: item.id,
      reframeId: now.id,
      lifeAreaId: area.id,
      target: "obstacle" as const,
      targetId: obstacle,
      text: nextText.trim(),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const next: HealStoreV1 = {
      ...loadHealStore(),
      manifestLinks: [
        link,
        ...loadHealStore().manifestLinks.filter((row) => row.id !== linkId && row.itemId !== item.id),
      ],
    };
    if (!item.linkedLifeAreaIds.includes(area.id)) {
      onStore(patchHealItem(next, item.id, { linkedLifeAreaIds: [...item.linkedLifeAreaIds, area.id] }));
    } else {
      onStore(next);
    }
    onToast(`Added to ${area.title}`, `/manifest/goal/${encodeURIComponent(area.id)}`);
    onClose();
  }
  function remove() {
    if (!existing) return;
    const ideate = loadIdeateStore();
    saveIdeateStore({
      ...ideate,
      dreams: ideate.dreams.map((dream) =>
        dream.id === existing.lifeAreaId
          ? {
              ...dream,
              healObstacleAnswers: (dream.healObstacleAnswers ?? []).filter((row) => row.id !== existing.id),
            }
          : dream,
      ),
    });
    onStore({
      ...loadHealStore(),
      manifestLinks: loadHealStore().manifestLinks.filter((row) => row.id !== existing.id),
    });
    onClose();
  }
  return (
    <HealOverlay title="Take this into Manifest" onClose={onClose}>
      <div className="overflow-y-auto px-5 py-5">
        <h2 className="font-display text-[22px] text-foreground">Take this into Manifest</h2>
        {!areaId ? (
          <div className="mt-3">
            <p className="text-sm font-semibold">Which life area is this about?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dreams.map((dream) => (
                <button
                  key={dream.id}
                  type="button"
                  className="cursor-pointer rounded-full border border-heal-border bg-heal-tint px-3 py-1 text-sm"
                  onClick={() => {
                    setAreaId(dream.id);
                    setObstacle((dream.obstacleLabels ?? []).filter(Boolean)[0] ?? "");
                  }}
                >
                  {dream.title}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-display text-[18px] outline-none"
            />
            <p className="mt-3 text-sm font-semibold">Add it as</p>
            <label className="mt-2 block rounded-xl border border-foreground px-3 py-2 text-sm">
              <span className="font-semibold">An answer to an obstacle</span>
              <span className="mt-0.5 block text-[13px] text-muted">
                Shows under the obstacle in your {area?.title} vision.
              </span>
              <select
                value={obstacle}
                onChange={(event) => setObstacle(event.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-card px-2 py-1"
              >
                {obstacles.map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
            </label>
            <p className="mt-3 text-[12px] text-muted">
              Only this line goes to Manifest. Nothing else you write in Heal does.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!text.trim() || !obstacle}
                className={HEAL_PRIMARY}
                onClick={() => writeAnswer(text)}
              >
                {existing ? "Update in Manifest" : "Add to Manifest"}
              </button>
              {existing ? (
                <button type="button" className={HEAL_OUTLINE} onClick={remove}>
                  Remove from Manifest
                </button>
              ) : (
                <button type="button" className={HEAL_OUTLINE} onClick={onClose}>
                  Cancel
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </HealOverlay>
  );
}

export function syncLinkedReframe(itemId: string, text: string) {
  const store = loadHealStore();
  const link = store.manifestLinks.find((row) => row.itemId === itemId);
  if (!link) return null;
  const ideate = loadIdeateStore();
  saveIdeateStore({
    ...ideate,
    dreams: ideate.dreams.map((dream) =>
      dream.id === link.lifeAreaId
        ? {
            ...dream,
            healObstacleAnswers: (dream.healObstacleAnswers ?? []).map((row) =>
              row.id === link.id ? { ...row, text } : row,
            ),
          }
        : dream,
    ),
  });
  saveHealStore({
    ...store,
    manifestLinks: store.manifestLinks.map((row) => (row.id === link.id ? { ...row, text } : row)),
  });
  const area = ideate.dreams.find((dream) => dream.id === link.lifeAreaId);
  return area?.title || "your life area";
}

export function HealObstacleNote({
  dreamId,
  label,
  text,
  healItemId,
}: {
  dreamId: string;
  label: string;
  text?: string | null;
  healItemId?: string | null;
}) {
  if (text && healItemId) {
    return (
      <a
        href={`/manifest/goal/${encodeURIComponent(dreamId)}`}
        className="mt-1 block rounded-xl border border-heal-border bg-heal-tint px-3 py-2"
        onClick={(event) => {
          event.preventDefault();
          window.location.assign(`/heal/${encodeURIComponent(healItemId)}`);
        }}
      >
        <span className="flex items-center gap-1 text-[12px] font-semibold text-heal-accent">
          <Heart className="size-3.5" aria-hidden />
          How I see it now · from Heal
        </span>
        <span className="mt-1 block font-display text-[16px] leading-snug text-foreground">{text}</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      className="mt-1 cursor-pointer text-[13px] font-semibold text-accent-link"
      onClick={() => {
        const next = addHealItemForObstacle(dreamId, label);
        if (next) window.location.assign(`/heal/${encodeURIComponent(next)}`);
      }}
    >
      Work through this in Heal
    </button>
  );
}

function addHealItemForObstacle(dreamId: string, label: string): string | null {
  const store = createHealItem(loadHealStore(), {
    type: "belief",
    title: label,
    since: null,
    aboutText: "",
    seeingText: label,
    lifeAreaId: dreamId,
    photoDataUrl: null,
  });
  saveHealStore(store);
  return store.items[0]?.id ?? null;
}

import { Heart, Leaf, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useRouter, useSearchParams } from "@/lib/spa-nav";
import { DictationMicButton } from "@/components/dictation-mic-button";
import { appendSpokenText } from "@/hooks/use-whisper-dictation";
import { healTypeLabel } from "@/lib/heal-copy";
import { SelectChevron } from "@/components/select-chevron";
import {
  activeHealItems,
  addHealUpdate,
  createHealItem,
  currentView,
  formatHealDate,
  formatHealMonth,
  healRelative,
  lastHealActivityIso,
  loadHealStore,
  patchHealItem,
  restedHealItems,
  saveHealStore,
  setHealItemStatus,
  type HealItem,
  type HealStoreV1,
} from "@/lib/heal-store";
import {
  HEAL_OUTLINE,
  HEAL_PAGE,
  HEAL_PRIMARY,
  HealAvatar,
  HealOverlay,
  useHealStore,
} from "@/components/heal/heal-bits";

export function HealHome() {
  const [store, setStore] = useHealStore();
  const params = useSearchParams();
  const router = useRouter();
  const active = activeHealItems(store);
  const rested = restedHealItems(store);
  const isEmpty = active.length === 0 && rested.length === 0;
  const [describe, setDescribe] = useState<{
    name: string;
    areaId: string | null;
    obstacleId: string | null;
    nameLocked: boolean;
  } | null>(null);
  const [name, setName] = useState("");
  const openedDescribe = useRef(false);

  useEffect(() => {
    if (openedDescribe.current || params.get("describe") !== "1") return;
    openedDescribe.current = true;
    setDescribe({
      name: params.get("name") ?? "",
      areaId: params.get("area"),
      obstacleId: params.get("obstacle"),
      nameLocked: Boolean(params.get("name")),
    });
    router.replace("/heal");
  }, [params, router]);

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-[calc(58px+env(safe-area-inset-bottom,0px)+16px)] pt-6 sm:px-6 sm:pb-10">
      {isEmpty ? (
        <section className="rounded-2xl border border-border bg-card p-4 md:p-8">
          <h2 className="font-display text-[22px] leading-[1.2] text-foreground md:text-[30px]">
            What&apos;s hurting or holding you back?
          </h2>
          <p className="mt-2 max-w-xl text-[15px] leading-[1.55] text-foreground">
            A breakup, a loss, a regret, a thought you can&apos;t shake. Write it how you&apos;d say
            it, negative included. It&apos;s private.
          </p>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              setDescribe({ name: name.trim(), areaId: null, obstacleId: null, nameLocked: true });
            }}
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. A recent breakup"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 font-display text-[17px] italic text-foreground outline-none placeholder:text-muted"
            />
            <button type="submit" className={`${HEAL_PRIMARY} h-11 w-full sm:w-auto`}>
              Start
            </button>
          </form>
          <p className="mt-3 text-[13px] text-muted">
            Next you&apos;ll describe what happened. Day-to-day thoughts belong in{" "}
            <Link href="/journal" className="font-semibold text-foreground">
              Journal
            </Link>
            .
          </p>
        </section>
      ) : (
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">
              What you&apos;re carrying
            </h2>
            <button
              type="button"
              className="cursor-pointer text-[13px] font-semibold text-heal-accent"
              onClick={() => setDescribe({ name: "", areaId: null, obstacleId: null, nameLocked: false })}
            >
              + Add something
            </button>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {active.map((item) => (
              <CarryCard key={item.id} item={item} store={store} />
            ))}
          </ul>
        </section>
      )}

      {rested.length > 0 && !isEmpty ? (
        <section className="mt-[18px] sm:mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">Laid to rest</h2>
          <ul className="mt-3 flex flex-col gap-2 opacity-[0.85]">
            {rested.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/heal/${encodeURIComponent(item.id)}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                >
                  <HealAvatar item={item} store={store} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-[1.2px] text-heal-accent">
                      {healTypeLabel(item.type)}
                    </span>
                    <span className="block truncate font-display text-[18px] text-foreground">{item.title}</span>
                    <span className="text-[12px] text-muted">
                      {item.status === "at_peace" ? "At peace" : "Lighter"} since {formatHealMonth(item.restedAt)}
                    </span>
                  </span>
                  <Leaf className="size-4 text-heal-accent" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-3 flex items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-[13px] text-muted sm:mt-8">
        <Heart className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Heal is support, not therapy. If you&apos;re struggling, talk to someone: Samaritans 116 123,
          free, any time.{" "}
          <Link href="/heal/support" className="font-semibold text-accent-link">
            More support
          </Link>
        </p>
      </section>

      {describe ? (
        <DescribeDialog
          initialName={describe.name}
          nameLocked={describe.nameLocked}
          areaId={describe.areaId}
          obstacleId={describe.obstacleId}
          onClose={() => setDescribe(null)}
          onSaved={(id) => {
            setStore(loadHealStore());
            setDescribe(null);
            router.push(`/heal/${encodeURIComponent(id)}`);
          }}
        />
      ) : null}
    </div>
  );
}

function CarryCard({ item, store }: { item: HealItem; store: HealStoreV1 }) {
  const good = currentView(store, item.id, "good");
  const updated = lastHealActivityIso(store, item.id);
  return (
    <li>
      <Link
        href={`/heal/${encodeURIComponent(item.id)}`}
        className="block rounded-2xl border border-border bg-card px-3 py-3 sm:px-4"
      >
        <span className="flex items-center gap-3">
          <HealAvatar item={item} store={store} size={42} />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-[1.2px] text-heal-accent">
              {healTypeLabel(item.type)}
            </span>
            <span className="block truncate font-display text-[20px] leading-tight text-foreground">{item.title}</span>
            {item.since ? (
              <span className="hidden text-[12px] text-muted sm:block">Since {formatHealDate(item.since)}</span>
            ) : null}
          </span>
          <SelectChevron direction="right" />
        </span>
        <span className="mt-3 block">
          {good ? (
            <>
              <span className="block text-[11px] font-semibold text-muted">
                {good.source === "setup" ? "On a good day · suggested" : "On a good day"}
              </span>
              <span className="mt-1 line-clamp-2 font-display text-[17px] leading-snug text-foreground sm:line-clamp-3">
                {good.text}
              </span>
            </>
          ) : (
            <span className="text-[13px] text-muted">No good-day view yet. Answer an exercise to start.</span>
          )}
        </span>
        <span className="mt-3 block text-[12px] text-muted">
          {updated ? `Updated ${healRelative(updated)}` : "Updated today"}
        </span>
      </Link>
    </li>
  );
}

function DescribeDialog({
  initialName,
  nameLocked,
  areaId,
  obstacleId,
  onClose,
  onSaved,
}: {
  initialName: string;
  nameLocked: boolean;
  areaId: string | null;
  obstacleId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [text, setText] = useState("");
  const [ai, setAi] = useState(true);

  function save() {
    const title = (nameLocked ? initialName : name).trim();
    if (!title || !text.trim()) return;
    let next = createHealItem(loadHealStore(), {
      type: "other",
      title,
      since: null,
      aboutText: "",
      lifeAreaId: areaId,
      photoDataUrl: null,
    });
    const item = next.items[0];
    if (!item) return;
    const split = obstacleId?.indexOf("::") ?? -1;
    const obstacleLink =
      obstacleId && split > 0
        ? { lifeAreaId: obstacleId.slice(0, split), label: obstacleId.slice(split + 2) }
        : null;
    next = patchHealItem(next, item.id, {
      aiEnabled: ai,
      sourceObstacleId: obstacleId,
      linkedObstacles: obstacleLink ? [obstacleLink] : item.linkedObstacles,
      linkedLifeAreaIds: areaId ? [areaId] : item.linkedLifeAreaIds,
    });
    next = addHealUpdate(next, item.id, text);
    saveHealStore(next);
    onSaved(item.id);
  }

  return (
    <HealOverlay title="Describe it" onClose={onClose} wide>
      <div className="flex min-h-[70dvh] flex-col overflow-y-auto px-5 py-5 sm:min-h-0">
        {nameLocked ? (
          <p className="text-[13px] font-semibold text-muted">{initialName}</p>
        ) : (
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. A recent breakup"
            className="h-11 rounded-xl border border-border bg-background px-3 font-display text-[17px] italic outline-none placeholder:text-muted"
          />
        )}
        <h2 className="mt-3 font-display text-[26px] leading-tight text-foreground">
          What happened, and what's still on your mind?
        </h2>
        <p className="mt-1 text-[13px] text-muted">Type or speak. A few sentences is enough.</p>
        <div className="relative mt-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-3 pr-14 font-display text-[17px] leading-relaxed outline-none"
          />
          <span className="absolute bottom-2 right-2">
            <DictationMicButton
              variant="inset"
              onTranscript={(spoken) => setText((current) => appendSpokenText(current, spoken))}
            />
          </span>
        </div>
        <label className="mt-3 flex items-start gap-2 text-[13px] text-foreground">
          <input type="checkbox" checked={ai} onChange={(event) => setAi(event.target.checked)} className="mt-0.5" />
          <span>Let AI read this to suggest exercises. Only this item&apos;s writing is used.</span>
        </label>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button type="button" className={HEAL_PRIMARY} disabled={!text.trim() || !(nameLocked ? initialName : name).trim()} onClick={save}>
            Save
          </button>
          <button type="button" className={HEAL_OUTLINE} onClick={onClose}>
            Back
          </button>
          <p className="hidden text-[12px] text-muted sm:ml-auto sm:block">Opens with your exercises ready</p>
        </div>
        <Mic className="sr-only" aria-hidden />
      </div>
    </HealOverlay>
  );
}

export function HealRested() {
  const [store, setStore] = useHealStore();
  const rested = restedHealItems(store);
  return (
    <div className={HEAL_PAGE}>
      {rested.length === 0 ? (
        <p className="text-sm text-muted">Nothing laid to rest yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rested.map((item) => (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
              <HealAvatar item={item} store={store} size={36} />
              <Link href={`/heal/${encodeURIComponent(item.id)}`} className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-[1.2px] text-heal-accent">
                  {healTypeLabel(item.type)}
                </span>
                <span className="block font-display text-[18px] text-foreground">{item.title}</span>
                <span className="text-[12px] text-muted">
                  {item.status === "at_peace" ? "At peace" : "Lighter"} since {formatHealMonth(item.restedAt)}
                </span>
              </Link>
              <button
                type="button"
                className="cursor-pointer text-[13px] font-semibold text-accent-link"
                onClick={() => setStore(setHealItemStatus(loadHealStore(), item.id, "active"))}
              >
                Bring back
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

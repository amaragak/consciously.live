import { Heart, Leaf, Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "@/lib/spa-nav";
import { HEAL_TYPES, healTypeLabel } from "@/lib/heal-copy";
import {
  activeHealItems,
  createHealItem,
  loadHealStore,
  formatHealDate,
  formatHealMonth,
  healTrend,
  healTrendLabel,
  lastHealActivityIso,
  latestCheckin,
  restedHealItems,
  setHealItemStatus,
  weeklyScores,
  type HealItem,
  type HealStoreV1,
  type HealType,
} from "@/lib/heal-store";
import {
  CheckInDialog,
  HEAL_OUTLINE,
  HEAL_PAGE,
  HEAL_PRIMARY,
  HealAvatar,
  HealOverlay,
  HealSparkline,
  readHealPhotoFile,
  useHealStore,
} from "@/components/heal/heal-bits";

function ActivityLine({ store, item }: { store: HealStoreV1; item: HealItem }) {
  const iso = lastHealActivityIso(store, item.id);
  if (!iso) return null;
  return (
    <span className="text-[12px] text-muted">
      Last activity {formatHealDate(iso)}
    </span>
  );
}

export function HealHome() {
  const [store, setStore] = useHealStore();
  const active = activeHealItems(store);
  const rested = restedHealItems(store);
  const [aboutOpen, setAboutOpen] = useState(active.length < 3);
  const [checkInItems, setCheckInItems] = useState<HealItem[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [addType, setAddType] = useState<HealType | null>(null);
  const isEmpty = active.length === 0 && rested.length === 0;
  const openAdd = (type: HealType | null) => {
    setAddType(type);
    setAdding(true);
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-[calc(58px+env(safe-area-inset-bottom,0px)+16px)] pt-6 sm:px-6 sm:pb-10">
      {aboutOpen ? (
        <section className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-4 sm:block sm:px-6 sm:py-[22px]">
          <h2 className="font-display text-[19px] leading-[1.25] text-foreground sm:text-[24px] sm:leading-tight">
            For the things you can&apos;t seem to put down
          </h2>
          <p className="text-[13px] leading-[1.5] text-foreground sm:hidden">
            Long-term things that are hard to get past: grief, regret, a
            relationship that ended. Day-to-day thoughts belong in{" "}
            <Link href="/journal" className="font-semibold text-heal-accent">
              Journal
            </Link>
            .
          </p>
          <div className="hidden sm:block">
            <p className="mt-2 text-[15px] leading-relaxed text-foreground">
              Heal is for long-term things you&apos;re finding hard to get past: grief,
              regret, a relationship that ended, a falling-out that still hurts. Give
              each one its own space, write about it when you need to, and see it get
              lighter over time.
            </p>
            <p className="mt-2 text-[13px] text-muted">
              Day-to-day thoughts belong in{" "}
              <Link href="/journal" className="font-semibold text-foreground underline-offset-2 hover:underline">
                Journal
              </Link>
              .
            </p>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setAboutOpen(true)}
          className="cursor-pointer text-sm font-semibold text-accent-link"
        >
          About Heal
        </button>
      )}

      {active.length > 0 ? (
        <section className="mt-3 flex flex-col gap-2.5 rounded-2xl border border-heal-border bg-heal-tint px-4 py-3.5 sm:mt-4 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4">
          <span className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-card text-heal-accent sm:inline-flex">
            <Heart className="size-5" strokeWidth={1.7} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[18px] leading-tight text-foreground sm:text-[20px]">
              A few minutes for what you&apos;re carrying
            </h2>
            <p className="mt-0.5 hidden text-sm text-muted sm:block">
              Check in on how heavy things feel today. It takes under a minute.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCheckInItems(active)}
            className="accent-fill-gradient inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-full px-4 text-sm font-semibold sm:h-9 sm:w-auto"
          >
            Start a check-in
          </button>
        </section>
      ) : null}

      <section className="mt-[18px] sm:mt-8">
        <HealSectionLabel
          title="What you're carrying"
          onAdd={() => openAdd(null)}
        />
        {active.length === 0 ? (
          <HealEmptyState onAdd={openAdd} />
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((item) => {
              const latest = latestCheckin(store, item.id);
              const trend = healTrend(store, item.id);
              return (
                <li
                  key={item.id}
                  className="flex h-full flex-col rounded-2xl border border-border bg-card p-4"
                >
                  <Link
                    href={`/heal/${encodeURIComponent(item.id)}`}
                    className="flex flex-1 flex-col"
                  >
                    <span className="flex items-center gap-3">
                      <HealAvatar item={item} store={store} size={52} />
                      <span className="min-w-0">
                        <span className="block text-[11px] font-semibold uppercase tracking-[1.2px] text-heal-accent">
                          {healTypeLabel(item.type)}
                        </span>
                        <span className="block truncate font-display text-[24px] leading-tight text-foreground">
                          {item.title}
                        </span>
                        {item.since ? (
                          <span className="text-[12px] text-muted">
                            Since {formatHealDate(item.since, true)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="mt-3 hidden items-end justify-between gap-3 sm:flex">
                      <span>
                        <span className="block text-[12px] text-muted">How heavy</span>
                        <span className="font-display text-[22px] text-foreground">
                          {latest ? latest.score : "–"}
                          <span className="text-[14px] text-muted"> / 10</span>
                        </span>
                      </span>
                      <HealSparkline scores={weeklyScores(store, item.id)} />
                    </span>
                    <span className="mt-3 flex items-center justify-between gap-3 sm:hidden">
                      <span className="text-[13px] text-muted">
                        {trend ? healTrendLabel(trend) : "No check-in yet"}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-display text-[18px] text-foreground">
                          {latest ? latest.score : "–"}
                        </span>
                        <HealSparkline scores={weeklyScores(store, item.id)} />
                      </span>
                    </span>
                    {trend ? (
                      <span className="mt-1 hidden text-[13px] text-muted sm:block">
                        {healTrendLabel(trend)}
                      </span>
                    ) : null}
                  </Link>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-3">
                    <ActivityLine store={store} item={item} />
                    <button
                      type="button"
                      className={HEAL_OUTLINE}
                      onClick={() => setCheckInItems([item])}
                    >
                      Check in
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {rested.length > 0 && !isEmpty ? (
        <section className="mt-[18px] sm:mt-8">
          <HealSectionLabel title="Laid to rest" />
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
                    <span className="block truncate font-display text-[18px] text-foreground">
                      {item.title}
                    </span>
                    <span className="text-[12px] text-muted">
                      {item.status === "at_peace" ? "At peace" : "Lighter"} since{" "}
                      {formatHealMonth(item.restedAt)}
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
          Heal is support, not therapy. If you&apos;re struggling, talk to someone:
          Samaritans 116 123, free, any time.{" "}
          <Link href="/heal/support" className="font-semibold text-accent-link">
            More support
          </Link>
        </p>
      </section>

      {checkInItems && checkInItems.length > 0 ? (
        <CheckInDialog
          items={checkInItems}
          onClose={() => setCheckInItems(null)}
          onSaved={setStore}
        />
      ) : null}
      {adding ? (
        <AddSomething
          initialType={addType}
          onClose={() => setAdding(false)}
          onCreate={(next) => {
            setStore(next);
            setAdding(false);
          }}
        />
      ) : null}
    </div>
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

const EMPTY_EXAMPLES: { type: HealType; label: string }[] = [
  { type: "grief", label: "Someone I've lost" },
  { type: "heartbreak", label: "A relationship that ended" },
  { type: "regret", label: "Something I regret" },
  { type: "resentment", label: "A falling-out" },
];

function HealSectionLabel({
  title,
  onAdd,
}: {
  title: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[1.6px] text-heal-accent">
        {title}
      </h2>
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 whitespace-nowrap text-[13px] font-semibold text-heal-accent"
        >
          <Plus className="size-3.5" aria-hidden />
          <span className="sm:hidden">Add</span>
          <span className="hidden sm:inline">Add something</span>
        </button>
      ) : null}
    </div>
  );
}

function HealEmptyState({
  onAdd,
}: {
  onAdd: (type: HealType | null) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-heal-tint text-heal-accent">
        <Heart className="size-5" strokeWidth={1.7} aria-hidden />
      </span>
      <h3 className="font-display text-[18px] leading-tight text-foreground sm:text-[20px]">
        Start with one thing
      </h3>
      <p className="text-[13px] leading-relaxed text-foreground sm:text-sm">
        Something you keep coming back to: someone you&apos;ve lost, something you
        regret, a relationship that ended. You can add more later.
      </p>
      <div className="flex flex-wrap gap-2">
        {EMPTY_EXAMPLES.map((example) => (
          <button
            key={example.type}
            type="button"
            onClick={() => onAdd(example.type)}
            className="inline-flex cursor-pointer items-center rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground"
          >
            {example.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onAdd(null)}
        className={`${HEAL_PRIMARY} w-full sm:w-auto`}
      >
        Add something you&apos;re carrying
      </button>
    </div>
  );
}

function AddSomething({
  initialType,
  onClose,
  onCreate,
}: {
  initialType: HealType | null;
  onClose: () => void;
  onCreate: (next: HealStoreV1) => void;
}) {
  const [type, setType] = useState<HealType | null>(initialType);
  const [title, setTitle] = useState("");
  const [since, setSince] = useState("");
  const [about, setAbout] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  return (
    <HealOverlay title="Add something" onClose={onClose}>
      <form
        className="overflow-y-auto px-5 py-5 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!type || !title.trim()) return;
          onCreate(
            createHealItem(loadHealStore(), {
              type,
              title,
              since: since || null,
              aboutText: about,
              photoDataUrl: photo,
            }),
          );
        }}
      >
        <h2 className="font-display text-[22px] text-foreground">Add something</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {HEAL_TYPES.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setType(row.id)}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                type === row.id
                  ? "border-foreground bg-foreground text-white"
                  : "border-heal-border bg-heal-tint text-foreground"
              }`}
            >
              {row.label}
            </button>
          ))}
        </div>
        <label className="mt-4 block text-sm">
          What to call it
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="mt-3 block text-sm">
          Since (optional)
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
          />
        </label>
        <label className="mt-3 block text-sm">
          Photo (optional)
          <input
            type="file"
            accept="image/*"
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void readHealPhotoFile(file).then(setPhoto);
            }}
          />
        </label>
        <label className="mt-3 block text-sm">
          What happened (optional)
          <textarea
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            rows={4}
            className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 font-display text-[18px] leading-relaxed outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!type || !title.trim()}
          className={`${HEAL_PRIMARY} mt-4 w-full`}
        >
          Add
        </button>
      </form>
    </HealOverlay>
  );
}

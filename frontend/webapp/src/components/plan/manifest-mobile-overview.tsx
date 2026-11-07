/**
 * Mobile-only Manifest overview: compact expandable manifesto, vision swipe,
 * next-step card, life-areas swipe. Desktop keeps ManifestoHeroBento.
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconPencil } from "@tabler/icons-react";
import { Timer } from "lucide-react";
import { CoverImage } from "@/components/cover-image";
import { LifeAreaCard, type LifeAreaCardGoal } from "@/components/plan/life-area-card";
import {
  LIGHT_ACCENT_TEXT,
  MANIFESTO_EYEBROW_CLASS,
} from "@/components/plan/manifesto-section";
import { SelectChevron } from "@/components/select-chevron";
import {
  boardVisionItems,
  visionPickOrder,
  type VisionBoardItem,
} from "@/lib/ideate-vision-board";
import { queueTrackerFocus } from "@/lib/focus-ideate-link";
import { doingItemsAcrossLifeAreas } from "@/lib/life-area-doing";
import { nextFocusStep } from "@/lib/next-focus-step";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { subscribeIdeateCloud } from "@/lib/ideate-cloud";
import { Link as SpaLink, useRouter } from "@/lib/spa-nav";
import type { PlanDream } from "@/lib/plan-dreams";

const OUTLINE_PILL =
  "inline-flex h-[34px] shrink-0 items-center gap-1 rounded-full border border-border bg-card pl-3.5 pr-2 text-[13px] font-semibold text-foreground";

function SwipeHintRow({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <>
      <div
        ref={ref}
        className={`${className} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}
      >
        {children}
      </div>
      {overflows ? (
        <p className="mt-2 flex items-center gap-1 text-[11.5px] text-muted">
          Swipe for more
          <SelectChevron direction="right" />
        </p>
      ) : null}
    </>
  );
}

/** Compact paisley manifesto — expands in place for full text + actions. */
export function ManifestMobileHero({
  statement,
  loading,
  editing,
  draft,
  onDraft,
  onBeginEdit,
  onBeginWrite,
  onCancelEdit,
  onSaveEdit,
}: {
  statement: string;
  loading: boolean;
  editing: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onBeginEdit: () => void;
  onBeginWrite: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const has = Boolean(statement.trim());
  const body = statement.trim();

  useEffect(() => {
    if (editing) setOpen(true);
  }, [editing]);

  return (
    <section
      aria-label="My manifesto"
      className="relative overflow-hidden rounded-2xl bg-[var(--deep)] text-white"
    >
      <div className="navy-paisley-plate" aria-hidden />
      <div className="relative z-[1] flex flex-col gap-2.5 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <span className={`${MANIFESTO_EYEBROW_CLASS} ${LIGHT_ACCENT_TEXT}`}>
            My manifesto
          </span>
          {!editing ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className={`inline-flex cursor-pointer items-center gap-0.5 text-[13px] font-semibold ${LIGHT_ACCENT_TEXT}`}
            >
              {open ? "Less" : "More"}
              <SelectChevron
                direction="down"
                open={open}
                className={LIGHT_ACCENT_TEXT}
              />
            </button>
          ) : null}
        </div>

        {editing ? (
          <form
            className="flex flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              onSaveEdit();
            }}
          >
            <textarea
              autoFocus
              rows={4}
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              className="w-full resize-none rounded-xl border border-white/35 bg-black/35 px-3 py-2.5 text-base leading-[1.45] text-white outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onCancelEdit}
                className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-full text-sm font-medium text-white/70"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!draft.trim()}
                className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center rounded-full border border-white bg-black text-sm font-semibold text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </form>
        ) : loading && !has ? (
          <div className="flex flex-col gap-2" aria-hidden>
            <span className="mm-skeleton block h-4 w-[94%] rounded-sm bg-white/15" />
            <span className="mm-skeleton block h-4 w-[72%] rounded-sm bg-white/15" />
          </div>
        ) : has ? (
          <>
            <p
              className={`text-[15px] leading-[1.45] text-white/90 ${
                open ? "" : "line-clamp-2"
              }`}
            >
              {body}
            </p>
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0.7,0.2,1)]"
              style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="flex gap-2 pt-1.5">
                  <SpaLink
                    href="/manifest/poster"
                    className="accent-fill-gradient inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-full px-3 text-sm font-semibold text-on-accent"
                  >
                    View as poster
                  </SpaLink>
                  <button
                    type="button"
                    onClick={onBeginEdit}
                    className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-white/70 px-4 text-sm font-semibold text-white"
                  >
                    <IconPencil size={14} stroke={1.8} aria-hidden />
                    Edit
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            <p className="text-[15px] leading-[1.45] text-white/60">
              Write the one sentence you want to live by.
            </p>
            {!loading ? (
              <button
                type="button"
                onClick={onBeginWrite}
                className="accent-fill-gradient inline-flex h-10 w-full cursor-pointer items-center justify-center rounded-full text-sm font-semibold text-on-accent"
              >
                Write your statement
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

/** Vision board header + horizontal mosaic swipe. */
export function ManifestMobileVisionBoard({
  items,
  urls,
  loading,
}: {
  items: VisionBoardItem[];
  urls: Record<string, string>;
  loading?: boolean;
}) {
  const ordered = visionPickOrder(boardVisionItems(items));
  const show = ordered;
  const large = show[0];
  const rest = show.slice(1);
  const extra = Math.max(0, show.length - 5);

  function tileHref(id: string) {
    return `/manifest/vision-board?select=${encodeURIComponent(id)}#vision-tile-${id}`;
  }

  function srcFor(item: VisionBoardItem): string | null {
    return (
      (typeof item.imageUrl === "string" && item.imageUrl.trim()) ||
      urls[item.id] ||
      null
    );
  }

  return (
    <section aria-label="Your vision board" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[1.6px] text-[#8A6424]">
          Your vision board
        </h2>
        <SpaLink href="/manifest/vision-board" className={OUTLINE_PILL}>
          Open
          <SelectChevron direction="right" />
        </SpaLink>
      </div>

      {loading ? (
        <div className="flex gap-1.5" aria-hidden>
          <div className="mm-skeleton h-[148px] w-[148px] shrink-0 rounded-[10px]" />
          <div className="grid h-[148px] w-[148px] shrink-0 grid-cols-2 grid-rows-2 gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="mm-skeleton rounded-[10px]" />
            ))}
          </div>
        </div>
      ) : show.length === 0 ? (
        <SpaLink
          href="/manifest/vision-board"
          className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-[14px] font-semibold text-accent-link"
        >
          Start your vision board
        </SpaLink>
      ) : (
        <SwipeHintRow className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
          {large ? (
            <SpaLink
              href={tileHref(large.id)}
              className="relative h-[148px] w-[148px] shrink-0 overflow-hidden rounded-[10px]"
              style={{ background: large.color || "var(--accent-soft)" }}
            >
              {srcFor(large) ? (
                <CoverImage
                  src={srcFor(large)!}
                  className="absolute inset-0 h-full w-full"
                />
              ) : null}
            </SpaLink>
          ) : null}
          {Array.from({ length: Math.ceil(rest.length / 2) }).map((_, col) => {
            const a = rest[col * 2];
            const b = rest[col * 2 + 1];
            const lastOfFirstFour = col === 1;
            return (
              <div
                key={col}
                className="grid h-[148px] w-[72px] shrink-0 grid-rows-2 gap-1.5"
              >
                {[a, b].map((item, row) => {
                  if (!item) {
                    return (
                      <div
                        key={`empty-${col}-${row}`}
                        className="rounded-[10px] bg-accent-soft"
                        aria-hidden
                      />
                    );
                  }
                  const showPlus =
                    lastOfFirstFour && row === 1 && extra > 0;
                  return (
                    <SpaLink
                      key={item.id}
                      href={tileHref(item.id)}
                      className="relative overflow-hidden rounded-[10px]"
                      style={{
                        background: item.color || "var(--accent-soft)",
                      }}
                    >
                      {srcFor(item) ? (
                        <CoverImage
                          src={srcFor(item)!}
                          className="absolute inset-0 h-full w-full"
                        />
                      ) : null}
                      {showPlus ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[15px] font-semibold text-white">
                          +{extra}
                        </span>
                      ) : null}
                    </SpaLink>
                  );
                })}
              </div>
            );
          })}
        </SwipeHintRow>
      )}
    </section>
  );
}

/** Doing Focus card for mobile (no Open Focus link). */
export function ManifestMobileNextStep() {
  const router = useRouter();
  const [step, setStep] = useState(() => nextFocusStep(loadIdeateStore()));

  useEffect(() => {
    const sync = () => setStep(nextFocusStep(loadIdeateStore()));
    sync();
    return subscribeIdeateCloud(sync);
  }, []);

  function start() {
    const store = loadIdeateStore();
    const doing = doingItemsAcrossLifeAreas(store);
    if (doing.length === 0) {
      router.push("/focus");
      return;
    }
    router.push(
      queueTrackerFocus(
        doing.map(({ item }) => ({
          id: item.id,
          title: item.title,
          lifeAreaId: item.lifeAreaId,
        })),
      ),
    );
  }

  return (
    <section
      aria-label="Doing"
      className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]"
    >
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
          <Timer className="size-[13px]" strokeWidth={2} aria-hidden />
          {step ? "Doing" : "Focus"}
        </span>
        {step ? (
          <>
            <p className="mt-1 font-display text-[17px] leading-tight text-foreground">
              {step.stepTitle}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              {step.lifeAreaTitle}
              {step.total > 1 ? ` · ${step.total} Doing` : ""}
            </p>
          </>
        ) : (
          <p className="mt-1 font-display text-[17px] leading-tight text-foreground">
            Start a focus session
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={start}
        className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold accent-fill-gradient"
      >
        <Timer className="size-3.5" strokeWidth={2} aria-hidden />
        {step ? "Start 25 min" : "Start"}
      </button>
    </section>
  );
}

export type ManifestMobileLifeArea = {
  dream: PlanDream;
  href: string;
  snippet: string | null;
  activity: { text: string; quiet: boolean } | null;
  goal: LifeAreaCardGoal | null;
  setGoalHref: string;
  onFocus?: () => void;
  onMeditate?: () => void;
  creationIndex: number;
};

export function ManifestMobileLifeAreas({
  areas,
  loading,
  onAdd,
}: {
  areas: ManifestMobileLifeArea[];
  loading?: boolean;
  onAdd: () => void;
}) {
  return (
    <section
      id="life-areas"
      aria-labelledby="ideate-life-areas-heading-mobile"
      className="flex scroll-mt-20 flex-col gap-2.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="ideate-life-areas-heading-mobile"
          className="text-[11px] font-semibold uppercase tracking-[1.6px] text-[#8A6424]"
        >
          Your life areas
        </h2>
        <a href="#life-areas" className={OUTLINE_PILL}>
          All
          <SelectChevron direction="right" />
        </a>
      </div>

      {loading ? (
        <div className="-mx-4 flex gap-3 overflow-hidden px-4" aria-hidden>
          {[0, 1].map((i) => (
            <div key={i} className="w-[70vw] max-w-[280px] shrink-0">
              <LifeAreaCard loading creationIndex={i} />
            </div>
          ))}
        </div>
      ) : areas.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-[14px] font-semibold text-accent-link"
        >
          Add life area
        </button>
      ) : (
        <SwipeHintRow className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-0.5">
          {areas.map((a) => (
            <div
              key={a.dream.id}
              className="flex w-[70vw] max-w-[280px] shrink-0 flex-col [&>*]:flex-1"
            >
              <LifeAreaCard
                href={a.href}
                title={a.dream.title}
                snippet={a.snippet}
                activity={a.activity}
                goal={a.goal}
                setGoalHref={a.setGoalHref}
                onFocus={a.onFocus}
                onMeditate={a.onMeditate}
                creationIndex={a.creationIndex}
                compact
              />
            </div>
          ))}
        </SwipeHintRow>
      )}
    </section>
  );
}

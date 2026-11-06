"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/spa-nav";
import { PRIMARY_ACCENT_FILL_STYLE } from "@/components/primary-create-button";
import { subscribeAffirmations } from "@/lib/daily-affirmations";
import {
  buildGetSetUpSnapshot,
  detectGetSetUpDoneSync,
  detectHasMeditation,
  emptyDoneMap,
  GET_SET_UP_CHANGED,
  GET_SET_UP_ITEMS,
  clearGetSetUpVisitHide,
  hideGetSetUpForVisit,
  skipGetSetUpItem,
  type GetSetUpDoneMap,
  type GetSetUpItemDef,
  type GetSetUpSnapshot,
} from "@/lib/get-set-up";
import { subscribeIdeateCloud } from "@/lib/ideate-cloud";
import {
  onboardingGapRows,
  type OnboardingGapRow,
} from "@/lib/onboarding-get-set-up";
import { ONBOARDING_CHANGED } from "@/lib/onboarding-state";

const PANEL =
  "rounded-[22px] border border-border bg-[rgba(251,248,242,0.95)] shadow-[0_2px_14px_rgba(15,27,45,0.05)]";
const ICON_WRAP =
  "flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F6EEDD] text-[#8A6424]";
const MIST_BTN =
  "inline-flex h-[38px] shrink-0 items-center justify-center rounded-full border border-[#AFC2DC] px-5 text-[14px] font-semibold text-on-accent";
const OUTLINE_BTN =
  "inline-flex h-[38px] shrink-0 items-center justify-center rounded-full border border-border bg-[#FFFDF8] px-4 text-[14px] font-semibold text-foreground";
const SKIP =
  "cursor-pointer text-[13px] text-[#8A8478] underline-offset-2 hover:underline";

function ItemIcon({ id }: { id: GetSetUpItemDef["id"] }) {
  const common = {
    width: 19,
    height: 19,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (id === "manifesto") {
    return (
      <svg {...common}>
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }
  if (id === "meditation") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 1.5" />
      </svg>
    );
  }
  if (id === "photo") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <circle cx="12" cy="13" r="4" />
        <path d="M8 6l2-3h4l2 3" />
      </svg>
    );
  }
  if (id === "story") {
    return (
      <svg {...common}>
        <path d="M4 5a2 2 0 012-2h5v17H6a2 2 0 01-2-2zM20 5a2 2 0 00-2-2h-5v17h5a2 2 0 002-2z" />
      </svg>
    );
  }
  if (id === "first_step") {
    return (
      <svg {...common}>
        <path d="M4 18h5v-5h5V8h6" />
      </svg>
    );
  }
  if (id === "affirmations") {
    return (
      <svg {...common}>
        <path d="M7 7h4v4H8a3 3 0 003 3v2a5 5 0 01-5-5zM14 7h4v4h-3a3 3 0 003 3v2a5 5 0 01-5-5z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}

function TickMark() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function capitaliseFirst(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function ProgressHeader({
  snapshot,
  compactChips,
}: {
  snapshot: GetSetUpSnapshot;
  compactChips: boolean;
}) {
  const pct = Math.round((snapshot.progress / GET_SET_UP_ITEMS.length) * 100);
  /** Mobile: done chips collapse behind Show / Hide (desktop always shows them). */
  const [showChips, setShowChips] = useState(false);
  return (
    <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:gap-4">
      <div className="flex items-baseline justify-between gap-3 md:contents">
        <h2 className="font-display text-[21px] font-normal text-foreground md:text-[24px]">
          Get set up
        </h2>
        <button
          type="button"
          onClick={() => hideGetSetUpForVisit()}
          className={`${SKIP} md:order-last md:ml-auto`}
        >
          Hide for now
        </button>
      </div>
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="h-1.5 w-full max-w-[160px] overflow-hidden rounded-full bg-[#E6DDCB] md:w-40">
          <span
            className="block h-full rounded-full bg-[#C8A46A] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </span>
        <span className="shrink-0 text-[13px] font-semibold text-foreground">
          {snapshot.progress} of {GET_SET_UP_ITEMS.length}
          <span className="md:hidden"> done</span>
        </span>
        {snapshot.chips.length > 0 ? (
          <button
            type="button"
            onClick={() => setShowChips((v) => !v)}
            aria-expanded={showChips}
            className="shrink-0 cursor-pointer text-[13px] font-semibold text-accent-link md:hidden"
          >
            {showChips ? "Hide" : "Show"}
          </button>
        ) : null}
      </span>
      {snapshot.chips.length > 0 ? (
        <div className={`${showChips ? "flex" : "hidden"} flex-wrap gap-1.5 md:flex md:flex-1`}>
          {snapshot.chips.map((chip) => (
            <span
              key={chip.id}
              className={
                chip.kind === "done"
                  ? "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E6D3AE] bg-[#F6EEDD] px-2.5 text-[12.5px] font-semibold text-[#8A6424]"
                  : "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-transparent px-2.5 text-[12.5px] font-semibold text-muted"
              }
            >
              {chip.kind === "done" ? <TickMark /> : null}
              {capitaliseFirst(compactChips
                ? chip.label
                    .replace(/^Your /i, "")
                    .replace(/^Add a photo of yourself$/i, "Photo")
                    .replace(/^Write your story$/i, "Story")
                    .replace(/^Set a first step$/i, "First step")
                    .replace(/^Daily affirmations$/i, "Affirmations")
                    .replace(/^Bring in your old journal$/i, "Journal")
                    .replace(/^first meditation$/i, "First meditation")
                : chip.label)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ItemCard({
  item,
  primary,
}: {
  item: GetSetUpItemDef;
  primary: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-2xl border border-border bg-[#FFFDF8] p-4">
      <span className={ICON_WRAP}>
        <ItemIcon id={item.id} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[15.5px] font-semibold text-foreground">{item.title}</p>
        <p className="text-[13.5px] leading-snug text-muted">{item.body}</p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href={item.href}
          className={primary ? MIST_BTN : OUTLINE_BTN}
          style={primary ? PRIMARY_ACCENT_FILL_STYLE : undefined}
        >
          {item.action}
        </Link>
        <button
          type="button"
          className={SKIP}
          onClick={() => skipGetSetUpItem(item.id)}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function ItemRow({
  item,
  primary,
}: {
  item: GetSetUpItemDef;
  primary: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border py-3">
      <span className={`${ICON_WRAP} size-[38px] rounded-[11px]`}>
        <ItemIcon id={item.id} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-foreground">{item.title}</p>
        <p className="text-[12.5px] leading-snug text-muted md:text-[13.5px]">
          {item.body}
        </p>
      </div>
      <Link
        href={item.href}
        className={
          primary
            ? `${MIST_BTN} h-[34px] px-3 text-[13px]`
            : `${OUTLINE_BTN} h-[34px] px-3 text-[13px]`
        }
        style={primary ? PRIMARY_ACCENT_FILL_STYLE : undefined}
      >
        {item.action}
      </Link>
      <button
        type="button"
        className={`${SKIP} text-[12.5px]`}
        onClick={() => skipGetSetUpItem(item.id)}
      >
        Skip
      </button>
    </div>
  );
}

function OnboardingGapRowView({
  row,
  primary,
}: {
  row: OnboardingGapRow;
  primary: boolean;
}) {
  if (row.kind === "voice") {
    return (
      <div className="relative mt-3 overflow-hidden rounded-2xl bg-[#1E232E] px-4 py-3.5 text-[#F7F1E6]">
        <span className="navy-paisley-plate" aria-hidden />
        <div className="relative z-[1] flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold">{row.title}</p>
            <p className="text-[12.5px] leading-snug text-[#D8D0C2]">
              {row.body}
            </p>
          </div>
          <Link
            href={row.href}
            className={`${MIST_BTN} h-[34px] px-3 text-[13px]`}
            style={PRIMARY_ACCENT_FILL_STYLE}
          >
            {row.action}
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 border-t border-border py-3">
      <span className={`${ICON_WRAP} size-[38px] rounded-[11px]`}>
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden
        >
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-foreground">{row.title}</p>
        <p className="text-[12.5px] leading-snug text-muted md:text-[13.5px]">
          {row.body}
        </p>
      </div>
      <Link
        href={row.href}
        className={
          primary
            ? `${MIST_BTN} h-[34px] px-3 text-[13px]`
            : `${OUTLINE_BTN} h-[34px] px-3 text-[13px]`
        }
        style={primary ? PRIMARY_ACCENT_FILL_STYLE : undefined}
      >
        {row.action}
      </Link>
    </div>
  );
}

export function GetSetUpPanel() {
  const [done, setDone] = useState<GetSetUpDoneMap>(() => emptyDoneMap());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void detectHasMeditation().then((hasMeditation) => {
        if (cancelled) return;
        setDone(detectGetSetUpDoneSync(hasMeditation));
        setTick((n) => n + 1);
      });
      setDone((prev) => ({
        ...detectGetSetUpDoneSync(prev.meditation),
      }));
      setTick((n) => n + 1);
    };
    refresh();
    const unsubIdeate = subscribeIdeateCloud(refresh);
    const unsubAffirm = subscribeAffirmations(refresh);
    window.addEventListener(GET_SET_UP_CHANGED, refresh);
    window.addEventListener(ONBOARDING_CHANGED, refresh);
    window.addEventListener("medimade-session-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      unsubIdeate();
      unsubAffirm();
      window.removeEventListener(GET_SET_UP_CHANGED, refresh);
      window.removeEventListener(ONBOARDING_CHANGED, refresh);
      window.removeEventListener("medimade-session-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const snapshot = useMemo(
    () => buildGetSetUpSnapshot(done),
    // tick forces rebuild after skip / hide
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [done, tick],
  );

  const onboardingRows = useMemo(() => onboardingGapRows(), [tick]);

  if (!snapshot && onboardingRows.length === 0) return null;

  if (snapshot?.hiddenThisVisit) {
    return (
      <div
        data-dash-reveal
        className={`${PANEL} flex items-center justify-between gap-3 px-5 py-3`}
      >
        <p className="min-w-0 truncate text-[14px] text-muted">
          Get set up · {snapshot.progress} of {GET_SET_UP_ITEMS.length} ·{" "}
          {snapshot.remaining.length} left
        </p>
        <Link
          href={
            onboardingRows[0]?.href ??
            snapshot.remaining[0]?.href ??
            "/"
          }
          className="shrink-0 text-[13px] font-semibold text-accent-link"
          onClick={() => clearGetSetUpVisitHide()}
        >
          Continue
        </Link>
      </div>
    );
  }

  const remaining = snapshot?.remaining ?? [];
  const useRows = remaining.length <= 2 || onboardingRows.length > 0;
  const compactChips = (snapshot?.chips.length ?? 0) >= 3;
  const voiceRow = onboardingRows.find((r) => r.kind === "voice");
  const gapRows = onboardingRows.filter((r) => r.kind === "row");

  return (
    <section
      data-dash-reveal
      aria-label="Get set up"
      className={`${PANEL} px-4 py-4 md:px-[22px] md:py-5`}
    >
      {snapshot ? (
        <ProgressHeader snapshot={snapshot} compactChips={compactChips} />
      ) : (
        <h2 className="font-display text-[21px] font-normal text-foreground md:text-[24px]">
          Get set up
        </h2>
      )}
      {voiceRow ? (
        <OnboardingGapRowView row={voiceRow} primary />
      ) : null}
      {gapRows.length ? (
        <div className="mt-1 flex flex-col">
          {gapRows.map((row, index) => (
            <OnboardingGapRowView
              key={row.id}
              row={row}
              primary={!voiceRow && index === 0 && remaining.length === 0}
            />
          ))}
        </div>
      ) : null}
      {useRows ? (
        <div className="mt-1 flex flex-col">
          {remaining.map((item, index) => (
            <ItemRow
              key={item.id}
              item={item}
              primary={!voiceRow && gapRows.length === 0 && index === 0}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 hidden gap-3 md:flex">
            {remaining.map((item, index) => (
              <ItemCard key={item.id} item={item} primary={index === 0} />
            ))}
          </div>
          <div className="mt-1 flex flex-col md:hidden">
            {remaining.map((item, index) => (
              <ItemRow key={item.id} item={item} primary={index === 0} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

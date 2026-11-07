/**
 * Manifesto Focus card. Starts a session with Doing items when marked;
 * otherwise opens Focus with nothing preselected.
 */

import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
import { queueTrackerFocus } from "@/lib/focus-ideate-link";
import { doingItemsAcrossLifeAreas } from "@/lib/life-area-doing";
import { loadIdeateStore } from "@/lib/plan-ideate-store";
import { subscribeIdeateCloud } from "@/lib/ideate-cloud";
import { nextFocusStep, type NextFocusStep } from "@/lib/next-focus-step";
import { Link, useRouter } from "@/lib/spa-nav";

export function ManifestoFocusCard({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<NextFocusStep | null>(null);

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
    const href = queueTrackerFocus(
      doing.map(({ item }) => ({
        id: item.id,
        title: item.title,
        lifeAreaId: item.lifeAreaId,
      })),
    );
    router.push(href);
  }

  return (
    <div className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card px-[18px] py-4 shadow-[0_2px_10px_rgb(15_27_45_/_0.04)]">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[1.4px] text-accent-link">
        <Timer className="size-[13px]" strokeWidth={2} aria-hidden />
        Focus
      </span>
      {step ? (
        <>
          <p
            className={`font-display leading-tight text-foreground ${
              compact ? "text-[17px]" : "text-[19px]"
            }`}
          >
            Doing: {step.stepTitle}
          </p>
          <p className="text-[12px] text-muted">
            {step.lifeAreaTitle}
            {step.total > 1 ? ` · ${step.total} Doing` : ""}
          </p>
          <div className="mt-auto flex items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={start}
              className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold accent-fill-gradient"
            >
              <Timer className="size-3.5" strokeWidth={2} aria-hidden />
              Start 25 min
            </button>
            {/* Mobile Manifest uses ManifestMobileNextStep (no Open Focus). */}
            {!compact ? (
              <Link
                href="/focus"
                className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-link"
              >
                Open Focus
                <SelectChevron direction="right" className="text-accent-link" />
              </Link>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p
            className={`font-display leading-tight text-foreground ${
              compact ? "text-[17px]" : "text-[19px]"
            }`}
          >
            Start a focus session
          </p>
          <div className="mt-auto pt-1">
            <button
              type="button"
              onClick={start}
              className="inline-flex h-9 cursor-pointer items-center rounded-full px-4 text-sm font-semibold accent-fill-gradient"
            >
              Start
            </button>
          </div>
        </>
      )}
    </div>
  );
}

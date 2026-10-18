/**
 * Manifesto Focus card. Starts a session with the existing Focus handoff.
 */

import { Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { SelectChevron } from "@/components/select-chevron";
import { startLifeAreaFocus } from "@/lib/life-area-card-actions";
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
    if (!step) {
      router.push("/focus");
      return;
    }
    const href = startLifeAreaFocus(step.subtaskId);
    router.push(`${href}&minutes=25&autoStart=1`);
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
            Next: {step.stepTitle}
          </p>
          <p className="text-[12px] text-muted">
            {step.lifeAreaTitle} · {step.goalTitle} · {step.done} of {step.total}
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
            <Link
              href="/focus"
              className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-link"
            >
              Open Focus
              <SelectChevron direction="right" className="text-accent-link" />
            </Link>
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

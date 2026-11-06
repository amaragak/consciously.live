"use client";

import { useMemo } from "react";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import type {
  OnboardingCoverageKey,
  OnboardingMode,
  OnboardingStep,
} from "@/lib/onboarding-state";
import { useSearchParams } from "react-router-dom";

const STEPS = new Set<OnboardingStep>([
  "tell_me",
  "listening",
  "coverage",
  "follow_up",
  "sorting",
  "heard",
  "typed_areas",
  "typed_values",
  "typed_voice",
  "typed_manifesto",
  "typed_meditation",
  "skipped",
  "gap_follow_up",
  "gap_added",
  "mostly_fill",
  "mostly_added",
]);

const MODES = new Set<OnboardingMode>(["full", "merge", "gap", "mostly"]);

const GAPS = new Set<OnboardingCoverageKey>([
  "goals",
  "values",
  "blockers",
  "heal",
  "manifesto",
]);

export function OnboardingPage() {
  const [params] = useSearchParams();
  const initial = useMemo(() => {
    const stepRaw = params.get("step") as OnboardingStep | null;
    const modeRaw = params.get("mode") as OnboardingMode | null;
    const gapRaw = params.get("gap") as OnboardingCoverageKey | null;
    return {
      step: stepRaw && STEPS.has(stepRaw) ? stepRaw : undefined,
      mode: modeRaw && MODES.has(modeRaw) ? modeRaw : undefined,
      gap: gapRaw && GAPS.has(gapRaw) ? gapRaw : null,
    };
  }, [params]);

  return (
    <OnboardingFlow
      initialStep={initial.step}
      initialMode={initial.mode}
      initialGap={initial.gap}
    />
  );
}

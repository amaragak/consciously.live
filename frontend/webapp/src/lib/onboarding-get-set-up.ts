/**
 * Get set up rows for onboarding gaps (dashboard).
 */

import {
  detectOnboardingCoverage,
  loadOnboardingStore,
  onboardingHref,
  type OnboardingCoverageKey,
} from "@/lib/onboarding-state";

export type OnboardingGapRow = {
  id: OnboardingCoverageKey | "voice_checkin" | "onboarding_start";
  title: string;
  body: string;
  action: string;
  href: string;
  kind: "voice" | "row";
};

export function onboardingGapRows(): OnboardingGapRow[] {
  const cov = detectOnboardingCoverage();
  const store = loadOnboardingStore();
  const rows: OnboardingGapRow[] = [];

  const talkGaps = (["goals", "values", "blockers", "heal", "manifesto"] as const).some(
    (k) => cov.missing.includes(k),
  );
  const needsStart =
    Boolean(store.skippedAt) ||
    cov.missing.includes("manifesto") ||
    (!store.completedAt && talkGaps);

  if (talkGaps || store.skippedAt) {
    rows.push({
      id: "voice_checkin",
      title: "Talk it through",
      body: "Talk about your goals, what matters and what's in the way. I'll add what's missing.",
      action: "Talk",
      href: onboardingHref({
        step: "tell_me",
        mode: store.completedAt ? "merge" : "full",
      }),
      kind: "voice",
    });
  }

  if (needsStart) {
    const carryOn = Boolean(
      store.resumeStep &&
        store.resumeStep !== "tell_me" &&
        store.resumeStep !== "heard" &&
        store.resumeStep !== "skipped",
    );
    rows.push({
      id: "onboarding_start",
      title: store.skippedAt && !store.completedAt
        ? "Tell me about the life you want"
        : "Your manifesto",
      body: store.skippedAt && !store.completedAt
        ? "Talk it through or answer three questions"
        : "Talk it through or answer three questions",
      action: carryOn ? "Carry on" : "Start",
      href: onboardingHref({
        step: carryOn && store.resumeStep ? store.resumeStep : "tell_me",
        mode: store.completedAt ? "merge" : "full",
      }),
      kind: "row",
    });
  }

  if (cov.missing.includes("goals")) {
    rows.push({
      id: "goals",
      title: "Your goals",
      body: "What you want in each life area",
      action: "Add",
      href: onboardingHref({ step: "gap_follow_up", mode: "gap", gap: "goals" }),
      kind: "row",
    });
  }
  if (cov.missing.includes("values")) {
    rows.push({
      id: "values",
      title: "Your values",
      body: "What matters most to you",
      action: "Add",
      href: onboardingHref({ step: "gap_follow_up", mode: "gap", gap: "values" }),
      kind: "row",
    });
  }
  if (cov.missing.includes("blockers")) {
    rows.push({
      id: "blockers",
      title: "What gets in the way",
      body: "Blockers on your goals",
      action: "Add",
      href: onboardingHref({
        step: "gap_follow_up",
        mode: "gap",
        gap: "blockers",
      }),
      kind: "row",
    });
  }
  if (cov.missing.includes("heal")) {
    rows.push({
      id: "heal",
      title: "Something to heal",
      body: "What's hurting or holding you back",
      action: "Add",
      href: onboardingHref({ step: "gap_follow_up", mode: "gap", gap: "heal" }),
      kind: "row",
    });
  }
  // Manifesto-only gap (when start row wouldn't already cover)
  if (
    cov.missing.includes("manifesto") &&
    store.completedAt &&
    !rows.some((r) => r.id === "onboarding_start")
  ) {
    rows.push({
      id: "manifesto",
      title: "Your manifesto",
      body: "From what you've already added",
      action: "Draft",
      href: onboardingHref({
        step: "gap_follow_up",
        mode: "gap",
        gap: "manifesto",
      }),
      kind: "row",
    });
  }

  return rows;
}

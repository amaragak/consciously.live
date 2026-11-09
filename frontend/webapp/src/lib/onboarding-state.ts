/**
 * Durable onboarding state — gate new users, mostly-set-up sheet, gap rows.
 * Merge-never-replace when applying; coverage is derived from live domain stores.
 */

import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import { isDemoIdeateDream } from "@/lib/ideate-demo-seed";
import { loadIdeateManifestoStore } from "@/lib/ideate-manifesto";
import { loadIdeateValuesStore } from "@/lib/ideate-values";
import { activeHealItems, loadHealStore } from "@/lib/heal-store";
import {
  loadIdeateStore,
  subtasksForProject,
} from "@/lib/plan-ideate-store";

export const ONBOARDING_CHANGED = "mm-onboarding-changed";
const STORE_KEY = "mm_onboarding_v1";

export type AccountOnboardingStatus = "completed" | "skipped";

type AccountOnboardingSnap = {
  loaded: boolean;
  status: AccountOnboardingStatus | null;
  at: string | null;
};

let accountSnap: AccountOnboardingSnap = {
  loaded: false,
  status: null,
  at: null,
};

/** Account value, once settings have loaded. Local storage does not decide this. */
export function accountOnboardingReady(): boolean {
  return accountSnap.loaded;
}

export function accountOnboardingStatus(): AccountOnboardingStatus | null {
  return accountSnap.loaded ? accountSnap.status : null;
}

export function setAccountOnboardingSnapshot(next: AccountOnboardingSnap): void {
  accountSnap = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ONBOARDING_CHANGED));
  }
}

function noteAccountDecision(status: AccountOnboardingStatus, at: string): void {
  accountSnap = { loaded: true, status, at };
}

function pushAccountOnboarding(): void {
  void import("@/lib/onboarding-account").then((m) => m.pushOnboardingDecision());
}

export type OnboardingCoverageKey =
  | "goals"
  | "values"
  | "blockers"
  | "heal"
  | "manifesto";

export type OnboardingTalkCoverageKey = "goals" | "values" | "blockers";

export type OnboardingStep =
  | "tell_me"
  | "listening"
  | "coverage"
  | "follow_up"
  | "sorting"
  | "heard"
  | "typed_areas"
  | "typed_values"
  | "typed_voice"
  | "typed_manifesto"
  | "typed_meditation"
  | "skipped"
  | "gap_follow_up"
  | "gap_added"
  | "mostly_fill"
  | "mostly_added";

export type OnboardingMode = "full" | "merge" | "gap" | "mostly";

export type OnboardingStoreV1 = {
  v: 1;
  /** Full flow finished (voice, typed, or skip brief completed). */
  completedAt: string | null;
  /** User tapped Skip for now on Tell me (or equivalent). */
  skippedAt: string | null;
  /** Mostly-set-up sheet dismissed (Fill or Skip). */
  mostlySetUpSeenAt: string | null;
  /** Diagnostics / intentional re-run — forces Tell me in merge mode. */
  forceRerunAt: string | null;
  /** Resume point when leaving mid-flow. */
  resumeStep: OnboardingStep | null;
  resumeMode: OnboardingMode | null;
  /** Single-gap follow-ups from Get set up. */
  gapFocus: OnboardingCoverageKey | null;
  talkTranscript: string;
  talkSeconds: number;
};

function emptyStore(): OnboardingStoreV1 {
  return {
    v: 1,
    completedAt: null,
    skippedAt: null,
    mostlySetUpSeenAt: null,
    forceRerunAt: null,
    resumeStep: null,
    resumeMode: null,
    gapFocus: null,
    talkTranscript: "",
    talkSeconds: 0,
  };
}

function parseStore(raw: string | null): OnboardingStoreV1 {
  if (!raw) return emptyStore();
  try {
    const o = JSON.parse(raw) as Partial<OnboardingStoreV1>;
    if (o?.v !== 1) return emptyStore();
    return {
      ...emptyStore(),
      completedAt: typeof o.completedAt === "string" ? o.completedAt : null,
      skippedAt: typeof o.skippedAt === "string" ? o.skippedAt : null,
      mostlySetUpSeenAt:
        typeof o.mostlySetUpSeenAt === "string" ? o.mostlySetUpSeenAt : null,
      forceRerunAt: typeof o.forceRerunAt === "string" ? o.forceRerunAt : null,
      resumeStep: (o.resumeStep as OnboardingStep) ?? null,
      resumeMode: (o.resumeMode as OnboardingMode) ?? null,
      gapFocus: (o.gapFocus as OnboardingCoverageKey) ?? null,
      talkTranscript:
        typeof o.talkTranscript === "string" ? o.talkTranscript : "",
      talkSeconds:
        typeof o.talkSeconds === "number" && Number.isFinite(o.talkSeconds)
          ? Math.max(0, o.talkSeconds)
          : 0,
    };
  } catch {
    return emptyStore();
  }
}

export function loadOnboardingStore(): OnboardingStoreV1 {
  return parseStore(readAccountLocalStorage(STORE_KEY));
}

export function saveOnboardingStore(
  patch: Partial<OnboardingStoreV1>,
  opts?: { silent?: boolean },
): OnboardingStoreV1 {
  const next = { ...loadOnboardingStore(), ...patch, v: 1 as const };
  writeAccountLocalStorage(STORE_KEY, JSON.stringify(next));
  if (!opts?.silent && typeof window !== "undefined") {
    window.dispatchEvent(new Event(ONBOARDING_CHANGED));
  }
  return next;
}

export type CoverageScores = Record<OnboardingCoverageKey, number>;

export type CoverageSnapshot = {
  scores: CoverageScores;
  covered: Record<OnboardingCoverageKey, boolean>;
  missing: OnboardingCoverageKey[];
  allCovered: boolean;
  essentiallyEmpty: boolean;
};

/** "Enough to build from" mark on talk bars (0–1). */
export const COVERAGE_MARK = 0.55;

export function labelCoverageLevel(score: number): "covered" | "a_little" | "not_yet" {
  if (score >= COVERAGE_MARK) return "covered";
  if (score >= 0.2) return "a_little";
  return "not_yet";
}

export function coverageLevelLabel(
  level: "covered" | "a_little" | "not_yet",
): string {
  if (level === "covered") return "Covered";
  if (level === "a_little") return "A little";
  return "Not yet";
}

/** Live domain coverage — not talk analysis. */
export function detectOnboardingCoverage(): CoverageSnapshot {
  const ideate = loadIdeateStore();
  const dreams = ideate.dreams.filter(
    (d) => !isDemoIdeateDream(d) && !d.completedAt,
  );
  const hasGoal = dreams.some((d) => {
    const dreamText = (d.dreamText || d.firstThought || "").trim();
    if (dreamText) return true;
    return subtasksForProject(ideate, d.id).some((s) => s.title.trim());
  });
  const hasArea = dreams.length > 0;
  const values = loadIdeateValuesStore().values.filter((v) => v.text.trim());
  const blockers = ideate.resistanceEntries.filter((r) => r.text.trim());
  const hasObstacleText = dreams.some((d) => (d.obstacleText || "").trim());
  const heal = activeHealItems(loadHealStore());
  const manifesto = Boolean(loadIdeateManifestoStore().text.trim());

  const covered: Record<OnboardingCoverageKey, boolean> = {
    goals: hasArea && hasGoal,
    values: values.length > 0,
    blockers: blockers.length > 0 || hasObstacleText,
    heal: heal.length > 0,
    manifesto,
  };

  const scores: CoverageScores = {
    goals: covered.goals ? 1 : hasArea ? 0.35 : 0,
    values: covered.values ? 1 : 0,
    blockers: covered.blockers ? 1 : 0,
    heal: covered.heal ? 1 : 0,
    manifesto: covered.manifesto ? 1 : 0,
  };

  const missing = (
    ["goals", "values", "blockers", "heal", "manifesto"] as const
  ).filter((k) => !covered[k]);

  const essentiallyEmpty =
    !hasArea &&
    values.length === 0 &&
    blockers.length === 0 &&
    heal.length === 0 &&
    !manifesto;

  return {
    scores,
    covered,
    missing,
    allCovered: missing.length === 0,
    essentiallyEmpty,
  };
}

const COVERAGE_SENTENCE_NAME: Record<OnboardingCoverageKey, string> = {
  goals: "goals",
  values: "values",
  blockers: "blockers",
  heal: "Heal",
  manifesto: "manifesto",
};

function joinCoverageNames(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/** Names only the uncovered rows, in row order. */
export function missingCoveragePlainWords(
  missing: OnboardingCoverageKey[],
): string {
  const order: OnboardingCoverageKey[] = [
    "goals",
    "values",
    "blockers",
    "heal",
    "manifesto",
  ];
  const present = order.filter((key) => missing.includes(key));
  if (present.length === 0) return "";
  const others = present
    .filter((key) => key !== "manifesto")
    .map((key) => COVERAGE_SENTENCE_NAME[key]);
  const manifesto = present.includes("manifesto");
  if (!manifesto) {
    return `There's nothing yet on ${joinCoverageNames(others)}.`;
  }
  if (others.length === 0) return "There's no manifesto.";
  return `There's nothing yet on ${joinCoverageNames(others)}, and no manifesto.`;
  // Previous copy grouped heal/blockers into a different phrase and could
  // disagree with the Covered rows:
  // if (missing.includes("heal") || missing.includes("blockers")) { ... }
  // return `There's nothing yet on ${bits.slice(0, -1).join(", ")}, and no ${last}.`;
}

export type CoverageCheckDetail = {
  key: OnboardingCoverageKey;
  covered: boolean;
  detail: string;
};

/** Human-readable what each coverage check looked at (for diagnostics / support). */
export function describeOnboardingCoverageCheck(): {
  essentiallyEmpty: boolean;
  allCovered: boolean;
  missing: OnboardingCoverageKey[];
  items: CoverageCheckDetail[];
} {
  const ideate = loadIdeateStore();
  const dreams = ideate.dreams.filter(
    (d) => !isDemoIdeateDream(d) && !d.completedAt,
  );
  const dreamTitles = dreams.map((d) => d.title.trim()).filter(Boolean);
  const withDreamOrGoal = dreams.filter((d) => {
    const dreamText = (d.dreamText || d.firstThought || "").trim();
    if (dreamText) return true;
    return subtasksForProject(ideate, d.id).some((s) => s.title.trim());
  });
  const values = loadIdeateValuesStore().values.filter((v) => v.text.trim());
  const blockers = ideate.resistanceEntries.filter((r) => r.text.trim());
  const obstacleDreams = dreams.filter((d) => (d.obstacleText || "").trim());
  const heal = activeHealItems(loadHealStore());
  const manifestoText = loadIdeateManifestoStore().text.trim();
  const cov = detectOnboardingCoverage();

  return {
    essentiallyEmpty: cov.essentiallyEmpty,
    allCovered: cov.allCovered,
    missing: cov.missing,
    items: [
      {
        key: "goals",
        covered: cov.covered.goals,
        detail: cov.covered.goals
          ? `${withDreamOrGoal.length} life area(s) with dream/goal` +
            (dreamTitles.length ? ` (${dreamTitles.slice(0, 3).join(", ")})` : "")
          : dreams.length
            ? `${dreams.length} life area(s) but no dream text or goals yet`
            : "no non-demo life areas",
      },
      {
        key: "values",
        covered: cov.covered.values,
        detail: values.length
          ? `${values.length} value(s): ${values
              .slice(0, 3)
              .map((v) => v.text)
              .join(", ")}`
          : "no values in ideate values store",
      },
      {
        key: "blockers",
        covered: cov.covered.blockers,
        detail: blockers.length
          ? `${blockers.length} resistance / In the way entr${blockers.length === 1 ? "y" : "ies"}`
          : obstacleDreams.length
            ? `${obstacleDreams.length} life area(s) with obstacle text`
            : "no resistance entries or obstacle text",
      },
      {
        key: "heal",
        covered: cov.covered.heal,
        detail: heal.length
          ? `${heal.length} active Heal item(s): ${heal
              .slice(0, 3)
              .map((h) => h.title)
              .join(", ")}`
          : "no active Heal items",
      },
      {
        key: "manifesto",
        covered: cov.covered.manifesto,
        detail: manifestoText
          ? `manifesto set (${manifestoText.slice(0, 60)}${manifestoText.length > 60 ? "…" : ""})`
          : "no manifesto text",
      },
    ],
  };
}

/**
 * Full Tell me only for accounts with none of the coverage items.
 * Never use a missing onboarded flag alone — existing accounts never had one.
 * Diagnostics forceRerun still opens Tell me in merge mode.
 */
export function shouldGateToOnboarding(opts?: {
  /** Require a finished Ideate cloud pull this session (signed-in). */
  ideatePulled?: boolean;
  signedIn?: boolean;
}): boolean {
  if (opts?.signedIn === false) return false;
  const store = loadOnboardingStore();
  if (store.forceRerunAt) return true;
  // Account value wins. A local completed/skipped flag is not enough on its own.
  // if (store.completedAt || store.skippedAt) return false;
  if (!accountSnap.loaded) return false;
  if (accountSnap.status === "completed" || accountSnap.status === "skipped") {
    return false;
  }
  // Don't mis-route existing accounts while Ideate memory is still empty.
  if (opts?.ideatePulled === false) return false;
  const cov = detectOnboardingCoverage();
  return cov.essentiallyEmpty;
}

/**
 * Existing account with gaps — sheet once per account (durable), not per device.
 * After Skip or finishing Fill the gaps, never again automatically.
 */
export function shouldShowMostlySetUpSheet(): boolean {
  const store = loadOnboardingStore();
  if (store.forceRerunAt) return false;
  // if (store.mostlySetUpSeenAt) return false;
  // if (store.completedAt) return false;
  if (!accountSnap.loaded) return false;
  if (accountSnap.status === "completed" || accountSnap.status === "skipped") {
    return false;
  }
  const cov = detectOnboardingCoverage();
  // Any prior data → not the full Tell me path; show sheet for remaining gaps.
  if (cov.essentiallyEmpty) return false;
  if (cov.allCovered || cov.missing.length === 0) return false;
  return true;
}

/** True when /onboarding should bounce home (has data, not a forced re-run). */
export function shouldBounceFromFullOnboarding(): boolean {
  const store = loadOnboardingStore();
  if (store.forceRerunAt) return false;
  const cov = detectOnboardingCoverage();
  return !cov.essentiallyEmpty;
}

export function markOnboardingCompleted(): void {
  const at = new Date().toISOString();
  noteAccountDecision("completed", at);
  saveOnboardingStore({
    completedAt: at,
    skippedAt: null,
    mostlySetUpSeenAt: at,
    forceRerunAt: null,
    resumeStep: null,
    resumeMode: null,
    gapFocus: null,
  });
  pushAccountOnboarding();
}

export function markOnboardingSkipped(): void {
  const at = new Date().toISOString();
  noteAccountDecision("skipped", at);
  saveOnboardingStore({
    skippedAt: at,
    mostlySetUpSeenAt: at,
    forceRerunAt: null,
    resumeStep: null,
    resumeMode: null,
  });
  pushAccountOnboarding();
}

export function markMostlySetUpSeen(): void {
  const at = new Date().toISOString();
  if (accountSnap.status !== "completed") noteAccountDecision("skipped", at);
  saveOnboardingStore({
    mostlySetUpSeenAt: at,
    skippedAt: loadOnboardingStore().skippedAt ?? at,
  });
  pushAccountOnboarding();
}

/** Diagnostics: re-open Tell me in merge mode. */
export function runOnboardingAgain(): void {
  saveOnboardingStore({
    forceRerunAt: new Date().toISOString(),
    resumeStep: "tell_me",
    resumeMode: "merge",
    gapFocus: null,
    talkTranscript: "",
    talkSeconds: 0,
  });
}

export function clearForceRerun(): void {
  saveOnboardingStore({ forceRerunAt: null });
}

export function onboardingHref(opts?: {
  step?: OnboardingStep;
  mode?: OnboardingMode;
  gap?: OnboardingCoverageKey;
}): string {
  const q = new URLSearchParams();
  if (opts?.step) q.set("step", opts.step);
  if (opts?.mode) q.set("mode", opts.mode);
  if (opts?.gap) q.set("gap", opts.gap);
  const s = q.toString();
  return s ? `/onboarding?${s}` : "/onboarding";
}

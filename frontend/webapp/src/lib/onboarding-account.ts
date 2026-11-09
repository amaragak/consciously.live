/**
 * Onboarding completion lives on the account (user settings), not the device.
 * Local flags are a cache. After sign-in the account value wins, and a local
 * flag is copied up once when the account has never stored one.
 */

import { getMedimadeSessionEmail, getMedimadeSessionJwt } from "@/lib/auth-session";
import { wasIdeateStorePulledThisSession } from "@/lib/ideate-cloud";
import { getMedimadeApiBase } from "@/lib/medimade-api";
import { patchUserSettings } from "@/lib/settings-api";
import {
  accountOnboardingReady,
  accountOnboardingStatus,
  detectOnboardingCoverage,
  loadOnboardingStore,
  markOnboardingCompleted,
  saveOnboardingStore,
  setAccountOnboardingSnapshot,
  type AccountOnboardingStatus,
} from "@/lib/onboarding-state";

let inflight: Promise<void> | null = null;
let loadedFor = "";

export function ensureAccountOnboarding(): Promise<void> {
  const email = getMedimadeSessionEmail()?.trim().toLowerCase() || "";
  const jwt = getMedimadeSessionJwt();
  if (!email || !jwt || !getMedimadeApiBase()) {
    if (!accountOnboardingReady()) {
      setAccountOnboardingSnapshot({ loaded: true, status: null, at: null });
    }
    return Promise.resolve();
  }
  if (loadedFor === email && accountOnboardingReady()) return Promise.resolve();
  if (inflight) return inflight;
  inflight = loadAccount(email).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function loadAccount(email: string): Promise<void> {
  try {
    const { fetchUserSettings } = await import("@/lib/settings-api");
    const { settings } = await fetchUserSettings();
    const remote = settings.onboarding;
    if (remote.status && remote.at) {
      mirrorAccountToLocal(remote.status, remote.at);
      setAccountOnboardingSnapshot({
        loaded: true,
        status: remote.status,
        at: remote.at,
      });
      loadedFor = email;
      return;
    }
    const local = loadOnboardingStore();
    const migrated = local.completedAt
      ? { status: "completed" as const, at: local.completedAt }
      : local.skippedAt
        ? { status: "skipped" as const, at: local.skippedAt }
        : local.mostlySetUpSeenAt
          ? { status: "skipped" as const, at: local.mostlySetUpSeenAt }
          : null;
    if (migrated) {
      try {
        await patchUserSettings({ onboarding: migrated });
      } catch (err) {
        console.error("[onboarding] could not save this device's flag to the account", err);
      }
      setAccountOnboardingSnapshot({ loaded: true, ...migrated });
      loadedFor = email;
      return;
    }
    setAccountOnboardingSnapshot({ loaded: true, status: null, at: null });
    loadedFor = email;
  } catch (err) {
    console.error("[onboarding] account state failed to load", err);
  }
}

function mirrorAccountToLocal(status: AccountOnboardingStatus, at: string): void {
  if (status === "completed") {
    saveOnboardingStore(
      { completedAt: at, skippedAt: null, mostlySetUpSeenAt: at },
      { silent: true },
    );
    return;
  }
  saveOnboardingStore(
    { completedAt: null, skippedAt: at, mostlySetUpSeenAt: at },
    { silent: true },
  );
}

/** Write the local decision up to the account. No-op until something was recorded. */
export async function pushOnboardingDecision(): Promise<void> {
  const local = loadOnboardingStore();
  const decision = local.completedAt
    ? { status: "completed" as const, at: local.completedAt }
    : local.skippedAt
      ? { status: "skipped" as const, at: local.skippedAt }
      : local.mostlySetUpSeenAt
        ? { status: "skipped" as const, at: local.mostlySetUpSeenAt }
        : null;
  if (!decision) return;
  if (!getMedimadeSessionJwt() || !getMedimadeApiBase()) return;
  setAccountOnboardingSnapshot({ loaded: true, ...decision });
  try {
    await patchUserSettings({ onboarding: decision });
  } catch (err) {
    console.error("[onboarding] could not save account state", err);
  }
}

/**
 * Call only after `ensureAccountOnboarding`. Waits for the Ideate pull so
 * coverage is the account's data, not an empty device cache.
 */
export function settleAutomaticOnboarding(opts: {
  signedIn: boolean;
}): "loading" | "full" | "sheet" | "none" {
  if (!opts.signedIn) return "none";
  if (!accountOnboardingReady()) return "loading";
  if (!wasIdeateStorePulledThisSession()) return "loading";
  if (loadOnboardingStore().forceRerunAt) return "full";
  if (accountOnboardingStatus()) return "none";
  const cov = detectOnboardingCoverage();
  if (cov.essentiallyEmpty) return "full";
  if (cov.allCovered || cov.missing.length === 0) {
    markOnboardingCompleted();
    return "none";
  }
  return "sheet";
}

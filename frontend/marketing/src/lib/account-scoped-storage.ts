/**
 * Account-scoped Web Storage helpers.
 *
 * User data keys must use `accountScopedKey(base)` so accounts on the same
 * browser profile cannot read each other's local caches.
 * Display-only prefs (theme, layout chrome) stay on unscoped base keys.
 */

import { getMedimadeSessionEmail } from "@/lib/auth-session";

/** Signed-in email (lowercased) or `_anon` when signed out. */
export function accountStorageScope(): string {
  if (typeof window === "undefined") return "_anon";
  return getMedimadeSessionEmail()?.trim().toLowerCase() || "_anon";
}

/** `mm_foo_v1` → `mm_foo_v1:user@x.com` (or `…:_anon`). */
export function accountScopedKey(
  baseKey: string,
  scope = accountStorageScope(),
): string {
  return `${baseKey}:${scope}`;
}

/**
 * Read a string from the current account's scoped key.
 * Never falls back to the legacy unscoped key for signed-in users
 * (that would re-leak the previous account's data).
 * For `_anon` only, falls back to the bare `baseKey` once so older guest
 * data still loads until rewritten.
 */
export function readAccountLocalStorage(baseKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const scoped = window.localStorage.getItem(accountScopedKey(baseKey));
    if (scoped != null) return scoped;
    if (accountStorageScope() === "_anon") {
      return window.localStorage.getItem(baseKey);
    }
    return null;
  } catch {
    return null;
  }
}

export function writeAccountLocalStorage(
  baseKey: string,
  value: string,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(accountScopedKey(baseKey), value);
  } catch {
    /* quota */
  }
}

export function removeAccountLocalStorage(baseKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(accountScopedKey(baseKey));
  } catch {
    /* */
  }
}

export function readAccountSessionStorage(baseKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const scoped = window.sessionStorage.getItem(accountScopedKey(baseKey));
    if (scoped != null) return scoped;
    if (accountStorageScope() === "_anon") {
      return window.sessionStorage.getItem(baseKey);
    }
    return null;
  } catch {
    return null;
  }
}

export function writeAccountSessionStorage(
  baseKey: string,
  value: string,
): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(accountScopedKey(baseKey), value);
  } catch {
    /* quota */
  }
}

export function removeAccountSessionStorage(baseKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(accountScopedKey(baseKey));
  } catch {
    /* */
  }
}

/** True when a storage event key belongs to this base (scoped or legacy). */
export function isAccountStorageEventKey(
  eventKey: string | null,
  baseKey: string,
): boolean {
  if (!eventKey) return false;
  return eventKey === baseKey || eventKey.startsWith(`${baseKey}:`);
}

/**
 * Consciously public usernames.
 * Defaults are random 11-digit numbers (never shown publicly).
 * Chosen names are 3–30 chars: [a-z0-9] with single internal hyphens.
 */

import { randomInt } from "crypto";
import Filter from "bad-words";
import { RESERVED_USERNAMES } from "./reserved-usernames";

export const USERNAME_PK = "USERNAME";
export const HOUSE_USERNAME = "consciously";
export const HOUSE_DISPLAY_NAME = "Consciously";
/** Synthetic email for the system house account (not a login). */
export const HOUSE_EMAIL = "consciously@system.consciously.live";

/** 3–30 chars, lowercase alnum + single hyphens, not starting/ending with hyphen. */
const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
const ALL_DIGIT_RE = /^\d+$/;
const CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const UNAVAILABLE = "That username isn't available.";

const reservedSet = new Set<string>([...RESERVED_USERNAMES, HOUSE_USERNAME]);
const profanity = new Filter();

function loadReserved(): Set<string> {
  return reservedSet;
}

/** Strip separators + leetspeak for "consciously" containment checks. */
export function normalizeUsernameForBanCheck(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[-_.]/g, "")
    .replace(/0/g, "o")
    .replace(/1/g, "l")
    .replace(/3/g, "e")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/@/g, "a");
}

export function isAllDigitUsername(name: string): boolean {
  return ALL_DIGIT_RE.test(name);
}

export function newDefaultUsername(): string {
  // 11 digits, leading digit 1–9 so it isn't treated as octal-ish elsewhere.
  let s = String(randomInt(1, 10));
  for (let i = 0; i < 10; i += 1) s += String(randomInt(0, 10));
  return s;
}

export function slugifyUsernameCandidate(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 30)
    .replace(/-+$/g, "");
}

/** Prefill from display name for the share-sheet / Settings picker. */
export function usernamePrefillFromDisplayName(
  displayName: string | null | undefined,
): string {
  const raw = (displayName ?? "").trim();
  if (!raw) return "";
  const parts = raw.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const tryFirst = slugifyUsernameCandidate(first);
  if (tryFirst.length >= 3) return tryFirst.slice(0, 30);
  const both = slugifyUsernameCandidate(`${first}${last}`);
  return both.slice(0, 30);
}

export type UsernameValidation =
  | { ok: true; username: string }
  | { ok: false; error: string };

/**
 * Validate a chosen (non-default) username.
 * Rejects all-digit names — those are reserved for auto-assigned defaults.
 * Admins may pass `allowReserved` to claim reserved / house-brand names
 * (still subject to uniqueness in the registry).
 */
export function validateChosenUsername(
  raw: unknown,
  opts?: { allowReserved?: boolean },
): UsernameValidation {
  if (typeof raw !== "string") {
    return { ok: false, error: UNAVAILABLE };
  }
  const username = raw.trim().toLowerCase();
  if (username.length < 3 || username.length > 30) {
    return { ok: false, error: UNAVAILABLE };
  }
  if (!USERNAME_RE.test(username) || username.includes("--")) {
    return { ok: false, error: UNAVAILABLE };
  }
  if (isAllDigitUsername(username)) {
    return { ok: false, error: UNAVAILABLE };
  }
  const allowReserved = opts?.allowReserved === true;
  if (!allowReserved && loadReserved().has(username)) {
    return { ok: false, error: UNAVAILABLE };
  }
  const banNorm = normalizeUsernameForBanCheck(username);
  if (!allowReserved && banNorm.includes("consciously")) {
    return { ok: false, error: UNAVAILABLE };
  }
  try {
    if (profanity.isProfane(username) || profanity.isProfane(banNorm)) {
      return { ok: false, error: UNAVAILABLE };
    }
  } catch {
    /* filter edge cases — still reject reserved etc. */
  }
  return { ok: true, username };
}

export function usernameChangeAllowed(changedAtIso: string | null | undefined): {
  ok: boolean;
  nextAllowedAt: string | null;
} {
  if (!changedAtIso) return { ok: true, nextAllowedAt: null };
  const t = Date.parse(changedAtIso);
  if (!Number.isFinite(t)) return { ok: true, nextAllowedAt: null };
  const next = t + CHANGE_COOLDOWN_MS;
  if (Date.now() >= next) return { ok: true, nextAllowedAt: null };
  return { ok: false, nextAllowedAt: new Date(next).toISOString() };
}

export function newListenLinkToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 5; i += 1) {
    out += alphabet[randomInt(0, alphabet.length)]!;
  }
  return out;
}

export function listenPublicPath(params: {
  username: string;
  pathSlug: string;
  listed: boolean;
  linkToken: string | null;
}): string {
  const u = encodeURIComponent(params.username);
  const s = encodeURIComponent(params.pathSlug);
  if (params.listed || !params.linkToken) {
    return `/listen/${u}/${s}`;
  }
  return `/listen/${u}/${s}-${encodeURIComponent(params.linkToken)}`;
}

export function listenPublicUrl(params: {
  username: string;
  pathSlug: string;
  listed: boolean;
  linkToken: string | null;
}): string {
  return `https://consciously.live${listenPublicPath(params)}`;
}

export { UNAVAILABLE as USERNAME_UNAVAILABLE_MESSAGE };

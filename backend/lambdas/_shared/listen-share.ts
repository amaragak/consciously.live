/**
 * Consciously Listen — public share snapshot stored on a meditation row.
 * Public pages only expose fields from listenShare (+ audio/cover), never the
 * full library row.
 */

import { randomBytes } from "crypto";
import { createPromptFromProvenance } from "./meditation-cover";

export const LISTEN_SLUG_PK = "LISTEN_SLUG";
export const LISTEN_LISTED_PK = "1";

export type ListenShareKind = "meditation" | "story";

export type ListenShareSnapshot = {
  kind: ListenShareKind;
  title: string;
  description: string;
  /** Empty string = share without a name. */
  shownAs: string;
  showBrief: boolean;
  /** Brief text captured at share time (shown only when showBrief). */
  brief: string | null;
  listed: boolean;
  isExample: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListenPublicItem = {
  slug: string;
  kind: ListenShareKind;
  title: string;
  description: string;
  shownAs: string | null;
  showBrief: boolean;
  brief: string | null;
  listed: boolean;
  isExample: boolean;
  style: string | null;
  durationSec: number | null;
  audioUrl: string | null;
  coverImageUrl: string | null;
  storyText: string | null;
};

export function slugifyTitle(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  return base || "listen";
}

export function newSlugSuffix(): string {
  return randomBytes(2).toString("hex");
}

export function parseListenShare(raw: unknown): ListenShareSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  if (!title) return null;
  const kind: ListenShareKind = o.kind === "story" ? "story" : "meditation";
  const description =
    typeof o.description === "string" ? o.description.trim() : "";
  const shownAs = typeof o.shownAs === "string" ? o.shownAs.trim() : "";
  const brief =
    typeof o.brief === "string" && o.brief.trim() ? o.brief.trim() : null;
  const createdAt =
    typeof o.createdAt === "string" && o.createdAt.trim()
      ? o.createdAt.trim()
      : new Date().toISOString();
  const updatedAt =
    typeof o.updatedAt === "string" && o.updatedAt.trim()
      ? o.updatedAt.trim()
      : createdAt;
  return {
    kind,
    title,
    description,
    shownAs,
    showBrief: o.showBrief === true,
    brief,
    listed: o.listed === true && kind !== "story",
    isExample: o.isExample === true,
    createdAt,
    updatedAt,
  };
}

export function briefFromMeditationRow(row: Record<string, unknown>): string | null {
  return createPromptFromProvenance(
    row.creationProvenance as Record<string, unknown> | null | undefined,
  );
}

export function styleFromMeditationRow(
  row: Record<string, unknown>,
): string | null {
  const style =
    typeof row.meditationStyle === "string" && row.meditationStyle.trim()
      ? row.meditationStyle.trim()
      : typeof row.meditationType === "string" && row.meditationType.trim()
        ? row.meditationType.trim()
        : null;
  return style;
}

export function coverUrlFromRow(
  row: Record<string, unknown>,
  cfDomain: string | undefined,
): string | null {
  if (!cfDomain) return null;
  const key =
    typeof row.coverImageKey === "string" && row.coverImageKey.trim()
      ? row.coverImageKey.trim()
      : "";
  return key ? `https://${cfDomain}/${key}` : null;
}

/**
 * Manifesto print view — pure helpers (view preference, Roman numerals, print
 * sizing rules, "Words to keep" selection). No React, no storage side effects
 * beyond the remembered view choice.
 */

import {
  readAccountLocalStorage,
  writeAccountLocalStorage,
} from "@/lib/account-scoped-storage";
import type { IdeateQuote } from "@/lib/ideate-quotes";
import type { IdeateReflectionQuestion } from "@/lib/ideate-reflection-questions";
import { visionItemHasImage, type VisionBoardItem } from "@/lib/ideate-vision-board";

/* ---------------------------------------------------------------- view */

export type ManifestoView = "edit" | "manifesto" | "story";

const VIEW_LS_KEY = "mm_manifesto_view_v1";

/** Remembered tab; Manifesto until the user picks Edit or Story. */
export function readManifestoViewPref(): ManifestoView {
  const raw = readAccountLocalStorage(VIEW_LS_KEY);
  if (raw === "edit") return "edit";
  if (raw === "story") return "story";
  return "manifesto";
}

export function writeManifestoViewPref(view: ManifestoView): void {
  writeAccountLocalStorage(VIEW_LS_KEY, view);
}

/**
 * Singular possessive. A person’s name takes ’s even when it already ends in s:
 * Alex → Alex’s, Davis → Davis’s. Davis’ would read as a plural family.
 */
export function namePossessive(name: string): string {
  const n = name.trim();
  if (!n) return "";
  return `${n}’s`;
}

/** Print eyebrow. Alex → “Alex’s manifesto”; no name → “My manifesto”. */
export function manifestoEyebrow(firstName: string): string {
  const n = firstName.trim();
  if (!n) return "My manifesto";
  return `${namePossessive(n)} manifesto`;
}

export type ManifestoPageMode = "paged" | "pageless";
export type ManifestoPageSize = "a" | "letter" | "tabloid" | "phone";

export type ManifestoPageSettings = {
  /** Larger than phone-width. */
  modeWide: ManifestoPageMode;
  /** Below `sm`. */
  modeNarrow: ManifestoPageMode;
  /** `null` until the user picks one; then the locale default applies. */
  size: ManifestoPageSize | null;
};

export const MANIFESTO_PAGE_SIZES: readonly ManifestoPageSize[] = [
  "a",
  "letter",
  "tabloid",
  "phone",
];

export function isUsOrCaLocale(locale?: string): boolean {
  const tag = (locale ?? (typeof navigator !== "undefined" ? navigator.language : "") ?? "")
    .toUpperCase();
  return tag.endsWith("-US") || tag.endsWith("-CA") || tag === "US" || tag === "CA";
}

/** Letter in the US and Canada; A4 / A3 everywhere else. */
export function defaultManifestoPageSize(locale?: string): ManifestoPageSize {
  return isUsOrCaLocale(locale) ? "letter" : "a";
}

export function resolveManifestoPageSize(
  size: ManifestoPageSize | null | undefined,
  locale?: string,
): ManifestoPageSize {
  return size ?? defaultManifestoPageSize(locale);
}

export type ManifestoPageSpec = {
  key: ManifestoPageSize;
  label: string;
  sub: string;
  logicalW: number;
  logicalH: number;
  exportW: number;
  exportH: number;
};

export const MANIFESTO_PAGE_SPEC: Record<ManifestoPageSize, ManifestoPageSpec> = {
  a: {
    key: "a",
    label: "A4 / A3",
    sub: "Standard",
    logicalW: 1000,
    logicalH: 1414,
    exportW: 3508,
    exportH: 4961,
  },
  letter: {
    key: "letter",
    label: "Letter",
    sub: "8.5 × 11",
    logicalW: 1000,
    logicalH: 1294,
    exportW: 2550,
    exportH: 3300,
  },
  tabloid: {
    key: "tabloid",
    label: "Tabloid",
    sub: "11 × 17",
    logicalW: 1000,
    logicalH: 1545,
    exportW: 3300,
    exportH: 5100,
  },
  phone: {
    key: "phone",
    label: "Phone",
    sub: "Wallpaper",
    logicalW: 540,
    logicalH: 1170,
    exportW: 1290,
    exportH: 2796,
  },
};

/** Tiles shown before “More sizes”. */
export function primaryPageSizes(locale?: string): ManifestoPageSize[] {
  return isUsOrCaLocale(locale) ? ["letter", "tabloid", "phone"] : ["a", "phone"];
}

export type PosterFrame = {
  width: number;
  /** Set for a fixed page. Omit for a sheet that grows with its content. */
  height?: number;
  padding: string;
  chapterTop: number;
  chapterGap: number;
  wordsTop: number;
  statementMax: number;
  pinFooter: boolean;
  footerGap: number;
};

export const POSTER_FRAME_A: PosterFrame = {
  width: 1000,
  height: 1414,
  padding: "58px 76px 44px",
  chapterTop: 26,
  chapterGap: 18,
  wordsTop: 30,
  statementMax: 720,
  pinFooter: true,
  footerGap: 22,
};

export function posterFrameFor(
  mode: ManifestoPageMode,
  size: ManifestoPageSize,
): PosterFrame {
  if (mode === "pageless") {
    return {
      width: 1000,
      padding: "58px 76px 44px",
      chapterTop: 26,
      chapterGap: 18,
      wordsTop: 30,
      statementMax: 820,
      pinFooter: false,
      footerGap: 40,
    };
  }
  if (size === "letter") {
    return {
      width: 1000,
      height: 1294,
      padding: "50px 76px 38px",
      chapterTop: 18,
      chapterGap: 10,
      wordsTop: 18,
      statementMax: 720,
      pinFooter: true,
      footerGap: 22,
    };
  }
  if (size === "tabloid") {
    return {
      width: 1000,
      height: 1545,
      padding: "70px 76px 54px",
      chapterTop: 40,
      chapterGap: 34,
      wordsTop: 30,
      statementMax: 720,
      pinFooter: true,
      footerGap: 22,
    };
  }
  return POSTER_FRAME_A;
}

/** Gap between sheets when a paged manifesto runs onto another page. */
export const MANIFESTO_PAGE_GAP = 32;

/**
 * Pack `[data-page-block]` children into pages of `available` px.
 * A block that fits on a fresh page moves there whole. A block taller than
 * a page splits into its own `[data-page-block]` children.
 */
export function packManifestoPages(
  flow: HTMLElement,
  available: number,
): { pages: string[][]; overflows: boolean } {
  const pages: string[][] = [];
  let cur: string[] = [];
  let used = 0;
  let overflows = false;
  const room = Math.max(0, available);

  const leadHeight = (el: HTMLElement) => {
    const lead = el.querySelector(":scope > [data-page-lead]");
    return lead instanceof HTMLElement ? lead.offsetHeight : 0;
  };
  const fullHeight = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    return (
      el.offsetHeight +
      (parseFloat(style.marginTop) || 0) +
      (parseFloat(style.marginBottom) || 0)
    );
  };
  const heightAt = (el: HTMLElement, atTop: boolean) => {
    const full = fullHeight(el);
    return atTop ? Math.max(0, full - leadHeight(el)) : full;
  };
  const kids = (el: HTMLElement) =>
    [...el.querySelectorAll(":scope > [data-page-block]")].filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );

  function commit() {
    if (cur.length) pages.push(cur);
    cur = [];
    used = 0;
  }

  function place(el: HTMLElement) {
    const key = el.dataset.pageBlock ?? "";
    if (!key) return;
    const atTop = cur.length === 0;
    const h = heightAt(el, atTop);
    const subs = kids(el);
    if (h <= room - used + 1) {
      cur.push(key);
      used += h;
      return;
    }
    if (!atTop && heightAt(el, true) <= room + 1) {
      commit();
      cur.push(key);
      used += heightAt(el, true);
      return;
    }
    if (subs.length) {
      placeList(subs);
      return;
    }
    overflows = true;
    if (!atTop) commit();
    cur.push(key);
    used += heightAt(el, true);
  }

  function placeList(els: HTMLElement[]) {
    for (let i = 0; i < els.length; i++) {
      const el = els[i]!;
      const next = el.dataset.keepWithNext != null ? els[i + 1] : undefined;
      if (next && cur.length > 0) {
        const headH = heightAt(el, false);
        const follow = Math.min(fullHeight(next), 120);
        if (used + headH + follow > room + 1) commit();
      }
      place(el);
    }
  }

  placeList(kids(flow));
  commit();
  return { pages: pages.length ? pages : [[]], overflows };
}

/** `/manifest/my` (Edit), `?view=manifesto`, or `?view=story`. */
export function manifestoViewHref(view: ManifestoView): string {
  if (view === "manifesto") return "/manifest/my?view=manifesto";
  if (view === "story") return "/manifest/my?view=story";
  return "/manifest/my";
}

/* ------------------------------------------------------------- numerals */

const ROMAN: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function romanNumeral(n: number): string {
  let rest = Math.max(1, Math.floor(n));
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

/* ---------------------------------------------------------------- name */

/** First word of the account display name (falls back to the email local part). */
export function firstNameFromAccount(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const fromName = (displayName ?? "").trim().split(/\s+/)[0] ?? "";
  if (fromName) return fromName;
  const local = (email ?? "").trim().split("@")[0] ?? "";
  const word = local.split(/[._-]+/)[0] ?? "";
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "";
}

/* -------------------------------------------------------- print layout */

/** Design width of the desktop print; height grows with content (pageless). */
export const PRINT_DESIGN_WIDTH = 1000;

/** Fixed print tile size — longer manifesto = longer page, not smaller tiles. */
export const PRINT_BIG = 166;
/** @deprecated use PRINT_BIG */
export const PRINT_BIG_START = PRINT_BIG;

/** Tilts per image, by row parity (row I, III… vs II, IV…). */
export const PRINT_TILTS_ODD_ROW = [-1.4, 1.2, -0.8] as const;
export const PRINT_TILTS_EVEN_ROW = [1.2, -1.0, 0.9] as const;
export const PRINT_TILTS_MOBILE = [-1.6, 1.3, -0.9] as const;

export type PrintTile = { size: number; tilt: number };

export type PrintTileLayout =
  | { kind: "none" }
  | { kind: "row"; tiles: PrintTile[] }
  | { kind: "stack"; main: PrintTile; side: [PrintTile, PrintTile] };

/** Desktop sizing: 1 → BIG; 2 → two at BIG×0.78; 3+ → BIG + two stacked halves. */
export function desktopTileLayout(
  count: number,
  big: number,
  rowIndex: number,
): PrintTileLayout {
  const tilts = rowIndex % 2 === 0 ? PRINT_TILTS_ODD_ROW : PRINT_TILTS_EVEN_ROW;
  if (count <= 0) return { kind: "none" };
  if (count === 1) {
    return { kind: "row", tiles: [{ size: big, tilt: tilts[0] }] };
  }
  if (count === 2) {
    const size = Math.round(big * 0.78);
    return {
      kind: "row",
      tiles: [
        { size, tilt: tilts[0] },
        { size, tilt: tilts[1] },
      ],
    };
  }
  const half = Math.floor((big - 10) / 2);
  return {
    kind: "stack",
    main: { size: big, tilt: tilts[0] },
    side: [
      { size: half, tilt: tilts[1] },
      { size: half, tilt: tilts[2] },
    ],
  };
}

/** Mobile sizing: row of up to 3 squares, each (inner − gaps) / n; one image = 180. */
export function mobileTileSizes(count: number, innerWidth: number): PrintTile[] {
  const n = Math.min(3, count);
  if (n <= 0) return [];
  if (n === 1) return [{ size: 180, tilt: PRINT_TILTS_MOBILE[0] }];
  const size = Math.floor((innerWidth - 10 * (n - 1)) / n);
  return Array.from({ length: n }, (_, i) => ({
    size,
    tilt: PRINT_TILTS_MOBILE[i] ?? 0,
  }));
}

/* ----------------------------------------------------- Words to keep */

/** Accent-tint strength (%) mixed into the paper — four subtle variations, cycling. */
export const NOTE_TINT_PERCENT = [14, 20, 10, 17] as const;
export const NOTE_ROTATIONS = [-2.2, 1.6, -1.1, 2.0] as const;

export type PrintNote =
  | {
      kind: "quote";
      id: string;
      text: string;
      source: string | null;
      at: number;
    }
  | {
      kind: "answer";
      id: string;
      question: string;
      answer: string;
      at: number;
    };

function ms(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/** Quotes + answered questions that aren't hidden, newest first. */
export function allPrintNotes(
  quotes: readonly IdeateQuote[],
  questions: readonly IdeateReflectionQuestion[],
): PrintNote[] {
  const notes: PrintNote[] = [];
  for (const q of quotes) {
    if (q.hiddenOnPrint || !q.text.trim()) continue;
    notes.push({
      kind: "quote",
      id: q.id,
      text: q.text.trim(),
      source: q.attribution?.trim() || null,
      at: ms(q.createdAt),
    });
  }
  for (const q of questions) {
    if (q.hiddenOnPrint || !q.answer.trim()) continue;
    notes.push({
      kind: "answer",
      id: q.id,
      question: q.text.trim(),
      answer: q.answer.trim(),
      at: ms(q.updatedAt),
    });
  }
  return notes.sort((a, b) => b.at - a.at);
}

/** All printable notes (pageless — no cap). */
export function pickPrintNotes(
  quotes: readonly IdeateQuote[],
  questions: readonly IdeateReflectionQuestion[],
): PrintNote[] {
  return allPrintNotes(quotes, questions);
}

/* -------------------------------------------------------- area images */

/** Image-bearing vision items tagged to a life area, in board order. */
export function visionItemsForLifeArea(
  items: readonly VisionBoardItem[],
  lifeAreaId: string,
): VisionBoardItem[] {
  return items.filter(
    (i) => visionItemHasImage(i) && (i.lifeAreaIds ?? []).includes(lifeAreaId),
  );
}

/* ------------------------------------------------------------- paper */

/** Faint paper grain — inline SVG feTurbulence at very low alpha. */
export const PAPER_GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20width%3D%27160%27%20height%3D%27160%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%27.9%27%20numOctaves%3D%272%27%20stitchTiles%3D%27stitch%27/%3E%3CfeColorMatrix%20values%3D%270%200%200%200%200.35%20%200%200%200%200%200.28%20%200%200%200%200%200.18%20%200%200%200%200.07%200%27/%3E%3C/filter%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20filter%3D%27url%28%23n%29%27/%3E%3C/svg%3E\")";

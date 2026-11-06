/**
 * Remember main-shell scroll per tab landing route for the JS session.
 */

const scrollByPath = new Map<string, number>();

function mainEl(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("main");
}

/** Normalize to the tab root (e.g. /manifest/story → /manifest). */
export function tabScrollKey(pathname: string): string {
  const p = pathname.split("?")[0] || "/";
  if (p === "/" || p === "") return "/";
  const parts = p.split("/").filter(Boolean);
  if (parts[0] === "manifest") return "/manifest";
  if (parts[0] === "meditate") return "/meditate";
  if (parts[0] === "journal") return "/journal";
  if (parts[0] === "heal") return "/heal";
  if (parts[0] === "focus") return "/focus";
  return `/${parts[0]}`;
}

export function saveTabScroll(pathname: string): void {
  const main = mainEl();
  if (!main) return;
  scrollByPath.set(tabScrollKey(pathname), main.scrollTop);
}

export function restoreTabScroll(pathname: string): void {
  const main = mainEl();
  if (!main) return;
  const top = scrollByPath.get(tabScrollKey(pathname));
  if (top == null) return;
  main.scrollTop = top;
}

/** Drop a remembered overview scroll (header / tab nav wants the top). */
export function clearTabScroll(pathname: string): void {
  scrollByPath.delete(tabScrollKey(pathname));
}

/**
 * Scroll the app shell (and nested page scrollers) to the top.
 * Call after header / nav clicks so landing pages don't stay mid-scroll.
 */
export function scrollAppToTop(opts?: {
  behavior?: ScrollBehavior;
  /** Clear remembered tab overview scroll for this path before restoring. */
  clearPath?: string;
}): void {
  if (typeof document === "undefined") return;
  if (opts?.clearPath) clearTabScroll(opts.clearPath);
  const behavior = opts?.behavior ?? "auto";
  try {
    window.scrollTo({ top: 0, left: 0, behavior });
  } catch {
    window.scrollTo(0, 0);
  }
  const main = mainEl();
  if (!main) return;
  try {
    main.scrollTo({ top: 0, left: 0, behavior });
  } catch {
    main.scrollTop = 0;
  }
  // Journal / immersive pages keep their own overflow; reset those too.
  main.querySelectorAll<HTMLElement>("*").forEach((el) => {
    if (el.scrollTop > 0) el.scrollTop = 0;
  });
}

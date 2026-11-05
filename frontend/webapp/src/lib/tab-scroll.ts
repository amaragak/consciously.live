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

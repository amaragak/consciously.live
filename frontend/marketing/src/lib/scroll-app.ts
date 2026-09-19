/**
 * Marketing / app chrome scrolls inside `<main overflow-y-auto>`, not `window`.
 */
export function scrollAppToTop(behavior: ScrollBehavior = "auto"): void {
  if (typeof document === "undefined") return;
  const main = document.querySelector("main");
  if (main instanceof HTMLElement) {
    main.scrollTo({ top: 0, left: 0, behavior });
  }
  window.scrollTo({ top: 0, left: 0, behavior });
}

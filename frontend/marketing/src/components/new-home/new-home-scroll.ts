const BANDS = ["meditate", "manifest", "journal", "heal", "focus"] as const;

function scrollParent(el: HTMLElement): HTMLElement {
  const main = el.closest("main");
  if (main instanceof HTMLElement && main.scrollHeight > main.clientHeight + 1) {
    return main;
  }
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

export function pageScroller(): HTMLElement {
  const root = document.querySelector(".new-home");
  if (root instanceof HTMLElement) return scrollParent(root);
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

/** Distance from the scrollport top to the bottom of the sticky header. */
function headerClearance(scroller: HTMLElement): number {
  const header = document.querySelector(".new-home-nav-bar");
  if (!(header instanceof HTMLElement)) return 60;
  return Math.max(0, header.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top);
}

function flushScrollTop(el: HTMLElement, scroller: HTMLElement) {
  return Math.max(
    0,
    el.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      headerClearance(scroller),
  );
}

let scrollFrame = 0;

function animateScroll(scroller: HTMLElement, destination: () => number) {
  cancelAnimationFrame(scrollFrame);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    scroller.scrollTop = destination();
    return;
  }
  const start = scroller.scrollTop;
  const distance = Math.abs(destination() - start);
  const duration = Math.min(780, Math.max(320, distance * 0.28));
  const started = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - t) ** 3;
    const latest = destination();
    scroller.scrollTop = start + (latest - start) * eased;
    if (t < 1) scrollFrame = requestAnimationFrame(step);
    else scroller.scrollTop = destination();
  };
  scrollFrame = requestAnimationFrame(step);
}

function scrollElementFlush(el: HTMLElement) {
  const scroller = scrollParent(el);
  animateScroll(scroller, () => flushScrollTop(el, scroller));
}

export function scrollToTop() {
  animateScroll(pageScroller(), () => 0);
}

export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  scrollElementFlush(el);
}

/** Next band, with its top edge against the bottom of the header. */
export function scrollToNextBand() {
  const nodes = [
    ...BANDS.map((id) => document.getElementById(id)),
    document.querySelector(".new-home-close"),
  ].filter((el): el is HTMLElement => el instanceof HTMLElement);
  if (!nodes.length) return;
  const scroller = scrollParent(nodes[0]);
  const line = scroller.getBoundingClientRect().top + headerClearance(scroller);
  // A band still counts as the current step if its top is only slightly
  // below the header, so one click always advances instead of finishing
  // the same strip.
  const reached = line + 72;
  let current = -1;
  nodes.forEach((el, index) => {
    if (el.getBoundingClientRect().top <= reached) current = index;
  });
  const next = nodes[current + 1];
  if (!next) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: reduce ? "auto" : "smooth",
    });
    return;
  }
  scrollElementFlush(next);
}

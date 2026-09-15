/**
 * When a bottom nav footer is visible (e.g. Create flow), the chat FAB lifts
 * by this many CSS pixels so it sits above the bar.
 */

let footerInsetPx = 0;
const listeners = new Set<() => void>();

export function setChatFabFooterInset(px: number): void {
  const next = Math.max(0, Math.round(px));
  if (footerInsetPx === next) return;
  footerInsetPx = next;
  listeners.forEach((l) => l());
}

export function getChatFabFooterInset(): number {
  return footerInsetPx;
}

export function subscribeChatFabFooterInset(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

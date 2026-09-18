/**
 * When Create Meditation’s main pane is the chat UI, the floating FAB hides
 * so we don’t stack two chats. Other Create steps (chooser / audio) keep the FAB.
 *
 * After the user has been in Create’s chat pane, the next FAB open starts a
 * new Consciously Chat unless a thread was updated after that Create session
 * (e.g. they used full Chat in between).
 */

let createMainChatVisible = false;
/** ms timestamp when Create chat pane was last shown; 0 = none. */
let createChatShownAtMs = 0;
const listeners = new Set<() => void>();

export function setCreateMainChatVisible(visible: boolean): void {
  if (visible) {
    createChatShownAtMs = Date.now();
  }
  if (createMainChatVisible === visible) return;
  createMainChatVisible = visible;
  listeners.forEach((l) => l());
}

export function isCreateMainChatVisible(): boolean {
  return createMainChatVisible;
}

/**
 * If Create Meditation chat was shown, return that timestamp and clear it.
 * FAB uses this to avoid resuming a pre-Create thread.
 */
export function consumeCreateChatShownAtMs(): number {
  const at = createChatShownAtMs;
  createChatShownAtMs = 0;
  return at;
}

export function subscribeCreateMainChatVisible(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

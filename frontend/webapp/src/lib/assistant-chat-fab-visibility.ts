/**
 * When Create Meditation’s main pane is the chat UI, the floating FAB hides
 * so we don’t stack two chats. Other Create steps (chooser / audio) keep the FAB.
 */

let createMainChatVisible = false;
const listeners = new Set<() => void>();

export function setCreateMainChatVisible(visible: boolean): void {
  if (createMainChatVisible === visible) return;
  createMainChatVisible = visible;
  listeners.forEach((l) => l());
}

export function isCreateMainChatVisible(): boolean {
  return createMainChatVisible;
}

export function subscribeCreateMainChatVisible(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

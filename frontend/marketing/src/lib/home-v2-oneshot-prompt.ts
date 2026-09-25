/** Survives sign-in (unscoped sessionStorage) → create from-prompt. */
export const HOME_V2_PENDING_ONESHOT_KEY = "mm_home_v2_oneshot_prompt";

export function stashHomeV2OneShotPrompt(prompt: string): void {
  if (typeof window === "undefined") return;
  const trimmed = prompt.trim();
  if (!trimmed) return;
  try {
    window.sessionStorage.setItem(HOME_V2_PENDING_ONESHOT_KEY, trimmed);
  } catch {
    /* private mode */
  }
}

export function takeHomeV2OneShotPrompt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(HOME_V2_PENDING_ONESHOT_KEY);
    if (raw == null) return null;
    window.sessionStorage.removeItem(HOME_V2_PENDING_ONESHOT_KEY);
    const trimmed = raw.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

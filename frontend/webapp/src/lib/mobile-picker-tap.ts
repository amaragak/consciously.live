import type { MutableRefObject } from "react";

const TAP_CONFIRM_MS = 250;

/**
 * Mobile single-choice picker: show selected state briefly, then confirm.
 * Desktop: only applies the draft (footer still confirms).
 * Already-selected on mobile: confirm immediately (closes the sheet).
 */
export function applyMobilePickerTap(opts: {
  mdUp: boolean;
  alreadySelected: boolean;
  applyDraft: () => void;
  confirm: () => void;
  timerRef: MutableRefObject<number | null>;
}): void {
  const { mdUp, alreadySelected, applyDraft, confirm, timerRef } = opts;
  if (mdUp) {
    applyDraft();
    return;
  }
  if (alreadySelected) {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    confirm();
    return;
  }
  applyDraft();
  if (timerRef.current != null) window.clearTimeout(timerRef.current);
  timerRef.current = window.setTimeout(() => {
    timerRef.current = null;
    confirm();
  }, TAP_CONFIRM_MS);
}

/** Magic-link table row holding the 6-digit code for an email's latest link. */
export function magicCodeKey(email: string): string {
  return `code:${email.trim().toLowerCase()}`;
}

/** Wrong guesses before the code is retired (the link still works). */
export const MAGIC_CODE_MAX_ATTEMPTS = 5;
